import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createStateStore,
  createTransitionRecordStore,
  createWorkflowRunRepository,
  type InitOptions,
  type StateStore,
  type WorkflowRunRepository,
} from '@pipeline-lite/kernel'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkflowRunCreateRequest } from './workflow-run-materializer.js'
import {
  createWorkflowRunCreateIfAbsentRepository,
  WorkflowRunCreateConflictError,
  WorkflowRunCreateRequestError,
} from './workflow-run-create-repository.js'

const FIXED_CLOCK = () => '2026-07-19T10:00:00Z'
const roots: string[] = []

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pipeline-triage-run-create-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function request(overrides: Partial<WorkflowRunCreateRequest> = {}): WorkflowRunCreateRequest {
  return {
    schemaVersion: 1,
    kind: 'create-workflow-run',
    idempotencyKey: 'triage-workflow-run:v1:key-1',
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
    ...overrides,
  }
}

function makeRunRepository(store: StateStore): WorkflowRunRepository {
  return createWorkflowRunRepository({
    store,
    recordStore: createTransitionRecordStore(),
    clock: FIXED_CLOCK,
    newId: () => {
      throw new Error('deterministic triage run must never request a random id')
    },
  })
}

function trustedInit(): Omit<InitOptions, 'repoRoot' | 'name' | 'runId' | 'initialWorkflow'> {
  return {
    track: 'backend',
    reviewSeed: 'pending',
    preset: 'full',
    user: 'triage-host',
    clock: FIXED_CLOCK,
  }
}

async function makeHarness(
  options: {
    readonly store?: StateStore
    readonly runRepository?: WorkflowRunRepository
    readonly resolveInit?: () => Omit<InitOptions, 'repoRoot' | 'name' | 'runId' | 'initialWorkflow'>
  } = {},
) {
  const repoRoot = await freshRoot()
  const store = options.store ?? createStateStore()
  const runRepository = options.runRepository ?? makeRunRepository(store)
  const repository = createWorkflowRunCreateIfAbsentRepository({
    repoRoot,
    store,
    runRepository,
    resolveInit: options.resolveInit ?? trustedInit,
  })
  return { repoRoot, store, runRepository, repository }
}

