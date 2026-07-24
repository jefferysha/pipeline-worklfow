/**
 * `pipeline review request|acknowledge` —— review 出口的显式两阶段协议。
 *
 * request 只能在当前 workflow 声明为 review 的 step 调用：先将 pending receipt 原子写入
 * canonical state，再落 versioned hook marker。acknowledge 由 Codex UserPromptSubmit 或用户显式
 * CLI 调用写入 approved receipt，并清理 marker。transition 只消费 exact-phase-and-event approved
 * receipt: a decision to return from verify to build must never authorize verify-pass (or vice versa).
 */
import {
  formatReviewMarker,
  evaluateDocumentEvidence,
  isDocumentContractPhase,
  isOpenSpecDocumentContractRequired,
  loadWorkflow,
  resolveStep,
  resolveWorkflowName,
  reviewGateApprovalPatch,
  reviewGateApprovedFor,
  reviewGateEvent,
  reviewGateMatches,
  reviewGatePendingFor,
  reviewGateRequestPatch,
  reviewGateStatus,
  TRANSITION_EVENTS,
} from '@pipeline-lite/kernel'
import type { PipelineState } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { readDelegatedReviewAuthority, type ContinuousAuthority } from '../continuousAuthority.js'
import { cmdCheck } from './check.js'
import { recordHistory } from './fields.js'

type ReviewStep = {
  readonly phase: string
  readonly workflow: string
  readonly events: readonly string[]
}

export interface ReviewOpts {
  readonly event?: string
  /** Explicit user-delegated review confirmation for the active Change only. */
  readonly delegated?: boolean
}

function scalar(state: PipelineState, field: keyof PipelineState['fields']): string {
  const value = state.fields[field]
  return Array.isArray(value) ? value.join(',') : (value ?? '')
}

function resolveReviewStep(deps: CliDeps, state: PipelineState): ReviewStep {
  const phase = scalar(state, 'phase')
  const workflow = resolveWorkflowName(state)
  if (workflow === 'default') {
    if ((deps.flow.manifest.reviewPhases as readonly string[]).includes(phase)) {
      const events = Object.entries(TRANSITION_EVENTS)
        .filter(([, edge]) => edge.from === phase)
        .map(([event]) => event)
      if (events.length > 0) return { phase, workflow, events }
    }
    throw new Error(`当前 phase '${phase}' 不是 default workflow 的 review 出口`)
  }
  const definition = loadWorkflow(deps.cwd, workflow)
  if (!definition) throw new Error(`workflow '${workflow}' 未找到（期望 .pipeline/workflows/${workflow}.yaml）`)
  const step = resolveStep(definition, phase)
  if (!step) throw new Error(`step '${phase}' 不在 workflow '${workflow}' 里`)
  if (step.gate !== 'review') throw new Error(`workflow '${workflow}' 的 step '${phase}' 未声明 gate=review`)
  return { phase, workflow, events: step.transitions.map((transition) => transition.event) }
}

function resolveReviewEvent(step: ReviewStep, requestedEvent: string | undefined): string {
  if (requestedEvent !== undefined) {
    if (!step.events.includes(requestedEvent)) {
      throw new Error(
        `phase '${step.phase}' 不支持 review event '${requestedEvent}'；可选：${step.events.join(', ') || '(无)'}`,
      )
    }
    return requestedEvent
  }
  if (step.events.length !== 1) {
    throw new Error(
      `phase '${step.phase}' 有多个 review 出口；必须指定 --event ${step.events.join('|')}`,
    )
  }
  return step.events[0]!
}

async function writeMarker(
  deps: CliDeps,
  phase: string,
  event: string,
  name: string,
  requestedAt: string,
): Promise<boolean> {
  if (!deps.writeReviewMarker) return true
  try {
    await deps.writeReviewMarker(formatReviewMarker({ phase, event, changeName: name, requestedAt }))
    return true
  } catch (error) {
    deps.io.err(`WARN: review marker 写入失败（canonical pending receipt 已提交，可重试 request）: ${errMsg(error)}`)
    return false
  }
}

/**
 * `verify-fail` is an intentional rollback, not the successful verify exit. Its transition policy
 * deliberately has no success guards, so running `pipeline check` here would make a failure path
 * impossible to review. We still require a real report and its governed OpenSpec evidence before
 * asking a human to select the rollback.
 */
