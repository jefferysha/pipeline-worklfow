/**
 * Host selection shared by setup and update.
 *
 * A pipeline release is one package, but installation is deliberately host-scoped: selecting
 * Codex must never also mutate Claude (and vice versa).  Keep the list aligned with
 * adapters/registry.yaml; native plugin hosts are the two runtimes that own a marketplace.
 */
export const PIPELINE_HOSTS = [
  'codex',
  'claude',
  'cursor',
  'gemini',
  'copilot',
  'pi',
  'devin',
  'zed',
  'aider',
  'continue',
  'cline',
  'amp',
] as const

export type PipelineHost = (typeof PIPELINE_HOSTS)[number]
export type NativePipelineHost = Extract<PipelineHost, 'codex' | 'claude'>

/** The release marketplace is the distribution channel for the one packaged plugin. */
export const PIPELINE_MARKETPLACE_SOURCE = 'jefferysha/pipeline-worklfow'
export const PIPELINE_MARKETPLACE_NAME = 'pipeline-lite'
export const PIPELINE_PLUGIN_NAME = 'pipeline-lite'

export interface HostCommandPlanItem {
  readonly cmd: string
  readonly args: readonly string[]
}

export type PipelineHostFlags = Partial<Record<PipelineHost, boolean | undefined>>

export interface HostSelection {
  readonly host: PipelineHost | null
  readonly error: string | null
}

/** Exactly one host is required for a mutating setup/update action. */
export function selectPipelineHost(flags: PipelineHostFlags): HostSelection {
  const selected = PIPELINE_HOSTS.filter((host) => flags[host] === true)
  const host = selected[0]
  if (selected.length === 1 && host) return { host, error: null }
  if (selected.length === 0) {
    return {
      host: null,
      error: `必须指定一个宿主：${PIPELINE_HOSTS.map((host) => `--${host}`).join(' | ')}`,
    }
  }
  return {
    host: null,
    error: `一次只能指定一个宿主，当前同时选择：${selected.map((host) => `--${host}`).join('、')}`,
  }
}

export function isNativePipelineHost(host: PipelineHost): host is NativePipelineHost {
  return host === 'codex' || host === 'claude'
}

export function hostFlag(host: PipelineHost): `--${PipelineHost}` {
  return `--${host}`
}

/**
 * Bring a native host to the released plugin.  The final inventory command is intentional: cache
 * layouts are private implementation details, so callers must take the resolved installation root
 * from the host rather than assemble a path under ~/.codex or ~/.claude themselves.
 */
export function nativeInstallPlan(host: NativePipelineHost): readonly HostCommandPlanItem[] {
  if (host === 'codex') {
    return [
      { cmd: 'codex', args: ['plugin', 'marketplace', 'add', PIPELINE_MARKETPLACE_SOURCE, '--ref', 'main'] },
      { cmd: 'codex', args: ['plugin', 'add', `${PIPELINE_PLUGIN_NAME}@${PIPELINE_MARKETPLACE_NAME}`, '--json'] },
      { cmd: 'codex', args: ['plugin', 'list', '--json'] },
    ]
  }
  return [
    { cmd: 'claude', args: ['plugin', 'marketplace', 'add', PIPELINE_MARKETPLACE_SOURCE] },
    { cmd: 'claude', args: ['plugin', 'install', `${PIPELINE_PLUGIN_NAME}@${PIPELINE_MARKETPLACE_NAME}`] },
    { cmd: 'claude', args: ['plugin', 'list', '--json'] },
  ]
}

/** Parse the host-owned plugin inventory without assuming its cache directory layout. */
export function installedPipelineRoot(host: NativePipelineHost, stdout: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return null
  }
  if (host === 'codex') {
    const installed = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as { installed?: unknown }).installed
      : undefined
    if (!Array.isArray(installed)) return null
    for (const entry of installed) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const item = entry as { name?: unknown; marketplaceName?: unknown; source?: { path?: unknown } }
      if (
        item.name === PIPELINE_PLUGIN_NAME
        && item.marketplaceName === PIPELINE_MARKETPLACE_NAME
        && typeof item.source?.path === 'string'
      ) return item.source.path
    }
    return null
  }
  if (!Array.isArray(parsed)) return null
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const item = entry as { id?: unknown; installPath?: unknown }
    if (item.id === `${PIPELINE_PLUGIN_NAME}@${PIPELINE_MARKETPLACE_NAME}` && typeof item.installPath === 'string') {
      return item.installPath
    }
  }
  return null
}
