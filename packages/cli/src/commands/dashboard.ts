/**
 * Launch the dashboard that ships inside the plugin release.
 *
 * This deliberately does not use `npx`, a workspace package install, or source TypeScript. A
 * marketplace installation contains the pre-built server bundle and SPA, so a freshly installed
 * user can start the complete product through the same `tenon` launcher.
 */
import { spawn } from 'node:child_process'
import { accessSync, constants as fsConstants, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { machineStateScopeId } from '@tenon/kernel'
import type { CliDeps } from '../deps.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import {
  DashboardTerminationUnconfirmedError,
  launchDetachedDashboardProcess,
  type DashboardProcessHandle,
} from './dashboard-process.js'
import { waitForHealthyServer } from './dashboard-health.js'

export {
  DashboardTerminationUnconfirmedError,
  type DashboardProcessHandle,
} from './dashboard-process.js'

/** One production endpoint for the bundled SPA and its API. */
export const DEFAULT_DASHBOARD_PORT = 18765

export interface DashboardOpts {
  port?: string
  dryRun?: boolean
  /** Start the server as the managed background service instead of attaching this terminal. */
  background?: boolean
  /** Open the local dashboard after the managed server has passed its health check. */
  open?: boolean
}

export interface DashboardRuntime {
  resolveRoot(): string
  fileExists(path: string): boolean
  launch(serverBundle: string, env: NodeJS.ProcessEnv): Promise<number>
  launchDetached(serverBundle: string, env: NodeJS.ProcessEnv): Promise<DashboardProcessHandle | null>
  resolveStateScopeId(): string
  waitForHealthyServer(
    port: number,
    expectedReleaseId: string | undefined,
    expectedStateScopeId: string,
  ): Promise<boolean>
  openBrowser(url: string): Promise<boolean>
}

