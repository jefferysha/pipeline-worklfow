import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MAX_HOST_INVENTORY_BYTES = 256 * 1024

interface PathIdentity {
  readonly path: string
  readonly dev: number
  readonly ino: number
}

function captureDirectoryChain(hostHome: string, segments: readonly string[]): readonly PathIdentity[] | null {
  const identities: PathIdentity[] = []
  let candidate = hostHome
  for (const segment of ['', ...segments]) {
    if (segment !== '') candidate = join(candidate, segment)
    try {
      const metadata = lstatSync(candidate)
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) return null
      identities.push({ path: candidate, dev: metadata.dev, ino: metadata.ino })
    } catch {
      return null
    }
  }
  return identities
}

function directoryChainIsStable(identities: readonly PathIdentity[]): boolean {
  return identities.every((identity) => {
    try {
      const metadata = lstatSync(identity.path)
      return metadata.isDirectory()
        && !metadata.isSymbolicLink()
        && metadata.dev === identity.dev
        && metadata.ino === identity.ino
    } catch {
      return false
    }
  })
}

function isDirectoryBelowHostHome(hostHome: string, segments: readonly string[]): boolean {
  let candidate = hostHome
  for (const segment of segments) {
    candidate = join(candidate, segment)
    try {
      const metadata = lstatSync(candidate)
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) return false
    } catch {
      return false
    }
  }
  return true
}

function hasInstalledPlugin(
  hostHome: string,
  namespaceSegments: readonly string[],
  markerSegments: readonly string[],
): boolean {
  if (!isDirectoryBelowHostHome(hostHome, namespaceSegments)) return false
  let versions
  try {
    versions = readdirSync(join(hostHome, ...namespaceSegments), { withFileTypes: true })
  } catch {
    return false
  }
  if (versions.length > 128) return false
  return versions.some((version) => {
    if (!version.isDirectory() || version.isSymbolicLink()) return false
    const segments = [...namespaceSegments, version.name, ...markerSegments]
    const marker = join(hostHome, ...segments)
    if (!isDirectoryBelowHostHome(hostHome, segments.slice(0, -1))) return false
    try {
      const metadata = lstatSync(marker)
      return metadata.isFile() && !metadata.isSymbolicLink()
    } catch {
      return false
    }
  })
}

function readBoundedHostFile(hostHome: string, segments: readonly string[]): string | null {
  if (segments.length === 0) return null
  const directories = captureDirectoryChain(hostHome, segments.slice(0, -1))
  if (directories === null) return null
  const path = join(hostHome, ...segments)
  let descriptor: number | undefined
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    const metadata = fstatSync(descriptor)
    if (!metadata.isFile() || metadata.size > MAX_HOST_INVENTORY_BYTES) return null
    const fileIsStable = (): boolean => {
      try {
        const current = lstatSync(path)
        return current.isFile()
          && !current.isSymbolicLink()
          && current.dev === metadata.dev
          && current.ino === metadata.ino
          && current.size === metadata.size
          && directoryChainIsStable(directories)
      } catch {
        return false
      }
    }
    if (!fileIsStable()) return null
    const buffer = Buffer.allocUnsafe(MAX_HOST_INVENTORY_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const read = readSync(descriptor, buffer, length, buffer.length - length, null)
      if (read === 0) break
      length += read
    }
    return length > MAX_HOST_INVENTORY_BYTES || !fileIsStable()
      ? null
      : buffer.subarray(0, length).toString('utf8')
  } catch {
    return null
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function stripTomlComment(line: string): string {
  let quote: 'single' | 'double' | null = null
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quote === 'double') {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quote = null
      continue
    }
    if (quote === 'single') {
      if (character === "'") quote = null
      continue
    }
    if (character === '"') quote = 'double'
    else if (character === "'") quote = 'single'
    else if (character === '#') return line.slice(0, index)
  }
  return line
}