async function checkVerifyFailReadiness(
  deps: CliDeps,
  name: string,
  dir: string,
  state: PipelineState,
): Promise<number> {
  const blockers: string[] = []
  const report = scalar(state, 'verification_report')
  const fileExists = deps.guardCtx?.(name)?.fileExists
  if (report === '' || report === 'null') {
    blockers.push(`verify-fail 决策要求 verification_report 非空（当前='${report || 'null'}'）`)
  } else if (fileExists?.(report) === false) {
    blockers.push(`verify-fail 决策要求 verification_report 文件存在（当前='${report}'）`)
  }

  const workflow = resolveWorkflowName(state)
  const track = scalar(state, 'track')
  if (isOpenSpecDocumentContractRequired(workflow, track)) {
    const phase = scalar(state, 'phase')
    if (!isDocumentContractPhase(phase)) {
      blockers.push(`受 OpenSpec 文档契约治理的 workflow 当前 phase 非法（当前='${phase || '空'}'）`)
    } else {
      // A failure exit must remain possible precisely when implementation or upstream documents
      // drifted. Requiring the successful verify evidence set here deadlocks the only governed
      // route back to build. The rollback decision therefore requires the fresh, digest-bound
      // verification report only; the next successful exit re-evaluates the complete contract.
      const evidence = deps.documentEvidence
        ? await deps.documentEvidence(deps.cwd, dir, phase)
        : await evaluateDocumentEvidence(deps.cwd, dir, phase, {
          recordKinds: ['verification-report'],
          readKinds: [],
        })
      blockers.push(...evidence.blockers.map((blocker) => `document: ${blocker}`))
    }
  }

  deps.io.out(`[CHECK] ${name} (phase=verify, event=verify-fail)`)
  if (blockers.length === 0) {
    deps.io.out('  [PASS] verify-fail 回退证据已就绪')
    return 0
  }
  for (const blocker of blockers) deps.io.out(`  [FAIL] ${blocker}`)
  deps.io.out(`  [FAIL] 共 ${blockers.length} 项未通过`)
  return 2
}

async function checkReviewRequestReadiness(
  deps: CliDeps,
  name: string,
  dir: string,
  state: PipelineState,
  step: ReviewStep,
  event: string,
): Promise<number> {
  if (step.workflow === 'default' && step.phase === 'verify' && event === 'verify-fail') {
    return checkVerifyFailReadiness(deps, name, dir, state)
  }
  // A successful outgoing edge must satisfy the same public exit check that transition will
  // re-evaluate under its own lock. This keeps an agent from freezing knowingly incomplete output.
  return cmdCheck(deps, name)
}

async function clearMarker(deps: CliDeps): Promise<boolean> {
  if (!deps.clearReviewMarker) return true
  try {
    await deps.clearReviewMarker()
    return true
  } catch (error) {
    deps.io.err(`WARN: review marker 清理失败（approval receipt 已提交，可重试 acknowledge）: ${errMsg(error)}`)
    return false
  }
}

