import { ALL_MANAGED_DIRS } from './ownership-manifest.js'

export const UNKNOWN_VERSION = 'unknown'
export const PLUGIN_KEY = 'pipeline-workflow@pipeline-workflow'
export const CODEX_UPGRADE_MARKERS = [
  '.agents/skills/pipeline-continue/SKILL.md',
  '.agents/skills/pipeline-finish-work/SKILL.md',
] as const

const NPM_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function isManagedPath(dir: string): boolean {
  const path = dir.replace(/\\/g, '/')
  return ALL_MANAGED_DIRS.some((managed) => path === managed || path.startsWith(`${managed}/`))
}

export function isManagedRootDir(dir: string): boolean {
  const path = dir.replace(/\\/g, '/')
  return ALL_MANAGED_DIRS.some((managed) => path === managed)
}

export function isUnknownVersion(version: string): boolean {
  return version === UNKNOWN_VERSION
}

function isNumericIdentifier(part: string): boolean {
  return /^[0-9]+$/.test(part) && String(parseInt(part, 10)) === part
}

export function compareVersions(a: string, b: string): number {
  const split = (version: string): [string, string | null] => {
    const index = version.indexOf('-')
    return index < 0 ? [version, null] : [version.slice(0, index), version.slice(index + 1)]
  }
  const parseBase = (version: string): number[] => version.split('.').map((part) => {
    const value = parseInt(part, 10)
    return Number.isNaN(value) ? 0 : value
  })
  const [aBase, aPre] = split(a)
  const [bBase, bPre] = split(b)
  const aParts = parseBase(aBase)
  const bParts = parseBase(bBase)
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index++) {
    const aPart = aParts[index] ?? 0
    const bPart = bParts[index] ?? 0
    if (aPart !== bPart) return aPart < bPart ? -1 : 1
  }
  if (aPre === null || bPre === null) {
    if (aPre === bPre) return 0
    return aPre === null ? 1 : -1
  }
  const aIds = aPre.split('.')
  const bIds = bPre.split('.')
  for (let index = 0; index < Math.max(aIds.length, bIds.length); index++) {
    const aId = aIds[index]
    const bId = bIds[index]
    if (aId === undefined) return -1
    if (bId === undefined) return 1
    const aNumeric = isNumericIdentifier(aId)
    const bNumeric = isNumericIdentifier(bId)
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    if (aNumeric) {
      const aNumber = parseInt(aId, 10)
      const bNumber = parseInt(bId, 10)
      if (aNumber !== bNumber) return aNumber < bNumber ? -1 : 1
    } else if (aId !== bId) {
      return aId < bId ? -1 : 1
    }
  }
  return 0
}

export interface DowngradeGuard {
  action: 'ok' | 'reject' | 'downgrade'
  proceed: boolean
  messages: string[]
}

export function guardDowngrade(cliVersion: string, projectVersion: string, allowDowngrade: boolean): DowngradeGuard {
  if (compareVersions(cliVersion, projectVersion) >= 0) return { action: 'ok', proceed: true, messages: [] }
  if (allowDowngrade) {
    return { action: 'downgrade', proceed: true, messages: ['Proceeding with downgrade (--allow-downgrade)...'] }
  }
  return {
    action: 'reject',
    proceed: false,
    messages: [
      'Cannot sync: this would DOWNGRADE the project pipeline assets.',
      `  CLI version:     ${cliVersion}`,
      `  Project version: ${projectVersion}`,
      'Two ways forward:',
      '  1. Upgrade the plugin to match the project.',
      '  2. Pass --allow-downgrade to force the downgrade.',
    ],
  }
}

export function shouldInjectConfigSections(cliVersion: string, projectVersion: string): boolean {
  return !isUnknownVersion(projectVersion) && compareVersions(cliVersion, projectVersion) > 0
}

export interface MigrateGate {
  decision: 'ok' | 'required' | 'tip'
  exitCode: 0 | 1
  messages: string[]
}

export function migrateGateDecision(
  pendingCount: number,
  migrate: boolean,
  cliVersion: string,
  projectVersion: string,
  metadata: { breaking?: boolean; recommend_migrate?: boolean },
): MigrateGate {
  const pending = pendingCount > 0 && !migrate &&
    !isUnknownVersion(projectVersion) && compareVersions(cliVersion, projectVersion) > 0
  if (!pending) return { decision: 'ok', exitCode: 0, messages: [] }
  if (metadata.breaking && metadata.recommend_migrate) {
    return {
      decision: 'required',
      exitCode: 1,
      messages: [
        'MIGRATION REQUIRED: this is a breaking upgrade with structural migrations.',
        'Re-run with --migrate to apply renames/deletions (a full backup is taken first).',
        'Refusing to proceed without --migrate would leave a half-migrated tree.',
      ],
    }
  }
  return { decision: 'tip', exitCode: 0, messages: ['Tip: Use --migrate to apply pending path migrations.'] }
}

export function needsCodexUpgrade(hasCodexDir: boolean, manifestKeys: readonly string[]): boolean {
  if (hasCodexDir) return false
  const keys = new Set(manifestKeys.map((key) => key.replace(/\\/g, '/')))
  return CODEX_UPGRADE_MARKERS.some((marker) => keys.has(marker))
}

export interface BannerNudge {
  direction: 'update' | 'upgrade'
  projectVersion: string
  cliVersion: string
  message: string
}

export function bannerNudge(projectVersion: string, cliVersion: string): BannerNudge | null {
  if (isUnknownVersion(projectVersion)) return null
  const comparison = compareVersions(cliVersion, projectVersion)
  if (comparison === 0) return null
  const direction = comparison > 0 ? 'update' : 'upgrade'
  const message = comparison > 0
    ? `Tenon assets are out of date: ${projectVersion} -> ${cliVersion}. Run: tenon sync`
    : `Your Tenon plugin (${cliVersion}) is older than this project (${projectVersion}). Run: tenon update --self-update`
  return { direction, projectVersion, cliVersion, message }
}

export function deriveUpgradeChannel(currentVersion: string, requestedTag?: string): string {
  if (requestedTag !== undefined) {
    if (!NPM_TAG_RE.test(requestedTag)) throw new Error(`Invalid upgrade tag: ${JSON.stringify(requestedTag)}`)
    return requestedTag
  }
  if (currentVersion.includes('-beta')) return 'beta'
  if (currentVersion.includes('-rc')) return 'rc'
  return 'latest'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function getInstalledPluginVersion(installedJsonText: string, pluginKey: string = PLUGIN_KEY): string | null {
  let data: unknown
  try {
    data = JSON.parse(installedJsonText)
  } catch {
    return null
  }
  if (!isRecord(data) || !isRecord(data.plugins)) return null
  const entries = data.plugins[pluginKey]
  if (!Array.isArray(entries)) return null
  const first = entries[0]
  return isRecord(first) && typeof first.version === 'string' && first.version ? first.version : null
}

export function deriveChannelFromInstalled(installedJsonText: string, pluginKey: string = PLUGIN_KEY): string {
  const version = getInstalledPluginVersion(installedJsonText, pluginKey)
  return version === null ? 'latest' : deriveUpgradeChannel(version)
}
