import {
  OBSERVE_ACTION_KINDS,
  TRIAGE_SCHEMA_VERSION,
  type HostTriageCanonicalizationContext,
  type Observation,
  type ObservationPage,
  type ObserveAction,
  type ProviderTriageClassification,
  type ProviderTriageDecision,
  type SourceCheckpoint,
  type TriageCandidateIdentity,
  type TriageDecision,
  type TriageProviderProvenance,
  type TriageResult,
  type TriageRoute,
  type TriageValidation,
} from './types.js'

type Obj = Record<string, unknown>

const ACTION_KIND_SET: ReadonlySet<string> = new Set(OBSERVE_ACTION_KINDS)
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const CHANGE_NAME_RE = /^[A-Za-z0-9_-]+$/
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function safeErrorText(value: unknown): string {
  try {
    if (value instanceof Error && value.message !== '') return value.message
  } catch {
    // Fall through to guarded string coercion.
  }
  try {
    return String(value)
  } catch {
    return '<unreadable thrown value>'
  }
}

function fail<T>(errors: string[]): TriageValidation<T> {
  return Object.freeze({ ok: false, errors: Object.freeze([...errors]) })
}

function pass<T>(value: T): TriageValidation<T> {
  return Object.freeze({ ok: true, value })
}

/** Read every allowed own field at most once; never execute getters attached to unknown fields. */
function snapshotObject(
  input: unknown,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
): Obj | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    errors.push(`${path}: expected object, got ${typeName(input)}`)
    return null
  }

  const output: Obj = Object.create(null) as Obj
  const keys = Reflect.ownKeys(input)
  for (const key of keys) {
    if (typeof key !== 'string') {
      errors.push(`${path}: unknown symbol key is forbidden`)
      continue
    }
    if (!allowed.has(key)) {
      const privilege = /(?:path|command|argv|cwd|provider|candidate|creation|change|resolved)/i.test(key)
        ? ' (field belongs to the host trust boundary)'
        : ''
      errors.push(`${path}: unknown key '${key}'${privilege}`)
      continue
    }
    output[key] = (input as Obj)[key]
  }
  return output
}

/** Snapshot array length and every indexed value once, rejecting extra named/symbol properties. */
function snapshotArray(input: unknown, path: string, errors: string[]): unknown[] | null {
  if (!Array.isArray(input)) {
    errors.push(`${path}: expected array, got ${typeName(input)}`)
    return null
  }
  const length = input.length
  if (!Number.isSafeInteger(length) || length < 0) {
    errors.push(`${path}: invalid array length`)
    return null
  }
  const keys = Reflect.ownKeys(input)
  for (const key of keys) {
    if (typeof key !== 'string') {
      errors.push(`${path}: unknown symbol key is forbidden`)
      continue
    }
    if (key === 'length') continue
    if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= length) {
      errors.push(`${path}: unknown array key '${key}'`)
    }
  }
  const output = new Array<unknown>(length)
  for (let index = 0; index < length; index += 1) output[index] = input[index]
  return output
}

function own(snapshot: Obj, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(snapshot, key)
}

function literal(snapshot: Obj, key: string, expected: unknown, path: string, errors: string[]): boolean {
  if (!own(snapshot, key)) {
    errors.push(`${path}.${key}: missing required literal ${JSON.stringify(expected)}`)
    return false
  }
  if (snapshot[key] !== expected) {
    errors.push(`${path}.${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(snapshot[key])}`)
    return false
  }
  return true
}

