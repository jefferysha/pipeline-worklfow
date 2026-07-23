import { createHash } from 'node:crypto'
import { validateObservationPage } from '@pipeline-lite/kernel'
import type {
  ObservationPage,
  ObserveActionKind,
  TriageResult,
  WorkflowRun,
} from '@pipeline-lite/kernel'

/**
 * A narrow host-owned request. Repository location, track, preset, loop/policy bindings, and
 * permissions belong to the injected repository adapter and cannot be supplied by triage output.
 */
export interface WorkflowRunCreateRequest {
  readonly schemaVersion: 1
  readonly kind: 'create-workflow-run'
  readonly idempotencyKey: string
  readonly source: {
    readonly sourceId: string
    readonly actionKind: ObserveActionKind
    readonly observationId: string
  }
  readonly actionIdentity: string
  readonly candidateId: string
  readonly changeName: string
  readonly routeId: string
  readonly workflowId: string
  readonly initialStep: string
}

export type WorkflowRunCreateIfAbsentResult =
  | { readonly status: 'created'; readonly run: WorkflowRun }
  | { readonly status: 'existing'; readonly run: WorkflowRun }

/**
 * Implementations must atomically linearize competing calls by idempotencyKey across materializer
 * calls (and processes, when the repository is shared). An equivalent committed request returns
 * `existing`; reuse of a key for a different request fails closed. A separate read followed by
 * `WorkflowRunRepository.initChange()` does not satisfy this contract because it races.
 */
export interface WorkflowRunCreateIfAbsentRepository {
  createIfAbsent(request: WorkflowRunCreateRequest): Promise<WorkflowRunCreateIfAbsentResult>
}

export interface WorkflowRunMaterialization {
  readonly request: WorkflowRunCreateRequest
  readonly outcome: WorkflowRunCreateIfAbsentResult
}

export interface WorkflowRunMaterializer {
  materialize(triageResult: unknown): Promise<readonly WorkflowRunMaterialization[]>
}

export interface WorkflowRunMaterializerDeps {
  readonly repository: WorkflowRunCreateIfAbsentRepository
}

export class WorkflowRunMaterializationError extends Error {
  readonly _tag = 'WorkflowRunMaterializationError' as const

  constructor(readonly issues: readonly string[]) {
    super(`WorkflowRun triage materialization rejected: ${issues.join('; ')}`)
    this.name = 'WorkflowRunMaterializationError'
  }
}

function isRecursivelyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null) return true
  if (seen.has(value)) return true
  try {
    if (!Object.isFrozen(value)) return false
    seen.add(value)
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !('value' in descriptor)) return false
      if (!isRecursivelyFrozen(descriptor.value, seen)) return false
    }
    return true
  } catch {
    return false
  }
}

function unexpectedOwnKeys(value: object, allowed: ReadonlySet<string>): string[] {
  return Reflect.ownKeys(value)
    .filter((key) => typeof key !== 'string' || !allowed.has(key))
    .map((key) => typeof key === 'symbol' ? key.toString() : key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const CHANGE_NAME_RE = /^[A-Za-z0-9_-]+$/

function requiredString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: string[],
  kind: 'text' | 'safe-id' | 'change-name' = 'text',
): string | null {
  const value = object[key]
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) {
    issues.push(`${path}.${key}: expected a non-empty string`)
    return null
  }
  if (kind === 'safe-id' && !SAFE_ID_RE.test(value)) {
    issues.push(`${path}.${key}: expected a safe opaque id`)
    return null
  }
  if (kind === 'change-name' && (!CHANGE_NAME_RE.test(value) || value.includes('..'))) {
    issues.push(`${path}.${key}: expected a safe change name`)
    return null
  }
  return value
}

