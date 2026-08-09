import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import { decodePluginManifestVersion } from '../runtime/plugin-manifest-version.js'
import { provenanceVerifierBinding } from './native-host-command-binding.js'
import type { SetupEnv } from './setupEnvironment.js'

export function verifyUpdatedRoot(
  deps: CliDeps,
  env: SetupEnv,
  root: string,
  targetVersion?: string,
): boolean {
  const provenance = provenanceVerifierBinding(env)
  const nodePath = provenance.nodePath || '<unavailable>'
  const result = provenance.run([
    join(root, 'tools', 'verify-skills.sh'), '--quiet', '--root', root, '--node', nodePath,
  ])
  if (result.code === 0) {
    const decoded = decodePluginManifestVersion({
      codex: env.readText(join(root, '.codex-plugin', 'plugin.json')),
      claude: env.readText(join(root, '.claude-plugin', 'plugin.json')),
    })
    if (decoded.ok && (targetVersion === undefined || decoded.version === targetVersion)) return true
    const actual = decoded.ok ? decoded.version : decoded.detail
    deps.io.err(`ERROR: 新插件版本 ${actual} 与目标稳定版本 ${targetVersion ?? 'unknown'} 不一致，保持原 launcher。`)
    return false
  }
  deps.io.err(`ERROR: 新插件资产校验失败，保持原 launcher：${result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`}`)
  return false
}
