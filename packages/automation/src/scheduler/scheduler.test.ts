import { describe, expect, it } from 'vitest'
import { validateVerificationResult, type VerificationIssuer, type VerificationResult } from '@tenon/kernel'
import type { RunOutcome } from '../types.js'
import {
  markLoopPrepared, markNonLoopPrepared,
  type ExecutionContext, type ExecutionPreparationPort, type LoopPreparedExecutionContext,
  type PrepareOutcome, type PreparedExecutionContext,
} from '../admission/execution-context.js'
import type { ActivateResult, ReserveResult, RunSettlement } from '../admission/loop-admission.js'
import { createScheduler, sanitize, sanitizePath } from './scheduler.js'
import type { AdmissionPort, SchedulerDeps, StateWriter } from './scheduler.js'
import { enforceVerificationBoundary } from '../verifier/verifier.js'
import { certifyLifecycleOutcome } from '../lifecycle/outcome.js'
import { AbortedRunError, runChangeInSandbox, type LifecyclePorts } from '../lifecycle/lifecycle.js'

const BUILD_SHA = 'a'.repeat(40)

/** H7 verifier Phase 2：合法 VerificationResult 工厂——默认 trusted passed，SHA 对齐 outcome() 的
 *  默认 buildSha（下方），使既有「L3 成功 → merged」一类测试无需逐个改造即可继续通过（新增的
 *  gate 判定默认授权）；专测 gate 阻断路径的用例通过 issuer/verdict/subject.revision.sha 覆盖变体。
 *  H7-S2：subject.workflow_run_id/attempt_id 与 ctxFor('c') 派生值对齐（attempt_id='att-c'；
 *  workflow_run_id 缺省沿用 lifecycle.ts 同款 `?? attempt_id` 兜底，ctxFor 从不设置 workflow_run_id）
 *  ——scheduler 新增的 expectedSubject 比对现在真会校验这三个字段，默认工厂必须与默认 admission fake
 *  产出的 ExecutionContext 一致，否则「L3 成功 → merged」类既有用例会被误判 subject-mismatch。 */
const verification = (over: Partial<VerificationResult> = {}): VerificationResult => ({
  schema_version: 1,
  verification_id: 'ver-test',
  subject: {
    workflow_run_id: 'att-c', attempt_id: 'att-c', change: 'c',
    revision: { kind: 'named-branch-head', sha: BUILD_SHA },
  },
  binding: { kind: 'default-transition', event: 'verify-pass' },
  verdict: 'passed',
  evidence: [{ kind: 'command-result', command_id: 'test', exit_code: 0 }],
  issuer: { kind: 'host-verifier', verifier: 'test-verifier', version: '1', trusted: true },
  evaluated_at: '2026-07-18T00:00:00.000Z',
  ...over,
})

const untrustedIssuer: VerificationIssuer = { kind: 'sandbox-report', runner: 'claude-code', trusted: false }

/** 内存 StateWriter fake：真状态机语义（claim/CAS/attempts），无 fs。 */
const makeState = (init: Record<string, string> = {}) => {
  const auto = new Map<string, string>(Object.entries(init))
  const fields = new Map<string, Record<string, string>>()
  const failedSync: string[] = []
  const daemonOwned = new Set(['running', 'scheduled'])
  const state: StateWriter = {
    async claim(name) {
      if (auto.get(name) !== 'queued') return false
      auto.set(name, 'scheduled')
      return true
    },
    async setAutomation(name, s) {
      auto.set(name, s)
    },
    async setField(name, field, value) {
      fields.set(name, { ...(fields.get(name) ?? {}), [field]: value })
    },
    async getAutomation(name) {
      return auto.get(name) ?? ''
    },
    async setAutomationOwned(name, next) {
      const cur = auto.get(name)
      if (cur && daemonOwned.has(cur)) {
        auto.set(name, next)
        return true
      }
      return false
    },
    async setAutomationOwnedWithFields(name, next, nextFields) {
      const cur = auto.get(name)
      if (cur && daemonOwned.has(cur)) {
        auto.set(name, next)
        fields.set(name, { ...(fields.get(name) ?? {}), ...nextFields })
        return true
      }
      return false
    },
    async commitFailureOwned(name, input) {
      const cur = auto.get(name) ?? ''
      if (!daemonOwned.has(cur)) return { status: 'ownership-lost', observed: cur }
      const nextFields = { ...(fields.get(name) ?? {}), ...input.fields }
      if (input.classification === 'conflict') {
        fields.set(name, nextFields)
        auto.set(name, 'conflict')
        return { status: 'committed', automation: 'conflict' }
      }
      const prev = Number(nextFields.automation_attempts ?? '0')
      const attempts = (Number.isFinite(prev) ? prev : 0) + 1
      const automation = attempts > input.maxRetries ? 'failed' as const : 'queued' as const
      fields.set(name, { ...nextFields, automation_attempts: String(attempts) })
      auto.set(name, automation)
      return { status: 'committed', automation, attempts }
    },
    markFailedSync(name) {
      failedSync.push(name)
      auto.set(name, 'failed')
    },
  }
  return { state, auto, fields, failedSync }
}

const ctxFor = (change: string, loopId = 'lp'): ExecutionContext => ({
  attempt_id: `att-${change}`, reservation_id: `res-${change}`, loop_id: loopId, change,
  level: 'L1', runner: 'claude-code', admitted_at: 't', reservation: { runs: 1, tokens: 2000, token_basis: 'risk-default' },
  // H10 §3/§8任务5：ExecutionContext 新增必填字段——admission 治理锁内捕获的物化 epoch 与已校验
  // 过的 skill_bundle_id。fake admission 产出的 context 恒需要这两个字段满足类型，取值本身对本文件
  // 其余（与 skill bundle 无关的）既有用例无观测意义，固定占位即可。
  policy_epoch: 'epoch-1', skill_bundle_id: '_all',
})

const SNAPSHOT_SHA = 'f'.repeat(64)

/** H10 §3：prepare 成功后的 LoopPreparedExecutionContext——在 ctx 基础上加一份固定占位的
 *  skillBundle 摘要（本文件其余用例不关心 skill bundle 内容本身，只关心编排顺序/reason 处置，取值
 *  恒定即可）。H10 r1 阻断3/D5 返工（任务B1）：唯一合法构造点是 markLoopPrepared()，不再手写字面量
 *  （裸字面量按结构类型曾经天然满足 PreparedExecutionContext，是 r1 复审阻断3 的确切成因）。 */
const preparedFor = (ctx: ExecutionContext): LoopPreparedExecutionContext => markLoopPrepared(ctx, {
  snapshotSha256: SNAPSHOT_SHA, casRelativePath: `.pipeline/loops/skill-snapshots/sha256/${SNAPSHOT_SHA}`,
  resolutionSource: 'default', slots: [],
})

interface FakePreparationOver {
  prepare?: (ctx: ExecutionContext) => Promise<PrepareOutcome>
}

/** 极小 preparation fake（缺省全放行，产出 preparedFor(ctx)）：记录调用序，供断言编排。 */
const fakePreparation = (over: FakePreparationOver = {}) => {
  const calls: string[] = []
  const preparation: ExecutionPreparationPort = {
    prepare: over.prepare ?? (async (ctx) => { calls.push(ctx.change); return { ok: true, context: preparedFor(ctx) } }),
  }
  return { preparation, calls }
}

interface FakeAdmissionOver {
  reserve?: (change: string) => Promise<ReserveResult>
  claimWithFreshWorkflowAuthority?: AdmissionPort['claimWithFreshWorkflowAuthority']
  activate?: (ctx: ExecutionContext) => Promise<ActivateResult>
  settleWon?: (ctx: ExecutionContext, s: RunSettlement) => Promise<void>
  settleLost?: (ctx: ExecutionContext) => Promise<void>
  isActive?: () => Promise<boolean>
}

/** 极小 admission fake（缺省全放行）：记录调用序，供断言编排。 */
const fakeAdmission = (over: FakeAdmissionOver = {}) => {
  const calls = { reserve: [] as string[], authorityClaim: [] as string[], activate: [] as string[], settleWon: [] as { change: string; s: RunSettlement }[], settleLost: [] as string[], isActive: 0 }
  const admission: AdmissionPort = {
    reserve: over.reserve ?? (async (change) => { calls.reserve.push(change); return { ok: true, context: ctxFor(change) } }),
    claimWithFreshWorkflowAuthority: over.claimWithFreshWorkflowAuthority ?? (async (ctx, claim) => {
      calls.authorityClaim.push(ctx.change)
      return { ok: true, context: ctx, claimed: await claim('backend') }
    }),
    activate: over.activate ?? (async (ctx): Promise<ActivateResult> => { calls.activate.push(ctx.change); return { status: 'activated' } }),
    settleWon: over.settleWon ?? (async (ctx, s) => { calls.settleWon.push({ change: ctx.change, s }) }),
    settleLost: over.settleLost ?? (async (ctx) => { calls.settleLost.push(ctx.change) }),
    isActive: over.isActive ?? (async () => { calls.isActive++; return true }),
  }
  return { admission, calls }
}

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => {
  const raw = Object.prototype.hasOwnProperty.call(over, 'verification') ? over.verification : verification()
  const checked = raw === undefined ? undefined : validateVerificationResult(raw)
  const boundary = checked?.ok
    ? enforceVerificationBoundary(checked.value, {
        context: {
          ...ctxFor(checked.value.subject.change, 'lp'),
          attempt_id: checked.value.subject.attempt_id,
          workflow_run_id: checked.value.subject.workflow_run_id,
        },
        workflowRunId: checked.value.subject.workflow_run_id,
        workflowBinding: checked.value.binding,
        revisionSha: checked.value.subject.revision.sha,
        worktreePath: '/wt/test',
        expectedIssuerIdentity: checked.value.issuer.kind === 'host-verifier'
          ? { kind: 'host-verifier', verifier: checked.value.issuer.verifier, version: checked.value.issuer.version }
          : checked.value.issuer.kind === 'human-review'
            ? { kind: 'human-review', actor_id: checked.value.issuer.actor_id }
            : { kind: 'sandbox-report', runner: checked.value.issuer.runner },
      })
    : raw
  return certifyLifecycleOutcome({
    commits: [{ sha: BUILD_SHA }], verifyResult: 'pass', buildSha: BUILD_SHA, phaseEvent: 'verify-pass',
    mergeLanded: true,
    ...over, verification: boundary,
  })
}

