import { describe, expect, it } from 'vitest'
import {
  admissionDecision, indexMergeFactsByAttempt, indexReservationTerminals, indexSkillBundleSnapshots,
  projectLoopIterations, projectLoopLedger, remainingTokens,
} from './ledger-projection.js'
import type { AdmissionLimits } from './ledger-projection.js'
import type {
  BudgetReservationRecord, LedgerRecord, MergeIntentRecord, MergeLandedRecord, ReservationActivatedRecord,
  RunRecord, SkillBundleSnapshotRecord,
} from './ledger-types.js'

const DAY = '2026-07-17'

let seq = 0
const rid = (): string => `r${seq++}`

const reservation = (over: Partial<BudgetReservationRecord> & { reservation_id: string; loop_id: string }): BudgetReservationRecord => ({
  schema_version: 1, record_id: rid(), recorded_at: `${DAY}T00:00`, kind: 'budget-reservation',
  attempt_id: `a-${over.reservation_id}`, change: 'c', budget_day: DAY, reserved_runs: 1, reserved_tokens: 1000,
  token_basis: 'risk-default', limits_snapshot: { max_runs_per_day: 24, max_in_flight: 2, on_exceed: 'skip-run' },
  expires_at: `${DAY}T01:00`, ...over,
})

const activated = (
  reservation_id: string,
  over: Partial<ReservationActivatedRecord> & { loop_id?: string; change?: string } = {},
): ReservationActivatedRecord => ({
  schema_version: 1, record_id: rid(), recorded_at: `${DAY}T00:01`, kind: 'reservation-activated',
  reservation_id, attempt_id: `a-${reservation_id}`, loop_id: 'L', change: 'c',
  started_at: `${DAY}T00:01`, ...over,
} as ReservationActivatedRecord)

const run = (over: Partial<RunRecord> & { reservation_id?: string; loop_id: string }): RunRecord => ({
  schema_version: 1, record_id: rid(), recorded_at: `${DAY}T00:05`, kind: 'run', run_record_id: rid(),
  attempt_id: `a-${over.reservation_id ?? 'x'}`, change: 'c', level: 'L1', runner: 'claude-code',
  admitted_at: `${DAY}T00:00`, finished_at: `${DAY}T00:05`, result: 'paused', usage_record_ids: [],
  accounting: { reserved_tokens: 1000, charged_tokens: 1000, charge_source: 'reserved-estimate' }, ...over,
})

const skillBundleSnapshot = (over: Partial<SkillBundleSnapshotRecord> & { reservation_id: string }): SkillBundleSnapshotRecord => ({
  schema_version: 1, record_id: rid(), recorded_at: `${DAY}T00:00:30`, kind: 'skill-bundle-snapshot',
  attempt_id: `a-${over.reservation_id}`, loop_id: 'L', skill_bundle_id: 'pm', policy_epoch: 'epoch-a1',
  resolution_source: 'default', workflow_run_id: 'wfr-1', workflow: 'default', step: 'verify', track: 'pm',
  coordinate_digest: '1'.repeat(64),
  snapshot_sha256: 'e'.repeat(64), cas_relative_path: `.pipeline/loops/skill-snapshots/sha256/${'e'.repeat(64)}`,
  slots: [{ token: 'pm-writing', alternatives: ['pm-writing'], concrete_skill_id: 'pm-writing', tree_sha256: 'c'.repeat(64) }], ...over,
})

const mergeIntent = (over: Partial<MergeIntentRecord> & { attempt_id: string; reservation_id: string }): MergeIntentRecord => ({
  schema_version: 1, record_id: rid(), recorded_at: `${DAY}T00:03`, kind: 'merge-intent',
  loop_id: 'L', change: 'c', base_ref: 'refs/heads/main', expected_base_sha: 'base-before',
  branch_ref: 'refs/heads/sandcastle/c', expected_branch_sha: 'branch-before', merged_commit_sha: 'merged',
  level: 'L3', runner: 'codex', admitted_at: `${DAY}T00:00`, created_at: `${DAY}T00:03`,
  usage_record_ids: [], accounting: { reserved_tokens: 1000, charged_tokens: 1000, charge_source: 'reserved-estimate' },
  ...over,
})