function stringValue(
  snapshot: Obj,
  key: string,
  path: string,
  errors: string[],
  options: { allowEmpty?: boolean; safeId?: boolean; changeName?: boolean } = {},
): string | null {
  if (!own(snapshot, key)) {
    errors.push(`${path}.${key}: missing required string`)
    return null
  }
  const value = snapshot[key]
  if (typeof value !== 'string') {
    errors.push(`${path}.${key}: expected string, got ${typeName(value)}`)
    return null
  }
  if (!options.allowEmpty && value.trim() === '') {
    errors.push(`${path}.${key}: must be non-empty`)
    return null
  }
  if (value.includes('\0')) {
    errors.push(`${path}.${key}: NUL is forbidden`)
    return null
  }
  if (options.safeId && !SAFE_ID_RE.test(value)) {
    errors.push(`${path}.${key}: must be an opaque id, not a path or command fragment`)
    return null
  }
  if (options.changeName && (!CHANGE_NAME_RE.test(value) || value.includes('..'))) {
    errors.push(`${path}.${key}: must be a single safe change name ([A-Za-z0-9_-]+)`)
    return null
  }
  return value
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function parseAction(input: unknown, path: string, errors: string[]): ObserveAction | null {
  const snapshot = snapshotObject(input, new Set(['schemaVersion', 'kind', 'sourceId']), path, errors)
  if (snapshot === null) return null
  const versionOk = literal(snapshot, 'schemaVersion', TRIAGE_SCHEMA_VERSION, path, errors)
  const sourceId = stringValue(snapshot, 'sourceId', path, errors, { safeId: true })
  const kind = stringValue(snapshot, 'kind', path, errors)
  if (kind !== null && !ACTION_KIND_SET.has(kind)) {
    errors.push(`${path}.kind: unknown ObserveAction '${kind}'`)
  }
  if (!versionOk || sourceId === null || kind === null || !ACTION_KIND_SET.has(kind)) return null
  return { schemaVersion: TRIAGE_SCHEMA_VERSION, kind, sourceId } as ObserveAction
}

function parseCheckpoint(input: unknown, path: string, errors: string[]): SourceCheckpoint | null {
  const snapshot = snapshotObject(
    input,
    new Set(['schemaVersion', 'sourceId', 'actionKind', 'cursor']),
    path,
    errors,
  )
  if (snapshot === null) return null
  const versionOk = literal(snapshot, 'schemaVersion', TRIAGE_SCHEMA_VERSION, path, errors)
  const sourceId = stringValue(snapshot, 'sourceId', path, errors, { safeId: true })
  const actionKind = stringValue(snapshot, 'actionKind', path, errors)
  const cursor = stringValue(snapshot, 'cursor', path, errors)
  if (actionKind !== null && !ACTION_KIND_SET.has(actionKind)) {
    errors.push(`${path}.actionKind: unknown ObserveAction '${actionKind}'`)
  }
  if (!versionOk || sourceId === null || actionKind === null || cursor === null || !ACTION_KIND_SET.has(actionKind)) {
    return null
  }
  return { schemaVersion: TRIAGE_SCHEMA_VERSION, sourceId, actionKind, cursor } as SourceCheckpoint
}

function parseObservation(input: unknown, path: string, errors: string[]): Observation | null {
  const snapshot = snapshotObject(
    input,
    new Set(['schemaVersion', 'observationId', 'sourceId', 'actionKind', 'observedAt', 'title', 'body']),
    path,
    errors,
  )
  if (snapshot === null) return null
  const versionOk = literal(snapshot, 'schemaVersion', TRIAGE_SCHEMA_VERSION, path, errors)
  const observationId = stringValue(snapshot, 'observationId', path, errors, { safeId: true })
  const sourceId = stringValue(snapshot, 'sourceId', path, errors, { safeId: true })
  const actionKind = stringValue(snapshot, 'actionKind', path, errors)
  const observedAt = stringValue(snapshot, 'observedAt', path, errors)
  const title = stringValue(snapshot, 'title', path, errors)
  const body = stringValue(snapshot, 'body', path, errors, { allowEmpty: true })
  if (actionKind !== null && !ACTION_KIND_SET.has(actionKind)) {
    errors.push(`${path}.actionKind: unknown ObserveAction '${actionKind}'`)
  }
  if (observedAt !== null && (!ISO_TIMESTAMP_RE.test(observedAt) || Number.isNaN(Date.parse(observedAt)))) {
    errors.push(`${path}.observedAt: expected an ISO-8601 timestamp with timezone`)
  }
  if (
    !versionOk || observationId === null || sourceId === null || actionKind === null
    || observedAt === null || title === null || body === null || !ACTION_KIND_SET.has(actionKind)
  ) return null
  return {
    schemaVersion: TRIAGE_SCHEMA_VERSION,
    observationId,
    sourceId,
    actionKind,
    observedAt,
    title,
    body,
  } as Observation
}

function parsePage(input: unknown, path: string, errors: string[]): ObservationPage | null {
  const snapshot = snapshotObject(
    input,
    new Set(['schemaVersion', 'action', 'observations', 'nextCheckpoint', 'hasMore']),
    path,
    errors,
  )
  if (snapshot === null) return null
  const versionOk = literal(snapshot, 'schemaVersion', TRIAGE_SCHEMA_VERSION, path, errors)
  const action = own(snapshot, 'action')
    ? parseAction(snapshot.action, `${path}.action`, errors)
    : (errors.push(`${path}.action: missing required object`), null)
  const observationInputs = own(snapshot, 'observations')
    ? snapshotArray(snapshot.observations, `${path}.observations`, errors)
    : (errors.push(`${path}.observations: missing required array`), null)
  const observations: Observation[] = []
  if (observationInputs !== null) {
    for (let index = 0; index < observationInputs.length; index += 1) {
      const observation = parseObservation(observationInputs[index], `${path}.observations[${index}]`, errors)
      if (observation !== null) observations.push(observation)
    }
  }
  const nextCheckpoint = own(snapshot, 'nextCheckpoint')
    ? parseCheckpoint(snapshot.nextCheckpoint, `${path}.nextCheckpoint`, errors)
    : (errors.push(`${path}.nextCheckpoint: missing required object`), null)
  let hasMore: boolean | null = null
  if (!own(snapshot, 'hasMore')) errors.push(`${path}.hasMore: missing required boolean`)
  else if (typeof snapshot.hasMore !== 'boolean') errors.push(`${path}.hasMore: expected boolean`)
  else hasMore = snapshot.hasMore

  const ids = new Set<string>()
  for (const observation of observations) {
    if (ids.has(observation.observationId)) {
      errors.push(`${path}.observations: duplicate observationId '${observation.observationId}'`)
    }
    ids.add(observation.observationId)
    if (action !== null && (
      observation.sourceId !== action.sourceId || observation.actionKind !== action.kind
    )) {
      errors.push(`${path}.observations: '${observation.observationId}' is not bound to page.action`)
    }
  }
  if (action !== null && nextCheckpoint !== null && (
    nextCheckpoint.sourceId !== action.sourceId || nextCheckpoint.actionKind !== action.kind
  )) errors.push(`${path}.nextCheckpoint: is not bound to page.action`)

  if (
    !versionOk || action === null || observationInputs === null || observations.length !== observationInputs.length
    || nextCheckpoint === null || hasMore === null
  ) return null
  return {
    schemaVersion: TRIAGE_SCHEMA_VERSION,
    action,
    observations,
    nextCheckpoint,
    hasMore,
  }
}

function parseRoute(input: unknown, path: string, errors: string[]): TriageRoute | null {
  const snapshot = snapshotObject(input, new Set(['routeId', 'description', 'resolved']), path, errors)
  if (snapshot === null) return null
  const routeId = stringValue(snapshot, 'routeId', path, errors, { safeId: true })
  const description = stringValue(snapshot, 'description', path, errors)
  let workflowId: string | null = null
  let initialStep: string | null = null
  if (!own(snapshot, 'resolved')) errors.push(`${path}.resolved: missing required object`)
  else {
    const resolved = snapshotObject(
      snapshot.resolved,
      new Set(['workflowId', 'initialStep']),
      `${path}.resolved`,
      errors,
    )
    if (resolved !== null) {
      workflowId = stringValue(resolved, 'workflowId', `${path}.resolved`, errors, { safeId: true })
      initialStep = stringValue(resolved, 'initialStep', `${path}.resolved`, errors, { safeId: true })
    }
  }
  if (routeId === null || description === null || workflowId === null || initialStep === null) return null
  return { routeId, description, resolved: { workflowId, initialStep } }
}

function parseRoutes(input: unknown, path: string, errors: string[]): TriageRoute[] | null {
  const routeInputs = snapshotArray(input, path, errors)
  if (routeInputs === null) return null
  const routes: TriageRoute[] = []
  const routeIds = new Set<string>()
  for (let index = 0; index < routeInputs.length; index += 1) {
    const route = parseRoute(routeInputs[index], `${path}[${index}]`, errors)
    if (route === null) continue
    if (routeIds.has(route.routeId)) errors.push(`${path}: duplicate routeId '${route.routeId}'`)
    routeIds.add(route.routeId)
    routes.push(route)
  }
  return routes.length === routeInputs.length ? routes : null
}

function parseProvenance(input: unknown, path: string, errors: string[]): TriageProviderProvenance | null {
  const snapshot = snapshotObject(input, new Set(['kind', 'model', 'invocationId']), path, errors)
  if (snapshot === null) return null
  const kind = stringValue(snapshot, 'kind', path, errors, { safeId: true })
  // Model/response identifiers are opaque provenance (for example `vendor/model`); they are never
  // interpreted as filesystem segments or commands, so path-segment restrictions would be false safety.
  const model = stringValue(snapshot, 'model', path, errors)
  const invocationId = stringValue(snapshot, 'invocationId', path, errors)
  return kind === null || model === null || invocationId === null ? null : { kind, model, invocationId }
}

function parseTrustedHighCap(input: unknown, path: string, errors: string[]): number | null {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) {
    errors.push(`${path}: expected a non-negative safe integer`)
    return null
  }
  return input
}

