import { describe, expect, test } from 'vitest'
import type { LedgerRecord, LoopEntry } from '@tenon/kernel'
import { selectTargetedRunCandidates } from './loop-run-selection.js'

function loop(id: string, changePrefix: string | null): LoopEntry {
  return {
    id,
    name: id,
    kind: 'executor',
    goal: 'targeted real-run selection',
    cadence: 'manual',
    risk: 'low',
    runner: 'codex',
    change_prefix: changePrefix,
    phases: ['implement'],
    human_gates: [],
    state: `.pipeline/loops/${id}.md`,
    design_doc: 'GOAL.md',
    status: 'active',
    budget: { max_runs_per_day: 10, max_in_flight: 1, on_exceed: 'skip-run' },
    kill_criteria: [],
    autonomy_level: 'L1',
    allowlist: [],
    denylist: [],
  }
}

function binding(change: string, loopId: string, recordId = `${change}:${loopId}`): LedgerRecord {
  return {
    schema_version: 1,
    record_id: recordId,
    recorded_at: '2026-07-19T00:00:00.000Z',
    kind: 'change-loop-binding',
    change,
    loop_id: loopId,
    source: 'explicit',
  }
}

const LOOPS = [
  loop('loop-api', 'api-'),
  loop('loop-api-v2', 'api-v2-'),
  loop('loop-web', 'web-'),
]

describe('selectTargetedRunCandidates', () => {
  test('按 ready FIFO 输出；只纳入自然归属位于 selectedLoopIds 的 change', () => {
    const result = selectTargetedRunCandidates({
      selectedLoopIds: ['loop-web', 'loop-api-v2'],
      readyChanges: ['api-v2-first', 'api-ignored', 'web-second'],
      loops: LOOPS,
      ledgerRecords: [],
    })

    expect(result).toEqual({
      ok: true,
      targets: [
        { change: 'api-v2-first', expectedLoopId: 'loop-api-v2', expectedAutonomyLevel: 'L1' },
        { change: 'web-second', expectedLoopId: 'loop-web', expectedAutonomyLevel: 'L1' },
      ],
    })
  })

  test('ledger 最新绑定优先于前缀；按文件序最后一条决定归属', () => {
    const result = selectTargetedRunCandidates({
      selectedLoopIds: ['loop-web'],
      readyChanges: ['api-change'],
      loops: LOOPS,
      ledgerRecords: [
        binding('api-change', 'loop-api', 'old'),
        binding('api-change', 'loop-web', 'latest'),
      ],
    })

    expect(result).toEqual({
      ok: true,
      targets: [{ change: 'api-change', expectedLoopId: 'loop-web', expectedAutonomyLevel: 'L1' }],
    })
  })

  test('selector 不能把 change 强塞给被选 loop：自然归属未选中时只过滤', () => {
    const result = selectTargetedRunCandidates({
      selectedLoopIds: ['loop-web'],
      readyChanges: ['api-natural-owner'],
      loops: LOOPS,
      ledgerRecords: [],
    })

    expect(result).toEqual({ ok: true, targets: [] })
  })

  test.each([
    {
      name: 'bound-loop-missing',
      readyChanges: ['api-bound-gone'],
      loops: LOOPS,
      records: [binding('api-bound-gone', 'loop-deleted')],
      reason: 'bound-loop-missing',
    },
    {
      name: 'ambiguous-prefix',
      readyChanges: ['same-change'],
      loops: [loop('loop-a', 'same-'), loop('loop-b', 'same-')],
      records: [],
      reason: 'ambiguous-prefix',
    },
    {
      name: 'no-match',
      readyChanges: ['orphan-change'],
      loops: LOOPS,
      records: [],
      reason: 'no-match',
    },
  ] as const)('$name 对任意 ready 都结构化 fail-closed（即使它不会入选）', ({ readyChanges, loops, records, reason }) => {
    const result = selectTargetedRunCandidates({
      selectedLoopIds: [],
      readyChanges,
      loops,
      ledgerRecords: records,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.reason).toBe(reason)
      expect(result.error.change).toBe(readyChanges[0])
      expect(result.error.detail).not.toBe('')
    }
  })

  test('重复 ready change fail-loud，避免同一 change 被重复 reserve/claim', () => {
    const result = selectTargetedRunCandidates({
      selectedLoopIds: ['loop-api'],
      readyChanges: ['api-dup', 'api-dup'],
      loops: LOOPS,
      ledgerRecords: [],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        reason: 'duplicate-ready-change',
        change: 'api-dup',
        detail: 'readyChanges 中出现重复 change「api-dup」；拒绝重复 reserve/claim',
      },
    })
  })
})
