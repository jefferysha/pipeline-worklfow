import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import type { SetupEnv } from './setupEnvironment.js'

export function verifyPackagedAssets(
  deps: CliDeps,
  env: SetupEnv,
  root: string,
  dryRun: boolean,
  silent = false,
): number {
  const nodePath = env.resolveTrustedCommandBinding?.('node')?.executable
    ?? env.resolveTrustedCommand?.('node')
    ?? process.execPath
  const command = [join(root, 'tools', 'verify-skills.sh'), '--quiet', '--root', root, '--node', nodePath]
  if (!silent) deps.io.out(`[setup] 插件资产校验: bash ${command.join(' ')}`)
  if (dryRun) return 0
  if (!env.pathExists(join(root, 'runtime', 'tenon-bootstrap.mjs'))) {
    if (!silent) deps.io.err('ERROR: 插件资产校验失败：缺少 runtime/tenon-bootstrap.mjs（该 marketplace release 不是完整可安装包）')
    return 1
  }
  const result = env.runCommand('bash', command)
  if (result.code === 0) {
    if (!silent) deps.io.out('[setup] 插件资产完整：hooks、manifests、runtime 与内置 skills 已通过校验。')
    return 0
  }
  if (!silent) deps.io.err(`ERROR: 插件资产校验失败：${result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`}`)
  return 1
}