function parseDecision(input: unknown, path: string, errors: string[]): ProviderTriageDecision | null {
  const snapshot = snapshotObject(
    input,
    new Set(['observationId', 'classification', 'rationale', 'routeId']),
    path,
    errors,
  )
  if (snapshot === null) return null
  const observationId = stringValue(snapshot, 'observationId', path, errors, { safeId: true })
  const classification = stringValue(snapshot, 'classification', path, errors)
  const rationale = stringValue(snapshot, 'rationale', path, errors)
  if (classification !== 'high' && classification !== 'watch' && classification !== 'noise') {
    if (classification !== null) errors.push(`${path}.classification: expected high, watch, or noise`)
    return null
  }
  if (observationId === null || rationale === null) return null
  if (classification === 'high') {
    const routeId = stringValue(snapshot, 'routeId', path, errors, { safeId: true })
    return routeId === null ? null : { observationId, classification, rationale, routeId }
  }
  if (own(snapshot, 'routeId')) {
    errors.push(`${path}.routeId: ${classification} decisions cannot nominate a candidate route`)
    return null
  }
  return { observationId, classification, rationale }
}

function parseProviderClassification(
  input: unknown,
  observations: readonly Observation[],
  routes: readonly TriageRoute[],
  trustedHighCap: number,
  path: string,
  errors: string[],
): ProviderTriageClassification | null {
  const snapshot = snapshotObject(input, new Set(['schemaVersion', 'decisions']), path, errors)
  if (snapshot === null) return null
  const versionOk = literal(snapshot, 'schemaVersion', TRIAGE_SCHEMA_VERSION, path, errors)
  const decisionInputs = own(snapshot, 'decisions')
    ? snapshotArray(snapshot.decisions, `${path}.decisions`, errors)
    : (errors.push(`${path}.decisions: missing required array`), null)
  if (decisionInputs === null) return null

  const decisions: ProviderTriageDecision[] = []
  const expectedIds = new Set(observations.map((observation) => observation.observationId))
  const routeIds = new Set(routes.map((route) => route.routeId))
  const seen = new Set<string>()
  let highCount = 0
  for (let index = 0; index < decisionInputs.length; index += 1) {
    const decision = parseDecision(decisionInputs[index], `${path}.decisions[${index}]`, errors)
    if (decision === null) continue
    decisions.push(decision)
    if (!expectedIds.has(decision.observationId)) {
      errors.push(`${path}.decisions[${index}].observationId: unknown observation '${decision.observationId}'`)
    }
    if (seen.has(decision.observationId)) {
      errors.push(`${path}.decisions: duplicate partition member '${decision.observationId}'`)
    }
    seen.add(decision.observationId)
    if (decision.classification === 'high') {
      highCount += 1
      if (!routeIds.has(decision.routeId)) {
        errors.push(`${path}.decisions[${index}].routeId: unknown host route '${decision.routeId}'`)
      }
    }
  }
  for (const expectedId of expectedIds) {
    if (!seen.has(expectedId)) errors.push(`${path}.decisions: missing partition member '${expectedId}'`)
  }
  if (highCount > trustedHighCap) {
    errors.push(`${path}.decisions: high count ${highCount} exceeds trusted host cap ${trustedHighCap}`)
  }
  if (!versionOk || decisions.length !== decisionInputs.length) return null
  // A partition is semantically unordered provider output. Canonical host order comes from the page,
  // preventing provider reordering from influencing highIndex or durable result bytes.
  const byObservationId = new Map(decisions.map((decision) => [decision.observationId, decision]))
  const canonicalDecisions = observations
    .map((observation) => byObservationId.get(observation.observationId))
    .filter((decision): decision is ProviderTriageDecision => decision !== undefined)
  return {
    schemaVersion: TRIAGE_SCHEMA_VERSION,
    decisions: canonicalDecisions.length === decisions.length ? canonicalDecisions : decisions,
  }
}

