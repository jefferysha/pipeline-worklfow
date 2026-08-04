import { ApiError, isRecord, readJson, stringArray, wrapNetwork } from './transport'

export type SkillInvocationStatus = 'completed' | 'failed' | 'interrupted' | 'incomplete' | 'corrupt'
export type SkillInvocationValidatorStatus = 'pass' | 'fail' | 'unknown'

export interface SkillInvocationReadItem {
  readonly schema_version: 'skill-invocation-read/v1'
  readonly invocation_id: string
  readonly status: SkillInvocationStatus
  readonly skill: { readonly id: string; readonly version: string }
  readonly subject: {
    readonly workflow_definition_id: string
    readonly workflow_run_id: string
    readonly step_id: string
    readonly step_visit: { readonly run_id: string; readonly transition_sequence: number }
    readonly task_plan_revision_id?: string
    readonly work_item_id?: string
    readonly attempt?: { readonly attempt_id: string; readonly reservation_id: string }
  }
  readonly started_at: string
  readonly finished_at?: string
  readonly input: { readonly schema_id: string; readonly fields: readonly SkillInvocationField[] }
  readonly output?: { readonly schema_id: string; readonly fields: readonly SkillInvocationField[] }
  readonly questions: readonly {
    readonly id: string
    readonly key: string
    readonly schema_id: string
    readonly option_ids: readonly string[]
    readonly requiredness: 'routine' | 'advisory' | 'hard-gate'
    readonly shown: boolean
  }[]
  readonly decisions: readonly {
    readonly id: string
    readonly question_id: string
    readonly mode: 'user-answer' | 'recommended-default'
    readonly selected_option_ids: readonly string[]
    readonly free_text_classification?: SkillInvocationFieldClassification
    readonly policy?: { readonly id: string; readonly version: string; readonly rule_id: string }
    readonly rationale_code?: string
  }[]
  readonly artifacts: readonly {
    readonly binding_id: string
    readonly output_id: string
    readonly kind: 'document' | 'file' | 'artifact' | 'value'
    readonly ref: string
    readonly state: 'intent' | 'bound'
    readonly validators: readonly { readonly id: string; readonly status: SkillInvocationValidatorStatus; readonly code?: string }[]
  }[]
  readonly terminal_code?: string
}

export interface SkillInvocationField {
  readonly name: string
  readonly classification: SkillInvocationFieldClassification
  readonly validator: { readonly id: string; readonly status: SkillInvocationValidatorStatus; readonly code?: string }
}

export type SkillInvocationFieldClassification =
  | 'identifier' | 'project-data' | 'configuration' | 'user-provided' | 'sensitive-redacted'

export interface SkillInvocationList {
  readonly schema_version: 'skill-invocation-list/v1'
  readonly state: 'ready' | 'empty'
  readonly items: readonly SkillInvocationReadItem[]
}

const STATUSES = new Set(['completed', 'failed', 'interrupted', 'incomplete', 'corrupt'])
const VALIDATOR_STATUSES = new Set(['pass', 'fail', 'unknown'])
const REQUIREDNESS = new Set(['routine', 'advisory', 'hard-gate'])
const DECISION_MODES = new Set(['user-answer', 'recommended-default'])
const ARTIFACT_KINDS = new Set(['document', 'file', 'artifact', 'value'])
const ARTIFACT_STATES = new Set(['intent', 'bound'])
const CLASSIFICATIONS = new Set(['identifier', 'project-data', 'configuration', 'user-provided', 'sensitive-redacted'])

