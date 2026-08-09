import { randomUUID } from 'node:crypto'
import { withLock } from './lock.js'
import {
  publishImmutableReviewReport,
  readContainedReviewReport,
  readReviewAttemptState,
  writeReviewAttemptState,
} from './review-attempt-budget-io.js'
import {
  REVIEW_ATTEMPT_ID,
  REVIEW_CANDIDATE,
  ReviewAttemptBudgetError,
  boundedReviewMax,
  normalizeRequiredLanes,
  validateReviewIdentity,
  type ReviewAttemptActive,
  type ReviewAttemptBeginInput,
  type ReviewAttemptBeginResult,
  type ReviewAttemptBudgetSnapshot,
  type ReviewAttemptBudgetState,
  type ReviewAttemptCompleteInput,
  type ReviewAttemptCompletion,
  type ReviewAttemptIdentity,
  type ReviewAttemptLaneInput,
  type ReviewBudgetOverrideInput,
  type ReviewLaneEvidence,
  type ReviewAttemptResult,
  type ReviewAttemptScopeState,
} from './review-attempt-budget-model.js'

export { ReviewAttemptBudgetError } from './review-attempt-budget-model.js'
export type {
  ReviewAttemptBeginInput,
  ReviewAttemptBeginResult,
  ReviewAttemptBudgetSnapshot,
  ReviewAttemptCompleteInput,
  ReviewAttemptCompletion,
  ReviewAttemptIdentity,
  ReviewAttemptLaneInput,
  ReviewAttemptResult,
  ReviewBudgetOverrideInput,
  ReviewLaneEvidence,
} from './review-attempt-budget-model.js'

export interface ReviewAttemptBudgetStoreOptions {
  readonly clock?: () => string
  readonly attemptId?: () => string
}

export interface ReviewAttemptBudgetStore {
  begin(input: ReviewAttemptBeginInput): Promise<ReviewAttemptBeginResult>
  recordLane(input: ReviewAttemptLaneInput): Promise<ReviewLaneEvidence>
  complete(input: ReviewAttemptCompleteInput): Promise<ReviewAttemptCompletion>
  setOverride(input: ReviewBudgetOverrideInput): Promise<ReviewAttemptBudgetSnapshot>
  inspect(identity: ReviewAttemptIdentity): Promise<ReviewAttemptBudgetSnapshot | null>
}

function assertStateIdentity(state: ReviewAttemptBudgetState, identity: ReviewAttemptIdentity): void {
  if (state.runId !== identity.runId) {
    throw new ReviewAttemptBudgetError('Review budget run identity mismatch', 'review-budget-identity')
  }
  if (state.workflowFingerprint !== identity.workflowFingerprint) {
    throw new ReviewAttemptBudgetError('Review budget workflow identity mismatch', 'review-budget-identity')
  }
}

function effectiveMax(scope: ReviewAttemptScopeState): number {
  return scope.override?.maxAttempts ?? scope.defaultMaxAttempts
}

function snapshot(scope: ReviewAttemptScopeState): ReviewAttemptBudgetSnapshot {
  return {
    ...scope,
    maxAttempts: effectiveMax(scope),
    active: scope.active === null ? null : structuredClone(scope.active),
    completed: structuredClone(scope.completed),
    lastCompleted: scope.completed.at(-1) ?? null,
  }
}

function newState(identity: ReviewAttemptIdentity): ReviewAttemptBudgetState {
  return { version: 1, runId: identity.runId, workflowFingerprint: identity.workflowFingerprint, scopes: [] }
}

function getScope(state: ReviewAttemptBudgetState, scope: string): ReviewAttemptScopeState | undefined {
  return state.scopes.find((entry) => entry.scope === scope)
}

function replaceScope(state: ReviewAttemptBudgetState, next: ReviewAttemptScopeState): ReviewAttemptBudgetState {
  const scopes = state.scopes.filter((entry) => entry.scope !== next.scope).concat(next)
    .sort((left, right) => left.scope.localeCompare(right.scope))
  return { ...state, scopes }
}

function sameLanes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((lane, index) => lane === right[index])
}

function orderedEvidence(
  requiredLanes: readonly string[],
  lanes: readonly ReviewLaneEvidence[],
): readonly ReviewLaneEvidence[] {
  return requiredLanes.flatMap((required) => lanes.filter((lane) => lane.lane === required))
}