const noopShutdown = () => () => {}

const deps = (over: Partial<SchedulerDeps> & { state: StateWriter }): SchedulerDeps => ({
  runChange: async () => outcome(),
  registerShutdown: noopShutdown,
  config: { maxParallel: 2, maxRetries: 1, level: 'L1' },
  admission: fakeAdmission().admission,
  // H10 §3/§8任务5：缺省全放行的 preparation fake——本文件绝大多数既有用例（kill-switch/verify
  // gate/重试/并发……）与 skill bundle 无关，只需 prepare 恒成功透传，不该被迫逐个显式装配。
  preparation: fakePreparation().preparation,
  // 本文件的默认 fake context 是 bundle-bound；显式装配全放行 validator，避免把“缺生产 wiring
  // evaluator 的 fail-closed 默认”混入与 H11 无关的状态机测试。H11 专测会覆盖本字段。
  validateExecutionWiring: async () => ({ ok: true }),
  ...over,
})

describe('scheduler round（admission 闸门 + 真状态机写回 + 分级放权）', () => {
  it('H11 r4：伪造 null bundle 的 loop context 缺 execution validator → config failure，绝不 claim/run', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission({
      reserve: async () => ({
        ok: true,
        context: { ...ctxFor('c'), runner: 'cron', skill_bundle_id: null },
      }),
    })
    let ran = false
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      validateExecutionWiring: undefined,
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])

    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({
      change: 'c', phase: 'admission', kind: 'config', message: expect.stringMatching(/validator|校验器.*未装配/i),
    }))
    expect(fa.calls.settleLost).toEqual(['c'])
    expect(auto.get('c')).toBe('queued')
    expect(ran).toBe(false)
  })

  it('H11：reserve 后 fresh wiring invalid → claim/prepare/run 均 0，reservation 扣 0 关闭并治理暂停', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const paused: string[] = []
    let ran = false
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      validateExecutionWiring: async () => ({
        ok: false, status: 'invalid', dimension: 'workflow', reason: 'workflow missing',
      }),
      pauseLoop: async (loopId) => { paused.push(loopId) },
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])

    expect(report.ok).toBe(false)
    expect(report.entries).toContainEqual(expect.objectContaining({
      change: 'c', loopId: 'lp', disposition: 'denied', reason: 'execution-wiring-invalid',
    }))
    expect(report.failures).toContainEqual(expect.objectContaining({
      change: 'c', phase: 'admission', kind: 'config', message: expect.stringMatching(/workflow.*missing/i),
    }))
    expect(fa.calls.settleLost).toEqual(['c'])
    expect(paused).toEqual(['lp'])
    expect(auto.get('c')).toBe('queued')
    expect(ran).toBe(false)
  })

  it('H11：validator 已用竞态安全 CAS 暂停时 scheduler 不重复执行 stale pause', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const paused: string[] = []
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      validateExecutionWiring: async () => ({
        ok: false,
        status: 'invalid',
        dimension: 'skill-bundle',
        reason: 'skill removed',
        governancePaused: true,
      }),
      pauseLoop: async (loopId) => { paused.push(loopId) },
    })).runRoundOnce(['c'])

    expect(report.ok).toBe(false)
    expect(fa.calls.settleLost).toEqual(['c'])
    expect(paused).toEqual([])
  })

  it('H14 targeted：owner + 默认 autonomy 快照只对命中 change 透传 reserve，普通候选保持无 opts', async () => {
    const { state } = makeState({ a: 'queued', b: 'queued' })
    const seen: { change: string; expectedLoopId?: string; expectedAutonomyLevel?: string | null }[] = []
    const base = fakeAdmission()
    const admission: AdmissionPort = {
      ...base.admission,
      reserve: async (change, opts) => {
        seen.push({ change, expectedLoopId: opts?.expectedLoopId, expectedAutonomyLevel: opts?.expectedAutonomyLevel })
        return { ok: true, context: ctxFor(change, opts?.expectedLoopId ?? 'natural-loop') }
      },
    }

    const report = await createScheduler(deps({
      state, admission, config: { maxParallel: 1, maxRetries: 1, level: 'L1' },
    })).runRoundOnce(['a', 'b'], {
      expectedLoopIdByChange: new Map([['a', 'selected-loop']]),
      expectedAutonomyLevelByChange: new Map([['a', 'L3']]),
    })

    expect(report.candidates).toBe(2)
    expect(seen).toEqual([
      { change: 'a', expectedLoopId: 'selected-loop', expectedAutonomyLevel: 'L3' },
      { change: 'b', expectedLoopId: undefined, expectedAutonomyLevel: undefined },
    ])
  })

  it('未 claim 到（非 queued）→ 静默跳过，不跑 runChange（reserve 后 claim 输 → settleLost）', async () => {
    const { state, auto } = makeState({ c: 'running' })
    const fa = fakeAdmission()
    let ran = false
    await createScheduler(deps({ state, admission: fa.admission, runChange: async () => { ran = true; return outcome() } })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(auto.get('c')).toBe('running') // 没被动
    expect(fa.calls.settleLost).toEqual(['c']) // claim 输 → 关闭 reservation 扣 0
  })

  it('L1 report-only 成功 → paused（不自动 merge）；settleWon 被调关闭 reservation', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const report = await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L1' } })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(fa.calls.settleWon[0]?.s.result).toBe('paused')
    expect(report.admitted).toBe(1)
    expect(report.ok).toBe(true)
  })

  it('H7 verifier Phase 2 · host verifier pass + SHA 符 → L3 可 merged；settleWon result=merged charge=reserved-estimate 且 verification 透传', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L3' } })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('merged')
    expect(fa.calls.settleWon[0]?.s.result).toBe('merged')
    expect(fa.calls.settleWon[0]?.s.charge).toBe('reserved-estimate')
    expect(fa.calls.settleWon[0]?.s.verification?.verdict).toBe('passed')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('completed')
  })

  it('base 已落地但 host 同步待处理 → 仍结算 merged，终态诊断与 ledger reason 均记 host-sync-pending', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ mergeLanded: true, hostSyncPending: true }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('merged')
    expect(fields.get('c')?.automation_cause).toBe('host-sync-pending')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('host-sync-pending')
  })

  it('base 已落地但 landed journal fsync 失败 → 仍 merged，记 pending 诊断且 round fail-loud', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const report = await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ mergeLanded: true, mergeJournalPending: true }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('merged')
    expect(fields.get('c')?.automation_cause).toBe('merge-journal-pending')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('merge-journal-pending')
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ phase: 'settlement', kind: 'ledger-io' }))
  })

  it('H7 r6 P1-A：物理 merge 已落地后 terminal state 原子写失败 → reservation 保持 open，交 recovery 收口', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    let reservationOpen = true
    let settleCalls = 0
    const fa = fakeAdmission({
      settleWon: async () => {
        settleCalls++
        reservationOpen = false
      },
    })
    state.setAutomationOwnedWithFields = async () => { throw new Error('state fsync failed') }
    const report = await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ mergeLanded: true }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('running')
    expect(fields.get('c')?.automation_attempts).toBeUndefined()
    expect(settleCalls).toBe(0)
    expect(reservationOpen).toBe(true)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ phase: 'state-transition', kind: 'state-io' }))
    expect(report.entries).toContainEqual(expect.objectContaining({
      change: 'c', disposition: 'recovery-pending', reason: 'state-write-pending',
    }))
    expect(report.entries.some((entry) => entry.disposition === 'settled')).toBe(false)
  })

  it('H7 r6 P1-A：物理 merge 已落地后 terminal owner CAS 返回 false 且仍 running → 不以 skipped 关 reservation', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    state.setAutomationOwnedWithFields = async () => false
    const report = await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ mergeLanded: true }),
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('running')
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ phase: 'state-transition', kind: 'state-io' }))
    expect(report.entries).toContainEqual(expect.objectContaining({
      change: 'c', disposition: 'recovery-pending', reason: 'state-write-pending',
    }))
  })

  it('H7 r6 P1-A：terminal CAS false 后 state 复读失败 → 保守保持 open，不把未知态当 merged', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const readState = state.getAutomation.bind(state)
    let reads = 0
    state.getAutomation = async (name) => {
      reads++
      if (reads === 1) return readState(name)
      throw new Error('state read I/O failed')
    }
    state.setAutomationOwnedWithFields = async () => false
    const report = await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ mergeLanded: true }),
    })).runRoundOnce(['c'])

    expect(reads).toBe(1)
    expect(auto.get('c')).toBe('running')
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.entries).toContainEqual(expect.objectContaining({
      disposition: 'recovery-pending', reason: 'state-write-pending',
    }))
  })

  it('reserve 拒绝 → 零 claim、零 runChange，entry=denied', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    let ran = false
    const fa = fakeAdmission({ reserve: async () => ({ ok: false, action: 'skip-run', reason: 'max-in-flight', detail: 'full' }) })
    const report = await createScheduler(deps({ state, admission: fa.admission, runChange: async () => { ran = true; return outcome() } })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(auto.get('c')).toBe('queued') // 没被 claim
    expect(report.admitted).toBe(0)
    expect(report.entries[0]).toMatchObject({ change: 'c', disposition: 'denied', reason: 'max-in-flight' })
  })

  it('halt-round：前序候选 halt → 后续候选零 admission', async () => {
    const { state } = makeState({ a: 'queued', b: 'queued' })
    let reserves = 0
    const fa = fakeAdmission({ reserve: async (change) => { reserves++; return { ok: false, action: 'halt-round', reason: 'max-runs-per-day', detail: 'x', loopId: 'lp' } } })
    const report = await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L1' } })).runRoundOnce(['a', 'b'])
    expect(report.halted).toBe(true)
    expect(reserves).toBe(1) // 第二个候选被 halt 挡住，没 reserve
  })

  it('pause-loop：调 pauseLoop 改 loop status', async () => {
    const { state } = makeState({ c: 'queued' })
    const paused: string[] = []
    const fa = fakeAdmission({ reserve: async () => ({ ok: false, action: 'pause-loop', reason: 'max-tokens-per-day', detail: 'x', loopId: 'lp' }) })
    await createScheduler(deps({ state, admission: fa.admission, pauseLoop: async (id) => { paused.push(id) } })).runRoundOnce(['c'])
    expect(paused).toEqual(['lp'])
  })

  it('activate 失败 → 不进 running，复位 queued，report.ledgerFailures + ok=false', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    let ran = false
    const fa = fakeAdmission({ activate: async () => { throw new Error('fsync boom') } })
    const report = await createScheduler(deps({ state, admission: fa.admission, runChange: async () => { ran = true; return outcome() } })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(auto.get('c')).toBe('queued') // 回落可复捡
    expect(report.ledgerFailures).toHaveLength(1)
    expect(report.ok).toBe(false)
  })

  it('claim 后 running 前 kill-switch（isActive=false）→ 不跑，落 paused + kill-switch，settleWon skipped', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    let ran = false
    const fa = fakeAdmission({ isActive: async () => false })
    await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' }, runChange: async () => { ran = true; return outcome() } })).runRoundOnce(['c'])
    expect(ran).toBe(false) // 停用 → 零 docker
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('kill-switch')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('kill-switch')
  })

  it('claim 后 running 前 kill-switch：paused + cause 必须原子提交成功后才关闭 reservation', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const order: string[] = []
    state.setAutomationOwned = async () => { throw new Error('不得走分离 state 写') }
    state.setField = async () => { throw new Error('不得走分离 field 写') }
    state.setAutomationOwnedWithFields = async (name, next, nextFields) => {
      order.push('state-commit')
      auto.set(name, next)
      fields.set(name, { ...(fields.get(name) ?? {}), ...nextFields })
      return true
    }
    const fa = fakeAdmission({
      isActive: async () => false,
      settleWon: async () => { order.push('settleWon') },
    })

    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('kill-switch')
    expect(order).toEqual(['state-commit', 'settleWon'])
    expect(report.ok).toBe(true)
  })

  it('claim 后 running 前 kill-switch：终态 CAS 输且仍为 scheduled → fail-loud，reservation 保持 open', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    state.setAutomationOwnedWithFields = async () => false
    const fa = fakeAdmission({ isActive: async () => false })

    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('scheduled')
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ phase: 'state-transition', kind: 'state-io' }))
    expect(report.entries).not.toContainEqual(expect.objectContaining({ disposition: 'settled', reason: 'kill-switch' }))
  })

  it('claim 后 running 前 kill-switch：原子 state 写抛错 → fail-loud，reservation 保持 open', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    state.setAutomationOwnedWithFields = async () => { throw new Error('state fsync failed') }
    const fa = fakeAdmission({ isActive: async () => false })

    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('scheduled')
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({
      phase: 'state-transition', kind: 'state-io', message: expect.stringContaining('state fsync failed'),
    }))
  })

  it('claim 后 running 前 kill-switch：外部终态抢先 → 不覆写、不以本轮 kill-switch 关闭 reservation', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    state.setAutomationOwnedWithFields = async (name) => {
      auto.set(name, 'merged')
      return false
    }
    const fa = fakeAdmission({ isActive: async () => false })

    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('merged')
    expect(fields.get('c')?.automation_cause).toBeUndefined()
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(true)
    expect(report.entries).not.toContainEqual(expect.objectContaining({ disposition: 'settled', reason: 'kill-switch' }))
  })

  it('④ terminal settle 前 kill-switch（run 后停用）→ L3 强落 paused，不 merge', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    // 首查（claim 后）active=true 放行；次查（run 后）active=false → 强 paused
    let n = 0
    const fa = fakeAdmission({ isActive: async () => { n++; return n === 1 } })
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ mergeLanded: false }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused') // 不 merged
    expect(fa.calls.settleWon[0]?.s.reason).toBe('kill-switch')
  })

  it('verify-fail：预算内 → queued 重试；settleWon reason=verify-fail', async () => {
    const s1 = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({ state: s1.state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' }, runChange: async () => outcome({ verifyResult: 'fail' }) })).runRoundOnce(['c'])
    expect(s1.auto.get('c')).toBe('queued')
    expect(s1.fields.get('c')?.automation_cause).toBe('verify-fail')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('verify-fail')
    expect(fa.calls.settleWon[0]?.s.result).toBe('retry-queued')
  })

  it('runChange throw conflict 类 → conflict + preserved_path + cause=conflict；settleWon result=conflict', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' }, runChange: async () => { throw { _tag: 'SyncError', message: 'merge conflict', preservedWorktreePath: '/wt/c' } } })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('conflict')
    expect(fields.get('c')?.automation_preserved_path).toBe('/wt/c')
    expect(fields.get('c')?.automation_cause).toBe('conflict')
    expect(fa.calls.settleWon[0]?.s.result).toBe('conflict')
  })

  // H10 r1 阻断6/4（任务B1）：容器 mount 前 host 侧核验失败（ports.ts::verifySkillBundleSnapshot）
  // 发生在 agent 从未启动的时间点——runChange 的执行阶段 catch 恒 ran:true（runChange() 已被调用），
  // 但 classify.ts 归出的专属 cause 必须让 settlementFor override charge:'none'，不能按
  // reserved-estimate 收费（否则违反设计 §5「agent 未启动则不收费」）。
  it('runChange throw SkillBundleSnapshotMismatchError（容器 mount 前 host 侧核验失败）→ conflict + reason=skill-bundle-snapshot-corrupt + charge=none（不因 ran=true 误收费）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => { throw { _tag: 'SkillBundleSnapshotMismatchError', message: 'digest 不一致' } },
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('conflict')
    expect(fields.get('c')?.automation_cause).toBe('skill-bundle-snapshot-corrupt')
    expect(fa.calls.settleWon[0]?.s.result).toBe('conflict')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('skill-bundle-snapshot-corrupt')
    expect(fa.calls.settleWon[0]?.s.charge).toBe('none') // agent 从未启动，绝不按 reserved-estimate 收费
  })

  it('settleWon ledger 写失败 → report.ok=false（不打印虚假成功）', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission({ settleWon: async () => { throw new Error('ledger disk full') } })
    const report = await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' } })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('merged') // automation CAS 已成功（H9：automation_* 与 ledger 非原子）
    expect(report.ledgerFailures).toHaveLength(1)
    expect(report.ok).toBe(false)
  })

  it('并发 ≤ maxParallel（观察峰值）', async () => {
    const names = Array.from({ length: 8 }, (_, i) => `c${i}`)
    const init = Object.fromEntries(names.map((n) => [n, 'queued']))
    const { state } = makeState(init)
    let live = 0
    let peak = 0
    await createScheduler(deps({ state, config: { maxParallel: 3, maxRetries: 1, level: 'L1' }, runChange: async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 2)); live--; return outcome() } })).runRoundOnce(names)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('allSettled：一个 change reject 不拖垮其余', async () => {
    const { state, auto } = makeState({ good: 'queued', bad: 'queued' })
    await createScheduler(deps({
      state, config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
      runChange: async (ctx) => {
        if (ctx.change === 'bad') throw new Error('boom-unhandled')
        // H7-S2：'good' 的 change/attempt_id 与默认 verification() 工厂的 'c'/'att-c' 不同，须显式
        // 对齐 ctx 派生的归属，否则新增的 expectedSubject 比对会把这条诚实结果误判 subject-mismatch。
        return outcome({ verification: verification({ subject: { workflow_run_id: ctx.attempt_id, attempt_id: ctx.attempt_id, change: ctx.change, revision: { kind: 'named-branch-head', sha: BUILD_SHA } } }) })
      },
    })).runRoundOnce(['good', 'bad'])
    expect(auto.get('good')).toBe('merged')
    expect(['queued', 'failed']).toContain(auto.get('bad'))
  })

  it('shutdown teardown 把 in-flight change 同步标 failed', async () => {
    const { state, failedSync } = makeState({ c: 'queued' })
    let teardown: (() => void | Promise<void>) | undefined
    await createScheduler(deps({ state, config: { maxParallel: 1, maxRetries: 1, level: 'L3' }, registerShutdown: (fn) => { teardown = fn; return () => {} }, runChange: async () => { void teardown?.(); return outcome() } })).runRoundOnce(['c'])
    expect(failedSync).toContain('c')
  })

  it('shutdown teardown waits for interrupted invocation evidence before the round returns', async () => {
    const { state } = makeState({ c: 'queued' })
    let teardown: (() => void | Promise<void>) | undefined
    let releaseInterrupt: (() => void) | undefined
    let interrupted = false
    let aborted = false
    let shutdown: Promise<void> | undefined
    const interruptGate = new Promise<void>((resolve) => { releaseInterrupt = resolve })
    const handle = Object.freeze({})
    const round = createScheduler(deps({
      state,
      registerShutdown: (fn) => { teardown = fn; return () => {} },
      skillInvocations: {
        start: async () => [handle] as never,
        finish: async () => { await interruptGate; interrupted = true },
      },
      runChange: async (_context, signal) => {
        shutdown = Promise.resolve(teardown?.())
        await Promise.resolve()
        aborted = signal.aborted
        expect(interrupted).toBe(false)
        releaseInterrupt?.()
        return outcome()
      },
    })).runRoundOnce(['c'])
    const report = await round
    await shutdown
    expect(interrupted).toBe(true)
    expect(aborted).toBe(true)
    expect(report.ok).toBe(false)
    expect(report.failures.some((failure) => failure.message.includes('scheduler interrupted'))).toBe(true)
  })

  it('shutdown normalizes an abort-aware runner rejection before durable settlement and invocation finish', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    let teardown: (() => void | Promise<void>) | undefined
    let shutdown: Promise<void> | undefined
    let finishEntered: (() => void) | undefined
    let releaseFinish: (() => void) | undefined
    let shutdownSettled = false
    let invocationInterrupted = false
    const finishStarted = new Promise<void>((resolve) => { finishEntered = resolve })
    const finishGate = new Promise<void>((resolve) => { releaseFinish = resolve })
    const handle = Object.freeze({})
    const round = createScheduler(deps({
      state,
      admission: fa.admission,
      registerShutdown: (fn) => { teardown = fn; return () => {} },
      skillInvocations: {
        start: async () => [handle] as never,
        finish: async () => {
          finishEntered?.()
          await finishGate
          invocationInterrupted = fa.calls.settleWon[0]?.s.error?.cause === 'scheduler-interrupted'
        },
      },
      runChange: async (_context, signal) => {
        shutdown = Promise.resolve(teardown?.())
        await Promise.resolve()
        expect(signal.aborted).toBe(true)
        throw new Error('runner rejected after abort')
      },
    })).runRoundOnce(['c'])

    await finishStarted
    void shutdown?.then(() => { shutdownSettled = true })
    await Promise.resolve()
    expect(shutdownSettled).toBe(false)
    releaseFinish?.()

    const report = await round
    await shutdown
    expect(fa.calls.settleWon[0]?.s.error).toEqual(expect.objectContaining({ cause: 'scheduler-interrupted' }))
    expect(invocationInterrupted).toBe(true)
    expect(shutdownSettled).toBe(true)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({
      phase: 'execution',
      message: expect.stringContaining('scheduler interrupted'),
    }))
  })

  it('shutdown during invocation start aborts and interrupts newly issued handles before runner execution', async () => {
    const { state } = makeState({ c: 'queued' })
    let teardown: (() => void | Promise<void>) | undefined
    let releaseStart: (() => void) | undefined
    let announceStart: (() => void) | undefined
    const startEntered = new Promise<void>((resolve) => { announceStart = resolve })
    const startGate = new Promise<void>((resolve) => { releaseStart = resolve })
    let interrupted = false
    let ran = false
    const handle = Object.freeze({})
    const round = createScheduler(deps({
      state,
      registerShutdown: (fn) => { teardown = fn; return () => {} },
      skillInvocations: {
        start: async () => { announceStart?.(); await startGate; return [handle] as never },
        finish: async () => { interrupted = true },
      },
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])
    await startEntered
    const shutdown = Promise.resolve(teardown?.())
    releaseStart?.()
    const report = await round
    await shutdown
    expect(ran).toBe(false)
    expect(interrupted).toBe(true)
    expect(report.ok).toBe(false)
  })

  it('B2 · noop 空跑在 L3 不落 merged → paused + cause=no-op；settleWon reason=no-op', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' }, runChange: async () => outcome({ commits: [], buildSha: undefined, noop: true }) })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('no-op')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('no-op')
  })

  it('B5/H7 r7 · running owner CAS 抛错 → 不猜是否落盘，保留 scheduled + open reservation，零 runChange 且 round fail-loud', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    state.setAutomationOwned = async (_name, next) => {
      if (next === 'running') throw new Error('store hiccup')
      return false
    }
    const fa = fakeAdmission()
    let ran = false
    const report = await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' }, runChange: async () => { ran = true; return outcome() } })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('scheduled')
    expect(ran).toBe(false)
    expect(fa.calls.settleWon.length + fa.calls.settleLost.length).toBe(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ phase: 'state-transition', kind: 'state-io' }))
  })

  it('H7 r7 P1-A：activation 后外部 pause 抢走 scheduled 所有权 → running owner CAS 输，不覆写 paused、不启动 runChange，reservation 扣 0 关闭', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const realOwned = state.setAutomationOwned
    state.setAutomationOwned = async (name, next) => {
      if (next === 'running') auto.set(name, 'paused') // 精确插入 isActive 与 running commit 之间
      return realOwned(name, next)
    }
    let ran = false
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('paused')
    expect(ran).toBe(false)
    expect(fa.calls.settleLost).toEqual(['c'])
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(true)
    expect(report.entries).toContainEqual(expect.objectContaining({
      change: 'c', disposition: 'activation-failed', reason: 'ownership-lost',
    }))
  })

  it('H7 r7 P1-A：running owner CAS 返回 false 且 state 复读失败 → 不猜终态、不关 reservation、不启动 runChange，fail-loud', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    state.setAutomationOwned = async (_name, next) => next === 'running' ? false : false
    state.getAutomation = async () => { throw new Error('state read failed') }
    const fa = fakeAdmission()
    let ran = false
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('scheduled')
    expect(ran).toBe(false)
    expect(fa.calls.settleLost).toHaveLength(0)
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({
      change: 'c', phase: 'state-transition', kind: 'state-io',
    }))
  })

  it('H7 r7 P1-A：running owner CAS 返回 false 且复读仍是 scheduled → 所有权不明，保留 open reservation 且绝不启动', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    state.setAutomationOwned = async () => false
    const fa = fakeAdmission()
    let ran = false
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('scheduled')
    expect(ran).toBe(false)
    expect(fa.calls.settleLost).toHaveLength(0)
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
  })
})

