import { readSkillInvocationEvidence, type SkillInvocationListReadModelV1 } from '@tenon/kernel'
import { closeSync, constants, fstatSync, openSync } from 'node:fs'
import {
  assertChangeParentPathAnchor,
  assertChangePathAnchor,
  captureChangeParentPathAnchor,
  captureChangePathAnchor,
  ContextBundlePathError,
  type ChangeParentPathAnchor,
  type ChangePathAnchor,
} from './contextBundlePreviewSupport.js'
import { assertWorkflowRootAnchor, type WorkflowRootAnchor } from './workflows.js'
import {
  assertWorkflowRootMutationVersion,
  captureWorkflowRootMutationVersion,
  sameIdentity,
  traversableDirectoryFdPath,
  type WorkflowRootMutationVersion,
} from './workflowRootAnchor.js'

type WorkflowRootCheck =
  | { readonly ok: true; readonly anchor: WorkflowRootAnchor }
  | { readonly ok: false; readonly code: 403 | 404; readonly error: string }

export interface SkillInvocationRouteDeps {
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly readEvidence: (anchor: WorkflowRootAnchor, change: string) => Promise<SkillInvocationListReadModelV1>
}

export type SkillInvocationErrorCode =
  | 'SKILL_INVOCATION_CHANGE_INVALID'
  | 'SKILL_INVOCATION_FILTER_INVALID'
  | 'SKILL_INVOCATION_ROOT_REQUIRED'
  | 'SKILL_INVOCATION_ROOT_NOT_REGISTERED'
  | 'SKILL_INVOCATION_ROOT_FORBIDDEN'
  | 'SKILL_INVOCATION_NOT_FOUND'
  | 'SKILL_INVOCATION_PATH_FORBIDDEN'
  | 'SKILL_INVOCATION_CORRUPT'

export interface SkillInvocationErrorResponse {
  readonly ok: false
  readonly code: SkillInvocationErrorCode
  readonly error: string
}

export type SkillInvocationRouteResult =
  | { readonly status: 200; readonly body: SkillInvocationListReadModelV1 }
  | { readonly status: 400 | 403 | 404 | 409; readonly body: SkillInvocationErrorResponse }

interface AnchoredReaderDeps {
  readonly assertRoot: (anchor: WorkflowRootAnchor) => void
  readonly captureChangeParent: (anchor: WorkflowRootAnchor) => ChangeParentPathAnchor
  readonly assertChangeParent: (anchor: ChangeParentPathAnchor) => void
  readonly captureChange: (anchor: WorkflowRootAnchor, change: string) => ChangePathAnchor
  readonly assertChange: (anchor: ChangePathAnchor) => void
  readonly readEvidence: (changeDir: string) => Promise<SkillInvocationListReadModelV1>
}

const anchoredDeps: AnchoredReaderDeps = {
  assertRoot: assertWorkflowRootAnchor,
  captureChangeParent: captureChangeParentPathAnchor,
  assertChangeParent: assertChangeParentPathAnchor,
  captureChange: captureChangePathAnchor,
  assertChange: assertChangePathAnchor,
  readEvidence: readSkillInvocationEvidence,
}

function assertRoot(anchor: WorkflowRootAnchor, check: AnchoredReaderDeps['assertRoot']): void {
  try { check(anchor) } catch (cause) {
    throw new ContextBundlePathError(403, 'Skill invocation registered root identity changed', cause)
  }
}

function rootVersion(anchor: WorkflowRootAnchor): WorkflowRootMutationVersion {
  try { return captureWorkflowRootMutationVersion(anchor) } catch (cause) {
    throw new ContextBundlePathError(403, 'Skill invocation registered root changed during read', cause)
  }
}

function assertVersion(anchor: WorkflowRootAnchor, expected: WorkflowRootMutationVersion): void {
  try { assertWorkflowRootMutationVersion(anchor, expected) } catch (cause) {
    throw new ContextBundlePathError(403, 'Skill invocation registered root changed during read', cause)
  }
}

