/**
 * Release update command for the one packaged pipeline plugin.
 *
 * Codex and Claude own their marketplace/cache lifecycles, so this command only asks the selected
 * host to refresh and reinstall its own plugin.  Other supported runtimes are adapters rather than
 * marketplaces; for them `update` deliberately re-applies the adapter from the already updated
 * package instead of falsely claiming to fetch a release from that host.
 */
import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import { REAL_RELEASED_DASHBOARD_STARTER, type ReleasedDashboardStarter } from './dashboard.js'
import {
  hostFlag,
  installedPipelineRoot,
  isNativePipelineHost,
  PIPELINE_MARKETPLACE_NAME,
  PIPELINE_PLUGIN_NAME,
  selectPipelineHost,
  type HostCommandPlanItem,
  type PipelineHost,
  type PipelineHostFlags,
} from './plugin-host.js'
import { cmdSetupHost, type SetupEnv, REAL_SETUP_ENV } from './setup.js'

export interface UpdateOpts extends PipelineHostFlags {
  dryRun?: boolean
  yes?: boolean
  auto?: boolean
  target?: string
}

export function nativeUpdatePlan(host: Extract<PipelineHost, 'codex' | 'claude'>): readonly HostCommandPlanItem[] {
  if (host === 'codex') {
    return [
      { cmd: 'codex', args: ['plugin', 'marketplace', 'upgrade', PIPELINE_MARKETPLACE_NAME, '--json'] },
      { cmd: 'codex', args: ['plugin', 'add', `${PIPELINE_PLUGIN_NAME}@${PIPELINE_MARKETPLACE_NAME}`, '--json'] },
      { cmd: 'codex', args: ['plugin', 'list', '--json'] },
    ]
  }
  return [
    { cmd: 'claude', args: ['plugin', 'marketplace', 'update', PIPELINE_MARKETPLACE_NAME] },
    { cmd: 'claude', args: ['plugin', 'update', `${PIPELINE_PLUGIN_NAME}@${PIPELINE_MARKETPLACE_NAME}`] },
    { cmd: 'claude', args: ['plugin', 'list', '--json'] },
  ]
}

function renderPlan(deps: CliDeps, host: PipelineHost, plan: readonly HostCommandPlanItem[]): void {
  deps.io.out(`[update] ${hostFlag(host)} 发布更新计划（只更新所选宿主）`)
  for (const item of plan) deps.io.out(`  $ ${item.cmd} ${item.args.join(' ')}`)
}

/** Hosts differ on whether reinstalling an already-installed plugin is exit 0 or an idempotent error. */
function isAlreadyInstalledResult(result: { readonly stdout: string; readonly stderr: string }): boolean {
  return /already|exists|installed|duplicate/i.test(`${result.stdout}\n${result.stderr}`)
}

/**
 * Codex exposes one refresh command for Git marketplaces only.  A configured local marketplace
 * is already reading its source directory, so the correct equivalent is to skip that fetch and
 * let the following `plugin add` rebuild Codex's installed plugin cache.  Do not treat any other
 * marketplace error as a success: auth, network, and malformed-registry failures must still keep
 * the current managed runtime selected.
 */
function isLocalCodexMarketplaceUpgradeNoop(result: { readonly stdout: string; readonly stderr: string }): boolean {
  return /not configured as a Git marketplace/i.test(`${result.stdout}\n${result.stderr}`)
}