describe('H7 verifier Phase 2 · scheduler verification gate（结算选 merged/paused/retry 之前，D3 消费点）', () => {
  it('r4：RunOutcome.verification getter 只读一次；首读 undefined、后读 trusted pass 不能绕 provenance 伪造 merged', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    let reads = 0
    const raw: RunOutcome = {
      commits: [{ sha: BUILD_SHA }], verifyResult: 'pass', buildSha: BUILD_SHA, phaseEvent: 'verify-pass',
      get verification() { reads += 1; return reads === 1 ? undefined : verification() },
      mergeLanded: true,
    }
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => raw,
    })).runRoundOnce(['c'])
    expect(reads).toBe(1)
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('verification-missing')
    expect(fa.calls.settleWon[0]?.s.result).not.toBe('merged')
  })

  it('r4：物理 merge 已 landed 后 terminal isActive=false 不得把不可逆事实覆写成 kill-switch/paused', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    let activeChecks = 0
    const fa = fakeAdmission({ isActive: async () => { activeChecks += 1; return activeChecks === 1 } })
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ mergeLanded: true }),
    })).runRoundOnce(['c'])
    expect(activeChecks).toBe(1) // running 前重查；landed 后不再用 kill-switch 改写事实
    expect(auto.get('c')).toBe('merged')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('completed')
  })

  it('verification 缺席（absent）→ L3 fail-closed 落 paused，reason=verification-missing（绝不 merged）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ verification: undefined }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('verification-missing')
    expect(fa.calls.settleWon[0]?.s.result).toBe('paused')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('verification-missing')
  })

  it('sandbox-report 自报 passed（untrusted）→ L3 fail-closed 落 paused，reason=verification-untrusted（不因 verdict=passed 授权 merge）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ verification: verification({ issuer: untrustedIssuer }) }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('verification-untrusted')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('verification-untrusted')
  })

  it('trusted 但 verdict=inconclusive → L3 fail-closed 落 paused，reason=verification-inconclusive（不折成 pass）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ verification: verification({ verdict: 'inconclusive', evidence: [] }) }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('verification-inconclusive')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('verification-inconclusive')
  })

  it('trusted 且 verdict=failed → 保持既有失败路（retry-queued，reason=verify-fail，同 legacy verify-fail 语义，非新 reason）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      // 沙箱自报仍是 pass——是 host verifier 的 trusted failed 判决驱动失败路，证明信任判定不依赖沙箱自报。
      runChange: async () => outcome({ verifyResult: 'pass', verification: verification({ verdict: 'failed', evidence: [] }) }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('queued') // 预算内 → 回 queued 重试（同既有 verify-fail 语义）
    expect(fields.get('c')?.automation_cause).toBe('verify-fail')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('verify-fail')
    expect(fa.calls.settleWon[0]?.s.result).toBe('retry-queued')
  })

  it('subject SHA 漂移（与 merge candidate buildSha 不符）→ fail-closed 落 paused，reason=verification-subject-mismatch，绝不 merge', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ verification: verification({ subject: { ...verification().subject, revision: { kind: 'named-branch-head', sha: 'b'.repeat(40) } } }) }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('verification-subject-mismatch')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('verification-subject-mismatch')
  })

  it('L1 无 trusted verification（absent）→ paused（level 本就 report-only）且诚实记 verification-missing（不是沉默的空 cause）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L1' },
      runChange: async () => outcome({ verification: undefined }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('verification-missing')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('verification-missing')
  })

  it('kill-switch 在 verifier pass 后、merge 前仍能拦（trusted passed+SHA 符也不能绕过 kill-switch）→ paused，reason=kill-switch（非 verification-*）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    // 首查（claim 后）active=true 放行；次查（terminal settle 前）active=false → 强 paused（既有④重查机制）。
    let n = 0
    const fa = fakeAdmission({ isActive: async () => { n++; return n === 1 } })
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ verification: verification(), mergeLanded: false }), // 尚未物理 merge，terminal kill-switch 可拦
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused') // 不 merged：kill-switch 覆盖了 verifier 的 authorized 判定
    expect(fields.get('c')?.automation_cause).toBe('kill-switch')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('kill-switch')
  })

  it('no-op（noop:true，无 buildSha/verification）→ 仍走既有 no-op 路径（cause=no-op，不被 gate 的 verification-missing 覆盖）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ commits: [], buildSha: undefined, noop: true, verification: undefined }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_cause).toBe('no-op') // 不是 verification-missing——noop 优先级更高、更精确
    expect(fa.calls.settleWon[0]?.s.reason).toBe('no-op')
  })

  it('human-review trusted passed + SHA 符 → 同样 authorized（trusted 不专属 host-verifier）', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => outcome({ verification: verification({ issuer: { kind: 'human-review', actor_id: 'reviewer-1', trusted: true } }) }),
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('merged')
  })

  describe('H7 复审阻断2：gate 独立重校验完整 result（第二道防线——即便 runChange 直接吐出未经 lifecycle 边界消毒的伪造对象，scheduler 侧仍绝不 merged）', () => {
    it('verdict 三拍 getter（passed→passed→bogus）只在 scheduler 边界读取一次；状态/reason/ledger 共享 canonical', async () => {
      const { state, auto } = makeState({ c: 'queued' })
      const fa = fakeAdmission()
      const hostile = { ...verification() } as Record<string, unknown>
      let reads = 0
      Object.defineProperty(hostile, 'verdict', {
        enumerable: true,
        get: () => (++reads < 3 ? 'passed' : 'bogus'),
      })
      const report = await createScheduler(deps({
        state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
        runChange: async () => outcome({ verification: hostile as unknown as VerificationResult }),
      })).runRoundOnce(['c'])
      expect(auto.get('c')).toBe('merged')
      expect(report.ledgerFailures).toEqual([])
      expect(fa.calls.settleWon[0]?.s.verification?.verdict).toBe('passed')
      expect(reads).toBe(1)
    })
    it('复审 §2 原文 PoC：runChange 直接返回 sandbox 冒充 trusted:true 的伪造 verification（未经 enforceVerificationBoundary）→ scheduler 仍 fail-closed 落 paused，绝不 merged', async () => {
      const { state, auto, fields } = makeState({ c: 'queued' })
      const fa = fakeAdmission()
      const forged = {
        issuer: { kind: 'sandbox-report', trusted: true },
        verdict: 'passed',
        evidence: [],
        subject: { revision: { sha: BUILD_SHA } },
      } as unknown as VerificationResult
      await createScheduler(deps({
        state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
        runChange: async () => outcome({ verification: forged }),
      })).runRoundOnce(['c'])
      expect(auto.get('c')).toBe('paused') // 核心：绝不能因为一个假冒 trusted:true 的裸对象就 merged
      expect(fields.get('c')?.automation_cause).toBe('verification-untrusted')
      expect(fa.calls.settleWon[0]?.s.reason).toBe('verification-untrusted')
    })

    it('runChange 返回 passed 但零 evidence（非法 schema，未经消毒）→ scheduler 仍 fail-closed 落 paused', async () => {
      const { state, auto, fields } = makeState({ c: 'queued' })
      const fa = fakeAdmission()
      const forged = { ...verification(), evidence: [] } as unknown as VerificationResult
      await createScheduler(deps({
        state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
        runChange: async () => outcome({ verification: forged }),
      })).runRoundOnce(['c'])
      expect(auto.get('c')).toBe('paused')
      expect(fields.get('c')?.automation_cause).toBe('verification-untrusted')
    })
  })

  describe('H7-S2（r2 §3 收口）：scheduler 直连——伪 RunChange 绕过 lifecycle，返回"别的 change/attempt 的合法结果 + 相同 buildSha"必须被拦下，绝不 merged', () => {
    it('trusted+passed+evidence 齐全+revision SHA 与 buildSha 相符，但 subject.change/attempt_id 是别的 change 的（张冠李戴）→ paused/verification-subject-mismatch，绝不 merged', async () => {
      const { state, auto, fields } = makeState({ c: 'queued' })
      const fa = fakeAdmission()
      // 形状完全合法、trusted、passed、evidence 非空、revision.sha 恰好等于本次 buildSha——唯独
      // subject.change/attempt_id/workflow_run_id 全部是"另一个 change"的，模拟绕过 lifecycle 边界
      // 消毒、直连 scheduler 的伪造/错误绑定 RunChange 实现。
      const otherChangeResult = verification({
        subject: { workflow_run_id: 'att-OTHER', attempt_id: 'att-OTHER', change: 'OTHER-CHANGE', revision: { kind: 'named-branch-head', sha: BUILD_SHA } },
      })
      await createScheduler(deps({
        state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
        runChange: async () => outcome({ verification: otherChangeResult }),
      })).runRoundOnce(['c'])
      expect(auto.get('c')).toBe('paused') // 核心：SHA 相符也不能让"别的 change 的合法结果"授权当前 change 的 merge
      expect(fields.get('c')?.automation_cause).toBe('verification-subject-mismatch')
      expect(fa.calls.settleWon[0]?.s.reason).toBe('verification-subject-mismatch')
      expect(fa.calls.settleWon[0]?.s.result).not.toBe('merged')
    })
  })

  describe('H7-S2（阻断5 custom fail-closed）：requireWorkflowBinding——custom workflow 的核验结果必须真落在 workflow-transition binding，否则绝不 merged', () => {
    it('custom workflow（outcome.requireWorkflowBinding=true）+ trusted passed + subject/SHA 全符，但 binding 仍是 default-transition（坐标未真正解析）→ paused/verification-binding-unresolved，绝不 merged', async () => {
      const { state, auto, fields } = makeState({ c: 'queued' })
      const fa = fakeAdmission()
      await createScheduler(deps({
        state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
        runChange: async () => outcome({ requireWorkflowBinding: true }), // 默认 verification() 的 binding 就是 default-transition
      })).runRoundOnce(['c'])
      expect(auto.get('c')).toBe('paused')
      expect(fields.get('c')?.automation_cause).toBe('verification-binding-unresolved')
      expect(fa.calls.settleWon[0]?.s.reason).toBe('verification-binding-unresolved')
      expect(fa.calls.settleWon[0]?.s.result).not.toBe('merged')
    })

    it('custom workflow + binding 真落在 workflow-transition → 正常 merged（不误伤坐标已解析的诚实 custom run）', async () => {
      const { state, auto } = makeState({ c: 'queued' })
      const fa = fakeAdmission()
      await createScheduler(deps({
        state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
        runChange: async () => outcome({
          requireWorkflowBinding: true,
          verification: verification({ binding: { kind: 'workflow-transition', workflow_digest: 'd1', workflow: 'ship', step: 'verify', event: 'verify-pass' } }),
        }),
      })).runRoundOnce(['c'])
      expect(auto.get('c')).toBe('merged')
    })

    it('回归：未传 requireWorkflowBinding（存量调用点）+ default-transition binding → 仍正常 merged（default 语义，不加此限制）', async () => {
      const { state, auto } = makeState({ c: 'queued' })
      const fa = fakeAdmission()
      await createScheduler(deps({
        state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
        runChange: async () => outcome(),
      })).runRoundOnce(['c'])
      expect(auto.get('c')).toBe('merged')
    })
  })
})

