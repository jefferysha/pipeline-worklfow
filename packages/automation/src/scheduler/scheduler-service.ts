import { type AutomationConfig, type AutomationState, type RunOutcome } from '../types.js'
import type {
  ExecutionContext, ExecutionPreparationPort, PrepareOutcome, PreparationFailureReason, PreparedExecutionContext,
} from '../admission/execution-context.js'
import { consumeIssuedPreparedContext } from '../admission/execution-context.js'
import type { ActivateResult, AdmissionDenial, ReserveResult, RunSettlement } from '../admission/loop-admission.js'
import { classifyFailure } from './classify.js'
import { createSemaphore } from './semaphore.js'
import { evaluateVerificationGate, isBoundaryVerifiedResult, type VerificationGateResult } from '../verifier/verifier.js'
import { validateVerificationResult } from '@tenon/kernel'
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
  type MutableReport,
  type RoundFailure,
  type RoundOutcomeEntry,
  type RoundReport,
  type RunRoundOptions,
  type Scheduler,
  type SchedulerDeps,
  type Terminal,
  type TerminalCommit,
} from './scheduler-support.js'
import { createSchedulerExecution } from './scheduler-execution.js'
import { createSchedulerOutcomes } from './scheduler-outcomes.js'
import type { AfkSkillInvocationHandle } from '../skillInvocationAfkLifecycle.js'

