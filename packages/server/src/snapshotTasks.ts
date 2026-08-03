import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import {
  decodeUtf8Text,
  isCanonicalTaskPlanTasksMarkdown,
  isCurrentTaskPlanProjectionForChange,
  TASK_PLAN_LIMITS,
} from '@tenon/kernel'
import { readBounded as readBoundedBytes } from './contextBundleTrustedReader.js'
import {
  captureStableFileVersion,
  matchesStableFileVersion,
} from './stableFileMetadata.js'
import {
  assertWorkflowRootMutationVersion,
  captureWorkflowRootMutationVersion,
  sameIdentity,
  traversableDirectoryFdPath,
  type WorkflowRootAnchor,
  type WorkflowRootMutationVersion,
} from './workflowRootAnchor.js'

export const MAX_LEGACY_TASKS_MARKDOWN_BYTES = TASK_PLAN_LIMITS.maxLegacyProjectionBytes
export const MAX_TASKS_MARKDOWN_BYTES = TASK_PLAN_LIMITS.maxRevisionBytes

interface TasksReadHooks {
  /** @internal Test seam for a leaf-swap race immediately before open(2). */
  readonly beforeOpen?: () => void
  /** @internal Registered-root fence spanning the complete source/authorization operation. */
  readonly assertTrustContext?: () => void
  /** @internal Test seam proving rejected paths are not read. */
  readonly readSource?: (fd: number, maxBytes: number) => string
  /** @internal Test seam; production authenticates the marker against canonical current state. */
  readonly authorizeCanonicalProjection?: (
    source: string,
    anchoredChangeDir: string,
  ) => boolean | Promise<boolean>
}

export async function hasCurrentCanonicalTaskPlanProjection(
  changeDir: string,
  source: string,
): Promise<boolean> {
  try {
    return await isCurrentTaskPlanProjectionForChange(changeDir, source)
  } catch {
    return false
  }
}

export interface TasksMarkdownProjection {
  readonly source: string
  readonly trustedCanonicalProjection: boolean
}

interface DirectoryMutationVersion {
  readonly path: string
  readonly dev: bigint
  readonly ino: bigint
  readonly mtimeNs: bigint
  readonly ctimeNs: bigint
}

function captureDirectoryMutationVersion(path: string): DirectoryMutationVersion {
  const stat = lstatSync(path, { bigint: true })
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('tasks ancestor is not a directory')
  return { path, dev: stat.dev, ino: stat.ino, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs }
}

function matchesDirectoryMutationVersion(expected: DirectoryMutationVersion): boolean {
  const stat = lstatSync(expected.path, { bigint: true })
  return stat.isDirectory()
    && !stat.isSymbolicLink()
    && stat.dev === expected.dev
    && stat.ino === expected.ino
    && stat.mtimeNs === expected.mtimeNs
    && stat.ctimeNs === expected.ctimeNs
}

function isInside(base: string, candidate: string): boolean {
  const fromBase = relative(base, candidate)
  return fromBase === ''
    || (fromBase !== '..' && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase))
}

function readBoundedTasksSource(fd: number, maxBytes: number): string {
  const bytes = readBoundedBytes(fd, maxBytes)
  if (bytes.byteLength > maxBytes) {
    throw new Error('tasks.md exceeds the bounded snapshot budget')
  }
  return decodeUtf8Text(bytes, 'tasks.md snapshot')
}

/**
 * Read aggregate-snapshot tasks from one stable, regular inode.
 *
 * Both the Change directory and leaf are revalidated around the bounded fd read.
 * Suspicious, missing, raced, special, or oversized inputs are omitted from the
 * display projection instead of following a project-controlled pathname.
 */
