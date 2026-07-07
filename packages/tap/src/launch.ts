/**
 * launch —— 单进程绑多 client 的高层编排（BACKLOG #34-wire：daemon 启动器 + TLS 绑定）。
 *
 * 交接文档指定的接线：detectTarget 定位真实上游 + reverseEnvMap/forwardEnvMap 按 runtime 组装
 * 注入 env + CertificateAuthority.fromDir() 传入 serveForward({ca})。本模块是唯一把三者接成一次
 * `startDaemon` 调用的编排点——此前 tap 只有零散的纯函数，没有能真跑起来的入口。
 *
 * 分流：client.defaultProxyMode==='reverse' 各自独立端口绑定（老仓每 client 一个 capture_proxy）；
 * ==='forward' 的全部 client 共享**一个** forward 绑定（老仓 forward_proxy 单例，差异只在注入
 * 给各 client 的 env，不在监听端口——proxy 通过 CONNECT authority/绝对 URI 认目标，不认 client）。
 *
 * env 组装必须在**真绑定之后**：reverse 端口是 OS 分配的（port:0），forward 端口同理，
 * reverseEnvMap/forwardEnvMap 都要真实端口，不能用绑定前的占位值。
 *
 * ca 是显式 opt-in（opts.ca）：请求了 forward-mode client 却未给 ca → 直接拒绝（fail loud）—— 若
 * 静默退化成盲隧道，调用方会拿到看似合法的 forwardEnvMap 却指向一个不解密的代理，CA 信任 env
 * （NODE_EXTRA_CA_CERTS 等）会指向不存在或误导的路径，比拒绝更危险。
 */
import {
  CLIENT_CONFIGS,
  detectTarget,
  forwardEnvMap,
  recordedPaths,
  reverseEnvMap,
  reverseStripPathPrefix,
  type DetectOptions,
} from './clients.js'
import { startDaemon, type DaemonBinding, type DaemonHandles } from './daemon.js'
import { CertificateAuthority, ensureCa, type CaDirOptions } from './certs.js'
import type { TraceStore } from './trace-store.js'

/** forward-mode client 共享的绑定名（单例 forward proxy；env 差异不在端口）。 */
export const FORWARD_BINDING_NAME = '__forward__'

export interface PlanResult {
  readonly bindings: DaemonBinding[]
  /** client → 已解析的真实上游（detectTarget 结果，reverse 用于绑定 target，forward 仅供展示）。 */
  readonly targets: Record<string, string>
}

const modeOf = (client: string): 'reverse' | 'forward' => CLIENT_CONFIGS[client]!.defaultProxyMode ?? 'reverse'

/** 纯编排：client 名单 → DaemonBinding[]（无 socket，可测 argv 级正确性）。 */
export function planBindings(clients: readonly string[], detect?: DetectOptions): PlanResult {
  const unknown = clients.filter((c) => !CLIENT_CONFIGS[c])
  if (unknown.length > 0) throw new Error(`未知 client: ${unknown.join(', ')}`)

  const targets: Record<string, string> = {}
  const bindings: DaemonBinding[] = []
  let needForward = false

  for (const client of clients) {
    const cfg = CLIENT_CONFIGS[client]!
    const target = detectTarget(client, detect)
    targets[client] = target
    if (modeOf(client) === 'reverse') {
      bindings.push({
        name: client,
        mode: 'reverse',
        port: 0,
        target,
        recordedPaths: [...recordedPaths(client)],
        stripPrefix: reverseStripPathPrefix(cfg, target) || undefined,
      })
    } else {
      needForward = true
    }
  }
  if (needForward) bindings.push({ name: FORWARD_BINDING_NAME, mode: 'forward', port: 0 })
  return { bindings, targets }
}

export interface LaunchOptions {
  readonly clients: readonly string[]
  readonly store?: TraceStore
  readonly host?: string
  /** hermetic 测试注入（真实生产走缺省 process.env/os.homedir()）。 */
  readonly detect?: DetectOptions
  /**
   * 提供则真装配本地 CA（CertificateAuthority.fromDir，落盘复用/生成）并透传给 forward 绑定——
   * capture ON 时才真解密（forward-proxy.ts 双护栏不变）。请求 forward-mode client 却未给 ca
   * 会直接拒绝（见模块头注释）。
   */
  readonly ca?: CaDirOptions
}

export interface ClientLaunchInfo {
  readonly client: string
  readonly mode: 'reverse' | 'forward'
  /** 真实绑定端口（daemon 起后回读，非占位 0）。 */
  readonly port: number
  readonly target: string
  /** 该 client 启动前应注入的 env（reverseEnvMap / forwardEnvMap 结果，已代入真端口）。 */
  readonly env: Record<string, string>
}

export interface LaunchResult {
  readonly daemon: DaemonHandles
  readonly clients: ClientLaunchInfo[]
  /** 装配的 CA 证书路径（未提供 opts.ca 时 undefined）。 */
  readonly caCertPath?: string
}

/** 真装配：detectTarget + reverseEnvMap/forwardEnvMap + CertificateAuthority.fromDir → 一个真跑的 daemon。 */
export async function launchTap(opts: LaunchOptions): Promise<LaunchResult> {
  const { bindings, targets } = planBindings(opts.clients, opts.detect)
  const forwardClients = opts.clients.filter((c) => modeOf(c) === 'forward')

  let authority: CertificateAuthority | undefined
  let caCertPath: string | undefined
  if (opts.ca) {
    caCertPath = ensureCa(opts.ca).caCertPath
    authority = CertificateAuthority.fromDir(opts.ca) // 交接文档指定的接线：CertificateAuthority.fromDir()
  }
  if (forwardClients.length > 0 && !caCertPath) {
    throw new Error(
      `forward client(s) ${forwardClients.join(', ')} 需要 opts.ca（本地 CA 目录）：` +
        '缺 ca 时代理只能盲隧道，NODE_EXTRA_CA_CERTS 等信任 env 无意义甚至误导——拒绝而非静默降级。',
    )
  }

  const daemon = await startDaemon({ bindings, store: opts.store, host: opts.host, ca: authority })

  const clients: ClientLaunchInfo[] = opts.clients.map((client) => {
    const cfg = CLIENT_CONFIGS[client]!
    const mode = modeOf(client)
    const handle = mode === 'reverse' ? daemon.handles[client]! : daemon.handles[FORWARD_BINDING_NAME]!
    const env = mode === 'reverse' ? reverseEnvMap(cfg, handle.port) : forwardEnvMap(handle.port, caCertPath!)
    return { client, mode, port: handle.port, target: targets[client]!, env }
  })

  return { daemon, clients, caCertPath }
}
