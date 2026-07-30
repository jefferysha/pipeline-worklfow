import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import {
  projectPipelineTodo,
  stateStorageSourcePathSync,
  type PipelineState,
  type StateStore,
} from '@tenon/kernel'
import {
  documentEvidence,
  documentTodoItems,
  readTerminalActivity,
  type SnapshotDeps,
} from './snapshot.js'
import type { ChangeSnapshot } from './types.js'
import { projectWorkflowDefinitionStatus } from './workflowDefinitionStatus.js'
import { readCurrentWorkflowDefinition } from './workflowDefinitionReader.js'
import { projectReviewHandshake } from './reviewHandshake.js'
import {
  resolveSnapshotEffectivePlan,
  snapshotTodoStages,
  snapshotWorkflowExecution,
  snapshotWorkflowRules,
  type WorkflowSnapshotCapabilityDeps,
} from './workflowSnapshot.js'
import {
  assertChangePathAnchor,
  captureChangePathAnchor,
  ContextBundlePathError,
  type ChangePathAnchor,
} from './contextBundlePreviewSupport.js'
import {
  assertWorkflowRootAnchor,
  captureWorkflowRootAnchor,
  closeWorkflowRootAnchor,
  readWorkflowForApi,
  WorkflowNotFoundError,
  type WorkflowRootAnchor,
} from './workflows.js'

interface PresentDirectoryIdentity {
  readonly kind: 'present'
  readonly path: string
  readonly realPath: string
  readonly dev: number
  readonly ino: number
}

interface MissingDirectoryIdentity {
  readonly kind: 'missing'
  readonly path: string
}

type DirectoryIdentity = PresentDirectoryIdentity | MissingDirectoryIdentity

interface FileIdentity extends Omit<PresentDirectoryIdentity, 'kind'> {
  readonly size: number
}

export interface AnchoredChangeState {
  readonly changeDir: string
  readonly state: PipelineState
  readonly changeAnchor: ChangePathAnchor
  readonly stateDirectories: readonly DirectoryIdentity[]
  readonly stateSource: FileIdentity
}

const CANONICAL_STATE_DIRECTORIES = [
  '.pipeline-run',
  '.pipeline-run/revisions',
  '.pipeline-run/pre-verify-review',
  '.pipeline-transitions',
] as const

function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'ENOENT'
}

function isInside(base: string, candidate: string): boolean {
  const fromBase = relative(base, candidate)
  return fromBase === ''
    || (fromBase !== '..' && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase))
}

function captureStateDirectories(changeAnchor: ChangePathAnchor): DirectoryIdentity[] {
  const directories: DirectoryIdentity[] = []
  for (const name of CANONICAL_STATE_DIRECTORIES) {
    const path = join(changeAnchor.changeDir, name)
    let info
    try {
      info = lstatSync(path)
    } catch (error) {
      if (missing(error)) {
        directories.push({ kind: 'missing', path })
        continue
      }
      throw error
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('canonical Change 路径不安全（须为真实目录）')
    }
    const realPath = realpathSync(path)
    if (!isInside(changeAnchor.realPath, realPath)) {
      throw new Error('canonical Change 路径已逃逸 registered root')
    }
    directories.push({ kind: 'present', path, realPath, dev: info.dev, ino: info.ino })
  }
  return directories
}

function assertStateDirectories(directories: readonly DirectoryIdentity[]): void {
  for (const expected of directories) {
    if (expected.kind === 'missing') {
      try {
        lstatSync(expected.path)
      } catch (error) {
        if (missing(error)) continue
        throw error
      }
      throw new Error('canonical Change 路径在读取期间出现')
    }
    const actual = lstatSync(expected.path)
    if (
      actual.isSymbolicLink()
      || !actual.isDirectory()
      || actual.dev !== expected.dev
      || actual.ino !== expected.ino
      || realpathSync(expected.path) !== expected.realPath
    ) {
      throw new Error('canonical Change 路径在读取期间变化')
    }
  }
}

function captureStateSource(changeAnchor: ChangePathAnchor, source: string): FileIdentity {
  const info = lstatSync(source)
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error('canonical Change 状态源必须是非 symlink 普通文件')
  }
  const realPath = realpathSync(source)
  if (!isInside(changeAnchor.realPath, realPath)) {
    throw new Error('canonical Change 状态源已逃逸 registered root')
  }
  return { path: source, realPath, dev: info.dev, ino: info.ino, size: info.size }
}

