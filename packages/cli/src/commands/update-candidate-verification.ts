import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import type { SetupEnv } from './setupEnvironment.js'

function candidateVersion(env: SetupEnv, root: string): string | null {
  for (const path of [
    join(root, '.codex-plugin', 'plugin.json'),
    join(root, '.claude-plugin', 'plugin.json'),
    join(root, 'package.json'),
  ]) {
    const text = env.readText(path)
    if (text === undefined) continue
    try {
      const value: unknown = JSON.parse(text)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)
        && typeof (value as { version?: unknown }).version === 'string') {
        return (value as { version: string }).version
      }
    } catch {
      return null
    }
  }
  return null
}

export function verifyUpdatedRoot(
  deps: CliDeps,
  env: SetupEnv,
  root: string,
  targetVersion?: string,
): boolean {
  const result = env.runCommand('bash', [join(root, 'tools', 'verify-skills.sh'), '--quiet', '--root', root])
  if (result.code === 0) {
    const version = candidateVersion(env, root)
    if (version !== null && (targetVersion === undefined || version === targetVersion)) return true
    deps.io.err(`ERROR: 新插件版本 ${version ?? 'unknown'} 与目标稳定版本 ${targetVersion} 不一致，保持原 launcher。`)
    return false
  }
  deps.io.err(`ERROR: 新插件资产校验失败，保持原 launcher：${result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`}`)
  return false
}
