export const REVIEW_ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const REVIEW_CANDIDATE = /^(?:sha256:|workspace:sha256:)[0-9a-f]{64}$|^git:[0-9a-f]{40}(?:[0-9a-f]{24})?$/
const WORKFLOW_FINGERPRINT = /^[0-9a-f]{64}$/
const SCOPE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const LANE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/

export type ReviewAttemptResult = 'pass' | 'fail'

export interface ReviewAttemptIdentity {
  readonly projectRoot: string
  readonly changeDir: string
  readonly runId: string
  readonly workflowFingerprint: string
  readonly scope: string
}

export interface ReviewAttemptBeginInput extends ReviewAttemptIdentity {
  readonly candidateFingerprint: string
  readonly maxAttempts: number
  readonly requiredLanes: readonly string[]
}

export interface ReviewAttemptCompleteInput extends ReviewAttemptIdentity {
  readonly attemptId: string
  readonly result: ReviewAttemptResult
  readonly reportPath: string
}

export interface ReviewAttemptLaneInput extends ReviewAttemptIdentity {
  readonly attemptId: string
  readonly lane: string
  readonly result: ReviewAttemptResult
  readonly reportPath: string
}

export interface ReviewBudgetOverrideInput extends ReviewAttemptIdentity {
  readonly maxAttempts: number
  readonly defaultMaxAttempts: number
}

export interface ReviewLaneEvidence {
  readonly lane: string
  readonly result: ReviewAttemptResult
  readonly reportPath: string
  readonly reportDigest: string
  readonly recordedAt: string
}

export interface ReviewAttemptActive {
  readonly attemptId: string
  readonly sequence: number
  readonly candidateFingerprint: string
  readonly maxAttempts: number
  readonly startedAt: string
  readonly requiredLanes: readonly string[]
  readonly lanes: readonly ReviewLaneEvidence[]
}

export interface ReviewAttemptBeginResult extends ReviewAttemptActive {
  readonly used: number
  readonly resumed: boolean
}

export interface ReviewAttemptCompletion extends ReviewAttemptActive {
  readonly completedAt: string
  readonly result: ReviewAttemptResult
  readonly reportPath: string
  readonly reportDigest: string
}

export interface ReviewAttemptOverride {
  readonly maxAttempts: number
  readonly setAt: string
}

export interface ReviewAttemptScopeState {
  readonly scope: string
  readonly defaultMaxAttempts: number
  readonly override: ReviewAttemptOverride | null
  readonly used: number
  readonly active: ReviewAttemptActive | null
  readonly completed: readonly ReviewAttemptCompletion[]
}

export interface ReviewAttemptBudgetState {
  readonly version: 1
  readonly runId: string
  readonly workflowFingerprint: string
  readonly scopes: readonly ReviewAttemptScopeState[]
}

export interface ReviewAttemptBudgetSnapshot {
  readonly scope: string
  readonly defaultMaxAttempts: number
  readonly override: ReviewAttemptOverride | null
  readonly used: number
  readonly maxAttempts: number
  readonly active: ReviewAttemptActive | null
  readonly completed: readonly ReviewAttemptCompletion[]
  readonly lastCompleted: ReviewAttemptCompletion | null
}

export class ReviewAttemptBudgetError extends Error {
  readonly _tag = 'ReviewAttemptBudgetError'

  constructor(
    message: string,
    readonly code: string,
    readonly scope?: string,
    readonly used?: number,
    readonly maxAttempts?: number,
    readonly lastReport?: string,
  ) {
    super(message)
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && Number.isFinite(Date.parse(value))
}

function safeRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && !value.startsWith('/')
    && !value.split(/[\\/]/u).includes('..')
}

