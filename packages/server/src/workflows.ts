/**
 * workflow 编辑器数据端（GOAL E8）——真读/写 `.pipeline/workflows/*.yaml`。
 * `default` 不在可写/可删集合内（运行时不读这个文件，见 CONTRACT/design doc 决策 2）。
 */
import { randomUUID } from 'node:crypto'
import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync,
  readdirSync, renameSync, unlinkSync, writeFileSync,
  type Stats,
} from 'node:fs'
import { isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path'
import {
  BUILTIN_TRACK_DEFINITIONS, FIELD_ORDER, listAutomationPolicyTemplates, loadRegistry, parsePipeline,
  parseTrackRegistry, parseWorkflow, readCurrentRunRevisionFromSync, resolveWorkflowName,
  serializeWorkflow, unquoteScalar,
  validateTrackConfigStructure, validateWorkflow, validateWorkflowTrackReferences,
} from '@pipeline-lite/kernel'
import type { TrackDefinition, TrackRegistry, WorkflowDef } from '@pipeline-lite/kernel'

export const WORKFLOWS_DIR = '.pipeline/workflows'

interface FileIdentity {
  readonly dev: number
  readonly ino: number
}

/**
 * server 在启动或显式注册时持有的 root 身份锚。`path` 是注册表使用的规范词法路径；
 * canonical realpath、dev/ino 与目录 fd 都在建立信任时一次性捕获，业务请求不得重新学习。
 */
export interface WorkflowRootAnchor extends FileIdentity {
  readonly path: string
  readonly realPath: string
  readonly fd: number
  /** 仅当本平台确实支持 `<fd-path>/child` 查找时存在（Linux 通常是 /proc/self/fd/N）。 */
  readonly fdPath?: string
}

interface OpenDirectory extends FileIdentity {
  /** 用户可见的词法路径，只用于检测换位和错误信息。 */
  readonly lexicalPath: string
  /** fd-relative 可用时锚在父目录 fd；否则与 lexicalPath 相同。 */
  readonly operationPath: string
  readonly realPath: string
  readonly fd: number
  readonly fdPath?: string
}

interface WorkflowDirectories {
  readonly root: WorkflowRootAnchor
  readonly pipeline: OpenDirectory
  readonly workflows: OpenDirectory
}

type WorkflowRoot = string | WorkflowRootAnchor

function sameIdentity(current: FileIdentity, expected: FileIdentity): boolean {
  return current.dev === expected.dev && current.ino === expected.ino
}

function safeClose(fd: number): void {
  try { closeSync(fd) } catch { /* best-effort close must not mask the business error */ }
}

function lstatIfExists(path: string): Stats | undefined {
  try {
    return lstatSync(path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw e
  }
}

function assertInsideRoot(realRoot: string, realPath: string, label: string): void {
  const fromRoot = relative(realRoot, realPath)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${label} 已逃逸 registered root: ${realPath}`)
  }
}

/**
 * Node 没有公开 openat/renameat/unlinkat。Linux 的 procfs 通常允许把已打开目录 fd 当作稳定父目录；
 * Darwin 的 fdescfs 虽能 stat `/dev/fd/N`，却不能遍历 `/dev/fd/N/child`，所以必须实测而非按
 * platform 字符串猜。返回 undefined 时，调用方退回 pathname + 持有 fd/inode 紧邻复核。
 */
function traversableDirectoryFdPath(fd: number, expected: FileIdentity): string | undefined {
  const candidates = process.platform === 'linux'
    ? [`/proc/self/fd/${fd}`, `/dev/fd/${fd}`]
    : [`/dev/fd/${fd}`, `/proc/self/fd/${fd}`]
  for (const candidate of candidates) {
    try {
      const current = lstatSync(join(candidate, '.'))
      if (current.isDirectory() && sameIdentity(current, expected)) return candidate
    } catch {
      // 未挂 procfs/fdescfs 或该实现不支持 child traversal；尝试下一候选。
    }
  }
  return undefined
}

export function captureWorkflowRootAnchor(root: string): WorkflowRootAnchor {
  const path = resolvePath(root)
  const lexical = lstatSync(path)
  if (lexical.isSymbolicLink() || !lexical.isDirectory()) {
    throw new Error(`registered root 必须是非 symlink 的真实目录: ${path}`)
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    const opened = fstatSync(fd)
    if (!opened.isDirectory() || !sameIdentity(opened, lexical)) {
      throw new Error(`registered root 在捕获期间被替换: ${path}`)
    }
    const realPath = realpathSync(path)
    const fresh = lstatSync(path)
    if (fresh.isSymbolicLink() || !fresh.isDirectory() || !sameIdentity(fresh, opened)) {
      throw new Error(`registered root 在捕获期间被替换: ${path}`)
    }
    const fdPath = traversableDirectoryFdPath(fd, opened)
    return fdPath
      ? { path, realPath, dev: opened.dev, ino: opened.ino, fd, fdPath }
      : { path, realPath, dev: opened.dev, ino: opened.ino, fd }
  } catch (e) {
    safeClose(fd)
    throw e
  }
}

export function assertWorkflowRootAnchor(anchor: WorkflowRootAnchor): void {
  const lexical = lstatSync(anchor.path)
  if (lexical.isSymbolicLink() || !lexical.isDirectory() || !sameIdentity(lexical, anchor)) {
    throw new Error(`registered root 词法路径已不再指向注册时目录: ${anchor.path}`)
  }
  const opened = fstatSync(anchor.fd)
  if (!opened.isDirectory() || !sameIdentity(opened, anchor)) {
    throw new Error(`registered root 目录 fd 身份已失效: ${anchor.path}`)
  }
  if (realpathSync(anchor.path) !== anchor.realPath) {
    throw new Error(`registered root canonical realpath 已变化: ${anchor.path}`)
  }
}

export function closeWorkflowRootAnchor(anchor: WorkflowRootAnchor): void {
  safeClose(anchor.fd)
}

function rootDirectory(anchor: WorkflowRootAnchor): OpenDirectory {
  return {
    lexicalPath: anchor.path,
    operationPath: anchor.fdPath ?? anchor.path,
    realPath: anchor.realPath,
    dev: anchor.dev,
    ino: anchor.ino,
    fd: anchor.fd,
    ...(anchor.fdPath ? { fdPath: anchor.fdPath } : {}),
  }
}

/**
 * 安全边界（必须诚实）：
 *
 * - fdPath 可用时，子目录 lookup 及最终 rename/unlink 都锚在已打开父目录 fd，父 pathname 换位
 *   不会把操作重定向到替换目录。
 * - fdPath 不可用时（当前 Darwin/Node 即如此），Node 未暴露 renameat/unlinkat；这里持有目录 fd，
 *   并在最终 syscall 紧前同时复核 fd、词法路径与 dev/ino。它覆盖仓库里预置 symlink，以及无权
 *   改名父目录的不同权限攻击者；不声称绝对消除可任意改目录项的同 UID 恶意进程在最后两条
 *   syscall 之间的竞态。目标目录不应与不可信的同 principal 写者共享。
 */
function assertDirectoryStillTrusted(directory: OpenDirectory, root: WorkflowRootAnchor): void {
  assertWorkflowRootAnchor(root)
  const opened = fstatSync(directory.fd)
  if (!opened.isDirectory() || !sameIdentity(opened, directory)) {
    throw new Error(`workflow 目录 fd 身份已变化（TOCTOU）: ${directory.lexicalPath}`)
  }
  const operationEntry = lstatSync(directory.operationPath)
  if (operationEntry.isSymbolicLink() || !operationEntry.isDirectory() || !sameIdentity(operationEntry, directory)) {
    throw new Error(`workflow 目录操作路径已被替换（TOCTOU）: ${directory.lexicalPath}`)
  }
  const lexicalEntry = lstatSync(directory.lexicalPath)
  if (lexicalEntry.isSymbolicLink() || !lexicalEntry.isDirectory() || !sameIdentity(lexicalEntry, directory)) {
    throw new Error(`workflow 目录词法路径已被替换（TOCTOU）: ${directory.lexicalPath}`)
  }
  const freshRealPath = realpathSync(directory.operationPath)
  if (freshRealPath !== directory.realPath) {
    throw new Error(`workflow 目录 canonical realpath 已变化（TOCTOU）: ${directory.lexicalPath}`)
  }
  assertInsideRoot(root.realPath, freshRealPath, 'workflow 目录')
}

function openTrustedChildDirectory(
  root: WorkflowRootAnchor,
  parent: OpenDirectory,
  name: string,
  create: boolean,
): OpenDirectory | undefined {
  if (parent.lexicalPath === root.path) assertWorkflowRootAnchor(root)
  else assertDirectoryStillTrusted(parent, root)

  const lexicalPath = join(parent.lexicalPath, name)
  const operationPath = join(parent.fdPath ?? parent.lexicalPath, name)
  let before = lstatIfExists(operationPath)
  if (!before) {
    if (!create) return undefined
    try {
      mkdirSync(operationPath)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
    before = lstatIfExists(operationPath)
    if (!before) throw new Error(`workflow 目录创建后不存在: ${lexicalPath}`)
  }
  if (before.isSymbolicLink() || !before.isDirectory()) {
    throw new Error(`workflow 路径不安全（须为真实目录）: ${lexicalPath}`)
  }

  const fd = openSync(operationPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    const opened = fstatSync(fd)
    if (!opened.isDirectory() || !sameIdentity(opened, before)) {
      throw new Error(`workflow 目录在打开期间被替换（TOCTOU）: ${lexicalPath}`)
    }
    const realPath = realpathSync(operationPath)
    assertInsideRoot(root.realPath, realPath, 'workflow 目录')
    const fdPath = traversableDirectoryFdPath(fd, opened)
    const directory: OpenDirectory = fdPath
      ? { lexicalPath, operationPath, realPath, dev: opened.dev, ino: opened.ino, fd, fdPath }
      : { lexicalPath, operationPath, realPath, dev: opened.dev, ino: opened.ino, fd }
    if (parent.lexicalPath === root.path) assertWorkflowRootAnchor(root)
    else assertDirectoryStillTrusted(parent, root)
    assertDirectoryStillTrusted(directory, root)
    return directory
  } catch (e) {
    safeClose(fd)
    throw e
  }
}

/**
 * 从已捕获 root fd 逐层打开真实目录。每一层都走 O_NOFOLLOW + inode/realpath 复核；回调退出后
 * 逆序关闭本调用拥有的 fd。root 自身 fd 归 anchor 所有，不在这里关闭。
 */
function withTrustedDirectoryChain<T>(
  root: WorkflowRootAnchor,
  names: readonly string[],
  create: boolean,
  onMissing: () => T,
  use: (directory: OpenDirectory) => T,
): T {
  const opened: OpenDirectory[] = []
  try {
    let parent = rootDirectory(root)
    for (const name of names) {
      const child = openTrustedChildDirectory(root, parent, name, create)
      if (!child) return onMissing()
      opened.push(child)
      parent = child
    }
    return use(parent)
  } finally {
    for (let i = opened.length - 1; i >= 0; i--) safeClose(opened[i]!.fd)
  }
}

function assertOptionalRegularChild(
  directory: OpenDirectory,
  root: WorkflowRootAnchor,
  name: string,
  label: string,
): void {
  assertDirectoryStillTrusted(directory, root)
  const paths = childEntry(directory, name)
  const entry = lstatIfExists(paths.operation)
  if (!entry) return
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`${label} 必须是非 symlink 普通文件: ${paths.lexical}`)
  }
  if (paths.operation !== paths.lexical) {
    const lexical = lstatSync(paths.lexical)
    if (lexical.isSymbolicLink() || !lexical.isFile() || !sameIdentity(lexical, entry)) {
      throw new Error(`${label} 词法路径身份不一致: ${paths.lexical}`)
    }
  }
  assertDirectoryStillTrusted(directory, root)
}

function assertOptionalTrustedChildDirectory(
  directory: OpenDirectory,
  root: WorkflowRootAnchor,
  name: string,
): void {
  const child = openTrustedChildDirectory(root, directory, name, false)
  if (child) safeClose(child.fd)
}

/**
 * 为跨资源引用事务准备与 Track Registry 相同的 `<root>/.pipeline/.pipeline.lock` 父目录。
 * 这里只安全创建真实 `.pipeline` 目录并拒绝 tracks.yaml symlink；真正加锁仍由 kernel
 * withTrackRegistryLock 完成，因此 CLI init/fields/tracks CRUD 与 server workflow 操作共用同一把锁。
 */
export function ensureWorkflowProjectCoordinationPath(root: WorkflowRootAnchor): void {
  withTrustedDirectoryChain(root, ['.pipeline'], true, () => {
    throw new Error('workflow 引用协调目录创建失败')
  }, (pipeline) => {
    assertOptionalRegularChild(pipeline, root, 'tracks.yaml', 'tracks registry')
    // kernel withTrackRegistryLock 将在这里 mkdir/读 owner；预置 symlink 不能被它当成锁目录跟随。
    assertOptionalTrustedChildDirectory(pipeline, root, '.pipeline.lock')
  })
}

/**
 * 为 loop governance 锁准备安全父目录。锁序由 server 固定为 governance → project-registry；
 * 受支持的 loop writer 与删除由同一 governance 锁串行。Node/Darwin 最终 pathname 窗口边界仍与
 * 本文件 G6 注释一致，不把同 UID 任意目录项攻击宣称为绝对消除。
 */
export function ensureWorkflowGovernanceCoordinationPath(root: WorkflowRootAnchor): void {
  ensureWorkflowProjectCoordinationPath(root)
  withTrustedDirectoryChain(root, ['.pipeline'], false, () => {
    throw new Error('workflow 引用协调目录意外消失')
  }, (pipeline) => {
    assertOptionalRegularChild(pipeline, root, 'loops.yaml', 'loops registry')
  })
  withTrustedDirectoryChain(root, ['.pipeline', 'loops', 'governance'], true, () => {
    throw new Error('workflow governance 协调目录创建失败')
  }, (governance) => {
    assertDirectoryStillTrusted(governance, root)
    assertOptionalTrustedChildDirectory(governance, root, '.pipeline.lock')
  })
}

function acquireRoot(root: WorkflowRoot): { anchor: WorkflowRootAnchor; owned: boolean } {
  if (typeof root === 'string') return { anchor: captureWorkflowRootAnchor(root), owned: true }
  assertWorkflowRootAnchor(root)
  return { anchor: root, owned: false }
}

function withWorkflowDirectories<T>(
  rootInput: WorkflowRoot,
  create: boolean,
  onMissing: () => T,
  use: (directories: WorkflowDirectories) => T,
): T {
  const { anchor: root, owned } = acquireRoot(rootInput)
  let pipeline: OpenDirectory | undefined
  let workflows: OpenDirectory | undefined
  try {
    const rootDir = rootDirectory(root)
    pipeline = openTrustedChildDirectory(root, rootDir, '.pipeline', create)
    if (!pipeline) return onMissing()
    workflows = openTrustedChildDirectory(root, pipeline, 'workflows', create)
    if (!workflows) return onMissing()
    const directories = { root, pipeline, workflows }
    assertWorkflowDirectoriesStillTrusted(directories)
    return use(directories)
  } finally {
    if (workflows) safeClose(workflows.fd)
    if (pipeline) safeClose(pipeline.fd)
    if (owned) closeWorkflowRootAnchor(root)
  }
}

function assertWorkflowDirectoriesStillTrusted(directories: WorkflowDirectories): void {
  assertWorkflowRootAnchor(directories.root)
  assertDirectoryStillTrusted(directories.pipeline, directories.root)
  assertDirectoryStillTrusted(directories.workflows, directories.root)
}

interface EntryPaths {
  readonly lexical: string
  readonly operation: string
}

function childEntry(directory: OpenDirectory, name: string): EntryPaths {
  return {
    lexical: join(directory.lexicalPath, name),
    operation: join(directory.fdPath ?? directory.lexicalPath, name),
  }
}

const WORKFLOW_NAME_RE = /^[\p{L}\p{N}\p{M}_-]+$/u

function isWorkflowName(name: string): boolean {
  return name !== '' && WORKFLOW_NAME_RE.test(name)
}

function assertWorkflowName(name: string): void {
  if (!isWorkflowName(name)) {
    throw new Error('非法 workflow 名（允许中文、字母、数字、- 与 _；不允许空格、点或路径符号）')
  }
}

function assertEntryMatches(paths: EntryPaths, expected: FileIdentity, label: string): void {
  const operationEntry = lstatSync(paths.operation)
  if (operationEntry.isSymbolicLink() || !operationEntry.isFile() || !sameIdentity(operationEntry, expected)) {
    throw new Error(`${label} 已被替换（TOCTOU）: ${paths.lexical}`)
  }
  if (paths.operation !== paths.lexical) {
    const lexicalEntry = lstatSync(paths.lexical)
    if (lexicalEntry.isSymbolicLink() || !lexicalEntry.isFile() || !sameIdentity(lexicalEntry, expected)) {
      throw new Error(`${label} 词法路径已被替换（TOCTOU）: ${paths.lexical}`)
    }
  }
}

function assertTargetUnchanged(paths: EntryPaths, expected: FileIdentity | undefined): void {
  const current = lstatIfExists(paths.operation)
  if (!expected) {
    if (current) throw new Error(`workflow 写入目标在发布前出现（TOCTOU）: ${paths.lexical}`)
    return
  }
  if (!current || current.isSymbolicLink() || !current.isFile() || !sameIdentity(current, expected)) {
    throw new Error(`workflow 写入目标在发布前被替换（TOCTOU）: ${paths.lexical}`)
  }
}

function cleanupOwnedTempFile(
  paths: EntryPaths,
  expected: FileIdentity | undefined,
  directories: WorkflowDirectories,
): void {
  if (!expected) return
  try {
    assertWorkflowDirectoriesStillTrusted(directories)
    const current = lstatIfExists(paths.operation)
    if (!current || current.isSymbolicLink() || !current.isFile() || !sameIdentity(current, expected)) return
    unlinkSync(paths.operation)
  } catch {
    // 复核失败时宁可遗留本调用的临时 inode，也绝不 unlink 一个已经换位的未知目录项。
  }
}

/** 结构化未找到信号：路由层据类型区分 404 与解析/校验失败，绝不匹配用户可控错误文本。 */
export class WorkflowNotFoundError extends Error {}

export type WorkflowReferenceKind =
  | 'track-default'
  | 'track-allowed'
  | 'active-change'
  | 'loop-binding'
  | 'policy-template-recommended'

export interface WorkflowReference {
  readonly kind: WorkflowReferenceKind
  readonly source: string
}

export interface WorkflowReferenceScanBlocker {
  readonly source: string
  readonly detail: string
}

export interface WorkflowReferenceScanResult {
  readonly references: readonly WorkflowReference[]
  readonly blockers: readonly WorkflowReferenceScanBlocker[]
}

export interface WorkflowDeletePermit extends FileIdentity {
  readonly name: string
}

/** 删除目标在扫描前被钉住、扫描后已换 inode/消失时的结构化 CAS 冲突。 */
export class WorkflowDeleteConflictError extends Error {
  readonly _tag = 'WorkflowDeleteConflictError'
  constructor(message: string) { super(message); this.name = 'WorkflowDeleteConflictError' }
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function decodeUtf8Strict(bytes: Buffer, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw new Error(`${label} 不是合法 UTF-8：${errText(error)}`)
  }
}

function readTrustedRegularFile(
  directory: OpenDirectory,
  root: WorkflowRootAnchor,
  name: string,
  label: string,
  missing: 'null' | 'error',
): Buffer | null {
  const paths = childEntry(directory, name)
  assertDirectoryStillTrusted(directory, root)
  let fd: number
  try {
    fd = openSync(paths.operation, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && missing === 'null') return null
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`${label} 缺失: ${paths.lexical}`)
    throw error
  }
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile()) throw new Error(`${label} 不是可信普通文件: ${paths.lexical}`)
    const identity = { dev: opened.dev, ino: opened.ino }
    assertEntryMatches(paths, identity, label)
    assertDirectoryStillTrusted(directory, root)
    const bytes = readFileSync(fd)
    assertEntryMatches(paths, identity, label)
    assertDirectoryStillTrusted(directory, root)
    return bytes
  } finally {
    safeClose(fd)
  }
}

function workflowWriteTrackRegistry(
  directories: WorkflowDirectories,
): { readonly registry: TrackRegistry } | { readonly errors: string[] } {
  const bytes = readTrustedRegularFile(
    directories.pipeline,
    directories.root,
    'tracks.yaml',
    'tracks registry',
    'null',
  )
  if (bytes === null) {
    const ordered = [...BUILTIN_TRACK_DEFINITIONS]
    return {
      registry: {
        ordered,
        byId: new Map(ordered.map((track) => [track.id, track])),
        revision: 'workflow-write:builtin-only',
        source: 'builtin-only',
      },
    }
  }

  try {
    const config = parseTrackRegistry(decodeUtf8Strict(bytes, 'tracks registry'))
    const structuralErrors = [...validateTrackConfigStructure(config)]
    if (structuralErrors.length > 0) {
      return { errors: structuralErrors.map((error) => `.pipeline/tracks.yaml: ${error}`) }
    }

    // validateWorkflowTrackReferences 的公开合同只查询 registry.byId.has；这里仍构造完整的
    // TrackRegistry 形状，避免绕开 kernel 单一 validator。动态项的其余字段不会参与本次判定，
    // 故以一个内建定义作只读占位，并只替换引用判定真正需要的 id/label/builtin。
    const seed = BUILTIN_TRACK_DEFINITIONS[0]!
    const dynamic: TrackDefinition[] = (config.tracks ?? []).map((entry) => ({
      ...seed,
      id: entry.id!,
      label: entry.label!,
      builtin: false,
    }))
    const ordered = [...BUILTIN_TRACK_DEFINITIONS, ...dynamic]
    return {
      registry: {
        ordered,
        byId: new Map(ordered.map((track) => [track.id, track])),
        revision: 'workflow-write:project-file',
        source: 'project-file',
      },
    }
  } catch (error) {
    return { errors: [`tracks registry 无法形成引用校验快照：${errText(error)}`] }
  }
}

function collectTrackReferences(registry: TrackRegistry, workflow: string): WorkflowReference[] {
  const references: WorkflowReference[] = []
  for (const track of registry.ordered) {
    if (track.workflow.default === workflow) {
      references.push({ kind: 'track-default', source: `track:${track.id}` })
    }
    if (track.workflow.allowed !== '*' && track.workflow.allowed.includes(workflow)) {
      references.push({ kind: 'track-allowed', source: `track:${track.id}` })
    }
  }
  return references
}

function collectPolicyTemplateReferences(workflow: string): WorkflowReference[] {
  return listAutomationPolicyTemplates()
    .filter((template) => template.recommendedWorkflow === workflow)
    .map((template) => ({
      kind: 'policy-template-recommended' as const,
      source: `template:${template.id}`,
    }))
}

function validateStateWorkflowText(text: string, change: string): string {
  if (text.includes('\0')) throw new Error('state 含 NUL 字节')
  const counts = new Map<string, number>()
  const workflowValues: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_]+):(.*)$/.exec(line)
    if (!match) continue
    counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + 1)
    if (match[1] === 'workflow') workflowValues.push(unquoteScalar(match[2]!.trim()))
  }
  for (const required of ['track', 'phase']) {
    if (counts.get(required) !== 1) {
      throw new Error(`state.${required} 须且只能出现一次（实际 ${counts.get(required) ?? 0}）`)
    }
  }
  const workflowCount = counts.get('workflow') ?? 0
  if (workflowCount > 1) throw new Error(`state.workflow 重复（${workflowCount} 次）`)

  const state = parsePipeline(text)
  const knownFields = new Set<string>(FIELD_ORDER)
  const hiddenKnownFields = state.opaqueTail.split(/\r?\n/)
    .map((line) => /^([A-Za-z0-9_]+):/.exec(line)?.[1])
    .filter((field): field is string => field !== undefined && knownFields.has(field))
  if (hiddenKnownFields.length > 0) {
    throw new Error(`state parser 在已知字段前提前停止；opaqueTail 隐藏字段: ${hiddenKnownFields.join(', ')}`)
  }
  const raw = state.fields.workflow
  if (Array.isArray(raw)) throw new Error('state.workflow 非标量')
  if (workflowValues.length === 1 && workflowValues[0] !== raw) {
    throw new Error(`state.workflow 原文字段 '${workflowValues[0]}' 未被 parser 消费（解析值 '${raw}'）`)
  }
  const workflow = resolveWorkflowName(state)
  if (workflow !== 'default' && !isWorkflowName(workflow)) {
    throw new Error(`state.workflow 非法: change '${change}' = '${workflow}'`)
  }
  return workflow
}

/**
 * 以 change 目录 fd 为锚读取 canonical state 的受控相对文件。每一层目录都拒绝 symlink，最终
 * 文件用 O_NOFOLLOW；reader 返回 undefined 只代表目录项不存在，安全/I/O 异常原样 fail-loud。
 */
function readTrustedChangeRelativeText(
  changeDir: OpenDirectory,
  root: WorkflowRootAnchor,
  relativePath: string,
): string | undefined {
  const parts = relativePath.split(/[\\/]/).filter((part) => part !== '')
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`canonical state reader 收到非法相对路径: ${relativePath}`)
  }
  const opened: OpenDirectory[] = []
  let parent = changeDir
  try {
    for (const part of parts.slice(0, -1)) {
      const next = openTrustedChildDirectory(root, parent, part, false)
      if (next === undefined) return undefined
      opened.push(next)
      parent = next
    }
    const bytes = readTrustedRegularFile(
      parent, root, parts[parts.length - 1]!, `canonical state ${relativePath}`, 'null',
    )
    return bytes === null ? undefined : decodeUtf8Strict(bytes, `canonical state ${relativePath}`)
  } finally {
    for (let i = opened.length - 1; i >= 0; i--) safeClose(opened[i]!.fd)
  }
}

function scanActiveChangeReferences(
  root: WorkflowRootAnchor,
  workflow: string,
): { references: WorkflowReference[]; blockers: WorkflowReferenceScanBlocker[] } {
  const references: WorkflowReference[] = []
  const blockers: WorkflowReferenceScanBlocker[] = []
  try {
    return withTrustedDirectoryChain(root, ['openspec', 'changes'], false, () => ({ references, blockers }), (changes) => {
      assertDirectoryStillTrusted(changes, root)
      const entries = readdirSync(changes.fdPath ?? changes.lexicalPath, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (entry.name === 'archive') {
          try {
            const archive = openTrustedChildDirectory(root, changes, entry.name, false)
            if (!archive) throw new Error('archive 在枚举后消失')
            safeClose(archive.fd)
          } catch (error) {
            blockers.push({ source: 'changes:archive', detail: errText(error) })
          }
          continue
        }
        const source = `change:${entry.name}`
        if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[a-zA-Z0-9_-]+$/.test(entry.name) || entry.name.includes('..')) {
          blockers.push({ source, detail: '活跃 changes 枚举项必须是安全命名的非 symlink 目录' })
          continue
        }
        let changeDir: OpenDirectory | undefined
        try {
          changeDir = openTrustedChildDirectory(root, changes, entry.name, false)
          if (!changeDir) throw new Error('change 在枚举后消失')
          const canonical = readCurrentRunRevisionFromSync(
            (relativePath) => readTrustedChangeRelativeText(changeDir!, root, relativePath),
            changeDir.lexicalPath,
          )
          let observed: string
          if (canonical !== undefined) {
            observed = resolveWorkflowName(canonical.state)
            if (observed !== 'default'
              && !isWorkflowName(observed)) {
              throw new Error(`canonical state.workflow 非法: change '${entry.name}' = '${observed}'`)
            }
          } else {
            const bytes = readTrustedRegularFile(changeDir, root, '.pipeline.yaml', 'legacy change state', 'error')
            if (!bytes) throw new Error('change state 缺失')
            observed = validateStateWorkflowText(decodeUtf8Strict(bytes, 'legacy change state'), entry.name)
          }
          if (observed === workflow) references.push({ kind: 'active-change', source })
        } catch (error) {
          blockers.push({ source, detail: errText(error) })
        } finally {
          if (changeDir) safeClose(changeDir.fd)
        }
      }
      assertDirectoryStillTrusted(changes, root)
      return { references, blockers }
    })
  } catch (error) {
    blockers.push({ source: 'changes', detail: errText(error) })
    return { references, blockers }
  }
}

function scanLoopReferences(
  root: WorkflowRootAnchor,
  workflow: string,
): { references: WorkflowReference[]; blockers: WorkflowReferenceScanBlocker[] } {
  const references: WorkflowReference[] = []
  const blockers: WorkflowReferenceScanBlocker[] = []
  try {
    return withTrustedDirectoryChain(root, ['.pipeline'], false, () => ({ references, blockers }), (pipeline) => {
      const bytes = readTrustedRegularFile(pipeline, root, 'loops.yaml', 'loops registry', 'null')
      if (!bytes) return { references, blockers }
      const text = decodeUtf8Strict(bytes, 'loops registry')
      const loaded = loadRegistry(root.path, { readText: () => text })
      if (loaded.errors.length > 0 || !loaded.data) {
        blockers.push({
          source: 'loops-registry',
          detail: loaded.errors.length > 0 ? loaded.errors.join('；') : 'loops registry 无法形成有效快照',
        })
        return { references, blockers }
      }
      for (const loop of loaded.data.loops) {
        if (loop.workflow_id === workflow) references.push({ kind: 'loop-binding', source: `loop:${loop.id}` })
      }
      return { references, blockers }
    })
  } catch (error) {
    blockers.push({ source: 'loops-registry', detail: errText(error) })
    return { references, blockers }
  }
}

/**
 * 调用方必须已持 governance → project registry 两把锁。函数在同一临界区内读 effective tracks、
 * strict active changes 与 loops workflow_id，并合入进程内 policy-template catalog；I/O/解析
 * 不确定性进入 blockers，绝不降级成“零引用”。
 */
export function scanWorkflowReferencesForApi(
  root: WorkflowRootAnchor,
  workflow: string,
  registry: TrackRegistry,
): WorkflowReferenceScanResult {
  assertWorkflowName(workflow)
  assertWorkflowRootAnchor(root)
  const changes = scanActiveChangeReferences(root, workflow)
  const loops = scanLoopReferences(root, workflow)
  return {
    references: [
      ...collectTrackReferences(registry, workflow),
      ...collectPolicyTemplateReferences(workflow),
      ...changes.references,
      ...loops.references,
    ]
      .sort((a, b) => a.source.localeCompare(b.source) || a.kind.localeCompare(b.kind)),
    blockers: [...changes.blockers, ...loops.blockers]
      .sort((a, b) => a.source.localeCompare(b.source) || a.detail.localeCompare(b.detail)),
  }
}

/** 扫描前钉住目标 inode；不存在返回 null。 */
export function captureWorkflowDeletePermit(root: WorkflowRoot, name: string): WorkflowDeletePermit | null {
  assertWorkflowName(name)
  return withWorkflowDirectories(root, false, () => null, (directories) => {
    const target = childEntry(directories.workflows, `${name}.yaml`)
    assertWorkflowDirectoriesStillTrusted(directories)
    let fd: number
    try {
      fd = openSync(target.operation, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    try {
      const opened = fstatSync(fd)
      if (!opened.isFile()) throw new Error(`workflow 删除目标不安全（须为普通文件）: ${target.lexical}`)
      const identity = { dev: opened.dev, ino: opened.ino }
      assertEntryMatches(target, identity, 'workflow 删除目标')
      assertWorkflowDirectoriesStillTrusted(directories)
      return { name, ...identity }
    } finally {
      safeClose(fd)
    }
  })
}

/** 扫 `<root>/.pipeline/workflows/*.yaml`，排除 default；目录不存在 → 空数组。 */
export function listWorkflowNames(root: WorkflowRoot): string[] {
  return withWorkflowDirectories(root, false, () => [], (directories) => {
    assertWorkflowDirectoriesStillTrusted(directories)
    const names = readdirSync(directories.workflows.fdPath ?? directories.workflows.lexicalPath)
      .filter((file) => file.endsWith('.yaml') && file !== 'default.yaml')
    // list 也拒绝 target symlink：不能先把不安全目录项广告给客户端，再等 read 才报错。
    for (const file of names) {
      const paths = childEntry(directories.workflows, file)
      const entry = lstatSync(paths.operation)
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new Error(`workflow 列表目标不安全（须为普通文件）: ${paths.lexical}`)
      }
    }
    assertWorkflowDirectoriesStillTrusted(directories)
    return names.map((file) => file.slice(0, -'.yaml'.length))
  })
}

/** 从 O_NOFOLLOW 打开的普通文件 fd 读字节，再 parse + validate；不调用会重走 pathname 的 loadWorkflow。 */
export function readWorkflowForApi(root: WorkflowRoot, name: string): WorkflowDef {
  assertWorkflowName(name)
  return withWorkflowDirectories(
    root,
    false,
    () => { throw new WorkflowNotFoundError(`workflow '${name}' 未找到`) },
    (directories) => {
      const paths = childEntry(directories.workflows, `${name}.yaml`)
      assertWorkflowDirectoriesStillTrusted(directories)
      let fd: number
      try {
        fd = openSync(paths.operation, constants.O_RDONLY | constants.O_NOFOLLOW)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new WorkflowNotFoundError(`workflow '${name}' 未找到`)
        }
        throw e
      }
      try {
        const opened = fstatSync(fd)
        if (!opened.isFile()) throw new Error(`workflow 读取目标不是可信普通文件: ${paths.lexical}`)
        assertEntryMatches(paths, opened, 'workflow 读取目标')
        assertWorkflowDirectoriesStillTrusted(directories)
        const wf = parseWorkflow(readFileSync(fd, 'utf8'))
        const errors = validateWorkflow(wf)
        if (errors.length > 0) {
          throw new Error(
            `ERROR: workflow '${name}' 校验失败（${paths.lexical}）：\n${errors.map((e) => `  - ${e}`).join('\n')}`,
          )
        }
        return wf
      } finally {
        safeClose(fd)
      }
    },
  )
}

export type WriteWorkflowResult = { ok: true } | { ok: false; errors: string[] }

/** 校验通过才落盘；同目录独占 tmp + 原子 rename，不覆盖发布前被换位的目标。 */
export function writeWorkflowForApi(
  root: WorkflowRoot,
  name: string,
  wf: WorkflowDef,
): WriteWorkflowResult {
  assertWorkflowName(name)
  const errors = validateWorkflow(wf)
  if (wf.name !== name) errors.unshift(`workflow name '${wf.name}' 必须与存储键 '${name}' 一致`)
  if (errors.length > 0) return { ok: false, errors }
  const content = serializeWorkflow(wf)

  return withWorkflowDirectories(root, true, () => { throw new Error('workflow 目录创建失败') }, (directories) => {
    const trackSnapshot = workflowWriteTrackRegistry(directories)
    if ('errors' in trackSnapshot) return { ok: false, errors: trackSnapshot.errors }
    const referenceErrors = validateWorkflowTrackReferences(wf, trackSnapshot.registry)
    if (referenceErrors.length > 0) return { ok: false, errors: referenceErrors }

    const target = childEntry(directories.workflows, `${name}.yaml`)
    const temp = childEntry(
      directories.workflows,
      `${name}.yaml.tmp.${process.pid}.${randomUUID()}`,
    )
    let tempFd: number | undefined
    let tempIdentity: FileIdentity | undefined
    let committed = false
    try {
      assertWorkflowDirectoriesStillTrusted(directories)
      tempFd = openSync(
        temp.operation,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      )
      writeFileSync(tempFd, content, 'utf8')
      fsyncSync(tempFd)
      const tempStat = fstatSync(tempFd)
      if (!tempStat.isFile()) throw new Error(`workflow 临时目标不是可信普通文件: ${temp.lexical}`)
      tempIdentity = { dev: tempStat.dev, ino: tempStat.ino }
      assertEntryMatches(temp, tempIdentity, 'workflow 临时文件')

      const existing = lstatIfExists(target.operation)
      if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
        throw new Error(`workflow 写入目标不是可信普通文件: ${target.lexical}`)
      }
      const expectedTarget = existing ? { dev: existing.dev, ino: existing.ino } : undefined

      // 最终 syscall 紧前复核；fdPath 可用时 rename 两端都锚在同一已打开 workflows 目录。
      assertWorkflowDirectoriesStillTrusted(directories)
      assertTargetUnchanged(target, expectedTarget)
      assertEntryMatches(temp, tempIdentity, 'workflow 临时文件')
      renameSync(temp.operation, target.operation)
      committed = true
      // POSIX rename 成功即为原子 commit point。这里不再做会把“已提交成功”翻成失败的 pathname
      // 后置断言；同 UID 在 commit 后立即替换目标属于上方明确排除的并发攻击边界。
      return { ok: true }
    } catch (e) {
      if (!committed) cleanupOwnedTempFile(temp, tempIdentity, directories)
      throw e
    } finally {
      if (tempFd !== undefined) safeClose(tempFd)
    }
  })
}