function parseCandidateIdentity(input: unknown, path: string, errors: string[]): TriageCandidateIdentity | null {
  const snapshot = snapshotObject(input, new Set(['candidateId', 'creationKey', 'changeName']), path, errors)
  if (snapshot === null) return null
  const candidateId = stringValue(snapshot, 'candidateId', path, errors, { safeId: true })
  const creationKey = stringValue(snapshot, 'creationKey', path, errors, { safeId: true })
  const changeName = stringValue(snapshot, 'changeName', path, errors, { changeName: true })
  return candidateId === null || creationKey === null || changeName === null
    ? null
    : { candidateId, creationKey, changeName }
}

function guarded<T>(work: (errors: string[]) => T | null): TriageValidation<T> {
  const errors: string[] = []
  try {
    const value = work(errors)
    return value === null || errors.length > 0 ? fail(errors) : pass(deepFreeze(value))
  } catch (error) {
    errors.push(`triage: input read failed: ${safeErrorText(error)}`)
    return fail(errors)
  }
}

export function validateObserveAction(input: unknown): TriageValidation<ObserveAction> {
  return guarded((errors) => parseAction(input, 'action', errors))
}

export function validateSourceCheckpoint(input: unknown): TriageValidation<SourceCheckpoint> {
  return guarded((errors) => parseCheckpoint(input, 'checkpoint', errors))
}

