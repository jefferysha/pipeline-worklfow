import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Fallback for library/test use outside an installed plugin root. */
export const SERVER_VERSION = '0.1.0'

interface PluginManifestVersion {
  readonly version?: unknown
}

function isPluginManifestVersion(value: unknown): value is PluginManifestVersion {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The server's takeover version must be the release version, not a separately maintained package
 * constant.  Otherwise an auto-updated plugin can keep reusing an old dashboard process because
 * both bundles advertise the same stale version.  Codex is preferred because it is the primary
 * native host; Claude remains a compatible fallback for a Claude-only installation.
 */
export function resolveReleaseVersion(pluginRoot: string): string {
  for (const relative of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(pluginRoot, relative), 'utf8'))
      if (isPluginManifestVersion(parsed) && typeof parsed.version === 'string' && /^\d+\.\d+\.\d+$/.test(parsed.version)) {
        return parsed.version
      }
    } catch {
      // A library consumer or a damaged checkout may not have release metadata; retain the
      // established fallback instead of preventing a local diagnostic server from starting.
    }
  }
  return SERVER_VERSION
}
