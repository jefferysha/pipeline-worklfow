/**
 * forward-proxy.test —— 真 socket e2e（GOAL C9）：
 *   ① 明文 http 绝对 URI 代理：POST http://upstream/v1/messages 真过 forward proxy
 *      → upstream 真收到 + 响应真回 + trace_store 真落一条（capture on）。
 *   ② CONNECT 盲隧道：透明转发到真 TCP 上游（TLS MITM 终结属 #34b certs，本批盲隧道透传）。
 *   ③ 默认 OFF 时不落记录。零 mock，全真 socket。
 * 老仓真相源：forward_proxy.py serve_forward / _handle_connect / _forward_and_record。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { connect as netConnect, createServer as createTcpServer, type AddressInfo, type Server as NetServer, type Socket } from 'node:net'
import { serveForward, type ForwardProxyHandle } from './forward-proxy.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled } from './security.js'
import { connectThroughProxy, forwardHttpReq, rmDir, sleep, startFakeUpstream, startTcpEcho, tempTapDir, type FakeUpstream, type TcpEcho } from './test-support.js'
import { crc32 } from './bedrock.js'

const handles: ForwardProxyHandle[] = []
const ups: FakeUpstream[] = []
const echoes: TcpEcho[] = []
const dirs: string[] = []
afterEach(async () => {
  while (handles.length) await handles.pop()!.close()
  while (ups.length) await ups.pop()!.close()
  while (echoes.length) await echoes.pop()!.close()
  resetCaptureCache()
  while (dirs.length) await rmDir(dirs.pop()!)
})
async function store(): Promise<{ store: ReturnType<typeof createTraceStore>; dir: string }> {
  const dir = await tempTapDir(); dirs.push(dir); return { store: createTraceStore({ dir }), dir }
}

describe('forward proxy —— 明文绝对 URI 转发 + 捕获', () => {
  it('capture ON：POST http://upstream/v1/messages 真过 forward proxy → upstream 真收到 + 响应真回 + 真落一条', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serveForward({ port: 0, store: s.store, client: 'forward' })
    handles.push(proxy)

    const res = await forwardHttpReq(proxy.port, { host: '127.0.0.1', port: upstream.port, path: '/v1/messages' }, { method: 'POST', body: JSON.stringify({ model: 'gemini' }), headers: { 'Content-Type': 'application/json' } })
    expect(res.status).toBe(200)
    expect(res.json<{ ok: boolean }>().ok).toBe(true)
    expect(upstream.requests.length).toBe(1)
    expect(upstream.requests[0]!.url).toBe('/v1/messages')
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(1)
    expect((recorded[0]!.request as any).path).toBe('/v1/messages')
  })

  it('默认 OFF：真转发但零捕获', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    resetCaptureCache()
    const proxy = await serveForward({ port: 0, store: s.store })
    handles.push(proxy)
    const res = await forwardHttpReq(proxy.port, { host: '127.0.0.1', port: upstream.port, path: '/v1/messages' }, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
    expect(res.status).toBe(200)
    expect(upstream.requests.length).toBe(1)
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(0)
  })
})

/** 真构一条 AWS EventStream 帧（同 bedrock.test.ts 手法，真 CRC32）。 */
function encodeBedrockFrame(headers: Record<string, string>, payload: unknown): Buffer {
  const headerParts: Buffer[] = []
  for (const [name, value] of Object.entries(headers)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const valBuf = Buffer.from(value, 'utf8')
    const lenBuf = Buffer.alloc(2)
    lenBuf.writeUInt16BE(valBuf.length)
    headerParts.push(Buffer.concat([Buffer.from([nameBuf.length]), nameBuf, Buffer.from([7]), lenBuf, valBuf]))
  }
  const headerBlob = Buffer.concat(headerParts)
  const payloadBuf = payload === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(payload), 'utf8')
  const totalLen = 4 + 4 + 4 + headerBlob.length + payloadBuf.length + 4
  const prelude = Buffer.alloc(8)
  prelude.writeUInt32BE(totalLen, 0)
  prelude.writeUInt32BE(headerBlob.length, 4)
  const preludeCrc = Buffer.alloc(4)
  preludeCrc.writeUInt32BE(crc32(prelude), 0)
  const beforeMsgCrc = Buffer.concat([prelude, preludeCrc, headerBlob, payloadBuf])
  const msgCrc = Buffer.alloc(4)
  msgCrc.writeUInt32BE(crc32(beforeMsgCrc), 0)
  return Buffer.concat([beforeMsgCrc, msgCrc])
}

