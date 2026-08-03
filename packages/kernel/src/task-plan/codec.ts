import { byteLength, deepFreeze, exactResourceKey, hasInvalidSurrogate, hasUnsafeControl } from './internal.js'
import {
  TASK_PLAN_LIMITS,
  TASK_PLAN_SCHEMA_VERSION,
  type ExpectedOutputKind,
  type ExpectedOutputV1,
  type ResourceAccess,
  type ResourceClaimV1,
  type ResourceKind,
  type TaskGroupV1,
  type TaskPlanCatalogEntry,
  type TaskPlanCodecError,
  type TaskPlanCodecErrorCode,
  type TaskPlanDecodeResult,
  type TaskPlanRevisionStatus,
  type TaskPlanRevisionV1,
  type TaskValidatorKind,
  type TaskValidatorV1,
  type WorkItemV1,
} from './types.js'

interface Collector {
  readonly errors: TaskPlanCodecError[]
  overflow: boolean
  decodeNodes: number
  textBytes: number
  budgetExceeded: boolean
}

function error(collector: Collector, code: TaskPlanCodecErrorCode, path: string): void {
  if (collector.errors.length < TASK_PLAN_LIMITS.maxErrors) collector.errors.push({ code, path })
  else collector.overflow = true
}

function consumeBudget(collector: Collector, nodes: number, bytes: number, path: string): boolean {
  if (collector.budgetExceeded) return false
  collector.decodeNodes += nodes
  collector.textBytes += bytes
  if (
    collector.decodeNodes > TASK_PLAN_LIMITS.maxDecodeNodes
    || collector.textBytes > TASK_PLAN_LIMITS.maxDocumentBytes
  ) {
    collector.budgetExceeded = true
    error(collector, 'document_too_large', path)
    return false
  }
  return true
}

function record(value: unknown, path: string, collector: Collector): Record<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      error(collector, 'object_invalid', path)
      return undefined
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      error(collector, 'object_invalid', path)
      return undefined
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    const keys = Reflect.ownKeys(value)
    if (!consumeBudget(collector, keys.length + 1, 0, path)) return undefined
    for (const key of keys) {
      if (typeof key !== 'string') {
        error(collector, 'object_invalid', path)
        return undefined
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        error(collector, 'object_invalid', path)
        return undefined
      }
      result[key] = descriptor.value
    }
    return result
  } catch {
    error(collector, 'object_invalid', path)
    return undefined
  }
}

function closed(raw: Record<string, unknown>, allowed: readonly string[], path: string, collector: Collector): void {
  const keys = new Set(allowed)
  for (const key of Object.keys(raw).sort()) if (!keys.has(key)) error(collector, 'unknown_field', `${path}.${key}`)
}

function array(value: unknown, path: string, limit: number, collector: Collector): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      error(collector, 'array_invalid', path)
      return undefined
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (
      lengthDescriptor === undefined
      || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
      || typeof lengthDescriptor.value !== 'number'
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) {
      error(collector, 'array_invalid', path)
      return undefined
    }
    const length = lengthDescriptor.value
    if (length > limit) {
      error(collector, 'array_too_large', path)
      return undefined
    }
    if (!consumeBudget(collector, length + 1, 0, path)) return undefined
    const keys = Reflect.ownKeys(value)
    if (keys.length !== length + 1 || keys.some((key) => typeof key !== 'string')) {
      error(collector, 'array_invalid', path)
      return undefined
    }
    const result: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        error(collector, 'array_invalid', path)
        return undefined
      }
      result.push(descriptor.value)
    }
    return result
  } catch {
    error(collector, 'array_invalid', path)
    return undefined
  }
}

function text(
  value: unknown,
  path: string,
  collector: Collector,
  maxBytes = TASK_PLAN_LIMITS.maxTextBytes,
): string | undefined {
  if (value === undefined) {
    error(collector, 'field_required', path)
    return undefined
  }
  if (typeof value !== 'string') {
    error(collector, 'field_type', path)
    return undefined
  }
  if (hasInvalidSurrogate(value)) {
    error(collector, 'unicode_invalid', path)
    return undefined
  }
  if (hasUnsafeControl(value)) {
    error(collector, 'control_character', path)
    return undefined
  }
  if (value === '' || value !== value.trim()) {
    error(collector, 'field_required', path)
    return undefined
  }
  if (byteLength(value) > maxBytes) {
    error(collector, 'field_too_large', path)
    return undefined
  }
  if (!consumeBudget(collector, 0, byteLength(value), path)) return undefined
  return value
}

