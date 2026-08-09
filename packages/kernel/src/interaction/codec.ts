import {
  expectedInteractionResult,
  INTERACTION_ACTORS,
  INTERACTION_CONTROL_STAGES,
  INTERACTION_EVENTS,
  INTERACTION_EXECUTION_MODES,
  INTERACTION_EFFECT_CODES,
  INTERACTION_OUTCOME_CODES,
  INTERACTION_PIPELINE_STAGES,
  INTERACTION_REASON_CODES,
  INTERACTION_RESULTS,
  INTERACTION_SURFACES,
  INTERACTION_TRACK_KINDS,
  INTERACTION_TRIGGER_CODES,
  INTERACTION_WORKFLOW_MODES,
  interactionEventBody,
  interactionEventId,
  interactionJourneyId,
  isInteractionExtensionCode,
  isInteractionHash,
  normalizedInteractionHash,
  stableInteractionStringify,
  type InteractionActor,
  type InteractionEventDraft,
  type InteractionEventV1,
  type InteractionEventV1Wire,
  type InteractionStepVisit,
} from './contract.js'

const EVENT_KEYS = [
  'schema', 'event_id', 'sequence', 'previous_event_hash', 'journey_id', 'occurred_at', 'change', 'run_id',
  'workflow', 'workflow_hash', 'origin_step_visit', 'step_visit', 'state_before_hash', 'state_after_hash',
  'actor', 'surface', 'execution_mode', 'workflow_mode', 'track', 'track_kind', 'pipeline_stage',
  'control_stage', 'event', 'reason_code', 'trigger_code', 'effect_code', 'result', 'outcome_code',
  'duration_ms',
] as const
const VISIT_KEYS = ['run_id', 'step', 'transition_sequence'] as const
const EVENT_KEY_SET = new Set<string>(EVENT_KEYS)
const VISIT_KEY_SET = new Set<string>(VISIT_KEYS)
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/

export class InteractionEventSchemaError extends Error {
  readonly code = 'event-schema-invalid' as const

  constructor(message: string) {
    super(message)
    this.name = 'InteractionEventSchemaError'
  }
}

function fail(message: string): never {
  throw new InteractionEventSchemaError(message)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} 必须是 object`)
  return value as Record<string, unknown>
}

function closedRecord(value: unknown, keys: ReadonlySet<string>, label: string): Record<string, unknown> {
  const output = record(value, label)
  for (const key of Object.keys(output)) if (!keys.has(key)) fail(`${label} 包含未知字段 '${key}'`)
  return output
}

function stringField(value: unknown, label: string, pattern = IDENTIFIER_RE): string {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${label} 非法`)
  return value
}

function enumField<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) fail(`${label} 非法`)
  return value as T
}

function hashField(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isInteractionHash(value)) fail(`${label} 非法 hash`)
  return value
}

function visitField(value: unknown, label: string): InteractionStepVisit {
  const raw = closedRecord(value, VISIT_KEY_SET, label)
  const runId = stringField(raw.run_id, `${label}.run_id`)
  const transitionSequence = raw.transition_sequence
  if (typeof transitionSequence !== 'number' || !Number.isSafeInteger(transitionSequence)
    || transitionSequence < 0) fail(`${label}.transition_sequence 非法`)
  const step = raw.step === undefined ? undefined : stringField(raw.step, `${label}.step`)
  return step === undefined ? { runId, transitionSequence } : { runId, transitionSequence, step }
}

function validateCode(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isInteractionExtensionCode(value)) fail(`${label} 必须是 namespaced code`)
  return value
}

function validateResultCombination(event: InteractionEventV1['event'], result: InteractionEventV1['result']): void {
  if (!expectedInteractionResult(event).includes(result)) fail(`event/result 组合非法: ${event}/${result}`)
}

