import { ApiError, isAbortError, isRecord, readJson, wrapNetwork } from './transport'

export const TASK_PLAN_READ_SCHEMA_VERSION = 'task-plan-read/v1' as const

export const TASK_PLAN_ERROR_CODES = [
  'TASK_PLAN_CHANGE_INVALID',
  'TASK_PLAN_ROOT_REQUIRED',
  'TASK_PLAN_ROOT_NOT_REGISTERED',
  'TASK_PLAN_ROOT_FORBIDDEN',
  'TASK_PLAN_NOT_FOUND',
  'TASK_PLAN_PATH_FORBIDDEN',
  'TASK_PLAN_CORRUPT',
] as const

export type TaskPlanErrorCode = (typeof TASK_PLAN_ERROR_CODES)[number]
export type TaskPlanRevisionStatus = 'draft' | 'frozen'
export type ResourceKind = 'path' | 'logical' | 'external'
export type ResourceAccess = 'read' | 'write'
export type ExpectedOutputKind = 'file' | 'artifact' | 'value'
export type TaskValidatorKind = 'file-exists' | 'json-schema' | 'test-report' | 'artifact-digest'

export const MAX_TASK_PLAN_TEXT_BYTES = 8 * 1024
export const MAX_TASK_PLAN_ID_BYTES = 160
export const MAX_TASK_PLAN_RESOURCE_BYTES = 1024
export const MAX_TASK_PLAN_GROUPS = 256
export const MAX_TASK_PLAN_WORK_ITEMS = 1024
export const MAX_TASK_PLAN_CATALOG_ENTRIES = 2048
export const MAX_TASK_PLAN_RELATIONS_PER_ITEM = 128
export const MAX_TASK_PLAN_VALIDATION_ISSUES = 256
export const MAX_TASK_PLAN_DIAGNOSTIC_ENTRIES = 4096
export const MAX_TASK_PLAN_DECODE_NODES = 65_536
export const MAX_TASK_PLAN_DOCUMENT_BYTES = 1024 * 1024
export const MAX_TASK_PLAN_LEGACY_PROJECTION_BYTES = 256 * 1024

export interface TaskPlanCatalogEntry {
  readonly id: string
  readonly title: string
}

export interface TaskGroupV1 {
  readonly id: string
  readonly title: string
  readonly parent_id: string | null
  readonly work_item_ids: readonly string[]
}

export interface ResourceClaimV1 {
  readonly kind: ResourceKind
  readonly access: ResourceAccess
  readonly key: string
}

export interface ExpectedOutputV1 {
  readonly id: string
  readonly kind: ExpectedOutputKind
  readonly ref: string
}

export interface TaskValidatorV1 {
  readonly id: string
  readonly kind: TaskValidatorKind
  readonly version: 1
  readonly output_ids: readonly string[]
}

export interface WorkItemV1 {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly group_id: string
  readonly requirement_refs: readonly string[]
  readonly acceptance_refs: readonly string[]
  readonly depends_on: readonly string[]
  readonly resource_claims: readonly ResourceClaimV1[]
  readonly expected_outputs: readonly ExpectedOutputV1[]
  readonly validators: readonly TaskValidatorV1[]
}

export interface TaskPlanCoverageEntry {
  readonly id: string
  readonly work_item_ids: readonly string[]
}

export interface TaskPlanCoverageSummary {
  readonly complete: boolean
  readonly requirements: readonly TaskPlanCoverageEntry[]
  readonly acceptance_criteria: readonly TaskPlanCoverageEntry[]
  readonly uncovered_requirement_ids: readonly string[]
  readonly uncovered_acceptance_ids: readonly string[]
}

export interface TaskPlanDependencyDiagnostics {
  readonly edges: readonly {
    readonly from_work_item_id: string
    readonly to_work_item_id: string
  }[]
  readonly cyclic_work_item_ids: readonly string[]
}

export interface TaskPlanResourceDiagnostics {
  readonly conflicts: readonly {
    readonly resource: string
    readonly work_item_ids: readonly string[]
  }[]
  readonly serialized: readonly {
    readonly resource: string
    readonly before_work_item_id: string
    readonly after_work_item_id: string
  }[]
}

export type TaskPlanValidationIssueCode =
  | 'acceptance-ref-duplicate'
  | 'acceptance-ref-unknown'
  | 'acceptance-uncovered'
  | 'dependency-cycle'
  | 'dependency-duplicate'
  | 'dependency-self'
  | 'dependency-unknown'
  | 'entity-id-duplicate'
  | 'group-cycle'
  | 'group-parent-unknown'
  | 'group-work-item-unknown'
  | 'requirement-ref-duplicate'
  | 'requirement-ref-unknown'
  | 'requirement-uncovered'
  | 'resource-claim-duplicate'
  | 'resource-write-conflict'
  | 'task-plan-contract-invalid'
  | 'validator-output-unknown'
  | 'work-item-group-mismatch'
  | 'work-item-multiple-groups'
  | 'work-item-unowned'
  | 'diagnostic-budget-exceeded'

export interface TaskPlanValidationIssue {
  readonly severity: 'error'
  readonly code: TaskPlanValidationIssueCode
  readonly path: string
  readonly related_ids: readonly string[]
}

