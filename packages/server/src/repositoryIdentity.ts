import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, normalize, resolve } from 'node:path'
import type { ProjectRepositoryIdentity } from './types.js'

const REPOSITORY_IDENTITY_TIMEOUT_MS = 1_500
const REPOSITORY_IDENTITY_MAX_OUTPUT_BYTES = 4_096
const REPOSITORY_IDENTITY_ARGS = [
  'rev-parse',
  '--path-format=absolute',
  '--git-common-dir',
  '--show-toplevel',
] as const

function runGitRepositoryIdentity(
  root: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    execFile('git', [...args], {
      cwd: root,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: REPOSITORY_IDENTITY_MAX_OUTPUT_BYTES,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolveOutput(stdout)
    })
  })
}

export interface RepositoryIdentityProbeDeps {
  runGit?: (root: string, args: readonly string[], timeoutMs: number) => Promise<string>
}

export async function readRepositoryIdentity(
  root: string,
  probe: (root: string) => Promise<ProjectRepositoryIdentity | undefined> = probeRepositoryIdentity,
): Promise<ProjectRepositoryIdentity | undefined> {
  try {
    return await probe(root)
  } catch {
    return undefined
  }
}

export async function probeRepositoryIdentity(
  root: string,
  deps: RepositoryIdentityProbeDeps = {},
): Promise<ProjectRepositoryIdentity | undefined> {
  let output: string
  try {
    output = await (deps.runGit ?? runGitRepositoryIdentity)(
      root,
      REPOSITORY_IDENTITY_ARGS,
      REPOSITORY_IDENTITY_TIMEOUT_MS,
    )
  } catch {
    return undefined
  }
  const lines = output.trim().split(/\r?\n/)
  if (lines.length !== 2) return undefined
  const [commonDirectoryRaw, topLevelRaw] = lines
  if (!commonDirectoryRaw || !topLevelRaw
    || !isAbsolute(commonDirectoryRaw) || !isAbsolute(topLevelRaw)) return undefined
  const commonDirectory = normalize(resolve(commonDirectoryRaw))
  const topLevel = normalize(resolve(topLevelRaw))
  const repositoryRoot = dirname(commonDirectory)
  const label = basename(repositoryRoot)
  if (!label) return undefined
  return {
    id: createHash('sha256').update(commonDirectory).digest('hex'),
    label,
    workspace_kind: repositoryRoot === topLevel ? 'primary' : 'worktree',
  }
}
