/**
 * bedrock.test —— AWS EventStream 二进制真解析（GOAL C9）。
 * 零 mock：真构 EventStream 帧（真 prelude/headers/payload + 真 CRC32）、真解码、真装配。
 * 老仓真相源：bedrock.py（decode_bedrock_eventstream_events / assemble_bedrock_converse_body / 路径助手）。
 */
import { describe, expect, it } from 'vitest'
import { crc32 as zlibCrc32 } from 'node:zlib'
import {
  crc32,
  isBedrockEventstreamPath,
  bedrockModelFromPath,
  decodeBedrockEventstreamEvents,
  bedrockErrorEvents,
  attachBedrockErrors,
  assembleBedrockConverseBody,
} from './bedrock.js'

/** 真构一条 AWS EventStream 帧（string 型 headers + JSON payload）。 */
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

describe('bedrock —— crc32 与 zlib 位相符（真校验基座）', () => {
  it('crc32 与 node:zlib.crc32 逐例相符', () => {
    for (const s of ['', 'abc', 'hello world', 'aws-eventstream']) {
      const buf = Buffer.from(s, 'utf8')
      expect(crc32(buf)).toBe(zlibCrc32(buf) >>> 0)
    }
  })
})

describe('bedrock —— 路径助手', () => {
  it('is_bedrock_eventstream_path：仅流式后缀判真', () => {
    expect(isBedrockEventstreamPath('/model/foo/converse-stream')).toBe(true)
    expect(isBedrockEventstreamPath('/model/foo/invoke-with-response-stream?x=1')).toBe(true)
    expect(isBedrockEventstreamPath('/model/foo/converse')).toBe(false)
    expect(isBedrockEventstreamPath('/model/foo/invoke')).toBe(false)
  })
  it('bedrock_model_from_path：抽取并 url-decode modelId', () => {
    expect(bedrockModelFromPath('/model/anthropic.claude-3/converse-stream')).toBe('anthropic.claude-3')
    expect(bedrockModelFromPath('/model/us.anthropic.claude-3-5%2Fv1/invoke')).toBe('us.anthropic.claude-3-5/v1')
    expect(bedrockModelFromPath('/no-model-here')).toBe('')
  })
})

describe('bedrock —— EventStream 二进制真解码', () => {
  it('真构真解一条 metadata 帧', () => {
    const frame = encodeBedrockFrame({ ':event-type': 'metadata', ':message-type': 'event' }, { usage: { inputTokens: 3 } })
    const events = decodeBedrockEventstreamEvents(frame)
    expect(events.length).toBe(1)
    expect(events[0]!.event).toBe('metadata')
    expect(events[0]!.headers[':event-type']).toBe('metadata')
    expect((events[0]!.data as { usage: { inputTokens: number } }).usage.inputTokens).toBe(3)
  })

  it('多帧串接真逐帧解码', () => {
    const buf = Buffer.concat([
      encodeBedrockFrame({ ':event-type': 'messageStart' }, { role: 'assistant' }),
      encodeBedrockFrame({ ':event-type': 'contentBlockDelta' }, { contentBlockIndex: 0, delta: { text: 'Hi' } }),
      encodeBedrockFrame({ ':event-type': 'messageStop' }, { stopReason: 'end_turn' }),
    ])
    const events = decodeBedrockEventstreamEvents(buf)
    expect(events.map((e) => e.event)).toEqual(['messageStart', 'contentBlockDelta', 'messageStop'])
  })

  it('截断帧 → 优雅停在完整前缀（返回已解出的）', () => {
    const full = encodeBedrockFrame({ ':event-type': 'metadata' }, { usage: {} })
    const truncated = full.subarray(0, full.length - 3)
    expect(decodeBedrockEventstreamEvents(truncated)).toEqual([])
  })

  it('坏 message-CRC → 跳过该帧，继续解下一帧', () => {
    const good = encodeBedrockFrame({ ':event-type': 'messageStart' }, { role: 'assistant' })
    const bad = encodeBedrockFrame({ ':event-type': 'contentBlockDelta' }, { delta: { text: 'x' } })
    bad[bad.length - 1] = bad[bad.length - 1]! ^ 0xff // 破坏 message CRC
    const events = decodeBedrockEventstreamEvents(Buffer.concat([bad, good]))
    // 坏帧被跳过，好帧仍解出
    expect(events.length).toBe(1)
    expect(events[0]!.event).toBe('messageStart')
  })

  it('坏 prelude-CRC → 停止（长度字段不可信）', () => {
    const frame = encodeBedrockFrame({ ':event-type': 'metadata' }, { usage: {} })
    frame[10] = frame[10]! ^ 0xff // 破坏 prelude CRC
    expect(decodeBedrockEventstreamEvents(frame)).toEqual([])
  })

  it('过短 body 返回空', () => {
    expect(decodeBedrockEventstreamEvents(Buffer.alloc(5))).toEqual([])
  })
})

