import { describe, expect, it } from 'vitest'
import type {
  ObservationPage,
  ObserveAction,
  SourceCheckpoint,
  TriageRoute,
} from '@tenon/kernel'
import type { SourceConnector, TriageProvider } from '@tenon/automation'

type GitCommitsAction = Extract<ObserveAction, { readonly kind: 'git-commits' }>

const action = {
  schemaVersion: 1,
  kind: 'git-commits',
  sourceId: 'repo-main',
} as const satisfies GitCommitsAction

const page = {
  schemaVersion: 1,
  action,
  observations: [
    {
      schemaVersion: 1,
      observationId: 'commit:aaaaaaaa',
      sourceId: 'repo-main',
      actionKind: 'git-commits',
      observedAt: '2026-07-19T08:00:00.000Z',
      title: 'Fix checkout race',
      body: 'Makes the state transition atomic.',
    },
  ],
  nextCheckpoint: {
    schemaVersion: 1,
    sourceId: 'repo-main',
    actionKind: 'git-commits',
    cursor: 'aaaaaaaa',
  },
  hasMore: false,
} as const satisfies ObservationPage

const routes = [
  {
    routeId: 'default-fix',
    description: 'Create a default-workflow fix change',
    resolved: { workflowId: 'default', initialStep: 'open' },
  },
] as const satisfies readonly TriageRoute[]

const connector: SourceConnector<GitCommitsAction, SourceCheckpoint, ObservationPage> = {
  kind: 'git-commits',
  async observe() {
    return page
  },
}

const provider: TriageProvider<'test'> = {
  kind: 'test',
  async classify() {
    return {
      output: {
        schemaVersion: 1,
        decisions: [
          {
            observationId: 'commit:aaaaaaaa',
            classification: 'high',
            rationale: 'The commit fixes a correctness defect.',
            routeId: 'default-fix',
          },
        ],
      },
      provenance: { kind: 'test', model: 'fixture-model', invocationId: 'fixture-1' },
    }
  },
}

describe('H12 Wave 0 public triage contracts', () => {
  it('composes the two package roots over a closed-set sample without undefined exports', async () => {
    const [kernel, automation] = await Promise.all([
      import('@tenon/kernel'),
      import('@tenon/automation'),
    ])

    expect({
      schemaVersion: kernel.TRIAGE_SCHEMA_VERSION,
      actionKinds: kernel.OBSERVE_ACTION_KINDS,
      validateObservationPage: typeof kernel.validateObservationPage,
      canonicalizeTriageResult: typeof kernel.canonicalizeTriageResult,
      productionProviderKind: automation.PRODUCTION_TRIAGE_PROVIDER_KIND,
    }).toEqual({
      schemaVersion: 1,
      actionKinds: ['git-commits', 'loop-run-terminals'],
      validateObservationPage: 'function',
      canonicalizeTriageResult: 'function',
      productionProviderKind: 'codex',
    })

    const signal = new AbortController().signal
    const observedPage = await connector.observe({ action, checkpoint: null, limit: 10, signal })
    const pageValidation = kernel.validateObservationPage(observedPage)
    const invocation = await provider.classify({
      schemaVersion: 1,
      observations: observedPage.observations.map(({ observationId, observedAt, title, body }) => ({
        observationId,
        observedAt,
        title,
        body,
      })),
      routes: routes.map(({ routeId, description }) => ({ routeId, description })),
      maxHighCandidates: 1,
    }, signal)
    const result = kernel.canonicalizeTriageResult(invocation.output, {
      page: observedPage,
      routes,
      trustedHighCap: 1,
      provider: invocation.provenance,
      deriveCandidate: ({ observation, route }) => ({
        candidateId: `candidate:${observation.observationId}`,
        creationKey: `triage:${observation.sourceId}:${observation.observationId}:${route.routeId}`,
        changeName: 'triage-fix-aaaaaaaa',
      }),
    })

    expect({
      pageAccepted: pageValidation.ok,
      resultAccepted: result.ok,
      decision: result.ok ? result.value.decisions[0] : undefined,
    }).toEqual({
      pageAccepted: true,
      resultAccepted: true,
      decision: {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The commit fixes a correctness defect.',
        routeId: 'default-fix',
        candidate: {
          candidateId: 'candidate:commit:aaaaaaaa',
          creationKey: 'triage:repo-main:commit:aaaaaaaa:default-fix',
          changeName: 'triage-fix-aaaaaaaa',
          route: routes[0],
        },
      },
    })
  })
})