describe('forward proxy —— Bedrock EventStream 响应真解码入录（#34-wire：record 路径接 decodeBedrockEventstreamEvents）', () => {
  it('/model/.../converse-stream 真 EventStream 响应 → trace_store 落结构化 bedrock_events + 装配 converse body（非原始二进制）', async () => {
    const s = await store()
    const frame1 = encodeBedrockFrame({ ':event-type': 'messageStart' }, { role: 'assistant' })
    const frame2 = encodeBedrockFrame(
      { ':event-type': 'contentBlockDelta' },
      { contentBlockIndex: 0, delta: { text: 'hi' } },
    )
    const eventStreamBody = Buffer.concat([frame1, frame2])
    const upstream = await startFakeUpstream({
      respond: (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/vnd.amazon.eventstream', 'Content-Length': eventStreamBody.length })
        res.end(eventStreamBody)
      },
    })
    ups.push(upstream)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serveForward({ port: 0, store: s.store, client: 'forward' })
    handles.push(proxy)

    const res = await forwardHttpReq(
      proxy.port,
      { host: '127.0.0.1', port: upstream.port, path: '/model/anthropic.claude-3-sonnet/converse-stream' },
      { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } },
    )
    expect(res.status).toBe(200)

    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(1)
    const respBody = (recorded[0]!.response as { body: { bedrock_events: unknown[]; output: { message: { content: unknown[] } } } }).body
    // 真解码：不是原始 base64/乱码字节，是结构化事件 + 装配后的 converse body
    expect(respBody.bedrock_events).toHaveLength(2)
    expect(respBody.output.message.content.length).toBeGreaterThan(0)
  })
})