describe('H10 §3/§8任务5：prepareSkillBundle 编排（claim 之后、activate 之前；未 prepared 绝不调 runChange）', () => {
  it('r3：结构相同但未由包内工厂发行的 PreparedContext → preparation failure，绝不 activate/run', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    let ran = false
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      preparation: {
        prepare: async (ctx) => ({
          ok: true,
          context: {
            ...ctx, preparedKind: 'loop-bundle',
            skillBundle: {
              snapshotSha256: SNAPSHOT_SHA,
              casRelativePath: `.pipeline/loops/skill-snapshots/sha256/${SNAPSHOT_SHA}`,
              resolutionSource: 'default', slots: [],
            },
          } as unknown as PreparedExecutionContext,
        }),
      },
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(fa.calls.activate).toEqual([])
    expect(auto.get('c')).toBe('queued')
    expect(report.ok).toBe(false)
  })

  it('r4：具名 loop bundle context 被 preparation 签成 non-loop → 拒绝，绝不 activate/run', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    let ran = false
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      preparation: { prepare: async (ctx) => ({ ok: true, context: markNonLoopPrepared(ctx) }) },
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(fa.calls.activate).toEqual([])
    expect(auto.get('c')).toBe('queued')
    expect(report.ok).toBe(false)
  })

  it('r4：non-loop context 被 preparation 签成 loop-bundle → 拒绝，绝不 activate/run', async () => {
    const admitted = { ...ctxFor('c'), skill_bundle_id: null }
    const fa = fakeAdmission({ reserve: async () => ({ ok: true, context: admitted }) })
    const { state, auto } = makeState({ c: 'queued' })
    let ran = false
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      preparation: { prepare: async (ctx) => ({ ok: true, context: preparedFor(ctx) }) },
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(fa.calls.activate).toEqual([])
    expect(auto.get('c')).toBe('queued')
    expect(report.ok).toBe(false)
  })

  it('r3：同一张已发行 PreparedContext 只能消费一次，重放第二轮被拒', async () => {
    const firstCtx = ctxFor('c')
    const issued = preparedFor(firstCtx)
    const preparation: ExecutionPreparationPort = { prepare: async () => ({ ok: true, context: issued }) }
    const first = makeState({ c: 'queued' })
    await createScheduler(deps({ state: first.state, admission: fakeAdmission({ reserve: async () => ({ ok: true, context: firstCtx }) }).admission, preparation })).runRoundOnce(['c'])
    const second = makeState({ c: 'queued' })
    const secondAdmission = fakeAdmission({ reserve: async () => ({ ok: true, context: firstCtx }) })
    let reran = false
    const report = await createScheduler(deps({
      state: second.state, admission: secondAdmission.admission, preparation,
      runChange: async () => { reran = true; return outcome() },
    })).runRoundOnce(['c'])
    expect(reran).toBe(false)
    expect(report.ok).toBe(false)
  })

  it('顺序钉死：reserve→claim→prepare→activate→runChange→settleWon（prepare 严格先于 activate 先于 runChange）', async () => {
    const { state } = makeState({ c: 'queued' })
    const order: string[] = []
    const admission: AdmissionPort = {
      reserve: async (change) => ({ ok: true, context: ctxFor(change) }),
      claimWithFreshWorkflowAuthority: async (ctx, claim) => ({
        ok: true, context: ctx, claimed: await claim('backend'),
      }),
      activate: async () => { order.push('activate'); return { status: 'activated' } },
      settleWon: async () => { order.push('settleWon') },
      settleLost: async () => {},
      isActive: async () => true,
    }
    const preparation: ExecutionPreparationPort = {
      prepare: async (ctx) => { order.push('prepare'); return { ok: true, context: preparedFor(ctx) } },
    }
    await createScheduler(deps({
      state, admission, preparation, config: { maxParallel: 1, maxRetries: 1, level: 'L1' },
      runChange: async () => { order.push('runChange'); return outcome() },
    })).runRoundOnce(['c'])
    expect(order).toEqual(['prepare', 'activate', 'runChange', 'settleWon'])
  })

  it('prepare 结构化失败（{ok:false}）→ runChange 绝不被调用，activate 也不被调用，reservation 仍被结算关闭', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    let ran = false
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      preparation: { prepare: async () => ({ ok: false, reason: 'skill-bundle-skill-not-found', detail: 'x' }) },
      runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(fa.calls.activate).toEqual([])
    expect(auto.get('c')).toBe('paused')
    expect(fa.calls.settleWon[0]?.s.result).toBe('paused')
    expect(fa.calls.settleWon[0]?.s.reason).toBe('skill-bundle-skill-not-found')
    expect(fa.calls.settleWon[0]?.s.charge).toBe('none')
    expect(report.entries[0]).toMatchObject({ change: 'c', disposition: 'settled', result: 'paused', reason: 'skill-bundle-skill-not-found' })
    expect(report.ok).toBe(true) // 结构化业务处置，非 round 基础设施故障
  })

  it('准备失败终态 CAS 输掉且现状仍 scheduled → 不关 reservation、不伪报 settled、round fail-loud', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    state.setAutomationOwnedWithFields = async () => false
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      preparation: { prepare: async () => ({ ok: false, reason: 'skill-bundle-skill-not-found', detail: 'x' }) },
    })).runRoundOnce(['c'])
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ phase: 'preparation', kind: 'state-io' }))
    expect(report.entries[0]).toMatchObject({ disposition: 'preparation-failed', reason: 'ownership-lost' })
  })

  it('准备失败终态写盘抛错 → 不关 reservation、不伪报 settled、round fail-loud', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    state.setAutomationOwnedWithFields = async () => { throw new Error('state disk full') }
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      preparation: { prepare: async () => ({ ok: false, reason: 'skill-bundle-snapshot-io', detail: 'x' }) },
    })).runRoundOnce(['c'])
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ phase: 'preparation', kind: 'state-io', message: expect.stringContaining('state disk full') }))
    expect(report.entries[0]).toMatchObject({ disposition: 'preparation-failed', reason: 'state-write-failed' })
  })

  it.each([
    ['skill-bundle-skill-not-found', 'paused', false],
    ['skill-bundle-content-invalid', 'paused', false],
    ['skill-bundle-snapshot-io', 'paused', false],
    ['skill-bundle-snapshot-corrupt', 'paused', false],
    ['skill-bundle-source-ambiguous', 'paused', true],
    ['skill-bundle-policy-changed', 'queued', false],
    ['skill-bundle-source-unstable', 'queued', false],
  ] as const)('reason=%s → automation=%s、settle result=%s 对应、charge=none、pauseLoop=%s（设计 §5 处置表逐条落地）', async (reason, expectedAutomation, expectPauseLoop) => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const paused: string[] = []
    const report = await createScheduler(deps({
      state, admission: fa.admission, pauseLoop: async (id) => { paused.push(id) },
      preparation: { prepare: async () => ({ ok: false, reason, detail: 'x' }) },
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe(expectedAutomation)
    expect(fa.calls.settleWon[0]?.s.reason).toBe(reason)
    expect(fa.calls.settleWon[0]?.s.charge).toBe('none')
    expect(fa.calls.settleWon[0]?.s.result).toBe(expectedAutomation === 'queued' ? 'retry-queued' : 'paused')
    expect(paused.length > 0).toBe(expectPauseLoop)
    expect(report.ok).toBe(true)
  })

  it('resolve-failed + workflowKind=custom → 只暂停本 change，绝不暂停 loop（只影响该 custom change 的 step.skills 解析）', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const paused: string[] = []
    await createScheduler(deps({
      state, admission: fa.admission, pauseLoop: async (id) => { paused.push(id) },
      preparation: { prepare: async () => ({ ok: false, reason: 'skill-bundle-resolve-failed', detail: 'x', workflowKind: 'custom' }) },
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
    expect(paused).toEqual([])
  })

  it.each([['default'], [undefined]] as const)('resolve-failed + workflowKind=%s → 暂停 loop（共享 profile 解析失败，牵连该 profile 下所有 loop）', async (workflowKind) => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const paused: string[] = []
    await createScheduler(deps({
      state, admission: fa.admission, pauseLoop: async (id) => { paused.push(id) },
      preparation: { prepare: async () => ({ ok: false, reason: 'skill-bundle-resolve-failed', detail: 'x', workflowKind }) },
    })).runRoundOnce(['c'])
    expect(paused).toEqual(['lp'])
  })

  it('prepare 抛错：queued + preparation-failed diagnostics 必须原子提交成功后才关闭 reservation', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const order: string[] = []
    state.setAutomationOwned = async () => { throw new Error('不得走分离 state 写') }
    state.setField = async () => { throw new Error('不得走分离 field 写') }
    state.setAutomationOwnedWithFields = async (name, next, nextFields) => {
      order.push('state-commit')
      auto.set(name, next)
      fields.set(name, { ...(fields.get(name) ?? {}), ...nextFields })
      return true
    }
    const fa = fakeAdmission({ settleWon: async () => { order.push('settleWon') } })

    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      preparation: { prepare: async () => { throw new Error('ledger disk full') } },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('queued')
    expect(fields.get('c')).toMatchObject({
      automation_cause: 'preparation-failed',
      automation_last_error: 'ledger disk full',
    })
    expect(order).toEqual(['state-commit', 'settleWon'])
    expect(report.ok).toBe(false)
  })

  it('prepare 抛错：原子回退 CAS 输且仍为 scheduled → fail-loud，reservation 保持 open', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    state.setAutomationOwnedWithFields = async () => false
    const fa = fakeAdmission()

    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      preparation: { prepare: async () => { throw new Error('ledger disk full') } },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('scheduled')
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ phase: 'preparation', kind: 'state-io' }))
    expect(report.entries[0]).toMatchObject({ disposition: 'preparation-failed', reason: 'ownership-lost' })
  })

  it('prepare 抛错：原子回退写盘再抛错 → state-io fail-loud，reservation 保持 open', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    state.setAutomationOwnedWithFields = async () => { throw new Error('state disk full') }
    const fa = fakeAdmission()

    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      preparation: { prepare: async () => { throw new Error('ledger disk full') } },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('scheduled')
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({
      phase: 'preparation', kind: 'state-io', message: expect.stringContaining('state disk full'),
    }))
    expect(report.entries[0]).toMatchObject({ disposition: 'preparation-failed', reason: 'state-write-failed' })
  })

  it('prepare 抛意外错误（ledger I/O，非结构化 reason）→ 复位 queued + round failure phase=preparation + reservation 立即关闭（charge none）（H10 r1 阻断6：不再留给未激活预占的 TTL 恢复兜底）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const report = await createScheduler(deps({
      state, admission: fa.admission,
      preparation: { prepare: async () => { throw new Error('ledger disk full') } },
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('queued')
    expect(fields.get('c')?.automation_cause).toBe('preparation-failed')
    expect(report.ok).toBe(false)
    expect(report.failures.some((f) => f.phase === 'preparation')).toBe(true)
    expect(fa.calls.settleWon).toHaveLength(1) // 立即关闭 reservation，不再留给下轮 TTL 恢复
    expect(fa.calls.settleWon[0]?.s).toMatchObject({ result: 'skipped', reason: 'infrastructure-error', charge: 'none' })
    expect(fa.calls.settleLost).toHaveLength(0)
  })

  it('SchedulerDeps.preparation 缺席 → 整轮短路成一条 config 类 failure，零 admission/claim/runChange', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    let ran = false
    const report = await createScheduler(deps({
      state, admission: fa.admission, preparation: undefined, runChange: async () => { ran = true; return outcome() },
    })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(fa.calls.reserve).toEqual([]) // 零 admission
    expect(auto.get('c')).toBe('queued') // 未被 claim
    expect(report.admitted).toBe(0)
    expect(report.ok).toBe(false)
    expect(report.failures[0]).toMatchObject({ kind: 'config' })
  })

  it('成功路径：settleWon 的 RunSettlement 携带 skillBundleSnapshotSha256（= preparedCtx.skillBundle.snapshotSha256）', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L1' } })).runRoundOnce(['c'])
    expect(fa.calls.settleWon[0]?.s.skillBundleSnapshotSha256).toBe(SNAPSHOT_SHA)
  })

  it('runChange 拿到的 context 携带 skillBundle（PreparedExecutionContext）——证明裸 admitted context 不会流到 runChange', async () => {
    const { state } = makeState({ c: 'queued' })
    let seenSkillBundle: unknown
    await createScheduler(deps({
      state, config: { maxParallel: 1, maxRetries: 1, level: 'L1' },
      // H10 r1 阻断3/D5 返工（任务B1）：ctx 现是判别联合，读 skillBundle 前必须先判别 preparedKind。
      runChange: async (ctx) => { seenSkillBundle = ctx.preparedKind === 'loop-bundle' ? ctx.skillBundle : undefined; return outcome() },
    })).runRoundOnce(['c'])
    expect(seenSkillBundle).toEqual({
      snapshotSha256: SNAPSHOT_SHA, casRelativePath: `.pipeline/loops/skill-snapshots/sha256/${SNAPSHOT_SHA}`,
      resolutionSource: 'default', slots: [],
    })
  })

  // 二次任务（queued 卡死回归修复）+ H10 r1 阻断3/D5 返工（任务B1）：none-bundle 直通产出
  // NonLoopExecutionContext（preparedKind='non-loop'，类型上没有 skillBundle 概念，不是「省略了
  // skillBundle 字段」的同一形状）——scheduler 消费点必须先判别 preparedKind，不假设恒存在。
  it('preparation 直通产出 NonLoopExecutionContext（none-bundle）→ settleWon 的 skillBundleSnapshotSha256 诚实缺席，round 正常结算不炸', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission({ reserve: async () => ({ ok: true, context: { ...ctxFor('c'), skill_bundle_id: null } }) })
    let seenSkillBundle: unknown = 'unset'
    const report = await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L1' },
      preparation: { prepare: async (ctx) => ({ ok: true, context: markNonLoopPrepared(ctx) }) },
      runChange: async (ctx) => { seenSkillBundle = ctx.preparedKind === 'loop-bundle' ? ctx.skillBundle : undefined; return outcome() },
    })).runRoundOnce(['c'])
    expect(seenSkillBundle).toBeUndefined()
    expect(auto.get('c')).toBe('paused')
    expect(fa.calls.settleWon[0]?.s.skillBundleSnapshotSha256).toBeUndefined()
    expect(report.ok).toBe(true)
  })
})