/**
 * 真删；不存在返回 false。目标以 O_NOFOLLOW 打开并绑定 inode，unlink 紧前再次复核。
 * expected 提供时是扫描前 permit：扫描期间目标被替换/删除一律 CAS 冲突，绝不删后来出现的 inode。
 */
export function deleteWorkflowForApi(
  root: WorkflowRoot,
  name: string,
  permit?: WorkflowDeletePermit,
): boolean {
  assertWorkflowName(name)
  if (permit && permit.name !== name) {
    throw new WorkflowDeleteConflictError(`workflow 删除 permit 名称不匹配：${permit.name} != ${name}`)
  }
  return withWorkflowDirectories(root, false, () => false, (directories) => {
    const target = childEntry(directories.workflows, `${name}.yaml`)
    assertWorkflowDirectoriesStillTrusted(directories)
    let fd: number
    try {
      fd = openSync(target.operation, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        if (permit) throw new WorkflowDeleteConflictError(`workflow '${name}' 在引用扫描期间消失`)
        return false
      }
      throw e
    }
    try {
      const opened = fstatSync(fd)
      if (!opened.isFile()) throw new Error(`workflow 删除目标不安全（须为普通文件）: ${target.lexical}`)
      const expectedIdentity = { dev: opened.dev, ino: opened.ino }
      if (permit && !sameIdentity(opened, permit)) {
        throw new WorkflowDeleteConflictError(`workflow '${name}' 在引用扫描期间已被替换`)
      }
      assertEntryMatches(target, expectedIdentity, 'workflow 删除目标')

      // fdPath 可用时等价于以已打开父目录为锚执行 unlink；fallback 的同-principal 边界见上方注释。
      assertWorkflowDirectoriesStillTrusted(directories)
      assertEntryMatches(target, expectedIdentity, 'workflow 删除目标')
      unlinkSync(target.operation)
      return true
    } finally {
      safeClose(fd)
    }
  })
}