function verifyUpdatedRoot(deps: CliDeps, env: SetupEnv, root: string): boolean {
  // `pipeline` is a user-level launcher and its cwd is normally the target project, not the
  // plugin checkout.  Verify the freshly installed package using its own absolute asset path.
  const result = env.runCommand('bash', [join(root, 'tools', 'verify-skills.sh'), '--quiet', '--root', root])
  if (result.code === 0) return true
  deps.io.err(`ERROR: 新插件资产校验失败，保持原 launcher：${result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`}`)
  return false
}

function rejectUpdate(
  installer: RuntimeInstaller,
  env: SetupEnv,
  detail: string,
): number | Promise<number> {
  const record = installer.recordUpdateFailure?.(env.homeDir(), detail)
  if (record === undefined) return 1
  return record.then(() => 1).catch(() => 1)
}

export function cmdUpdate(
  deps: CliDeps,
  opts: UpdateOpts,
  env: SetupEnv = REAL_SETUP_ENV,
  installer: RuntimeInstaller = REAL_RUNTIME_INSTALLER,
  dashboardStarter: ReleasedDashboardStarter = REAL_RELEASED_DASHBOARD_STARTER,
): number | Promise<number> {
  const selection = selectPipelineHost(opts)
  if (selection.host === null) {
    deps.io.err(`ERROR: ${selection.error}。示例：pipeline update --codex`)
    return 1
  }
  const host = selection.host
  if (!isNativePipelineHost(host)) {
    deps.io.out(`[update] ${hostFlag(host)} 没有独立 marketplace；从当前已更新的 pipeline 包重新部署 adapter。`)
    return cmdSetupHost(deps, host, { ...opts, autoUpdate: false }, env, installer, dashboardStarter, opts.auto !== true)
  }

  const plan = nativeUpdatePlan(host)
  renderPlan(deps, host, plan)
  if (opts.dryRun) {
    deps.io.out('[update] --dry-run:未刷新 marketplace、未重装插件、未切换 launcher。')
    return 0
  }

  let inventory = ''
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index]!
    const result = env.runCommand(item.cmd, [...item.args])
    if (result.stdout.trim() !== '' && !opts.auto) deps.io.out(result.stdout.trimEnd())
    if (result.code !== 0) {
      if (host === 'codex' && index === 0 && isLocalCodexMarketplaceUpgradeNoop(result)) {
        deps.io.out('[update] Codex 本地 marketplace 不需要 Git fetch；继续刷新 pipeline-lite 插件缓存。')
        continue
      }
      // `plugin add` is the host's only cross-version reinstall primitive.  Some host releases
      // return a non-zero "already installed" result instead of treating it as idempotent.  In
      // that narrow case, inventory is the authoritative confirmation; network/auth/update errors
      // remain hard failures and never switch the launcher.
      if (index === 1 && isAlreadyInstalledResult(result)) {
        const inventoryItem = plan[plan.length - 1]!
        const inventoryResult = env.runCommand(inventoryItem.cmd, [...inventoryItem.args])
        const installedRoot = inventoryResult.code === 0
          ? installedPipelineRoot(host, inventoryResult.stdout)
          : null
        if (installedRoot !== null) {
          inventory = inventoryResult.stdout
          break
        }
      }
      const detail = `${item.cmd} ${item.args.join(' ')} 失败：${result.stderr.trim() || `退出码 ${result.code}`}`
      deps.io.err(`ERROR: ${detail}`)
      return rejectUpdate(installer, env, detail)
    }
    inventory = result.stdout
  }
  const root = installedPipelineRoot(host, inventory)
  if (root === null) {
    const detail = `${hostFlag(host)} 更新后未在宿主插件清单中找到 pipeline-lite；未切换 launcher。`
    deps.io.err(`ERROR: ${detail}`)
    return rejectUpdate(installer, env, detail)
  }
  if (!verifyUpdatedRoot(deps, env, root)) {
    return rejectUpdate(installer, env, '宿主刷新后的 pipeline-lite 候选未通过打包资产校验')
  }
  return installer.activate(root, host, env.homeDir())
    .then(async (activation) => {
      deps.io.out(`[update] 已原子切换至已验证 runtime: ${activation.release.releaseId}（revision ${activation.selection.revision}）。`)
      const dashboardCode = await dashboardStarter.start(
        deps,
        join(activation.releaseRoot, 'payload'),
        { openBrowser: opts.auto !== true },
      )
      if (dashboardCode !== 0) {
        const detail = 'runtime 已切换，但 dashboard 未能完成受管刷新；请运行 pipeline dashboard --background 诊断。'
        deps.io.err(`ERROR: ${detail}`)
        return rejectUpdate(installer, env, detail)
      }
      if (opts.auto) {
        deps.io.out(`[update] ${hostFlag(host)} 已在后台刷新；当前会话继续使用已加载版本，新会话将加载新 skills/hooks。`)
      } else {
        deps.io.out(`[update] ${hostFlag(host)} 已更新；稳定 pipeline launcher 已保持不变，新会话将加载新 skills/hooks。`)
      }
      if (host === 'codex') {
        deps.io.out('[update] 若 Codex 将新版本 pipeline hook 标为未信任或已变更，请在 Codex 输入 /hooks 后重新信任；这是宿主的安全边界。')
      }
      return 0
    })
    .catch((error: unknown) => {
      deps.io.err(`ERROR: 新版本 runtime 校验/发布失败，保留当前已验证 release：${error instanceof Error ? error.message : String(error)}`)
      return 1
    })
}