const mergeLanded = (over: Partial<MergeLandedRecord> & { attempt_id: string; reservation_id: string }): MergeLandedRecord => ({
  schema_version: 1, record_id: rid(), recorded_at: `${DAY}T00:04`, kind: 'merge-landed',
  intent_record_id: 'intent-1', loop_id: 'L', change: 'c', base_ref: 'refs/heads/main',
  base_before_sha: 'base-before', branch_sha: 'branch-before', merged_commit_sha: 'merged',
  host_synced: true, landed_at: `${DAY}T00:04`, ...over,
})

const limits = (over: Partial<AdmissionLimits> = {}): AdmissionLimits => ({
  maxRunsPerDay: 24, maxInFlight: 2, onExceed: 'skip-run', ...over,
})

describe('projectLoopIterations · H9 event-sourced iteration state', () => {
  it('reservation → activation → terminal 由同一 audit 流投影 reserved/running/terminal', () => {
    const reserved = reservation({ reservation_id: 'ir1', loop_id: 'L', iteration_id: 'iteration-1' })
    expect(projectLoopIterations([reserved])).toMatchObject([{ id: 'iteration-1', state: 'reserved' }])
    const active = activated('ir1', { iteration_id: 'iteration-1' })
    expect(projectLoopIterations([reserved, active])).toMatchObject([{ id: 'iteration-1', state: 'running' }])
    const terminal = run({ reservation_id: 'ir1', loop_id: 'L', iteration_id: 'iteration-1', result: 'merged' })
    expect(projectLoopIterations([reserved, active, terminal])).toMatchObject([
      { id: 'iteration-1', state: 'terminal', result: 'merged', auditRecordIds: [reserved.record_id, active.record_id, terminal.record_id] },
    ])
  })

  it('activation/terminal iteration identity 与 reservation 不一致 → fail-closed', () => {
    const reserved = reservation({ reservation_id: 'ir2', loop_id: 'L', iteration_id: 'iteration-2' })
    expect(() => projectLoopIterations([
      reserved, activated('ir2', { iteration_id: 'forged' }),
    ])).toThrow(/identity mismatch/)
  })

  it('同一 iteration 出现重复 activation → fail-closed，不静默选第一条', () => {
    const reserved = reservation({ reservation_id: 'ir3', loop_id: 'L', iteration_id: 'iteration-3' })
    expect(() => projectLoopIterations([
      reserved,
      activated('ir3', { iteration_id: 'iteration-3' }),
      activated('ir3', { iteration_id: 'iteration-3' }),
    ])).toThrow(/corrupt|duplicate|invalid/i)
  })
})

