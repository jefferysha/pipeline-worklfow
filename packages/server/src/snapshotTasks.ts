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

function readBounded(fd: number, maxBytes: number): string {
  const bytes = Buffer.allocUnsafe(maxBytes + 1)
  let total = 0
  while (total <= maxBytes) {
    const count = readSync(fd, bytes, total, maxBytes + 1 - total, null)
    if (count === 0) break
    total += count
  }
  if (total > maxBytes) throw new Error('tasks.md exceeds the bounded snapshot budget')
  return bytes.subarray(0, total).toString('utf8')
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
    const opened = fstatSync(fd)
    if (!opened.isFile() || opened.size > MAX_TASKS_MARKDOWN_BYTES) return undefined

    const stable = (): boolean => {
      const currentDir = lstatSync(changeDir)
      const current = lstatSync(target)
      return currentDir.isDirectory()
        && !currentDir.isSymbolicLink()
        && currentDir.dev === openedDir.dev
        && currentDir.ino === openedDir.ino
        && realpathSync(changeDir) === realChangeDir
        && current.isFile()
        && !current.isSymbolicLink()
        && current.dev === opened.dev
        && current.ino === opened.ino
        && current.size === opened.size
        && isInside(realChangeDir, realpathSync(target))
    }

    if (!stable()) return undefined
    const source = (hooks.readSource ?? readBounded)(fd, MAX_TASKS_MARKDOWN_BYTES)
    if (!stable()) return undefined
    return source
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
