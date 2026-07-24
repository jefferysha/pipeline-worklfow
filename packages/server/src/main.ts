#!/usr/bin/env node
/**
 * bin 入口：全机唯一 Global dashboard server 的启动装配（B4 版本抢占 + B5 token 握手）。
 *
 * 启动序（对位老仓 dashboard-server.py main，但补上版本抢占与 token）：
 *   1. 解析机器级路径（~/.claude/...，可经 PIPELINE_DASHBOARD_HOME 覆盖）。
 *   2. 探测既有 :port 的 /api/health（含 version）→ decidePreemption：
 *        bind → 直接监听；reuse → 让位退出 0；preempt → SIGTERM 旧实例后监听。
 *   3. listen 固定端口（PIPELINE_DASHBOARD_PORT ?? 18765，绑 127.0.0.1）。
 *   4. 写 0600 token 握手文件（B5）+ pidfile（pid/port/version，供后来者抢占判定）。
 *   5. SIGTERM/SIGINT 优雅停：关 server + 清 pidfile。
 */
import { execFile } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTraceStore } from '@pipeline-lite/tap'
import { fingerprintWorkspace, machineStateScopeId } from '@pipeline-lite/kernel'
import { createDashboardServer } from './server.js'
import { resolveServerPaths } from './paths.js'
import { decidePreemption, preemptOldServer, probeHealth } from './preempt.js'
import { generateToken, writeTokenHandshake } from './token.js'
import { resolvePayloadReleaseId, resolveReleaseVersion } from './version.js'
import { resolveDashboardPort } from './port.js'

function serverPort(): number {
  return resolveDashboardPort(process.env.PIPELINE_DASHBOARD_PORT)
}

function cadencePollInterval(): number {
  const raw = Number.parseInt(process.env.PIPELINE_CADENCE_POLL_MS ?? '', 10)
  return Number.isSafeInteger(raw) && raw >= 100 ? raw : 30_000
}

/** dist/dashboard.mjs → 插件仓根（dist → server → packages → 根）。 */
function pluginRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

function manifestPath(): string {
  return join(pluginRoot(), 'templates', 'manifest.yaml')
}

function gitHeadSha(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd }, (_err, stdout) => resolve((stdout ?? '').trim()))
  })
}

async function main(): Promise<void> {
  const paths = resolveServerPaths()
  const host = '127.0.0.1'
  const port = serverPort()
  // Use the marketplace plugin manifest as the release truth.  This lets a freshly auto-updated
  // bundle preempt an older dashboard process instead of falsely reusing it under a stale constant.
  const root = pluginRoot()
  const version = resolveReleaseVersion(root)
  const releaseId = resolvePayloadReleaseId(root)
  const stateScopeId = machineStateScopeId(paths.home)

  // ── B4 版本抢占 ──
  const existing = await probeHealth(port, host, 400)
  const decision = decidePreemption(existing, version, releaseId, stateScopeId)
  if (decision === 'reuse') {
    process.stdout.write(`[dashboard-server] 复用既有 Global server :${port}（版本 ${existing?.version} ≥ ${version}）\n`)
    return
  }
  if (decision === 'preempt') {
    process.stdout.write(`[dashboard-server] 抢占旧版本 ${existing?.version} → 本版本 ${version}\n`)
    // 0.1.x wrote no pidfile.  Its health endpoint still exposes its own pid;
    // preemptOldServer additionally verifies that pid owns this TCP listener
    // before signalling it, so the legacy migration path remains fail-closed.
    const freed = await preemptOldServer(paths.pidfilePath, port, host, {
      waitMs: 4000,
      legacyPid: existing?.pid,
    })
    if (!freed) {
      process.stderr.write('[dashboard-server] 旧实例未在期限内让出端口，启动失败\n')
      process.exitCode = 1
      return
    }
  }

  const token = generateToken()
  const srv = createDashboardServer({
    version,
    releaseId,
    home: paths.home,
    token,
    manifestPath: manifestPath(),
    gitHeadSha,
    workspaceFingerprint: (cwd) => fingerprintWorkspace(cwd),
    // dashboard-app 构建产物（BACKLOG #26c）：存在则服务真 SPA，否则回退最小落地页
    webRoot: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dashboard-app', 'dist'),
    // tap 流量查看器数据源（BACKLOG #34d）：只读 listSessions/readRecords，capabilities.traffic=true。
    // tap capture 默认 OFF，无捕获时返回空会话——数据端仍在线（#34e：只读本地、不外发）
    traceStore: createTraceStore(),
    // H15：生产 server 显式启用真实 cadence；执行复用已构建 CLI，不在 server 复制 runner。
    cadence: { pollIntervalMs: cadencePollInterval() },
  })

  try {
    await srv.listen(port, host)
  } catch (e) {
    process.stderr.write(`[dashboard-server] 监听 :${port} 失败：${e instanceof Error ? e.message : String(e)}\n`)
    process.exitCode = 1
    return
  }

  // B5：写 0600 token 握手文件（同源前端 / 本机可信工具读取）
  try {
    await writeTokenHandshake(paths.tokenPath, token, { pid: process.pid, port, version, created: Date.now() })
  } catch { /* best-effort */ }

  // pidfile（供后来者版本抢占读旧 pid）
  try {
    writeFileSync(paths.pidfilePath, JSON.stringify({ pid: process.pid, port, version, started: Date.now() }), 'utf8')
  } catch { /* best-effort */ }

  process.stdout.write(
    `[dashboard-server] Global server http://${host}:${port}  version=${version}` +
    `${releaseId === undefined ? '' : ` release=${releaseId}`}\n`,
  )

  const shutdown = (): void => {
    void srv.close().finally(() => {
      try { unlinkSync(paths.pidfilePath) } catch { /* 已清 */ }
      process.exit(0)
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

void main()
