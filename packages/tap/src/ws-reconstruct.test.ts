/**
 * ws-reconstruct.test —— RFC 6455 帧真编解码 + 真 buffer 分片重组 + WS body 重建（GOAL C9）。
 * 零 mock：真 Buffer 构帧、真掩码 XOR、真续帧合并、真 RFC 向量断言。
 * 老仓真相源：ws_frame.py（build_accept/build_frame/read_frame/read_message）+ ws_reconstruct.py。
 */
import { describe, expect, it } from 'vitest'
import {
  WS_OPCODES,
  computeAcceptKey,
  encodeFrame,
  decodeFrame,
  decodeMessages,
  buildWsHandshakeRequest,
  reconstructWsRequestBody,
  reconstructWsResponseBody,
  isPromptBearingWsRequestBody,
} from './ws-reconstruct.js'

describe('ws frame codec —— 真 buffer 编解码往返', () => {
  it('RFC 6455 §1.3 accept-key 向量真断言', () => {
    // 权威向量：key "dGhlIHNhbXBsZSBub25jZQ==" → accept "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
    expect(computeAcceptKey('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
  })

  it('未掩码 text 帧真往返（server→client）', () => {
    const payload = Buffer.from('hello websocket', 'utf8')
    const frame = encodeFrame(WS_OPCODES.TEXT, payload, { mask: false })
    expect(frame[0]! & 0x80).toBe(0x80) // FIN
    expect(frame[0]! & 0x0f).toBe(WS_OPCODES.TEXT)
    expect(frame[1]! & 0x80).toBe(0) // 未掩码
    const decoded = decodeFrame(frame)!
    expect(decoded.masked).toBe(false)
    expect(decoded.fin).toBe(true)
    expect(decoded.opcode).toBe(WS_OPCODES.TEXT)
    expect(decoded.payload.toString('utf8')).toBe('hello websocket')
    expect(decoded.frameLength).toBe(frame.length)
  })

  it('掩码帧真 XOR 还原（client→server，掩码位真置）', () => {
    const payload = Buffer.from('{"input":"masked"}', 'utf8')
    const frame = encodeFrame(WS_OPCODES.TEXT, payload, { mask: true })
    expect(frame[1]! & 0x80).toBe(0x80) // 掩码位
    // 掩码后的载荷字节不应等于明文（真被 XOR 打乱）
    const maskedBytes = frame.subarray(6) // 2 头 + 4 掩码键
    expect(maskedBytes.equals(payload)).toBe(false)
    const decoded = decodeFrame(frame)!
    expect(decoded.masked).toBe(true)
    expect(decoded.payload.toString('utf8')).toBe('{"input":"masked"}')
  })

  it('16-bit 扩展长度（126）真编码真解码', () => {
    const payload = Buffer.alloc(300, 0x41) // > 125 → 16-bit 长度
    const frame = encodeFrame(WS_OPCODES.BINARY, payload, { mask: false })
    expect(frame[1]! & 0x7f).toBe(126)
    const decoded = decodeFrame(frame)!
    expect(decoded.payload.length).toBe(300)
    expect(decoded.payload.equals(payload)).toBe(true)
  })

  it('64-bit 扩展长度（127）真编码真解码', () => {
    const payload = Buffer.alloc(70000, 0x42) // > 65535 → 64-bit 长度
    const frame = encodeFrame(WS_OPCODES.BINARY, payload, { mask: false })
    expect(frame[1]! & 0x7f).toBe(127)
    const decoded = decodeFrame(frame)!
    expect(decoded.payload.length).toBe(70000)
    expect(decoded.payload[0]).toBe(0x42)
    expect(decoded.payload[69999]).toBe(0x42)
  })

  it('不完整 buffer → decodeFrame 返回 null（不越界）', () => {
    const full = encodeFrame(WS_OPCODES.TEXT, Buffer.from('partial-frame-data'), { mask: false })
    expect(decodeFrame(full.subarray(0, 1))).toBeNull() // 头不全
    expect(decodeFrame(full.subarray(0, full.length - 3))).toBeNull() // 载荷不全
    expect(decodeFrame(full)).not.toBeNull()
  })

  it('续帧真合并成整消息（分片 text + continuation，FIN 在末帧）', () => {
    const part1 = encodeFrame(WS_OPCODES.TEXT, Buffer.from('{"in'), { mask: false, fin: false })
    const part2 = encodeFrame(WS_OPCODES.CONTINUATION, Buffer.from('put":'), { mask: false, fin: false })
    const part3 = encodeFrame(WS_OPCODES.CONTINUATION, Buffer.from('"x"}'), { mask: false, fin: true })
    const stream = Buffer.concat([part1, part2, part3])
    const msgs = decodeMessages(stream)
    expect(msgs.length).toBe(1)
    expect(msgs[0]!.opcode).toBe(WS_OPCODES.TEXT)
    expect(msgs[0]!.payload.toString('utf8')).toBe('{"input":"x"}')
    expect(JSON.parse(msgs[0]!.payload.toString('utf8'))).toEqual({ input: 'x' })
  })

  it('多消息流真拆分（含掩码，控制帧独立）', () => {
    const m1 = encodeFrame(WS_OPCODES.TEXT, Buffer.from('one'), { mask: true })
    const ping = encodeFrame(WS_OPCODES.PING, Buffer.from('p'), { mask: true })
    const m2 = encodeFrame(WS_OPCODES.TEXT, Buffer.from('two'), { mask: true })
    const msgs = decodeMessages(Buffer.concat([m1, ping, m2]))
    expect(msgs.map((m) => m.payload.toString('utf8'))).toEqual(['one', 'p', 'two'])
    expect(msgs.map((m) => m.opcode)).toEqual([WS_OPCODES.TEXT, WS_OPCODES.PING, WS_OPCODES.TEXT])
  })

  it('handshake 请求字节真含必备头', () => {
    const bytes = buildWsHandshakeRequest('api.example.com', '/ws', { Authorization: 'Bearer x' }, 'dGhlIHNhbXBsZSBub25jZQ==')
    const text = bytes.toString('latin1')
    expect(text).toContain('GET /ws HTTP/1.1')
    expect(text).toContain('Host: api.example.com')
    expect(text).toContain('Upgrade: websocket')
    expect(text).toContain('Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==')
    expect(text).toContain('Sec-WebSocket-Version: 13')
    expect(text).toContain('Authorization: Bearer x')
    expect(text.endsWith('\r\n\r\n')).toBe(true)
  })
})

describe('ws request/response body 重组（老仓 ws_reconstruct.py 语义）', () => {
  it('多条 client 消息合并——input/tools 列表按 JSON key 去重合并', () => {
    const merged = reconstructWsRequestBody([
      JSON.stringify({ model: 'gpt', input: [{ role: 'user', content: 'a' }], tools: [{ name: 't1' }] }),
      JSON.stringify({ input: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }], tools: [{ name: 't1' }, { name: 't2' }] }),
    ])!
    expect(merged.model).toBe('gpt')
    // input 去重合并：a 只一份，b 追加
    expect((merged.input as unknown[]).length).toBe(2)
    expect((merged.tools as unknown[]).length).toBe(2)
  })

  it('后到的非空标量覆盖，空值不覆盖已有', () => {
    const merged = reconstructWsRequestBody([
      JSON.stringify({ model: 'first', temperature: 0.5 }),
      JSON.stringify({ model: 'second', temperature: '' }),
    ])!
    expect(merged.model).toBe('second')
    expect(merged.temperature).toBe(0.5) // 空串不覆盖
  })

  it('非 JSON / 非 dict 消息真跳过', () => {
    const merged = reconstructWsRequestBody(['not json', JSON.stringify(['array-not-dict']), JSON.stringify({ input: 'ok' })])!
    expect(merged.input).toBe('ok')
  })

  it('Buffer 形式的消息也可重组', () => {
    const merged = reconstructWsRequestBody([Buffer.from(JSON.stringify({ input: 'buf' }), 'utf8')])!
    expect(merged.input).toBe('buf')
  })

  it('response 事件重建：response.completed + output_item.done 装配 output', () => {
    const merged = reconstructWsResponseBody([
      { type: 'response.created', response: { id: 'r1', status: 'in_progress' } },
      { type: 'response.output_item.done', output_index: 1, item: { type: 'message', text: 'B' } },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', text: 'A' } },
      { type: 'response.completed', response: { id: 'r1', status: 'completed', usage: { total: 5 } } },
    ])!
    expect(merged.id).toBe('r1')
    expect(merged.status).toBe('completed')
    expect((merged.usage as { total: number }).total).toBe(5)
    // output_index 排序：0 在前 1 在后
    expect((merged.output as { text: string }[]).map((o) => o.text)).toEqual(['A', 'B'])
  })

  it('isPromptBearing：含 messages/input 判真，function_call_output 单项判假', () => {
    expect(isPromptBearingWsRequestBody({ messages: [{ role: 'user' }] })).toBe(true)
    expect(isPromptBearingWsRequestBody({ input: 'hi there' })).toBe(true)
    expect(isPromptBearingWsRequestBody({ input: [{ role: 'user', content: 'x' }] })).toBe(true)
    expect(isPromptBearingWsRequestBody({ input: [{ type: 'function_call_output', output: 'z' }] })).toBe(false)
    expect(isPromptBearingWsRequestBody({ input: '   ' })).toBe(false)
    expect(isPromptBearingWsRequestBody({ unrelated: 1 })).toBe(false)
    expect(isPromptBearingWsRequestBody(null)).toBe(false)
  })

  it('嵌套 request 字段递归判 prompt', () => {
    expect(isPromptBearingWsRequestBody({ request: { messages: [{ role: 'user' }] } })).toBe(true)
  })
})