function identifier(value: unknown, path: string, collector: Collector): string | undefined {
  const candidate = text(value, path, collector, TASK_PLAN_LIMITS.maxIdBytes)
  if (candidate !== undefined && (
    candidate !== candidate.normalize('NFC')
    || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M}._-]*$/u.test(candidate)
    || candidate.includes('--')
  )) {
    error(collector, 'identifier_invalid', path)
    return undefined
  }
  return candidate
}

function enumValue<T extends string>(
  value: unknown,
  values: ReadonlySet<T>,
  path: string,
  collector: Collector,
): T | undefined {
  const candidate = text(value, path, collector, TASK_PLAN_LIMITS.maxIdBytes)
  if (candidate === undefined) return undefined
  if (!values.has(candidate as T)) {
    error(collector, 'enum_invalid', path)
    return undefined
  }
  return candidate as T
}

function stringArray(value: unknown, path: string, collector: Collector): readonly string[] {
  const values = array(value, path, TASK_PLAN_LIMITS.maxRelationsPerItem, collector)
  if (values === undefined) return []
  return values.flatMap((entry, index) => {
    const decoded = identifier(entry, `${path}[${index}]`, collector)
    return decoded === undefined ? [] : [decoded]
  })
}

function catalog(value: unknown, path: string, collector: Collector): readonly TaskPlanCatalogEntry[] {
  const values = array(value, path, TASK_PLAN_LIMITS.maxCatalogEntries, collector)
  if (values === undefined) return []
  return values.flatMap((entry, index) => {
    const itemPath = `${path}[${index}]`
    const raw = record(entry, itemPath, collector)
    if (raw === undefined) return []
    closed(raw, ['id', 'title'], itemPath, collector)
    const id = identifier(raw.id, `${itemPath}.id`, collector)
    const title = text(raw.title, `${itemPath}.title`, collector)
    return id === undefined || title === undefined ? [] : [{ id, title }]
  })
}

function groups(value: unknown, collector: Collector): readonly TaskGroupV1[] {
  const path = '$.groups'
  const values = array(value, path, TASK_PLAN_LIMITS.maxGroups, collector)
  if (values === undefined) return []
  return values.flatMap((entry, index) => {
    const itemPath = `${path}[${index}]`
    const raw = record(entry, itemPath, collector)
    if (raw === undefined) return []
    closed(raw, ['id', 'title', 'parent_id', 'work_item_ids'], itemPath, collector)
    const id = identifier(raw.id, `${itemPath}.id`, collector)
    const title = text(raw.title, `${itemPath}.title`, collector)
    const parent = raw.parent_id === null ? null : identifier(raw.parent_id, `${itemPath}.parent_id`, collector)
    const workItemIds = stringArray(raw.work_item_ids, `${itemPath}.work_item_ids`, collector)
    return id === undefined || title === undefined || parent === undefined ? [] : [{
      id, title, parent_id: parent, work_item_ids: workItemIds,
    }]
  })
}

const RESOURCE_KINDS = new Set<ResourceKind>(['path', 'logical', 'external'])
const RESOURCE_ACCESS = new Set<ResourceAccess>(['read', 'write'])
const OUTPUT_KINDS = new Set<ExpectedOutputKind>(['file', 'artifact', 'value'])
const VALIDATOR_KINDS = new Set<TaskValidatorKind>(['file-exists', 'json-schema', 'test-report', 'artifact-digest'])

function resourceClaims(value: unknown, path: string, collector: Collector): readonly ResourceClaimV1[] {
  const values = array(value, path, TASK_PLAN_LIMITS.maxRelationsPerItem, collector)
  if (values === undefined) return []
  return values.flatMap((entry, index) => {
    const itemPath = `${path}[${index}]`
    const raw = record(entry, itemPath, collector)
    if (raw === undefined) return []
    closed(raw, ['kind', 'access', 'key'], itemPath, collector)
    const kind = enumValue(raw.kind, RESOURCE_KINDS, `${itemPath}.kind`, collector)
    const access = enumValue(raw.access, RESOURCE_ACCESS, `${itemPath}.access`, collector)
    const key = text(raw.key, `${itemPath}.key`, collector, TASK_PLAN_LIMITS.maxResourceBytes)
    if (kind !== undefined && key !== undefined && exactResourceKey(kind, key) === undefined) {
      error(collector, 'resource_not_normalized', `${itemPath}.key`)
      return []
    }
    return kind === undefined || access === undefined || key === undefined ? [] : [{ kind, access, key }]
  })
}