function decodeLane(value: unknown): ReviewLaneEvidence {
  const item = record(value)
  if (!item || !exactKeys(item, ['lane', 'result', 'reportPath', 'reportDigest', 'recordedAt'])
    || typeof item.lane !== 'string' || !LANE.test(item.lane)
    || (item.result !== 'pass' && item.result !== 'fail')
    || !safeRelativePath(item.reportPath)
    || typeof item.reportDigest !== 'string' || !DIGEST.test(item.reportDigest)
    || !timestamp(item.recordedAt)) {
    throw new ReviewAttemptBudgetError('Review lane evidence 形状非法', 'review-budget-corrupt')
  }
  return {
    lane: item.lane,
    result: item.result,
    reportPath: item.reportPath,
    reportDigest: item.reportDigest,
    recordedAt: item.recordedAt,
  }
}

function decodeAttemptBase(value: Record<string, unknown>, sequence: number): ReviewAttemptActive {
  if (typeof value.attemptId !== 'string' || !REVIEW_ATTEMPT_ID.test(value.attemptId)
    || value.sequence !== sequence
    || typeof value.candidateFingerprint !== 'string' || !REVIEW_CANDIDATE.test(value.candidateFingerprint)
    || typeof value.maxAttempts !== 'number' || !Number.isInteger(value.maxAttempts)
    || value.maxAttempts < 1 || value.maxAttempts > 20
    || !timestamp(value.startedAt)
    || !Array.isArray(value.requiredLanes) || !Array.isArray(value.lanes)) {
    throw new ReviewAttemptBudgetError('Review attempt identity 形状非法', 'review-budget-corrupt')
  }
  const requiredLanes = normalizeRequiredLanes(value.requiredLanes)
  const lanes = value.lanes.map(decodeLane)
  if (new Set(lanes.map((lane) => lane.lane)).size !== lanes.length
    || lanes.some((lane) => !requiredLanes.includes(lane.lane))) {
    throw new ReviewAttemptBudgetError('Review lane evidence 与 frozen lanes 不一致', 'review-budget-corrupt')
  }
  return {
    attemptId: value.attemptId,
    sequence,
    candidateFingerprint: value.candidateFingerprint,
    maxAttempts: value.maxAttempts,
    startedAt: value.startedAt,
    requiredLanes,
    lanes,
  }
}

function decodeActive(value: unknown, sequence: number): ReviewAttemptActive | null {
  if (value === null) return null
  const item = record(value)
  if (!item || !exactKeys(item, [
    'attemptId', 'sequence', 'candidateFingerprint', 'maxAttempts', 'startedAt', 'requiredLanes', 'lanes',
  ])) {
    throw new ReviewAttemptBudgetError('Review active attempt 形状非法', 'review-budget-corrupt')
  }
  return decodeAttemptBase(item, sequence)
}

function decodeCompletion(value: unknown, sequence: number): ReviewAttemptCompletion {
  const item = record(value)
  if (!item || !exactKeys(item, [
    'attemptId', 'sequence', 'candidateFingerprint', 'maxAttempts', 'startedAt', 'requiredLanes', 'lanes',
    'completedAt', 'result', 'reportPath', 'reportDigest',
  ]) || !timestamp(item.completedAt)
    || (item.result !== 'pass' && item.result !== 'fail')
    || !safeRelativePath(item.reportPath)
    || typeof item.reportDigest !== 'string' || !DIGEST.test(item.reportDigest)) {
    throw new ReviewAttemptBudgetError('Review completed attempt 形状非法', 'review-budget-corrupt')
  }
  return {
    ...decodeAttemptBase(item, sequence),
    completedAt: item.completedAt,
    result: item.result,
    reportPath: item.reportPath,
    reportDigest: item.reportDigest,
  }
}

