/**
 * daemon —— 单进程绑**多端口**监听（多 client tap；与 claude 8766 生命线隔离）。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/tap_daemon.py
 *   start_daemon:45 · stop_daemon:87 · DEFAULT_PORTS:25（claude 占 8766，本 daemon 从 8767 起）。
 *   每个 reverse client 起一个 capture_proxy.serve；forward client 共享一个 forward_proxy。
 *
 * 生命线隔离（硬要求）：本 daemon **拒绑 8766**——claude 自己的抓包代理独占 8766，本多路 daemon
 *   任何绑定命中 8766 即抛错，确保本进程崩溃绝不波及 claude（tap_daemon.py 顶注的隔离契约）。
 * 部分启动失败 → 回滚已起的全部 server，绝不泄漏端口/句柄（tap_daemon.py:80-83）。
 *
 * 安全护栏（#34e）：daemon 默认**不自启**（无 import 副作用；须显式 startDaemon）；录制仍受
 *   isCaptureEnabled 门控（默认 OFF）；捕获只落本地 trace_store。多 runtime client 配置属 **#34c**。
 */
import { serve, type CaptureProxyHandle } from './capture-proxy.js'
import { serveForward, type ForwardProxyHandle } from './forward-proxy.js'
import { getTraceStore, type TraceStore } from './trace-store.js'
import type { CertificateAuthority } from './certs.js'

/** claude 生命线端口——本 daemon 绝不绑（隔离契约）。tap_daemon.py:24。 */
export const CLAUDE_LIFELINE_PORT = 8766

export interface DaemonBinding {
  name: string
  mode: 'reverse' | 'forward'
  port?: number
  target?: string
  recordedPaths?: string[]
  stripPrefix?: string
}

export type ProxyHandle = CaptureProxyHandle | ForwardProxyHandle

export interface DaemonHandles {
  handles: Record<string, ProxyHandle>
  stop(): Promise<void>
}

export interface StartDaemonOptions {
  bindings: DaemonBinding[]
  store?: TraceStore
  host?: string
  /**
   * 本地 CA（BACKLOG #34-wire）：提供则透传给每个 forward 绑定的 serveForward({ca})，令其在
   * capture ON 时对 CONNECT 隧道做 TLS MITM 终结；缺省 undefined = 全部 forward 绑定盲隧道
   * （安全默认，同 forward-proxy.ts 双护栏：ca 提供 **且** capture ON 才解密）。
   */
  ca?: CertificateAuthority
}

export async function startDaemon(opts: StartDaemonOptions): Promise<DaemonHandles> {
  const store = opts.store ?? getTraceStore()
  const host = opts.host ?? '127.0.0.1'
  const handles: Record<string, ProxyHandle> = {}
  try {
    for (const b of opts.bindings) {
      if (b.port === CLAUDE_LIFELINE_PORT) {
        throw new Error(`拒绑 claude 生命线端口 ${CLAUDE_LIFELINE_PORT}（lifeline isolation：本 daemon 从 8767 起）`)
      }
      if (b.mode === 'forward') {
        handles[b.name] = await serveForward({ port: b.port ?? 0, host, store, client: b.name, ca: opts.ca })
      } else {
        if (!b.target) throw new Error(`reverse 绑定 '${b.name}' 缺 target`)
        handles[b.name] = await serve({
          port: b.port ?? 0, host, store, client: b.name,
          target: b.target, recordedPaths: b.recordedPaths, stripPrefix: b.stripPrefix,
        })
      }
    }
  } catch (err) {
    // partial 启动失败 → 回滚已起的 server，绝不泄漏端口/线程（tap_daemon.py:80）
    await stopHandles(handles)
    throw err
  }
  return {
    handles,
    stop: () => stopHandles(handles),
  }
}

async function stopHandles(handles: Record<string, ProxyHandle>): Promise<void> {
  for (const h of Object.values(handles)) {
    try { await h.close() } catch { /* 单个失败不影响其余 */ }
  }
}

export function stopDaemon(daemon: DaemonHandles): Promise<void> {
  return daemon.stop()
}