describe('Stage B 返工 #2 · 异常不被 allSettled 吞成 ok=true', () => {
  it('reserve throw（ledger I/O）→ 其他候选仍完成，ok=false，failure phase=admission/kind=ledger-io', async () => {
    const { state, auto } = makeState({ good: 'queued', bad: 'queued' })
    const fa = fakeAdmission({
      reserve: async (change) => {
        if (change === 'bad') throw Object.assign(new Error('ledger read boom'), { _tag: 'LedgerDegradedError' })
        return { ok: true, context: ctxFor(change) }
      },
    })
    const report = await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L1' } })).runRoundOnce(['good', 'bad'])
    expect(auto.get('good')).toBe('paused') // good 正常完成一轮
    expect(report.ok).toBe(false)
    const f = report.failures.find((x) => x.change === 'bad')!
    expect(f.phase).toBe('admission')
    expect(f.kind).toBe('ledger-io')
  })

  it('reserve throw（registry I/O：RegistryReadError）→ ok=false，failure phase=admission/kind=registry-io（不吞成 no-registry denial）', async () => {
    const { state, auto } = makeState({ good: 'queued', bad: 'queued' })
    const fa = fakeAdmission({
      reserve: async (change) => {
        if (change === 'bad') throw Object.assign(new Error('loops.yaml 读失败（EACCES）'), { _tag: 'RegistryReadError' })
        return { ok: true, context: ctxFor(change) }
      },
    })
    const report = await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 2, maxRetries: 1, level: 'L1' } })).runRoundOnce(['good', 'bad'])
    expect(auto.get('good')).toBe('paused') // good 正常完成一轮
    expect(report.ok).toBe(false) // 真实 registry I/O 故障使 round 失败，绝不假 ok=true
    const f = report.failures.find((x) => x.change === 'bad')!
    expect(f.phase).toBe('admission')
    expect(f.kind).toBe('registry-io')
  })

  it('admission denial（业务拒绝：max-in-flight）不使 ok=false（治理常态）', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission({ reserve: async () => ({ ok: false, action: 'skip-run', reason: 'max-in-flight', detail: 'full' }) })
    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])
    expect(report.ok).toBe(true)
    expect(report.failures).toHaveLength(0)
  })

  it('admission denial（registry-unparseable：损坏 loops.yaml）→ round ok=false（H10 r1 阻断6：不再当成治理常态静默吞，区别于 no-registry 合法缺席）', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission({
      reserve: async () => ({ ok: false, action: 'skip-run', reason: 'registry-unparseable', detail: 'loops.yaml 载入失败：bad yaml' }),
    })
    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])
    expect(report.ok).toBe(false) // 损坏 registry 不是治理常态，CLI 必须非零
    expect(report.failures.some((f) => f.phase === 'admission' && f.kind === 'registry-io')).toBe(true)
  })

  it('对照：admission denial（no-registry：loops.yaml 不存在）不使 ok=false（合法「无 loop 语境」，与 registry-unparseable 明确区分）', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission({
      reserve: async () => ({ ok: false, action: 'skip-run', reason: 'no-registry', detail: 'loops.yaml 不存在（无 loop 语境，fail-closed）' }),
    })
    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])
    expect(report.ok).toBe(true)
    expect(report.failures).toHaveLength(0)
  })

  it('ledger-degraded denial → ledgerDegraded=true 且 ok=false', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission({ reserve: async () => ({ ok: false, action: 'skip-run', reason: 'ledger-degraded', detail: 'bad lines' }) })
    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])
    expect(report.ledgerDegraded).toBe(true)
    expect(report.ok).toBe(false)
  })

  it('settleWon ledger 写失败 → failures 有 settlement 项且 ok=false', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission({ settleWon: async () => { throw new Error('disk full') } })
    const report = await createScheduler(deps({ state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' } })).runRoundOnce(['c'])
    expect(report.ok).toBe(false)
    expect(report.failures.some((f) => f.phase === 'settlement')).toBe(true)
  })
})

