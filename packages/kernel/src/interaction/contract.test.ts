import { describe, expect, it } from 'vitest'
import {
  createInteractionEvent,
  decodeInteractionEvent,
  encodeInteractionEvent,
  INTERACTION_CONTROL_STAGES,
  INTERACTION_EXECUTION_MODES,
  INTERACTION_PIPELINE_STAGES,
  INTERACTION_SURFACES,
  INTERACTION_TRACK_KINDS,
  INTERACTION_WORKFLOW_MODES,
  interactionEventBody,
  interactionEventId,
  interactionJourneyId,
  INTERACTION_MAX_CODE_LENGTH,
  isInteractionExtensionCode,
  stableInteractionStringify,
  type InteractionEventDraft,
} from './index.js'

const HASH = 'a'.repeat(64)
const STATE_BEFORE = 'b'.repeat(64)
const STATE_AFTER = 'c'.repeat(64)

function draft(overrides: Partial<InteractionEventDraft> = {}): InteractionEventDraft {
  return {
    sequence: 1,
    previousEventHash: null,
    occurredAt: '2026-08-10T00:00:00.000Z',
    change: 'change-46',
    runId: 'run-46',
    workflow: 'default',
    workflowHash: HASH,
    originStepVisit: { runId: 'run-46', transitionSequence: 4, step: 'verify' },
    stepVisit: { runId: 'run-46', transitionSequence: 4, step: 'verify' },
    stateBeforeHash: STATE_BEFORE,
    stateAfterHash: STATE_AFTER,
    actor: 'human',
    surface: 'cli',
    executionMode: 'interactive',
    workflowMode: 'default',
    track: 'backend',
    trackKind: 'built-in',
    pipelineStage: 'verify',
    controlStage: 'verification',
    event: 'review.requested',
    reasonCode: 'review.required',
    triggerCode: 'review.exit-requested',
    effectCode: 'review-gate.pending',
    result: 'success',
    outcomeCode: 'review.requested',
    durationMs: 12,
    ...overrides,
  }
}

describe('interaction contract v1', () => {
  it('derives a deterministic event id and closed snake_case wire envelope', () => {
    const event = createInteractionEvent(draft())
    const wire = encodeInteractionEvent(event)
    expect(wire).toEqual(expect.objectContaining({
      schema: 'tenon-interaction-event/v1',
      event_id: event.eventId,
      previous_event_hash: null,
      origin_step_visit: { run_id: 'run-46', transition_sequence: 4, step: 'verify' },
      step_visit: { run_id: 'run-46', transition_sequence: 4, step: 'verify' },
    }))
    expect(event.eventId).toBe(interactionEventId(interactionEventBody(wire)))
    expect(decodeInteractionEvent(wire)).toEqual(event)
    expect(createInteractionEvent(draft())).toEqual(event)
  })

  it('round-trips every comparison dimension without path inference', () => {
    const event = createInteractionEvent(draft({
      surface: 'dashboard',
      executionMode: 'afk',
      workflowMode: 'custom',
      track: 'release',
      trackKind: 'free',
      pipelineStage: 'archive',
      controlStage: 'exact-resume',
    }))
    expect(decodeInteractionEvent(encodeInteractionEvent(event))).toEqual(event)
  })

  it('round-trips every legal value in the complete comparison matrix', () => {
    const dimensions = [
      ['executionMode', INTERACTION_EXECUTION_MODES],
      ['workflowMode', INTERACTION_WORKFLOW_MODES],
      ['trackKind', INTERACTION_TRACK_KINDS],
      ['pipelineStage', INTERACTION_PIPELINE_STAGES],
      ['controlStage', INTERACTION_CONTROL_STAGES],
      ['surface', INTERACTION_SURFACES],
    ] as const
    for (const [dimension, values] of dimensions) {
      for (const value of values) {
        const event = createInteractionEvent(draft({ [dimension]: value }))
        expect(decodeInteractionEvent(encodeInteractionEvent(event))).toEqual(event)
      }
    }
  })

  it('uses stable key ordering for fixture/replay bytes', () => {
    expect(stableInteractionStringify({ z: 1, a: { d: 2, c: 3 } }))
      .toBe('{"a":{"c":3,"d":2},"z":1}')
    expect(interactionJourneyId({
      change: 'change-46',
      runId: 'run-46',
      originStepVisit: draft().originStepVisit,
      reviewEvent: 'review.requested',
      requestedAt: '2026-08-10T00:00:00.000Z',
    })).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('rejects privacy-shaped and unknown envelope fields at the codec boundary', () => {
    const wire = encodeInteractionEvent(createInteractionEvent(draft()))
    expect(() => decodeInteractionEvent({ ...wire, prompt: 'do not persist' })).toThrow(/未知字段/)
    expect(() => decodeInteractionEvent({ ...wire, token: 'secret' })).toThrow(/未知字段/)
  })

  it('round-trips exact UTC seconds/milliseconds and rejects impossible calendar dates', () => {
    expect(createInteractionEvent(draft({ occurredAt: '2024-02-29T00:00:00Z' })).occurredAt)
      .toBe('2024-02-29T00:00:00Z')
    expect(createInteractionEvent(draft({ occurredAt: '2024-02-29T00:00:00.000Z' })).occurredAt)
      .toBe('2024-02-29T00:00:00.000Z')
    expect(() => createInteractionEvent(draft({ occurredAt: '2026-02-30T00:00:00.000Z' })))
      .toThrow(/UTC 时间/)
  })

  it('bounds namespaced extension codes without changing their grammar', () => {
    expect(isInteractionExtensionCode('future.review-v2')).toBe(true)
    const oversized = `future.${'x'.repeat(INTERACTION_MAX_CODE_LENGTH)}`
    expect(isInteractionExtensionCode(oversized)).toBe(false)
    expect(() => createInteractionEvent(draft({ reasonCode: oversized }))).toThrow(/reason_code/)
  })
})
