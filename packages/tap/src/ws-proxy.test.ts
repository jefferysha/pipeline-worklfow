/**
 * ws-proxy.test —— WS 帧累加器 + 真中继 e2e（BACKLOG #34-wire）。
 *   ① WsFrameAccumulator：拆成任意字节边界喂入仍正确合并 continuation 分片（无 socket，纯函数级）。
 *   ② 真中继：CONNECT → TLS MITM 终结 → wss:// 升级 → 真 WS 握手透传 + 真帧中继到假上游 →
 *      连接结束后重组出结构化 trace 记录（transport=forward-ws）。零 mock，真 socket/真 TLS/真帧。
 *   ③ 安全护栏：非 prompt-bearing 会话（无法重组出 input）不落记录；capture OFF 不落记录。
 * 老仓真相源：ws_reconstruct.py（重组函数）+ forward_proxy.py（MITM 隧道）—— 本仓首次把两者接活。
 */
import { describe, expect, it, afterEach } from 'vitest'
import * as net from 'node:net'
import * as tls from 'node:tls'
import * as http from 'node:http'
import * as https from 'node:https'
import type { AddressInfo } from 'node:net'
import { WsFrameAccumulator } from './ws-proxy.js'
import { WS_OPCODES, decodeFrame, encodeFrame, computeAcceptKey, type WsMessage } from './ws-reconstruct.js'
import { serveForward, type ForwardProxyHandle } from './forward-proxy.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled } from './security.js'
import { createCa, issueHostCert, CertificateAuthority, tlsMitmSupported } from './certs.js'
import { rmDir, tempTapDir } from './test-support.js'

describe('WsFrameAccumulator —— 增量帧合并（跨任意字节边界）', () => {
  it('单帧、多次小块 push 仍正确合并成一条消息', () => {
    const frame = encodeFrame(WS_OPCODES.TEXT, Buffer.from('hello world'))
    const acc = new WsFrameAccumulator()
    // 故意按 3 字节切碎喂入，模拟 TCP 分片
    for (let i = 0; i < frame.length; i += 3) acc.push(frame.subarray(i, i + 3))
    expect(acc.messages).toHaveLength(1)
    expect(acc.messages[0]!.payload.toString('utf8')).toBe('hello world')
  })

  it('continuation 分片（fin=false → fin=true）正确合并', () => {
    const part1 = encodeFrame(WS_OPCODES.TEXT, Buffer.from('ab'), { fin: false })
    const part2 = encodeFrame(WS_OPCODES.CONTINUATION, Buffer.from('cd'), { fin: true })
    const acc = new WsFrameAccumulator()
    acc.push(Buffer.concat([part1, part2]))
    expect(acc.messages).toHaveLength(1)
    expect(acc.messages[0]!.payload.toString('utf8')).toBe('abcd')
  })

  it('masked 帧自动还原明文（客户端方向真掩码）', () => {
    const frame = encodeFrame(WS_OPCODES.TEXT, Buffer.from('{"x":1}'), { mask: true })
    const acc = new WsFrameAccumulator()
    acc.push(frame)
    expect(acc.messages[0]!.payload.toString('utf8')).toBe('{"x":1}')
  })

  it('控制帧（PING）与数据帧混杂时各自独立成条，不参与分片合并', () => {
    const ping = encodeFrame(WS_OPCODES.PING, Buffer.alloc(0))
    const text = encodeFrame(WS_OPCODES.TEXT, Buffer.from('after-ping'))
    const acc = new WsFrameAccumulator()
    acc.push(Buffer.concat([ping, text]))
    expect(acc.messages.map((m) => m.opcode)).toEqual([WS_OPCODES.PING, WS_OPCODES.TEXT])
    expect(acc.messages[1]!.payload.toString('utf8')).toBe('after-ping')
  })
})