function assertStateSource(changeDir: string, expected: FileIdentity): void {
  if (stateStorageSourcePathSync(changeDir) !== expected.path) {
    throw new Error('canonical Change 状态源在读取期间变化')
  }
  const actual = lstatSync(expected.path)
  if (
    actual.isSymbolicLink()
    || !actual.isFile()
    || actual.dev !== expected.dev
    || actual.ino !== expected.ino
    || actual.size !== expected.size
    || realpathSync(expected.path) !== expected.realPath
  ) {
    throw new Error('canonical Change 状态源在读取期间变化')
  }
}

export const MAX_TASKS_MARKDOWN_BYTES = 256 * 1024

type TasksFdReader = (fd: number, maxBytes: number) => string

function readBoundedTasksSource(fd: number, maxBytes: number): string {
  const bytes = Buffer.allocUnsafe(maxBytes + 1)
  let total = 0
  while (total <= maxBytes) {
    const count = readSync(fd, bytes, total, maxBytes + 1 - total, null)
    if (count === 0) break
    total += count
  }
  if (total > maxBytes) {
    throw new Error(`Change tasks 超过 ${maxBytes} bytes 上限`)
  }
  return bytes.subarray(0, total).toString('utf8')
}

/** @internal Exported only so the race regression can prove no bytes are read before anchor checks. */
export function readAnchoredTasksMarkdown(
  changeAnchor: ChangePathAnchor,
  readSource: TasksFdReader = readBoundedTasksSource,
): string | undefined {
  const target = join(changeAnchor.changeDir, 'tasks.md')
  let fd: number
  try {
    fd = openSync(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
  } catch (error) {
    if (missing(error)) return undefined
    throw new ContextBundlePathError(403, 'Change tasks 路径不可信', error)
  }
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile()) {
      throw new ContextBundlePathError(403, 'Change tasks 必须是普通文件')
    }
    const assertOpenedTargetStillAnchored = (): void => {
      let current
      let realPath: string
      try {
        assertChangePathAnchor(changeAnchor)
        current = lstatSync(target)
        realPath = realpathSync(target)
      } catch (error) {
        if (error instanceof ContextBundlePathError) throw error
        throw new ContextBundlePathError(403, 'Change tasks 路径在读取期间变化', error)
      }
      if (
        current.isSymbolicLink()
        || !current.isFile()
        || current.dev !== opened.dev
        || current.ino !== opened.ino
        || current.size !== opened.size
        || !isInside(changeAnchor.realPath, realPath)
      ) {
        throw new ContextBundlePathError(403, 'Change tasks 路径在读取期间变化')
      }
    }
    // open(2) follows parent components even with O_NOFOLLOW. Validate that the opened inode is
    // still reached through the captured Change before reading any project-controlled bytes.
    assertOpenedTargetStillAnchored()
    if (opened.size > MAX_TASKS_MARKDOWN_BYTES) {
      throw new Error(`Change tasks 超过 ${MAX_TASKS_MARKDOWN_BYTES} bytes 上限`)
    }
    const source = readSource(fd, MAX_TASKS_MARKDOWN_BYTES)
    assertOpenedTargetStillAnchored()
    return source
  } finally {
    closeSync(fd)
  }
}

export async function readAnchoredChangeState(
  store: StateStore,
  root: WorkflowRootAnchor,
  changeName: string,
): Promise<AnchoredChangeState | null> {
  assertWorkflowRootAnchor(root)
  let changeAnchor: ChangePathAnchor
  try {
    changeAnchor = captureChangePathAnchor(root, changeName)
  } catch (error) {
    if (error instanceof ContextBundlePathError && error.status === 400) return null
    throw error
  }
  const stateDirectories = captureStateDirectories(changeAnchor)
  const source = stateStorageSourcePathSync(changeAnchor.changeDir)
  if (source === undefined) {
    assertChangePathAnchor(changeAnchor)
    assertStateDirectories(stateDirectories)
    return null
  }
  const stateSource = captureStateSource(changeAnchor, source)
  const state = await store.read(changeAnchor.changeDir)
  assertWorkflowRootAnchor(root)
  assertChangePathAnchor(changeAnchor)
  assertStateDirectories(stateDirectories)
  assertStateSource(changeAnchor.changeDir, stateSource)
  return { changeDir: changeAnchor.changeDir, state, changeAnchor, stateDirectories, stateSource }
}

