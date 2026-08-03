import { readTaskPlanForChange, type TaskPlanReadModelV1 } from '@tenon/kernel'
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
import { assertWorkflowRootAnchor } from './workflows.js'
import type { WorkflowRootAnchor } from './workflows.js'
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

export interface TaskPlanRouteDeps {
  readonly workflowRootForRequest: (root: string) => WorkflowRootCheck
  readonly readPlan: (anchor: WorkflowRootAnchor, change: string) => Promise<TaskPlanReadModelV1 | null>
}

export const TASK_PLAN_ERROR_CODES = [
  'TASK_PLAN_CHANGE_INVALID',
  'TASK_PLAN_ROOT_REQUIRED',
  'TASK_PLAN_ROOT_NOT_REGISTERED',
  'TASK_PLAN_ROOT_FORBIDDEN',
  'TASK_PLAN_NOT_FOUND',
  'TASK_PLAN_PATH_FORBIDDEN',
  'TASK_PLAN_CORRUPT',
] as const

export type TaskPlanErrorCode = (typeof TASK_PLAN_ERROR_CODES)[number]

export interface TaskPlanErrorResponse {
  readonly ok: false
  readonly code: TaskPlanErrorCode
  readonly error: string
}

export type TaskPlanRouteResult =
  | { readonly status: 200; readonly body: TaskPlanReadModelV1 }
  | { readonly status: 400 | 403 | 404 | 409; readonly body: TaskPlanErrorResponse }

interface AnchoredTaskPlanReaderDeps {
  readonly assertRoot: (anchor: WorkflowRootAnchor) => void
  readonly captureChangeParent: (anchor: WorkflowRootAnchor) => ChangeParentPathAnchor
  readonly assertChangeParent: (anchor: ChangeParentPathAnchor) => void
  readonly captureChange: (anchor: WorkflowRootAnchor, change: string) => ChangePathAnchor
  readonly assertChange: (anchor: ChangePathAnchor) => void
  readonly readPlan: (changeDir: string) => Promise<TaskPlanReadModelV1 | null>
}

const defaultAnchoredReaderDeps: AnchoredTaskPlanReaderDeps = {
  assertRoot: assertWorkflowRootAnchor,
  captureChangeParent: captureChangeParentPathAnchor,
  assertChangeParent: assertChangeParentPathAnchor,
  captureChange: captureChangePathAnchor,
  assertChange: assertChangePathAnchor,
  readPlan: readTaskPlanForChange,
}

function assertTrustedRoot(
  anchor: WorkflowRootAnchor,
  assertRoot: AnchoredTaskPlanReaderDeps['assertRoot'],
): void {
  try {
    assertRoot(anchor)
  } catch (cause) {
    throw new ContextBundlePathError(403, 'TaskPlan registered root identity changed', cause)
  }
}

function trustedRootMutationVersion(anchor: WorkflowRootAnchor): WorkflowRootMutationVersion {
  try {
    return captureWorkflowRootMutationVersion(anchor)
  } catch (cause) {
    throw new ContextBundlePathError(
      403,
      'TaskPlan registered root changed during read',
      cause,
    )
  }
}

function assertRootMutationVersion(
  anchor: WorkflowRootAnchor,
  expected: WorkflowRootMutationVersion,
): void {
  try {
    assertWorkflowRootMutationVersion(anchor, expected)
  } catch (cause) {
    throw new ContextBundlePathError(403, 'TaskPlan registered root changed during read')
  }
}