function validateEnvelope(input: unknown): { readonly result: TriageResult; readonly page: ObservationPage } {
  const issues: string[] = []
  if (!isRecord(input)) {
    throw new WorkflowRunMaterializationError(['triageResult: expected an object'])
  }

  const extras = unexpectedOwnKeys(input, new Set(['schemaVersion', 'page', 'decisions', 'provider']))
  if (extras.length > 0) issues.push(`triageResult: unknown fields ${extras.join(', ')}`)
  if (input.schemaVersion !== 1) issues.push('triageResult.schemaVersion: expected literal 1')

  const pageValidation = validateObservationPage(input.page)
  if (!pageValidation.ok) issues.push(...pageValidation.errors.map((error) => `triageResult.${error}`))
  if (!Array.isArray(input.decisions)) issues.push('triageResult.decisions: expected an array')

  if (!isRecord(input.provider)) {
    issues.push('triageResult.provider: expected an object')
  } else {
    const providerExtras = unexpectedOwnKeys(input.provider, new Set(['kind', 'model', 'invocationId']))
    if (providerExtras.length > 0) {
      issues.push(`triageResult.provider: unknown fields ${providerExtras.join(', ')}`)
    }
    for (const key of ['kind', 'model', 'invocationId'] as const) {
      if (typeof input.provider[key] !== 'string' || input.provider[key].trim() === '') {
        issues.push(`triageResult.provider.${key}: expected a non-empty string`)
      }
    }
  }

  if (issues.length > 0 || !pageValidation.ok || !Array.isArray(input.decisions)) {
    throw new WorkflowRunMaterializationError(issues)
  }
  return { result: input as unknown as TriageResult, page: pageValidation.value }
}

function idempotencyKeyFor(
  source: WorkflowRunCreateRequest['source'],
  actionIdentity: string,
): string {
  const canonical = JSON.stringify([
    1,
    'create-workflow-run',
    source.sourceId,
    source.actionKind,
    source.observationId,
    actionIdentity,
  ])
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return `triage-workflow-run:v1:${digest}`
}

function sameCreateRequest(left: WorkflowRunCreateRequest, right: WorkflowRunCreateRequest): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.kind === right.kind
    && left.idempotencyKey === right.idempotencyKey
    && left.source.sourceId === right.source.sourceId
    && left.source.actionKind === right.source.actionKind
    && left.source.observationId === right.source.observationId
    && left.actionIdentity === right.actionIdentity
    && left.candidateId === right.candidateId
    && left.changeName === right.changeName
    && left.routeId === right.routeId
    && left.workflowId === right.workflowId
    && left.initialStep === right.initialStep
}

