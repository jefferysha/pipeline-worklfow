/**
 * Release update command for the one packaged Tenon plugin.
 *
 * Codex and Claude own their marketplace/cache lifecycles, so this command only asks the selected
 * host to refresh and reinstall its own plugin.  Other supported runtimes are adapters rather than
 * marketplaces; for them `update` deliberately re-applies the adapter from the already updated
 * package instead of falsely claiming to fetch a release from that host.
 */
import { isAbsolute, join } from 'node:path'
import type { CliDeps } from '../deps.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import { REAL_RELEASED_DASHBOARD_STARTER, type ReleasedDashboardStarter } from './dashboard.js'
import {
  hostFlag,
  installedPipelineRoot,
  isNativePipelineHost,
  TENON_MARKETPLACE_NAME,
  TENON_PLUGIN_NAME,
  selectPipelineHost,
  type HostCommandPlanItem,
  type PipelineHost,
  type PipelineHostFlags,
} from './plugin-host.js'
import { cmdSetupHost, type SetupEnv, REAL_SETUP_ENV } from './setup.js'
import { publishManagedRelease } from './release-coordinator.js'
import { resolveRuntimePaths } from '../runtime/paths.js'

export interface UpdateOpts extends PipelineHostFlags {
  dryRun?: boolean
  yes?: boolean
  auto?: boolean
  target?: string
}

