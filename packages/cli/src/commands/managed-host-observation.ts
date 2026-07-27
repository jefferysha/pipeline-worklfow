import { isAbsolute, join, normalize } from 'node:path'
import { ManagedRuntimeIndeterminateError } from '../runtime/installer.js'
import {
  TENON_MARKETPLACE_NAME,
  TENON_MARKETPLACE_SOURCE,
  TENON_PLUGIN_NAME,
  type NativePipelineHost,
} from './plugin-host.js'
import type { SetupEnv } from './setupEnvironment.js'

interface TenonMarketplaceState {
  readonly root: string
  readonly source: string
  readonly sourceType: string
  readonly head: string | null
}

interface TenonPluginState {
  readonly id: string
  readonly version: string
  readonly root: string
}

interface NativeHostObservation {
  readonly version: 1
  readonly host: NativePipelineHost
  readonly marketplace: TenonMarketplaceState | null
  readonly plugin: TenonPluginState | null
}

type NativeHostDesired =
  | {
      readonly version: 1
      readonly kind: 'marketplace-present'
      readonly source: string
      readonly root: string | null
      readonly sourceType: string
      readonly head: string
    }
  | {
      readonly version: 1
      readonly kind: 'marketplace-head'
      readonly marketplace: TenonMarketplaceState
      readonly head: string
    }
  | {
      readonly version: 1
      readonly kind: 'plugin-version'
      readonly marketplace: TenonMarketplaceState
      readonly pluginRoot: string | null
      readonly pluginVersion: string
    }

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ManagedRuntimeIndeterminateError(`${label} 不是合法 JSON`)
  }
}

function commandJson(env: SetupEnv, cmd: string, args: string[], label: string): unknown {
  const result = env.runCommand(cmd, args)
  if (result.code !== 0) {
    throw new ManagedRuntimeIndeterminateError(
      `${label} 读取失败：${result.stderr.trim() || `退出码 ${result.code}`}`,
    )
  }
  return parseJson(result.stdout, label)
}

function marketplaceState(
  env: SetupEnv,
  host: NativePipelineHost,
  value: unknown,
): TenonMarketplaceState | null {
  const entries = host === 'codex'
    ? (typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && Array.isArray((value as { marketplaces?: unknown }).marketplaces)
      ? (value as { marketplaces: unknown[] }).marketplaces
      : null)
    : (Array.isArray(value) ? value : null)
  if (entries === null) {
    throw new ManagedRuntimeIndeterminateError(`${host} marketplace inventory schema 非法`)
  }
  const matches: TenonMarketplaceState[] = []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ManagedRuntimeIndeterminateError(`${host} marketplace inventory entry 非法`)
    }
    const item = entry as Record<string, unknown>
    if (item.name !== TENON_MARKETPLACE_NAME) continue
    const root = host === 'codex' ? item.root : item.installLocation
    const sourceRecord = host === 'codex' && typeof item.marketplaceSource === 'object'
      && item.marketplaceSource !== null
      ? item.marketplaceSource as Record<string, unknown>
      : null
    const source = host === 'codex' ? sourceRecord?.source : item.repo
    const sourceType = host === 'codex' ? sourceRecord?.sourceType : item.source
    if (typeof root !== 'string'
      || !isAbsolute(root)
      || normalize(root) !== root
      || typeof source !== 'string'
      || source === ''
      || typeof sourceType !== 'string'
      || sourceType === '') {
      throw new ManagedRuntimeIndeterminateError(`${host} tenon marketplace identity 不完整`)
    }
    const headResult = env.runCommand('git', ['-C', root, 'rev-parse', 'HEAD'])
    const head = headResult.code === 0 && /^[a-f0-9]{40}$/.test(headResult.stdout.trim())
      ? headResult.stdout.trim()
      : null
    matches.push({ root, source, sourceType, head })
  }
  if (matches.length > 1) {
    throw new ManagedRuntimeIndeterminateError(`${host} tenon marketplace identity 重复`)
  }
  return matches[0] ?? null
}

function pluginState(host: NativePipelineHost, value: unknown): TenonPluginState | null {
  const entries = host === 'codex'
    ? (typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && Array.isArray((value as { installed?: unknown }).installed)
      ? (value as { installed: unknown[] }).installed
      : null)
    : (Array.isArray(value) ? value : null)
  if (entries === null) throw new ManagedRuntimeIndeterminateError(`${host} plugin inventory schema 非法`)
  const expectedId = `${TENON_PLUGIN_NAME}@${TENON_MARKETPLACE_NAME}`
  const matches: TenonPluginState[] = []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ManagedRuntimeIndeterminateError(`${host} plugin inventory entry 非法`)
    }
    const item = entry as Record<string, unknown>
    const id = host === 'codex' ? item.pluginId : item.id
    if (id !== expectedId) continue
    if (item.enabled !== undefined && typeof item.enabled !== 'boolean') {
      throw new ManagedRuntimeIndeterminateError(`${host} tenon plugin enabled 状态非法`)
    }
    if (item.enabled === false) {
      throw new ManagedRuntimeIndeterminateError(`${host} tenon plugin identity 未启用`)
    }
    const root = host === 'codex'
      && typeof item.source === 'object'
      && item.source !== null
      ? (item.source as Record<string, unknown>).path
      : item.installPath
    if (typeof item.version !== 'string'
      || typeof root !== 'string'
      || !isAbsolute(root)
      || normalize(root) !== root) {
      throw new ManagedRuntimeIndeterminateError(`${host} tenon plugin identity 不完整`)
    }
    matches.push({ id, version: item.version, root })
  }
  if (matches.length > 1) {
    throw new ManagedRuntimeIndeterminateError(`${host} tenon plugin identity 重复`)
  }
  return matches[0] ?? null
}