function outputs(value: unknown, path: string, collector: Collector): readonly ExpectedOutputV1[] {
  const values = array(value, path, TASK_PLAN_LIMITS.maxRelationsPerItem, collector)
  if (values === undefined) return []
  return values.flatMap((entry, index) => {
    const itemPath = `${path}[${index}]`
    const raw = record(entry, itemPath, collector)
    if (raw === undefined) return []
    closed(raw, ['id', 'kind', 'ref'], itemPath, collector)
    const id = identifier(raw.id, `${itemPath}.id`, collector)
    const kind = enumValue(raw.kind, OUTPUT_KINDS, `${itemPath}.kind`, collector)
    const ref = text(raw.ref, `${itemPath}.ref`, collector, TASK_PLAN_LIMITS.maxResourceBytes)
    if (kind === 'file' && ref !== undefined && exactResourceKey('path', ref) === undefined) {
      error(collector, 'resource_not_normalized', `${itemPath}.ref`)
      return []
    }
    return id === undefined || kind === undefined || ref === undefined ? [] : [{ id, kind, ref }]
  })
}

function validators(value: unknown, path: string, collector: Collector): readonly TaskValidatorV1[] {
  const values = array(value, path, TASK_PLAN_LIMITS.maxRelationsPerItem, collector)
  if (values === undefined) return []
  return values.flatMap((entry, index) => {
    const itemPath = `${path}[${index}]`
    const raw = record(entry, itemPath, collector)
    if (raw === undefined) return []
    closed(raw, ['id', 'kind', 'version', 'output_ids'], itemPath, collector)
    const id = identifier(raw.id, `${itemPath}.id`, collector)
    const kind = enumValue(raw.kind, VALIDATOR_KINDS, `${itemPath}.kind`, collector)
    if (raw.version !== 1) error(collector, typeof raw.version === 'number' ? 'enum_invalid' : 'field_type', `${itemPath}.version`)
    const outputIds = stringArray(raw.output_ids, `${itemPath}.output_ids`, collector)
    return id === undefined || kind === undefined || raw.version !== 1 ? [] : [{ id, kind, version: 1, output_ids: outputIds }]
  })
}

function workItems(value: unknown, collector: Collector): readonly WorkItemV1[] {
  const path = '$.work_items'
  const values = array(value, path, TASK_PLAN_LIMITS.maxWorkItems, collector)
  if (values === undefined) return []
  return values.flatMap((entry, index) => {
    const itemPath = `${path}[${index}]`
    const raw = record(entry, itemPath, collector)
    if (raw === undefined) return []
    closed(raw, [
      'id', 'title', 'description', 'group_id', 'requirement_refs', 'acceptance_refs', 'depends_on',
      'resource_claims', 'expected_outputs', 'validators',
    ], itemPath, collector)
    const id = identifier(raw.id, `${itemPath}.id`, collector)
    const title = text(raw.title, `${itemPath}.title`, collector)
    const description = raw.description === undefined ? undefined : text(raw.description, `${itemPath}.description`, collector)
    const groupId = identifier(raw.group_id, `${itemPath}.group_id`, collector)
    const result = id === undefined || title === undefined || groupId === undefined ? undefined : {
      id, title, ...(description === undefined ? {} : { description }), group_id: groupId,
      requirement_refs: stringArray(raw.requirement_refs, `${itemPath}.requirement_refs`, collector),
      acceptance_refs: stringArray(raw.acceptance_refs, `${itemPath}.acceptance_refs`, collector),
      depends_on: stringArray(raw.depends_on, `${itemPath}.depends_on`, collector),
      resource_claims: resourceClaims(raw.resource_claims, `${itemPath}.resource_claims`, collector),
      expected_outputs: outputs(raw.expected_outputs, `${itemPath}.expected_outputs`, collector),
      validators: validators(raw.validators, `${itemPath}.validators`, collector),
    }
    return result === undefined ? [] : [result]
  })
}

