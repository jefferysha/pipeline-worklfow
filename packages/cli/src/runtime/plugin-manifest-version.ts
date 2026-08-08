const STABLE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u

export type PluginManifestVersionResult =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly detail: string }

function versionFromManifest(raw: string | undefined, label: string): PluginManifestVersionResult {
  if (raw === undefined) return { ok: false, detail: `${label} 缺失` }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, detail: `${label} 不是合法 JSON` }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, detail: `${label} 不是对象` }
  }
  const version = (value as Record<string, unknown>).version
  if (typeof version !== 'string' || !STABLE_VERSION.test(version)) {
    return { ok: false, detail: `${label} 缺少完整稳定 SemVer version` }
  }
  return { ok: true, version }
}

/** Both native host manifests are one release identity; neither is a compatibility fallback. */
export function decodePluginManifestVersion(input: {
  readonly codex: string | undefined
  readonly claude: string | undefined
}): PluginManifestVersionResult {
  const codex = versionFromManifest(input.codex, '.codex-plugin/plugin.json')
  if (!codex.ok) return codex
  const claude = versionFromManifest(input.claude, '.claude-plugin/plugin.json')
  if (!claude.ok) return claude
  if (codex.version !== claude.version) {
    return {
      ok: false,
      detail: `Codex/Claude plugin manifest version 不一致：${codex.version} != ${claude.version}`,
    }
  }
  return { ok: true, version: codex.version }
}