export async function readAnchoredTaskPlan(
  anchor: WorkflowRootAnchor,
  change: string,
  overrides: Partial<AnchoredTaskPlanReaderDeps> = {},
): Promise<TaskPlanReadModelV1 | null> {
  const deps = { ...defaultAnchoredReaderDeps, ...overrides }
  assertTrustedRoot(anchor, deps.assertRoot)
  const rootVersion = trustedRootMutationVersion(anchor)
  const changeParentAnchor = deps.captureChangeParent(anchor)
  let changeAnchor: ChangePathAnchor
  try {
    changeAnchor = deps.captureChange(anchor, change)
  } catch (error) {
    if (errorStatus(error) === 400) {
      assertTrustedRoot(anchor, deps.assertRoot)
      assertRootMutationVersion(anchor, rootVersion)
      deps.assertChangeParent(changeParentAnchor)
      return null
    }
    throw error
  }
  assertTrustedRoot(anchor, deps.assertRoot)
  deps.assertChangeParent(changeParentAnchor)
  deps.assertChange(changeAnchor)
  const changeIdentity = changeAnchor.chain.at(-1)
  if (changeIdentity === undefined) {
    throw new ContextBundlePathError(403, 'TaskPlan Change directory identity is missing')
  }
  let changeFd: number
  try {
    changeFd = openSync(
      changeAnchor.changeDir,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
  } catch (cause) {
    throw new ContextBundlePathError(403, 'TaskPlan Change directory cannot be anchored', cause)
  }
  const openedChange = fstatSync(changeFd)
  const anchoredChangeDir = traversableDirectoryFdPath(changeFd, changeIdentity)
    ?? changeAnchor.changeDir
  if (!openedChange.isDirectory() || !sameIdentity(openedChange, changeIdentity)) {
    closeSync(changeFd)
    throw new ContextBundlePathError(403, 'TaskPlan Change directory identity changed while anchoring')
  }
  let result: TaskPlanReadModelV1 | null = null
  let readFailed = false
  let readError: unknown
  try {
    result = await deps.readPlan(anchoredChangeDir)
  } catch (error) {
    readFailed = true
    readError = error
  }
  try {
    deps.assertChange(changeAnchor)
    assertTrustedRoot(anchor, deps.assertRoot)
    assertRootMutationVersion(anchor, rootVersion)
    if (readFailed) throw readError
    return result
  } finally {
    closeSync(changeFd)
  }
}

function isChangeName(name: string): boolean {
  return name !== '' && /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes('..')
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = Reflect.get(error, 'status')
  return typeof status === 'number' ? status : undefined
}

function failure(
  status: 400 | 403 | 404 | 409,
  code: TaskPlanErrorCode,
  error: string,
): TaskPlanRouteResult {
  return { status, body: { ok: false, code, error } }
}

export async function resolveTaskPlanRoute(
  rawUrl: string,
  path: string,
  deps: TaskPlanRouteDeps,
): Promise<TaskPlanRouteResult | null> {
  const match = /^\/api\/task-plans\/([^/]+)$/.exec(path)
  if (match === null) return null
  const segment = match[1]
  if (segment === undefined) {
    return failure(400, 'TASK_PLAN_CHANGE_INVALID', '非法 TaskPlan 路径')
  }
  let change: string
  try {
    change = decodeURIComponent(segment)
  } catch {
    return failure(400, 'TASK_PLAN_CHANGE_INVALID', '非法 change 名（仅允许 a-z A-Z 0-9 - _）')
  }
  if (!isChangeName(change)) {
    return failure(400, 'TASK_PLAN_CHANGE_INVALID', '非法 change 名（仅允许 a-z A-Z 0-9 - _）')
  }
  const root = new URL(rawUrl, 'http://localhost').searchParams.get('root') ?? ''
  if (root === '') return failure(400, 'TASK_PLAN_ROOT_REQUIRED', '缺少 root')
  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) {
    return rootCheck.code === 404
      ? failure(404, 'TASK_PLAN_ROOT_NOT_REGISTERED', 'root 未注册')
      : failure(403, 'TASK_PLAN_ROOT_FORBIDDEN', 'root 不可信')
  }
  try {
    const plan = await deps.readPlan(rootCheck.anchor, change)
    return plan === null
      ? failure(404, 'TASK_PLAN_NOT_FOUND', 'TaskPlan 不存在')
      : { status: 200, body: plan }
  } catch (error) {
    if (errorStatus(error) === 403) {
      return failure(403, 'TASK_PLAN_PATH_FORBIDDEN', 'canonical TaskPlan 路径不可信')
    }
    return failure(409, 'TASK_PLAN_CORRUPT', 'canonical TaskPlan 损坏')
  }
}
