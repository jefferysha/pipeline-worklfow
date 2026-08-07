import { ApiError, getToken, readJson, throwApiError, wrapNetwork } from './transport'

export type TaskRunState = 'pending' | 'admitted' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked' | 'unknown'
export type TaskRunItemState = 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked-upstream' | 'invalidated' | 'unknown'

export interface TaskRunBlocker {
  code: string
  detail: string
  remediation: string
  work_item_id?: string
}

export interface TaskRunOperation {
  operation: 'retry' | 'cancel' | 'resume'
  work_item_id?: string
  expected_run_revision: number
  expected_state: string
}

export interface TaskRunDto {
  schema_version: 'task-run/v1'
  plan: { plan_id: string; revision_id: string; revision_number: number; fingerprint: string }
  run_revision: number
  state: TaskRunState
  admission: { status: 'admitted' | 'blocked' | 'unknown'; blockers: TaskRunBlocker[] }
  waves: Array<{ index: number; work_item_ids: string[]; parallelism: number }>
  parallelism: number
  serialized_resource_conflicts: Array<{
    resource: string
    before_work_item_id: string
    after_work_item_id: string
  }>
  items: Array<{
    work_item_id: string
    title: string
    state: TaskRunItemState
    depends_on: string[]
    resource_claims: Array<{ kind: string; access: string; key: string }>
    latest_attempt: TaskRunAttempt | null
  }>
  attempts: TaskRunAttempt[]
  operations: Array<TaskRunOperation & { operation_id: string; recorded_at: string }>
  blockers: TaskRunBlocker[]
  invalidations: Array<{
    work_item_id: string
    caused_by_work_item_id: string
    expected_digest: string
    actual_digest: string
  }>
  validator_verdicts: Array<{
    validator_id: string
    scope: string
    target_id?: string
    status: string
    code?: string
    input_digests?: Record<string, string>
  }>
  groups: Array<{ group_id: string; state: string; work_item_ids: string[] }>
  allowed_operations: TaskRunOperation[]
}

export interface TaskRunAttempt {
  attempt_id: string
  work_item_id: string
  attempt_number: number
  status: string
  recorded_at: string
  input_digests: Record<string, string>
  output_digest?: string
  error_code?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function string(value: unknown): value is string {
  return typeof value === 'string'
}

function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(string)
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || string(value)
}

function blocker(value: unknown): TaskRunBlocker | null {
  if (!record(value) || !string(value.code) || !string(value.detail)
    || !string(value.remediation) || !optionalString(value.work_item_id)) return null
  return {
    code: value.code,
    detail: value.detail,
    remediation: value.remediation,
    ...(value.work_item_id === undefined ? {} : { work_item_id: value.work_item_id }),
  }
}

function operation(value: unknown): TaskRunOperation | null {
  if (!record(value) || !['retry', 'cancel', 'resume'].includes(String(value.operation))
    || !optionalString(value.work_item_id) || !integer(value.expected_run_revision)
    || !string(value.expected_state)) return null
  return {
    operation: value.operation as TaskRunOperation['operation'],
    ...(value.work_item_id === undefined ? {} : { work_item_id: value.work_item_id }),
    expected_run_revision: value.expected_run_revision,
    expected_state: value.expected_state,
  }
}

function attempt(value: unknown): TaskRunAttempt | null {
  if (!record(value) || !string(value.attempt_id) || !string(value.work_item_id)
    || !integer(value.attempt_number) || !string(value.status) || !string(value.recorded_at)
    || !record(value.input_digests) || !Object.values(value.input_digests).every(string)
    || !optionalString(value.output_digest) || !optionalString(value.error_code)) return null
  return {
    attempt_id: value.attempt_id,
    work_item_id: value.work_item_id,
    attempt_number: value.attempt_number,
    status: value.status,
    recorded_at: value.recorded_at,
    input_digests: value.input_digests as Record<string, string>,
    ...(value.output_digest === undefined ? {} : { output_digest: value.output_digest }),
    ...(value.error_code === undefined ? {} : { error_code: value.error_code }),
  }
}

function runState(value: unknown): TaskRunState {
  return ['pending', 'admitted', 'running', 'succeeded', 'failed', 'cancelled', 'blocked'].includes(String(value))
    ? value as TaskRunState
    : 'unknown'
}

function itemState(value: unknown): TaskRunItemState {
  return ['pending', 'ready', 'running', 'succeeded', 'failed', 'cancelled', 'blocked-upstream', 'invalidated'].includes(String(value))
    ? value as TaskRunItemState
    : 'unknown'
}

