import {
  interactionLineHash,
  type InteractionDiagnostic,
  type InteractionDiagnosticCode,
  type InteractionEventV1,
  type InteractionJourneyReplay,
  type InteractionReplayResult,
} from './contract.js'
import {
  interactionEventCodeIsKnown,
  interactionEventCodesAreKnown,
  interactionStateHashEquals,
  serializeInteractionEvent,
} from './codec.js'

const ERROR_DIAGNOSTICS = new Set<InteractionDiagnosticCode>([
  'sequence-gap', 'hash-chain-mismatch', 'malformed-order', 'state-discontinuity',
  'accepted-stale-decision', 'same-state-repeated-prompt', 'invalid-resume',
  'incomplete-success-journey', 'projection-unavailable', 'event-schema-invalid',
])

function pushDiagnostic(
  diagnostics: InteractionDiagnostic[],
  code: InteractionDiagnosticCode,
  event?: InteractionEventV1,
): void {
  diagnostics.push({
    code,
    ...(event?.journeyId === undefined ? {} : { journeyId: event.journeyId }),
    ...(event?.sequence === undefined ? {} : { sequence: event.sequence }),
  })
}

function visitsEqual(left: InteractionEventV1['originStepVisit'], right: InteractionEventV1['originStepVisit']): boolean {
  return left.runId === right.runId
    && left.transitionSequence === right.transitionSequence
    && left.step === right.step
}

function visitCanAdvance(
  current: InteractionEventV1['stepVisit'],
  origin: InteractionEventV1['originStepVisit'],
): boolean {
  return current.runId === origin.runId && current.transitionSequence >= origin.transitionSequence
}

interface JourneyAnchors {
  readonly change: string
  readonly runId: string
  readonly workflow: string
  readonly workflowHash: string
  readonly originStepVisit: InteractionEventV1['originStepVisit']
}

export function expectedInteractionJourneyEvents(
  journey: Pick<InteractionJourneyReplay, 'validResume' | 'failed' | 'staleRejected' | 'suppressedRequests'>,
): number {
  if (journey.validResume) return 4 + journey.suppressedRequests
  if (journey.failed) return 3 + journey.suppressedRequests
  if (journey.staleRejected) return 2 + journey.suppressedRequests
  return 4 + journey.suppressedRequests
}

function sameAnchors(event: InteractionEventV1, anchors: JourneyAnchors): boolean {
  return event.change === anchors.change
    && event.runId === anchors.runId
    && event.workflow === anchors.workflow
    && interactionStateHashEquals(event.workflowHash, anchors.workflowHash)
    && visitsEqual(event.originStepVisit, anchors.originStepVisit)
}

