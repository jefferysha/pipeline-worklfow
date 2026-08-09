import {
  createReviewAttemptBudgetStore,
  ReviewAttemptBudgetError,
  type PipelineState,
  type ReviewAttemptBudgetSnapshot,
} from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { effectiveWorkflowForState } from './effective-workflow.js'
import { frozenReviewCandidate, normalizeReviewCandidate } from './review-candidate.js'

interface ReviewBudgetContext {
  readonly change: string
  readonly projectRoot: string
  readonly changeDir: string
  readonly runId: string
  readonly workflowFingerprint: string
  readonly scope: string
  readonly defaultMaxAttempts: number
  readonly requiredLanes: readonly string[]
  readonly candidateFingerprint: string
}

interface ReviewBudgetView {
  readonly change: string
  readonly scope: string
  readonly used: number
  readonly maxAttempts: number
  readonly requiredLanes: readonly string[]
  readonly defaultMaxAttempts: number
  readonly override: ReviewAttemptBudgetSnapshot['override']
  readonly active: ReviewAttemptBudgetSnapshot['active']
  readonly lastCompleted: ReviewAttemptBudgetSnapshot['lastCompleted']
}

export interface ReviewAttemptOpts {
  readonly candidate?: string
  readonly attemptId?: string
  readonly lane?: string
  readonly result?: string
  readonly report?: string
  readonly json?: boolean
}

export interface ReviewBudgetOpts {
  readonly maxAttempts?: string
  readonly json?: boolean
}

function scalar(state: PipelineState, field: keyof PipelineState['fields']): string {
  const value = state.fields[field]
  return Array.isArray(value) ? value.join(',') : (value ?? '')
}

async function context(deps: CliDeps, name: string | undefined): Promise<ReviewBudgetContext> {
  if (!name || !isValidChangeName(name)) {
    throw new Error(`change-name 非法: '${name ?? ''}' (仅允许 a-z A-Z 0-9 - _)`)
  }
  const dir = changeDir(deps.cwd, name)
  const state = await deps.store.read(dir)
  const plan = effectiveWorkflowForState(deps, state)
  if (plan === null) throw new Error(`workflow '${scalar(state, 'workflow')}' 未找到或不可编译`)
  const runId = state.runMetadata?.runId
  if (runId === undefined || runId === '') {
    throw new Error('当前 Pipeline 缺少 durable run identity；请先运行受支持的状态迁移完成升级')
  }
  const scope = scalar(state, 'phase')
  if (scope === '') throw new Error('当前 Pipeline step 为空，无法绑定 Review scope')
  const requiredLanes = plan.capabilities.review.laneScopes
    .find((entry) => entry.stepId === scope)?.lanes ?? []
  const candidateFingerprint = await frozenReviewCandidate(deps, name, state, plan, scope)
  return {
    change: name,
    projectRoot: deps.cwd,
    changeDir: dir,
    runId,
    workflowFingerprint: plan.workflowFingerprint,
    scope,
    defaultMaxAttempts: plan.reviewBudget.max_attempts,
    requiredLanes,
    candidateFingerprint,
  }
}

function renderJson(deps: CliDeps, value: object): void {
  deps.io.out(JSON.stringify(value))
}

function renderSnapshot(
  ctx: ReviewBudgetContext,
  stored: ReviewAttemptBudgetSnapshot | null,
): ReviewBudgetView {
  if (stored === null) {
    return {
      change: ctx.change,
      scope: ctx.scope,
      used: 0,
      maxAttempts: ctx.defaultMaxAttempts,
      requiredLanes: ctx.requiredLanes,
      defaultMaxAttempts: ctx.defaultMaxAttempts,
      override: null,
      active: null,
      lastCompleted: null,
    }
  }
  return {
    change: ctx.change,
    scope: ctx.scope,
    used: stored.used,
    maxAttempts: stored.maxAttempts,
    requiredLanes: stored.active?.requiredLanes ?? ctx.requiredLanes,
    defaultMaxAttempts: stored.defaultMaxAttempts,
    override: stored.override,
    active: stored.active,
    lastCompleted: stored.lastCompleted,
  }
}

function reportError(deps: CliDeps, error: unknown): number {
  if (error instanceof ReviewAttemptBudgetError && error.code === 'review-budget-exhausted') {
    deps.io.err(
      `ERROR: scope=${error.scope ?? 'unknown'} used=${error.used ?? '?'} max=${error.maxAttempts ?? '?'}; `
      + `remaining_blockers=${error.lastReport === undefined ? '无可证明报告' : `见 ${error.lastReport}`}`,
    )
    return 2
  }
  deps.io.err(`ERROR: ${errMsg(error)}`)
  return 1
}

