import { readTaskPlanForChange } from '@tenon/kernel'
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
  readonly readPlan: (anchor: WorkflowRootAnchor, change: string) => Promise<unknown | null>
}

export interface TaskPlanRouteResult {
  readonly status: number
  readonly body: unknown
}

interface AnchoredTaskPlanReaderDeps {
  readonly assertRoot: (anchor: WorkflowRootAnchor) => void
  readonly captureChangeParent: (anchor: WorkflowRootAnchor) => ChangeParentPathAnchor
  readonly assertChangeParent: (anchor: ChangeParentPathAnchor) => void
  readonly captureChange: (anchor: WorkflowRootAnchor, change: string) => ChangePathAnchor
  readonly assertChange: (anchor: ChangePathAnchor) => void
  readonly readPlan: (changeDir: string) => Promise<unknown | null>
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
): Promise<unknown | null> {
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
  let result: unknown | null = null
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

export async function resolveTaskPlanRoute(
  rawUrl: string,
  path: string,
  deps: TaskPlanRouteDeps,
): Promise<TaskPlanRouteResult | null> {
  const match = /^\/api\/task-plans\/([^/]+)$/.exec(path)
  if (match === null) return null
  const segment = match[1]
  if (segment === undefined) {
    return { status: 400, body: { ok: false, error: '非法 TaskPlan 路径' } }
  }
  let change: string
  try {
    change = decodeURIComponent(segment)
  } catch {
    return { status: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  if (!isChangeName(change)) {
    return { status: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } }
  }
  const root = new URL(rawUrl, 'http://localhost').searchParams.get('root') ?? ''
  if (root === '') return { status: 400, body: { ok: false, error: '缺少 root' } }
  const rootCheck = deps.workflowRootForRequest(root)
  if (!rootCheck.ok) {
    return {
      status: rootCheck.code,
      body: { ok: false, error: rootCheck.code === 404 ? 'root 未注册' : 'root 不可信' },
    }
  }
  try {
    const plan = await deps.readPlan(rootCheck.anchor, change)
    return plan === null
      ? { status: 404, body: { ok: false, error: 'TaskPlan 不存在' } }
      : { status: 200, body: plan }
  } catch (error) {
    if (errorStatus(error) === 403) {
      return { status: 403, body: { ok: false, error: 'canonical TaskPlan 路径不可信' } }
    }
    return { status: 409, body: { ok: false, error: 'canonical TaskPlan 损坏' } }
  }
}
