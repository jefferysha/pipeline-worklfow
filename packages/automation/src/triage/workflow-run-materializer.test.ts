import {
  canonicalizeTriageResult,
  type ProviderTriageDecision,
  type TriageResult,
} from '@pipeline-lite/kernel'
import { describe, expect, it } from 'vitest'
import {
  createWorkflowRunMaterializer,
  WorkflowRunMaterializationError,
  type WorkflowRunCreateIfAbsentRepository,
} from './workflow-run-materializer.js'

const page = {
  schemaVersion: 1,
  action: { schemaVersion: 1, kind: 'git-commits', sourceId: 'repo-main' },
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
} as const

const routes = [
  {
    routeId: 'default-fix',
    description: 'Create a default-workflow fix change',
    resolved: { workflowId: 'default', initialStep: 'open' },
  },
] as const

const workflowRun = {
  id: 'run-1',
  workflowId: 'default',
  currentStep: 'open',
  lifecycle: 'active',
  transitionSequence: 0,
  createdAt: '2026-07-19T08:05:00.000Z',
  updatedAt: '2026-07-19T08:05:00.000Z',
} as const

function canonicalResult(decisions: readonly ProviderTriageDecision[]): TriageResult {
  const result = canonicalizeTriageResult({ schemaVersion: 1, decisions }, {
    page,
    routes,
    trustedHighCap: 10,
    provider: { kind: 'test', model: 'fixture-model', invocationId: 'fixture-1' },
    deriveCandidate: ({ observation, route }) => ({
      candidateId: `candidate:${observation.observationId}`,
      creationKey: `create:${observation.sourceId}:${observation.observationId}:${route.routeId}`,
      changeName: 'triage_fix_aaaaaaaa',
    }),
  })
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.value
}