export const createScheduler = (deps: SchedulerDeps): Scheduler => {
  const validateExecutionWiring = deps.validateExecutionWiring ?? (async (context: ExecutionContext) => {
    throw new ExecutionWiringValidatorUnconfiguredError(context.loop_id)
  })
  const { state, runChange, registerShutdown, config, admission } = deps
  const observer = deps.observer
  const semaphore = createSemaphore(config.maxParallel)
  const inFlight = new Set<string>()
  const abortControllers = new Map<string, AbortController>()
  const shutdownCompletions = new Map<string, { readonly promise: Promise<void>; readonly resolve: () => void }>()
  const activeSkillInvocations = new Map<string, readonly AfkSkillInvocationHandle[]>()
  let shutdownBarrier: Promise<void> = Promise.resolve()
  let shutdownStarted = false

  const interruptInFlight = (): Promise<void> => {
    if (shutdownStarted) return shutdownBarrier
    shutdownStarted = true
    const interrupts: Promise<void>[] = []
    for (const name of inFlight) {
      abortControllers.get(name)?.abort(new Error('scheduler interrupted'))
      const completion = shutdownCompletions.get(name)
      if (completion !== undefined) interrupts.push(completion.promise)
      try {
        state.markFailedSync(name, 'scheduler interrupted')
      } catch {
        // best-effort
      }
    }
    shutdownBarrier = Promise.all(interrupts).then(() => undefined)
    return shutdownBarrier
  }
  const tryLedger = async (
    report: MutableReport,
    change: string,
    phase: RoundFailure['phase'],
    fn: () => Promise<void>,
  ): Promise<void> => {
    try {
      await fn()
    } catch (error) {
      report.failures.push(classifyRoundFailure(change, phase, error))
      report.ledgerFailures.push({ change, message: sanitize(errText(error)) })
    }
  }
  const outcomes = createSchedulerOutcomes(deps, tryLedger)
  const { settlementFor } = outcomes

  const settleTerminal = async (
    report: MutableReport,
    ctx: PreparedExecutionContext,
    settled: Terminal,
    opts: {
      outcome?: RunOutcome
      err?: unknown
      classification?: ReturnType<typeof classifyFailure>
      ran: boolean
    },
  ): Promise<void> => {
    if (settled === 'skipped' && !opts.ran) {
      // 外部 settle 抢先且本地未真跑 → 关闭 reservation 扣 0。
      await tryLedger(report, ctx.change, 'settlement', () => admission.settleLost(ctx))
      return
    }
    await tryLedger(report, ctx.change, 'settlement', () => admission.settleWon(ctx, settlementFor(ctx, settled, opts)))
  }

  /** on_exceed 处置：skip-run 只记；pause-loop 改 loop status（有 pauseLoop 才真改）；halt-round 停后续。 */
  const applyDenial = (report: MutableReport, change: string, denial: AdmissionDenial): void => {
    report.entries.push({ change, loopId: denial.loopId, disposition: 'denied', reason: denial.reason })
    if (denial.reason === 'ledger-degraded') report.ledgerDegraded = true
    // H10 r1 阻断6（任务B1）：loops.yaml 存在但解析/校验失败（registry-unparseable）是配置损坏，不是
    // 治理常态——CLI 必须非零退出，不能被当成普通 denial 静默吞掉（区别于 no-registry：文件缺失是
    // 合法「无 loop 语境」，仍保持 ok:true，见 loop-admission.ts::reserveOnce 两者的不同 detail）。
    // kind 复用既有 'registry-io'（与真实 registry I/O throw 归同一类："registry 此刻不可用"，
    // 不论成因是权限故障还是内容损坏，诊断读出来都该导向同一处置：非零、不打印跑完一轮）。
    if (denial.reason === 'registry-unparseable') {
      report.failures.push({ change, phase: 'admission', kind: 'registry-io', message: sanitize(denial.detail) })
    }
    if (denial.action === 'halt-round') report.halted = true
    if (denial.action === 'pause-loop' && denial.loopId !== undefined && deps.pauseLoop) {
      report.pausePending.push(denial.loopId)
    }
  }

  const { handleOne } = createSchedulerExecution({
    scheduler: deps,
    semaphore,
    inFlight,
    abortControllers,
    shutdownCompletions,
    activeSkillInvocations,
    validateExecutionWiring,
    outcomes,
    applyDenial,
    tryLedger,
    settleTerminal,
  })

  const runRoundOnceRegistered = async (
    candidates: readonly string[],
    options: RunRoundOptions = {},
  ): Promise<RoundReport> => {
    const report: MutableReport = {
      candidates: candidates.length, admitted: 0, entries: [], failures: [], ledgerFailures: [],
      halted: false, ledgerDegraded: false, pausePending: [],
    }
    // H10 §3/§8任务5：直接 createScheduler 时 ExecutionPreparationPort 在类型上可选。缺席时整轮
    // 在处理任何候选**之前**就短路成一条 config 类
    // RoundFailure：零 admission/claim/runChange，不悄悄 pass-through 冒充「已 prepare」、也不假装
    // 每个候选都失败预备（那会把「基础设施未装配」误报成一堆逐候选的业务 denial）。
    if (deps.preparation === undefined) {
      return {
        candidates: candidates.length, admitted: 0, entries: [],
        failures: [{
          change: '(config)', phase: 'preparation', kind: 'config',
          message: 'ExecutionPreparationPort 未装配（SchedulerDeps.preparation 缺席）——本轮零 admission/claim/runChange',
        }],
        ledgerFailures: [], halted: false, ledgerDegraded: false, ok: false,
      }
    }
    const preparation = deps.preparation
    // ⑥ allSettled——绝不 Promise.all：单个 reject 不取消其余的写回。halt-round 由 report.halted 阻断后续。
    const results = await Promise.allSettled(candidates.map((name) => handleOne(
      name,
      report,
      preparation,
      options.expectedLoopIdByChange?.get(name),
      options.expectedAutonomyLevelByChange?.get(name),
    )))
    // Stage B 返工 #2：allSettled 逐项检查——rejected（handleOne 顶层 catch 外的意外）与 !value.ok 都归 failures，
    // 绝不再被 allSettled 吞成 ok=true。primary failure 单点在此落表（handleOne 只落 secondary/ledger-compat），不双计。
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        const change = candidates[i]
        if (change !== undefined) {
          report.failures.push({
            change,
            phase: 'internal',
            kind: 'unexpected',
            message: sanitize(errText(result.reason)),
          })
        }
      } else if (!result.value.ok) {
        report.failures.push(result.value.failure)
      }
    }
    // pause-loop 后处理（改 loop status）。Stage B 返工 #3：pause 是 kill-switch 写，失败不得空吞——
    // 进 failures（registry-io）使 ok=false（kill-switch 写失败不能被报告为成功暂停）。
    for (const loopId of [...new Set(report.pausePending)]) {
      try {
        await deps.pauseLoop?.(loopId)
      } catch (e) {
        report.failures.push({ change: `(pause:${loopId})`, phase: 'state-transition', kind: 'registry-io', message: sanitize(errText(e)) })
      }
    }
    return {
      candidates: report.candidates, admitted: report.admitted, entries: report.entries,
      failures: report.failures, ledgerFailures: report.ledgerFailures, halted: report.halted,
      ledgerDegraded: report.ledgerDegraded,
      ok: report.failures.length === 0 && report.ledgerFailures.length === 0 && !report.ledgerDegraded,
    }
  }

  const runRoundOnce = async (
    candidates: readonly string[],
    options: RunRoundOptions = {},
  ): Promise<RoundReport> => {
    const unregisterShutdown = registerShutdown(interruptInFlight)
    try {
      return await runRoundOnceRegistered(candidates, options)
    } finally {
      try {
        await shutdownBarrier
      } finally {
        unregisterShutdown()
      }
    }
  }

  return { runRoundOnce }
}