function stringField(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(',') : value ?? ''
}

/**
 * Project exactly one Change without enumerating sibling roots/Changes and without inspecting or
 * repairing the YAML projection. This is the bounded read path for scope-specific GET endpoints.
 */
export async function readChangeSnapshot(
  deps: SnapshotDeps,
  root: string | WorkflowRootAnchor,
  changeName: string,
  nowMs = deps.now?.() ?? Date.now(),
): Promise<ChangeSnapshot | null> {
  const ownedAnchor: WorkflowRootAnchor | undefined = typeof root === 'string'
    ? captureWorkflowRootAnchor(root)
    : undefined
  const anchor: WorkflowRootAnchor = typeof root === 'string' ? ownedAnchor as WorkflowRootAnchor : root
  try {
    const anchored = await readAnchoredChangeState(deps.store, anchor, changeName)
    if (anchored === null) return null
    const { changeDir, state } = anchored
    const rootPath = anchor.path
    const fields = state.fields
    const phase = stringField(fields.phase)
    const workflowName = stringField(fields.workflow) || 'default'
    const frozenPlan = state.runMetadata?.workflowPlanSnapshot
    const definitionWorkflow = frozenPlan?.workflowId ?? workflowName
    const workflowDefinition = projectWorkflowDefinitionStatus(
      definitionWorkflow,
      frozenPlan?.workflowFingerprint ?? null,
      frozenPlan === undefined
        ? { kind: 'invalid' }
        : readCurrentWorkflowDefinition(anchor, definitionWorkflow),
    )
    const plan = resolveSnapshotEffectivePlan(rootPath, workflowName, {
      documentProfile: state.runMetadata?.documentProfile,
      documentGovernanceFingerprint: state.runMetadata?.documentGovernanceFingerprint,
      workflowPlanFingerprint: state.runMetadata?.workflowPlanFingerprint,
      workflowPlanSnapshot: state.runMetadata?.workflowPlanSnapshot,
    }, (name) => {
      try {
        return readWorkflowForApi(anchor, name)
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) return null
        throw error
      }
    })
    const gitHeadSha = deps.gitHeadSha
    const workspaceFingerprint = deps.workspaceFingerprint
    const capabilityDeps: WorkflowSnapshotCapabilityDeps = {
      ...(deps.fileExists === undefined ? {} : { fileExists: deps.fileExists }),
      ...(gitHeadSha === undefined ? {} : { gitHeadSha: () => gitHeadSha(rootPath) }),
      ...(workspaceFingerprint === undefined
        ? {}
        : { workspaceFingerprint: () => workspaceFingerprint(rootPath, changeName) }),
    }
    const [documents, terminalActivity, tasksMarkdown, workflowExecution] = await Promise.all([
      documentEvidence(rootPath, changeDir, plan, phase),
      readTerminalActivity(changeDir, changeName, nowMs),
      readAnchoredTasksMarkdown(anchored.changeAnchor),
      snapshotWorkflowExecution(plan, state, rootPath, changeDir, changeName, capabilityDeps),
    ])
    assertWorkflowRootAnchor(anchor)
    assertChangePathAnchor(anchored.changeAnchor)
    assertStateDirectories(anchored.stateDirectories)
    assertStateSource(anchored.changeDir, anchored.stateSource)
    const todo = projectPipelineTodo({
      phase,
      tasksMarkdown,
      stages: snapshotTodoStages(plan, phase),
      additionalItemsByStage: documentTodoItems(plan, documents),
    })
    return {
      name: changeName,
      path: changeDir,
      phase,
      phase_status: stringField(fields.phase_status),
      track: stringField(fields.track),
      preset: stringField(fields.preset),
      archived: stringField(fields.archived),
      updated_at: stringField(fields.updated_at),
      fields,
      workflowPlanFingerprint: plan.workflowFingerprint,
      workflowDefinition,
      workflowRules: snapshotWorkflowRules(plan),
      workflowExecution,
      reviewHandshake: projectReviewHandshake(state, plan, phase),
      todo,
      documents,
      ...(terminalActivity === undefined ? {} : { terminalActivity }),
    }
  } finally {
    if (ownedAnchor !== undefined) closeWorkflowRootAnchor(ownedAnchor)
  }
}
