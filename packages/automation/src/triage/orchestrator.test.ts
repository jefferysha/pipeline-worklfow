import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ObservationPage,
  ProviderTriageDecision,
  SourceCheckpoint,
  TriageRoute,
  WorkflowRun,
} from '@tenon/kernel'
import type { SourceConnector } from './source.js'
import type { TriageProvider } from './provider.js'
import {
  createTriageCheckpointStore,
  type TriageCheckpointStore,
} from './checkpoint-store.js'
import {
  createWorkflowRunMaterializer,
  type WorkflowRunCreateIfAbsentRepository,
  type WorkflowRunMaterializer,
} from './workflow-run-materializer.js'
import {
  runTriage,
  TriageOrchestrationError,
  type RunTriageOptions,
} from './orchestrator.js'

const action = {
  schemaVersion: 1,
  kind: 'git-commits',
  sourceId: 'repo-main',
} as const

const routes: readonly TriageRoute[] = [{
  routeId: 'fix',
  description: 'Create a default fix workflow run',
  resolved: { workflowId: 'default', initialStep: 'open' },
}]

const nextCheckpoint = (cursor: string): SourceCheckpoint => ({
  schemaVersion: 1,
  sourceId: action.sourceId,
  actionKind: action.kind,
  cursor,
})

const observation = (suffix: string) => ({
  schemaVersion: 1,
  observationId: `commit:${suffix}`,
  sourceId: action.sourceId,
  actionKind: action.kind,
  observedAt: '2026-07-19T08:00:00.000Z',
  title: `Commit ${suffix}`,
  body: `Body ${suffix}`,
}) as const

const page = (
  suffixes: readonly string[],
  cursor: string,
  hasMore = false,
): ObservationPage => ({
  schemaVersion: 1,
  action,
  observations: suffixes.map(observation),
  nextCheckpoint: nextCheckpoint(cursor),
  hasMore,
})

const invocation = (decisions: readonly ProviderTriageDecision[]) => ({
  output: { schemaVersion: 1, decisions },
  provenance: { kind: 'codex', model: 'fixture-model', invocationId: 'invocation-1' },
})

const decisionFor = (suffix: string, classification: 'high' | 'watch' | 'noise' = 'high') => (
  classification === 'high'
    ? {
        observationId: `commit:${suffix}`,
        classification,
        rationale: 'Needs a workflow run.',
        routeId: 'fix',
      }
    : {
        observationId: `commit:${suffix}`,
        classification,
        rationale: 'No workflow run needed.',
      }
) satisfies ProviderTriageDecision

const workflowRun = (id: string): WorkflowRun => ({
  id,
  workflowId: 'default',
  currentStep: 'open',
  lifecycle: 'active',
  transitionSequence: 0,
  createdAt: '2026-07-19T08:05:00.000Z',
  updatedAt: '2026-07-19T08:05:00.000Z',
})

let repoRoot: string

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'triage-orchestrator-'))
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

function baseOptions(overrides: Partial<RunTriageOptions> = {}): RunTriageOptions {
  const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
    kind: action.kind,
    observe: vi.fn(async () => page(['a'], 'cursor-a')),
  }
  const provider: TriageProvider<'codex'> = {
    kind: 'codex',
    classify: vi.fn(async () => invocation([decisionFor('a')])),
  }
  const materializer: WorkflowRunMaterializer = {
    materialize: vi.fn(async () => []),
  }
  return {
    action,
    connector,
    provider,
    materializer,
    checkpointStore: createTriageCheckpointStore({ repoRoot }),
    routes,
    pageSize: 20,
    maxPages: 4,
    maxHighCandidates: 10,
    signal: new AbortController().signal,
    ...overrides,
  }
}