export function createReviewAttemptBudgetStore(
  options: ReviewAttemptBudgetStoreOptions = {},
): ReviewAttemptBudgetStore {
  const clock = options.clock ?? (() => new Date().toISOString())
  const attemptId = options.attemptId ?? randomUUID
  return {
    async begin(input) {
      validateReviewIdentity(input)
      const declaredMax = boundedReviewMax(input.maxAttempts, 'maxAttempts')
      const requiredLanes = normalizeRequiredLanes(input.requiredLanes)
      if (!REVIEW_CANDIDATE.test(input.candidateFingerprint)) {
        throw new ReviewAttemptBudgetError('candidate fingerprint 形状非法', 'review-budget-invalid')
      }
      return withLock(input.changeDir, async () => {
        const state = await readReviewAttemptState(input.changeDir) ?? newState(input)
        assertStateIdentity(state, input)
        const existing = getScope(state, input.scope)
        const scope = existing ?? {
          scope: input.scope,
          defaultMaxAttempts: declaredMax,
          override: null,
          used: 0,
          active: null,
          completed: [],
        }
        if (scope.defaultMaxAttempts !== declaredMax) {
          throw new ReviewAttemptBudgetError('frozen Review default budget changed', 'review-budget-identity')
        }
        const maxAttempts = effectiveMax(scope)
        if (scope.active !== null) {
          if (scope.active.candidateFingerprint !== input.candidateFingerprint
            || !sameLanes(scope.active.requiredLanes, requiredLanes)) {
            throw new ReviewAttemptBudgetError(
              `scope '${input.scope}' 已有进行中的 Review attempt，candidate 或 frozen lanes 不一致`,
              'review-attempt-active', input.scope, scope.used, maxAttempts,
            )
          }
          return { ...scope.active, used: scope.used, maxAttempts, resumed: true }
        }
        if (scope.used >= maxAttempts) {
          const lastReport = scope.completed.at(-1)?.reportPath
          throw new ReviewAttemptBudgetError(
            `Review budget exhausted: scope=${input.scope} used=${scope.used} max=${maxAttempts}; `
              + `remaining_blockers=${lastReport === undefined ? '无可证明报告' : `见 ${lastReport}`}`,
            'review-budget-exhausted', input.scope, scope.used, maxAttempts, lastReport,
          )
        }
        const id = attemptId()
        if (!REVIEW_ATTEMPT_ID.test(id)) {
          throw new ReviewAttemptBudgetError('attempt id generator 返回非法 UUID', 'review-budget-invalid')
        }
        const active: ReviewAttemptActive = {
          attemptId: id,
          sequence: scope.used + 1,
          candidateFingerprint: input.candidateFingerprint,
          maxAttempts,
          startedAt: clock(),
          requiredLanes,
          lanes: [],
        }
        const next = { ...scope, used: scope.used + 1, active }
        await writeReviewAttemptState(input.changeDir, replaceScope(state, next))
        return { ...active, used: next.used, maxAttempts, resumed: false }
      })
    },

    async recordLane(input) {
      validateReviewIdentity(input)
      if (!REVIEW_ATTEMPT_ID.test(input.attemptId)
        || (input.result !== 'pass' && input.result !== 'fail')) {
        throw new ReviewAttemptBudgetError('Review lane 参数非法', 'review-budget-invalid')
      }
      return withLock(input.changeDir, async () => {
        const state = await readReviewAttemptState(input.changeDir)
        if (state === null) throw new ReviewAttemptBudgetError('Review attempt state 不存在', 'review-attempt-missing')
        assertStateIdentity(state, input)
        const scope = getScope(state, input.scope)
        if (scope?.active?.attemptId !== input.attemptId) {
          throw new ReviewAttemptBudgetError('active Review attempt identity 不匹配', 'review-attempt-missing')
        }
        if (!scope.active.requiredLanes.includes(input.lane)) {
          throw new ReviewAttemptBudgetError(`lane '${input.lane}' 不属于 frozen required lanes`, 'review-lane-invalid')
        }
        const prior = scope.active.lanes.find((entry) => entry.lane === input.lane)
        if (prior !== undefined && prior.result !== input.result) {
          throw new ReviewAttemptBudgetError(`lane '${input.lane}' result 不可改写`, 'review-lane-completed')
        }
        const bytes = await readContainedReviewReport(input.projectRoot, input.reportPath)
        const published = await publishImmutableReviewReport(
          input,
          `${input.attemptId}.${input.lane}`,
          bytes,
        )
        if (prior !== undefined) {
          if (prior.reportDigest !== published.digest) {
            throw new ReviewAttemptBudgetError(`lane '${input.lane}' evidence 不可改写`, 'review-lane-completed')
          }
          return prior
        }
        const evidence: ReviewLaneEvidence = {
          lane: input.lane,
          result: input.result,
          reportPath: published.path,
          reportDigest: published.digest,
          recordedAt: clock(),
        }
        const active = {
          ...scope.active,
          lanes: orderedEvidence(scope.active.requiredLanes, [...scope.active.lanes, evidence]),
        }
        await writeReviewAttemptState(input.changeDir, replaceScope(state, { ...scope, active }))
        return evidence
      })
    },

    async complete(input) {
      validateReviewIdentity(input)
      if (!REVIEW_ATTEMPT_ID.test(input.attemptId) || (input.result !== 'pass' && input.result !== 'fail')) {
        throw new ReviewAttemptBudgetError('Review complete 参数非法', 'review-budget-invalid')
      }
      return withLock(input.changeDir, async () => {
        const state = await readReviewAttemptState(input.changeDir)
        if (state === null) throw new ReviewAttemptBudgetError('Review attempt state 不存在', 'review-attempt-missing')
        assertStateIdentity(state, input)
        const scope = getScope(state, input.scope)
        if (scope === undefined) throw new ReviewAttemptBudgetError('Review scope 不存在', 'review-attempt-missing')
        const prior = scope.completed.find((entry) => entry.attemptId === input.attemptId)
        if (prior !== undefined) {
          if (prior.result !== input.result) {
            throw new ReviewAttemptBudgetError('completed Review result 不可改写', 'review-attempt-completed')
          }
          return prior
        }
        if (scope.active?.attemptId !== input.attemptId) {
          throw new ReviewAttemptBudgetError('active Review attempt identity 不匹配', 'review-attempt-missing')
        }
        const missing = scope.active.requiredLanes.filter(
          (lane) => !scope.active?.lanes.some((evidence) => evidence.lane === lane),
        )
        if (missing.length > 0) {
          throw new ReviewAttemptBudgetError(`Review required lanes 缺失: ${missing.join(', ')}`, 'review-lane-missing')
        }
        const derivedResult: ReviewAttemptResult = scope.active.lanes.every((lane) => lane.result === 'pass')
          ? 'pass'
          : 'fail'
        if (input.result !== derivedResult) {
          throw new ReviewAttemptBudgetError(
            `aggregate result=${input.result} 与 lane result=${derivedResult} 不一致`,
            'review-result-mismatch',
          )
        }
        const bytes = await readContainedReviewReport(input.projectRoot, input.reportPath)
        const aggregateHeader = Buffer.from(`${JSON.stringify({
          version: 1,
          attemptId: scope.active.attemptId,
          candidateFingerprint: scope.active.candidateFingerprint,
          requiredLanes: scope.active.requiredLanes,
          lanes: scope.active.lanes,
          result: derivedResult,
          sourceReport: input.reportPath,
        })}\n`, 'utf8')
        const published = await publishImmutableReviewReport(
          input,
          `${input.attemptId}.aggregate`,
          Buffer.concat([aggregateHeader, bytes]),
        )
        const completion: ReviewAttemptCompletion = {
          ...scope.active,
          completedAt: clock(),
          result: derivedResult,
          reportPath: published.path,
          reportDigest: published.digest,
        }
        const next = { ...scope, active: null, completed: [...scope.completed, completion] }
        await writeReviewAttemptState(input.changeDir, replaceScope(state, next))
        return completion
      })
    },

    async setOverride(input) {
      validateReviewIdentity(input)
      const maxAttempts = boundedReviewMax(input.maxAttempts, 'maxAttempts')
      const defaultMaxAttempts = boundedReviewMax(input.defaultMaxAttempts, 'defaultMaxAttempts')
      return withLock(input.changeDir, async () => {
        const state = await readReviewAttemptState(input.changeDir) ?? newState(input)
        assertStateIdentity(state, input)
        const current = getScope(state, input.scope) ?? {
          scope: input.scope,
          defaultMaxAttempts,
          override: null,
          used: 0,
          active: null,
          completed: [],
        }
        if (current.defaultMaxAttempts !== defaultMaxAttempts) {
          throw new ReviewAttemptBudgetError('frozen Review default budget changed', 'review-budget-identity')
        }
        if (current.active !== null) {
          throw new ReviewAttemptBudgetError('active Review attempt 存在时不得改写 budget', 'review-attempt-active')
        }
        if (maxAttempts < current.used) {
          throw new ReviewAttemptBudgetError(
            `Review budget 不能低于已用次数 used=${current.used}`,
            'review-budget-invalid', input.scope, current.used, maxAttempts,
          )
        }
        const next = { ...current, override: { maxAttempts, setAt: clock() } }
        await writeReviewAttemptState(input.changeDir, replaceScope(state, next))
        return snapshot(next)
      })
    },

    async inspect(identity) {
      validateReviewIdentity(identity)
      return withLock(identity.changeDir, async () => {
        const state = await readReviewAttemptState(identity.changeDir)
        if (state === null) return null
        assertStateIdentity(state, identity)
        const scope = getScope(state, identity.scope)
        return scope === undefined ? null : snapshot(scope)
      })
    },
  }
}
