import { chmod, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteFile } from '@pipeline-lite/kernel'
import type { RuntimePaths } from './types.js'

export interface StableLauncherPaths {
  readonly pipeline: string
  readonly hook: string
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function launcherText(paths: RuntimePaths, mode: 'cli' | 'hook'): string {
  const bootstrap = join(paths.bootstrapRoot, 'active.mjs')
  const missing = mode === 'hook'
    ? 'exit 0'
    : 'printf "pipeline runtime bootstrap unavailable; run pipeline setup --codex or pipeline setup --claude\\n" >&2\n  exit 1'
  return `#!/usr/bin/env bash
set -eu
export PIPELINE_RUNTIME_DATA_ROOT=${shellQuote(paths.dataRoot)}
export PIPELINE_RUNTIME_STATE_ROOT=${shellQuote(paths.stateRoot)}
export PIPELINE_RUNTIME_CONFIG_ROOT=${shellQuote(paths.configRoot)}
[ -f ${shellQuote(bootstrap)} ] || { ${missing}; }
exec node ${shellQuote(bootstrap)} ${mode} "$@"
`
}

/** Write stable user-level launchers only after a managed release has been verified and activated. */
export async function writeStableLaunchers(paths: RuntimePaths, homeDir = homedir()): Promise<StableLauncherPaths> {
  const binDir = join(homeDir, '.local', 'bin')
  const pipeline = join(binDir, 'pipeline')
  const hook = join(binDir, 'pipeline-hook')
  await mkdir(binDir, { recursive: true })
  await atomicWriteFile(pipeline, launcherText(paths, 'cli'))
  await atomicWriteFile(hook, launcherText(paths, 'hook'))
  await Promise.all([chmod(pipeline, 0o755), chmod(hook, 0o755)])
  return { pipeline, hook }
}
