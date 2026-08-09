import {
  INTERACTION_DIAGNOSTICS,
  type InteractionFixtureExpected,
  type InteractionScorecardFixture,
  type InteractionScorecardV1,
  type InteractionEventV1,
} from './contract.js'
import { interactionEventCodesAreKnown } from './codec.js'
import {
  expectedInteractionJourneyEvents,
  replayInteractionEvents,
  isVerifiedInteractionJourney,
} from './replay.js'

export interface InteractionScorecardInput {
  readonly id: string
  readonly mode: 'measurement' | 'negative-control'
  readonly events: readonly InteractionEventV1[]
  readonly rawLines?: readonly string[]
  readonly expected?: InteractionFixtureExpected
}

function emptyDiagnostics(): Record<string, number> {
  return Object.fromEntries(INTERACTION_DIAGNOSTICS.map((code) => [code, 0]))
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? null
  const left = sorted[middle - 1]
  const right = sorted[middle]
  return left === undefined || right === undefined ? null : (left + right) / 2
}

export function computeInteractionScorecard(
  fixtures: readonly InteractionScorecardInput[],
): InteractionScorecardV1 {
  const ordered = [...fixtures].sort((left, right) => left.id.localeCompare(right.id))
  const fixtureResults: InteractionScorecardFixture[] = []
  const diagnostics = emptyDiagnostics()
  const unclassified = new Set<string>()
  let measurementExpectedEvents = 0
  let measurementObservedEvents = 0
  let startedJourneys = 0
  let verifiedCompletions = 0
  let interruptions = 0
  const resumeDurations: number[] = []
  let acceptedStaleDecisions = 0
  let sameStateRepeatedPrompts = 0
  let invalidResumes = 0

  for (const fixture of ordered) {
    const replay = replayInteractionEvents(fixture.events, { rawLines: fixture.rawLines })
    const fixtureDiagnosticCodes = [...new Set(replay.diagnostics.map((diagnostic) => diagnostic.code))].sort()
    fixtureResults.push({
      id: fixture.id,
      mode: fixture.mode,
      valid: replay.diagnostics.length === 0,
      diagnostics: fixtureDiagnosticCodes,
      eventCompleteness: replay.eventCompleteness,
    })
    for (const diagnostic of replay.diagnostics) diagnostics[diagnostic.code] = (diagnostics[diagnostic.code] ?? 0) + 1
    for (const code of replay.unclassifiedCodes) unclassified.add(code)
    acceptedStaleDecisions += replay.acceptedStaleDecisions
    sameStateRepeatedPrompts += replay.sameStateRepeatedPrompts
    invalidResumes += replay.invalidResumes
    if (fixture.mode !== 'measurement') continue
    const started = replay.journeys.filter((journey) => journey.started)
    startedJourneys += started.length
    interruptions += started.reduce((total, journey) => total + journey.deliveredRequests, 0)
    verifiedCompletions += started.filter((journey) => isVerifiedInteractionJourney(journey, replay)).length
    for (const journey of started) {
      if (!isVerifiedInteractionJourney(journey, replay) || journey.firstRequestAt === undefined || journey.validResumeAt === undefined) continue
      const start = Date.parse(journey.firstRequestAt)
      const end = Date.parse(journey.validResumeAt)
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) resumeDurations.push(end - start)
    }
    const expected = started.reduce((total, journey) => total + expectedInteractionJourneyEvents(journey), 0)
    const observedByJourney = new Map<string, number>()
    for (const event of replay.events) {
      if (!interactionEventCodesAreKnown(event)) continue
      observedByJourney.set(event.journeyId, (observedByJourney.get(event.journeyId) ?? 0) + 1)
    }
    const observed = started.reduce((total, journey) => total + Math.min(
      expectedInteractionJourneyEvents(journey), observedByJourney.get(journey.journeyId) ?? 0,
    ), 0)
    measurementExpectedEvents += expected
    measurementObservedEvents += observed
  }
  const completionRate = startedJourneys === 0 ? null : verifiedCompletions / startedJourneys
  const interruptionsPerCompletion = verifiedCompletions === 0 ? null : interruptions / verifiedCompletions
  const eventCompleteness = measurementExpectedEvents === 0
    ? null
    : Math.min(1, measurementObservedEvents / measurementExpectedEvents)
  const orderedDiagnostics = Object.fromEntries(
    INTERACTION_DIAGNOSTICS.map((code) => [code, diagnostics[code] ?? 0]),
  ) as Readonly<Record<typeof INTERACTION_DIAGNOSTICS[number], number>>
  return {
    schema: 'tenon-interaction-scorecard/v1',
    fixtures: fixtureResults,
    metrics: {
      governedCompletionRate: completionRate,
      humanInterruptionsPerVerifiedCompletion: interruptionsPerCompletion,
      medianTimeToValidResumeMs: median(resumeDurations),
    },
    eventCompleteness: eventCompleteness ?? 0,
    acceptedStaleDecisions,
    sameStateRepeatedPrompts,
    invalidResumes,
    diagnostics: orderedDiagnostics,
    unclassifiedCodes: [...unclassified].sort(),
  }
}