function duplicateIds(value: TaskPlanRevisionV1, collector: Collector): void {
  const seen = new Set<string>()
  const entries: readonly (readonly [string, string])[] = [
    ...value.requirements.map((entry, index) => [entry.id, `$.requirements[${index}].id`] as const),
    ...value.acceptance_criteria.map((entry, index) => [entry.id, `$.acceptance_criteria[${index}].id`] as const),
    ...value.groups.map((entry, index) => [entry.id, `$.groups[${index}].id`] as const),
    ...value.work_items.flatMap((item, index) => [
      [item.id, `$.work_items[${index}].id`] as const,
      ...item.expected_outputs.map((entry, outputIndex) => [entry.id, `$.work_items[${index}].expected_outputs[${outputIndex}].id`] as const),
      ...item.validators.map((entry, validatorIndex) => [entry.id, `$.work_items[${index}].validators[${validatorIndex}].id`] as const),
    ]),
  ]
  for (const [id, path] of entries) {
    if (seen.has(id)) error(collector, 'duplicate_id', path)
    else seen.add(id)
  }
}

function decodeUnknown(input: unknown, collector: Collector): TaskPlanRevisionV1 | undefined {
  const raw = record(input, '$', collector)
  if (raw === undefined) return undefined
  closed(raw, [
    'schema_version', 'plan_id', 'revision_id', 'revision_number', 'status', 'created_at',
    'requirements', 'acceptance_criteria', 'groups', 'work_items',
  ], '$', collector)
  if (raw.schema_version !== TASK_PLAN_SCHEMA_VERSION) {
    error(collector, typeof raw.schema_version === 'string' ? 'enum_invalid' : 'field_type', '$.schema_version')
  }
  const planId = identifier(raw.plan_id, '$.plan_id', collector)
  const revisionId = identifier(raw.revision_id, '$.revision_id', collector)
  if (!Number.isSafeInteger(raw.revision_number) || (raw.revision_number as number) < 1) {
    error(collector, 'integer_invalid', '$.revision_number')
  }
  const status = enumValue(raw.status, new Set<TaskPlanRevisionStatus>(['draft', 'frozen']), '$.status', collector)
  const createdAt = text(raw.created_at, '$.created_at', collector, 64)
  if (createdAt !== undefined) {
    const parsed = Date.parse(createdAt)
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== createdAt) error(collector, 'timestamp_invalid', '$.created_at')
  }
  const result = planId !== undefined && revisionId !== undefined && status !== undefined && createdAt !== undefined
    && Number.isSafeInteger(raw.revision_number) && (raw.revision_number as number) >= 1
    ? {
        schema_version: TASK_PLAN_SCHEMA_VERSION,
        plan_id: planId,
        revision_id: revisionId,
        revision_number: raw.revision_number as number,
        status,
        created_at: createdAt,
        requirements: catalog(raw.requirements, '$.requirements', collector),
        acceptance_criteria: catalog(raw.acceptance_criteria, '$.acceptance_criteria', collector),
        groups: groups(raw.groups, collector),
        work_items: workItems(raw.work_items, collector),
      }
    : undefined
  if (result !== undefined) duplicateIds(result, collector)
  return result
}

export function decodeTaskPlanRevisionV1(input: string | unknown): TaskPlanDecodeResult {
  const collector: Collector = {
    errors: [], overflow: false, decodeNodes: 0, textBytes: 0, budgetExceeded: false,
  }
  let candidate = input
  if (typeof input === 'string') {
    if (byteLength(input) > TASK_PLAN_LIMITS.maxRevisionBytes) {
      return { ok: false, errors: [{ code: 'document_too_large', path: '$' }], overflow: false }
    }
    try { candidate = JSON.parse(input) as unknown } catch {
      return { ok: false, errors: [{ code: 'json_invalid', path: '$' }], overflow: false }
    }
  }
  const value = decodeUnknown(candidate, collector)
  if (!collector.budgetExceeded && value !== undefined
    && byteLength(JSON.stringify(value)) > TASK_PLAN_LIMITS.maxDocumentBytes) {
    error(collector, 'document_too_large', '$')
  }
  if (value === undefined || collector.errors.length > 0 || collector.overflow) {
    return deepFreeze({ ok: false, errors: collector.errors, overflow: collector.overflow })
  }
  return deepFreeze({ ok: true, value })
}

export function encodeTaskPlanRevisionV1(value: TaskPlanRevisionV1): string {
  const decoded = decodeTaskPlanRevisionV1(value)
  if (!decoded.ok) throw new TypeError(`invalid TaskPlan revision at ${decoded.errors[0]?.path ?? '$'}`)
  return JSON.stringify(decoded.value)
}
