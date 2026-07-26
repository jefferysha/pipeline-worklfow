import type { ProductPathInput } from '@tenon/kernel'
import { resolveRuntimePaths } from './paths.js'
import type { RuntimePaths } from './types.js'

export interface RuntimeScopeSnapshot {
  readonly homeDir: string
  readonly env: NonNullable<ProductPathInput['env']>
  readonly paths: RuntimePaths
}

export interface RuntimeScopeProviders {
  readonly homeDir: () => string
  readonly env: () => NonNullable<ProductPathInput['env']>
  readonly platform?: NodeJS.Platform
}

/**
 * Capture a command-scoped runtime boundary once. Every adapter and probe receives the same
 * immutable inputs and resolved paths even if the process environment changes while it runs.
 */
export function createRuntimeScopeResolver(
  providers: RuntimeScopeProviders,
): () => RuntimeScopeSnapshot {
  let snapshot: RuntimeScopeSnapshot | undefined
  return () => {
    if (snapshot !== undefined) return snapshot
    const homeDir = providers.homeDir()
    const env = Object.freeze({ ...providers.env() })
    const paths = resolveRuntimePaths({
      homeDir,
      env,
      ...(providers.platform === undefined ? {} : { platform: providers.platform }),
    })
    snapshot = Object.freeze({ homeDir, env, paths })
    return snapshot
  }
}
