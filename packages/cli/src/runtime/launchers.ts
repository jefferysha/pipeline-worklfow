import { chmod, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteFile } from '@tenon/kernel'
import type { RuntimePaths } from './types.js'

export interface StableLauncherPaths {
  readonly tenon: string
  readonly hook: string
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function launcherText(paths: RuntimePaths, mode: 'cli' | 'hook'): string {
  const bootstrap = join(paths.bootstrapRoot, 'active.mjs')
  const missing = mode === 'hook'
    ? 'exit 0'
    : 'printf "tenon runtime bootstrap unavailable; run tenon setup --codex or tenon setup --claude\\n" >&2\n  exit 1'
  return `#!/usr/bin/env bash
set -eu
export TENON_RUNTIME_DATA_ROOT=${shellQuote(paths.dataRoot)}
export TENON_RUNTIME_STATE_ROOT=${shellQuote(paths.stateRoot)}
export TENON_RUNTIME_CONFIG_ROOT=${shellQuote(paths.configRoot)}
[ -f ${shellQuote(bootstrap)} ] || { ${missing}; }
exec node ${shellQuote(bootstrap)} ${mode} "$@"
`
}

/** Write stable user-level launchers only after a managed release has been verified and activated. */
export async function writeStableLaunchers(paths: RuntimePaths, homeDir = homedir()): Promise<StableLauncherPaths> {
  const binDir = join(homeDir, '.local', 'bin')
  const tenon = join(binDir, 'tenon')
  const hook = join(binDir, 'tenon-hook')
  await mkdir(binDir, { recursive: true })
  await atomicWriteFile(tenon, launcherText(paths, 'cli'))
  await atomicWriteFile(hook, launcherText(paths, 'hook'))
  await Promise.all([chmod(tenon, 0o755), chmod(hook, 0o755)])
  return { tenon, hook }
}