export interface TaskPlanValidationResult {
  readonly valid: boolean
  readonly freezable: boolean
  readonly truncated: boolean
  readonly issues: readonly TaskPlanValidationIssue[]
  readonly coverage: TaskPlanCoverageSummary
  readonly dependencies: TaskPlanDependencyDiagnostics
  readonly resources: TaskPlanResourceDiagnostics
}

export type TaskPlanProjectionStatus =
  | { readonly state: 'current' }
  | { readonly state: 'pending'; readonly reason?: string }
  | { readonly state: 'drift'; readonly reason?: string }

export interface CanonicalTaskPlanReadModelV1 {
  readonly schema_version: typeof TASK_PLAN_READ_SCHEMA_VERSION
  readonly source: 'canonical'
  readonly schedulable: boolean
  readonly plan_id: string
  readonly revision_id: string
  readonly revision_number: number
  readonly fingerprint: `sha256:${string}`
  readonly revision_status: TaskPlanRevisionStatus
  readonly validation: TaskPlanValidationResult
  readonly completeness: { readonly state: 'complete' | 'incomplete' }
  readonly requirements: readonly TaskPlanCatalogEntry[]
  readonly acceptance_criteria: readonly TaskPlanCatalogEntry[]
  readonly groups: readonly TaskGroupV1[]
  readonly items: readonly (WorkItemV1 & { readonly identity_quality: 'canonical' })[]
  readonly coverage: TaskPlanCoverageSummary
  readonly dependencies: TaskPlanDependencyDiagnostics
  readonly resources: TaskPlanResourceDiagnostics
  readonly projection: TaskPlanProjectionStatus
}

export interface LegacyTaskPlanItemV1 {
  readonly id: string
  readonly identity_quality: 'legacy-derived'
  readonly title: string
  readonly stage: string | null
  readonly completed: boolean
  readonly order: number
  readonly depends_on: readonly []
  readonly requirement_refs: readonly []
  readonly acceptance_refs: readonly []
  readonly resource_claims: readonly []
  readonly expected_outputs: readonly []
  readonly validators: readonly []
}

export interface LegacyTaskPlanReadModelV1 {
  readonly schema_version: typeof TASK_PLAN_READ_SCHEMA_VERSION
  readonly source: 'legacy'
  readonly schedulable: false
  readonly groups: readonly []
  readonly items: readonly LegacyTaskPlanItemV1[]
  readonly completeness: { readonly state: 'unknown'; readonly reason: 'legacy-semantics-unproven' }
  readonly projection: { readonly state: 'legacy' }
}

export type TaskPlanReadModelV1 = CanonicalTaskPlanReadModelV1 | LegacyTaskPlanReadModelV1

const VALIDATION_ISSUE_CODES: readonly TaskPlanValidationIssueCode[] = [
  'acceptance-ref-duplicate', 'acceptance-ref-unknown', 'acceptance-uncovered',
  'dependency-cycle', 'dependency-duplicate', 'dependency-self', 'dependency-unknown',
  'entity-id-duplicate', 'group-cycle', 'group-parent-unknown', 'group-work-item-unknown',
  'requirement-ref-duplicate', 'requirement-ref-unknown', 'requirement-uncovered',
  'resource-claim-duplicate', 'resource-write-conflict', 'task-plan-contract-invalid',
  'validator-output-unknown', 'work-item-group-mismatch', 'work-item-multiple-groups',
  'work-item-unowned', 'diagnostic-budget-exceeded',
]
const RESOURCE_KINDS: readonly ResourceKind[] = ['path', 'logical', 'external']
const RESOURCE_ACCESS: readonly ResourceAccess[] = ['read', 'write']
const OUTPUT_KINDS: readonly ExpectedOutputKind[] = ['file', 'artifact', 'value']
const VALIDATOR_KINDS: readonly TaskValidatorKind[] = [
  'file-exists', 'json-schema', 'test-report', 'artifact-digest',
]

interface DecodeBudget {
  nodes: number
  bytes: number
  readonly maxBytes: number
}

function budget(maxBytes: number): DecodeBudget {
  return { nodes: 0, bytes: 0, maxBytes }
}

function consume(budgetState: DecodeBudget, nodes = 1): boolean {
  budgetState.nodes += nodes
  return budgetState.nodes <= MAX_TASK_PLAN_DECODE_NODES
}

function consumeText(budgetState: DecodeBudget, value: string): boolean {
  const bytes = new TextEncoder().encode(value).byteLength
  budgetState.bytes += bytes
  return budgetState.bytes <= budgetState.maxBytes
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (!isRecord(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return (prototype === Object.prototype || prototype === null)
      && Reflect.ownKeys(value).every((key) => typeof key === 'string')
  } catch {
    return false
  }
}

function exactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false
  try {
    const keys = Reflect.ownKeys(value)
    const allowed = new Set([...required, ...optional])
    return required.every((key) => keys.includes(key))
      && keys.length >= required.length
      && keys.every((key) => {
        if (typeof key !== 'string' || !allowed.has(key)) return false
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        return descriptor !== undefined && descriptor.enumerable
          && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      })
  } catch {
    return false
  }
}