describe('runTriage', () => {
  it('sends only safe observation/route projections and host policy cap to the provider', async () => {
    let seenRequest: unknown
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify(request) {
        seenRequest = request
        return invocation([decisionFor('a')])
      },
    }

    await runTriage(baseOptions({ provider }))

    expect(seenRequest).toEqual({
      schemaVersion: 1,
      observations: [{
        observationId: 'commit:a',
        observedAt: '2026-07-19T08:00:00.000Z',
        title: 'Commit a',
        body: 'Body a',
      }],
      routes: [{ routeId: 'fix', description: 'Create a default fix workflow run' }],
      maxHighCandidates: 10,
    })
    const serialized = JSON.stringify(seenRequest)
    expect(serialized).not.toContain('repo-main')
    expect(serialized).not.toContain('git-commits')
    expect(serialized).not.toContain('workflowId')
    expect(serialized).not.toContain('initialStep')
    expect(Object.isFrozen(seenRequest)).toBe(true)
  })

  it('reads and binds each checkpoint-store method exactly once at the options boundary', async () => {
    const inner = createTriageCheckpointStore({ repoRoot })
    const reads = { read: 0, compareAndSet: 0, withRunLock: 0 }
    const checkpointStore = {} as TriageCheckpointStore
    Object.defineProperties(checkpointStore, {
      read: {
        get() {
          reads.read += 1
          if (reads.read > 1) throw new Error('checkpoint read getter was re-read')
          return inner.read.bind(inner)
        },
      },
      compareAndSet: {
        get() {
          reads.compareAndSet += 1
          if (reads.compareAndSet > 1) throw new Error('checkpoint CAS getter was re-read')
          return inner.compareAndSet.bind(inner)
        },
      },
      withRunLock: {
        get() {
          reads.withRunLock += 1
          if (reads.withRunLock > 1) throw new Error('run-lock getter was re-read')
          return inner.withRunLock.bind(inner)
        },
      },
    })

    await expect(runTriage(baseOptions({ checkpointStore }))).resolves.toMatchObject({
      pagesProcessed: 1,
      checkpoint: { cursor: 'cursor-a' },
    })
    expect(reads).toEqual({ read: 1, compareAndSet: 1, withRunLock: 1 })
  })

  it('never accepts provider-supplied candidate identity and leaves the checkpoint unchanged', async () => {
    const materializer: WorkflowRunMaterializer = { materialize: vi.fn(async () => []) }
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify() {
        return {
          output: {
            schemaVersion: 1,
            decisions: [{
              ...decisionFor('a'),
              candidateId: 'provider-owned-id',
              creationKey: 'provider-owned-key',
              changeName: 'provider_owned_change',
            }],
          },
          provenance: { kind: 'codex', model: 'fixture-model', invocationId: 'malicious' },
        }
      },
    }
    const checkpointStore = createTriageCheckpointStore({ repoRoot })

    await expect(runTriage(baseOptions({ provider, materializer, checkpointStore }))).rejects.toMatchObject({
      _tag: 'TriageOrchestrationError',
      reason: 'triage-invalid',
    } satisfies Partial<TriageOrchestrationError>)
    expect(materializer.materialize).not.toHaveBeenCalled()
    expect((await checkpointStore.read({ sourceId: action.sourceId, actionKind: action.kind })).revision).toBe(0)
  })

  it('fails a malformed observation page before provider/materializer and does not advance checkpoint', async () => {
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      classify: vi.fn(async () => invocation([])),
    }
    const materializer: WorkflowRunMaterializer = { materialize: vi.fn(async () => []) }
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() {
        return { ...page([], 'bad'), observations: [{ ...observation('bad'), sourceId: 'other' }] }
      },
    }
    const checkpointStore = createTriageCheckpointStore({ repoRoot })

    await expect(runTriage(baseOptions({ connector, provider, materializer, checkpointStore }))).rejects.toMatchObject({
      _tag: 'TriageOrchestrationError',
      reason: 'page-invalid',
    } satisfies Partial<TriageOrchestrationError>)
    expect(provider.classify).not.toHaveBeenCalled()
    expect(materializer.materialize).not.toHaveBeenCalled()
    expect((await checkpointStore.read({ sourceId: action.sourceId, actionKind: action.kind })).revision).toBe(0)
  })

  it('rejects a structurally valid page that is bound to another source', async () => {
    const foreignAction = { ...action, sourceId: 'repo-foreign' }
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() {
        return {
          schemaVersion: 1,
          action: foreignAction,
          observations: [{ ...observation('foreign'), sourceId: foreignAction.sourceId }],
          nextCheckpoint: {
            schemaVersion: 1,
            sourceId: foreignAction.sourceId,
            actionKind: foreignAction.kind,
            cursor: 'foreign',
          },
          hasMore: false,
        }
      },
    }

    await expect(runTriage(baseOptions({ connector }))).rejects.toMatchObject({
      _tag: 'TriageOrchestrationError',
      reason: 'page-binding-mismatch',
    } satisfies Partial<TriageOrchestrationError>)
  })

  it('propagates observe/provider/materializer/checkpoint failures and never advances early', async () => {
    const stages = ['observe', 'provider', 'materializer', 'checkpoint'] as const
    for (const stage of stages) {
      const inner = createTriageCheckpointStore({ repoRoot })
      const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
        kind: action.kind,
        async observe() {
          if (stage === 'observe') throw new Error('observe-stage-failed')
          return page(['a'], 'cursor-a')
        },
      }
      const provider: TriageProvider<'codex'> = {
        kind: 'codex',
        async classify() {
          if (stage === 'provider') throw new Error('provider-stage-failed')
          return invocation([decisionFor('a')])
        },
      }
      const materializer: WorkflowRunMaterializer = {
        async materialize() {
          if (stage === 'materializer') throw new Error('materializer-stage-failed')
          return []
        },
      }
      const checkpointStore: TriageCheckpointStore = stage === 'checkpoint'
        ? {
            read: (checkpointKey) => inner.read(checkpointKey),
            withRunLock: (_checkpointKey, _signal, work) => work(),
            async compareAndSet() { throw new Error('checkpoint-stage-failed') },
          }
        : inner

      await expect(runTriage(baseOptions({ connector, provider, materializer, checkpointStore })))
        .rejects.toThrow(`${stage}-stage-failed`)
      expect((await inner.read({ sourceId: action.sourceId, actionKind: action.kind })).revision).toBe(0)
    }
  })

  it('retries a partially materialized page idempotently and advances only after every create succeeds', async () => {
    const persisted = new Map<string, WorkflowRun>()
    const calls: string[] = []
    let failSecondOnce = true
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent(request) {
        calls.push(request.idempotencyKey)
        const existing = persisted.get(request.idempotencyKey)
        if (existing !== undefined) return { status: 'existing', run: existing }
        if (request.source.observationId === 'commit:b' && failSecondOnce) {
          failSecondOnce = false
          throw new Error('second create failed after the first committed')
        }
        const run = workflowRun(`run-${persisted.size + 1}`)
        persisted.set(request.idempotencyKey, run)
        return { status: 'created', run }
      },
    }
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() { return page(['a', 'b'], 'cursor-ab') },
    }
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify() { return invocation([decisionFor('a'), decisionFor('b')]) },
    }
    const checkpointStore = createTriageCheckpointStore({ repoRoot })
    const options = baseOptions({
      connector,
      provider,
      checkpointStore,
      materializer: createWorkflowRunMaterializer({ repository }),
    })

    await expect(runTriage(options)).rejects.toMatchObject({
      _tag: 'TriageOrchestrationError',
      reason: 'materialization-failed',
      progress: {
        pagesCommitted: 0,
        observationsCommitted: 0,
        checkpointCommit: 'not-attempted',
        retryable: true,
        failedPageCheckpoint: { cursor: 'cursor-ab' },
        materializationsCompleted: [
          { outcome: { status: 'created', run: { id: 'run-1' } } },
        ],
      },
    } satisfies Partial<TriageOrchestrationError>)
    expect(persisted.size).toBe(1)
    expect((await checkpointStore.read({ sourceId: action.sourceId, actionKind: action.kind })).revision).toBe(0)

    await expect(runTriage(options)).resolves.toMatchObject({ pagesProcessed: 1, observationsProcessed: 2 })
    expect(persisted.size).toBe(2)
    expect(calls).toHaveLength(4)
    expect(calls[0]).toBe(calls[2])
    expect((await checkpointStore.read({ sourceId: action.sourceId, actionKind: action.kind }))).toMatchObject({
      revision: 1,
      checkpoint: { cursor: 'cursor-ab' },
    })
  })

  it('uses one stable host identity per source observation even if a retry changes route/rationale/order', async () => {
    const allRoutes = [...routes, {
      routeId: 'alternate',
      description: 'Create an alternate workflow run',
      resolved: { workflowId: 'alternate-workflow', initialStep: 'start' },
    }] as const
    const requests = new Map<string, { routeId: string; run: WorkflowRun }>()
    let failB = true
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent(request) {
        const existing = requests.get(request.idempotencyKey)
        if (existing !== undefined) {
          if (existing.routeId !== request.routeId) throw new Error('stable-key-route-conflict')
          return { status: 'existing', run: existing.run }
        }
        if (request.source.observationId === 'commit:b' && failB) {
          failB = false
          throw new Error('fail-b-once')
        }
        const run = workflowRun(`run-${requests.size + 1}`)
        requests.set(request.idempotencyKey, { routeId: request.routeId, run })
        return { status: 'created', run }
      },
    }
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() { return page(['a', 'b'], 'cursor-route-switch') },
    }
    let invocations = 0
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify() {
        invocations += 1
        if (invocations === 1) return invocation([decisionFor('a'), decisionFor('b')])
        return invocation([
          { ...decisionFor('b'), rationale: 'Changed rationale and order.' },
          { ...decisionFor('a'), rationale: 'Changed route.', routeId: 'alternate' },
        ])
      },
    }
    const options = baseOptions({
      routes: allRoutes,
      connector,
      provider,
      materializer: createWorkflowRunMaterializer({ repository }),
    })

    await expect(runTriage(options)).rejects.toMatchObject({ reason: 'materialization-failed' })
    await expect(runTriage(options)).rejects.toThrow('stable-key-route-conflict')

    expect(requests.size).toBe(1)
    expect(requests.values().next().value?.routeId).toBe('fix')
  })

  it('checks abort after each candidate materialization so a second create never starts', async () => {
    const abort = new AbortController()
    const calls: string[] = []
    const repository: WorkflowRunCreateIfAbsentRepository = {
      async createIfAbsent(request) {
        calls.push(request.source.observationId)
        const run = workflowRun(`run-${calls.length}`)
        if (calls.length === 1) abort.abort(new Error('abort-after-first-create'))
        return { status: 'created', run }
      },
    }
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() { return page(['a', 'b'], 'cursor-abort') },
    }
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify() { return invocation([decisionFor('a'), decisionFor('b')]) },
    }
    const checkpointStore = createTriageCheckpointStore({ repoRoot })

    await expect(runTriage(baseOptions({
      connector,
      provider,
      checkpointStore,
      signal: abort.signal,
      materializer: createWorkflowRunMaterializer({ repository }),
    }))).rejects.toMatchObject({
      reason: 'aborted',
      progress: {
        materializationsCompleted: [{ outcome: { status: 'created', run: { id: 'run-1' } } }],
        checkpointCommit: 'not-attempted',
      },
    })
    expect(calls).toEqual(['commit:a'])
    expect((await checkpointStore.read({ sourceId: action.sourceId, actionKind: action.kind })).revision).toBe(0)
  })

  it('serializes two orchestrators for one source/action before provider side effects', async () => {
    const checkpointStore = createTriageCheckpointStore({ repoRoot })
    let providerActive = 0
    let providerMaxActive = 0
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe(request) {
        return request.checkpoint === null
          ? page(['a'], 'cursor-first')
          : page([], 'cursor-empty')
      },
    }
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify(request) {
        providerActive += 1
        providerMaxActive = Math.max(providerMaxActive, providerActive)
        await new Promise((resolve) => setTimeout(resolve, 15))
        providerActive -= 1
        return invocation(request.observations.map((item) => ({
          observationId: item.observationId,
          classification: 'watch' as const,
          rationale: 'Observed.',
        })))
      },
    }
    const options = baseOptions({ connector, provider, checkpointStore })

    const results = await Promise.all([runTriage(options), runTriage(options)])

    expect(providerMaxActive).toBe(1)
    expect(results.map((result) => result.checkpoint.cursor).sort()).toEqual(['cursor-empty', 'cursor-first'])
    expect((await checkpointStore.read({ sourceId: action.sourceId, actionKind: action.kind })).revision).toBe(2)
  })

  it('treats a lost CAS whose durable checkpoint already equals the target as convergence', async () => {
    const inner = createTriageCheckpointStore({ repoRoot })
    let committedTarget: SourceCheckpoint | null = null
    const checkpointStore: TriageCheckpointStore = {
      withRunLock: (_checkpointKey, _signal, work) => work(),
      async read(checkpointKey) {
        if (committedTarget === null) return inner.read(checkpointKey)
        return { key: checkpointKey, revision: 1, checkpoint: committedTarget }
      },
      async compareAndSet(_checkpointKey, _revision, next) {
        committedTarget = next
        return false
      },
    }

    await expect(runTriage(baseOptions({ checkpointStore }))).resolves.toMatchObject({
      pagesProcessed: 1,
      checkpoint: { cursor: 'cursor-a' },
      checkpointCommit: 'converged',
    })
  })

  it('reports non-convergent CAS conflict with completed side effects and current durable checkpoint', async () => {
    const inner = createTriageCheckpointStore({ repoRoot })
    const checkpointStore: TriageCheckpointStore = {
      withRunLock: (_checkpointKey, _signal, work) => work(),
      read: (checkpointKey) => inner.read(checkpointKey),
      async compareAndSet() { return false },
    }

    await expect(runTriage(baseOptions({ checkpointStore }))).rejects.toMatchObject({
      reason: 'checkpoint-conflict',
      progress: {
        pagesCommitted: 0,
        checkpointCommit: 'conflict',
        durableCheckpoint: null,
        failedPageCheckpoint: { cursor: 'cursor-a' },
        retryable: true,
      },
    })
  })

  it('checks abort between pages and never observes the next page after cancellation', async () => {
    const abort = new AbortController()
    let observes = 0
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() {
        observes += 1
        return page([String(observes)], `cursor-${observes}`, true)
      },
    }
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify(request) {
        return invocation(request.observations.map((item) => ({
          observationId: item.observationId,
          classification: 'watch' as const,
          rationale: 'Observed.',
        })))
      },
    }
    const inner = createTriageCheckpointStore({ repoRoot })
    const checkpointStore: TriageCheckpointStore = {
      read: (checkpointKey) => inner.read(checkpointKey),
      withRunLock: (checkpointKey, signal, work) => inner.withRunLock(checkpointKey, signal, work),
      async compareAndSet(checkpointKey, revision, next) {
        const committed = await inner.compareAndSet(checkpointKey, revision, next)
        abort.abort(new Error('stop after first committed page'))
        return committed
      },
    }

    await expect(runTriage(baseOptions({ connector, provider, checkpointStore, signal: abort.signal })))
      .rejects.toThrow('stop after first committed page')
    expect(observes).toBe(1)
  })

  it('honors maxPages while reporting a durable partial result when the source still has more', async () => {
    let observes = 0
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() {
        observes += 1
        return page([String(observes)], `cursor-${observes}`, true)
      },
    }
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify(request) {
        return invocation(request.observations.map((item) => ({
          observationId: item.observationId,
          classification: 'noise' as const,
          rationale: 'Ignore.',
        })))
      },
    }

    const result = await runTriage(baseOptions({ connector, provider, maxPages: 2 }))

    expect(result).toMatchObject({
      pagesProcessed: 2,
      observationsProcessed: 2,
      hasMore: true,
      limitReached: true,
      checkpoint: { cursor: 'cursor-2' },
    })
    expect(observes).toBe(2)
  })

  it('snapshots maxPages once so a cycling host getter cannot expand the bound after validation', async () => {
    let reads = 0
    let observes = 0
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() {
        observes += 1
        return page([String(observes)], `cursor-${observes}`, true)
      },
    }
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      async classify(request) {
        return invocation(request.observations.map((item) => ({
          observationId: item.observationId,
          classification: 'noise' as const,
          rationale: 'Ignore.',
        })))
      },
    }
    const options = baseOptions({ connector, provider })
    Object.defineProperty(options, 'maxPages', {
      configurable: true,
      get() {
        reads += 1
        return reads === 1 ? 2 : 100
      },
    })

    const result = await runTriage(options)

    expect(result).toMatchObject({ pagesProcessed: 2, limitReached: true })
    expect({ observes, reads }).toEqual({ observes: 2, reads: 1 })
  })

  it('canonicalizes and materializes an empty page before advancing its checkpoint', async () => {
    const provider: TriageProvider<'codex'> = {
      kind: 'codex',
      classify: vi.fn(async () => invocation([])),
    }
    const materializer: WorkflowRunMaterializer = { materialize: vi.fn(async () => []) }
    const connector: SourceConnector<typeof action, SourceCheckpoint, unknown> = {
      kind: action.kind,
      async observe() { return page([], 'empty-complete') },
    }

    const result = await runTriage(baseOptions({ connector, provider, materializer }))

    expect(provider.classify).toHaveBeenCalledOnce()
    expect(materializer.materialize).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      pagesProcessed: 1,
      observationsProcessed: 0,
      checkpoint: { cursor: 'empty-complete' },
      hasMore: false,
    })
  })
})
