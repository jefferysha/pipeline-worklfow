import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createStateStore } from './store.js'
import { createTransitionRecordStore } from './transition-record-store.js'
import { createWorkflowRunRepository } from './workflow-run-repository.js'
import { stateStorageSourcePathSync } from './run-revision-store.js'
import { REVIEW_GATE_FIELDS } from '../types.js'

const roots: string[] = []
const clock = () => '2026-07-19T00:00:00Z'

async function fresh(): Promise<{ root: string; dir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'pl-run-revision-'))
  roots.push(root)
  const dir = await createStateStore().init({
    repoRoot: root, name: 'demo', track: 'backend', reviewSeed: 'pending', preset: 'full', clock,
    runId: 'run-1',
  })
  return { root, dir }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function rehash(record: Record<string, unknown>): void {
  const { stateDigest: _old, ...body } = record
  record.stateDigest = createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

describe('G1 canonical revision 对抗校验', () => {
  test('状态来源选择以 canonical current 为先；只有 current 不存在才兼容 legacy YAML', async () => {
    const { dir } = await fresh()
    const current = join(dir, '.pipeline-run', 'current.json')
    const yaml = join(dir, '.pipeline.yaml')

    expect(stateStorageSourcePathSync(dir)).toBe(current)
    await writeFile(current, '{ malformed current still owns precedence', 'utf8')
    expect(stateStorageSourcePathSync(dir)).toBe(current)
    await unlink(current)
    expect(stateStorageSourcePathSync(dir)).toBe(yaml)
    await unlink(yaml)
    expect(stateStorageSourcePathSync(dir)).toBeUndefined()
  })

  test('dangling current symlink 仍算 canonical 已出现并 fail-loud，不得按 ENOENT 回退 YAML', async () => {
    const { dir } = await fresh()
    const current = join(dir, '.pipeline-run', 'current.json')
    await unlink(current)
    await symlink('missing-target.json', current)

    expect(stateStorageSourcePathSync(dir)).toBe(current)
    await expect(createStateStore().read(dir)).rejects.toThrow(/canonical|current|symlink|符号链接/i)
  })

  test('自动更新兼容：仅缺 review-gate v2 尾字段的旧 canonical/projection 可读，并在下一次写入时升级', async () => {
    const { dir } = await fresh()
    const store = createStateStore()
    const currentPath = join(dir, '.pipeline-run', 'current.json')
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>
    const fields = (current.state as { fields: Record<string, unknown> }).fields
    for (const field of REVIEW_GATE_FIELDS) delete fields[field]
    rehash(current)
    const legacyRaw = JSON.stringify(current)
    await writeFile(currentPath, legacyRaw, 'utf8')
    await writeFile(join(
      dir, '.pipeline-run', 'revisions', `000000-${String(current.revisionId)}.json`,
    ), legacyRaw, 'utf8')

    const yamlPath = join(dir, '.pipeline.yaml')
    const yaml = await readFile(yamlPath, 'utf8')
    const legacyYaml = REVIEW_GATE_FIELDS.reduce(
      (next, field) => next.replace(new RegExp(`^${field}:.*\\n`, 'm'), ''),
      yaml,
    ).replace(/pipeline_state_digest: [0-9a-f]{64}/, `pipeline_state_digest: ${String(current.stateDigest)}`)
    await writeFile(yamlPath, legacyYaml, 'utf8')

    const recovered = await store.read(dir)
    for (const field of REVIEW_GATE_FIELDS) expect(recovered.fields[field]).toBe('')
    expect(await store.inspectProjection(dir)).toMatchObject({ status: 'current', revision: 0 })

    await store.set(dir, 'phase', 'explore')
    const upgraded = JSON.parse(await readFile(currentPath, 'utf8')) as {
      revision: number
      state: { fields: Record<string, unknown> }
    }
    expect(upgraded.revision).toBe(1)
    for (const field of REVIEW_GATE_FIELDS) expect(upgraded.state.fields).toHaveProperty(field, '')
    // 空 receipt 保留在 canonical schema，但不扰动兼容 YAML projection；真正 request 时会整组出现。
    const upgradedYaml = await readFile(yamlPath, 'utf8')
    for (const field of REVIEW_GATE_FIELDS) expect(upgradedYaml).not.toContain(`${field}:`)
  })

  test('自动更新兼容：早期四字段 receipt 缺 exact event 且 receipt 为空时可读并在下一次写入升级', async () => {
    const { dir } = await fresh()
    const store = createStateStore()
    const currentPath = join(dir, '.pipeline-run', 'current.json')
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>
    const fields = (current.state as { fields: Record<string, unknown> }).fields
    delete fields.review_gate_event
    rehash(current)
    const legacyRaw = JSON.stringify(current)
    await writeFile(currentPath, legacyRaw, 'utf8')
    await writeFile(join(
      dir, '.pipeline-run', 'revisions', `000000-${String(current.revisionId)}.json`,
    ), legacyRaw, 'utf8')

    const yamlPath = join(dir, '.pipeline.yaml')
    const yaml = await readFile(yamlPath, 'utf8')
    await writeFile(
      yamlPath,
      yaml.replace(/pipeline_state_digest: [0-9a-f]{64}/, `pipeline_state_digest: ${String(current.stateDigest)}`),
      'utf8',
    )

    const recovered = await store.read(dir)
    expect(recovered.fields.review_gate_event).toBe('')
    await store.set(dir, 'phase', 'explore')
    const upgraded = JSON.parse(await readFile(currentPath, 'utf8')) as {
      state: { fields: Record<string, unknown> }
    }
    expect(upgraded.state.fields).toHaveProperty('review_gate_event', '')
  })

  test('缺 exact event 的旧非空 receipt 必须拒绝，不能把未知批准绑定到任意 transition', async () => {
    const { dir } = await fresh()
    const currentPath = join(dir, '.pipeline-run', 'current.json')
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>
    const fields = (current.state as { fields: Record<string, unknown> }).fields
    fields.review_gate_phase = 'spec'
    fields.review_gate_status = 'approved'
    fields.review_requested_at = '2026-07-24T00:00:00Z'
    fields.review_acknowledged_at = '2026-07-24T00:01:00Z'
    delete fields.review_gate_event
    rehash(current)
    const legacyRaw = JSON.stringify(current)
    await writeFile(currentPath, legacyRaw, 'utf8')
    await writeFile(join(
      dir, '.pipeline-run', 'revisions', `000000-${String(current.revisionId)}.json`,
    ), legacyRaw, 'utf8')

    await expect(createStateStore().read(dir)).rejects.toThrow(/FIELD_ORDER 闭集|review.*event|canonical/i)
  })

  test('effects 即便攻击者同步重算 digest 并改写 current+twin，未知 shape 仍 fail-loud', async () => {
    const { dir } = await fresh()
    const currentPath = join(dir, '.pipeline-run', 'current.json')
    const record = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>
    const mutation = record.mutation as Record<string, unknown>
    mutation.effects = [{ kind: 'evil', field: 'phase', from: 'open', to: 'ship' }]
    rehash(record)
    const raw = JSON.stringify(record)
    await writeFile(currentPath, raw, 'utf8')
    await writeFile(join(
      dir, '.pipeline-run', 'revisions',
      `000000-${String(record.revisionId)}.json`,
    ), raw, 'utf8')

    await expect(createStateStore().read(dir)).rejects.toThrow(/effect|canonical revision|字段非法/i)
  })

  test('effects 即便 shape 合法且攻击者同步重算 current+twin digest，也必须等于 previous→current 的真实 diff', async () => {
    const { dir } = await fresh()
    const store = createStateStore()
    await store.set(dir, 'phase', 'explore')
    const currentPath = join(dir, '.pipeline-run', 'current.json')
    const record = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>
    const mutation = record.mutation as Record<string, unknown>
    mutation.effects = []
    rehash(record)
    const raw = JSON.stringify(record)
    await writeFile(currentPath, raw, 'utf8')
    await writeFile(join(
      dir, '.pipeline-run', 'revisions',
      `000001-${String(record.revisionId)}.json`,
    ), raw, 'utf8')

    await expect(store.read(dir)).rejects.toThrow(/effects.*diff|effect.*previous|真实.*diff/i)
  })

  test('current 引用的直接 previous revision 缺失 → fail-loud，不采信仍完整的 YAML', async () => {
    const { dir } = await fresh()
    const store = createStateStore()
    await store.set(dir, 'phase', 'explore')
    const current = JSON.parse(await readFile(join(dir, '.pipeline-run', 'current.json'), 'utf8')) as {
      previousRevisionId: string
    }
    await unlink(join(
      dir, '.pipeline-run', 'revisions', `000000-${current.previousRevisionId}.json`,
    ))

    await expect(store.read(dir)).rejects.toThrow(/previous|revision.*缺失/i)
  })

  test('transition revision 引用的 immutable TransitionRecord 缺失 → fail-loud，不采信 YAML head', async () => {
    const { dir } = await fresh()
    const store = createStateStore()
    const records = createTransitionRecordStore()
    const repo = createWorkflowRunRepository({ store, recordStore: records, clock, newId: () => 'record-1' })
    await repo.transact(dir, async (tx) => {
      await tx.commit({ ...tx.state.fields, phase: 'explore' }, {
        event: 'open-complete', from: 'open', to: 'explore',
      })
    })
    await unlink(join(dir, '.pipeline-transitions', '000001-record-1.json'))

    await expect(store.read(dir)).rejects.toThrow(/TransitionRecord|record.*缺失/i)
  })

  test('transition revision 必须绑定 TransitionRecord 精确字节；只篡改 event 也 fail-loud', async () => {
    const { dir } = await fresh()
    const store = createStateStore()
    const records = createTransitionRecordStore()
    const repo = createWorkflowRunRepository({ store, recordStore: records, clock, newId: () => 'record-digest' })
    await repo.transact(dir, async (tx) => {
      await tx.commit({ ...tx.state.fields, phase: 'explore' }, {
        event: 'open-complete', from: 'open', to: 'explore',
      })
    })
    const transitionPath = join(dir, '.pipeline-transitions', '000001-record-digest.json')
    const transition = JSON.parse(await readFile(transitionPath, 'utf8')) as Record<string, unknown>
    transition.event = 'tampered-but-shape-valid'
    await writeFile(transitionPath, JSON.stringify(transition), 'utf8')

    await expect(store.read(dir)).rejects.toThrow(/TransitionRecord.*digest|record.*摘要|审计.*绑定/i)
  })
})
