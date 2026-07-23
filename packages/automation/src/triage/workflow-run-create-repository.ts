import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import {
  OBSERVE_ACTION_KINDS,
  type InitOptions,
  type PipelineState,
  type StateStore,
  type WorkflowRun,
  type WorkflowRunRepository,
} from '@pipeline-lite/kernel'
import type {
  WorkflowRunCreateIfAbsentRepository,
  WorkflowRunCreateIfAbsentResult,
  WorkflowRunCreateRequest,
} from './workflow-run-materializer.js'

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'kind',
  'idempotencyKey',
  'source',
  'actionIdentity',
  'candidateId',
  'changeName',
  'routeId',
  'workflowId',
  'initialStep',
])
const SOURCE_KEYS = new Set(['sourceId', 'actionKind', 'observationId'])
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const CHANGE_NAME_RE = /^[A-Za-z0-9_-]+$/

export type WorkflowRunCreateTrustedInit = Omit<
  InitOptions,
  'repoRoot' | 'name' | 'runId' | 'initialWorkflow'
>

export interface WorkflowRunCreateRepositoryDeps {
  readonly repoRoot: string
  readonly store: StateStore
  readonly runRepository: Pick<WorkflowRunRepository, 'establishRun'>
  /** Host-owned policy. Request identity, location, and workflow coordinates are not delegable. */
  readonly resolveInit: (
    request: WorkflowRunCreateRequest,
  ) => WorkflowRunCreateTrustedInit | Promise<WorkflowRunCreateTrustedInit>
}

export class WorkflowRunCreateRequestError extends Error {
  readonly _tag = 'WorkflowRunCreateRequestError' as const

  constructor(readonly issues: readonly string[]) {
    super(`WorkflowRun create request rejected: ${issues.join('; ')}`)
    this.name = 'WorkflowRunCreateRequestError'
  }
}

export interface WorkflowRunCreateConflictDetails {
  readonly changeDir: string
  readonly expectedRunId: string
  readonly observedRunId?: string
  readonly expectedWorkflowId: string
  readonly observedWorkflowId?: string
  readonly expectedInitialStep: string
  readonly observedInitialStep?: string
}

export class WorkflowRunCreateConflictError extends Error {
  readonly _tag = 'WorkflowRunCreateConflictError' as const
  readonly changeDir: string
  readonly expectedRunId: string
  readonly observedRunId?: string
  readonly expectedWorkflowId: string
  readonly observedWorkflowId?: string
  readonly expectedInitialStep: string
  readonly observedInitialStep?: string

  constructor(details: WorkflowRunCreateConflictDetails) {
    super(
      `WorkflowRun create conflict at '${details.changeDir}': expected `
      + `run=${details.expectedRunId}, workflow=${details.expectedWorkflowId}, step=${details.expectedInitialStep}; `
      + `observed run=${details.observedRunId ?? '<missing>'}, `
      + `workflow=${details.observedWorkflowId ?? '<invalid>'}, `
      + `step=${details.observedInitialStep ?? '<invalid>'}`,
    )
    this.name = 'WorkflowRunCreateConflictError'
    this.changeDir = details.changeDir
    this.expectedRunId = details.expectedRunId
    this.observedRunId = details.observedRunId
    this.expectedWorkflowId = details.expectedWorkflowId
    this.observedWorkflowId = details.observedWorkflowId
    this.expectedInitialStep = details.expectedInitialStep
    this.observedInitialStep = details.observedInitialStep
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unexpectedKeys(value: object, allowed: ReadonlySet<string>): string[] {
  return Reflect.ownKeys(value)
    .filter((key) => typeof key !== 'string' || !allowed.has(key))
    .map((key) => typeof key === 'symbol' ? key.toString() : key)
}

function validateString(
  value: unknown,
  path: string,
  issues: string[],
  kind: 'safe-id' | 'change-name' = 'safe-id',
): value is string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) {
    issues.push(`${path}: expected a non-empty string`)
    return false
  }
  if (kind === 'safe-id' && !SAFE_ID_RE.test(value)) {
    issues.push(`${path}: expected a safe opaque id`)
    return false
  }
  if (kind === 'change-name' && (!CHANGE_NAME_RE.test(value) || value.includes('..'))) {
    issues.push(`${path}: expected a safe change name`)
    return false
  }
  return true
}

