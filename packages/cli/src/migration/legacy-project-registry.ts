import { isAbsolute, resolve } from 'node:path'
import { statSync } from 'node:fs'
import {
  registerProjectRoot,
  resolveHostProjectRegistryCandidates,
  resolveProductPaths,
  type ProductPathInput,
} from '@tenon/kernel'

const MAX_LEGACY_REGISTRY_BYTES = 1_048_576

export interface LegacyProjectRegistryMigrationInput {
  readonly homeDir: string
  readonly platform?: NodeJS.Platform
  readonly env?: ProductPathInput['env']
  readonly readText: (path: string) => string | undefined
  readonly pathExists: (path: string) => boolean
  readonly pathIsDirectory?: (path: string) => boolean
}

export interface LegacyProjectRegistryMigrationResult {
  readonly discovered: number
  readonly imported: number
  readonly rejected: number
}

/**
 * One-way migration into the Tenon-owned registry. Legacy files remain read-only and are never a
 * runtime fallback; setup imports only absolute roots that still exist, then all readers use the
 * canonical product path.
 */
export async function migrateLegacyProjectRegistry(
  input: LegacyProjectRegistryMigrationInput,
): Promise<LegacyProjectRegistryMigrationResult> {
  const discovered = new Set<string>()
  let rejected = 0
  for (const path of resolveHostProjectRegistryCandidates({
    homeDir: input.homeDir,
    ...(input.platform === undefined ? {} : { platform: input.platform }),
    ...(input.env === undefined ? {} : { env: input.env }),
  })) {
    const text = input.readText(path)
    if (text === undefined) continue
    if (Buffer.byteLength(text) > MAX_LEGACY_REGISTRY_BYTES) {
      rejected += 1
      continue
    }
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      rejected += 1
      continue
    }
    if (!Array.isArray(value)) {
      rejected += 1
      continue
    }
    for (const item of value) {
      const isDirectory = typeof item === 'string' && (input.pathIsDirectory?.(item) ?? (() => {
        try {
          return statSync(item).isDirectory()
        } catch {
          return false
        }
      })())
      if (typeof item !== 'string' || !isAbsolute(item) || !input.pathExists(item) || !isDirectory) {
        rejected += 1
        continue
      }
      discovered.add(resolve(item))
    }
  }

  const registryPath = resolveProductPaths({
    homeDir: input.homeDir,
    ...(input.platform === undefined ? {} : { platform: input.platform }),
    ...(input.env === undefined ? {} : { env: input.env }),
  }).registryPath
  let imported = 0
  for (const root of discovered) {
    try {
      if (await registerProjectRoot(registryPath, root)) imported += 1
    } catch {
      rejected += 1
    }
  }
  return { discovered: discovered.size, imported, rejected }
}