function fileExists(path: string): boolean {
  try {
    accessSync(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

function launch(serverBundle: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolveCode) => {
    const child = spawn(process.execPath, [serverBundle], { stdio: 'inherit', env })
    child.once('error', () => resolveCode(1))
    child.once('exit', (code) => resolveCode(code ?? 1))
  })
}

/** Opens a URL through the platform's registered browser without shell interpolation. */
function openBrowser(url: string): Promise<boolean> {
  const command = process.platform === 'darwin'
    ? { file: 'open', args: [url] }
    : process.platform === 'win32'
      ? { file: 'cmd.exe', args: ['/c', 'start', '', url] }
      : { file: 'xdg-open', args: [url] }
  return new Promise((resolveOpened) => {
    let settled = false
    const finish = (opened: boolean): void => {
      if (settled) return
      settled = true
      resolveOpened(opened)
    }
    const child = spawn(command.file, command.args, { detached: true, stdio: 'ignore' })
    child.once('error', () => finish(false))
    child.once('spawn', () => {
      child.unref()
      finish(true)
    })
  })
}

/** Resolve the active payload root without consulting the caller's project directory. */
function resolveDashboardRoot(): string {
  const declared = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT
  if (declared !== undefined && declared.trim() !== '') return declared
  const candidate = resolve(process.argv[1] ?? '')
  try {
    return resolve(dirname(realpathSync(candidate)), '..', '..', '..')
  } catch {
    return resolve(dirname(candidate), '..', '..', '..')
  }
}

export const REAL_DASHBOARD_RUNTIME: DashboardRuntime = {
  resolveRoot: resolveDashboardRoot,
  fileExists,
  launch,
  launchDetached: launchDetachedDashboardProcess,
  resolveStateScopeId: () =>
    machineStateScopeId(resolveRuntimePaths({ env: process.env, homeDir: homedir() }).stateRoot),
  waitForHealthyServer,
  openBrowser,
}

function parsePort(raw: string | undefined): number | null {
  if (raw === undefined) return null
  if (!/^[1-9][0-9]{0,4}$/.test(raw)) return null
  const port = Number.parseInt(raw, 10)
  return port <= 65_535 ? port : null
}

interface DashboardAssets {
  readonly serverBundle: string
  readonly webIndex: string
}

function packagedAssets(runtime: DashboardRuntime, root: string): DashboardAssets | string[] {
  const serverBundle = join(root, 'packages', 'server', 'dist', 'dashboard.mjs')
  const webIndex = join(root, 'packages', 'dashboard-app', 'dist', 'index.html')
  const missing = [serverBundle, webIndex].filter((path) => !runtime.fileExists(path))
  return missing.length === 0 ? { serverBundle, webIndex } : missing
}

function isDashboardAssets(value: DashboardAssets | string[]): value is DashboardAssets {
  return !Array.isArray(value)
}

function dashboardEnvironment(port: number): NodeJS.ProcessEnv {
  return { ...process.env, TENON_DASHBOARD_PORT: String(port) }
}

export interface ReleasedDashboardOptions {
  /** Defaults to the single production dashboard port. */
  readonly port?: number
  /** A user-facing setup may request a browser; background updates intentionally do not. */
  readonly openBrowser?: boolean
}

export interface ReleasedDashboardStarter {
  start(
    deps: CliDeps,
    payloadRoot: string,
    opts: ReleasedDashboardOptions,
  ): Promise<ReleasedDashboardStartOutcome>
}

export type ReleasedDashboardStartOutcome =
  | { readonly state: 'ready' }
  | { readonly state: 'failed'; readonly detail: string }
  | { readonly state: 'indeterminate'; readonly detail: string }

async function stopFailedCandidate(
  deps: CliDeps,
  child: DashboardProcessHandle,
  detail: string,
): Promise<ReleasedDashboardStartOutcome> {
  try {
    await child.terminate()
  } catch (error) {
    const terminationDetail = error instanceof Error ? error.message : String(error)
    deps.io.err(`[dashboard] ${detail}，且终止状态无法确认：${terminationDetail}`)
    return {
      state: 'indeterminate',
      detail: error instanceof DashboardTerminationUnconfirmedError
        ? error.message
        : new DashboardTerminationUnconfirmedError(terminationDetail).message,
    }
  }
  deps.io.err(`[dashboard] ${detail}；候选进程已确认退出，未打开浏览器。`)
  return { state: 'failed', detail: `${detail}; candidate exit confirmed` }
}

async function startManagedDashboard(
  deps: CliDeps,
  payloadRoot: string,
  opts: ReleasedDashboardOptions,
  runtime: DashboardRuntime,
  expectedReleaseId?: string,
): Promise<ReleasedDashboardStartOutcome> {
  const port = opts.port ?? DEFAULT_DASHBOARD_PORT
  const assets = packagedAssets(runtime, payloadRoot)
  if (!isDashboardAssets(assets)) {
    deps.io.err(
      `ERROR: 当前 Tenon 插件缺少已发布 dashboard 资产：${assets.join('、')}。` +
      '请运行 tenon update --codex（或 --claude）恢复完整插件包。',
    )
    return { state: 'failed', detail: 'released Dashboard assets are incomplete' }
  }
  let child: DashboardProcessHandle | null
  try {
    child = await runtime.launchDetached(assets.serverBundle, dashboardEnvironment(port))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    deps.io.err(`[dashboard] 候选 server 启动结果无法确认：${detail}`)
    return { state: 'indeterminate', detail: `candidate Dashboard spawn state is unknown: ${detail}` }
  }
  if (child === null) {
    deps.io.err('[dashboard] 受管 server 进程无法启动；runtime 已保留，可运行 tenon dashboard 诊断。')
    return { state: 'failed', detail: 'candidate Dashboard process could not be spawned' }
  }
  let healthy: boolean
  try {
    const expectedStateScopeId = runtime.resolveStateScopeId()
    healthy = await runtime.waitForHealthyServer(port, expectedReleaseId, expectedStateScopeId)
  } catch (error) {
    return stopFailedCandidate(
      deps,
      child,
      `候选 server readiness 抛出异常：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!healthy) {
    return stopFailedCandidate(
      deps,
      child,
      `受管 server 在 http://127.0.0.1:${port}/ 未通过健康检查`,
    )
  }
  const url = `http://127.0.0.1:${port}/`
  deps.io.out(`[dashboard] 受管服务健康检查通过：${url}`)
  let browserOpened = true
  try {
    if (opts.openBrowser === true) browserOpened = await runtime.openBrowser(url)
  } catch {
    browserOpened = false
  }
  if (!browserOpened) {
    // Browser policy/headless hosts can reject an OS open request even though the product is up.
    // The validated URL remains actionable, so do not roll back a healthy immutable runtime.
    deps.io.err(`[dashboard] 无法自动打开浏览器；请在浏览器访问 ${url}`)
  }
  return { state: 'ready' }
}

/**
 * Start a dashboard from the exact immutable payload selected by setup/update. It is deliberately
 * separate from `cmdDashboard` so activation never races the mutable marketplace checkout.
 */
export async function startReleasedDashboard(
  deps: CliDeps,
  payloadRoot: string,
  opts: ReleasedDashboardOptions,
  runtime: DashboardRuntime = REAL_DASHBOARD_RUNTIME,
): Promise<ReleasedDashboardStartOutcome> {
  const expectedReleaseId = basename(payloadRoot) === 'payload' ? basename(dirname(payloadRoot)) : ''
  if (!/^sha256-[a-f0-9]{64}$/.test(expectedReleaseId)) {
    deps.io.err('[dashboard] 受管 payload 缺少合法 content-addressed release identity；拒绝启动。')
    return { state: 'failed', detail: 'managed payload has no content-addressed release identity' }
  }
  return startManagedDashboard(deps, payloadRoot, opts, runtime, expectedReleaseId)
}

export const REAL_RELEASED_DASHBOARD_STARTER: ReleasedDashboardStarter = {
  start: (deps, payloadRoot, opts) => startReleasedDashboard(deps, payloadRoot, opts),
}

/** Restore the previous immutable Dashboard after managed activation compensation. */
export async function restorePreviousReleasedDashboard(
  deps: CliDeps,
  activation: import('../runtime/types.js').RuntimeActivation,
  starter: ReleasedDashboardStarter,
): Promise<ReleasedDashboardStartOutcome> {
  const previousRelease = activation.selection.previousRelease
  if (previousRelease === null) return { state: 'ready' }
  const payloadRoot = join(dirname(activation.releaseRoot), previousRelease, 'payload')
  return starter.start(deps, payloadRoot, { openBrowser: false })
}

/** Start the released single-entry dashboard, or print its exact packaged plan in dry-run mode. */
export async function cmdDashboard(
  deps: CliDeps,
  opts: DashboardOpts,
  runtime: DashboardRuntime = REAL_DASHBOARD_RUNTIME,
): Promise<number> {
  const explicitPort = opts.port === undefined ? null : parsePort(opts.port)
  if (opts.port !== undefined && explicitPort === null) {
    deps.io.err('ERROR: --port 必须是 1 到 65535 的整数。')
    return 1
  }

  const root = runtime.resolveRoot()
  const assets = packagedAssets(runtime, root)
  if (!isDashboardAssets(assets)) {
    deps.io.err(
      `ERROR: 当前 Tenon 插件缺少已发布 dashboard 资产：${assets.join('、')}。` +
      '请运行 tenon update --codex（或 --claude）恢复完整插件包。',
    )
    return 1
  }

  const inheritedPort = parsePort(process.env.TENON_DASHBOARD_PORT)
  const port = explicitPort ?? inheritedPort ?? DEFAULT_DASHBOARD_PORT
  deps.io.out(`[dashboard] 使用插件内置 SPA + server bundle 启动单一入口：http://127.0.0.1:${port}/`)
  deps.io.out(`[dashboard] server: ${assets.serverBundle}`)
  deps.io.out(`[dashboard] web: ${assets.webIndex}`)
  if (opts.dryRun) {
    deps.io.out('[dashboard] --dry-run：未启动 server。')
    return 0
  }

  // Browser opening is meaningful only after readiness; make `--open` imply the safe managed
  // background mode rather than racing a foreground server startup.
  if (opts.background === true || opts.open === true) {
    return (await startManagedDashboard(
      deps,
      root,
      { port, openBrowser: opts.open === true },
      runtime,
    )).state === 'ready' ? 0 : 1
  }

  const code = await runtime.launch(assets.serverBundle, dashboardEnvironment(port))
  if (code !== 0) deps.io.err(`[dashboard] server 退出，code=${code}`)
  return code
}
