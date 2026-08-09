import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createInteractionEvent,
  computeInteractionScorecard,
  decodeInteractionEvent,
  interactionLineHash,
  isVerifiedInteractionJourney,
  replayHasErrors,
  replayInteractionEvents,
  serializeInteractionEvent,
  type InteractionEventV1,
  type InteractionEventDraft,
} from './index.js'

const fixtureRoot = fileURLToPath(new URL('../../../../tools/fixtures/interaction-events/v1/', import.meta.url))

function loadFixture(name: string) {
  const raw = JSON.parse(readFileSync(fixtureRoot + name + '.json', 'utf8')) as {
    readonly events: readonly unknown[]
  }
  return raw.events.map((event) => decodeInteractionEvent(event))
}

function rebuild(
  source: readonly InteractionEventV1[],
  overrides: Readonly<Record<number, Partial<InteractionEventV1>>> = {},
): InteractionEventV1[] {
  let previousRaw: string | undefined
  return source.map((item, index) => {
    const candidate = { ...item, ...(overrides[index] ?? {}) }
    const { schema: _schema, eventId: _eventId, ...draft } = candidate
    const event = createInteractionEvent({
      ...draft,
      sequence: index + 1,
      previousEventHash: previousRaw === undefined ? null : interactionLineHash(previousRaw),
    })
    previousRaw = serializeInteractionEvent(event)
    return event
  })
}