function closed(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function validator(value: unknown): value is { id: string; status: SkillInvocationValidatorStatus; code?: string } {
  return isRecord(value) && closed(value, ['id', 'status', 'code']) && typeof value.id === 'string'
    && typeof value.status === 'string' && VALIDATOR_STATUSES.has(value.status)
    && optionalString(value.code)
}

function field(value: unknown): value is SkillInvocationField {
  return isRecord(value) && closed(value, ['name', 'classification', 'validator'])
    && typeof value.name === 'string' && typeof value.classification === 'string'
    && CLASSIFICATIONS.has(value.classification)
    && validator(value.validator)
}

function subject(value: unknown): value is SkillInvocationReadItem['subject'] {
  if (!isRecord(value) || !closed(value, [
    'workflow_definition_id', 'workflow_run_id', 'step_id', 'step_visit',
    'task_plan_revision_id', 'work_item_id', 'attempt',
  ]) || typeof value.workflow_definition_id !== 'string'
    || typeof value.workflow_run_id !== 'string' || typeof value.step_id !== 'string'
    || !isRecord(value.step_visit) || !closed(value.step_visit, ['run_id', 'transition_sequence'])
    || typeof value.step_visit.run_id !== 'string' || typeof value.step_visit.transition_sequence !== 'number'
    || !Number.isSafeInteger(value.step_visit.transition_sequence)
    || value.step_visit.transition_sequence < 0) return false
  if (!optionalString(value.task_plan_revision_id) || !optionalString(value.work_item_id)) return false
  if ((value.task_plan_revision_id === undefined) !== (value.work_item_id === undefined)) return false
  if (value.attempt === undefined) return true
  return isRecord(value.attempt) && closed(value.attempt, ['attempt_id', 'reservation_id'])
    && typeof value.attempt.attempt_id === 'string'
    && typeof value.attempt.reservation_id === 'string'
}

function io(value: unknown): value is SkillInvocationReadItem['input'] {
  return isRecord(value) && closed(value, ['schema_id', 'fields']) && typeof value.schema_id === 'string'
    && Array.isArray(value.fields) && value.fields.length <= 128 && value.fields.every(field)
}

function question(value: unknown): value is SkillInvocationReadItem['questions'][number] {
  return isRecord(value) && closed(value, ['id', 'key', 'schema_id', 'option_ids', 'requiredness', 'shown'])
    && typeof value.id === 'string' && typeof value.key === 'string' && typeof value.schema_id === 'string'
    && stringArray(value.option_ids) && value.option_ids.length <= 64
    && typeof value.requiredness === 'string' && REQUIREDNESS.has(value.requiredness)
    && typeof value.shown === 'boolean'
}

function decision(value: unknown): value is SkillInvocationReadItem['decisions'][number] {
  const validPolicy = value !== null && isRecord(value) && (value.policy === undefined || (
    isRecord(value.policy) && closed(value.policy, ['id', 'version', 'rule_id'])
    && typeof value.policy.id === 'string'
    && typeof value.policy.version === 'string' && typeof value.policy.rule_id === 'string'
  ))
  return isRecord(value) && closed(value, [
    'id', 'question_id', 'mode', 'selected_option_ids', 'free_text_classification', 'policy', 'rationale_code',
  ]) && typeof value.id === 'string' && typeof value.question_id === 'string'
    && typeof value.mode === 'string' && DECISION_MODES.has(value.mode)
    && stringArray(value.selected_option_ids) && value.selected_option_ids.length <= 64
    && validPolicy && optionalString(value.rationale_code)
    && (value.free_text_classification === undefined
      || (typeof value.free_text_classification === 'string' && CLASSIFICATIONS.has(value.free_text_classification)))
}

function artifact(value: unknown): value is SkillInvocationReadItem['artifacts'][number] {
  return isRecord(value) && closed(value, ['binding_id', 'output_id', 'kind', 'ref', 'state', 'validators'])
    && typeof value.binding_id === 'string' && typeof value.output_id === 'string'
    && typeof value.kind === 'string' && ARTIFACT_KINDS.has(value.kind)
    && typeof value.ref === 'string' && typeof value.state === 'string' && ARTIFACT_STATES.has(value.state)
    && Array.isArray(value.validators) && value.validators.length <= 128 && value.validators.every(validator)
}

function item(value: unknown): value is SkillInvocationReadItem {
  return isRecord(value) && closed(value, [
    'schema_version', 'invocation_id', 'status', 'skill', 'subject', 'started_at', 'finished_at',
    'input', 'output', 'questions', 'decisions', 'artifacts', 'terminal_code',
  ]) && value.schema_version === 'skill-invocation-read/v1'
    && typeof value.invocation_id === 'string' && typeof value.status === 'string' && STATUSES.has(value.status)
    && isRecord(value.skill) && closed(value.skill, ['id', 'version'])
    && typeof value.skill.id === 'string' && typeof value.skill.version === 'string'
    && subject(value.subject) && typeof value.started_at === 'string' && optionalString(value.finished_at)
    && io(value.input) && (value.output === undefined || io(value.output))
    && Array.isArray(value.questions) && value.questions.length <= 128 && value.questions.every(question)
    && Array.isArray(value.decisions) && value.decisions.length <= 128 && value.decisions.every(decision)
    && Array.isArray(value.artifacts) && value.artifacts.length <= 128 && value.artifacts.every(artifact)
    && optionalString(value.terminal_code)
}

export function decodeSkillInvocationList(value: unknown): SkillInvocationList | null {
  if (!isRecord(value) || !closed(value, ['schema_version', 'state', 'items'])
    || value.schema_version !== 'skill-invocation-list/v1'
    || (value.state !== 'ready' && value.state !== 'empty')
    || !Array.isArray(value.items) || value.items.length > 1024 || !value.items.every(item)) return null
  return { schema_version: 'skill-invocation-list/v1', state: value.state, items: value.items }
}

export async function fetchSkillInvocations(
  root: string,
  change: string,
  signal?: AbortSignal,
): Promise<SkillInvocationList> {
  let response: Response
  try {
    response = await fetch(`/api/skill-invocations/${encodeURIComponent(change)}?root=${encodeURIComponent(root)}`, { signal })
  } catch (error) {
    wrapNetwork(error)
  }
  const body = await readJson(response)
  if (!response.ok) {
    const detail = isRecord(body) && typeof body.error === 'string' ? body.error : 'Skill invocation request failed'
    throw new ApiError(detail, response.status)
  }
  const decoded = decodeSkillInvocationList(body)
  if (decoded === null) throw new ApiError('Skill invocation response is invalid', response.status)
  return decoded
}