/**
 * Read every known field exactly once into a plain frozen value. Besides rejecting direct misuse,
 * this prevents getters/proxies from presenting one request to hashing and another to init policy.
 */
function snapshotRequest(input: WorkflowRunCreateRequest): WorkflowRunCreateRequest {
  try {
    if (!isRecord(input)) throw new WorkflowRunCreateRequestError(['request: expected an object'])
    const topExtras = unexpectedKeys(input, TOP_LEVEL_KEYS)
    const sourceInput = input.source
    const sourceIsRecord = isRecord(sourceInput)
    const sourceExtras = sourceIsRecord ? unexpectedKeys(sourceInput, SOURCE_KEYS) : []

    const schemaVersion = input.schemaVersion
    const kind = input.kind
    const idempotencyKey = input.idempotencyKey
    const sourceId = sourceIsRecord ? sourceInput.sourceId : undefined
    const actionKind = sourceIsRecord ? sourceInput.actionKind : undefined
    const observationId = sourceIsRecord ? sourceInput.observationId : undefined
    const actionIdentity = input.actionIdentity
    const candidateId = input.candidateId
    const changeName = input.changeName
    const routeId = input.routeId
    const workflowId = input.workflowId
    const initialStep = input.initialStep

    const issues: string[] = []
    if (topExtras.length > 0) issues.push(`request: unknown fields ${topExtras.join(', ')}`)
    if (!sourceIsRecord) {
      issues.push('request.source: expected an object')
    } else if (sourceExtras.length > 0) {
      issues.push(`request.source: unknown fields ${sourceExtras.join(', ')}`)
    }
    if (schemaVersion !== 1) issues.push('request.schemaVersion: expected literal 1')
    if (kind !== 'create-workflow-run') issues.push("request.kind: expected 'create-workflow-run'")
    validateString(idempotencyKey, 'request.idempotencyKey', issues)
    validateString(sourceId, 'request.source.sourceId', issues)
    if (!OBSERVE_ACTION_KINDS.includes(actionKind as (typeof OBSERVE_ACTION_KINDS)[number])) {
      issues.push('request.source.actionKind: expected a supported observe action kind')
    }
    validateString(observationId, 'request.source.observationId', issues)
    validateString(actionIdentity, 'request.actionIdentity', issues)
    validateString(candidateId, 'request.candidateId', issues)
    validateString(changeName, 'request.changeName', issues, 'change-name')
    validateString(routeId, 'request.routeId', issues)
    validateString(workflowId, 'request.workflowId', issues)
    validateString(initialStep, 'request.initialStep', issues)
    if (issues.length > 0) throw new WorkflowRunCreateRequestError(issues)

    const source = Object.freeze({
      sourceId: sourceId as string,
      actionKind: actionKind as WorkflowRunCreateRequest['source']['actionKind'],
      observationId: observationId as string,
    })
    return Object.freeze({
      schemaVersion: 1,
      kind: 'create-workflow-run',
      idempotencyKey: idempotencyKey as string,
      source,
      actionIdentity: actionIdentity as string,
      candidateId: candidateId as string,
      changeName: changeName as string,
      routeId: routeId as string,
      workflowId: workflowId as string,
      initialStep: initialStep as string,
    })
  } catch (error) {
    if (error instanceof WorkflowRunCreateRequestError) throw error
    throw new WorkflowRunCreateRequestError([
      `request: could not extract canonical fields (${error instanceof Error ? error.message : String(error)})`,
    ])
  }
}