function expectedRunId(value: WorkflowRunCreateRequest): string {
  const canonical = JSON.stringify([
    value.schemaVersion,
    value.kind,
    value.idempotencyKey,
    value.source.sourceId,
    value.source.actionKind,
    value.source.observationId,
    value.actionIdentity,
    value.candidateId,
    value.changeName,
    value.routeId,
    value.workflowId,
    value.initialStep,
  ])
  return `triage-run-v1-${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

describe('WorkflowRunCreateIfAbsentRepository production adapter', () => {
  it('atomically creates the requested change with the full-request deterministic run id and custom initial step', async () => {
    const { repoRoot, store, repository } = await makeHarness()
    const input = request({ workflowId: 'incident-response', initialStep: 'assess' })

    const result = await repository.createIfAbsent(input)

    expect(result.status).toBe('created')
    expect(result.run).toMatchObject({
      id: expectedRunId(input),
      workflowId: 'incident-response',
      currentStep: 'assess',
      transitionSequence: 0,
    })
    const state = await store.read(join(repoRoot, 'openspec', 'changes', input.changeName))
    expect(state.runMetadata).toEqual({
      runId: expectedRunId(input),
      transitionSequence: 0,
      transitionHead: undefined,
    })
    expect(state.fields).toMatchObject({
      track: 'backend',
      preset: 'full',
      created_by: 'triage-host',
      workflow: 'incident-response',
      phase: 'assess',
    })
  })

  it('linearizes true-fs Promise.all contention: exactly one created and every loser converges to existing', async () => {
    const { repository } = await makeHarness()
    const input = request()

    const results = await Promise.all(Array.from({ length: 24 }, () => repository.createIfAbsent(input)))

    expect(results.filter((result) => result.status === 'created')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'existing')).toHaveLength(23)
    expect(new Set(results.map((result) => result.run.id))).toEqual(new Set([expectedRunId(input)]))
  })

  it('does not let host policy override repoRoot/name/runId/workflow/phase even through an unsound runtime cast', async () => {
    const repoRoot = await freshRoot()
    const evilRoot = await freshRoot()
    const store = createStateStore()
    const runRepository = makeRunRepository(store)
    const input = request({ workflowId: 'incident-response', initialStep: 'assess' })
    const repository = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store,
      runRepository,
      resolveInit: () => ({
        ...trustedInit(),
        repoRoot: evilRoot,
        name: 'evil_change',
        runId: 'evil-run',
        initialWorkflow: { workflow: 'evil-workflow', phase: 'evil-phase' },
      } as unknown as ReturnType<typeof trustedInit>),
    })

    const outcome = await repository.createIfAbsent(input)

    expect(outcome.run).toMatchObject({
      id: expectedRunId(input),
      workflowId: 'incident-response',
      currentStep: 'assess',
    })
    await expect(store.read(join(evilRoot, 'openspec', 'changes', 'evil_change'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('fails closed on an unrelated existing change and never establishes/hijacks its missing identity', async () => {
    const repoRoot = await freshRoot()
    const store = createStateStore()
    const input = request()
    const changeDir = await store.init({
      ...trustedInit(),
      repoRoot,
      name: input.changeName,
      initialWorkflow: { workflow: input.workflowId, phase: input.initialStep },
    })
    let establishCalls = 0
    const realRunRepository = makeRunRepository(store)
    const repository = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store,
      runRepository: {
        ...realRunRepository,
        establishRun: async (dir) => {
          establishCalls += 1
          return realRunRepository.establishRun(dir)
        },
      },
      resolveInit: trustedInit,
    })

    await expect(repository.createIfAbsent(input)).rejects.toBeInstanceOf(WorkflowRunCreateConflictError)
    expect(establishCalls).toBe(0)
    expect((await store.read(changeDir)).runMetadata).toBeUndefined()
  })

  it('rejects reuse of one idempotency key for a different full request without replacing the winner', async () => {
    const { repoRoot, store, repository } = await makeHarness()
    const first = request()
    const conflicting = request({ workflowId: 'security-fix', initialStep: 'triage' })
    await repository.createIfAbsent(first)

    await expect(repository.createIfAbsent(conflicting)).rejects.toMatchObject({
      _tag: 'WorkflowRunCreateConflictError',
      expectedRunId: expectedRunId(conflicting),
      observedRunId: expectedRunId(first),
    })
    const state = await store.read(join(repoRoot, 'openspec', 'changes', first.changeName))
    expect(state.runMetadata?.runId).toBe(expectedRunId(first))
    expect(state.fields).toMatchObject({ workflow: 'default', phase: 'open' })
  })

  it('recovers after init succeeded but establishRun crashed: retry returns existing from the durable identity', async () => {
    const repoRoot = await freshRoot()
    const store = createStateStore()
    const realRunRepository = makeRunRepository(store)
    let establishCalls = 0
    const crash = new Error('simulated process crash after atomic init')
    const runRepository: WorkflowRunRepository = {
      ...realRunRepository,
      establishRun: async (changeDir) => {
        establishCalls += 1
        if (establishCalls === 1) throw crash
        return realRunRepository.establishRun(changeDir)
      },
    }
    const repository = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store,
      runRepository,
      resolveInit: trustedInit,
    })
    const input = request()

    await expect(repository.createIfAbsent(input)).rejects.toBe(crash)
    expect((await store.read(join(repoRoot, 'openspec', 'changes', input.changeName))).runMetadata?.runId)
      .toBe(expectedRunId(input))

    await expect(repository.createIfAbsent(input)).resolves.toMatchObject({
      status: 'existing',
      run: { id: expectedRunId(input), workflowId: 'default', currentStep: 'open' },
    })
  })

  it('never reclassifies establishRun EEXIST as init contention: the original error escapes unchanged', async () => {
    const repoRoot = await freshRoot()
    const store = createStateStore()
    const realRunRepository = makeRunRepository(store)
    const establishFailure = Object.assign(new Error('record collision inside establishRun'), {
      code: 'EEXIST',
    })
    let establishCalls = 0
    const repository = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store,
      runRepository: {
        ...realRunRepository,
        establishRun: async (changeDir) => {
          establishCalls += 1
          if (establishCalls === 1) throw establishFailure
          return realRunRepository.establishRun(changeDir)
        },
      },
      resolveInit: trustedInit,
    })

    await expect(repository.createIfAbsent(request())).rejects.toBe(establishFailure)
    expect(establishCalls).toBe(1)
  })

  it('checks workflow and phase as well as run id before accepting EEXIST', async () => {
    const { repoRoot, store, repository } = await makeHarness()
    const input = request()
    await repository.createIfAbsent(input)
    const changeDir = join(repoRoot, 'openspec', 'changes', input.changeName)
    const state = await store.read(changeDir)
    await store.write(changeDir, { ...state, fields: { ...state.fields, phase: 'verify' } })

    await expect(repository.createIfAbsent(input)).rejects.toMatchObject({
      _tag: 'WorkflowRunCreateConflictError',
      expectedWorkflowId: 'default',
      expectedInitialStep: 'open',
      observedWorkflowId: 'default',
      observedInitialStep: 'verify',
    })
  })

  it('accepts EEXIST from one locked snapshot without calling a write-capable establishRun afterward', async () => {
    const repoRoot = await freshRoot()
    const store = createStateStore()
    const input = request()
    const originalRunRepository = makeRunRepository(store)
    const creator = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store,
      runRepository: originalRunRepository,
      resolveInit: trustedInit,
    })
    await creator.createIfAbsent(input)

    let establishCalls = 0
    const hijackingRunRepository = createWorkflowRunRepository({
      store,
      recordStore: createTransitionRecordStore(),
      clock: FIXED_CLOCK,
      newId: () => 'hijacked-run-id',
    })
    const retry = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store,
      runRepository: {
        establishRun: async (changeDir) => {
          establishCalls += 1
          // Models the r2 race: the first repository read already validated the original identity,
          // then another writer removes metadata before establishRun performs its own locked read.
          const state = await store.read(changeDir)
          await store.write(changeDir, { ...state, runMetadata: undefined })
          return hijackingRunRepository.establishRun(changeDir)
        },
      },
      resolveInit: trustedInit,
    })

    await expect(retry.createIfAbsent(input)).resolves.toMatchObject({
      status: 'existing',
      run: { id: expectedRunId(input), workflowId: 'default', currentStep: 'open' },
    })
    expect(establishCalls).toBe(0)
    expect((await store.read(join(repoRoot, 'openspec', 'changes', input.changeName))).runMetadata?.runId)
      .toBe(expectedRunId(input))
  })

  it('lets non-EEXIST init failures and EEXIST follow-up read failures escape unchanged', async () => {
    const repoRoot = await freshRoot()
    const realStore = createStateStore()
    const initFailure = Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    const initFailStore = Object.assign(Object.create(realStore) as StateStore, {
      init: async () => { throw initFailure },
    })
    const initFailRepository = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store: initFailStore,
      runRepository: makeRunRepository(initFailStore),
      resolveInit: trustedInit,
    })
    await expect(initFailRepository.createIfAbsent(request())).rejects.toBe(initFailure)

    const readFailure = Object.assign(new Error('I/O read failure'), { code: 'EIO' })
    await realStore.init({
      ...trustedInit(),
      repoRoot,
      name: request().changeName,
      runId: 'foreign-run',
      initialWorkflow: { workflow: 'default', phase: 'open' },
    })
    const existsStore = Object.assign(Object.create(realStore) as StateStore, {
      init: async () => { throw Object.assign(new Error('exists'), { code: 'EEXIST' }) },
      read: async () => { throw readFailure },
    })
    const existsRepository = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store: existsStore,
      runRepository: makeRunRepository(existsStore),
      resolveInit: trustedInit,
    })
    await expect(existsRepository.createIfAbsent(request())).rejects.toBe(readFailure)
  })

  it('includes every canonical request field in the stable digest independent of object insertion order', async () => {
    const baseline = request()
    const reordered = {
      initialStep: baseline.initialStep,
      workflowId: baseline.workflowId,
      routeId: baseline.routeId,
      changeName: baseline.changeName,
      candidateId: baseline.candidateId,
      actionIdentity: baseline.actionIdentity,
      source: {
        observationId: baseline.source.observationId,
        actionKind: baseline.source.actionKind,
        sourceId: baseline.source.sourceId,
      },
      idempotencyKey: baseline.idempotencyKey,
      kind: baseline.kind,
      schemaVersion: baseline.schemaVersion,
    } satisfies WorkflowRunCreateRequest
    const first = await makeHarness()
    const second = await makeHarness()
    const firstRun = await first.repository.createIfAbsent(baseline)
    const secondRun = await second.repository.createIfAbsent(reordered)
    expect(firstRun.run.id).toBe(secondRun.run.id)

    const mutations: WorkflowRunCreateRequest[] = [
      request({ idempotencyKey: `${baseline.idempotencyKey}:changed` }),
      request({ source: { ...baseline.source, sourceId: 'repo-other' } }),
      request({ source: { ...baseline.source, actionKind: 'loop-run-terminals' } }),
      request({ source: { ...baseline.source, observationId: 'commit:bbbbbbbb' } }),
      request({ actionIdentity: `${baseline.actionIdentity}:changed` }),
      request({ candidateId: `${baseline.candidateId}:changed` }),
      request({ changeName: 'triage_fix_bbbbbbbb' }),
      request({ routeId: 'security-fix' }),
      request({ workflowId: 'security-fix' }),
      request({ initialStep: 'triage' }),
    ]
    for (const mutation of mutations) {
      const harness = await makeHarness()
      const outcome = await harness.repository.createIfAbsent(mutation)
      expect(outcome.run.id).not.toBe(firstRun.run.id)
    }
  })

  it.each([
    ['wrong schema', { ...request(), schemaVersion: 2 }],
    ['wrong kind', { ...request(), kind: 'delete-workflow-run' }],
    ['unknown action kind', { ...request(), source: { ...request().source, actionKind: 'shell' } }],
    ['unsafe change name', { ...request(), changeName: '../escape' }],
    ['empty workflow', { ...request(), workflowId: '' }],
    ['unknown top-level field', { ...request(), executable: '/bin/sh' }],
  ])('rejects a non-canonical request (%s) before policy resolution or filesystem access', async (_label, raw) => {
    const repoRoot = await freshRoot()
    let policyCalls = 0
    let initCalls = 0
    const realStore = createStateStore()
    const store = Object.assign(Object.create(realStore) as StateStore, {
      init: async (options: InitOptions) => {
        initCalls += 1
        return realStore.init(options)
      },
    })
    const repository = createWorkflowRunCreateIfAbsentRepository({
      repoRoot,
      store,
      runRepository: makeRunRepository(store),
      resolveInit: () => {
        policyCalls += 1
        return trustedInit()
      },
    })

    await expect(repository.createIfAbsent(raw as WorkflowRunCreateRequest))
      .rejects.toBeInstanceOf(WorkflowRunCreateRequestError)
    expect(policyCalls).toBe(0)
    expect(initCalls).toBe(0)
  })
})