describe('Stage B 返工 #6 · activation 补偿不空吞', () => {
  it('activation throw + reset-queued 成功 → ok=false、复位 queued、留恢复标记', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission({ activate: async () => { throw new Error('fsync boom') } })
    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('queued')
    expect(fields.get('c')?.automation_cause).toBe('activation-ledger-failed')
    expect(report.ok).toBe(false)
    expect(report.failures.some((f) => f.phase === 'activation')).toBe(true)
    expect(report.ledgerFailures).toHaveLength(1) // compat 面同时填充
  })

  it('activation throw + ownership-lost 仍非 terminal → activation-compensation-failed 进 failures', async () => {
    const { state } = makeState({ c: 'queued' })
    state.setAutomationOwned = async () => false // CAS 全程输（ownership-lost），状态仍 scheduled
    const fa = fakeAdmission({ activate: async () => { throw new Error('boom') } })
    const report = await createScheduler(deps({ state, admission: fa.admission })).runRoundOnce(['c'])
    expect(report.ok).toBe(false)
    expect(report.failures.some((f) => f.message.includes('compensation-failed'))).toBe(true)
  })

  it('activate 返回 already-terminal（reserve→activate 间被 recovery 关闭）→ 复位 queued，不跑 runChange，ok 不受影响', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    let ran = false
    const fa = fakeAdmission({ activate: async () => ({ status: 'already-terminal' }) })
    const report = await createScheduler(deps({ state, admission: fa.admission, runChange: async () => { ran = true; return outcome() } })).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(auto.get('c')).toBe('queued')
    expect(report.ok).toBe(true) // 良性竞态，非 round 故障
  })
})

