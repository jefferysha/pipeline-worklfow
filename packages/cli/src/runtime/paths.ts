import { resolveProductPaths, type ProductPathInput } from '@tenon/kernel'
import type { RuntimePaths } from './types.js'

export type RuntimePathInput = ProductPathInput

/**
 * Resolve managed-runtime locations without relying on the caller's current working directory.
 * `TENON_RUNTIME_HOME` is intentionally an explicit testing/operator override; all three roots
 * live below it so an isolated test never touches real user state.
 */
export function resolveRuntimePaths(input: RuntimePathInput = {}): RuntimePaths {
  return resolveProductPaths(input)
}
