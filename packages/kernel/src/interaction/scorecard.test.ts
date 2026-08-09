import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  computeInteractionScorecard,
  createInteractionEvent,
  decodeInteractionEvent,
  interactionLineHash,
  serializeInteractionEvent,
  type InteractionScorecardInput,
} from './index.js'

const fixtureRoot = fileURLToPath(new URL('../../../../tools/fixtures/interaction-events/v1/', import.meta.url))

function loadInput(id: string, mode: InteractionScorecardInput['mode']): InteractionScorecardInput {
  const raw = JSON.parse(readFileSync(fixtureRoot + id + '.json', 'utf8')) as {
    readonly events: readonly unknown[]
  }
  return { id, mode, events: raw.events.map((event) => decodeInteractionEvent(event)) }
}

describe('interaction scorecard', () => {
  it('uses only measurement fixtures for product metrics and sorts fixture output', () => {
    const inputs = [
      loadInput('positive', 'measurement'),
      loadInput('stale-decision', 'measurement'),
      loadInput('repeated-prompt', 'measurement'),
      loadInput('failure', 'measurement'),
      loadInput('resume', 'measurement'),
      loadInput('projection-loss', 'negative-control'),
      loadInput('malformed-order', 'negative-control'),
      loadInput('wrong-resume', 'negative-control'),
    ]
    const scorecard = computeInteractionScorecard([...inputs].reverse())
    expect(scorecard.fixtures.map((fixture) => fixture.id)).toEqual([
      'failure',
      'malformed-order',
      'positive',
      'projection-loss',
      'repeated-prompt',
      'resume',
      'stale-decision',
      'wrong-resume',
    ])
    expect(scorecard.metrics.governedCompletionRate).toBe(3 / 5)
    expect(scorecard.metrics.humanInterruptionsPerVerifiedCompletion).toBe(5 / 3)
    expect(scorecard.metrics.medianTimeToValidResumeMs).toBe(4000)
    expect(scorecard.acceptedStaleDecisions).toBe(0)
    expect(scorecard.sameStateRepeatedPrompts).toBe(0)
    expect(scorecard.invalidResumes).toBe(1)
    expect(scorecard.eventCompleteness).toBe(1)
    expect(scorecard.diagnostics['sequence-gap']).toBe(1)
    expect(scorecard.diagnostics['malformed-order']).toBe(1)
  })

  it('returns null ratio/median when no journey verifies completion', () => {
    const scorecard = computeInteractionScorecard([loadInput('failure', 'measurement')])
    expect(scorecard.metrics.governedCompletionRate).toBe(0)
    expect(scorecard.metrics.humanInterruptionsPerVerifiedCompletion).toBeNull()
    expect(scorecard.metrics.medianTimeToValidResumeMs).toBeNull()
  })

  it('does not let unknown extra events hide an incomplete measurement journey', () => {
    const request = loadInput('positive', 'measurement').events[0]
    expect(request).toBeDefined()
    if (request === undefined) return
    let previousRaw = serializeInteractionEvent(request)
    const extras = [2, 3, 4].map((sequence) => {
      const extra = createInteractionEvent({
        ...request,
        eventId: undefined,
        sequence,
        previousEventHash: interactionLineHash(previousRaw),
        reasonCode: 'future.extra',
      })
      previousRaw = serializeInteractionEvent(extra)
      return extra
    })
    const scorecard = computeInteractionScorecard([{
      id: 'incomplete-with-extra', mode: 'measurement', events: [request, ...extras],
    }])
    expect(scorecard.eventCompleteness).toBeLessThan(1)
    expect(scorecard.eventCompleteness).toBe(0.25)
  })
})
