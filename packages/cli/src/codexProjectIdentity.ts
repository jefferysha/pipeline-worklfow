import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

const MAX_GIT_POINTER_BYTES = 4096

async function regularPointer(path: string): Promise<string | undefined> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_GIT_POINTER_BYTES) return undefined
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

async function physicalDirectory(path: string): Promise<string | undefined> {
  try {
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) return undefined
    const physical = await realpath(path)
    return resolve(path) === physical ? physical : undefined
  } catch {
    return undefined
  }
}

function singleLine(value: string): string | undefined {
  const lines = value.trim().split(/\r?\n/)
  return lines.length === 1 && lines[0] !== '' ? lines[0] : undefined
}

async function gitCommonDirectory(projectRoot: string): Promise<string | undefined> {
  const dotGit = join(resolve(projectRoot), '.git')
  const direct = await physicalDirectory(dotGit)
  if (direct) return direct

  const pointer = singleLine(await regularPointer(dotGit) ?? '')
  const match = pointer === undefined ? undefined : /^gitdir:\s+(.+)$/.exec(pointer)
  if (!match?.[1]) return undefined
  const gitDir = await physicalDirectory(
    isAbsolute(match[1]) ? match[1] : resolve(projectRoot, match[1]),
  )
  if (!gitDir) return undefined

  const commonPointer = singleLine(await regularPointer(join(gitDir, 'commondir')) ?? '')
  if (commonPointer === undefined) return gitDir
  return await physicalDirectory(
    isAbsolute(commonPointer) ? commonPointer : resolve(gitDir, commonPointer),
  )
}

/**
 * A Codex session may start in one Git worktree while an exec call explicitly targets a sibling.
 * Trust that call only when its declared workdir is the exact target and both roots share one
 * canonical Git common directory. This keeps transcript proof scoped to one repository without
 * treating every directory reachable from the host session as equivalent.
 */
export async function explicitSiblingWorktreeTarget(
  sessionRoot: string | undefined,
  commandWorkdir: string | undefined,
  targetRoot: string,
): Promise<boolean> {
  if (!sessionRoot || !commandWorkdir || !isAbsolute(commandWorkdir)) return false
  if (resolve(commandWorkdir) !== resolve(targetRoot)) return false
  const [physicalCommandWorkdir, physicalTargetRoot] = await Promise.all([
    physicalDirectory(commandWorkdir),
    physicalDirectory(targetRoot),
  ])
  if (
    physicalCommandWorkdir === undefined
    || physicalTargetRoot === undefined
    || physicalCommandWorkdir !== physicalTargetRoot
  ) return false
  const [sessionGit, targetGit] = await Promise.all([
    gitCommonDirectory(sessionRoot),
    gitCommonDirectory(targetRoot),
  ])
  return sessionGit !== undefined && targetGit !== undefined && sessionGit === targetGit
}
