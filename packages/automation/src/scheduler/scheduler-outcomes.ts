import { type AutomationConfig, type AutomationState, type RunOutcome } from '../types.js'
import type {
  ExecutionContext, ExecutionPreparationPort, PrepareOutcome, PreparationFailureReason, PreparedExecutionContext,
} from '../admission/execution-context.js'
import { consumeIssuedPreparedContext } from '../admission/execution-context.js'
import type { ActivateResult, AdmissionDenial, ReserveResult, RunSettlement } from '../admission/loop-admission.js'
import { classifyFailure } from './classify.js'
import { createSemaphore } from './semaphore.js'
import { evaluateVerificationGate, isBoundaryVerifiedResult, type VerificationGateResult } from '../verifier/verifier.js'
import { validateVerificationResult } from '@pipeline-lite/kernel'
import { certifyLifecycleOutcome, isCertifiedLifecycleOutcome } from '../lifecycle/outcome.js'
import { isSettled } from '../queue/claim.js'
import { settleSuccess } from '../queue/state-machine.js'

import {
  ExecutionWiringValidatorUnconfiguredError,
  canonicalizeRunOutcome,
  classifyRoundFailure,
  errText,
  explicitTerminal,
  expectedSubjectFor,
  isBaseAdvancedFailure,
  preparationPolicyFor,
  sanitize,
  sanitizePath,
  terminalToRunResult,
  verificationGateFor,
  type ExecutionWiringValidationResult,
  type ActivationCompensation,
  type AdmissionPort,
  type AfkObserver,
  type HandleResult,
  type RoundFailure,
  type RoundOutcomeEntry,
  type RoundReport,
  type RunRoundOptions,
  type Scheduler,
  type SchedulerDeps,
  type Terminal,
  type TerminalCommit,
} from './scheduler-support.js'
import type { MutableReport } from './scheduler-support.js'

export type TryLedger = (
  report: MutableReport,
  change: string,
  phase: RoundFailure['phase'],
  fn: () => Promise<void>,
) => Promise<void>