export async function readAnchoredSkillInvocationEvidence(
  anchor: WorkflowRootAnchor,
  change: string,
  overrides: Partial<AnchoredReaderDeps> = {},
): Promise<SkillInvocationListReadModelV1> {
  const deps = { ...anchoredDeps, ...overrides }
  assertRoot(anchor, deps.assertRoot)
  const version = rootVersion(anchor)
  const parent = deps.captureChangeParent(anchor)
  let changeAnchor: ChangePathAnchor
  try {
    changeAnchor = deps.captureChange(anchor, change)
  } catch (cause) {
    assertRoot(anchor, deps.assertRoot)
    assertVersion(anchor, version)
    deps.assertChangeParent(parent)
    throw Object.assign(new Error('Skill invocation Change does not exist'), { status: 404, cause })
  }
  assertRoot(anchor, deps.assertRoot)
  deps.assertChangeParent(parent)
  deps.assertChange(changeAnchor)
  const identity = changeAnchor.chain.at(-1)
  if (identity === undefined) throw new ContextBundlePathError(403, 'Skill invocation Change identity is missing')
  const fd = openSync(changeAnchor.changeDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    const opened = fstatSync(fd)
    if (!opened.isDirectory() || !sameIdentity(opened, identity)) {
      throw new ContextBundlePathError(403, 'Skill invocation Change identity changed while anchoring')
    }
    const anchoredChangeDir = traversableDirectoryFdPath(fd, identity) ?? changeAnchor.changeDir
    const result = await deps.readEvidence(anchoredChangeDir)
    deps.assertChange(changeAnchor)
    assertRoot(anchor, deps.assertRoot)
    assertVersion(anchor, version)
    return result
  } finally {
    closeSync(fd)
  }
}

function validName(value: string): boolean {
  return value !== '' && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value) && !value.includes('..')
}

function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const value = Reflect.get(error, 'status')
  return typeof value === 'number' ? value : undefined
}

function failure(
  statusCode: 400 | 403 | 404 | 409,
  code: SkillInvocationErrorCode,
  error: string,
): SkillInvocationRouteResult {
  return { status: statusCode, body: { ok: false, code, error } }
}

function filtered(
  evidence: SkillInvocationListReadModelV1,
  runId: string | null,
  workItemId: string | null,
): SkillInvocationListReadModelV1 {
  if (runId === null && workItemId === null) return evidence
  const items = evidence.items.filter((item) =>
    (runId === null || item.subject.workflow_run_id === runId)
    && (workItemId === null || item.subject.work_item_id === workItemId))
  return { ...evidence, state: items.length === 0 ? 'empty' : evidence.state, items }
}

export async function resolveSkillInvocationRoute(
  rawUrl: string,
  path: string,
  deps: SkillInvocationRouteDeps,
): Promise<SkillInvocationRouteResult | null> {
  const match = /^\/api\/skill-invocations\/([^/]+)$/u.exec(path)
  if (match === null) return null
  let change: string
  try { change = decodeURIComponent(match[1] ?? '') } catch {
    return failure(400, 'SKILL_INVOCATION_CHANGE_INVALID', 'Invalid Skill invocation Change')
  }
  if (!validName(change) || change.includes('/')) {
    return failure(400, 'SKILL_INVOCATION_CHANGE_INVALID', 'Invalid Skill invocation Change')
  }
  const url = new URL(rawUrl, 'http://localhost')
  const runId = url.searchParams.get('run_id')
  const workItemId = url.searchParams.get('work_item_id')
  if ((runId !== null && !validName(runId)) || (workItemId !== null && !validName(workItemId))) {
    return failure(400, 'SKILL_INVOCATION_FILTER_INVALID', 'Invalid Skill invocation filter')
  }
  const root = url.searchParams.get('root') ?? ''
  if (root === '') return failure(400, 'SKILL_INVOCATION_ROOT_REQUIRED', 'Missing root')
  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) {
    return rootCheck.code === 404
      ? failure(404, 'SKILL_INVOCATION_ROOT_NOT_REGISTERED', 'Root is not registered')
      : failure(403, 'SKILL_INVOCATION_ROOT_FORBIDDEN', 'Root is not trusted')
  }
  try {
    return { status: 200, body: filtered(await deps.readEvidence(rootCheck.anchor, change), runId, workItemId) }
  } catch (cause) {
    if (status(cause) === 404) return failure(404, 'SKILL_INVOCATION_NOT_FOUND', 'Change does not exist')
    if (status(cause) === 403) return failure(403, 'SKILL_INVOCATION_PATH_FORBIDDEN', 'Skill invocation path is not trusted')
    return failure(409, 'SKILL_INVOCATION_CORRUPT', 'Skill invocation evidence is corrupt')
  }
}
