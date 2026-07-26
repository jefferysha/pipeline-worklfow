import { statSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, posix, resolve, win32 } from 'node:path'
import {
  atomicReplaceFile,
  registerProjectRoot,
  resolveProductPaths,
  withLock,
  type ProductPathInput,
} from '@tenon/kernel'

const MAX_LEGACY_REGISTRY_BYTES = 1_048_576
const MIGRATION_ID = 'host-project-registry-v1'

export interface LegacyProjectRegistryMigrationInput {
  readonly homeDir: string
  readonly platform?: NodeJS.Platform
  readonly env?: ProductPathInput['env']
  readonly readText: (path: string) => string | undefined
  readonly pathExists: (path: string) => boolean
  readonly pathIsDirectory?: (path: string) => boolean
  readonly now?: () => string
}

export interface LegacyProjectRegistryMigrationResult {
  readonly status: 'completed' | 'already-complete'
  readonly discovered: number
  readonly imported: number
  readonly rejected: number
}

interface ProjectRegistryMigrationReceipt {
  readonly version: 1
  readonly migration: typeof MIGRATION_ID
  readonly completedAt: string
  readonly discovered: number
  readonly imported: number
  readonly rejected: number
}

export function resolveHostProjectRegistryCandidates(
  input: Pick<LegacyProjectRegistryMigrationInput, 'homeDir' | 'platform'>,
): readonly string[] {
  const paths = input.platform === 'win32' ? win32 : posix
  const homeDir = paths.resolve(input.homeDir)
  return [
    paths.join(homeDir, '.claude', 'pipeline-projects.json'),
    paths.join(homeDir, '.codex', 'pipeline-projects.json'),
  ]
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

async function readMigrationReceipt(path: string): Promise<ProjectRegistryMigrationReceipt | null> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`host project registry migration receipt 非法：${path}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`host project registry migration receipt 非法：${path}`)
  }
  const record = value as Record<string, unknown>
  if (
    record.version !== 1
    || record.migration !== MIGRATION_ID
    || typeof record.completedAt !== 'string'
    || record.completedAt === ''
    || !nonNegativeInteger(record.discovered)
    || !nonNegativeInteger(record.imported)
    || !nonNegativeInteger(record.rejected)
  ) {
    throw new Error(`host project registry migration receipt 非法：${path}`)
  }
  return {
    version: 1,
    migration: MIGRATION_ID,
    completedAt: record.completedAt,
    discovered: record.discovered,
    imported: record.imported,
    rejected: record.rejected,
  }
}

/**
 * One-way migration into the Tenon-owned registry. Legacy files remain read-only and are never a
 * runtime fallback; setup imports only absolute roots that still exist, then all readers use the
 * canonical product path.
 */
export async function migrateLegacyProjectRegistry(
  input: LegacyProjectRegistryMigrationInput,
): Promise<LegacyProjectRegistryMigrationResult> {
  const productPaths = resolveProductPaths({
    homeDir: input.homeDir,
    ...(input.platform === undefined ? {} : { platform: input.platform }),
    ...(input.env === undefined ? {} : { env: input.env }),
  })
  const migrationRoot = join(productPaths.migrationsRoot, MIGRATION_ID)
  const receiptPath = join(migrationRoot, 'receipt.json')
  await mkdir(migrationRoot, { recursive: true })

  return withLock(migrationRoot, async () => {
    if (await readMigrationReceipt(receiptPath) !== null) {
      return { status: 'already-complete', discovered: 0, imported: 0, rejected: 0 }
    }

    // An existing canonical registry is already user-owned truth. Mark migration complete without
    // reading host files, so a later setup can never resurrect entries the user removed from Tenon.
    const discovered = new Set<string>()
    let rejected = 0
    if (!input.pathExists(productPaths.registryPath)) {
      for (const path of resolveHostProjectRegistryCandidates(input)) {
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
    }

    let imported = 0
    for (const root of discovered) {
      if (await registerProjectRoot(productPaths.registryPath, root)) imported += 1
    }
    const receipt: ProjectRegistryMigrationReceipt = {
      version: 1,
      migration: MIGRATION_ID,
      completedAt: (input.now ?? (() => new Date().toISOString()))(),
      discovered: discovered.size,
      imported,
      rejected,
    }
    await atomicReplaceFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    return { status: 'completed', discovered: discovered.size, imported, rejected }
  })
}