describe('forward proxy —— B2：明文成功回写 client 中断不崩 daemon（robustness 守卫）', () => {
  it('client 发绝对 URI POST 后立即 abort，upstream 迟回 → 明文成功回写对已断 res 不抛未捕获异常，daemon 存活', async () => {
    const s = await store()
    // 上游延迟回包，给 client abort 留窗口（abort 早于 upstream 回包）
    const upstream = await startFakeUpstream({
      respond: (_req, res) => setTimeout(() => {
        const p = Buffer.from(JSON.stringify({ ok: true }), 'utf8')
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': p.length }); res.end(p)
      }, 120),
    })
    ups.push(upstream)
    const proxy = await serveForward({ port: 0, store: s.store })
    handles.push(proxy)

    const uncaught: unknown[] = []
    const onErr = (e: unknown): void => { uncaught.push(e) }
    process.on('uncaughtException', onErr)
    try {
      await new Promise<void>((resolve) => {
        const sock = netConnect(proxy.port, '127.0.0.1', () => {
          const line = `POST http://127.0.0.1:${upstream.port}/v1/messages HTTP/1.1`
          sock.write(`${line}\r\nHost: 127.0.0.1:${upstream.port}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`)
          setTimeout(() => { try { sock.destroy() } catch { /* ignore */ } ; resolve() }, 30) // abort 早于 upstream 回包
        })
        sock.on('error', () => resolve())
      })
      await sleep(250) // 等 upstream 迟回窗口过：proxy 明文成功路径对已销毁 res 回写
      expect(uncaught).toEqual([])
      // daemon 仍活：后续正常请求照常
      const res = await forwardHttpReq(proxy.port, { host: '127.0.0.1', port: upstream.port, path: '/v1/messages' }, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
      expect(res.status).toBe(200)
    } finally {
      process.off('uncaughtException', onErr)
    }
  })
})

describe('forward proxy —— CONNECT 盲隧道透明转发（TLS MITM 属 #34b）', () => {
  it('CONNECT 到真 TCP 上游 → 隧道建立，字节双向透明转发（echo 原样返回）', async () => {
    const s = await store()
    const echo = await startTcpEcho()
    echoes.push(echo)
    const proxy = await serveForward({ port: 0, store: s.store })
    handles.push(proxy)

    const sock = await connectThroughProxy(proxy.port, `127.0.0.1:${echo.port}`)
    const got = await new Promise<string>((resolve, reject) => {
      let buf = ''
      sock.on('data', (d) => { buf += d.toString('utf8'); if (buf.includes('PING')) resolve(buf) })
      sock.on('error', reject)
      sock.write('PING-THROUGH-TUNNEL')
      setTimeout(() => reject(new Error('隧道回显超时')), 2000)
    })
    expect(got).toContain('PING-THROUGH-TUNNEL')
    expect(echo.connections).toBe(1) // 上游真被连上
    sock.destroy()
  })
})

/**
 * 起一个「接受连接但一言不发」的 TCP 上游：TCP 握手秒完成（本地 loopback），但建立后永不发字节，
 * 用来确定性地触发盲隧道**建立后 idle 超时**（无需真网络/黑洞，完全确定不 flaky）。同时跟踪 accept
 * 到的 socket 是否被关闭 —— 断言超时兜底真的把**上游 fd 也**销毁了（不只 clientSocket）。
 */
async function startSilentTcpUpstream(): Promise<{ port: number; get closed(): boolean; close(): Promise<void> }> {
  let closed = false
  const server: NetServer = createTcpServer((sock: Socket) => {
    sock.on('data', () => { /* 读走丢弃，永不回写 */ })
    sock.on('error', () => { /* ignore */ })
    sock.on('close', () => { closed = true })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: (server.address() as AddressInfo).port,
    get closed() { return closed },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('forward proxy —— B3：CONNECT 隧道 connect/idle 超时兜底（防 fd 泄漏）', () => {
  it('盲隧道建立后长时间无字节 → idle 超时兜底销毁 clientSocket + 上游两端 fd（防半开泄漏）', async () => {
    const s = await store()
    const silent = await startSilentTcpUpstream()
    // 注入毫秒级 idle（生产默认 300s），connect 超时给足以隔离出「只测 idle」。
    const proxy = await serveForward({ port: 0, store: s.store, connectTimeoutMs: 5_000, tunnelIdleTimeoutMs: 40 })
    handles.push(proxy)

    // 建立隧道（上游秒连上 → proxy 回 200），随后**什么都不发**：40ms 无活动 → idle 'timeout' → cleanup。
    const sock = await connectThroughProxy(proxy.port, `127.0.0.1:${silent.port}`)
    sock.on('data', () => { /* flowing 消费：防缓冲未读数据把 graceful-FIN 的 'close' 推迟致假超时 */ })
    sock.on('error', () => { /* 评审🟢：对称兜底（与 connect 用例同款）——万一 destroy 产生 RST，未监听 error 会炸测试进程 */ })
    const clientClosed = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 1500)
      sock.on('close', () => { clearTimeout(t); resolve(true) })
    })
    expect(clientClosed).toBe(true) // 无 idle 超时则隧道永挂、此处必超时失败 → 该断言严格证明 idle 兜底
    await sleep(50) // 让上游侧 'close' 事件冲刷
    expect(silent.closed).toBe(true) // 上游 fd 也被销毁（两端都清，非只清 client）
    await silent.close()
  })

  it('CONNECT 上游不可达/握手挂起 → connect(超时)兜底销毁 clientSocket（防 fd 泄漏，有界 teardown）', async () => {
    const s = await store()
    // 注入 40ms connect 超时（生产默认 30s）。目标 10.255.255.1（RFC1918 私网、绝大多数环境无路由）。
    // 稳健不 flaky（有界 teardown，恒绿）：三条路径都在 ~40ms 内销毁两端 fd——
    //   ① SYN 被丢弃、TCP 握手挂起 → connect 超时(40ms)兜底（40ms « OS 连接超时数十秒，计时先赢）；
    //   ② 环境快速报错(ENETUNREACH) → 既有 error→cleanup；③ 环境异常地连上 → idle 超时(40ms)兜底。
    // 纯 TCP 握手无本地确定性 stall 手法（本机 VPN 会吞下任意 IP 的连接），故连接超时的**严格**证明
    // 放在 ws-proxy.test.ts「上游不回 101」用例；此处证明连接失败/挂起不泄漏 fd。
    const proxy = await serveForward({ port: 0, store: s.store, connectTimeoutMs: 40, tunnelIdleTimeoutMs: 40 })
    handles.push(proxy)

    const sock = netConnect(proxy.port, '127.0.0.1', () => {
      sock.write('CONNECT 10.255.255.1:9 HTTP/1.1\r\nHost: 10.255.255.1:9\r\n\r\n')
    })
    sock.on('data', () => { /* flowing 消费 */ })
    sock.on('error', () => { /* destroy 触发的 RST 亦可，静候 close */ })
    const closed = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 1_500)
      sock.on('close', () => { clearTimeout(t); resolve(true) })
    })
    expect(closed).toBe(true) // 无超时兜底则挂起的上游让 clientSocket 无限期泄漏
  })
})