// ── 真中继 e2e：CONNECT → TLS MITM → wss:// upgrade → 帧重组入录 ──
const supported = tlsMitmSupported()
if (!supported) {
  // eslint-disable-next-line no-console
  console.warn('[honest-skip] ws-proxy 真中继 e2e：环境不支持本地 CA 证书生成/握手 —— 不伪绿')
}

const handles: ForwardProxyHandle[] = []
const upstreams: https.Server[] = []
const dirs: string[] = []
afterEach(async () => {
  while (handles.length) await handles.pop()!.close()
  while (upstreams.length) await new Promise<void>((r) => upstreams.pop()!.close(() => r()))
  resetCaptureCache()
  while (dirs.length) await rmDir(dirs.pop()!)
})

/** 真起一个 wss:// 上游：真 WS 握手响应 + 收一条 client 帧后回两条结构化事件帧再关闭。 */
async function startFakeWssUpstream(ca: ReturnType<typeof createCa>): Promise<{ port: number }> {
  const cert = issueHostCert(ca, 'localhost')
  const server = https.createServer({ key: cert.keyPem, cert: cert.certPem })
  server.on('upgrade', (req, socket, head) => {
    const key = String(req.headers['sec-websocket-key'] ?? '')
    const accept = computeAcceptKey(key)
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0)
    const onData = (chunk: Buffer): void => {
      buf = Buffer.concat([buf, chunk])
      const frame = decodeFrame(buf, 0)
      if (!frame || frame.opcode !== WS_OPCODES.TEXT) return
      socket.removeListener('data', onData)
      socket.write(encodeFrame(WS_OPCODES.TEXT, Buffer.from(JSON.stringify({
        type: 'response.output_item.done', output_index: 0,
        item: { type: 'message', content: [{ type: 'output_text', text: 'hi' }] },
      })), { mask: false }))
      socket.write(encodeFrame(WS_OPCODES.TEXT, Buffer.from(JSON.stringify({
        type: 'response.completed', response: { id: 'resp_1', usage: { total_tokens: 5 } },
      })), { mask: false }))
      socket.end()
    }
    socket.on('data', onData)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  upstreams.push(server)
  return { port: (server.address() as AddressInfo).port }
}

/** 经 forward proxy 的 CONNECT+TLS 隧道，做一次真 WS 握手 + 发一条 masked 请求帧，收集响应帧直到关闭。 */
function wsThroughMitm(
  proxyPort: number, upstreamPort: number, caPem: string, requestBody: unknown,
): Promise<{ authorized: boolean; serverMessages: WsMessage[] }> {
  return new Promise((resolve, reject) => {
    const raw = net.connect(proxyPort, '127.0.0.1', () => {
      raw.write(`CONNECT localhost:${upstreamPort} HTTP/1.1\r\nHost: localhost:${upstreamPort}\r\n\r\n`)
    })
    let connectBuf = ''
    const onConnectData = (d: Buffer): void => {
      connectBuf += d.toString('latin1')
      if (!connectBuf.includes('\r\n\r\n')) return
      raw.removeListener('data', onConnectData)
      if (!/^HTTP\/1\.1 200/.test(connectBuf)) { raw.destroy(); reject(new Error('CONNECT 未 200')); return }

      const tlsSock = tls.connect({ socket: raw, servername: 'localhost', ca: [caPem] }, () => {
        const authorized = tlsSock.authorized
        const wsKey = Buffer.from('test-key-0123456').toString('base64')
        tlsSock.write(
          `GET /realtime?model=test HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${wsKey}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        )
        let handshakeBuf = Buffer.alloc(0)
        let inHandshake = true
        const acc = new WsFrameAccumulator()
        tlsSock.on('data', (chunk: Buffer) => {
          if (inHandshake) {
            handshakeBuf = Buffer.concat([handshakeBuf, chunk])
            const idx = handshakeBuf.indexOf('\r\n\r\n')
            if (idx === -1) return
            inHandshake = false
            const headerText = handshakeBuf.subarray(0, idx).toString('latin1')
            if (!/^HTTP\/1\.1 101/.test(headerText)) { tlsSock.destroy(); reject(new Error('WS 升级未 101: ' + headerText.split('\r\n')[0])); return }
            const expectedAccept = computeAcceptKey(wsKey)
            if (!headerText.includes(expectedAccept)) { tlsSock.destroy(); reject(new Error('Sec-WebSocket-Accept 不匹配')); return }
            const remainder = handshakeBuf.subarray(idx + 4)
            // 握手确认后发一条 masked 请求帧（真实客户端行为：client→server 帧必须掩码）
            tlsSock.write(encodeFrame(WS_OPCODES.TEXT, Buffer.from(JSON.stringify(requestBody)), { mask: true }))
            if (remainder.length) acc.push(remainder)
            return
          }
          acc.push(chunk)
        })
        tlsSock.on('close', () => resolve({ authorized, serverMessages: acc.messages }))
        tlsSock.on('error', reject)
      })
      tlsSock.on('error', reject)
    }
    raw.on('data', onConnectData)
    raw.on('error', reject)
  })
}

describe.skipIf(!supported)('ws-proxy —— wss:// 真中继（CONNECT+TLS MITM 之后的 upgrade）', () => {
  it('prompt-bearing 会话：真握手透传 + 真帧中继 + 结束后重组出 forward-ws 记录', async () => {
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    const ca = createCa()
    const upstream = await startFakeWssUpstream(ca)
    setCaptureEnabled(true, { dir })
    const proxy = await serveForward({ port: 0, store, client: 'pi', ca: CertificateAuthority.fromCa(ca) })
    handles.push(proxy)

    const requestBody = { input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }] }
    const { authorized, serverMessages } = await wsThroughMitm(proxy.port, upstream.port, ca.certPem, requestBody)

    expect(authorized).toBe(true) // 客户端信任本地 CA → MITM 终结真发生
    expect(serverMessages.length).toBeGreaterThan(0) // 真收到上游转发回来的帧

    const recorded = store.listSessions().map((s) => store.readRecords(s.id)).flat()
    expect(recorded.length).toBe(1)
    expect(recorded[0]!.transport).toBe('forward-ws')
    const reqBody = recorded[0]!.request as { body: { input: unknown[] } }
    expect(reqBody.body.input).toHaveLength(1)
    const respBody = recorded[0]!.response as { body: { output: unknown[]; usage: { total_tokens: number } } }
    expect(respBody.body.output).toHaveLength(1)
    expect(respBody.body.usage.total_tokens).toBe(5)
  })

  it('非 prompt-bearing 会话（如心跳/无 input）→ 不落记录（不记噪声）', async () => {
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    const ca = createCa()
    const upstream = await startFakeWssUpstream(ca)
    setCaptureEnabled(true, { dir })
    const proxy = await serveForward({ port: 0, store, client: 'pi', ca: CertificateAuthority.fromCa(ca) })
    handles.push(proxy)

    await wsThroughMitm(proxy.port, upstream.port, ca.certPem, { ping: true }) // 无 input/messages/system 等 prompt 键
    const recorded = store.listSessions().map((s) => store.readRecords(s.id)).flat()
    expect(recorded.length).toBe(0)
  })

  it('capture OFF：即便 prompt-bearing 也不落记录（安全护栏优先于重组）', async () => {
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    const ca = createCa()
    const upstream = await startFakeWssUpstream(ca)
    resetCaptureCache() // capture 默认 OFF
    const proxy = await serveForward({ port: 0, store, client: 'pi', ca: CertificateAuthority.fromCa(ca) })
    handles.push(proxy)

    const requestBody = { input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }] }
    await wsThroughMitm(proxy.port, upstream.port, ca.certPem, requestBody)
    const recorded = store.listSessions().map((s) => store.readRecords(s.id)).flat()
    expect(recorded.length).toBe(0)
  })
})