export function createSchedulerOutcomes(deps: SchedulerDeps, tryLedger: TryLedger) {
  const { state, admission, config } = deps
  const observer = deps.observer
  const emit = (name: string, s: AutomationState, extra?: Record<string, string>): void => {
    if (!observer) return
    try {
      observer.onState(name, s, extra)
    } catch {
      // 旁路 channel——吞错
    }
  }

  const commitOwnedTerminal = async (
    name: string,
    target: AutomationState,
    fields: Readonly<Record<string, string>>,
  ): Promise<TerminalCommit> => {
    try {
      if (await state.setAutomationOwnedWithFields(name, target, fields)) {
        return { status: 'committed', terminal: target }
      }
      try {
        const observed = await state.getAutomation(name)
        const terminal = explicitTerminal(observed)
        return terminal
          ? { status: 'external-terminal', terminal }
          : { status: 'recovery-pending', observed }
      } catch (error) {
        return { status: 'recovery-pending', error }
      }
    } catch (error) {
      return { status: 'recovery-pending', error }
    }
  }

  /** 成功写回：verify-fail / trusted-failed verdict 转失败路；killSwitched/noop/verification 未
   *  authorized 强落 paused；否则按分级 settleSuccess。判定优先级（既有 killSwitched/noop 不变，
   *  H7 gate 追加于其后——no-op 没有可核验的构建，不该被误报成 verification-missing）。
   *  H10：调用点恒是 prepareSkillBundle 成功后的 preparedCtx（runChange 本身已收窄到
   *  PreparedExecutionContext），本函数继续声明成 ExecutionContext 只为最小改动面——不因此收窄。 */
  const writeBackSuccess = async (name: string, ctx: ExecutionContext, outcome: RunOutcome): Promise<TerminalCommit> => {
    const gate = verificationGateFor(ctx, outcome)
    if (outcome.verifyResult === 'fail' || gate.kind === 'failure') {
      return applyFailure(name, { verifyFail: true })
    }
    // noop 空跑 / killSwitched（运行中 loop 被停用，lifecycle 已跳过 merge）/ H7 verification gate 未
    // authorized（absent/untrusted/inconclusive/SHA 漂移，fail-closed）即便 verify pass 也绝不落
    // merged——停给人工复核。L1/L2 本就 paused，语义不变（只 L3 从 merged 改判 paused）。
    const mergeMissing = config.level === 'L3' && gate.kind === 'authorized' && outcome.mergeLanded !== true
    const forcePaused = outcome.noop === true || outcome.killSwitched === true || gate.kind === 'paused' || mergeMissing
    const target = forcePaused ? 'paused' : settleSuccess(config.level)
    const terminalFields: Record<string, string> = { automation_attempts: '0' }
    if (outcome.killSwitched === true) {
      terminalFields.automation_last_error = sanitize('loop 运行中被停用（kill-switch）——未合并，停给人工复核')
      terminalFields.automation_cause = 'kill-switch'
    } else if (outcome.noop === true) {
      terminalFields.automation_last_error = sanitize('no-op run：零 commit / 空构建（build_sha 缺失）——未合并、未解锁下游，停给人工复核')
      terminalFields.automation_cause = 'no-op'
    } else if (gate.kind === 'paused') {
      terminalFields.automation_last_error = sanitize(`verification gate 未授权 merge（${gate.reason}）——未合并，停给人工复核`)
      terminalFields.automation_cause = gate.reason
    } else if (mergeMissing) {
      terminalFields.automation_last_error = sanitize('核验已授权但缺少 lifecycle 物理 merge receipt——未把普通 RunChange 自报当作 merged')
      terminalFields.automation_cause = 'merge-not-landed'
    } else if (outcome.mergeJournalPending === true) {
      terminalFields.automation_last_error = sanitize('base ref 已合并，但 merge-landed ledger receipt 待 recovery 对账')
      terminalFields.automation_cause = 'merge-journal-pending'
    } else if (outcome.hostSyncPending === true) {
      terminalFields.automation_last_error = sanitize('base ref 已合并，但 host 工作树同步待人工处理')
      terminalFields.automation_cause = 'host-sync-pending'
    }
    return commitOwnedTerminal(name, target, terminalFields)
  }

  /** 失败写回：分类 → conflict(留现场, 不重试) | retry(queued, attempts++) → failed(耗尽)。 */
  const applyFailure = async (
    name: string,
    err: unknown,
    c: ReturnType<typeof classifyFailure> = classifyFailure(err),
  ): Promise<TerminalCommit> => {
    const lastError = sanitize(c.message)
    const fields: Record<string, string> = {
      automation_last_error: lastError,
      automation_cause: c.cause,
    }
    if (c.preservedPath) fields.automation_preserved_path = sanitizePath(c.preservedPath)
    try {
      const result = await state.commitFailureOwned(name, {
        classification: c.kind,
        maxRetries: config.maxRetries,
        fields,
      })
      if (result.status === 'committed') return { status: 'committed', terminal: result.automation }
      const terminal = explicitTerminal(result.observed)
      return terminal
        ? { status: 'external-terminal', terminal }
        : { status: 'recovery-pending', observed: result.observed }
    } catch (error) {
      return { status: 'recovery-pending', error }
    }
  }

  const emitTerminal = (name: string, settled: Terminal): void => {
    if (settled === 'skipped') return
    emit(name, settled)
  }

  /** 由终态 + 运行事实派生 RunSettlement（关闭 reservation 用）。ran=true → 按预占估扣，否则扣 0。
   *  H7：reason 优先级与 writeBackSuccess 的判定顺序严格对齐（同一份 evaluateVerificationGate 结果、
   *  同一优先级——两处判定绝不分叉）；verification 原样透传进 RunSettlement，供 buildTerminal 落
   *  terminal RunRecord.verification（结算只持久化，不重新判定）。
   *  H10 §3：调用点恒是 prepareSkillBundle 成功后的 preparedCtx——本函数收窄参数为
   *  PreparedExecutionContext，把 ctx.skillBundle?.snapshotSha256 带进每条 RunSettlement
   *  （none-bundle 直通产出的 preparedCtx 不带 skillBundle，见 execution-context.ts 头注，此时
   *  该字段诚实缺席，非伪造 undefined），buildTerminal 据此写终态 RunRecord.skill_bundle_snapshot_sha256。 */
  const settlementFor = (
    ctx: PreparedExecutionContext,
    settled: Terminal,
    opts: {
      outcome?: RunOutcome
      err?: unknown
      classification?: ReturnType<typeof classifyFailure>
      ran: boolean
    },
  ): RunSettlement => {
    const result = terminalToRunResult(settled)
    const charge: RunSettlement['charge'] = opts.ran ? 'reserved-estimate' : 'none'
    // H10 r1 阻断3/D5 返工（任务B1）：ctx 现是判别联合，skillBundle 只存在于 preparedKind==='loop-bundle'
    // 分支——显式判别窄化（不能再靠 `?.` 悄悄放过 non-loop 分支）。
    const snapshotSha256 = ctx.preparedKind === 'loop-bundle' ? ctx.skillBundle.snapshotSha256 : undefined
    if (opts.outcome) {
      const o = opts.outcome
      const gate = verificationGateFor(ctx, o)
      const reason: RunSettlement['reason'] =
        o.verifyResult === 'fail' ? 'verify-fail'
          : gate.kind === 'failure' ? 'verify-fail'
            : o.killSwitched === true ? 'kill-switch'
              : o.noop === true ? 'no-op'
                : gate.kind === 'paused' ? gate.reason
                  : o.mergeLanded === true && o.mergeJournalPending === true ? 'merge-journal-pending'
                    : o.mergeLanded === true && o.hostSyncPending === true ? 'host-sync-pending'
                    : result === 'paused' && config.level === 'L3' && gate.kind === 'authorized' && o.mergeLanded !== true ? 'infrastructure-error'
                  : settled === 'skipped' ? 'claim-lost'
                    : 'completed'
      const artifacts = o.commits.length > 0
        ? { buildSha: o.buildSha, branch: o.branch, commitShas: o.commits.map((c) => c.sha) }
        : undefined
      return { result, reason, charge, verify: { result: o.verifyResult }, verification: o.verification, artifacts, skillBundleSnapshotSha256: snapshotSha256 }
    }
    if (opts.err !== undefined) {
      // H14 r8：error 可能是有状态/敌意 Proxy。执行 catch 必须只分类一次，并把同一份
      // canonical classification 贯穿写回与 ledger settlement；否则第二次读 getter 既可能
      // 得到不同裁决，也可能再次 throw，留下 running state + open reservation。
      const c = opts.classification ?? classifyFailure(opts.err)
      // H10 r1 阻断6/4（任务B1）：SkillBundleSnapshotMismatchError（容器 mount 前 host 侧核验失败，
      // ports.ts::verifySkillBundleSnapshot）发生在 agent 从未启动的时间点——即便本 catch 站点恒
      // opts.ran=true（runChange() 已被调用），也不能按 reserved-estimate 收费；classify.ts 据 tag
      // 归出的专属 cause 在此 override charge:'none' + reason:'skill-bundle-snapshot-corrupt'
      // （镜像设计 §5 对 skill-bundle-snapshot-corrupt「不收费」的既有裁决，只是发生时点从
      // preparation 移到了 execution，处置口径必须一致）。
      const isSnapshotCorrupt = c.cause === 'skill-bundle-snapshot-corrupt'
      const isPolicyChanged = c.cause === 'skill-bundle-policy-changed'
      const reason: RunSettlement['reason'] =
        isSnapshotCorrupt ? 'skill-bundle-snapshot-corrupt'
          : isPolicyChanged ? 'skill-bundle-policy-changed'
          : c.cause === 'verify-fail' ? 'verify-fail'
            : c.cause === 'cancelled' ? 'cancelled'
              : settled === 'skipped' ? 'claim-lost'
                : 'infrastructure-error'
      return {
        result, reason, charge: isSnapshotCorrupt || isPolicyChanged ? 'none' : charge,
        error: { cause: c.cause || 'unknown', message: sanitize(c.message) }, skillBundleSnapshotSha256: snapshotSha256,
      }
    }
    return { result, reason: settled === 'skipped' ? 'claim-lost' : undefined, charge, skillBundleSnapshotSha256: snapshotSha256 }
  }

  /** owner CAS scheduled→queued 补偿（Stage B 返工 #6）：结构化结果，绝不空吞。 */
  const tryResetScheduledToQueued = async (name: string): Promise<ActivationCompensation> => {
    try {
      const won = await state.setAutomationOwned(name, 'queued')
      if (won) return { status: 'reset-queued' }
      const observed = await state.getAutomation(name).catch(() => undefined)
      return { status: 'ownership-lost', observedState: observed }
    } catch (e) {
      return { status: 'failed', error: sanitize(errText(e)) }
    }
  }

  /**
   * activation append 失败补偿（Stage B 返工 #6）：primary failure 由调用方（allSettled 收口）据返回值
   * 落 report.failures；本函数落 ledgerFailures（compat）+ 恢复标记 + 二次补偿失败（ownership-lost 仍
   * 非 terminal / CAS throw）。恢复标记 automation_cause=activation-ledger-failed 只进 change 字段面，
   * 不进 transact、不造 TransitionRecord（H9 边界）。 */
  const handleActivationFailure = async (report: MutableReport, name: string, ctx: ExecutionContext, error: unknown): Promise<HandleResult> => {
    const failure = classifyRoundFailure(name, 'activation', error)
    report.ledgerFailures.push({ change: name, message: `activation append 失败：${sanitize(errText(error))}` })
    const comp = await tryResetScheduledToQueued(name)
    // 恢复标记（best-effort；下轮 scan/recovery 见 scheduled+activation-ledger-failed 尝试回 queued）。
    await state.setField(name, 'automation_cause', 'activation-ledger-failed').catch(() => {})
    await state.setField(name, 'automation_last_error', sanitize(errText(error))).catch(() => {})
    let reason = 'activation-ledger-failed'
    if (comp.status === 'ownership-lost') {
      const observed = comp.observedState ?? await state.getAutomation(name).catch(() => '')
      if (!isSettled(observed)) {
        report.failures.push({ change: name, phase: 'activation', kind: 'state-io', message: sanitize(`activation-compensation-failed：ownership-lost 但 automation=${observed || '(空)'}`) })
      }
      reason = 'ownership-lost'
    } else if (comp.status === 'failed') {
      report.failures.push({ change: name, phase: 'activation', kind: 'state-io', message: sanitize(`activation-compensation-failed：${comp.error}`) })
      reason = 'compensation-failed'
    }
    report.entries.push({ change: name, loopId: ctx.loop_id, disposition: 'activation-failed', reason })
    return { ok: false, change: name, failure }
  }

  /** H10 §5：prepareSkillBundle 结构化失败处置（claim 之后、activate 之前，此刻尚未 activate、
   *  从未创建 sandbox）。处置策略统一查 preparationPolicyFor（reason(+workflowKind)→result/是否
   *  暂停 loop 的唯一表）；恒 charge:'none'（设计 §5 否决「准备失败仍按 reserved estimate 收费」）。
   *  scope='requeue' 类（policy-changed/source-unstable）复位 automation=queued，交下一轮重新
   *  admission（不在本轮内部重试）；其余落 paused，pauseLoop=true 时另经 report.pausePending
   *  让本轮收尾统一暂停 loop（复用 applyDenial 同一套 pause-loop 管道，不发明第二条暂停通路）。 */
  const handlePreparationFailure = async (
    report: MutableReport, name: string, ctx: ExecutionContext, prep: Extract<PrepareOutcome, { ok: false }>,
  ): Promise<HandleResult> => {
    const policy = preparationPolicyFor(prep.reason, prep.workflowKind)
    const target: AutomationState = policy.result === 'retry-queued' ? 'queued' : 'paused'
    try {
      const won = await state.setAutomationOwnedWithFields(name, target, {
        automation_cause: prep.reason,
        automation_last_error: sanitize(`skill bundle 准备失败（${prep.reason}）：${prep.detail}`),
      })
      if (!won) {
        const observed = await state.getAutomation(name).catch(() => '')
        if (!isSettled(observed)) {
          const failure: RoundFailure = {
            change: name, phase: 'preparation', kind: 'state-io',
            message: sanitize(`preparation-state-commit ownership-lost 且 automation=${observed || '(空)'}`),
          }
          report.failures.push(failure)
          report.entries.push({ change: name, loopId: ctx.loop_id, disposition: 'preparation-failed', reason: 'ownership-lost' })
          return { ok: false, change: name, failure }
        }
        // 外部权威终态已经先行提交；不覆写它，也不用本轮的准备失败关闭
        // reservation。ledger recovery 会按持久事实对账，避免这里和权威 settlement 竞赛。
        report.entries.push({ change: name, loopId: ctx.loop_id, disposition: 'preparation-failed', reason: 'ownership-lost' })
        return { ok: true, change: name }
      }
    } catch (error) {
      const failure: RoundFailure = {
        change: name, phase: 'preparation', kind: 'state-io', message: sanitize(errText(error)),
      }
      report.failures.push(failure)
      report.entries.push({ change: name, loopId: ctx.loop_id, disposition: 'preparation-failed', reason: 'state-write-failed' })
      return { ok: false, change: name, failure }
    }
    await tryLedger(report, name, 'settlement', () => admission.settleWon(ctx, { result: policy.result, reason: prep.reason, charge: 'none' }))
    if (policy.pauseLoop) report.pausePending.push(ctx.loop_id)
    report.entries.push({ change: name, loopId: ctx.loop_id, disposition: 'settled', result: target, reason: prep.reason })
    if (policy.result === 'paused') emit(name, 'paused')
    return { ok: true, change: name }
  }

  /**
   * H10 §3：preparation.prepare(ctx) 意外抛错（ledger I/O，非结构化 PreparationFailureReason——
   * 镜像 activate() 对 ledger I/O 的既有处置，调用方 fail-loud，不伪装成某个业务 reason）。claim
   * 已把 automation 推到 scheduled，此刻 throw 若放任不管会留 scheduled 孤儿；比照 #6
   * handleActivationFailure 的补偿模式复位 queued。
   *
   * reservation 从未 activate（claim 成功但 prepare 抛错，早于 activate 调用）。先以一次 owner CAS
   * 原子提交 scheduled→queued + preparation-failed diagnostics；只有该 state commit 成功，才用
   * result:'skipped'/reason:'infrastructure-error'/charge:'none' 关闭 reservation。CAS 输且现状非终态，
   * 或 state 写抛错时 fail-loud 并保留 open reservation；外部终态抢先时不覆写，也不以本轮失败
   * settlement。ledger 写失败经 tryLedger 落 failures/ledgerFailures，不吞、不二次抛出。
   */
  const handlePreparationThrow = async (report: MutableReport, name: string, ctx: ExecutionContext, error: unknown): Promise<HandleResult> => {
    const failure = classifyRoundFailure(name, 'preparation', error)
    let won: boolean
    try {
      won = await state.setAutomationOwnedWithFields(name, 'queued', {
        automation_cause: 'preparation-failed',
        automation_last_error: sanitize(errText(error)),
      })
    } catch (stateError) {
      report.failures.push(failure)
      report.entries.push({ change: name, loopId: ctx.loop_id, disposition: 'preparation-failed', reason: 'state-write-failed' })
      return {
        ok: false,
        change: name,
        failure: {
          change: name,
          phase: 'preparation',
          kind: 'state-io',
          message: sanitize(errText(stateError)),
        },
      }
    }
    if (!won) {
      const observed = await state.getAutomation(name).catch(() => '')
      if (!isSettled(observed)) {
        report.failures.push({
          change: name,
          phase: 'preparation',
          kind: 'state-io',
          message: sanitize(`preparation state commit ownership-lost 且 automation=${observed || '(空)'}`),
        })
      }
      report.entries.push({ change: name, loopId: ctx.loop_id, disposition: 'preparation-failed', reason: 'ownership-lost' })
      return { ok: false, change: name, failure }
    }
    await tryLedger(report, name, 'settlement', () => admission.settleWon(ctx, { result: 'skipped', reason: 'infrastructure-error', charge: 'none' }))
    report.entries.push({ change: name, loopId: ctx.loop_id, disposition: 'preparation-failed', reason: 'preparation-failed' })
    return { ok: false, change: name, failure }
  }

  return {
    applyFailure,
    commitOwnedTerminal,
    emit,
    emitTerminal,
    handleActivationFailure,
    handlePreparationFailure,
    handlePreparationThrow,
    settlementFor,
    tryResetScheduledToQueued,
    writeBackSuccess,
  }
}