export async function readTasksProjection(
  changeDir: string,
  hooks: TasksReadHooks = {},
  rootAnchor?: WorkflowRootAnchor,
): Promise<TasksMarkdownProjection | undefined> {
  const lexicalTarget = join(changeDir, 'tasks.md')
  let changeFd: number | undefined
  let fd: number | undefined
  let rootVersion: WorkflowRootMutationVersion | undefined
  const assertTrustContext = (): void => {
    hooks.assertTrustContext?.()
    if (rootAnchor !== undefined && rootVersion !== undefined) {
      assertWorkflowRootMutationVersion(rootAnchor, rootVersion)
    }
  }
  try {
    if (rootAnchor !== undefined) rootVersion = captureWorkflowRootMutationVersion(rootAnchor)
    assertTrustContext()
    const openedDir = lstatSync(changeDir)
    if (!openedDir.isDirectory() || openedDir.isSymbolicLink()) return undefined
    const openedDirVersion = lstatSync(changeDir, { bigint: true })
    const realChangeDir = realpathSync(changeDir)
    const changesDir = dirname(realChangeDir)
    const openspecDir = dirname(changesDir)
    const ancestorVersions = [dirname(openspecDir), openspecDir, changesDir]
      .map(captureDirectoryMutationVersion)
    changeFd = openSync(
      changeDir,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    const openedChangeDir = fstatSync(changeFd)
    const anchoredChangeDir = traversableDirectoryFdPath(changeFd, openedDir) ?? changeDir
    if (
      !openedChangeDir.isDirectory()
      || !sameIdentity(openedChangeDir, openedDir)
    ) return undefined
    assertTrustContext()
    const target = join(anchoredChangeDir, 'tasks.md')
    hooks.beforeOpen?.()
    fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const opened = fstatSync(fd, { bigint: true })
    if (!opened.isFile() || opened.size > BigInt(MAX_TASKS_MARKDOWN_BYTES)) return undefined
    const openedVersion = captureStableFileVersion(opened)

    const stable = (): boolean => {
      const currentDir = lstatSync(changeDir)
      const currentDirVersion = lstatSync(changeDir, { bigint: true })
      const current = lstatSync(lexicalTarget, { bigint: true })
      return currentDir.isDirectory()
        && !currentDir.isSymbolicLink()
        && currentDir.dev === openedDir.dev
        && currentDir.ino === openedDir.ino
        && currentDirVersion.mtimeNs === openedDirVersion.mtimeNs
        && currentDirVersion.ctimeNs === openedDirVersion.ctimeNs
        && ancestorVersions.every(matchesDirectoryMutationVersion)
        && realpathSync(changeDir) === realChangeDir
        && current.isFile()
        && !current.isSymbolicLink()
        && matchesStableFileVersion(current, openedVersion)
        && isInside(realChangeDir, realpathSync(lexicalTarget))
    }

    const fdStable = (): boolean => matchesStableFileVersion(
      fstatSync(fd as number, { bigint: true }),
      openedVersion,
    )

    if (!stable() || !fdStable()) return undefined
    const source = (hooks.readSource ?? readBoundedTasksSource)(fd, MAX_TASKS_MARKDOWN_BYTES)
    assertTrustContext()
    const trustedCanonicalProjection = isCanonicalTaskPlanTasksMarkdown(source)
      && (hooks.authorizeCanonicalProjection === undefined
        ? await hasCurrentCanonicalTaskPlanProjection(anchoredChangeDir, source)
        : await hooks.authorizeCanonicalProjection(source, anchoredChangeDir))
    assertTrustContext()
    if (opened.size > BigInt(MAX_LEGACY_TASKS_MARKDOWN_BYTES) && !trustedCanonicalProjection) return undefined
    if (!fdStable() || !stable()) return undefined
    assertTrustContext()
    return { source, trustedCanonicalProjection }
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
    if (changeFd !== undefined) closeSync(changeFd)
  }
}

export async function readTasksMarkdown(
  changeDir: string,
  hooks: TasksReadHooks = {},
  rootAnchor?: WorkflowRootAnchor,
): Promise<string | undefined> {
  return (await readTasksProjection(changeDir, hooks, rootAnchor))?.source
}
