import { mkdir, rmdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ExecFn } from '../runner/exec.js'
import type { GitFace } from './barrier.js'
import { SyncError } from './mergeback-types.js'

const GIT_ENV = { LC_ALL: 'C' } as const
const LOCK_TIMEOUT_MS = 300_000
const LOCK_STALE_MS = 120_000
const LOCK_POLL_MS = 25

const sleep = (ms: number): Promise<void> => new Promise((resolveDelay) => {
  setTimeout(resolveDelay, ms)
})

export const parseMergeResult = (
  result: { exitCode: number; stdout: string; stderr: string },
): { conflict: boolean } => ({
  conflict: result.exitCode !== 0,
})

export const realGitFace = (exec: ExecFn, cwd: string): GitFace => ({
  async revParse(ref) {
    const result = await exec('git', ['rev-parse', ref], { cwd, env: GIT_ENV })
    if (result.exitCode !== 0) {
      throw new Error(`git rev-parse ${ref} failed: ${result.stderr.slice(0, 200)}`)
    }
    return result.stdout.trim()
  },
})

export const collectCommitsReal = async (
  exec: ExecFn,
  input: { hostRepoDir: string; branch: string; base: string },
): Promise<{ sha: string }[]> => {
  const result = await exec(
    'git',
    ['rev-list', `${input.base}..refs/heads/${input.branch}`, '--reverse'],
    { cwd: input.hostRepoDir, env: GIT_ENV },
  )
  if (result.exitCode !== 0) return []
  const lines = result.stdout.trim()
  return lines === '' ? [] : lines.split('\n').map((sha) => ({ sha: sha.trim() }))
}

export const diffNamesReal = async (
  exec: ExecFn,
  input: { hostRepoDir: string; branch: string; base: string },
): Promise<string[]> => {
  const result = await exec(
    'git',
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '--name-only',
      `${input.base}...refs/heads/${input.branch}`,
    ],
    { cwd: input.hostRepoDir, env: GIT_ENV },
  )
  if (result.exitCode !== 0) return []
  const lines = result.stdout.trim()
  return lines === ''
    ? []
    : lines.split('\n').map((file) => file.trim()).filter((file) => file !== '')
}

async function resolveLockDir(exec: ExecFn, hostRepoDir: string): Promise<string> {
  const result = await exec(
    'git',
    ['rev-parse', '--git-common-dir'],
    { cwd: hostRepoDir, env: GIT_ENV },
  )
  const output = result.exitCode === 0 ? result.stdout.trim() : '.git'
  return join(resolve(hostRepoDir, output || '.git'), 'sandcastle-mergeback.lock.d')
}

export async function acquireMergeLock(
  exec: ExecFn,
  hostRepoDir: string,
  preservedPath: string,
): Promise<string> {
  const lockdir = await resolveLockDir(exec, hostRepoDir)
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    try {
      await mkdir(lockdir, { recursive: false })
      return lockdir
    } catch {
      try {
        const state = await stat(lockdir)
        if (Date.now() - state.mtimeMs > LOCK_STALE_MS) {
          await rmdir(lockdir).catch(() => {})
        }
      } catch {
        // The lock disappeared while it was inspected; retry acquisition.
      }
      if (Date.now() >= deadline) {
        throw new SyncError(
          `host merge-back lock not acquired within ${LOCK_TIMEOUT_MS}ms (${lockdir})`,
          preservedPath,
        )
      }
      await sleep(LOCK_POLL_MS)
    }
  }
}

export const mergeTreeSupported = async (
  exec: ExecFn,
  hostRepoDir: string,
): Promise<{ ok: boolean; version: string }> => {
  const result = await exec('git', ['--version'], { cwd: hostRepoDir, env: GIT_ENV })
  const version = result.stdout.trim()
  if (result.exitCode !== 0) return { ok: false, version }
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(version)
  if (!match) return { ok: false, version }
  const major = Number(match[1])
  const minor = Number(match[2])
  return { ok: major > 2 || (major === 2 && minor >= 38), version }
}
