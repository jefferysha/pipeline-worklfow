/** Physical Git identity probe used by the Build revision trust boundary. */
import { execFile } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { BuildRevisionIdentity } from '../workflow/build-revision.js'

const execFileAsync = promisify(execFile)
async function physicalDirectory(pathname: string): Promise<string | undefined> {
  try {
    const info = await lstat(pathname)
    if (!info.isDirectory() || info.isSymbolicLink()) return undefined
    const physical = await realpath(pathname)
    return resolve(pathname) === physical ? physical : undefined
  } catch {
    return undefined
  }
}

/**
 * Read the physical common directory, worktree top-level and git directory with Git's own
 * resolver.  This intentionally returns no partial identity: an incomplete result is not
 * trustworthy enough to permit Verify.
 */
export async function probeBuildRevisionIdentity(root: string): Promise<BuildRevisionIdentity | undefined> {
  try {
    // Git resolves a symlinked cwd before reporting its paths; reject the original
    // spelling first so a caller cannot smuggle an alias into the trust boundary.
    const rootInfo = await lstat(root)
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return undefined
    const { stdout } = await execFileAsync('git', [
      'rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel', '--git-dir',
    ], { cwd: root, timeout: 1_500, maxBuffer: 4_096, windowsHide: true })
    const lines = String(stdout).trim().split(/\r?\n/)
    if (lines.length !== 3 || lines.some((line) => line === '' || !isAbsolute(line))) return undefined
    const [commonRaw, topRaw, gitRaw] = lines
    if (!commonRaw || !topRaw || !gitRaw) return undefined
    const common = await physicalDirectory(commonRaw)
    const top = await physicalDirectory(topRaw)
    const git = await physicalDirectory(gitRaw)
    if (!common || !top || !git) return undefined
    return { repository: common, worktree: `${top}\0${git}` }
  } catch {
    return undefined
  }
}