function runIdFor(request: WorkflowRunCreateRequest): string {
  const canonical = JSON.stringify([
    request.schemaVersion,
    request.kind,
    request.idempotencyKey,
    request.source.sourceId,
    request.source.actionKind,
    request.source.observationId,
    request.actionIdentity,
    request.candidateId,
    request.changeName,
    request.routeId,
    request.workflowId,
    request.initialStep,
  ])
  return `triage-run-v1-${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function stateString(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function assertExistingIdentity(
  changeDir: string,
  expectedRunId: string,
  request: WorkflowRunCreateRequest,
  observed: {
    readonly runId?: string
    readonly workflowId?: string
    readonly initialStep?: string
  },
): void {
  if (
    observed.runId === expectedRunId
    && observed.workflowId === request.workflowId
    && observed.initialStep === request.initialStep
  ) return
  throw new WorkflowRunCreateConflictError({
    changeDir,
    expectedRunId,
    observedRunId: observed.runId,
    expectedWorkflowId: request.workflowId,
    observedWorkflowId: observed.workflowId,
    expectedInitialStep: request.initialStep,
    observedInitialStep: observed.initialStep,
  })
}

function assertEstablishedRun(
  changeDir: string,
  expectedRunId: string,
  request: WorkflowRunCreateRequest,
  run: WorkflowRun,
): void {
  assertExistingIdentity(changeDir, expectedRunId, request, {
    runId: run.id,
    workflowId: run.workflowId,
    initialStep: run.currentStep,
  })
}

function runFromValidatedState(state: PipelineState): WorkflowRun {
  const metadata = state.runMetadata!
  const stringField = (key: keyof PipelineState['fields']): string => {
    const value = state.fields[key]
    return Array.isArray(value) ? value.join(',') : (value ?? '')
  }
  return {
    id: metadata.runId,
    workflowId: stringField('workflow'),
    currentStep: stringField('phase'),
    lifecycle: stringField('archived') === 'true' ? 'archived' : 'active',
    transitionSequence: metadata.transitionSequence,
    transitionHead: metadata.transitionHead,
    createdAt: stringField('created_at'),
    updatedAt: stringField('updated_at'),
  }
}

export function createWorkflowRunCreateIfAbsentRepository(
  deps: WorkflowRunCreateRepositoryDeps,
): WorkflowRunCreateIfAbsentRepository {
  return {
    async createIfAbsent(input): Promise<WorkflowRunCreateIfAbsentResult> {
      const request = snapshotRequest(input)
      const expectedRunId = runIdFor(request)
      const trusted = await deps.resolveInit(request)
      // Explicit projection is intentional: even an unsound host implementation cannot smuggle
      // repoRoot/name/runId/initialWorkflow through object spread and override request identity.
      const init: InitOptions = {
        repoRoot: deps.repoRoot,
        name: request.changeName,
        track: trusted.track,
        reviewSeed: trusted.reviewSeed,
        preset: trusted.preset,
        user: trusted.user,
        clock: trusted.clock,
        runId: expectedRunId,
        initialWorkflow: { workflow: request.workflowId, phase: request.initialStep },
      }
      const changeDir = join(
        resolve(deps.repoRoot),
        'openspec',
        'changes',
        request.changeName,
      )

      let createdDir: string | undefined
      try {
        createdDir = await deps.store.init(init)
      } catch (error) {
        if (errnoCode(error) !== 'EEXIST') throw error
      }
      if (createdDir !== undefined) {
        // Deliberately outside the init catch: an EEXIST from establishRun is its own I/O/domain
        // failure, not evidence that this call lost StateStore.init's exclusive-create race.
        const run = await deps.runRepository.establishRun(createdDir)
        assertEstablishedRun(createdDir, expectedRunId, request, run)
        return { status: 'created', run }
      }

      // EEXIST is the linearization loser (or a genuine name collision). Validate before calling
      // establishRun so an unrelated legacy change with no runMetadata is never silently upgraded.
      const run = await deps.store.withLock(changeDir, async () => {
        const state = await deps.store.read(changeDir)
        assertExistingIdentity(changeDir, expectedRunId, request, {
          runId: state.runMetadata?.runId,
          workflowId: stateString(state.fields.workflow),
          initialStep: stateString(state.fields.phase),
        })
        // Build the read result while the same lock and snapshot are still authoritative. Calling
        // establishRun here would deadlock on its nested lock; calling it after unlock would reopen
        // the exact validation→write TOCTOU this branch must avoid.
        return runFromValidatedState(state)
      })
      return { status: 'existing', run }
    },
  }
}
