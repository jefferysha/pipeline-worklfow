import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
} from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { readBounded as readBoundedBytes } from './contextBundleTrustedReader.js'
import {
  captureStableFileVersion,
  matchesStableFileVersion,
} from './stableFileMetadata.js'

export const MAX_TASKS_MARKDOWN_BYTES = 256 * 1024

interface TasksReadHooks {
  /** @internal Test seam for a leaf-swap race immediately before open(2). */
  readonly beforeOpen?: () => void
  /** @internal Test seam proving rejected paths are not read. */
  readonly readSource?: (fd: number, maxBytes: number) => string
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
  return bytes.toString('utf8')
}

/**
 * Read aggregate-snapshot tasks from one stable, regular inode.
 *
 * Both the Change directory and leaf are revalidated around the bounded fd read.
 * Suspicious, missing, raced, special, or oversized inputs are omitted from the
 * display projection instead of following a project-controlled pathname.
 */
export async function readTasksMarkdown(
  changeDir: string,
  hooks: TasksReadHooks = {},
): Promise<string | undefined> {
  const target = join(changeDir, 'tasks.md')
  let fd: number | undefined
  try {
    const openedDir = lstatSync(changeDir)
    if (!openedDir.isDirectory() || openedDir.isSymbolicLink()) return undefined
    const realChangeDir = realpathSync(changeDir)
    hooks.beforeOpen?.()
    fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const opened = fstatSync(fd, { bigint: true })
    if (!opened.isFile() || opened.size > BigInt(MAX_TASKS_MARKDOWN_BYTES)) return undefined
    const openedVersion = captureStableFileVersion(opened)

    const stable = (): boolean => {
      const currentDir = lstatSync(changeDir)
      const current = lstatSync(target, { bigint: true })
      return currentDir.isDirectory()
        && !currentDir.isSymbolicLink()
        && currentDir.dev === openedDir.dev
        && currentDir.ino === openedDir.ino
        && realpathSync(changeDir) === realChangeDir
        && current.isFile()
        && !current.isSymbolicLink()
        && matchesStableFileVersion(current, openedVersion)
        && isInside(realChangeDir, realpathSync(target))
    }

    const fdStable = (): boolean => matchesStableFileVersion(
      fstatSync(fd as number, { bigint: true }),
      openedVersion,
    )

    if (!stable() || !fdStable()) return undefined
    const source = (hooks.readSource ?? readBoundedTasksSource)(fd, MAX_TASKS_MARKDOWN_BYTES)
    if (!fdStable() || !stable()) return undefined
    return source
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