export function createWorkflowRunMaterializer(
  deps: WorkflowRunMaterializerDeps,
): WorkflowRunMaterializer {
  return {
    async materialize(triageResult) {
      if (!isRecursivelyFrozen(triageResult)) {
        throw new WorkflowRunMaterializationError([
          'triageResult: expected a recursively frozen canonical TriageResult',
        ])
      }
      const { result, page } = validateEnvelope(triageResult)
      const observations = new Map(
        page.observations.map((observation) => [observation.observationId, observation]),
      )
      const requestsByKey = new Map<string, WorkflowRunCreateRequest>()
      const requestByObservationId = new Map<string, WorkflowRunCreateRequest>()
      const decidedObservationIds = new Set<string>()
      const classificationByObservationId = new Map<string, 'high' | 'watch' | 'noise'>()
      const issues: string[] = []
      for (const [index, rawDecision] of (result.decisions as readonly unknown[]).entries()) {
        if (!isRecord(rawDecision)) {
          issues.push(`triageResult.decisions[${index}]: expected an object`)
          continue
        }
        const path = `triageResult.decisions[${index}]`
        const classification = rawDecision.classification
        if (classification !== 'high' && classification !== 'watch' && classification !== 'noise') {
          issues.push(`${path}.classification: expected high, watch, or noise`)
          continue
        }
        const allowedDecisionKeys = classification === 'high'
          ? new Set(['observationId', 'classification', 'rationale', 'routeId', 'candidate'])
          : new Set(['observationId', 'classification', 'rationale'])
        const decisionExtras = unexpectedOwnKeys(rawDecision, allowedDecisionKeys)
        if (decisionExtras.length > 0) {
          issues.push(`${path}: unknown fields ${decisionExtras.join(', ')}`)
          continue
        }
        if (typeof rawDecision.observationId !== 'string' || rawDecision.observationId.trim() === '') {
          issues.push(`${path}.observationId: expected a non-empty string`)
          continue
        }
        if (typeof rawDecision.rationale !== 'string' || rawDecision.rationale.trim() === '') {
          issues.push(`${path}.rationale: expected a non-empty string`)
          continue
        }
        const observation = observations.get(rawDecision.observationId)
        if (observation === undefined) {
          issues.push(`${path}.observationId: unknown host observation '${rawDecision.observationId}'`)
          continue
        }
        decidedObservationIds.add(observation.observationId)
        const previousClassification = classificationByObservationId.get(observation.observationId)
        if (previousClassification !== undefined && previousClassification !== classification) {
          issues.push(
            `${path}: conflicting classifications '${previousClassification}' and '${classification}' `
            + `for observation '${observation.observationId}'`,
          )
          continue
        }
        classificationByObservationId.set(observation.observationId, classification)
        if (classification !== 'high') continue

        const routeId = requiredString(rawDecision, 'routeId', path, issues, 'safe-id')
        if (!isRecord(rawDecision.candidate)) {
          issues.push(`${path}.candidate: expected a host-owned object`)
          continue
        }
        const candidate = rawDecision.candidate
        const candidateExtras = unexpectedOwnKeys(
          candidate,
          new Set(['candidateId', 'creationKey', 'changeName', 'route']),
        )
        if (!isRecord(candidate.route)) {
          issues.push(`${path}.candidate.route: expected a host-owned object`)
          continue
        }
        const route = candidate.route
        const routeExtras = unexpectedOwnKeys(
          route,
          new Set(['routeId', 'description', 'resolved']),
        )
        if (!isRecord(route.resolved)) {
          issues.push(`${path}.candidate.route.resolved: expected a host-owned object`)
          continue
        }
        const resolved = route.resolved
        const resolutionExtras = unexpectedOwnKeys(
          resolved,
          new Set(['workflowId', 'initialStep']),
        )
        if (candidateExtras.length > 0 || routeExtras.length > 0 || resolutionExtras.length > 0) {
          issues.push(
            `triageResult.decisions[${index}].candidate: unknown host-boundary fields `
            + [...candidateExtras, ...routeExtras, ...resolutionExtras].join(', '),
          )
          continue
        }
        const candidateId = requiredString(candidate, 'candidateId', `${path}.candidate`, issues, 'safe-id')
        const creationKey = requiredString(candidate, 'creationKey', `${path}.candidate`, issues, 'safe-id')
        const changeName = requiredString(candidate, 'changeName', `${path}.candidate`, issues, 'change-name')
        const candidateRouteId = requiredString(route, 'routeId', `${path}.candidate.route`, issues, 'safe-id')
        const description = requiredString(route, 'description', `${path}.candidate.route`, issues)
        const workflowId = requiredString(resolved, 'workflowId', `${path}.candidate.route.resolved`, issues, 'safe-id')
        const initialStep = requiredString(resolved, 'initialStep', `${path}.candidate.route.resolved`, issues, 'safe-id')
        if (
          routeId === null || candidateId === null || creationKey === null || changeName === null
          || candidateRouteId === null || description === null || workflowId === null || initialStep === null
        ) continue
        if (routeId !== candidateRouteId) {
          issues.push(
            `triageResult.decisions[${index}].routeId: does not resolve to the candidate's host-owned route`,
          )
          continue
        }
        const source = {
          sourceId: observation.sourceId,
          actionKind: observation.actionKind,
          observationId: observation.observationId,
        }
        const request: WorkflowRunCreateRequest = {
          schemaVersion: 1,
          kind: 'create-workflow-run',
          idempotencyKey: idempotencyKeyFor(source, creationKey),
          source,
          actionIdentity: creationKey,
          candidateId,
          changeName,
          routeId,
          workflowId,
          initialStep,
        }
        const existing = requestsByKey.get(request.idempotencyKey)
        if (existing !== undefined && !sameCreateRequest(existing, request)) {
          issues.push(
            `triageResult.decisions[${index}]: idempotency key '${request.idempotencyKey}' has conflicting requests`,
          )
          continue
        }
        const existingForObservation = requestByObservationId.get(observation.observationId)
        if (existingForObservation === undefined) {
          requestByObservationId.set(observation.observationId, request)
        } else if (!sameCreateRequest(existingForObservation, request)) {
          issues.push(
            `triageResult.decisions[${index}]: conflicting create actions for observation `
            + `'${observation.observationId}'`,
          )
          continue
        }
        if (existing === undefined) {
          requestsByKey.set(request.idempotencyKey, request)
        }
      }
      for (const observation of page.observations) {
        if (!decidedObservationIds.has(observation.observationId)) {
          issues.push(`triageResult.decisions: missing decision for observation '${observation.observationId}'`)
        }
      }
      if (issues.length > 0) throw new WorkflowRunMaterializationError(issues)

      const materializations: WorkflowRunMaterialization[] = []
      for (const request of requestsByKey.values()) {
        const outcome = await deps.repository.createIfAbsent(request)
        materializations.push({ request, outcome })
      }
      return materializations
    },
  }
}