describe('projectLoopLedger · 会计投影', () => {
  it('未关闭预占计 inFlight + runsToday + outstanding tokens；activated 计 activatedInFlight', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', reserved_tokens: 3000 }),
      activated('res1'),
      reservation({ reservation_id: 'res2', loop_id: 'L', reserved_tokens: 2000 }), // 未 activate
    ]
    const p = projectLoopLedger(recs, 0, 'L', DAY)
    expect(p.runsToday).toBe(2)
    expect(p.inFlight).toBe(2)
    expect(p.activatedInFlight).toBe(1)
    expect(p.reservedTokensOutstanding).toBe(5000)
    expect(p.openReservations.map((r) => r.reservation_id)).toEqual(['res1', 'res2'])
  })

  it('RunRecord 关闭 reservation → 不再计 inFlight/outstanding；charged 按 source 分实扣/估扣', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', reserved_tokens: 3000 }),
      run({ reservation_id: 'res1', loop_id: 'L', result: 'merged', accounting: { reserved_tokens: 3000, charged_tokens: 2500, charge_source: 'provider-structured' } }),
      reservation({ reservation_id: 'res2', loop_id: 'L', reserved_tokens: 1000 }),
      run({ reservation_id: 'res2', loop_id: 'L', result: 'paused', accounting: { reserved_tokens: 1000, charged_tokens: 1000, charge_source: 'reserved-estimate' } }),
    ]
    const p = projectLoopLedger(recs, 0, 'L', DAY)
    expect(p.runsToday).toBe(2) // 两条预占都计入当日 run 名额（已结算）
    expect(p.inFlight).toBe(0) // 都已关闭
    expect(p.reservedTokensOutstanding).toBe(0)
    expect(p.settledTokensActual).toBe(2500)
    expect(p.settledTokensEstimated).toBe(1000)
    expect(p.lastResult).toBe('paused') // 文件序末次
  })

  it('别的 loop / 别的日不串账', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'OTHER' }),
      reservation({ reservation_id: 'res2', loop_id: 'L', budget_day: '2026-07-16' }),
      reservation({ reservation_id: 'res3', loop_id: 'L', budget_day: DAY }),
    ]
    const p = projectLoopLedger(recs, 0, 'L', DAY)
    expect(p.runsToday).toBe(1) // 只 res3
    expect(p.inFlight).toBe(2) // res2 + res3 都未关闭（in-flight 不分日）
  })

  it('坏行 → health=degraded', () => {
    const p = projectLoopLedger([], 2, 'L', DAY)
    expect(p.health).toBe('degraded')
    expect(p.rejectedRecords).toBe(2)
  })

  it('activation 的 attempt_id 与 reservation 不一致 → 不算 activated，且账本 degraded', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', attempt_id: 'attempt-real' }),
      { ...activated('res1'), attempt_id: 'attempt-forged' },
    ]
    const p = projectLoopLedger(recs, 0, 'L', DAY)
    expect(p.activatedInFlight).toBe(0)
    expect(p.invalidActivations).toBe(1)
    expect(p.health).toBe('degraded')
  })

  it('孤儿或重复 activation → 只认首条合法关联，异常事实使账本 degraded', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L' }),
      activated('res1'),
      activated('res1'),
      activated('missing'),
    ]
    const p = projectLoopLedger(recs, 0, 'L', DAY)
    expect(p.activatedInFlight).toBe(1)
    expect(p.invalidActivations).toBe(2)
    expect(p.health).toBe('degraded')
  })

  it('codec-valid activation 伪造 loop/change → 不激活 owner reservation，结构化 invalid 且 degraded', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', change: 'owner-change' }),
      activated('res1', { loop_id: 'OTHER', change: 'forged-change' }),
    ]
    const index = indexReservationTerminals(recs)
    expect(index.activatedReservationIds.has('res1')).toBe(false)
    expect(index.invalidActivations.map((x) => x.reason)).toEqual(['loop-mismatch'])
    const p = projectLoopLedger(recs, 0, 'L', DAY)
    expect(p.activatedInFlight).toBe(0)
    expect(p.invalidActivations).toBe(1)
    expect(p.health).toBe('degraded')
  })

  it('terminal 伪造 attempt/loop/change → 不关闭 owner、不向伪 loop 计费，结构化 invalid 且全局 degraded', () => {
    const forged = run({
      reservation_id: 'res1', attempt_id: 'attempt-forged', loop_id: 'OTHER', change: 'forged-change',
      accounting: { reserved_tokens: 1000, charged_tokens: 777, charge_source: 'provider-structured' },
    })
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', attempt_id: 'attempt-real', change: 'owner-change' }),
      forged,
    ]
    const index = indexReservationTerminals(recs)
    expect(index.terminalByReservationId.has('res1')).toBe(false)
    expect(index.invalidTerminals.map((x) => x.reason)).toEqual(['attempt-mismatch'])

    const owner = projectLoopLedger(recs, 0, 'L', DAY)
    expect(owner.inFlight).toBe(1)
    expect(owner.reservedTokensOutstanding).toBe(1000)
    expect(owner.settledTokensActual).toBe(0)
    expect(owner.invalidTerminals).toBe(1)
    expect(owner.health).toBe('degraded')

    const forgedLoop = projectLoopLedger(recs, 0, 'OTHER', DAY)
    expect(forgedLoop.settledTokensActual).toBe(0)
    expect(forgedLoop.invalidTerminals).toBe(1)
    expect(forgedLoop.health).toBe('degraded')
  })

  it('孤儿 terminal 不结算；同 reservation_id 的重复 reservation 保留首条 owner 并 degraded', () => {
    const recs: LedgerRecord[] = [
      run({ reservation_id: 'missing', loop_id: 'OTHER' }),
      reservation({ reservation_id: 'dup', loop_id: 'L', attempt_id: 'a-first', change: 'first' }),
      reservation({ reservation_id: 'dup', loop_id: 'OTHER', attempt_id: 'a-second', change: 'second' }),
    ]
    const index = indexReservationTerminals(recs)
    expect(index.reservationById.get('dup')?.loop_id).toBe('L')
    expect(index.invalidTerminals.map((x) => x.reason)).toEqual(['orphan'])
    expect(index.duplicateReservations).toHaveLength(1)

    const owner = projectLoopLedger(recs, 0, 'L', DAY)
    expect(owner.inFlight).toBe(1)
    expect(owner.duplicateReservations).toBe(1)
    expect(owner.invalidTerminals).toBe(1)
    expect(owner.health).toBe('degraded')
    const forgedLoop = projectLoopLedger(recs, 0, 'OTHER', DAY)
    expect(forgedLoop.inFlight).toBe(0)
    expect(forgedLoop.settledTokensEstimated).toBe(0)
    expect(forgedLoop.health).toBe('degraded')
  })
})