function codexPluginEnabled(hostHome: string): boolean {
  const config = readBoundedHostFile(hostHome, ['.codex', 'config.toml'])
  if (config === null) return false
  const pluginKey = String.raw`(?:"tenon@tenon"|'tenon@tenon'|tenon@tenon)`
  const pluginTable = new RegExp(String.raw`^\[\s*plugins\s*\.\s*${pluginKey}\s*\]$`)
  const pluginsTable = /^\[\s*plugins\s*\]$/
  const enabled = /^enabled\s*=\s*true$/
  const nestedEnabled = new RegExp(String.raw`^${pluginKey}\s*\.\s*enabled\s*=\s*true$`)
  const dottedEnabled = new RegExp(String.raw`^plugins\s*\.\s*${pluginKey}\s*\.\s*enabled\s*=\s*true$`)
  let scope: 'root' | 'plugins' | 'plugin' | 'other' = 'root'
  for (const rawLine of config.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim()
    if (line === '') continue
    if (pluginTable.test(line)) scope = 'plugin'
    else if (pluginsTable.test(line)) scope = 'plugins'
    else if (line.startsWith('[')) scope = 'other'
    else if ((scope === 'plugin' && enabled.test(line))
      || (scope === 'plugins' && nestedEnabled.test(line))
      || (scope === 'root' && dottedEnabled.test(line))) return true
  }
  return false
}

function claudePluginEnabled(hostHome: string): boolean {
  const inventory = readBoundedHostFile(hostHome, ['.claude', 'plugins', 'installed_plugins.json'])
  if (inventory === null) return false
  try {
    const parsed: unknown = JSON.parse(inventory)
    const plugins = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'plugins') : undefined
    if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) return false
    const installed = Reflect.get(plugins, 'tenon@tenon')
    if (!Array.isArray(installed) || installed.length === 0) return false
    const settingsText = readBoundedHostFile(hostHome, ['.claude', 'settings.json'])
    if (settingsText === null) return true
    const settings: unknown = JSON.parse(settingsText)
    const enabledPlugins = typeof settings === 'object' && settings !== null
      ? Reflect.get(settings, 'enabledPlugins')
      : undefined
    return !(typeof enabledPlugins === 'object'
      && enabledPlugins !== null
      && !Array.isArray(enabledPlugins)
      && Reflect.get(enabledPlugins, 'tenon@tenon') === false)
  } catch {
    return false
  }
}

export function detectNativeHostTargets(hostHome: string): { status: number; body: unknown } {
  const hosts = [
    {
      id: 'codex' as const,
      configSegments: ['.codex'],
      pluginSegments: ['.codex', 'plugins', 'cache', 'tenon', 'tenon'],
      markerSegments: ['.codex-plugin', 'plugin.json'],
      active: codexPluginEnabled,
    },
    {
      id: 'claude' as const,
      configSegments: ['.claude'],
      pluginSegments: ['.claude', 'plugins', 'cache', 'tenon', 'tenon'],
      markerSegments: ['.claude-plugin', 'plugin.json'],
      active: claudePluginEnabled,
    },
  ]
  const detectedHosts = hosts
    .filter((host) => isDirectoryBelowHostHome(hostHome, host.configSegments))
    .map((host) => host.id)
  const pluginHost = hosts.find((host) => host.active(hostHome)
    && hasInstalledPlugin(hostHome, host.pluginSegments, host.markerSegments))
  const recommendedHost = pluginHost?.id ?? detectedHosts[0] ?? null
  return {
    status: 200,
    body: {
      schema_version: 'host-target-detection/v1',
      detected_hosts: detectedHosts,
      recommended_host: recommendedHost,
      recommended_operation: pluginHost !== undefined ? 'update' : recommendedHost !== null ? 'setup' : null,
      reason: pluginHost !== undefined ? 'tenon-plugin-detected' : recommendedHost !== null ? 'host-detected' : 'none',
    },
  }
}
