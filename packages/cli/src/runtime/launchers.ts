import { chmod, lstat, mkdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { atomicWriteFile, serializeProductRootContract } from '@tenon/kernel'
import type {
  RuntimeLauncherFileSnapshot,
  RuntimeLauncherSnapshot,
  RuntimePaths,
} from './types.js'

export interface StableLauncherPaths {
  readonly tenon: string
  readonly hook: string
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function launcherText(paths: RuntimePaths, mode: 'cli' | 'hook'): string {
  const bootstrap = join(paths.bootstrapRoot, 'active.mjs')
  const rootContract = serializeProductRootContract(paths)
  const missing = mode === 'hook'
    ? 'exit 0'
    : 'printf "tenon runtime bootstrap unavailable; run tenon setup --codex or tenon setup --claude\\n" >&2\n  exit 1'
  return `#!/usr/bin/env bash
set -eu
export TENON_RUNTIME_ROOTS=${shellQuote(rootContract)}
# N-1 bootstrap ABI: previous verified releases read these exact roots during rollback.
export TENON_RUNTIME_DATA_ROOT=${shellQuote(paths.dataRoot)}
export TENON_RUNTIME_STATE_ROOT=${shellQuote(paths.stateRoot)}
export TENON_RUNTIME_CONFIG_ROOT=${shellQuote(paths.configRoot)}
[ -f ${shellQuote(bootstrap)} ] || { ${missing}; }
exec node ${shellQuote(bootstrap)} ${mode} "$@"
`
}

function launcherPaths(homeDir: string): StableLauncherPaths {
  const binDir = join(homeDir, '.local', 'bin')
  return {
    tenon: join(binDir, 'tenon'),
    hook: join(binDir, 'tenon-hook'),
  }
}

async function captureLauncher(path: string): Promise<RuntimeLauncherFileSnapshot> {
  try {
    const item = await lstat(path)
    if (item.isSymbolicLink() || !item.isFile()) {
      throw new Error(`launcher 不是可安全替换的普通文件: ${path}`)
    }
    return {
      path,
      state: {
        kind: 'file',
        content: await readFile(path, 'utf8'),
        mode: item.mode & 0o777,
      },
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path, state: { kind: 'missing' } }
    throw error
  }
}

/** Capture the exact user-owned state before any activation writes a stable launcher. */
export async function captureStableLaunchers(
  _paths: RuntimePaths,
  homeDir = homedir(),
): Promise<RuntimeLauncherSnapshot> {
  const paths = launcherPaths(homeDir)
  const [tenon, hook] = await Promise.all([
    captureLauncher(paths.tenon),
    captureLauncher(paths.hook),
  ])
  return { tenon, hook }
}

/** Compute the exact launcher bytes/mode this release is allowed to own after commit. */
export function expectedStableLaunchers(
  paths: RuntimePaths,
  homeDir = homedir(),
): RuntimeLauncherSnapshot {
  const stable = launcherPaths(homeDir)
  return {
    tenon: {
      path: stable.tenon,
      state: { kind: 'file', content: launcherText(paths, 'cli'), mode: 0o755 },
    },
    hook: {
      path: stable.hook,
      state: { kind: 'file', content: launcherText(paths, 'hook'), mode: 0o755 },
    },
  }
}

function sameLauncherState(
  left: RuntimeLauncherFileSnapshot['state'],
  right: RuntimeLauncherFileSnapshot['state'],
  compareMode = true,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'missing' || right.kind === 'missing') return true
  return left.content === right.content && (!compareMode || left.mode === right.mode)
}

async function restoreLauncher(snapshot: RuntimeLauncherFileSnapshot): Promise<void> {
  if (snapshot.state.kind === 'missing') {
    await rm(snapshot.path, { force: true })
    return
  }
  await mkdir(dirname(snapshot.path), { recursive: true })
  await atomicWriteFile(snapshot.path, snapshot.state.content)
  await chmod(snapshot.path, snapshot.state.mode)
}

/** Restore both launchers to their exact pre-activation existence, bytes, and mode. */
export async function restoreStableLaunchers(
  snapshot: RuntimeLauncherSnapshot,
  committed?: RuntimeLauncherSnapshot,
): Promise<void> {
  if (committed !== undefined) {
    const current = await Promise.all([
      captureLauncher(snapshot.tenon.path),
      captureLauncher(snapshot.hook.path),
    ])
    for (const [index, value] of current.entries()) {
      const before = index === 0 ? snapshot.tenon : snapshot.hook
      const owned = index === 0 ? committed.tenon : committed.hook
      // Atomic content publication and chmod are two syscalls. The installer still owns the
      // content-matching intermediate state even if its mode has not reached 0755 yet.
      if (!sameLauncherState(value.state, before.state) && !sameLauncherState(value.state, owned.state, false)) {
        throw new Error(`launcher 在 activation 后被外部修改，拒绝覆盖: ${value.path}`)
      }
    }
  }
  await Promise.all([
    restoreLauncher(snapshot.tenon),
    restoreLauncher(snapshot.hook),
  ])
}

/** Write stable user-level launchers only after a managed release has been verified and activated. */
export async function writeStableLaunchers(paths: RuntimePaths, homeDir = homedir()): Promise<StableLauncherPaths> {
  const { tenon, hook } = launcherPaths(homeDir)
  const binDir = join(homeDir, '.local', 'bin')
  await mkdir(binDir, { recursive: true })
  const expected = expectedStableLaunchers(paths, homeDir)
  const tenonState = expected.tenon.state
  const hookState = expected.hook.state
  if (tenonState.kind !== 'file' || hookState.kind !== 'file') throw new Error('launcher commit state invalid')
  await atomicWriteFile(tenon, tenonState.content)
  await atomicWriteFile(hook, hookState.content)
  await Promise.all([chmod(tenon, 0o755), chmod(hook, 0o755)])
  return { tenon, hook }
}