function strictArray(
  value: unknown,
  budgetState: DecodeBudget,
  limit: number,
): readonly unknown[] | null {
  try {
    if (!Array.isArray(value)) return null
    if (Object.getPrototypeOf(value) !== Array.prototype
      || !Number.isSafeInteger(value.length) || value.length > limit
      || !consume(budgetState, value.length + 1)) return null
    const keys = Reflect.ownKeys(value)
    if (keys.length !== value.length + 1 || !keys.includes('length')) return null
    const entries: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index)
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null
      entries.push(descriptor.value)
    }
    if (keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^\d+$/u.test(key)))) return null
    return entries
  } catch {
    return null
  }
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.some((candidate) => candidate === value)
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function isFingerprint(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value)
}

function isCanonicalCompletenessState(value: unknown): value is 'complete' | 'incomplete' {
  return value === 'complete' || value === 'incomplete'
}

function hasInvalidSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index)
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (current >= 0xdc00 && current <= 0xdfff) return true
  }
  return false
}

function safeText(
  value: unknown,
  budgetState: DecodeBudget,
  maxBytes = MAX_TASK_PLAN_TEXT_BYTES,
): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxBytes
    || value !== value.trim() || hasInvalidSurrogate(value)
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
    || !consume(budgetState)) return false
  const bytes = new TextEncoder().encode(value).byteLength
  return bytes <= maxBytes && consumeText(budgetState, value)
}

function safeIdentifier(value: unknown, budgetState: DecodeBudget): value is string {
  return safeText(value, budgetState, MAX_TASK_PLAN_ID_BYTES)
    && value === value.normalize('NFC')
    && /^[\p{L}\p{N}][\p{L}\p{N}\p{M}._-]*$/u.test(value)
    && !value.includes('--')
}