function decodeTaskRun(value: unknown): TaskRunDto | null {
  if (!record(value) || value.schema_version !== 'task-run/v1' || !record(value.plan)
    || !string(value.plan.plan_id) || !string(value.plan.revision_id) || !integer(value.plan.revision_number)
    || !string(value.plan.fingerprint)
    || !integer(value.run_revision) || !record(value.admission) || !Array.isArray(value.admission.blockers)
    || !Array.isArray(value.waves) || !integer(value.parallelism)
    || !Array.isArray(value.serialized_resource_conflicts) || !Array.isArray(value.items)
    || !Array.isArray(value.attempts) || !Array.isArray(value.operations) || !Array.isArray(value.blockers)
    || !Array.isArray(value.invalidations) || !Array.isArray(value.validator_verdicts)
    || !Array.isArray(value.groups) || !Array.isArray(value.allowed_operations)) return null

  const admissionBlockers = value.admission.blockers.map(blocker)
  const blockers = value.blockers.map(blocker)
  const attempts = value.attempts.map(attempt)
  const allowedOperations = value.allowed_operations.map(operation)
  if (admissionBlockers.includes(null) || blockers.includes(null) || attempts.includes(null)
    || allowedOperations.includes(null)) return null

  const waves = value.waves.map((wave) => {
    if (!record(wave) || !integer(wave.index) || !strings(wave.work_item_ids) || !integer(wave.parallelism)) return null
    return { index: wave.index, work_item_ids: wave.work_item_ids, parallelism: wave.parallelism }
  })
  const items = value.items.map((item) => {
    if (!record(item) || !string(item.work_item_id) || !string(item.title) || !strings(item.depends_on)
      || !Array.isArray(item.resource_claims) || !(item.latest_attempt === null || attempt(item.latest_attempt) !== null)) return null
    const claims = item.resource_claims.map((claim) => record(claim) && string(claim.kind)
      && string(claim.access) && string(claim.key)
      ? { kind: claim.kind, access: claim.access, key: claim.key }
      : null)
    if (claims.includes(null)) return null
    return {
      work_item_id: item.work_item_id,
      title: item.title,
      state: itemState(item.state),
      depends_on: item.depends_on,
      resource_claims: claims as TaskRunDto['items'][number]['resource_claims'],
      latest_attempt: item.latest_attempt === null ? null : attempt(item.latest_attempt),
    }
  })
  const resourceConflicts = value.serialized_resource_conflicts.map((entry) => record(entry)
    && string(entry.resource) && string(entry.before_work_item_id) && string(entry.after_work_item_id)
    ? {
        resource: entry.resource,
        before_work_item_id: entry.before_work_item_id,
        after_work_item_id: entry.after_work_item_id,
      }
    : null)
  const operationFacts = value.operations.map((fact) => {
    const parsed = operation(fact)
    if (parsed === null || !record(fact) || !string(fact.operation_id) || !string(fact.recorded_at)) return null
    return { ...parsed, operation_id: fact.operation_id, recorded_at: fact.recorded_at }
  })
  const invalidations = value.invalidations.map((entry) => record(entry)
    && string(entry.work_item_id) && string(entry.caused_by_work_item_id)
    && string(entry.expected_digest) && string(entry.actual_digest)
    ? {
        work_item_id: entry.work_item_id,
        caused_by_work_item_id: entry.caused_by_work_item_id,
        expected_digest: entry.expected_digest,
        actual_digest: entry.actual_digest,
      }
    : null)
  const verdicts = value.validator_verdicts.map((entry) => record(entry)
    && string(entry.validator_id) && string(entry.scope) && string(entry.status)
    && optionalString(entry.target_id) && optionalString(entry.code)
    && (entry.input_digests === undefined || (record(entry.input_digests)
      && Object.values(entry.input_digests).every(string)))
    ? {
        validator_id: entry.validator_id,
        scope: entry.scope,
        status: entry.status,
        ...(entry.target_id === undefined ? {} : { target_id: entry.target_id }),
        ...(entry.code === undefined ? {} : { code: entry.code }),
        ...(entry.input_digests === undefined
          ? {}
          : { input_digests: entry.input_digests as Record<string, string> }),
      }
    : null)
  const groups = value.groups.map((group) => record(group) && string(group.group_id)
    && string(group.state) && strings(group.work_item_ids)
    ? { group_id: group.group_id, state: group.state, work_item_ids: group.work_item_ids }
    : null)
  if ([waves, resourceConflicts, items, operationFacts, invalidations, verdicts, groups]
    .some((entries) => entries.includes(null))) return null

  const admissionStatus = value.admission.status === 'admitted' || value.admission.status === 'blocked'
    ? value.admission.status
    : 'unknown'
  return {
    schema_version: 'task-run/v1',
    plan: {
      plan_id: value.plan.plan_id,
      revision_id: value.plan.revision_id,
      revision_number: value.plan.revision_number,
      fingerprint: value.plan.fingerprint,
    },
    run_revision: value.run_revision,
    state: runState(value.state),
    admission: { status: admissionStatus, blockers: admissionBlockers as TaskRunBlocker[] },
    waves: waves as TaskRunDto['waves'],
    parallelism: value.parallelism,
    serialized_resource_conflicts: resourceConflicts as TaskRunDto['serialized_resource_conflicts'],
    items: items as TaskRunDto['items'],
    attempts: attempts as TaskRunAttempt[],
    operations: operationFacts as TaskRunDto['operations'],
    blockers: blockers as TaskRunBlocker[],
    invalidations: invalidations as TaskRunDto['invalidations'],
    validator_verdicts: verdicts as TaskRunDto['validator_verdicts'],
    groups: groups as TaskRunDto['groups'],
    allowed_operations: allowedOperations as TaskRunOperation[],
  }
}

async function request(url: string, init: RequestInit): Promise<TaskRunDto> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    return wrapNetwork(error)
  }
  if (!response.ok) return throwApiError(response, 'Task Run request failed')
  const decoded = decodeTaskRun(await readJson(response))
  if (decoded === null) throw new ApiError('Task Run response is invalid')
  return decoded
}

export function fetchTaskRun(root: string, change: string, signal?: AbortSignal): Promise<TaskRunDto> {
  return request(`/api/task-runs/${encodeURIComponent(change)}?root=${encodeURIComponent(root)}`, {
    headers: { Accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
}

export function postTaskRunOperation(root: string, change: string, value: TaskRunOperation): Promise<TaskRunDto> {
  return request(`/api/task-runs/${encodeURIComponent(change)}/operations`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, ...value }),
  })
}
