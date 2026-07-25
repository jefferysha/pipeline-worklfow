/**
 * tls-mitm —— forward proxy 的 TLS MITM 终结机件（T-c：从 forward-proxy.ts serveForward 闭包迁出，
 * 行为保持，逐字符移植）。老仓真相源同 forward-proxy.ts：forward_proxy.py _handle_connect（#34b）。
 *
 * 职责边界：
 *   · 本模块只管「已决定要解密」之后的事：CA 逐 host 签发证书 → TLSSocket 终结 → 内部 mitm http
 *     server 解析明文 → 经注入的共享管路转发上游(https, rejectUnauthorized:false)+录制；wss 升级
 *     经 attachWsRelay 真中继（#34-wire）。
 *   · 「要不要解密」的**双护栏判定（ca && capture ON）留在 serveForward 的 CONNECT 分派处**——
 *     调用方保证 terminate() 只在护栏通过后调用，本模块不重复判定（单一真相点，#34e 语义不变）。
 *
 * export 面（最小公共面决策）：本文件**不进 index.ts**（index 对 forward-proxy.js 是 export *，
 *   任何从那里 export 的符号都会漏进包公共 API）。共享「转发+录制」管路 forwardAndRecord 以
 *   **依赖注入**复用（deps.forwardAndRecord），保持其在 forward-proxy.ts 模块私有——两个候选方案
 *   （forward-proxy export 交叉 import vs DI）中 DI 的公共 API 增量为零，审阅面最小。
 *   UpstreamPlan 类型因两模块共用而落在本文件（包内 export，不经 index 外泄）。
 */
import { createServer, type ClientRequest, type IncomingMessage, type Server, type ServerResponse, type OutgoingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { TLSSocket, createSecureContext } from 'node:tls'
import type { Socket } from 'node:net'
import type { CertificateAuthority } from './certs.js'
import type { TraceStore } from './trace-store.js'
import type { TurnCounter } from './record.js'
import { attachWsRelay } from './ws-proxy.js'

/**
 * 上游计划（T-a 提取）——forward（明文）与 forwardMitm（TLS 终结）两路的**全部真实差异**收敛为 5 参：
 *   makeReq（http vs https+rejectUnauthorized 及连接参数）· path 推导 · upstreamBaseUrl · transport 标签
 *   · Host 头（明文=host:port，MITM=裸 hostname——历史行为，逐字符保持，勿「顺手统一」）。
 * method/headers/path 由共享管路算好经 reqOpts 传入（fwdHeaders HOP-BY-HOP 过滤必须单源）。
 */
export interface UpstreamPlan {
  makeReq: (reqOpts: { method: string; path: string; headers: OutgoingHttpHeaders }, onResp: (r: IncomingMessage) => void) => ClientRequest
  path: string
  upstreamBaseUrl: string
  transport: 'forward' | 'forward-tls'
  host: string
}

export interface TlsMitmDeps {
  ca: CertificateAuthority
  store: TraceStore
  sessionId: string
  counter: TurnCounter
  /** serveForward 的活跃 socket 登记表（共享引用）：close() 时由 serveForward 统一 destroy。 */
  tunnels: Set<Socket>
  /** ws relay 复用 forward 的 connect(setup) 超时（B3）；idle 用 attachWsRelay 内部更保守默认。 */
  connectTimeoutMs: number
  /** T-a 共享「转发+录制」管路（forward-proxy.ts 模块私有，DI 注入——见文件头 export 面决策）。 */
  forwardAndRecord: (req: IncomingMessage, res: ServerResponse, body: Buffer, plan: UpstreamPlan) => void
}

export interface TlsMitmHandle {
  /** CONNECT 升级为 TLS 终结（调用方已过 ca&&capture 双护栏）。 */
  terminate(clientSocket: Socket, head: Buffer, hostname: string, port: number): void
  /** 关闭惰性 mitm server（随 serveForward close() 调用；未曾终结过则为 no-op）。 */
  close(): void
}

export function createTlsMitm(deps: TlsMitmDeps): TlsMitmHandle {
  const { ca, store, sessionId, counter, tunnels, connectTimeoutMs, forwardAndRecord } = deps
  let mitmServer: Server | null = null
  interface MitmTarget { hostname: string; port: number }
  const targets = new WeakMap<object, MitmTarget>()
  const resolveMitmTarget = (req: IncomingMessage): MitmTarget =>
    targets.get(req.socket) ?? { hostname: String(req.headers.host ?? '').split(':')[0] || '', port: 443 }

  function getMitmServer(): Server {
    if (mitmServer) return mitmServer
    mitmServer = createServer((req: IncomingMessage, res: ServerResponse) => handleMitmRequest(req, res))
    mitmServer.on('clientError', () => { /* 单连接错误不影响 daemon */ })
    // #34-wire：wss:// 升级请求（TLS 已被上面终结）真中继 + 帧重组入录（ws-reconstruct 工具首次接活路径）。
    attachWsRelay(mitmServer, {
      store, sessionId, nextTurn: () => counter.next(),
      resolveTarget: (req) => { const t = resolveMitmTarget(req); return { hostname: t.hostname, port: t.port, useTls: true } },
      // B3：ws relay 复用 forward 的 connect(setup) 超时；idle 用 attachWsRelay 内部更保守的默认(见其定义)。
      connectTimeoutMs,
    })
    return mitmServer
  }

  function terminateTls(clientSocket: Socket, head: Buffer, hostname: string, port: number): void {
    try {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head && head.length) clientSocket.unshift(head)
      const { key, cert } = ca.secureContextOptions(hostname)
      const tlsSocket = new TLSSocket(clientSocket, { isServer: true, secureContext: createSecureContext({ key, cert }) })
      targets.set(tlsSocket, { hostname, port })
      tunnels.add(clientSocket)
      tunnels.add(tlsSocket)
      const drop = (): void => { tunnels.delete(clientSocket); tunnels.delete(tlsSocket) }
      tlsSocket.on('error', () => { try { tlsSocket.destroy() } catch { /* ignore */ } ; try { clientSocket.destroy() } catch { /* ignore */ } ; drop() })
      tlsSocket.on('close', drop)
      clientSocket.on('error', () => { try { tlsSocket.destroy() } catch { /* ignore */ } ; drop() })
      getMitmServer().emit('connection', tlsSocket)
    } catch {
      try { clientSocket.destroy() } catch { /* ignore */ }
    }
  }

  function handleMitmRequest(req: IncomingMessage, res: ServerResponse): void {
    const target = resolveMitmTarget(req)
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => forwardMitm(Buffer.concat(chunks)))
    req.on('error', () => { try { res.destroy() } catch { /* ignore */ } })
    res.on('error', () => { /* B2：client 已断，静默避免未监听 error 崩 daemon */ })

    // MITM 路径的 UpstreamPlan：path 直取 req.url、Host 用裸 hostname、BaseUrl 恒 https（均历史行为保持）。
    function forwardMitm(body: Buffer): void {
      forwardAndRecord(req, res, body, {
        makeReq: (o, onResp) => httpsRequest({
          hostname: target.hostname, port: target.port, method: o.method, path: o.path, headers: o.headers,
          rejectUnauthorized: false, // MITM 代理不校验上游证书（对齐老仓 forward 语义）
        }, onResp),
        path: req.url ?? '/',
        upstreamBaseUrl: `https://${target.hostname}`,
        transport: 'forward-tls',
        host: target.hostname,
      })
    }
  }

  return {
    terminate: terminateTls,
    close(): void {
      if (mitmServer) { try { mitmServer.close() } catch { /* ignore */ } }
    },
  }
}