export function validateObservationPage(input: unknown): TriageValidation<ObservationPage> {
  return guarded((errors) => parsePage(input, 'page', errors))
}

export function validateTriageRoutes(input: unknown): TriageValidation<readonly TriageRoute[]> {
  return guarded((errors) => parseRoutes(input, 'routes', errors))
}

export interface ProviderClassificationValidationContext {
  readonly observations: readonly Observation[]
  readonly routes: readonly TriageRoute[]
  readonly trustedHighCap: number
}

export function validateProviderTriageClassification(
  input: unknown,
  context: ProviderClassificationValidationContext,
): TriageValidation<ProviderTriageClassification> {
  return guarded((errors) => {
    const contextSnapshot = snapshotObject(
      context,
      new Set(['observations', 'routes', 'trustedHighCap']),
      'context',
      errors,
    )
    if (contextSnapshot === null) return null
    const observationInputs = snapshotArray(contextSnapshot.observations, 'context.observations', errors)
    const observations: Observation[] = []
    if (observationInputs !== null) {
      for (let index = 0; index < observationInputs.length; index += 1) {
        const observation = parseObservation(observationInputs[index], `context.observations[${index}]`, errors)
        if (observation !== null) observations.push(observation)
      }
    }
    const routes = parseRoutes(contextSnapshot.routes, 'context.routes', errors)
    const cap = parseTrustedHighCap(contextSnapshot.trustedHighCap, 'context.trustedHighCap', errors)
    if (observationInputs === null || observations.length !== observationInputs.length || routes === null || cap === null) {
      return null
    }
    return parseProviderClassification(input, observations, routes, cap, 'providerOutput', errors)
  })
}