describe('admissionDecision · 纯额度判定（顺序：坏行→重复→runs→inflight→tokens）', () => {
  const proj = (recs: LedgerRecord[], rejected = 0): ReturnType<typeof projectLoopLedger> => projectLoopLedger(recs, rejected, 'L', DAY)

  it('空账本 + 充裕额度 → allowed', () => {
    const d = admissionDecision(proj([]), limits(), { change: 'c1', reservedTokens: 1000 })
    expect(d.allowed).toBe(true)
  })

  it('坏行 fail-closed（先于一切额度）', () => {
    const d = admissionDecision(proj([], 1), limits(), { change: 'c1', reservedTokens: 1000 })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.block.limit).toBe('ledger-degraded')
  })

  it('同 change 已有活跃预占 → duplicate-change', () => {
    const recs = [reservation({ reservation_id: 'res1', loop_id: 'L', change: 'dup' })]
    const d = admissionDecision(proj(recs), limits(), { change: 'dup', reservedTokens: 1000 })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.block.limit).toBe('duplicate-change')
  })

  it('max_runs_per_day 超限 → block 带 on_exceed action', () => {
    const recs = [reservation({ reservation_id: 'res1', loop_id: 'L', change: 'a' })]
    const d = admissionDecision(proj(recs), limits({ maxRunsPerDay: 1, onExceed: 'halt-round' }), { change: 'b', reservedTokens: 1000 })
    expect(d.allowed).toBe(false)
    if (!d.allowed) {
      expect(d.block.limit).toBe('max-runs-per-day')
      expect(d.block.action).toBe('halt-round')
    }
  })

  it('max_in_flight 超限 → skip-run（并发不用 on_exceed）', () => {
    const recs = [reservation({ reservation_id: 'res1', loop_id: 'L', change: 'a' })]
    const d = admissionDecision(proj(recs), limits({ maxInFlight: 1, maxRunsPerDay: 99 }), { change: 'b', reservedTokens: 1000 })
    expect(d.allowed).toBe(false)
    if (!d.allowed) {
      expect(d.block.limit).toBe('max-in-flight')
      expect(d.block.action).toBe('skip-run')
    }
  })

  it('max_tokens_per_day：已结算 + 预占 + 本次 超限 → block 带 on_exceed', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', change: 'a', reserved_tokens: 4000 }), // 未关闭占位 4000
    ]
    const d = admissionDecision(proj(recs), limits({ maxTokensPerDay: 5000, maxInFlight: 9, maxRunsPerDay: 99, onExceed: 'pause-loop' }), { change: 'b', reservedTokens: 2000 })
    expect(d.allowed).toBe(false) // 4000 + 2000 > 5000
    if (!d.allowed) {
      expect(d.block.limit).toBe('max-tokens-per-day')
      expect(d.block.action).toBe('pause-loop')
    }
  })

  it('无 token 预算 → token 维度跳过', () => {
    const d = admissionDecision(proj([]), limits(), { change: 'c', reservedTokens: 9_999_999 })
    expect(d.allowed).toBe(true)
  })
})