export async function cmdReviewAttempt(
  deps: CliDeps,
  sub: string,
  name: string | undefined,
  opts: ReviewAttemptOpts,
): Promise<number> {
  if (sub !== 'begin' && sub !== 'lane' && sub !== 'complete') {
    deps.io.err('ERROR: 用法：tenon review-attempt begin|lane|complete <change> [options]')
    return 1
  }
  try {
    const ctx = await context(deps, name)
    const store = createReviewAttemptBudgetStore({ clock: deps.clock })
    if (sub === 'begin') {
      if (opts.candidate === undefined || opts.candidate === '') {
        throw new Error('review-attempt begin 要求 --candidate <fingerprint>')
      }
      const candidate = normalizeReviewCandidate(opts.candidate)
      if (candidate === undefined) throw new Error('review-attempt begin 的 --candidate 不是 canonical review candidate')
      if (candidate !== ctx.candidateFingerprint) {
        throw new Error(
          `Review candidate 与当前 frozen input 不一致：expected=${ctx.candidateFingerprint} actual=${opts.candidate}`,
        )
      }
      const result = await store.begin({
        ...ctx,
        candidateFingerprint: candidate,
        maxAttempts: ctx.defaultMaxAttempts,
        requiredLanes: ctx.requiredLanes,
      })
      const output = { change: ctx.change, scope: ctx.scope, ...result }
      if (opts.json === true) renderJson(deps, output)
      else deps.io.out(
        `[REVIEW-ATTEMPT] ${ctx.change} scope=${ctx.scope} used=${result.used}/${result.maxAttempts} `
        + `attempt=${result.attemptId}${result.resumed ? ' resumed=true' : ''}`,
      )
      return 0
    }
    if (sub === 'lane') {
      if (opts.attemptId === undefined || opts.lane === undefined
        || opts.result === undefined || opts.report === undefined) {
        throw new Error('review-attempt lane 要求 --attempt-id、--lane、--result pass|fail 与 --report')
      }
      if (opts.result !== 'pass' && opts.result !== 'fail') {
        throw new Error(`--result 只允许 pass|fail（实际 '${opts.result}'）`)
      }
      const result = await store.recordLane({
        ...ctx,
        attemptId: opts.attemptId,
        lane: opts.lane,
        result: opts.result,
        reportPath: opts.report,
      })
      const output = { change: ctx.change, scope: ctx.scope, attemptId: opts.attemptId, ...result }
      if (opts.json === true) renderJson(deps, output)
      else deps.io.out(
        `[REVIEW-LANE] ${ctx.change} scope=${ctx.scope} attempt=${opts.attemptId} `
        + `lane=${result.lane} result=${result.result} report=${result.reportPath}`,
      )
      return 0
    }
    if (opts.attemptId === undefined || opts.result === undefined || opts.report === undefined) {
      throw new Error('review-attempt complete 要求 --attempt-id、--result pass|fail 与 --report')
    }
    if (opts.result !== 'pass' && opts.result !== 'fail') {
      throw new Error(`--result 只允许 pass|fail（实际 '${opts.result}'）`)
    }
    const result = await store.complete({
      ...ctx,
      attemptId: opts.attemptId,
      result: opts.result,
      reportPath: opts.report,
    })
    const output = { change: ctx.change, scope: ctx.scope, ...result }
    if (opts.json === true) renderJson(deps, output)
    else deps.io.out(
      `[REVIEW-ATTEMPT] ${ctx.change} scope=${ctx.scope} attempt=${result.attemptId} `
      + `result=${result.result} report=${result.reportPath} digest=${result.reportDigest}`,
    )
    return 0
  } catch (error) {
    return reportError(deps, error)
  }
}

export async function cmdReviewBudget(
  deps: CliDeps,
  sub: string,
  name: string | undefined,
  opts: ReviewBudgetOpts,
): Promise<number> {
  if (sub !== 'show' && sub !== 'set') {
    deps.io.err('ERROR: 用法：tenon review-budget show <change> | set <change> --max-attempts <1..20>')
    return 1
  }
  try {
    const ctx = await context(deps, name)
    const store = createReviewAttemptBudgetStore({ clock: deps.clock })
    if (sub === 'show') {
      const output = renderSnapshot(ctx, await store.inspect(ctx))
      if (opts.json === true) renderJson(deps, output)
      else deps.io.out(`[REVIEW-BUDGET] ${ctx.change} scope=${ctx.scope} used=${output.used}/${output.maxAttempts}`)
      return 0
    }
    if (opts.maxAttempts === undefined || !/^\d+$/u.test(opts.maxAttempts)) {
      throw new Error('review-budget set 要求 --max-attempts <1..20>')
    }
    const stored = await store.setOverride({
      ...ctx,
      maxAttempts: Number(opts.maxAttempts),
      defaultMaxAttempts: ctx.defaultMaxAttempts,
    })
    const output = renderSnapshot(ctx, stored)
    if (opts.json === true) renderJson(deps, output)
    else deps.io.out(
      `[REVIEW-BUDGET] ${ctx.change} scope=${ctx.scope} used=${stored.used}/${stored.maxAttempts} override=true`,
    )
    return 0
  } catch (error) {
    return reportError(deps, error)
  }
}