export function observeNativeHost(
  env: SetupEnv,
  host: NativePipelineHost,
): string {
  const marketplace = marketplaceState(
    env,
    host,
    commandJson(env, host, ['plugin', 'marketplace', 'list', '--json'], `${host} marketplace inventory`),
  )
  const plugin = pluginState(
    host,
    commandJson(env, host, ['plugin', 'list', '--json'], `${host} plugin inventory`),
  )
  return JSON.stringify({ version: 1, host, marketplace, plugin } satisfies NativeHostObservation)
}

function decodeObservation(value: string): NativeHostObservation {
  const parsed = parseJson(value, 'managed host observation')
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ManagedRuntimeIndeterminateError('managed host observation schema 非法')
  }
  return parsed as NativeHostObservation
}

function pluginVersionAtMarketplace(env: SetupEnv, marketplace: TenonMarketplaceState): string {
  const candidates = [
    join(marketplace.root, '.codex-plugin', 'plugin.json'),
    join(marketplace.root, '.claude-plugin', 'plugin.json'),
    join(marketplace.root, 'package.json'),
  ]
  for (const path of candidates) {
    const text = env.readText(path)
    if (text === undefined) continue
    const value = parseJson(text, path)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)
      && typeof (value as { version?: unknown }).version === 'string') {
      return (value as { version: string }).version
    }
  }
  throw new ManagedRuntimeIndeterminateError('无法从 tenon marketplace 解析目标 plugin version')
}

function remoteMainHead(env: SetupEnv): string {
  const result = env.runCommand('git', [
    'ls-remote',
    `https://github.com/${TENON_MARKETPLACE_SOURCE}.git`,
    'refs/heads/main',
  ])
  const head = result.code === 0 ? result.stdout.trim().split(/\s+/)[0] : undefined
  if (head === undefined || !/^[a-f0-9]{40}$/.test(head)) {
    throw new ManagedRuntimeIndeterminateError('无法解析 tenon marketplace 远端 main revision')
  }
  return head
}

function isCanonicalMarketplaceSource(source: string): boolean {
  return source === TENON_MARKETPLACE_SOURCE
    || source === `https://github.com/${TENON_MARKETPLACE_SOURCE}`
    || source === `https://github.com/${TENON_MARKETPLACE_SOURCE}.git`
}

function isCanonicalRemoteMarketplace(
  env: SetupEnv,
  host: NativePipelineHost,
  marketplace: TenonMarketplaceState,
): boolean {
  const expectedSourceType = host === 'codex' ? 'git' : 'github'
  if (marketplace.sourceType !== expectedSourceType || marketplace.head === null) return false
  const result = env.runCommand('git', ['-C', marketplace.root, 'remote', 'get-url', 'origin'])
  return result.code === 0 && isCanonicalMarketplaceSource(result.stdout.trim())
}

function hasMarketplaceIdentity(
  current: TenonMarketplaceState | null,
  expected: TenonMarketplaceState,
): current is TenonMarketplaceState {
  return current !== null
    && current.root === expected.root
    && current.source === expected.source
    && current.sourceType === expected.sourceType
}

export function desiredNativeHostPostcondition(
  env: SetupEnv,
  host: NativePipelineHost,
  stepId: string,
): {
  readonly serialized: string
  isDesired(observation: string): boolean
} {
  const before = decodeObservation(observeNativeHost(env, host))
  let desired: NativeHostDesired
  if (stepId === 'marketplace-register') {
    desired = {
      version: 1,
      kind: 'marketplace-present',
      source: TENON_MARKETPLACE_SOURCE,
      root: before.marketplace?.root ?? null,
      sourceType: host === 'codex' ? 'git' : 'github',
      head: remoteMainHead(env),
    }
  } else if (stepId === 'marketplace-refresh') {
    if (before.marketplace === null) {
      throw new ManagedRuntimeIndeterminateError('marketplace refresh 前缺少 tenon marketplace')
    }
    if (before.marketplace.sourceType === 'local') {
      desired = {
        version: 1,
        kind: 'marketplace-head',
        marketplace: before.marketplace,
        head: before.marketplace.head ?? 'local-marketplace',
      }
    } else {
      desired = {
        version: 1,
        kind: 'marketplace-head',
        marketplace: before.marketplace,
        head: remoteMainHead(env),
      }
    }
  } else {
    if (before.marketplace === null) {
      throw new ManagedRuntimeIndeterminateError('plugin mutation 前缺少 tenon marketplace')
    }
    desired = {
      version: 1,
      kind: 'plugin-version',
      marketplace: before.marketplace,
      pluginRoot: before.plugin?.root ?? (host === 'codex' ? before.marketplace.root : null),
      pluginVersion: pluginVersionAtMarketplace(env, before.marketplace),
    }
  }
  return {
    serialized: JSON.stringify(desired),
    isDesired(observation) {
      const current = decodeObservation(observation)
      if (desired.kind === 'marketplace-present') {
        return current.marketplace !== null
          && isCanonicalMarketplaceSource(current.marketplace.source)
          && isCanonicalRemoteMarketplace(env, host, current.marketplace)
          && current.marketplace.head === desired.head
          && (desired.root === null || current.marketplace.root === desired.root)
          && current.marketplace.sourceType === desired.sourceType
      }
      if (desired.kind === 'marketplace-head') {
        if (!hasMarketplaceIdentity(current.marketplace, desired.marketplace)) return false
        return desired.head === 'local-marketplace'
          ? current.marketplace.head === desired.marketplace.head
          : current.marketplace.head === desired.head
      }
      return hasMarketplaceIdentity(current.marketplace, desired.marketplace)
        && (desired.pluginRoot === null || current.plugin?.root === desired.pluginRoot)
        && current.plugin?.version === desired.pluginVersion
    },
  }
}