describe('WorkflowRun triage materializer', () => {
  it('returns no materializations and performs no repository write when triage has zero create actions', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        throw new Error('zero-action triage must not reach the repository')
      },
    }
    const triage = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'watch',
        rationale: 'Correct but does not require a follow-up run.',
      },
    ])

    const materializations = await createWorkflowRunMaterializer({ repository }).materialize(triage)

    expect({ materializations, writes }).toEqual({ materializations: [], writes: 0 })
  })

  it('maps one high decision to a deterministic narrow create-workflow-run request', async () => {
    const requests: unknown[] = []
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent(request) {
        requests.push(request)
        return { status: 'created', run: workflowRun }
      },
    }
    const triage = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])

    const materializations = await createWorkflowRunMaterializer({ repository }).materialize(triage)

    const request = {
      schemaVersion: 1,
      kind: 'create-workflow-run',
      idempotencyKey: 'triage-workflow-run:v1:61b8aa7185307abe0e70bc4b35b28b752b03dfca5338a0b4052e523e9fb8de79',
      source: {
        sourceId: 'repo-main',
        actionKind: 'git-commits',
        observationId: 'commit:aaaaaaaa',
      },
      actionIdentity: 'create:repo-main:commit:aaaaaaaa:default-fix',
      candidateId: 'candidate:commit:aaaaaaaa',
      changeName: 'triage_fix_aaaaaaaa',
      routeId: 'default-fix',
      workflowId: 'default',
      initialStep: 'open',
    }
    expect({ requests, materializations }).toEqual({
      requests: [request],
      materializations: [{ request, outcome: { status: 'created', run: workflowRun } }],
    })
  })

  it('deduplicates an exact repeated create action within one frozen triage batch', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const single = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const duplicateBatch = Object.freeze({
      ...single,
      decisions: Object.freeze([single.decisions[0]!, single.decisions[0]!]),
    })

    const materializations = await createWorkflowRunMaterializer({ repository }).materialize(duplicateBatch)

    expect({ writes, materializationCount: materializations.length }).toEqual({
      writes: 1,
      materializationCount: 1,
    })
  })

  it('fails closed before repository I/O when the triage tree is not recursively frozen', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const unfrozen = structuredClone(canonical)
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(unfrozen)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/recursively frozen/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('fails closed before repository I/O when a decision cannot resolve to its host-owned route', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const high = canonical.decisions[0]!
    if (high.classification !== 'high') throw new Error('expected a high fixture')
    const unresolved = Object.freeze({
      ...canonical,
      decisions: Object.freeze([
        Object.freeze({
          ...high,
          candidate: Object.freeze({
            ...high.candidate,
            route: Object.freeze({ ...high.candidate.route, routeId: 'unowned-route' }),
          }),
        }),
      ]),
    })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(unresolved)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/routeId.*host-owned route/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('rejects provider-shaped loop, policy, and permission fields instead of forwarding or ignoring them', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const high = canonical.decisions[0]!
    if (high.classification !== 'high') throw new Error('expected a high fixture')
    const privileged = Object.freeze({
      ...canonical,
      decisions: Object.freeze([
        Object.freeze({
          ...high,
          candidate: Object.freeze({
            ...high.candidate,
            route: Object.freeze({
              ...high.candidate.route,
              resolved: Object.freeze({
                ...high.candidate.route.resolved,
                loopId: 'provider-loop',
                policyId: 'provider-policy',
                permissions: Object.freeze(['write']),
              }),
            }),
          }),
        }),
      ]),
    })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(privileged)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/loopId|policyId|permissions/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('fails closed with a typed error for a frozen but malformed TriageResult', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const malformed = Object.freeze({
      schemaVersion: 1,
      page: null,
      decisions: Object.freeze([]),
      provider: Object.freeze({ kind: 'test', model: 'fixture-model', invocationId: 'fixture-1' }),
    })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(malformed)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/page/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('fails closed with a typed error for a malformed decision member', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'watch',
        rationale: 'No run needed.',
      },
    ])
    const malformed = Object.freeze({ ...canonical, decisions: Object.freeze([null]) })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(malformed)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: expect.arrayContaining([expect.stringMatching(/decisions\[0\]/)]),
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('rejects an unknown decision classification instead of treating it as a zero-action result', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'watch',
        rationale: 'No run needed.',
      },
    ])
    const malformed = Object.freeze({
      ...canonical,
      decisions: Object.freeze([
        Object.freeze({ ...canonical.decisions[0]!, classification: 'provider-execute' }),
      ]),
    })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(malformed)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: expect.arrayContaining([expect.stringMatching(/classification/)]),
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('fails closed when a high decision has no resolvable host candidate', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const high = canonical.decisions[0]!
    const malformed = Object.freeze({
      ...canonical,
      decisions: Object.freeze([Object.freeze({ ...high, candidate: null })]),
    })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(malformed)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/candidate/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('fails closed when one idempotency key maps to conflicting requests in the same batch', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const high = canonical.decisions[0]!
    if (high.classification !== 'high') throw new Error('expected a high fixture')
    const conflicting = Object.freeze({
      ...high,
      candidate: Object.freeze({ ...high.candidate, changeName: 'different_change' }),
    })
    const ambiguous = Object.freeze({
      ...canonical,
      decisions: Object.freeze([high, conflicting]),
    })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(ambiguous)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/idempotency key.*conflicting/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('lets the atomic repository linearize concurrent cross-call attempts to one creation', async () => {
    let calls = 0
    let creations = 0
    const stored = new Map<string, typeof workflowRun>()
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent(request) {
        calls += 1
        const beforeYield = stored.get(request.idempotencyKey)
        if (beforeYield !== undefined) return { status: 'existing', run: beforeYield }
        await Promise.resolve()
        const afterYield = stored.get(request.idempotencyKey)
        if (afterYield !== undefined) return { status: 'existing', run: afterYield }
        creations += 1
        stored.set(request.idempotencyKey, workflowRun)
        return { status: 'created', run: workflowRun }
      },
    }
    const triage = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const materializer = createWorkflowRunMaterializer({ repository })

    const [first, second] = await Promise.all([
      materializer.materialize(triage),
      materializer.materialize(triage),
    ])

    expect({
      calls,
      creations,
      statuses: [first[0]?.outcome.status, second[0]?.outcome.status].sort(),
      runIds: [first[0]?.outcome.run.id, second[0]?.outcome.run.id],
    }).toEqual({
      calls: 2,
      creations: 1,
      statuses: ['created', 'existing'],
      runIds: ['run-1', 'run-1'],
    })
  })

  it('rejects a result whose decision partition omits a source observation', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'watch',
        rationale: 'No run needed.',
      },
    ])
    const missingDecision = Object.freeze({ ...canonical, decisions: Object.freeze([]) })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(missingDecision)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/missing decision.*commit:aaaaaaaa/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('rejects conflicting classifications for the same source observation', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const high = canonical.decisions[0]!
    const conflictingWatch = Object.freeze({
      observationId: 'commit:aaaaaaaa',
      classification: 'watch',
      rationale: 'Wait instead.',
    } as const)
    const conflicting = Object.freeze({
      ...canonical,
      decisions: Object.freeze([high, conflictingWatch]),
    })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(conflicting)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/conflicting classifications/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })

  it('materializes multiple actions in canonical source-observation order', async () => {
    const secondObservation = Object.freeze({
      ...page.observations[0],
      observationId: 'commit:bbbbbbbb',
      title: 'Repair retry accounting',
    })
    const twoObservationPage = {
      ...page,
      observations: [page.observations[0], secondObservation],
    } as const
    const canonical = canonicalizeTriageResult({
      schemaVersion: 1,
      decisions: [
        {
          observationId: 'commit:bbbbbbbb',
          classification: 'high',
          rationale: 'Needs its own follow-up.',
          routeId: 'default-fix',
        },
        {
          observationId: 'commit:aaaaaaaa',
          classification: 'high',
          rationale: 'Needs its own follow-up.',
          routeId: 'default-fix',
        },
      ],
    }, {
      page: twoObservationPage,
      routes,
      trustedHighCap: 2,
      provider: { kind: 'test', model: 'fixture-model', invocationId: 'fixture-2' },
      deriveCandidate: ({ observation, route }) => ({
        candidateId: `candidate:${observation.observationId}`,
        creationKey: `create:${observation.sourceId}:${observation.observationId}:${route.routeId}`,
        changeName: observation.observationId.endsWith('aaaaaaaa') ? 'triage_fix_aaaaaaaa' : 'triage_fix_bbbbbbbb',
      }),
    })
    if (!canonical.ok) throw new Error(canonical.errors.join('\n'))
    const requests: Array<{ observationId: string; idempotencyKey: string }> = []
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent(request) {
        requests.push({
          observationId: request.source.observationId,
          idempotencyKey: request.idempotencyKey,
        })
        return { status: 'created', run: workflowRun }
      },
    }

    const materializations = await createWorkflowRunMaterializer({ repository }).materialize(canonical.value)

    expect({
      observationIds: requests.map(({ observationId }) => observationId),
      uniqueKeys: new Set(requests.map(({ idempotencyKey }) => idempotencyKey)).size,
      materializationCount: materializations.length,
    }).toEqual({
      observationIds: ['commit:aaaaaaaa', 'commit:bbbbbbbb'],
      uniqueKeys: 2,
      materializationCount: 2,
    })
  })

  it('rejects distinct create action identities for the same source observation', async () => {
    let writes = 0
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent() {
        writes += 1
        return { status: 'created', run: workflowRun }
      },
    }
    const canonical = canonicalResult([
      {
        observationId: 'commit:aaaaaaaa',
        classification: 'high',
        rationale: 'The correctness fix needs a follow-up run.',
        routeId: 'default-fix',
      },
    ])
    const high = canonical.decisions[0]!
    if (high.classification !== 'high') throw new Error('expected a high fixture')
    const otherAction = Object.freeze({
      ...high,
      candidate: Object.freeze({
        ...high.candidate,
        candidateId: 'candidate:commit:aaaaaaaa:other',
        creationKey: 'create:repo-main:commit:aaaaaaaa:other',
        changeName: 'triage_fix_aaaaaaaa_other',
      }),
    })
    const malformed = Object.freeze({
      ...canonical,
      decisions: Object.freeze([high, otherAction]),
    })
    const materialize = createWorkflowRunMaterializer({ repository }).materialize(malformed)

    await expect(materialize).rejects.toMatchObject({
      _tag: 'WorkflowRunMaterializationError',
      issues: [expect.stringMatching(/conflicting create actions/)],
    } satisfies Partial<WorkflowRunMaterializationError>)
    expect(writes).toBe(0)
  })
})
