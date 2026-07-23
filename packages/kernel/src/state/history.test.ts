import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createHistoryWriter, HISTORY_FILE, transitionRecordToHistoryEntry } from './history.js'
import type { TransitionRecord } from '../workflow/run-types.js'

describe('createHistoryWriter —— .pipeline-history.jsonl 侧文件（CONTRACT §1）', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lite-history-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('append 创建文件并逐行追加，一行一个合法 JSON、保持顺序', async () => {
    const w = createHistoryWriter()
    await w.append(dir, { ts: '2026-07-06T00:00:00Z', kind: 'init', by: 'jeff' })
    await w.append(dir, { ts: '2026-07-06T00:00:01Z', kind: 'set', field: 'plan', to: 'docs/p.md' })
    await w.append(dir, { ts: '2026-07-06T00:00:02Z', kind: 'transition', from: 'open', to: 'explore' })

    const raw = await readFile(join(dir, HISTORY_FILE), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    const lines = raw.trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, string>)
    expect(parsed[0]).toEqual({ ts: '2026-07-06T00:00:00Z', kind: 'init', by: 'jeff' })
    expect(parsed[1]).toEqual({ ts: '2026-07-06T00:00:01Z', kind: 'set', field: 'plan', to: 'docs/p.md' })
    expect(parsed[2]).toEqual({ ts: '2026-07-06T00:00:02Z', kind: 'transition', from: 'open', to: 'explore' })
  })

  test('目录不存在 → 抛错（best-effort 语义由调用方兜，writer 本身 fail-loud）', async () => {
    const w = createHistoryWriter()
    await expect(
      w.append(join(dir, 'no-such-subdir'), { ts: 't', kind: 'set' }),
    ).rejects.toThrow()
  })
})

describe('transitionRecordToHistoryEntry —— canonical TransitionRecord → JSONL 兼容投影行的' +
  '唯一构造点（W1 第二增量：history 合并边界从时间戳比较改成逐条来源标记）', () => {
  const record: TransitionRecord = {
    schemaVersion: 1,
    id: 'rec-abc123',
    runId: 'run-1',
    sequence: 3,
    previousRecordId: 'rec-prev',
    workflowId: 'default',
    event: 'build-complete',
    from: 'build',
    to: 'verify',
    effects: [],
    observedAt: '2026-07-16T00:00:03Z',
  }

  test('五个投影字段逐一对位 record 的对应字段，且带上 transitionRecordId=record.id', () => {
    expect(transitionRecordToHistoryEntry(record)).toEqual({
      ts: '2026-07-16T00:00:03Z',
      kind: 'transition',
      from: 'build',
      to: 'verify',
      raw: 'build-complete',
      transitionRecordId: 'rec-abc123',
    })
  })

  test('kind 恒为 transition（TransitionRecord 本身就只承载 transition，不需要从别处推断）', () => {
    expect(transitionRecordToHistoryEntry(record).kind).toBe('transition')
  })
})
