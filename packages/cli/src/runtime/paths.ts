import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { RuntimePaths } from './types.js'

export interface RuntimePathInput {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly homeDir?: string
  readonly platform?: NodeJS.Platform
}

function usableAbsolute(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  return trimmed !== '' && isAbsolute(trimmed) ? resolve(trimmed) : null
}

function linuxRoot(homeDir: string, env: Readonly<Record<string, string | undefined>>, key: string, fallback: string): string {
  return usableAbsolute(env[key]) ?? join(homeDir, fallback, 'tenon')
}

/**
 * Resolve managed-runtime locations without relying on the caller's current working directory.
 * `TENON_RUNTIME_HOME` is intentionally an explicit testing/operator override; all three roots
 * live below it so an isolated test never touches real user state.
 */
export function resolveRuntimePaths(input: RuntimePathInput = {}): RuntimePaths {
  const env = input.env ?? process.env
  const homeDir = input.homeDir ?? homedir()
  const platform = input.platform ?? process.platform
  const overridden = usableAbsolute(env.TENON_RUNTIME_HOME)

  let dataRoot: string
  let stateRoot: string
  let configRoot: string
  if (overridden !== null) {
    dataRoot = join(overridden, 'data')
    stateRoot = join(overridden, 'state')
    configRoot = join(overridden, 'config')
  } else if (platform === 'darwin') {
    const base = join(homeDir, 'Library', 'Application Support', 'tenon')
    dataRoot = base
    stateRoot = join(base, 'state')
    configRoot = join(base, 'config')
  } else if (platform === 'win32') {
    const base = usableAbsolute(env.LOCALAPPDATA) ?? join(homeDir, 'AppData', 'Local')
    dataRoot = join(base, 'tenon')
    stateRoot = join(base, 'tenon', 'state')
    configRoot = join(base, 'tenon', 'config')
  } else {
    dataRoot = linuxRoot(homeDir, env, 'XDG_DATA_HOME', '.local/share')
    stateRoot = linuxRoot(homeDir, env, 'XDG_STATE_HOME', '.local/state')
    configRoot = linuxRoot(homeDir, env, 'XDG_CONFIG_HOME', '.config')
  }

  return {
    dataRoot,
    stateRoot,
    configRoot,
    releasesRoot: join(dataRoot, 'releases'),
    stagingRoot: join(dataRoot, '.staging'),
    bootstrapRoot: join(dataRoot, 'bootstrap'),
    selectionPath: join(stateRoot, 'selection.json'),
    auditPath: join(stateRoot, 'audit.jsonl'),
  }
}