export function nativeUpdatePlan(host: Extract<PipelineHost, 'codex' | 'claude'>): readonly HostCommandPlanItem[] {
  if (host === 'codex') {
    return [
      { cmd: 'codex', args: ['plugin', 'marketplace', 'upgrade', TENON_MARKETPLACE_NAME, '--json'] },
      { cmd: 'codex', args: ['plugin', 'add', `${TENON_PLUGIN_NAME}@${TENON_MARKETPLACE_NAME}`, '--json'] },
      { cmd: 'codex', args: ['plugin', 'list', '--json'] },
    ]
  }
  return [
    { cmd: 'claude', args: ['plugin', 'marketplace', 'update', TENON_MARKETPLACE_NAME] },
    { cmd: 'claude', args: ['plugin', 'update', `${TENON_PLUGIN_NAME}@${TENON_MARKETPLACE_NAME}`] },
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
  // `tenon` is a user-level launcher and its cwd is normally the target project, not the
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

type HostBoundaryState = 'in-progress' | 'committed'
type ManagedBoundaryState = 'unchanged' | 'restored' | 'indeterminate'

function boundaryDetail(
  hostState: HostBoundaryState,
  managedState: ManagedBoundaryState,
  detail: string,
): string {
  return `host=${hostState}; managed=${managedState}; ${detail}`
}

function reportHostBoundary(deps: CliDeps, host: PipelineHost, state: HostBoundaryState): void {
  if (state === 'committed') {
    deps.io.err(
      `[update] 宿主插件缓存已由 ${host === 'codex' ? 'Codex' : 'Claude'} 更新；` +
      'Tenon 未回滚宿主私有缓存，当前会话仍使用其已加载版本。',
    )
    return
  }
  deps.io.err(
    `[update] ${hostFlag(host)} 宿主更新在 inventory 提交确认前失败；` +
    '宿主私有缓存状态由宿主 CLI 管理，Tenon 未直接写入或恢复该缓存。',
  )
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
    deps.io.err(`ERROR: ${selection.error}。示例：tenon update --codex`)
    return 1
  }
  const host = selection.host
  if (!isNativePipelineHost(host)) {
    deps.io.out(`[update] ${hostFlag(host)} 没有独立 marketplace；从当前已更新的 Tenon 包重新部署 adapter。`)
    return cmdSetupHost(deps, host, { ...opts, autoUpdate: false }, env, installer, dashboardStarter, opts.auto !== true)
  }

  const plan = nativeUpdatePlan(host)
  renderPlan(deps, host, plan)
  if (opts.dryRun) {
    deps.io.out('[update] --dry-run:未刷新 marketplace、未重装插件、未切换 launcher。')
    return 0
  }

  let inventory = ''
  let hostBoundary: HostBoundaryState = 'in-progress'
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index]!
    const result = env.runCommand(item.cmd, [...item.args])
    if (result.stdout.trim() !== '' && !opts.auto) deps.io.out(result.stdout.trimEnd())
    if (result.code !== 0) {
      if (host === 'codex' && index === 0 && isLocalCodexMarketplaceUpgradeNoop(result)) {
        deps.io.out('[update] Codex 本地 marketplace 不需要 Git fetch；继续刷新 tenon 插件缓存。')
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
      reportHostBoundary(deps, host, hostBoundary)
      return rejectUpdate(installer, env, boundaryDetail(hostBoundary, 'unchanged', detail))
    }
    inventory = result.stdout
  }
  const root = installedPipelineRoot(host, inventory)
  if (root === null) {
    const detail = `${hostFlag(host)} 更新后未在宿主插件清单中找到 tenon；未切换 launcher。`
    deps.io.err(`ERROR: ${detail}`)
    reportHostBoundary(deps, host, hostBoundary)
    return rejectUpdate(installer, env, boundaryDetail(hostBoundary, 'unchanged', detail))
  }
  hostBoundary = 'committed'
  if (!verifyUpdatedRoot(deps, env, root)) {
    const detail = '宿主刷新后的 tenon 候选未通过打包资产校验'
    reportHostBoundary(deps, host, hostBoundary)
    return rejectUpdate(installer, env, boundaryDetail(hostBoundary, 'unchanged', detail))
  }
  return publishManagedRelease(
    deps,
    {
      candidateRoot: root,
      source: host,
      homeDir: env.homeDir(),
      openBrowser: opts.auto !== true,
    },
    installer,
    dashboardStarter,
  ).then(async (outcome) => {
      if (!outcome.ok) {
        deps.io.err(`ERROR: ${outcome.detail}`)
        reportHostBoundary(deps, host, hostBoundary)
        return rejectUpdate(installer, env, boundaryDetail(hostBoundary, outcome.state, outcome.detail))
      }
      const { activation } = outcome
      deps.io.out(`[update] 已原子切换至已验证 runtime: ${activation.release.releaseId}（revision ${activation.selection.revision}）。`)
      if (opts.auto) {
        deps.io.out(`[update] ${hostFlag(host)} 已在后台刷新；当前会话继续使用已加载版本，新会话将加载新 skills/hooks。`)
      } else {
        deps.io.out(`[update] ${hostFlag(host)} 已更新；稳定 tenon launcher 已保持不变，新会话将加载新 skills/hooks。`)
      }
      if (host === 'codex') {
        deps.io.out('[update] 若 Codex 将新版本 Tenon hook 标为未信任或已变更，请在 Codex 输入 /hooks 后重新信任；这是宿主的安全边界。')
      }
      reportRegisteredProjects(deps, env, activation.release.source.pluginVersion)
      return 0
    })
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function reportRegisteredProjects(deps: CliDeps, env: SetupEnv, pluginVersion: string): void {
  let registry: string | undefined
  try {
    registry = env.readText(resolveRuntimePaths({ homeDir: env.homeDir() }).registryPath)
  } catch {
    deps.io.err('[update] WARN: 项目注册表无法读取；未修改任何工作区。')
    return
  }
  if (registry === undefined) return
  let roots: unknown
  try {
    roots = JSON.parse(registry)
  } catch {
    deps.io.err('[update] WARN: 项目注册表无法解析；未修改任何工作区。')
    return
  }
  if (!Array.isArray(roots)) return
  const registeredRoots = [...new Set(
    roots.filter((root): root is string => typeof root === 'string' && isAbsolute(root)),
  )]
  const outdated = registeredRoots.filter((root) => {
    try {
      return env.readText(join(root, '.pipeline-version'))?.trim() !== pluginVersion
    } catch {
      return true
    }
  })
  if (outdated.length === 0) return
  deps.io.out(`[update] ${outdated.length} 个已登记项目需要显式同步（本次更新未写工作区）：`)
  for (const root of outdated) deps.io.out(`  cd ${shellQuote(root)} && tenon sync`)
}