function decodeScope(value: unknown): ReviewAttemptScopeState {
  const item = record(value)
  if (!item || !exactKeys(item, ['scope', 'defaultMaxAttempts', 'override', 'used', 'active', 'completed'])
    || typeof item.scope !== 'string' || !SCOPE.test(item.scope)
    || typeof item.defaultMaxAttempts !== 'number' || !Number.isInteger(item.defaultMaxAttempts)
    || item.defaultMaxAttempts < 1 || item.defaultMaxAttempts > 20
    || typeof item.used !== 'number' || !Number.isInteger(item.used) || item.used < 0 || item.used > 20
    || !Array.isArray(item.completed)) {
    throw new ReviewAttemptBudgetError('Review scope state 形状非法', 'review-budget-corrupt')
  }
  let override: ReviewAttemptOverride | null = null
  if (item.override !== null) {
    const candidate = record(item.override)
    if (!candidate || !exactKeys(candidate, ['maxAttempts', 'setAt'])
      || typeof candidate.maxAttempts !== 'number' || !Number.isInteger(candidate.maxAttempts)
      || candidate.maxAttempts < 1 || candidate.maxAttempts > 20 || !timestamp(candidate.setAt)) {
      throw new ReviewAttemptBudgetError('Review budget override 形状非法', 'review-budget-corrupt')
    }
    override = { maxAttempts: candidate.maxAttempts, setAt: candidate.setAt }
  }
  const completed = item.completed.map((entry, index) => decodeCompletion(entry, index + 1))
  const active = decodeActive(item.active, completed.length + 1)
  if (item.used !== completed.length + (active === null ? 0 : 1)) {
    throw new ReviewAttemptBudgetError('Review used count 与 attempt 历史不一致', 'review-budget-corrupt')
  }
  return {
    scope: item.scope,
    defaultMaxAttempts: item.defaultMaxAttempts,
    override,
    used: item.used,
    active,
    completed,
  }
}

export function decodeReviewAttemptBudgetState(value: unknown): ReviewAttemptBudgetState {
  const item = record(value)
  if (!item || !exactKeys(item, ['version', 'runId', 'workflowFingerprint', 'scopes'])
    || item.version !== 1 || typeof item.runId !== 'string' || item.runId === ''
    || typeof item.workflowFingerprint !== 'string' || !WORKFLOW_FINGERPRINT.test(item.workflowFingerprint)
    || !Array.isArray(item.scopes)) {
    throw new ReviewAttemptBudgetError('Review attempt budget state 形状非法', 'review-budget-corrupt')
  }
  const scopes = item.scopes.map(decodeScope)
  if (new Set(scopes.map((scope) => scope.scope)).size !== scopes.length) {
    throw new ReviewAttemptBudgetError('Review scope 重复', 'review-budget-corrupt')
  }
  return { version: 1, runId: item.runId, workflowFingerprint: item.workflowFingerprint, scopes }
}

export function boundedReviewMax(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new ReviewAttemptBudgetError(`${field} 必须是 1..20 的整数`, 'review-budget-invalid')
  }
  return value
}

export function validateReviewIdentity(identity: ReviewAttemptIdentity): void {
  if (identity.runId === '') throw new ReviewAttemptBudgetError('run identity 不能为空', 'review-budget-identity')
  if (!WORKFLOW_FINGERPRINT.test(identity.workflowFingerprint)) {
    throw new ReviewAttemptBudgetError('workflow identity 必须是 SHA-256 fingerprint', 'review-budget-identity')
  }
  if (!SCOPE.test(identity.scope)) {
    throw new ReviewAttemptBudgetError(`Review scope 非法: '${identity.scope}'`, 'review-budget-invalid')
  }
}

export function normalizeRequiredLanes(value: readonly unknown[]): readonly string[] {
  if (value.length === 0) {
    throw new ReviewAttemptBudgetError('Review attempt 至少需要一个 frozen lane', 'review-budget-invalid')
  }
  const lanes = value.map((lane) => {
    if (typeof lane !== 'string' || !LANE.test(lane)) {
      throw new ReviewAttemptBudgetError(`Review lane 非法: ${JSON.stringify(lane)}`, 'review-budget-invalid')
    }
    return lane
  })
  if (new Set(lanes).size !== lanes.length) {
    throw new ReviewAttemptBudgetError('Review required lanes 不得重复', 'review-budget-invalid')
  }
  return lanes
}