describe('G² 子问题1 · base 被外部推进（BaseAdvancedError）fail-loud', () => {
  it('runChange 抛 baseAdvanced（_tag=SyncError）→ settle 为 conflict 留现场 + report.ok=false + failures 记 execution（CLI 据此非零、不打印跑完一轮）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const report = await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => { throw { _tag: 'SyncError', baseAdvanced: true, message: 'base advanced externally', preservedWorktreePath: '/wt/c' } },
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('conflict') // 留现场：settle 为 conflict，供人工复核/重试
    expect(fields.get('c')?.automation_preserved_path).toBe('/wt/c')
    expect(report.ok).toBe(false) // fail-loud：并发异常使 round ok=false
    expect(report.failures.some((f) => f.change === 'c' && f.phase === 'execution')).toBe(true)
    expect(report.entries.find((e) => e.change === 'c')?.reason).toBe('base-advanced')
    expect(fa.calls.settleWon[0]?.s.result).toBe('conflict') // reservation 正常关闭（settle conflict）
  })

  it('对照：普通 content-conflict（SyncError 无 baseAdvanced）→ settle conflict 但 round 仍 ok=true（治理常态，不 fail-loud）', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const report = await createScheduler(deps({
      state, admission: fa.admission, config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => { throw { _tag: 'SyncError', message: 'merge conflict', preservedWorktreePath: '/wt/c' } },
    })).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('conflict')
    expect(report.ok).toBe(true) // 普通冲突是正常 settle，round 不失败（与 base-advanced 区分）
    expect(report.failures).toHaveLength(0)
  })
})