function stringArray(
  value: unknown,
  budgetState: DecodeBudget,
  limit = MAX_TASK_PLAN_RELATIONS_PER_ITEM,
): string[] | null {
  const entries = strictArray(value, budgetState, limit)
  if (entries === null) return null
  const decoded: string[] = []
  for (const entry of entries) {
    if (!safeIdentifier(entry, budgetState)) return null
    decoded.push(entry)
  }
  return decoded
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function canonicalResourceKey(kind: ResourceKind, key: string): string | null {
  if (key === '' || key !== key.trim() || key !== key.normalize('NFC')
    || hasInvalidSurrogate(key) || /[\u0000-\u001f\u007f-\u009f]/u.test(key)
    || key.includes('\\') || key.startsWith('/') || key.endsWith('/') || key.includes('//')) return null
  const segments = key.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  if (kind === 'path' && key.includes(':')) return null
  if (kind !== 'path' && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(key)) return null
  return `${kind}:${key}`
}

function resourceKey(value: unknown, budgetState: DecodeBudget): string | null {
  if (!safeText(value, budgetState, MAX_TASK_PLAN_RESOURCE_BYTES)) return null
  const separator = value.indexOf(':')
  if (separator <= 0) return null
  const kind = value.slice(0, separator)
  const key = value.slice(separator + 1)
  if (!isEnum(kind, RESOURCE_KINDS)) return null
  return canonicalResourceKey(kind, key) === value ? value : null
}

function decodeCatalog(
  value: unknown,
  budgetState: DecodeBudget,
): TaskPlanCatalogEntry[] | null {
  const entries = strictArray(value, budgetState, MAX_TASK_PLAN_CATALOG_ENTRIES)
  if (entries === null) return null
  const decoded: TaskPlanCatalogEntry[] = []
  for (const entry of entries) {
    if (!exactKeys(entry, ['id', 'title']) || !consume(budgetState)) return null
    if (!safeIdentifier(entry.id, budgetState) || !safeText(entry.title, budgetState)) return null
    decoded.push({ id: entry.id, title: entry.title })
  }
  return decoded
}

function decodeGroups(
  value: unknown,
  budgetState: DecodeBudget,
): TaskGroupV1[] | null {
  const entries = strictArray(value, budgetState, MAX_TASK_PLAN_GROUPS)
  if (entries === null) return null
  const decoded: TaskGroupV1[] = []
  for (const entry of entries) {
    if (!exactKeys(entry, ['id', 'title', 'parent_id', 'work_item_ids']) || !consume(budgetState)) return null
    if (!safeIdentifier(entry.id, budgetState) || !safeText(entry.title, budgetState)) return null
    const parent = entry.parent_id === null
      ? null
      : safeIdentifier(entry.parent_id, budgetState) ? entry.parent_id : undefined
    const workItemIds = stringArray(entry.work_item_ids, budgetState)
    if (parent === undefined || workItemIds === null) return null
    decoded.push({ id: entry.id, title: entry.title, parent_id: parent, work_item_ids: workItemIds })
  }
  return decoded
}

function decodeResourceClaims(
  value: unknown,
  budgetState: DecodeBudget,
): ResourceClaimV1[] | null {
  const entries = strictArray(value, budgetState, MAX_TASK_PLAN_RELATIONS_PER_ITEM)
  if (entries === null) return null
  const decoded: ResourceClaimV1[] = []
  for (const entry of entries) {
    if (!exactKeys(entry, ['kind', 'access', 'key']) || !consume(budgetState)
      || !isEnum(entry.kind, RESOURCE_KINDS) || !isEnum(entry.access, RESOURCE_ACCESS)
      || !safeText(entry.key, budgetState, MAX_TASK_PLAN_RESOURCE_BYTES)
      || canonicalResourceKey(entry.kind, entry.key) === null) return null
    decoded.push({ kind: entry.kind, access: entry.access, key: entry.key })
  }
  return decoded
}

function decodeOutputs(
  value: unknown,
  budgetState: DecodeBudget,
): ExpectedOutputV1[] | null {
  const entries = strictArray(value, budgetState, MAX_TASK_PLAN_RELATIONS_PER_ITEM)
  if (entries === null) return null
  const decoded: ExpectedOutputV1[] = []
  for (const entry of entries) {
    if (!exactKeys(entry, ['id', 'kind', 'ref']) || !consume(budgetState)
      || !safeIdentifier(entry.id, budgetState) || !isEnum(entry.kind, OUTPUT_KINDS)
      || !safeText(entry.ref, budgetState, MAX_TASK_PLAN_RESOURCE_BYTES)) return null
    if (entry.kind === 'file' && canonicalResourceKey('path', entry.ref) === null) return null
    decoded.push({ id: entry.id, kind: entry.kind, ref: entry.ref })
  }
  return decoded
}

function decodeValidators(
  value: unknown,
  budgetState: DecodeBudget,
): TaskValidatorV1[] | null {
  const entries = strictArray(value, budgetState, MAX_TASK_PLAN_RELATIONS_PER_ITEM)
  if (entries === null) return null
  const decoded: TaskValidatorV1[] = []
  for (const entry of entries) {
    if (!exactKeys(entry, ['id', 'kind', 'version', 'output_ids']) || !consume(budgetState)
      || !safeIdentifier(entry.id, budgetState) || !isEnum(entry.kind, VALIDATOR_KINDS)
      || entry.version !== 1) return null
    const outputIds = stringArray(entry.output_ids, budgetState)
    if (outputIds === null) return null
    decoded.push({ id: entry.id, kind: entry.kind, version: 1, output_ids: outputIds })
  }
  return decoded
}

function decodeItems(
  value: unknown,
  budgetState: DecodeBudget,
): Array<WorkItemV1 & { readonly identity_quality: 'canonical' }> | null {
  const entries = strictArray(value, budgetState, MAX_TASK_PLAN_WORK_ITEMS)
  if (entries === null) return null
  const decoded: Array<WorkItemV1 & { readonly identity_quality: 'canonical' }> = []
  for (const entry of entries) {
    if (!exactKeys(entry, [
      'id', 'identity_quality', 'title', 'group_id', 'requirement_refs', 'acceptance_refs',
      'depends_on', 'resource_claims', 'expected_outputs', 'validators',
    ], ['description']) || !consume(budgetState)
      || entry.identity_quality !== 'canonical'
      || !safeIdentifier(entry.id, budgetState)
      || !safeText(entry.title, budgetState)
      || !safeIdentifier(entry.group_id, budgetState)) return null
    const description = !Object.prototype.hasOwnProperty.call(entry, 'description')
      ? undefined
      : safeText(entry.description, budgetState) ? entry.description : null
    if (description === null) return null
    const requirementRefs = stringArray(entry.requirement_refs, budgetState)
    const acceptanceRefs = stringArray(entry.acceptance_refs, budgetState)
    const dependsOn = stringArray(entry.depends_on, budgetState)
    const resourceClaims = decodeResourceClaims(entry.resource_claims, budgetState)
    const expectedOutputs = decodeOutputs(entry.expected_outputs, budgetState)
    const validators = decodeValidators(entry.validators, budgetState)
    if (requirementRefs === null || acceptanceRefs === null || dependsOn === null
      || resourceClaims === null || expectedOutputs === null || validators === null) return null
    decoded.push({
      id: entry.id,
      identity_quality: 'canonical',
      title: entry.title,
      ...(description === undefined ? {} : { description }),
      group_id: entry.group_id,
      requirement_refs: requirementRefs,
      acceptance_refs: acceptanceRefs,
      depends_on: dependsOn,
      resource_claims: resourceClaims,
      expected_outputs: expectedOutputs,
      validators,
    })
  }
  return decoded
}

function decodeCoverage(
  value: unknown,
  budgetState: DecodeBudget,
): TaskPlanCoverageSummary | null {
  if (!exactKeys(value, [
    'complete', 'requirements', 'acceptance_criteria',
    'uncovered_requirement_ids', 'uncovered_acceptance_ids',
  ]) || !consume(budgetState) || typeof value.complete !== 'boolean') return null
  const decodeEntries = (candidate: unknown): TaskPlanCoverageEntry[] | null => {
    const entries = strictArray(candidate, budgetState, MAX_TASK_PLAN_CATALOG_ENTRIES)
    if (entries === null) return null
    const result: TaskPlanCoverageEntry[] = []
    for (const entry of entries) {
      if (!exactKeys(entry, ['id', 'work_item_ids']) || !consume(budgetState)
        || !safeIdentifier(entry.id, budgetState)) return null
      const workItemIds = stringArray(entry.work_item_ids, budgetState, MAX_TASK_PLAN_WORK_ITEMS)
      if (workItemIds === null || !unique(workItemIds)) return null
      result.push({ id: entry.id, work_item_ids: workItemIds })
    }
    return result
  }
  const requirements = decodeEntries(value.requirements)
  const acceptanceCriteria = decodeEntries(value.acceptance_criteria)
  const uncoveredRequirements = stringArray(
    value.uncovered_requirement_ids, budgetState, MAX_TASK_PLAN_CATALOG_ENTRIES,
  )
  const uncoveredAcceptance = stringArray(
    value.uncovered_acceptance_ids, budgetState, MAX_TASK_PLAN_CATALOG_ENTRIES,
  )
  if (requirements === null || acceptanceCriteria === null || uncoveredRequirements === null
    || uncoveredAcceptance === null || !unique(requirements.map((entry) => entry.id))
    || !unique(acceptanceCriteria.map((entry) => entry.id))
    || !unique(uncoveredRequirements) || !unique(uncoveredAcceptance)) return null
  return {
    complete: value.complete,
    requirements,
    acceptance_criteria: acceptanceCriteria,
    uncovered_requirement_ids: uncoveredRequirements,
    uncovered_acceptance_ids: uncoveredAcceptance,
  }
}

function decodeDependencies(
  value: unknown,
  budgetState: DecodeBudget,
): TaskPlanDependencyDiagnostics | null {
  if (!exactKeys(value, ['edges', 'cyclic_work_item_ids']) || !consume(budgetState)) return null
  const edgeValues = strictArray(value.edges, budgetState, MAX_TASK_PLAN_DIAGNOSTIC_ENTRIES)
  const cyclicIds = stringArray(value.cyclic_work_item_ids, budgetState, MAX_TASK_PLAN_WORK_ITEMS)
  if (edgeValues === null || cyclicIds === null || !unique(cyclicIds)) return null
  const edges: TaskPlanDependencyDiagnostics['edges'][number][] = []
  const edgeKeys = new Set<string>()
  for (const entry of edgeValues) {
    if (!exactKeys(entry, ['from_work_item_id', 'to_work_item_id']) || !consume(budgetState)
      || !safeIdentifier(entry.from_work_item_id, budgetState)
      || !safeIdentifier(entry.to_work_item_id, budgetState)) return null
    const key = `${entry.from_work_item_id}\u0000${entry.to_work_item_id}`
    if (edgeKeys.has(key)) return null
    edgeKeys.add(key)
    edges.push({ from_work_item_id: entry.from_work_item_id, to_work_item_id: entry.to_work_item_id })
  }
  return { edges, cyclic_work_item_ids: cyclicIds }
}

function decodeResources(
  value: unknown,
  budgetState: DecodeBudget,
): TaskPlanResourceDiagnostics | null {
  if (!exactKeys(value, ['conflicts', 'serialized']) || !consume(budgetState)) return null
  const conflictsValue = strictArray(value.conflicts, budgetState, MAX_TASK_PLAN_DIAGNOSTIC_ENTRIES)
  const serializedValue = strictArray(value.serialized, budgetState, MAX_TASK_PLAN_DIAGNOSTIC_ENTRIES)
  if (conflictsValue === null || serializedValue === null) return null
  const conflicts: TaskPlanResourceDiagnostics['conflicts'][number][] = []
  const conflictKeys = new Set<string>()
  for (const entry of conflictsValue) {
    if (!exactKeys(entry, ['resource', 'work_item_ids']) || !consume(budgetState)) return null
    const resource = resourceKey(entry.resource, budgetState)
    const workItemIds = stringArray(entry.work_item_ids, budgetState, MAX_TASK_PLAN_WORK_ITEMS)
    if (resource === null || workItemIds === null || !unique(workItemIds)) return null
    const key = `${resource}\u0000${workItemIds.join('\u0000')}`
    if (conflictKeys.has(key)) return null
    conflictKeys.add(key)
    conflicts.push({ resource, work_item_ids: workItemIds })
  }
  const serialized: TaskPlanResourceDiagnostics['serialized'][number][] = []
  const serializedKeys = new Set<string>()
  for (const entry of serializedValue) {
    if (!exactKeys(entry, ['resource', 'before_work_item_id', 'after_work_item_id']) || !consume(budgetState)) return null
    const resource = resourceKey(entry.resource, budgetState)
    if (resource === null || !safeIdentifier(entry.before_work_item_id, budgetState)
      || !safeIdentifier(entry.after_work_item_id, budgetState)
      || entry.before_work_item_id === entry.after_work_item_id) return null
    const key = `${resource}\u0000${entry.before_work_item_id}\u0000${entry.after_work_item_id}`
    if (serializedKeys.has(key)) return null
    serializedKeys.add(key)
    serialized.push({
      resource,
      before_work_item_id: entry.before_work_item_id,
      after_work_item_id: entry.after_work_item_id,
    })
  }
  return { conflicts, serialized }
}

function decodeValidationIssue(
  value: unknown,
  budgetState: DecodeBudget,
): TaskPlanValidationIssue | null {
  if (!exactKeys(value, ['severity', 'code', 'path', 'related_ids']) || !consume(budgetState)
    || value.severity !== 'error' || !isEnum(value.code, VALIDATION_ISSUE_CODES)
    || !safeText(value.path, budgetState)) return null
  const relatedIds = stringArray(value.related_ids, budgetState, MAX_TASK_PLAN_DIAGNOSTIC_ENTRIES)
  if (relatedIds === null || !unique(relatedIds)) return null
  return { severity: 'error', code: value.code, path: value.path, related_ids: relatedIds }
}

function decodeValidation(
  value: unknown,
  budgetState: DecodeBudget,
): TaskPlanValidationResult | null {
  if (!exactKeys(value, ['valid', 'freezable', 'truncated', 'issues', 'coverage', 'dependencies', 'resources'])
    || !consume(budgetState) || typeof value.valid !== 'boolean'
    || typeof value.freezable !== 'boolean' || typeof value.truncated !== 'boolean') return null
  const issueValues = strictArray(value.issues, budgetState, MAX_TASK_PLAN_VALIDATION_ISSUES)
  if (issueValues === null) return null
  const issues: TaskPlanValidationIssue[] = []
  for (const issueValue of issueValues) {
    const issue = decodeValidationIssue(issueValue, budgetState)
    if (issue === null) return null
    issues.push(issue)
  }
  const coverage = decodeCoverage(value.coverage, budgetState)
  const dependencies = decodeDependencies(value.dependencies, budgetState)
  const resources = decodeResources(value.resources, budgetState)
  if (coverage === null || dependencies === null || resources === null
    || (value.valid && (!value.freezable || value.truncated || issues.length !== 0))
    || (value.freezable && !value.valid)) return null
  return { valid: value.valid, freezable: value.freezable, truncated: value.truncated, issues, coverage, dependencies, resources }
}

function decodeProjection(
  value: unknown,
  budgetState: DecodeBudget,
): TaskPlanProjectionStatus | null {
  if (!exactKeys(value, ['state'], ['reason']) || !consume(budgetState)) return null
  if (value.state === 'current') {
    return 'reason' in value ? null : { state: 'current' }
  }
  if (value.state !== 'pending' && value.state !== 'drift') return null
  if (!Object.prototype.hasOwnProperty.call(value, 'reason')) return { state: value.state }
  if (value.reason === undefined) return null
  if (!safeText(value.reason, budgetState)) return null
  return { state: value.state, reason: value.reason }
}

function sameCoverage(left: TaskPlanCoverageSummary, right: TaskPlanCoverageSummary): boolean {
  const sameEntries = (a: readonly TaskPlanCoverageEntry[], b: readonly TaskPlanCoverageEntry[]): boolean =>
    a.length === b.length && a.every((entry, index) => {
      const other = b[index]
      return other !== undefined && entry.id === other.id
        && entry.work_item_ids.length === other.work_item_ids.length
        && entry.work_item_ids.every((id, itemIndex) => id === other.work_item_ids[itemIndex])
    })
  return left.complete === right.complete
    && sameEntries(left.requirements, right.requirements)
    && sameEntries(left.acceptance_criteria, right.acceptance_criteria)
    && left.uncovered_requirement_ids.length === right.uncovered_requirement_ids.length
    && left.uncovered_requirement_ids.every((id, index) => id === right.uncovered_requirement_ids[index])
    && left.uncovered_acceptance_ids.length === right.uncovered_acceptance_ids.length
    && left.uncovered_acceptance_ids.every((id, index) => id === right.uncovered_acceptance_ids[index])
}

function sameDependencies(left: TaskPlanDependencyDiagnostics, right: TaskPlanDependencyDiagnostics): boolean {
  return left.edges.length === right.edges.length
    && left.edges.every((edge, index) => {
      const other = right.edges[index]
      return other !== undefined && edge.from_work_item_id === other.from_work_item_id
        && edge.to_work_item_id === other.to_work_item_id
    })
    && left.cyclic_work_item_ids.length === right.cyclic_work_item_ids.length
    && left.cyclic_work_item_ids.every((id, index) => id === right.cyclic_work_item_ids[index])
}

function sameResources(left: TaskPlanResourceDiagnostics, right: TaskPlanResourceDiagnostics): boolean {
  const sameConflicts = left.conflicts.length === right.conflicts.length
    && left.conflicts.every((entry, index) => {
      const other = right.conflicts[index]
      return other !== undefined && entry.resource === other.resource
        && entry.work_item_ids.length === other.work_item_ids.length
        && entry.work_item_ids.every((id, idIndex) => id === other.work_item_ids[idIndex])
    })
  const sameSerialized = left.serialized.length === right.serialized.length
    && left.serialized.every((entry, index) => {
      const other = right.serialized[index]
      return other !== undefined && entry.resource === other.resource
        && entry.before_work_item_id === other.before_work_item_id
        && entry.after_work_item_id === other.after_work_item_id
    })
  return sameConflicts && sameSerialized
}

function addEntityIds(ids: Set<string>, values: readonly string[]): boolean {
  for (const id of values) {
    if (ids.has(id)) return false
    ids.add(id)
  }
  return true
}

function decodeCanonical(value: Record<string, unknown>): CanonicalTaskPlanReadModelV1 | null {
  const budgetState = budget(MAX_TASK_PLAN_DOCUMENT_BYTES)
  if (!exactKeys(value, [
    'schema_version', 'source', 'schedulable', 'plan_id', 'revision_id', 'revision_number',
    'fingerprint', 'revision_status', 'validation', 'completeness', 'requirements',
    'acceptance_criteria', 'groups', 'items', 'coverage', 'dependencies', 'resources', 'projection',
  ]) || !consume(budgetState) || value.schema_version !== TASK_PLAN_READ_SCHEMA_VERSION
    || value.source !== 'canonical' || typeof value.schedulable !== 'boolean'
    || !safeIdentifier(value.plan_id, budgetState) || !safeIdentifier(value.revision_id, budgetState)
    || !isSafePositiveInteger(value.revision_number)
    || !isFingerprint(value.fingerprint)
    || !isEnum(value.revision_status, ['draft', 'frozen'] as const)) return null
  const validation = decodeValidation(value.validation, budgetState)
  const completeness = exactKeys(value.completeness, ['state']) && consume(budgetState)
    && isCanonicalCompletenessState(value.completeness.state)
    ? { state: value.completeness.state }
    : null
  const requirements = decodeCatalog(value.requirements, budgetState)
  const acceptanceCriteria = decodeCatalog(value.acceptance_criteria, budgetState)
  const groups = decodeGroups(value.groups, budgetState)
  const items = decodeItems(value.items, budgetState)
  const coverage = decodeCoverage(value.coverage, budgetState)
  const dependencies = decodeDependencies(value.dependencies, budgetState)
  const resources = decodeResources(value.resources, budgetState)
  const projection = decodeProjection(value.projection, budgetState)
  if (validation === null || completeness === null || requirements === null || acceptanceCriteria === null
    || groups === null || items === null || coverage === null || dependencies === null
    || resources === null || projection === null) return null

  const entityIds = new Set<string>()
  if (!addEntityIds(entityIds, [value.plan_id, value.revision_id])
    || !addEntityIds(entityIds, requirements.map((entry) => entry.id))
    || !addEntityIds(entityIds, acceptanceCriteria.map((entry) => entry.id))
    || !addEntityIds(entityIds, groups.map((group) => group.id))
    || !addEntityIds(entityIds, items.map((item) => item.id))) return null
  for (const item of items) {
    if (!addEntityIds(entityIds, item.expected_outputs.map((output) => output.id))
      || !addEntityIds(entityIds, item.validators.map((validator) => validator.id))) return null
  }
  const requirementIds = new Set(requirements.map((entry) => entry.id))
  const acceptanceIds = new Set(acceptanceCriteria.map((entry) => entry.id))
  const itemIds = new Set(items.map((item) => item.id))
  const validateCoverage = (entries: readonly TaskPlanCoverageEntry[], catalogIds: Set<string>, uncovered: readonly string[]): boolean =>
    entries.length === catalogIds.size
      && entries.every((entry) => catalogIds.has(entry.id))
      && new Set(entries.map((entry) => entry.id)).size === entries.length
      && uncovered.every((id) => catalogIds.has(id))
      && new Set(uncovered).size === uncovered.length
      && entries.every((entry) => uncovered.includes(entry.id) === (entry.work_item_ids.length === 0))
  if (!validateCoverage(coverage.requirements, requirementIds, coverage.uncovered_requirement_ids)
    || !validateCoverage(coverage.acceptance_criteria, acceptanceIds, coverage.uncovered_acceptance_ids)
    || coverage.complete !== (coverage.uncovered_requirement_ids.length === 0 && coverage.uncovered_acceptance_ids.length === 0)
    || !coverage.requirements.every((entry) => entry.work_item_ids.every((id) => itemIds.has(id)))
    || !coverage.acceptance_criteria.every((entry) => entry.work_item_ids.every((id) => itemIds.has(id)))
    || !dependencies.edges.every((edge) => itemIds.has(edge.from_work_item_id) && itemIds.has(edge.to_work_item_id))
    || dependencies.cyclic_work_item_ids.some((id) => !itemIds.has(id))
    || !resources.conflicts.every((entry) => entry.work_item_ids.every((id) => itemIds.has(id)))
    || !resources.serialized.every((entry) => itemIds.has(entry.before_work_item_id) && itemIds.has(entry.after_work_item_id))
    || !sameCoverage(validation.coverage, coverage)
    || !sameDependencies(validation.dependencies, dependencies)
    || !sameResources(validation.resources, resources)
    || completeness.state !== (coverage.complete ? 'complete' : 'incomplete')
    || validation.valid !== (validation.issues.length === 0 && !validation.truncated)
    || validation.freezable !== validation.valid
    || value.schedulable !== (value.revision_status === 'frozen' && validation.valid)) return null
  return {
    schema_version: TASK_PLAN_READ_SCHEMA_VERSION,
    source: 'canonical',
    schedulable: value.schedulable,
    plan_id: value.plan_id,
    revision_id: value.revision_id,
    revision_number: value.revision_number,
    fingerprint: value.fingerprint,
    revision_status: value.revision_status,
    validation,
    completeness,
    requirements,
    acceptance_criteria: acceptanceCriteria,
    groups,
    items,
    coverage,
    dependencies,
    resources,
    projection,
  }
}

function decodeLegacy(value: Record<string, unknown>): LegacyTaskPlanReadModelV1 | null {
  const budgetState = budget(MAX_TASK_PLAN_LEGACY_PROJECTION_BYTES)
  if (!exactKeys(value, ['schema_version', 'source', 'schedulable', 'groups', 'items', 'completeness', 'projection'])
    || !consume(budgetState) || value.schema_version !== TASK_PLAN_READ_SCHEMA_VERSION
    || value.source !== 'legacy' || value.schedulable !== false) return null
  const groups = strictArray(value.groups, budgetState, 0)
  const itemsValue = strictArray(value.items, budgetState, MAX_TASK_PLAN_WORK_ITEMS)
  if (groups === null || groups.length !== 0 || itemsValue === null) return null
  const items: LegacyTaskPlanItemV1[] = []
  const ids = new Set<string>()
  for (const [index, entry] of itemsValue.entries()) {
    if (!exactKeys(entry, [
      'id', 'identity_quality', 'title', 'stage', 'completed', 'order', 'depends_on',
      'requirement_refs', 'acceptance_refs', 'resource_claims', 'expected_outputs', 'validators',
    ]) || !consume(budgetState) || entry.identity_quality !== 'legacy-derived'
      || !safeIdentifier(entry.id, budgetState) || ids.has(entry.id)
      || !safeText(entry.title, budgetState)
      || (entry.stage !== null && !safeText(entry.stage, budgetState))
      || typeof entry.completed !== 'boolean' || !Number.isSafeInteger(entry.order)
      || entry.order !== index) return null
    const dependsOn = strictArray(entry.depends_on, budgetState, 0)
    const requirementRefs = strictArray(entry.requirement_refs, budgetState, 0)
    const acceptanceRefs = strictArray(entry.acceptance_refs, budgetState, 0)
    const resourceClaims = strictArray(entry.resource_claims, budgetState, 0)
    const expectedOutputs = strictArray(entry.expected_outputs, budgetState, 0)
    const validators = strictArray(entry.validators, budgetState, 0)
    if (dependsOn === null || requirementRefs === null || acceptanceRefs === null
      || resourceClaims === null || expectedOutputs === null || validators === null
      || dependsOn.length !== 0 || requirementRefs.length !== 0 || acceptanceRefs.length !== 0
      || resourceClaims.length !== 0 || expectedOutputs.length !== 0 || validators.length !== 0) return null
    ids.add(entry.id)
    items.push({
      id: entry.id,
      identity_quality: 'legacy-derived',
      title: entry.title,
      stage: entry.stage,
      completed: entry.completed,
      order: entry.order,
      depends_on: [],
      requirement_refs: [],
      acceptance_refs: [],
      resource_claims: [],
      expected_outputs: [],
      validators: [],
    })
  }
  if (!exactKeys(value.completeness, ['state', 'reason']) || !consume(budgetState)
    || value.completeness.state !== 'unknown'
    || value.completeness.reason !== 'legacy-semantics-unproven'
    || !exactKeys(value.projection, ['state']) || !consume(budgetState)
    || value.projection.state !== 'legacy') return null
  return {
    schema_version: TASK_PLAN_READ_SCHEMA_VERSION,
    source: 'legacy',
    schedulable: false,
    groups: [],
    items,
    completeness: { state: 'unknown', reason: 'legacy-semantics-unproven' },
    projection: { state: 'legacy' },
  }
}

export function decodeTaskPlanReadModel(value: unknown): TaskPlanReadModelV1 | null {
  if (!isPlainRecord(value)) return null
  if (value.source === 'canonical') return decodeCanonical(value)
  if (value.source === 'legacy') return decodeLegacy(value)
  return null
}

export const decodeTaskPlanReadModelV1 = decodeTaskPlanReadModel

export class TaskPlanApiError extends ApiError {
  constructor(message: string, status: number, code?: TaskPlanErrorCode) {
    super(message, status)
    this.name = 'TaskPlanApiError'
    this.code = code
  }

  readonly code: TaskPlanErrorCode | undefined
}

const TASK_PLAN_ERROR_MESSAGES: Readonly<Record<TaskPlanErrorCode, string>> = {
  TASK_PLAN_CHANGE_INVALID: 'TaskPlan change 参数无效',
  TASK_PLAN_ROOT_REQUIRED: 'TaskPlan root 参数缺失',
  TASK_PLAN_ROOT_NOT_REGISTERED: 'TaskPlan root 未注册',
  TASK_PLAN_ROOT_FORBIDDEN: 'TaskPlan root 无权访问',
  TASK_PLAN_NOT_FOUND: 'TaskPlan 不存在',
  TASK_PLAN_PATH_FORBIDDEN: 'TaskPlan 路径不可访问',
  TASK_PLAN_CORRUPT: 'TaskPlan 数据损坏',
}

function taskPlanErrorCode(value: unknown): value is TaskPlanErrorCode {
  return isEnum(value, TASK_PLAN_ERROR_CODES)
}

function errorCodeFromBody(value: unknown): TaskPlanErrorCode | undefined {
  if (!exactKeys(value, ['ok', 'code', 'error']) || value.ok !== false
    || !taskPlanErrorCode(value.code) || typeof value.error !== 'string') return undefined
  return value.code
}

function taskPlanApiError(status: number, code?: TaskPlanErrorCode): TaskPlanApiError {
  const message = code === undefined
    ? `TaskPlan 请求失败（${status}）`
    : TASK_PLAN_ERROR_MESSAGES[code]
  return new TaskPlanApiError(message, status, code)
}

export async function fetchTaskPlan(
  root: string,
  change: string,
  signal?: AbortSignal,
): Promise<TaskPlanReadModelV1> {
  let response: Response
  try {
    response = await fetch(
      `/api/task-plans/${encodeURIComponent(change)}?root=${encodeURIComponent(root)}`,
      { headers: { Accept: 'application/json' }, signal },
    )
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) {
    let body: unknown
    try {
      body = await readJson(response)
    } catch (error) {
      if (isAbortError(error)) throw error
      body = undefined
    }
    throw taskPlanApiError(response.status, errorCodeFromBody(body))
  }
  let body: unknown
  try {
    body = await readJson(response)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw taskPlanApiError(response.status)
  }
  const decoded = decodeTaskPlanReadModel(body)
  if (decoded === null) throw taskPlanApiError(response.status)
  return decoded
}