describe('interaction replay', () => {
  it('replays request → acknowledgement → effect → valid resume as one verified journey', () => {
    const replay = replayInteractionEvents(loadFixture('positive'))
    expect(replay.diagnostics).toEqual([])
    expect(replay.journeys).toHaveLength(1)
    const journey = replay.journeys[0]
    expect(journey).toBeDefined()
    if (journey === undefined) return
    expect(isVerifiedInteractionJourney(journey, replay)).toBe(true)
    expect(journey.requestCount).toBe(1)
    expect(journey.validResume).toBe(true)
  })

  it('detects projection loss and malformed ordering instead of inferring completion', () => {
    const loss = replayInteractionEvents(loadFixture('projection-loss'))
    expect(loss.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'sequence-gap',
      'incomplete-success-journey',
    ])
    expect(replayHasErrors(loss)).toBe(true)

    const malformed = replayInteractionEvents(loadFixture('malformed-order'))
    expect(malformed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'malformed-order',
      'incomplete-success-journey',
    ])
    expect(malformed.journeys.every((journey) => !journey.validResume)).toBe(true)
  })

  it('validates physical JSONL order before replaying a sorted journey', () => {
    const events = loadFixture('positive')
    const first = events[0]
    const second = events[1]
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) return
    const replay = replayInteractionEvents([second, first, ...events.slice(2)])
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'malformed-order')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('keeps stale rejection terminal even when a later success chain is present', () => {
    const events = loadFixture('positive')
    const request = events[0]
    const acknowledgement = events[1]
    const effect = events[2]
    const resume = events[3]
    expect(request).toBeDefined()
    expect(acknowledgement).toBeDefined()
    expect(effect).toBeDefined()
    expect(resume).toBeDefined()
    if (request === undefined || acknowledgement === undefined || effect === undefined || resume === undefined) return
    const replay = replayInteractionEvents(rebuild([
      request,
      {
        ...acknowledgement,
        result: 'rejected',
        reasonCode: 'decision.state-stale',
        effectCode: 'review-gate.rejected',
      },
      acknowledgement,
      effect,
      resume,
    ]))
    const journey = replay.journeys[0]
    expect(journey?.staleRejected).toBe(true)
    expect(journey?.validResume).toBe(false)
    expect(journey === undefined ? false : isVerifiedInteractionJourney(journey, replay)).toBe(false)
  })

  it('keeps unknown extension codes unclassified and out of success metrics', () => {
    const [request] = loadFixture('positive')
    expect(request).toBeDefined()
    if (request === undefined) return
    const { schema: _schema, eventId: _eventId, ...draft } = request
    const unknown = createInteractionEvent({
      ...(draft as InteractionEventDraft),
      reasonCode: 'future.review-v2',
    })
    const replay = replayInteractionEvents([unknown])
    expect(replay.unclassifiedCodes).toEqual(['future.review-v2'])
    expect(replay.journeys[0]?.started).toBe(false)
    expect(replay.diagnostics).toEqual([])
  })

  it('does not classify a code from another field category as known', () => {
    const events = loadFixture('positive')
    const replay = replayInteractionEvents(rebuild(events, {
      0: { reasonCode: 'transition.approved' },
    }))
    expect(replay.unclassifiedCodes).toEqual(['transition.approved'])
    expect(replay.journeys[0]?.requestCount).toBe(0)
    expect(replay.journeys[0]?.acknowledged).toBe(false)
    expect(replay.journeys[0]?.effectApplied).toBe(false)
  })

  it('validates anchors for unknown extension events before skipping success semantics', () => {
    const events = loadFixture('positive')
    const unknown = replayInteractionEvents(rebuild(events, {
      1: { reasonCode: 'future.review-v2', change: 'other-change' },
      2: { reasonCode: 'future.review-v2' },
    }))
    expect(unknown.unclassifiedCodes).toEqual(['future.review-v2'])
    expect(unknown.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
    expect(unknown.journeys[0]?.validResume).toBe(false)
  })

  it('validates occurredAt order for unknown extension events before skipping success semantics', () => {
    const events = loadFixture('positive')
    const unknown = replayInteractionEvents(rebuild(events, {
      1: { reasonCode: 'future.review-v2', occurredAt: '2026-08-09T23:59:59.000Z' },
      2: { reasonCode: 'future.review-v2' },
    }))
    expect(unknown.unclassifiedCodes).toEqual(['future.review-v2'])
    expect(unknown.diagnostics.some((diagnostic) => diagnostic.code === 'malformed-order')).toBe(true)
    expect(unknown.journeys[0]?.validResume).toBe(false)
  })

  it('flags successful acknowledgement that accepts a stale state', () => {
    const events = loadFixture('positive')
    const request = events[0]
    const acknowledgement = events[1]
    expect(request).toBeDefined()
    expect(acknowledgement).toBeDefined()
    if (request === undefined || acknowledgement === undefined) return
    const { schema: _schema, eventId: _eventId, ...ackDraft } = acknowledgement
    const staleAck = createInteractionEvent({
      ...(ackDraft as InteractionEventDraft),
      stateBeforeHash: 'd'.repeat(64),
    })
    const replay = replayInteractionEvents([request, staleAck])
    expect(replay.acceptedStaleDecisions).toBe(1)
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'accepted-stale-decision')).toBe(true)
  })

  it('rejects identity anchor drift without inferring completion', () => {
    const events = loadFixture('positive')
    const request = events[0]
    expect(request).toBeDefined()
    if (request === undefined) return
    const variants: ReadonlyArray<Partial<InteractionEventV1>> = [
      { change: 'other-change' },
      {
        runId: 'other-run',
        originStepVisit: { ...request.originStepVisit, runId: 'other-run' },
        stepVisit: { ...request.stepVisit, runId: 'other-run' },
      },
      { workflow: 'custom' },
      { workflowHash: 'e'.repeat(64) },
      { originStepVisit: { ...request.originStepVisit, step: 'build' } },
    ]
    for (const variant of variants) {
      const replay = replayInteractionEvents(rebuild(events, { 1: variant }))
      expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
      expect(replay.journeys[0]?.validResume).toBe(false)
    }
  })

  it('requires request and acknowledgement current visits to match the origin visit', () => {
    const events = loadFixture('positive')
    const acknowledgement = events[1]
    expect(acknowledgement).toBeDefined()
    if (acknowledgement === undefined) return
    const replay = replayInteractionEvents(rebuild(events, {
      1: { stepVisit: { ...acknowledgement.stepVisit, transitionSequence: 99 } },
    }))
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('requires resume current visit to match the successful effect visit', () => {
    const events = loadFixture('positive')
    const resume = events[3]
    expect(resume).toBeDefined()
    if (resume === undefined) return
    const replay = replayInteractionEvents(rebuild(events, {
      3: { stepVisit: { ...resume.stepVisit, transitionSequence: resume.stepVisit.transitionSequence + 1 } },
    }))
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('flags occurredAt reversal as malformed order and blocks completion', () => {
    const events = loadFixture('positive')
    const replay = replayInteractionEvents(rebuild(events, {
      1: { occurredAt: '2026-08-09T23:59:59.000Z' },
    }))
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'malformed-order')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('requires suppressed prompts to remain at the origin visit', () => {
    const events = loadFixture('repeated-prompt')
    const suppressed = events[1]
    expect(suppressed).toBeDefined()
    if (suppressed === undefined) return
    const replay = replayInteractionEvents(rebuild(events, {
      1: { stepVisit: { ...suppressed.stepVisit, transitionSequence: suppressed.stepVisit.transitionSequence + 1 } },
    }))
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('requires suppressed prompts to retain the previous request state', () => {
    const events = loadFixture('repeated-prompt')
    const suppressed = events[1]
    expect(suppressed).toBeDefined()
    if (suppressed === undefined) return
    const replay = replayInteractionEvents(rebuild(events, {
      1: {
        stateBeforeHash: 'd'.repeat(64),
        stateAfterHash: 'd'.repeat(64),
      },
    }))
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('requires failed operations to stay on or after the origin run visit', () => {
    const events = loadFixture('failure')
    const failed = events[2]
    expect(failed).toBeDefined()
    if (failed === undefined) return
    const origin = { ...failed.originStepVisit, transitionSequence: failed.stepVisit.transitionSequence + 1 }
    const replay = replayInteractionEvents(rebuild(events, {
      0: { originStepVisit: origin, stepVisit: origin },
      1: { originStepVisit: origin, stepVisit: origin },
      2: { originStepVisit: origin },
    }))
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('validates failed effect state continuity before marking the journey terminal', () => {
    const events = loadFixture('failure')
    const failed = events[2]
    expect(failed).toBeDefined()
    if (failed === undefined) return
    const replay = replayInteractionEvents(rebuild(events, {
      2: { stateBeforeHash: 'd'.repeat(64), stateAfterHash: 'e'.repeat(64) },
    }))
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('validates operation.failed state continuity before marking the journey terminal', () => {
    const events = loadFixture('positive')
    const request = events[0]
    const acknowledgement = events[1]
    const effect = events[2]
    expect(request).toBeDefined()
    expect(acknowledgement).toBeDefined()
    expect(effect).toBeDefined()
    if (request === undefined || acknowledgement === undefined || effect === undefined) return
    const replay = replayInteractionEvents(rebuild([
      request,
      acknowledgement,
      {
        ...effect,
        event: 'operation.failed',
        result: 'failure',
        reasonCode: 'effect.failed',
        outcomeCode: 'operation.failed',
        stateBeforeHash: 'd'.repeat(64),
        stateAfterHash: 'e'.repeat(64),
      },
    ]))
    expect(replay.diagnostics.some((diagnostic) => diagnostic.code === 'state-discontinuity')).toBe(true)
    expect(replay.journeys[0]?.validResume).toBe(false)
  })

  it('keeps the first valid resume timestamp when a journey resumes twice', () => {
    const events = loadFixture('positive')
    const resume = events[3]
    expect(resume).toBeDefined()
    if (resume === undefined) return
    const duplicate = createInteractionEvent({
      ...resume,
      eventId: undefined,
      sequence: 5,
      occurredAt: '2026-08-10T00:00:10.000Z',
      previousEventHash: interactionLineHash(serializeInteractionEvent(resume)),
    })
    const replay = replayInteractionEvents([...events, duplicate])
    expect(replay.diagnostics).toEqual([])
    expect(replay.journeys).toHaveLength(1)
    expect(replay.journeys[0]?.validResumeAt).toBe(resume.occurredAt)
    expect(replay.journeys[0]?.validResume).toBe(true)
    const scorecard = computeInteractionScorecard([{
      id: 'duplicate-resume', mode: 'measurement', events: [...events, duplicate],
    }])
    expect(scorecard.metrics.governedCompletionRate).toBe(1)
    expect(scorecard.metrics.medianTimeToValidResumeMs).toBe(3000)
  })
})