describe('Stage B 返工 #8 · runsToday 口径（countsAsRun 排除纯竞争/过期）', () => {
  it('claim-lost / reservation-expired 关闭不计 runsToday（没真跑）', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'r1', loop_id: 'L', change: 'a' }),
      run({ reservation_id: 'r1', loop_id: 'L', change: 'a', result: 'skipped', reason: 'claim-lost', accounting: { reserved_tokens: 1000, charged_tokens: 0, charge_source: 'none' } }),
      reservation({ reservation_id: 'r2', loop_id: 'L', change: 'b' }),
      run({ reservation_id: 'r2', loop_id: 'L', change: 'b', result: 'skipped', reason: 'reservation-expired', accounting: { reserved_tokens: 1000, charged_tokens: 0, charge_source: 'none' } }),
    ]
    expect(projectLoopLedger(recs, 0, 'L', DAY).runsToday).toBe(0)
  })

  it('open reservation 计 runsToday（仍可能启动）', () => {
    expect(projectLoopLedger([reservation({ reservation_id: 'r1', loop_id: 'L' })], 0, 'L', DAY).runsToday).toBe(1)
  })

  it('activated 后即便 charge=none 也计 runsToday（真跑过——如 kill-switch 停用）', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'r1', loop_id: 'L' }),
      activated('r1'),
      run({ reservation_id: 'r1', loop_id: 'L', result: 'skipped', reason: 'kill-switch', accounting: { reserved_tokens: 1000, charged_tokens: 0, charge_source: 'none' } }),
    ]
    expect(projectLoopLedger(recs, 0, 'L', DAY).runsToday).toBe(1)
  })

  it('claim-lost 不计 → 让位可重试（对照：max_runs_per_day 不被竞争失败误占）', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'r1', loop_id: 'L', change: 'a' }),
      run({ reservation_id: 'r1', loop_id: 'L', change: 'a', result: 'skipped', reason: 'claim-lost', accounting: { reserved_tokens: 1000, charged_tokens: 0, charge_source: 'none' } }),
    ]
    const d = admissionDecision(projectLoopLedger(recs, 0, 'L', DAY), limits({ maxRunsPerDay: 1 }), { change: 'b', reservedTokens: 100 })
    expect(d.allowed).toBe(true) // claim-lost 未占名额，仍可 admit
  })
})

