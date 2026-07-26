import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  RuntimeAuditEntry,
  RuntimePaths,
  RuntimeReleaseManifest,
  RuntimeReleaseSource,
  RuntimeSelection,
} from './types.js'
import { RuntimeFailure } from './types.js'

export const EMPTY_SELECTION: RuntimeSelection = {
  version: 1,
  revision: 0,
  activeRelease: null,
  previousRelease: null,
  updatedAt: '1970-01-01T00:00:00Z',
}

export const PAYLOAD_ENTRIES = [
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  'adapters',
  'hooks',
  'packages/cli/dist/tenon.mjs',
  'packages/dashboard-app/dist',
  'packages/server/dist/dashboard.mjs',
  'runtime/tenon-bootstrap.mjs',
  'skills',
  'templates',
  'tools/verify-skills.sh',
] as const

const RELEASE_ID = /^sha256-[a-f0-9]{64}$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function validReleaseId(value: unknown): value is string {
  return typeof value === 'string' && RELEASE_ID.test(value)
}

// POSIX implementations disagree on the errno for rename(stage, existing-nonempty-dir).
export function isExistingReleaseCollision(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'EEXIST' || code === 'ENOTEMPTY'
}

function sourceFromUnknown(value: unknown): RuntimeReleaseSource | null {
  if (!isRecord(value)) return null
  const host = value.host
  const pluginVersion = nonEmptyString(value.pluginVersion)
  if ((host !== 'codex' && host !== 'claude' && host !== 'adapter' && host !== 'manual') || pluginVersion === null) {
    return null
  }
  return { host, pluginVersion }
}

export function parseManifest(raw: string): RuntimeReleaseManifest | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.version !== 1 || !validReleaseId(value.releaseId)) return null
  const payloadDigest = nonEmptyString(value.payloadDigest)
  const createdAt = nonEmptyString(value.createdAt)
  const source = sourceFromUnknown(value.source)
  if (payloadDigest === null || !/^[a-f0-9]{64}$/.test(payloadDigest) || createdAt === null || source === null) return null
  if (value.releaseId !== `sha256-${payloadDigest}`) return null
  return { version: 1, releaseId: value.releaseId, payloadDigest, createdAt, source }
}

export function parseSelection(raw: string): RuntimeSelection | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const revision = value.revision
  if (value.version !== 1 || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return null
  const activeRelease = value.activeRelease
  const previousRelease = value.previousRelease
  const updatedAt = nonEmptyString(value.updatedAt)
  if ((activeRelease !== null && !validReleaseId(activeRelease))
    || (previousRelease !== null && !validReleaseId(previousRelease)) || updatedAt === null) return null
  return { version: 1, revision, activeRelease, previousRelease, updatedAt }
}

export function parseAudit(raw: string): RuntimeAuditEntry | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.version !== 1) return null
  const at = nonEmptyString(value.at)
  const detail = nonEmptyString(value.detail)
  const kind = value.kind
  const releaseId = value.releaseId
  const previousRelease = value.previousRelease
  if (at === null || detail === null
    || (kind !== 'activated' && kind !== 'activation-rejected' && kind !== 'rolled-back'
      && kind !== 'rollback-rejected' && kind !== 'update-rejected' && kind !== 'pruned')
    || (releaseId !== undefined && !validReleaseId(releaseId))
    || (previousRelease !== undefined && previousRelease !== null && !validReleaseId(previousRelease))) return null
  return {
    version: 1,
    at,
    kind,
    ...(releaseId === undefined ? {} : { releaseId }),
    ...(previousRelease === undefined ? {} : { previousRelease }),
    detail,
  }
}

export function stableJson(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function readReleaseManifest(releaseRoot: string): Promise<RuntimeReleaseManifest | null> {
  try {
    return parseManifest(await readFile(join(releaseRoot, 'release.json'), 'utf8'))
  } catch {
    return null
  }
}

export async function readSelection(paths: RuntimePaths): Promise<RuntimeSelection> {
  try {
    const parsed = parseSelection(await readFile(paths.selectionPath, 'utf8'))
    if (parsed !== null) return parsed
    throw new RuntimeFailure('runtime-corrupt', 'managed runtime selection.json 格式无效')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_SELECTION
    throw error
  }
}

export async function lastAudit(paths: RuntimePaths): Promise<RuntimeAuditEntry | null> {
  try {
    const lines = (await readFile(paths.auditPath, 'utf8')).trim().split(/\r?\n/)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]
      if (line === undefined || line === '') continue
      const parsed = parseAudit(line)
      if (parsed !== null) return parsed
    }
    return null
  } catch {
    return null
  }
}

export async function writeAudit(paths: RuntimePaths, entry: RuntimeAuditEntry): Promise<void> {
  await appendFile(paths.auditPath, `${JSON.stringify(entry)}\n`, 'utf8')
}