/** Replay a decoded event stream without consulting canonical state or any external service. */
export function replayInteractionEvents(
  input: readonly InteractionEventV1[],
  options: { readonly rawLines?: readonly string[] } = {},
): InteractionReplayResult {
  // Validate the physical append order before any journey grouping. Sorting first would let a
  // damaged JSONL projection be reinterpreted as a valid completion.
  const events = [...input]
  const diagnostics: InteractionDiagnostic[] = []
  const unclassified = new Set<string>()
  const rawLines = options.rawLines
  const malformedJourneyIds = new Set<string>()
  let previousRaw: string | undefined
  let previousSequence: number | undefined
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event === undefined) continue
    const expectedSequence = index + 1
    if (event.sequence !== expectedSequence) pushDiagnostic(diagnostics, 'sequence-gap', event)
    if (previousSequence !== undefined && event.sequence <= previousSequence) {
      pushDiagnostic(diagnostics, 'malformed-order', event)
      malformedJourneyIds.add(event.journeyId)
    }
    previousSequence = event.sequence
    const line = rawLines?.[index] ?? serializeInteractionEvent(event)
    const expectedPrevious = previousRaw === undefined ? null : interactionLineHash(previousRaw)
    if (event.previousEventHash !== expectedPrevious) pushDiagnostic(diagnostics, 'hash-chain-mismatch', event)
    previousRaw = line
    const codes = [
      ['reason', event.reasonCode],
      ['trigger', event.triggerCode],
      ['effect', event.effectCode],
      ['outcome', event.outcomeCode],
    ] as const
    for (const [field, code] of codes) {
      if (!interactionEventCodeIsKnown(field, code)) unclassified.add(code)
    }
  }

  const byJourney = new Map<string, InteractionEventV1[]>()
  for (const event of events) {
    const list = byJourney.get(event.journeyId) ?? []
    list.push(event)
    byJourney.set(event.journeyId, list)
  }
  const journeys: InteractionJourneyReplay[] = []
  let acceptedStaleDecisions = 0
  let sameStateRepeatedPrompts = 0
  let invalidResumes = 0

  for (const [journeyId, journeyEvents] of [...byJourney.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const journeyDiagnostics: InteractionDiagnostic[] = []
    let requestCount = 0
    let deliveredRequests = 0
    let suppressedRequests = 0
    let acknowledged = false
    let effectApplied = false
    let validResume = false
    let failed = false
    let staleRejected = false
    let terminalRejected = false
    let firstRequestAt: string | undefined
    let validResumeAt: string | undefined
    let requestStateAfter: string | undefined
    let effectStateAfter: string | undefined
    let lastRequest: InteractionEventV1 | undefined
    let lastAck: InteractionEventV1 | undefined
    let lastEffect: InteractionEventV1 | undefined
    let seenRequest = false
    let anchors: JourneyAnchors | undefined
    let previousOccurredAt: number | undefined
    let journeyHasDiscontinuity = false
    let journeyHasMalformedOrder = malformedJourneyIds.has(journeyId)
    let previousJourneySequence: number | undefined
    for (const event of journeyEvents) {
      if (previousJourneySequence !== undefined && event.sequence <= previousJourneySequence) {
        journeyHasMalformedOrder = true
      }
      previousJourneySequence = event.sequence
      const occurredAt = Date.parse(event.occurredAt)
      if (previousOccurredAt !== undefined && occurredAt < previousOccurredAt) {
        pushDiagnostic(diagnostics, 'malformed-order', event)
        journeyDiagnostics.push({ code: 'malformed-order', journeyId, sequence: event.sequence })
        journeyHasMalformedOrder = true
      }
      previousOccurredAt = occurredAt
      if (anchors === undefined) {
        anchors = {
          change: event.change,
          runId: event.runId,
          workflow: event.workflow,
          workflowHash: event.workflowHash,
          originStepVisit: event.originStepVisit,
        }
      } else if (!sameAnchors(event, anchors)) {
        pushDiagnostic(diagnostics, 'state-discontinuity', event)
        journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
        journeyHasDiscontinuity = true
      }
      const origin = anchors?.originStepVisit ?? event.originStepVisit
      if (!visitsEqual(event.originStepVisit, origin)) journeyHasDiscontinuity = true
      // Extension codes are safely retained above, but an unknown code cannot be assigned
      // stable request/ack/effect semantics.  Keep it out of completion, stale and safety
      // formulas until a future registry explicitly classifies it.  Generic anchor and time
      // continuity checks above still apply to every event.
      if (!interactionEventCodesAreKnown(event)) continue
      const terminalBeforeEvent = staleRejected || terminalRejected || failed || validResume
      const duplicateValidResume = terminalBeforeEvent && validResume
        && event.event === 'resume.validated' && event.result === 'success'
      if (terminalBeforeEvent && !duplicateValidResume) continue
      switch (event.event) {
        case 'review.requested':
          if (!visitsEqual(event.stepVisit, origin)) {
            pushDiagnostic(diagnostics, 'state-discontinuity', event)
            journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
            journeyHasDiscontinuity = true
          }
          requestCount += 1
          deliveredRequests += event.result === 'success' ? 1 : 0
          if (event.result === 'success') {
            if (seenRequest && lastRequest !== undefined
              && interactionStateHashEquals(lastRequest.stateAfterHash, event.stateAfterHash)) {
              sameStateRepeatedPrompts += 1
              pushDiagnostic(diagnostics, 'same-state-repeated-prompt', event)
              journeyDiagnostics.push({ code: 'same-state-repeated-prompt', journeyId, sequence: event.sequence })
            }
            if (!seenRequest) {
              firstRequestAt = event.occurredAt
              requestStateAfter = event.stateAfterHash
            }
            seenRequest = true
            lastRequest = event
          }
          break
        case 'review.prompt-suppressed':
          if (!visitsEqual(event.stepVisit, origin)) {
            pushDiagnostic(diagnostics, 'state-discontinuity', event)
            journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
            journeyHasDiscontinuity = true
          }
          if (lastRequest !== undefined
            && (!interactionStateHashEquals(lastRequest.stateAfterHash, event.stateBeforeHash)
              || !interactionStateHashEquals(lastRequest.stateAfterHash, event.stateAfterHash))) {
            pushDiagnostic(diagnostics, 'state-discontinuity', event)
            journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
            journeyHasDiscontinuity = true
          }
          suppressedRequests += 1
          if (!seenRequest) {
            pushDiagnostic(diagnostics, 'malformed-order', event)
            journeyDiagnostics.push({ code: 'malformed-order', journeyId, sequence: event.sequence })
          }
          break
        case 'review.acknowledged':
          if (!visitsEqual(event.stepVisit, origin)) {
            pushDiagnostic(diagnostics, 'state-discontinuity', event)
            journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
            journeyHasDiscontinuity = true
          }
          if (!seenRequest || lastRequest === undefined) {
            pushDiagnostic(diagnostics, 'malformed-order', event)
            journeyDiagnostics.push({ code: 'malformed-order', journeyId, sequence: event.sequence })
          } else if (event.result === 'success') {
            acknowledged = true
            if (!interactionStateHashEquals(lastRequest.stateAfterHash, event.stateBeforeHash)) {
              acceptedStaleDecisions += 1
              pushDiagnostic(diagnostics, 'accepted-stale-decision', event)
              journeyDiagnostics.push({ code: 'accepted-stale-decision', journeyId, sequence: event.sequence })
            }
            lastAck = event
          } else if (event.result === 'rejected') {
            staleRejected = event.reasonCode === 'decision.state-stale'
            terminalRejected = true
          }
          break
        case 'review.effect-applied':
          if (!visitCanAdvance(event.stepVisit, origin)) {
            pushDiagnostic(diagnostics, 'state-discontinuity', event)
            journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
            journeyHasDiscontinuity = true
          }
          if (!acknowledged || lastAck === undefined) {
            pushDiagnostic(diagnostics, 'malformed-order', event)
            journeyDiagnostics.push({ code: 'malformed-order', journeyId, sequence: event.sequence })
          } else if (event.result === 'success') {
            if (!interactionStateHashEquals(lastAck.stateAfterHash, event.stateBeforeHash)) {
              pushDiagnostic(diagnostics, 'state-discontinuity', event)
              journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
              journeyHasDiscontinuity = true
            }
            effectApplied = true
            effectStateAfter = event.stateAfterHash
            lastEffect = event
          } else {
            if (!interactionStateHashEquals(lastAck.stateAfterHash, event.stateBeforeHash)
              || !interactionStateHashEquals(event.stateBeforeHash, event.stateAfterHash)) {
              pushDiagnostic(diagnostics, 'state-discontinuity', event)
              journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
              journeyHasDiscontinuity = true
            }
            failed = true
          }
          break
        case 'resume.validated':
          if (lastEffect !== undefined && !visitsEqual(event.stepVisit, lastEffect.stepVisit)) {
            pushDiagnostic(diagnostics, 'state-discontinuity', event)
            journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
            journeyHasDiscontinuity = true
          }
          if (event.result === 'rejected') {
            invalidResumes += 1
            pushDiagnostic(diagnostics, 'invalid-resume', event)
            journeyDiagnostics.push({ code: 'invalid-resume', journeyId, sequence: event.sequence })
          } else if (!effectApplied || lastEffect === undefined) {
            invalidResumes += 1
            pushDiagnostic(diagnostics, 'invalid-resume', event)
            journeyDiagnostics.push({ code: 'invalid-resume', journeyId, sequence: event.sequence })
          } else if (!interactionStateHashEquals(lastEffect.stateAfterHash, event.stateBeforeHash)
            || !interactionStateHashEquals(lastEffect.stateAfterHash, event.stateAfterHash)) {
            invalidResumes += 1
            pushDiagnostic(diagnostics, 'invalid-resume', event)
            journeyDiagnostics.push({ code: 'invalid-resume', journeyId, sequence: event.sequence })
          } else {
            validResume = true
            if (validResumeAt === undefined) validResumeAt = event.occurredAt
          }
          break
        case 'operation.failed':
          if (!visitCanAdvance(event.stepVisit, origin)) {
            pushDiagnostic(diagnostics, 'state-discontinuity', event)
            journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
            journeyHasDiscontinuity = true
          }
          {
            const expectedState = lastEffect?.stateAfterHash ?? lastAck?.stateAfterHash ?? lastRequest?.stateAfterHash
            if (expectedState === undefined
              || !interactionStateHashEquals(expectedState, event.stateBeforeHash)
              || !interactionStateHashEquals(event.stateBeforeHash, event.stateAfterHash)) {
              pushDiagnostic(diagnostics, 'state-discontinuity', event)
              journeyDiagnostics.push({ code: 'state-discontinuity', journeyId, sequence: event.sequence })
              journeyHasDiscontinuity = true
            }
            failed = true
          }
          break
      }
    }
    const terminal = staleRejected || terminalRejected || failed || validResume
    if (journeyHasDiscontinuity || journeyHasMalformedOrder) validResume = false
    if (seenRequest && !terminal && !acknowledged) {
      pushDiagnostic(diagnostics, 'incomplete-success-journey', lastRequest)
      journeyDiagnostics.push({ code: 'incomplete-success-journey', journeyId })
    } else if (seenRequest && acknowledged && !terminal && !effectApplied) {
      pushDiagnostic(diagnostics, 'incomplete-success-journey', lastAck)
      journeyDiagnostics.push({ code: 'incomplete-success-journey', journeyId })
    } else if (seenRequest && effectApplied && !validResume && !failed) {
      pushDiagnostic(diagnostics, 'incomplete-success-journey', lastEffect)
      journeyDiagnostics.push({ code: 'incomplete-success-journey', journeyId })
    }
    journeys.push({
      journeyId, requestCount, deliveredRequests, suppressedRequests, started: seenRequest, acknowledged,
      effectApplied, validResume, failed, staleRejected, ...(firstRequestAt === undefined ? {} : { firstRequestAt }),
      ...(validResumeAt === undefined ? {} : { validResumeAt }),
      ...(requestStateAfter === undefined ? {} : { requestStateAfter }),
      ...(effectStateAfter === undefined ? {} : { effectStateAfter }), diagnostics: journeyDiagnostics,
    })
  }

  const expectedEvents = journeys.reduce((total, journey) => {
    if (!journey.started) return total
    return total + expectedInteractionJourneyEvents(journey)
  }, 0)
  const observedByJourney = new Map<string, number>()
  for (const event of events) {
    if (!interactionEventCodesAreKnown(event)) continue
    observedByJourney.set(event.journeyId, (observedByJourney.get(event.journeyId) ?? 0) + 1)
  }
  const observedEvents = journeys.reduce((total, journey) => {
    if (!journey.started) return total
    const expected = expectedInteractionJourneyEvents(journey)
    return total + Math.min(expected, observedByJourney.get(journey.journeyId) ?? 0)
  }, 0)
  const eventCompleteness = expectedEvents === 0 ? 1 : Math.min(1, observedEvents / expectedEvents)
  return {
    events,
    journeys,
    diagnostics,
    eventCompleteness,
    acceptedStaleDecisions,
    sameStateRepeatedPrompts,
    invalidResumes,
    unclassifiedCodes: [...unclassified].sort(),
  }
}

export function replayHasErrors(replay: InteractionReplayResult): boolean {
  return replay.diagnostics.some((diagnostic) => ERROR_DIAGNOSTICS.has(diagnostic.code))
}

export function isVerifiedInteractionJourney(journey: InteractionJourneyReplay, replay: InteractionReplayResult): boolean {
  if (!journey.started || !journey.acknowledged || !journey.effectApplied || !journey.validResume
    || journey.failed || journey.staleRejected) return false
  return !replay.diagnostics.some((diagnostic) => diagnostic.journeyId === journey.journeyId)
}