export async function cmdReview(
  deps: CliDeps,
  sub: string,
  name: string | undefined,
  opts: ReviewOpts = {},
): Promise<number> {
  if (sub !== 'request' && sub !== 'acknowledge') {
    deps.io.err('ERROR: 用法：pipeline review request <change> [--event <event>] | acknowledge <change> [--delegated]')
    return 1
  }
  if (!name || !isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name ?? ''}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  const dir = changeDir(deps.cwd, name)
  try {
    if (sub === 'request') {
      if (opts.delegated === true) {
        deps.io.err('ERROR: --delegated 只可用于 review acknowledge；request 仍必须先完成真实 review 证据')
        return 1
      }
      const preflight = await deps.store.read(dir)
      const preflightStep = resolveReviewStep(deps, preflight)
      const event = resolveReviewEvent(preflightStep, opts.event)
      const check = await checkReviewRequestReadiness(deps, name, dir, preflight, preflightStep, event)
      if (check !== 0) return check
      let requested: {
        phase: string
        event: string
        requestedAt: string
        alreadyPending: boolean
        replacedReceipt: boolean
      } | undefined
      await deps.store.withLock(dir, async () => {
        const state = await deps.store.read(dir)
        const step = resolveReviewStep(deps, state)
        const lockedEvent = resolveReviewEvent(step, opts.event)
        if (step.phase !== preflightStep.phase || lockedEvent !== event) {
          throw new Error('review request 期间当前 phase 或可选 event 已变化；请重新运行该命令')
        }
        const existingStatus = reviewGateStatus(state)
        const existingEvent = reviewGateEvent(state)
        if (existingStatus !== null && !reviewGateMatches(state, step.phase)) {
          throw new Error(`检测到属于 phase '${scalar(state, 'review_gate_phase')}' 的残留 review receipt；请先诊断 state 后重试`)
        }
        if (reviewGateApprovedFor(state, step.phase, event)) {
          throw new Error(`phase '${step.phase}' 的 event '${event}' 已获确认；请直接执行该 transition，不能重复 request`)
        }
        const existingAt = scalar(state, 'review_requested_at')
        if (reviewGatePendingFor(state, step.phase, event)) {
          requested = {
            phase: step.phase, event, requestedAt: existingAt || deps.clock(), alreadyPending: true, replacedReceipt: false,
          }
          return
        }
        const requestedAt = deps.clock()
        await deps.store.writeUnderLock(dir, {
          ...state,
          fields: { ...state.fields, ...reviewGateRequestPatch(step.phase, event, requestedAt) },
        }, { kind: 'set-many' })
        requested = {
          phase: step.phase,
          event,
          requestedAt,
          alreadyPending: false,
          // Replacing a different/legacy receipt can only revoke a prior decision; it always
          // creates a fresh pending request and therefore never grants the new event permission.
          replacedReceipt: existingStatus !== null && existingEvent !== event,
        }
      })
      if (!requested) throw new Error('review request 未产生 receipt')
      const markerOk = await writeMarker(deps, requested.phase, requested.event, name, requested.requestedAt)
      if (!requested.alreadyPending) {
        await recordHistory(deps, dir, {
          ts: requested.requestedAt,
          kind: 'tool',
          raw: `review:request phase=${requested.phase} event=${requested.event}${requested.replacedReceipt ? ' replaced=true' : ''}`,
        })
      }
      deps.io.out(
        `[REVIEW] ${name} phase=${requested.phase} event=${requested.event} ` +
        `${requested.alreadyPending ? '仍待确认' : '已请求人工确认'}`,
      )
      return markerOk ? 0 : 2
    }

    let acknowledged: {
      phase: string
      event: string
      acknowledgedAt: string
      changed: boolean
      delegatedAuthority: ContinuousAuthority | null
    } | undefined
    await deps.store.withLock(dir, async () => {
      const state = await deps.store.read(dir)
      const step = resolveReviewStep(deps, state)
      const event = reviewGateEvent(state)
      if (event === '') {
        throw new Error(`phase '${step.phase}' 的旧 review receipt 未绑定 event；请重新运行 pipeline review request ${name} --event <event>`)
      }
      if (!step.events.includes(event)) {
        throw new Error(`phase '${step.phase}' 的 receipt event '${event}' 已不在当前 workflow 出口中；请重新 request`)
      }
      if (opts.event !== undefined && opts.event !== event) {
        throw new Error(`acknowledge 的 event '${opts.event}' 与待确认 receipt '${event}' 不一致`)
      }
      const delegatedAuthority = opts.delegated === true
        ? await readDelegatedReviewAuthority(deps.cwd, name)
        : null
      if (opts.delegated === true && delegatedAuthority === null) {
        throw new Error(`当前 Change '${name}' 没有有效的用户委托 review 授权；请等待正常确认，或先由用户明确授权后续自主执行`)
      }
      if (reviewGateApprovedFor(state, step.phase, event)) {
        acknowledged = {
          phase: step.phase,
          event,
          acknowledgedAt: scalar(state, 'review_acknowledged_at') || deps.clock(),
          changed: false,
          delegatedAuthority,
        }
        return
      }
      if (!reviewGatePendingFor(state, step.phase, event)) {
        throw new Error(`phase '${step.phase}' 尚未为 event '${event}' request review；先完成产物并运行 pipeline review request ${name} --event ${event}`)
      }
      const acknowledgedAt = deps.clock()
      await deps.store.writeUnderLock(dir, {
        ...state,
        fields: { ...state.fields, ...reviewGateApprovalPatch(acknowledgedAt) },
      }, { kind: 'set-many' })
      acknowledged = { phase: step.phase, event, acknowledgedAt, changed: true, delegatedAuthority }
    })
    if (!acknowledged) throw new Error('review acknowledgement 未产生 receipt')
    const markerOk = await clearMarker(deps)
    if (acknowledged.changed) {
      await recordHistory(deps, dir, {
        ts: acknowledged.acknowledgedAt,
        kind: 'tool',
        raw: acknowledged.delegatedAuthority === null
          ? `review:acknowledge phase=${acknowledged.phase} event=${acknowledged.event}`
          : `review:delegated-ack phase=${acknowledged.phase} event=${acknowledged.event} authority_issued_at=${acknowledged.delegatedAuthority.issuedAt}`,
      })
    }
    deps.io.out(
      `[REVIEW] ${name} phase=${acknowledged.phase} event=${acknowledged.event} ` +
      `${acknowledged.delegatedAuthority === null ? '已确认' : '已按用户委托的持续授权确认'}，可重发 transition`,
    )
    return markerOk ? 0 : 2
  } catch (error) {
    deps.io.err(`ERROR: ${errMsg(error)}`)
    return 1
  }
}