describe('Stage B 返工 #1 · 重复 terminal 去重（degraded，不双加 token）', () => {
  it('同 reservation 两条 terminal → health=degraded、duplicateTerminals=1、token 只计首条', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'r1', loop_id: 'L', reserved_tokens: 1000 }),
      run({ reservation_id: 'r1', loop_id: 'L', result: 'merged', accounting: { reserved_tokens: 1000, charged_tokens: 1000, charge_source: 'reserved-estimate' } }),
      run({ reservation_id: 'r1', loop_id: 'L', result: 'merged', accounting: { reserved_tokens: 1000, charged_tokens: 1000, charge_source: 'reserved-estimate' } }),
    ]
    const p = projectLoopLedger(recs, 0, 'L', DAY)
    expect(p.health).toBe('degraded')
    expect(p.duplicateTerminals).toBe(1)
    expect(p.settledTokensEstimated).toBe(1000) // 不双加
    expect(p.runsToday).toBe(1) // 只一条 reservation
    expect(p.inFlight).toBe(0)
  })

  it('degraded（重复 terminal）→ admission fail-closed', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'r1', loop_id: 'L' }),
      run({ reservation_id: 'r1', loop_id: 'L' }),
      run({ reservation_id: 'r1', loop_id: 'L' }),
    ]
    const d = admissionDecision(projectLoopLedger(recs, 0, 'L', DAY), limits(), { change: 'x', reservedTokens: 100 })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.block.limit).toBe('ledger-degraded')
  })
})

describe('remainingTokens', () => {
  it('max − 已结算 − 预占；无预算 → null', () => {
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', reserved_tokens: 1000 }),
      run({ reservation_id: 'res1', loop_id: 'L', accounting: { reserved_tokens: 1000, charged_tokens: 1000, charge_source: 'provider-structured' } }),
      reservation({ reservation_id: 'res2', loop_id: 'L', reserved_tokens: 500 }),
    ]
    const p = projectLoopLedger(recs, 0, 'L', DAY)
    expect(remainingTokens(p, 5000)).toBe(3500) // 5000 - 1000(actual) - 500(outstanding)
    expect(remainingTokens(p, undefined)).toBeNull()
  })
})

describe('indexSkillBundleSnapshots · H10 §3/§8任务3（reservation_id → 快照记录的纯投影，供 store 的「reservation 关联查询」复用）', () => {
  it('按 reservation_id 建立索引；非 skill-bundle-snapshot 记录不进索引', () => {
    const snap1 = skillBundleSnapshot({ reservation_id: 'res1' })
    const snap2 = skillBundleSnapshot({ reservation_id: 'res2' })
    const recs: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L' }),
      snap1,
      reservation({ reservation_id: 'res2', loop_id: 'L' }),
      snap2,
      activated('res1'),
    ]
    const idx = indexSkillBundleSnapshots(recs)
    expect(idx.size).toBe(2)
    expect(idx.get('res1')).toBe(snap1)
    expect(idx.get('res2')).toBe(snap2)
  })

  it('未出现的 reservation_id → undefined', () => {
    const idx = indexSkillBundleSnapshots([reservation({ reservation_id: 'res1', loop_id: 'L' })])
    expect(idx.get('res-ghost')).toBeUndefined()
  })

  it('同 reservation_id 出现多条（异常情形防御）→ 只认文件序首条，不覆盖', () => {
    const first = skillBundleSnapshot({ reservation_id: 'res1', record_id: 'snap-first' })
    const second = skillBundleSnapshot({ reservation_id: 'res1', record_id: 'snap-second' })
    const idx = indexSkillBundleSnapshots([first, second])
    expect(idx.size).toBe(1)
    expect(idx.get('res1')).toBe(first)
  })

  it('空记录集 → 空 Map', () => {
    expect(indexSkillBundleSnapshots([]).size).toBe(0)
  })
})