function validateTime(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} 非法 UTC 时间`)
  const match = ISO_RE.exec(value)
  if (match === null) fail(`${label} 非法 UTC 时间`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const millisecond = match[7] === undefined ? 0 : Number(match[7])
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, millisecond)
  if (Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute
    || date.getUTCSeconds() !== second
    || date.getUTCMilliseconds() !== millisecond) {
    fail(`${label} 非法 UTC 时间`)
  }
  return value
}

function toWire(event: InteractionEventV1): InteractionEventV1Wire {
  const origin = event.originStepVisit.step === undefined
    ? { run_id: event.originStepVisit.runId, transition_sequence: event.originStepVisit.transitionSequence }
    : {
        run_id: event.originStepVisit.runId,
        transition_sequence: event.originStepVisit.transitionSequence,
        step: event.originStepVisit.step,
      }
  const current = event.stepVisit.step === undefined
    ? { run_id: event.stepVisit.runId, transition_sequence: event.stepVisit.transitionSequence }
    : {
        run_id: event.stepVisit.runId,
        transition_sequence: event.stepVisit.transitionSequence,
        step: event.stepVisit.step,
      }
  return {
    schema: event.schema,
    event_id: event.eventId,
    sequence: event.sequence,
    previous_event_hash: event.previousEventHash,
    journey_id: event.journeyId,
    occurred_at: event.occurredAt,
    change: event.change,
    run_id: event.runId,
    workflow: event.workflow,
    workflow_hash: event.workflowHash,
    origin_step_visit: origin,
    step_visit: current,
    state_before_hash: event.stateBeforeHash,
    state_after_hash: event.stateAfterHash,
    actor: event.actor,
    surface: event.surface,
    execution_mode: event.executionMode,
    workflow_mode: event.workflowMode,
    track: event.track,
    track_kind: event.trackKind,
    pipeline_stage: event.pipelineStage,
    control_stage: event.controlStage,
    event: event.event,
    reason_code: event.reasonCode,
    trigger_code: event.triggerCode,
    effect_code: event.effectCode,
    result: event.result,
    outcome_code: event.outcomeCode,
    duration_ms: event.durationMs,
  }
}

function fromWire(raw: InteractionEventV1Wire): InteractionEventV1 {
  return {
    schema: raw.schema,
    eventId: raw.event_id,
    sequence: raw.sequence,
    previousEventHash: raw.previous_event_hash,
    journeyId: raw.journey_id,
    occurredAt: raw.occurred_at,
    change: raw.change,
    runId: raw.run_id,
    workflow: raw.workflow,
    workflowHash: raw.workflow_hash,
    originStepVisit: {
      runId: raw.origin_step_visit.run_id,
      transitionSequence: raw.origin_step_visit.transition_sequence,
      ...(raw.origin_step_visit.step === undefined ? {} : { step: raw.origin_step_visit.step }),
    },
    stepVisit: {
      runId: raw.step_visit.run_id,
      transitionSequence: raw.step_visit.transition_sequence,
      ...(raw.step_visit.step === undefined ? {} : { step: raw.step_visit.step }),
    },
    stateBeforeHash: raw.state_before_hash,
    stateAfterHash: raw.state_after_hash,
    actor: raw.actor,
    surface: raw.surface,
    executionMode: raw.execution_mode,
    workflowMode: raw.workflow_mode,
    track: raw.track,
    trackKind: raw.track_kind,
    pipelineStage: raw.pipeline_stage,
    controlStage: raw.control_stage,
    event: raw.event,
    reasonCode: raw.reason_code,
    triggerCode: raw.trigger_code,
    effectCode: raw.effect_code,
    result: raw.result,
    outcomeCode: raw.outcome_code,
    durationMs: raw.duration_ms,
  }
}

function validateWire(value: unknown): InteractionEventV1Wire {
  const raw = closedRecord(value, EVENT_KEY_SET, 'interaction event')
  if (Object.keys(raw).length !== EVENT_KEYS.length) fail('interaction event 字段不完整')
  if (raw.schema !== 'tenon-interaction-event/v1') fail('schema 非法')
  const eventId = stringField(raw.event_id, 'event_id', /^sha256:[0-9a-f]{64}$/)
  const sequence = raw.sequence
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1) fail('sequence 非法')
  const previousEventHash = raw.previous_event_hash
  if (previousEventHash !== null && (typeof previousEventHash !== 'string' || !isInteractionHash(previousEventHash))) {
    fail('previous_event_hash 非法')
  }
  const journeyId = stringField(raw.journey_id, 'journey_id', /^sha256:[0-9a-f]{64}$/)
  const occurredAt = validateTime(raw.occurred_at, 'occurred_at')
  const change = stringField(raw.change, 'change')
  const runId = stringField(raw.run_id, 'run_id')
  const workflow = stringField(raw.workflow, 'workflow')
  const workflowHash = hashField(raw.workflow_hash, 'workflow_hash')
  const originStepVisit = visitField(raw.origin_step_visit, 'origin_step_visit')
  const stepVisit = visitField(raw.step_visit, 'step_visit')
  if (originStepVisit.runId !== runId || stepVisit.runId !== runId) fail('step visit run_id 必须匹配 run_id')
  const stateBeforeHash = hashField(raw.state_before_hash, 'state_before_hash')
  const stateAfterHash = hashField(raw.state_after_hash, 'state_after_hash')
  const actor = enumField(raw.actor, INTERACTION_ACTORS, 'actor') as InteractionActor
  const surface = enumField(raw.surface, INTERACTION_SURFACES, 'surface')
  const executionMode = enumField(raw.execution_mode, INTERACTION_EXECUTION_MODES, 'execution_mode')
  const workflowMode = enumField(raw.workflow_mode, INTERACTION_WORKFLOW_MODES, 'workflow_mode')
  const track = stringField(raw.track, 'track')
  const trackKind = enumField(raw.track_kind, INTERACTION_TRACK_KINDS, 'track_kind')
  const pipelineStage = enumField(raw.pipeline_stage, INTERACTION_PIPELINE_STAGES, 'pipeline_stage')
  const controlStage = enumField(raw.control_stage, INTERACTION_CONTROL_STAGES, 'control_stage')
  const event = enumField(raw.event, INTERACTION_EVENTS, 'event')
  const reasonCode = validateCode(raw.reason_code, 'reason_code')
  const triggerCode = validateCode(raw.trigger_code, 'trigger_code')
  const effectCode = validateCode(raw.effect_code, 'effect_code')
  const result = enumField(raw.result, INTERACTION_RESULTS, 'result')
  const outcomeCode = validateCode(raw.outcome_code, 'outcome_code')
  const durationMs = raw.duration_ms
  if (typeof durationMs !== 'number' || !Number.isSafeInteger(durationMs) || durationMs < 0) fail('duration_ms 非法')
  validateResultCombination(event, result)
  const candidate: InteractionEventV1Wire = {
    schema: 'tenon-interaction-event/v1', event_id: eventId, sequence, previous_event_hash: previousEventHash,
    journey_id: journeyId, occurred_at: occurredAt, change, run_id: runId, workflow, workflow_hash: workflowHash,
    origin_step_visit: originStepVisit.step === undefined
      ? { run_id: originStepVisit.runId, transition_sequence: originStepVisit.transitionSequence }
      : { run_id: originStepVisit.runId, transition_sequence: originStepVisit.transitionSequence, step: originStepVisit.step },
    step_visit: stepVisit.step === undefined
      ? { run_id: stepVisit.runId, transition_sequence: stepVisit.transitionSequence }
      : { run_id: stepVisit.runId, transition_sequence: stepVisit.transitionSequence, step: stepVisit.step },
    state_before_hash: stateBeforeHash, state_after_hash: stateAfterHash, actor, surface, execution_mode: executionMode,
    workflow_mode: workflowMode, track, track_kind: trackKind, pipeline_stage: pipelineStage, control_stage: controlStage,
    event, reason_code: reasonCode, trigger_code: triggerCode, effect_code: effectCode, result,
    outcome_code: outcomeCode, duration_ms: durationMs,
  }
  if (interactionEventId(interactionEventBody(candidate)) !== eventId) fail('event_id 与 canonical event body 不匹配')
  return candidate
}

export function encodeInteractionEvent(event: InteractionEventV1): InteractionEventV1Wire {
  const wire = toWire(event)
  return validateWire(wire)
}

export function decodeInteractionEvent(value: unknown): InteractionEventV1 {
  return fromWire(validateWire(value))
}

export function serializeInteractionEvent(event: InteractionEventV1): string {
  return `${stableInteractionStringify(encodeInteractionEvent(event))}\n`
}

export function parseInteractionEventLine(line: string): InteractionEventV1 {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    fail('interaction event JSON 非法')
  }
  return decodeInteractionEvent(value)
}

export function createInteractionEvent(draft: InteractionEventDraft): InteractionEventV1 {
  const eventWithoutIds: InteractionEventV1 = {
    schema: 'tenon-interaction-event/v1',
    eventId: draft.eventId ?? 'sha256:' + '0'.repeat(64),
    journeyId: draft.journeyId ?? interactionJourneyId({
      change: draft.change,
      runId: draft.runId,
      originStepVisit: draft.originStepVisit,
      reviewEvent: draft.event,
      requestedAt: draft.occurredAt,
    }),
    ...draft,
  }
  const provisional = toWire(eventWithoutIds)
  const eventId = interactionEventId(interactionEventBody(provisional))
  const result = { ...eventWithoutIds, eventId }
  return fromWire(validateWire(toWire(result)))
}

export type InteractionCodeField = 'reason' | 'trigger' | 'effect' | 'outcome'

const INTERACTION_CODE_REGISTRY: Readonly<Record<InteractionCodeField, readonly string[]>> = {
  reason: INTERACTION_REASON_CODES,
  trigger: INTERACTION_TRIGGER_CODES,
  effect: INTERACTION_EFFECT_CODES,
  outcome: INTERACTION_OUTCOME_CODES,
}

export function interactionEventCodeIsKnown(code: string): boolean
export function interactionEventCodeIsKnown(field: InteractionCodeField, code: string): boolean
export function interactionEventCodeIsKnown(fieldOrCode: string, maybeCode?: string): boolean {
  if (maybeCode === undefined) {
    return Object.values(INTERACTION_CODE_REGISTRY).some((codes) => codes.includes(fieldOrCode))
  }
  if (fieldOrCode !== 'reason' && fieldOrCode !== 'trigger'
    && fieldOrCode !== 'effect' && fieldOrCode !== 'outcome') return false
  return INTERACTION_CODE_REGISTRY[fieldOrCode].includes(maybeCode)
}

export function interactionEventCodesAreKnown(event: InteractionEventV1): boolean {
  return interactionEventCodeIsKnown('reason', event.reasonCode)
    && interactionEventCodeIsKnown('trigger', event.triggerCode)
    && interactionEventCodeIsKnown('effect', event.effectCode)
    && interactionEventCodeIsKnown('outcome', event.outcomeCode)
}

export function interactionStateHashEquals(left: string, right: string): boolean {
  return normalizedInteractionHash(left) === normalizedInteractionHash(right)
}
