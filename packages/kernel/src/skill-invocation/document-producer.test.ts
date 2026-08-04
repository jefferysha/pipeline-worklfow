import { createHash } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureDocumentLedger, recordDocument } from '../state/document-ledger.js'
import { emptyFields } from '../state/parse.js'
import { publishInitialRunRevision } from '../state/run-revision-store.js'
import { readSkillInvocationEvidence } from './repository.js'
import { recordCanonicalDocumentSkillInvocation } from './document-producer.js'

const roots: string[] = []
const producer = 'openspec-propose'

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(sequence = 1) {
  const root = await mkdtemp(join(tmpdir(), 'tenon-document-invocation-'))
  roots.push(root)
  const changeDir = join(root, 'openspec', 'changes', 'demo')
  await mkdir(changeDir, { recursive: true })
  const fields = emptyFields()
  fields.phase = 'spec'
  fields.workflow = 'default'
  await publishInitialRunRevision(changeDir, {
    fields,
    runMetadata: { runId: 'run-1', transitionSequence: sequence, transitionHead: undefined },
    opaqueTail: '',
  }, '2026-08-04T00:00:00.000Z')
  await ensureDocumentLedger(changeDir, '2026-08-04T00:00:00.000Z')
  await appendFile(join(changeDir, '.pipeline-history.jsonl'), `${JSON.stringify({
    ts: '2026-08-04T00:00:00.000Z', kind: 'init', to: 'spec',
  })}\n`)
  return { root, changeDir, fields }
}

async function confirm(changeDir: string, recordedAt: string, sequence: number) {
  const receiptDigest = createHash('sha256')
    .update('demo').update('\0').update(producer).update('\0').update(recordedAt)
    .update('\0').update('run-1').update('\0').update(String(sequence)).digest('hex')
  await appendFile(join(changeDir, '.pipeline-codex-skill-confirmations.jsonl'), `${JSON.stringify({
    schema_version: 'codex-skill-confirmation/v2', producer, recorded_at: recordedAt,
    evidence_scope: 'spec', step_visit: { run_id: 'run-1', transition_sequence: sequence },
    receipt_digest: `sha256:${receiptDigest}`,
  })}\n`)
  await appendFile(join(changeDir, '.pipeline-history.jsonl'), [
    { ts: recordedAt, kind: 'tool', raw: `CodexSkillRead: ${producer}` },
    { ts: recordedAt, kind: 'tool', raw: `CodexSkillReadBinding: ${producer} run-1 ${sequence}` },
  ].map((row) => JSON.stringify(row)).join('\n') + '\n')
}

describe('canonical document SkillInvocation producer', () => {
  it('rejects a confirmation replayed across a later visit to the same phase', async () => {
    const { root, changeDir } = await fixture(3)
    const path = 'openspec/changes/demo/specs/cap-a/spec.md'
    await mkdir(join(root, 'openspec/changes/demo/specs/cap-a'), { recursive: true })
    await writeFile(join(root, path), '# cap-a\n')
    const recordedAt = '2026-08-04T00:01:00.000Z'
    await confirm(changeDir, recordedAt, 1)
    await recordDocument({ repoRoot: root, changeDir, phase: 'spec', kind: 'delta-spec', path, producer, recordedAt })
    await expect(recordCanonicalDocumentSkillInvocation(changeDir, 'delta-spec', recordedAt))
      .resolves.toBeUndefined()
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toMatchObject({ state: 'empty' })
  })

  it('records each canonical delta-spec by its exact record time without kind ambiguity', async () => {
    const { root, changeDir } = await fixture()
    for (const [capability, recordedAt] of [
      ['cap-a', '2026-08-04T00:01:00.000Z'],
      ['cap-b', '2026-08-04T00:02:00.000Z'],
    ] as const) {
      const path = `openspec/changes/demo/specs/${capability}/spec.md`
      await mkdir(join(root, `openspec/changes/demo/specs/${capability}`), { recursive: true })
      await writeFile(join(root, path), `# ${capability}\n`)
      await confirm(changeDir, recordedAt, 1)
      await recordDocument({ repoRoot: root, changeDir, phase: 'spec', kind: 'delta-spec', path, producer, recordedAt })
      await expect(recordCanonicalDocumentSkillInvocation(changeDir, 'delta-spec', recordedAt)).resolves.toBeDefined()
    }
    const evidence = await readSkillInvocationEvidence(changeDir)
    expect(evidence.items).toHaveLength(2)
    expect(evidence.items.map((item) => item.artifacts[0]?.ref).sort()).toEqual([
      'openspec/changes/demo/specs/cap-a/spec.md',
      'openspec/changes/demo/specs/cap-b/spec.md',
    ])
  })
})