describe('projectLoopLedger 不受 skill-bundle-snapshot 记录影响（H10 §8任务3：新事件不改变 open-reservation/terminal 判定）', () => {
  it('混入 skill-bundle-snapshot 记录后，runsToday/inFlight/outstanding/openReservations 与不混入时完全相同', () => {
    const baseline: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', reserved_tokens: 3000 }),
      activated('res1'),
      reservation({ reservation_id: 'res2', loop_id: 'L', reserved_tokens: 2000 }),
    ]
    const withSnapshot: LedgerRecord[] = [...baseline, skillBundleSnapshot({ reservation_id: 'res1' })]

    const pBefore = projectLoopLedger(baseline, 0, 'L', DAY)
    const pAfter = projectLoopLedger(withSnapshot, 0, 'L', DAY)
    expect(pAfter).toEqual(pBefore)
  })

  it('混入 skill-bundle-snapshot 记录后，已结算 token 与 lastResult/health 仍与不混入时完全相同', () => {
    const baseline: LedgerRecord[] = [
      reservation({ reservation_id: 'res1', loop_id: 'L', reserved_tokens: 3000 }),
      run({ reservation_id: 'res1', loop_id: 'L', result: 'merged', accounting: { reserved_tokens: 3000, charged_tokens: 2500, charge_source: 'provider-structured' } }),
    ]
    const withSnapshot: LedgerRecord[] = [
      baseline[0]!,
      skillBundleSnapshot({ reservation_id: 'res1' }),
      baseline[1]!,
    ]

    const pBefore = projectLoopLedger(baseline, 0, 'L', DAY)
    const pAfter = projectLoopLedger(withSnapshot, 0, 'L', DAY)
    expect(pAfter).toEqual(pBefore)
  })
})

describe('indexMergeFactsByAttempt · durable merge intent/landed 恢复索引', () => {
  it('按 attempt 建索引，并分别保留文件序最新 intent / landed', () => {
    const firstIntent = mergeIntent({ attempt_id: 'a-res1', reservation_id: 'res1', record_id: 'intent-first' })
    const firstLanded = mergeLanded({
      attempt_id: 'a-res1', reservation_id: 'res1', record_id: 'landed-first', intent_record_id: 'intent-first',
    })
    const latestIntent = mergeIntent({ attempt_id: 'a-res1', reservation_id: 'res1', record_id: 'intent-latest' })
    const latestLanded = mergeLanded({
      attempt_id: 'a-res1', reservation_id: 'res1', record_id: 'landed-latest', intent_record_id: 'intent-latest',
    })
    const otherIntent = mergeIntent({ attempt_id: 'a-res2', reservation_id: 'res2', record_id: 'intent-other' })

    const index = indexMergeFactsByAttempt([
      firstIntent, reservation({ reservation_id: 'res1', loop_id: 'L' }), firstLanded,
      latestIntent, otherIntent, latestLanded,
    ])

    expect(index.size).toBe(2)
    expect(index.get('a-res1')).toEqual({ latestIntent, latestLanded })
    expect(index.get('a-res2')).toEqual({ latestIntent: otherIntent, latestLanded: undefined })
  })

  it('只有 landed 的异常残片仍可查询，供 recovery fail-closed 诊断', () => {
    const landed = mergeLanded({ attempt_id: 'a-orphan', reservation_id: 'res-orphan' })
    expect(indexMergeFactsByAttempt([landed]).get('a-orphan')).toEqual({
      latestIntent: undefined,
      latestLanded: landed,
    })
  })

  it('merge facts 不是 terminal：不关闭 reservation，也不改变会计/health/lastResult', () => {
    const open = reservation({ reservation_id: 'res1', loop_id: 'L' })
    const baseline = projectLoopLedger([open], 0, 'L', DAY)
    const withMergeFacts = projectLoopLedger([
      open,
      mergeIntent({ attempt_id: open.attempt_id, reservation_id: open.reservation_id }),
      mergeLanded({ attempt_id: open.attempt_id, reservation_id: open.reservation_id }),
    ], 0, 'L', DAY)

    expect(withMergeFacts).toEqual(baseline)
    expect(withMergeFacts.openReservations).toEqual([open])
    expect(withMergeFacts.lastResult).toBeUndefined()
  })
})