/**
 * The sole trust-boundary constructor for TriageResult. The provider contributes only semantic
 * classification/rationale/routeId; all identity, provenance, and resolved route values come from
 * host inputs and are copied into a new recursively frozen tree.
 */
export function canonicalizeTriageResult(
  providerOutput: unknown,
  context: HostTriageCanonicalizationContext,
): TriageValidation<TriageResult> {
  return guarded((errors) => {
    const contextSnapshot = snapshotObject(
      context,
      new Set(['page', 'routes', 'trustedHighCap', 'provider', 'deriveCandidate']),
      'context',
      errors,
    )
    if (contextSnapshot === null) return null
    const page = parsePage(contextSnapshot.page, 'context.page', errors)
    const routes = parseRoutes(contextSnapshot.routes, 'context.routes', errors)
    const cap = parseTrustedHighCap(contextSnapshot.trustedHighCap, 'context.trustedHighCap', errors)
    const provider = parseProvenance(contextSnapshot.provider, 'context.provider', errors)
    const deriveCandidate = contextSnapshot.deriveCandidate
    if (typeof deriveCandidate !== 'function') errors.push('context.deriveCandidate: expected function')
    if (page === null || routes === null || cap === null || provider === null || typeof deriveCandidate !== 'function') {
      return null
    }

    const classification = parseProviderClassification(
      providerOutput,
      page.observations,
      routes,
      cap,
      'providerOutput',
      errors,
    )
    if (classification === null || errors.length > 0) return null

    const canonicalPage = deepFreeze(page)
    const canonicalRoutes = deepFreeze(routes)
    const observationsById = new Map(canonicalPage.observations.map((observation) => [observation.observationId, observation]))
    const routesById = new Map(canonicalRoutes.map((route) => [route.routeId, route]))
    const decisions: TriageDecision[] = []
    const candidateIds = new Set<string>()
    const creationKeys = new Set<string>()
    const changeNames = new Set<string>()
    let highIndex = 0
    for (const decision of classification.decisions) {
      if (decision.classification !== 'high') {
        decisions.push({ ...decision })
        continue
      }
      const observation = observationsById.get(decision.observationId)
      const route = routesById.get(decision.routeId)
      if (observation === undefined || route === undefined) return null
      let derived: unknown
      try {
        derived = deriveCandidate(deepFreeze({
          observation,
          route,
          rationale: decision.rationale,
          highIndex,
        }))
      } catch (error) {
        errors.push(`context.deriveCandidate[${highIndex}]: threw ${safeErrorText(error)}`)
        return null
      }
      const identity = parseCandidateIdentity(derived, `context.deriveCandidate[${highIndex}]`, errors)
      highIndex += 1
      if (identity === null) continue
      if (candidateIds.has(identity.candidateId)) errors.push(`candidateId '${identity.candidateId}' is duplicated`)
      if (creationKeys.has(identity.creationKey)) errors.push(`creationKey '${identity.creationKey}' is duplicated`)
      if (changeNames.has(identity.changeName)) errors.push(`changeName '${identity.changeName}' is duplicated`)
      candidateIds.add(identity.candidateId)
      creationKeys.add(identity.creationKey)
      changeNames.add(identity.changeName)
      decisions.push({
        ...decision,
        candidate: { ...identity, route },
      })
    }
    if (errors.length > 0 || decisions.length !== classification.decisions.length) return null
    return {
      schemaVersion: TRIAGE_SCHEMA_VERSION,
      page: canonicalPage,
      decisions,
      provider,
    }
  })
}
