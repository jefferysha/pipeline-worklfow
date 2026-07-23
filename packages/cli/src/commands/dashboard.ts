/**
 * Launch the dashboard that ships inside the plugin release.
 *
 * This deliberately does not use `npx`, a workspace package install, or source TypeScript.  A
 * marketplace installation contains the pre-built server bundle and SPA, so a freshly installed
 * user can start the complete product through the same `pipeline` launcher.
 */
import { spawn } from 'node:child_process'
import { accessSync, constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import { REAL_SETUP_ENV, resolvePipelineRoot } from './setup.js'

export interface DashboardOpts {
  port?: string
  dryRun?: boolean
}

export interface DashboardRuntime {
  resolveRoot(): string
  fileExists(path: string): boolean
  launch(serverBundle: string, env: NodeJS.ProcessEnv): Promise<number>
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
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [serverBundle], { stdio: 'inherit', env })
    child.once('error', () => resolve(1))
    child.once('exit', (code) => resolve(code ?? 1))
  })
}

export const REAL_DASHBOARD_RUNTIME: DashboardRuntime = {
  resolveRoot: () => resolvePipelineRoot(REAL_SETUP_ENV),
  fileExists,
  launch,
}

function parsePort(raw: string | undefined): number | null {
  if (raw === undefined) return null
  if (!/^[1-9][0-9]{0,4}$/.test(raw)) return null
  const port = Number.parseInt(raw, 10)
  return port <= 65_535 ? port : null
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
  const serverBundle = join(root, 'packages', 'server', 'dist', 'dashboard.mjs')
  const webIndex = join(root, 'packages', 'dashboard-app', 'dist', 'index.html')
  const missing = [serverBundle, webIndex].filter((path) => !runtime.fileExists(path))
  if (missing.length > 0) {
    deps.io.err(
      `ERROR: 当前 pipeline 插件缺少已发布 dashboard 资产：${missing.join('、')}。` +
      '请运行 pipeline update --codex（或 --claude）恢复完整插件包。',
    )
    return 1
  }

  const inheritedPort = parsePort(process.env.PIPELINE_DASHBOARD_PORT)
  const port = explicitPort ?? inheritedPort ?? 8765
  deps.io.out(`[dashboard] 使用插件内置 SPA + server bundle 启动单一入口：http://127.0.0.1:${port}/`)
  deps.io.out(`[dashboard] server: ${serverBundle}`)
  deps.io.out(`[dashboard] web: ${webIndex}`)
  if (opts.dryRun) {
    deps.io.out('[dashboard] --dry-run：未启动 server。')
    return 0
  }

  const env: NodeJS.ProcessEnv = { ...process.env }
  if (explicitPort !== null) env.PIPELINE_DASHBOARD_PORT = String(explicitPort)
  // A malformed inherited variable would otherwise be passed through while the printed endpoint
  // says 8765.  Remove it so the server and the launcher agree on the documented default.
  else if (inheritedPort === null) delete env.PIPELINE_DASHBOARD_PORT
  const code = await runtime.launch(serverBundle, env)
  if (code !== 0) deps.io.err(`[dashboard] server 退出，code=${code}`)
  return code
}