describe('H14 r3 · 容器清理失败必须使整轮非成功', () => {
  it.each([
    {
      name: 'direct cleanup Proxy（verifyFail getter 抛错）',
      error: () => new Proxy({
        _tag: 'ContainerCleanupError', message: 'container remains', preservedWorktreePath: '/wt/hostile',
      }, {
        get(target, key, receiver) {
          if (key === 'verifyFail') throw new Error('hostile verifyFail getter')
          return Reflect.get(target, key, receiver)
        },
      }),
    },
    {
      name: 'nested cleanup Proxy（nested _tag getter 抛错）',
      error: () => ({
        message: 'agent failed', preservedWorktreePath: '/wt/hostile',
        cleanupError: new Proxy({ message: 'container remains' }, {
          get(target, key, receiver) {
            if (key === '_tag') throw new Error('hostile nested tag getter')
            return Reflect.get(target, key, receiver)
          },
        }),
      }),
    },
    {
      name: 'RunAndCleanupError 的 cleanupError 缺席',
      error: () => ({
        _tag: 'RunAndCleanupError', message: 'run and cleanup failed',
        preservedWorktreePath: '/wt/hostile',
      }),
    },
  ])('H14 r8：$name → conflict、零 attempts、round 非成功且 reservation 正常关闭', async ({ error }) => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => { throw error() },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('conflict')
    expect(fields.get('c')?.automation_attempts).toBeUndefined()
    expect(fields.get('c')?.automation_cause).toBe('container-cleanup')
    expect(fields.get('c')?.automation_preserved_path).toBe('/wt/hostile')
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ change: 'c', phase: 'execution' }))
    expect(fa.calls.settleWon[0]?.s).toMatchObject({ result: 'conflict' })
  })

  it('H14 r9：敌意 abort reason 无法被格式化 → lifecycle 仍产 AbortedRunError，scheduler conflict 且零 attempts', async () => {
    const reason = new Proxy({}, {
      get(_target, key) {
        if (key === 'message' || key === Symbol.toPrimitive || key === 'toString') {
          throw new Error('hostile abort reason getter')
        }
        return undefined
      },
      getPrototypeOf() {
        throw new Error('hostile abort reason prototype')
      },
    })
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => { throw new AbortedRunError(reason, '/wt/hostile') },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('conflict')
    expect(fields.get('c')?.automation_attempts).toBeUndefined()
    expect(fields.get('c')?.automation_cause).toBe('cancelled')
    expect(fields.get('c')?.automation_preserved_path).toBe('/wt/hostile')
    expect(fa.calls.settleWon[0]?.s).toMatchObject({ result: 'conflict', reason: 'cancelled' })
    expect(report.ok).toBe(true)
  })

  it('cleanup failure 终态 owner CAS 输且复读仍 running → recovery-pending、reservation 保持 open', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    state.commitFailureOwned = async () => ({ status: 'ownership-lost', observed: 'running' })
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      runChange: async () => { throw { _tag: 'ContainerCleanupError', message: 'container remains' } },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('running')
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.entries).toContainEqual(expect.objectContaining({
      change: 'c', disposition: 'recovery-pending', reason: 'state-write-pending',
    }))
  })

  it('普通 retry failure 终态 owner CAS 输且仍 running → attempts 不增加、reservation open、round fail-loud', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    state.commitFailureOwned = async () => ({ status: 'ownership-lost', observed: 'running' })
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      runChange: async () => { throw new Error('transient agent failure') },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('running')
    expect(fields.get('c')?.automation_attempts).toBeUndefined()
    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.entries).toContainEqual(expect.objectContaining({ disposition: 'recovery-pending' }))
    expect(report.failures).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('transient agent failure'),
    }))
  })

  it('execution failure 终态 owner CAS 输但复读为外部 paused → 按真实 paused 幂等结算，不谎报 skipped', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    state.commitFailureOwned = async (name) => {
      auto.set(name, 'paused')
      return { status: 'ownership-lost', observed: 'paused' }
    }
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      runChange: async () => { throw new Error('transient agent failure') },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('paused')
    expect(fa.calls.settleWon[0]?.s.result).toBe('paused')
    expect(report.entries).toContainEqual(expect.objectContaining({ disposition: 'settled', result: 'paused' }))
  })

  it('execution failure 原子终态提交读写失败 → 不猜终态、不关 reservation、recovery-pending', async () => {
    const { state } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    state.commitFailureOwned = async () => { throw new Error('state atomic commit failed') }
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      runChange: async () => { throw new Error('transient agent failure') },
    })).runRoundOnce(['c'])

    expect(fa.calls.settleWon).toHaveLength(0)
    expect(report.ok).toBe(false)
    expect(report.entries).toContainEqual(expect.objectContaining({ disposition: 'recovery-pending' }))
  })

  it('runChange 抛 ContainerCleanupError → conflict 留现场 + report.ok=false + execution failure（CLI 非零）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async () => {
        throw {
          _tag: 'ContainerCleanupError',
          message: 'docker rm failed; container still exists',
          preservedWorktreePath: '/wt/c',
        }
      },
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('conflict')
    expect(fields.get('c')?.automation_cause).toBe('container-cleanup')
    expect(fields.get('c')?.automation_preserved_path).toBe('/wt/c')
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ change: 'c', phase: 'execution' }))
    expect(fa.calls.settleWon[0]?.s.result).toBe('conflict')
  })

  it('lifecycle 遇到虚报 descriptor 且 getPrototypeOf 抛错的主错误 Proxy + cleanup 失败 → conflict、不重排 queued、report.ok=false、worktree 保留', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    const fa = fakeAdmission()
    const cleanupError = Object.assign(new Error('docker rm failed; container still exists'), {
      _tag: 'ContainerCleanupError' as const,
      containerName: 'sandcastle-proxy-test',
    })
    const worktreePath = '/wt/sandcastle-pipeline/c'
    const primaryError = new Proxy(new Error('agent execution failed'), {
      getPrototypeOf() {
        throw new Error('hostile getPrototypeOf')
      },
      getOwnPropertyDescriptor(target, key) {
        if (key === 'cleanupError') {
          return { value: cleanupError, writable: false, enumerable: true, configurable: true }
        }
        if (key === 'preservedWorktreePath') {
          return { value: worktreePath, writable: false, enumerable: true, configurable: true }
        }
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    let removed = false
    let closeCalled = false
    let containerNameReads = 0
    const ports: LifecyclePorts = {
      worktree: {
        async create() { return { path: worktreePath, branch: 'sandcastle-pipeline/c' } },
        async remove() { removed = true },
        async hasCancelMarker() { return false },
      },
      async createSandbox(opts) {
        return new Proxy({
          env: opts.env,
          containerName: 'sandcastle-proxy-test',
          async exec() { return { stdout: '', stderr: '', exitCode: 0 } },
          async close() {
            closeCalled = true
            throw cleanupError
          },
        }, {
          get(target, key, receiver) {
            if (key === 'containerName' && ++containerNameReads > 1) {
              throw new Error('hostile containerName getter')
            }
            return Reflect.get(target, key, receiver)
          },
        })
      },
      async runWork() { throw primaryError },
      async collectCommits() { return [] },
      async diffNames() { return [] },
      async mergeToBase() {},
      git: { async revParse() { return BUILD_SHA } },
      async setStateField() {},
      verifier: { async verify() { throw new Error('unreachable verifier') } },
    }
    const report = await createScheduler(deps({
      state,
      admission: fa.admission,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
      runChange: async (_context, signal) => runChangeInSandbox(
        ports,
        { hostRepoDir: '/repo', name: 'c', base: 'main', autoMerge: false },
        signal,
      ),
    })).runRoundOnce(['c'])

    expect(auto.get('c')).toBe('conflict')
    expect(auto.get('c')).not.toBe('queued')
    expect(fields.get('c')?.automation_attempts).toBeUndefined()
    expect(fields.get('c')?.automation_cause).toBe('container-cleanup')
    expect(fields.get('c')?.automation_preserved_path).toBe(worktreePath)
    expect(report.ok).toBe(false)
    expect(report.failures).toContainEqual(expect.objectContaining({ change: 'c', phase: 'execution' }))
    expect(fa.calls.settleWon[0]?.s.result).toBe('conflict')
    expect(closeCalled).toBe(true)
    expect(removed).toBe(false)
  })
})

/**
 * 真机验收 P1（2026-07-11）：sanitize 的 slice(0,200) 只管错误消息，绝不截断路径。
 */
describe('sanitize / sanitizePath —— 四闸消毒的截断纪律（深路径 P1）', () => {
  it('sanitizePath：>200 字符深路径完整保留（不截断）', () => {
    const deep = `/Users/x/${'p'.repeat(220)}/.sandcastle/worktrees/sandcastle-pipeline-af-fix-thing`
    expect(deep.length).toBeGreaterThan(200)
    expect(sanitizePath(deep)).toBe(deep)
  })
  it('sanitizePath：四闸清洗（换行 / ": " / " #" / 首引号）', () => {
    expect(sanitizePath('"a\nb: c #d')).toBe('a b; c d')
    expect(sanitizePath('')).toBe('error')
  })
  it('sanitize（错误消息用）：≤200 字符截断', () => {
    expect(sanitize('e'.repeat(500)).length).toBeLessThanOrEqual(200)
    expect(sanitize('x\ny: z #w')).toBe('x y; z w')
  })
})