describe('bedrock —— error 事件 + Converse 装配', () => {
  it('bedrock_error_events 归一 + attach 挂载', () => {
    const events = decodeBedrockEventstreamEvents(
      encodeBedrockFrame({ ':event-type': 'throttlingException' }, { message: 'slow down' }),
    )
    const errs = bedrockErrorEvents(events)
    expect(errs.length).toBe(1)
    expect(errs[0]!.type).toBe('throttlingException')
    expect(errs[0]!.message).toBe('slow down')
    const annotated = attachBedrockErrors({ output: {} }, events) as Record<string, unknown>
    expect((annotated.error as { type: string }).type).toBe('throttlingException')
    expect((annotated.bedrock_errors as unknown[]).length).toBe(1)
  })

  it('assemble：文本 + toolUse + reasoning 三类块按序装配', () => {
    const events = decodeBedrockEventstreamEvents(
      Buffer.concat([
        encodeBedrockFrame({ ':event-type': 'messageStart' }, { role: 'assistant' }),
        encodeBedrockFrame({ ':event-type': 'contentBlockDelta' }, { contentBlockIndex: 0, delta: { text: 'Hello ' } }),
        encodeBedrockFrame({ ':event-type': 'contentBlockDelta' }, { contentBlockIndex: 0, delta: { text: 'world' } }),
        encodeBedrockFrame({ ':event-type': 'contentBlockStart' }, { contentBlockIndex: 1, start: { toolUse: { toolUseId: 'tu1', name: 'search' } } }),
        encodeBedrockFrame({ ':event-type': 'contentBlockDelta' }, { contentBlockIndex: 1, delta: { toolUse: { input: '{"q":' } } }),
        encodeBedrockFrame({ ':event-type': 'contentBlockDelta' }, { contentBlockIndex: 1, delta: { toolUse: { input: '"cats"}' } } }),
        encodeBedrockFrame({ ':event-type': 'contentBlockDelta' }, { contentBlockIndex: 2, delta: { reasoningContent: { text: 'because', signature: 'sig9' } } }),
        encodeBedrockFrame({ ':event-type': 'metadata' }, { usage: { inputTokens: 10, outputTokens: 4 } }),
      ]),
    )
    const body = assembleBedrockConverseBody(events)
    const content = body.output.message.content as Array<Record<string, unknown>>
    expect(body.output.message.role).toBe('assistant')
    expect(content[0]).toEqual({ text: 'Hello world' })
    expect(content[1]).toEqual({ toolUse: { toolUseId: 'tu1', name: 'search', input: { q: 'cats' } } })
    expect(content[2]).toEqual({ reasoningContent: { text: 'because', signature: 'sig9' } })
    expect(body.usage).toEqual({ inputTokens: 10, outputTokens: 4 })
  })

  it('空事件列表装配出空 content', () => {
    const body = assembleBedrockConverseBody([])
    expect(body.output.message.content).toEqual([])
    expect(body.output.message.role).toBe('assistant')
  })
})
