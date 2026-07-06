/**
 * record.test —— 纯函数移植真值（老仓 capture_proxy.py filter_headers/build_record/
 * _extract_real_session_id/TurnCounter 逐条对位）。无 socket，纯逻辑；真实副作用由 proxy e2e 覆盖。
 */
import { describe, expect, it } from 'vitest'
import {
  buildRecord, extractRealSessionId, filterHeaders, safeJson, shouldSkipTraceRecord, TurnCounter,
} from './record.js'

describe('filterHeaders —— 剥 hop-by-hop + 脱敏', () => {
  it('剥掉 hop-by-hop 头（connection/transfer-encoding/host/content-length/accept-encoding）', () => {
    const out = filterHeaders({
      'Content-Type': 'application/json',
      Connection: 'keep-alive',
      Host: 'api.anthropic.com',
      'Content-Length': '42',
      'Accept-Encoding': 'gzip',
      'X-Custom': 'keep-me',
    })
    expect(out['Content-Type']).toBe('application/json')
    expect(out['X-Custom']).toBe('keep-me')
    expect(out.Connection).toBeUndefined()
    expect(out.Host).toBeUndefined()
    expect(out['Content-Length']).toBeUndefined()
    expect(out['Accept-Encoding']).toBeUndefined()
  })

  it('redactKeys：authorization/x-api-key 前缀截断，cookie 全遮', () => {
    const out = filterHeaders({
      Authorization: 'Bearer sk-ant-verylongsecretvalue-123456',
      'x-api-key': 'sk-ant-anotherlongsecret-abcdef',
      Cookie: 'session=abc',
      'x-amz-security-token': 'zzz',
    }, { redactKeys: true })
    expect(out.Authorization).toBe('Bearer sk-an...') // 前 12 字符 + ...
    expect(out['x-api-key']).toBe('sk-ant-anoth...')
    expect(out.Cookie).toBe('***')
    expect(out['x-amz-security-token']).toBe('***')
  })

  it('不 redact 时敏感值原样保留（转发路径用）', () => {
    const out = filterHeaders({ Authorization: 'Bearer secret' })
    expect(out.Authorization).toBe('Bearer secret')
  })
})

describe('buildRecord —— 组一条 API trace 记录', () => {
  it('含 timestamp/request_id/turn/transport + 请求响应，headers 已脱敏', () => {
    const rec = buildRecord({
      reqId: 'abc123', turn: 3, durationMs: 42, method: 'POST', path: '/v1/messages',
      reqHeaders: { Authorization: 'Bearer sk-ant-longsecret-000', 'Content-Type': 'application/json' },
      reqBody: { hello: 'world' },
      status: 200, respHeaders: { 'Content-Type': 'application/json' }, respBody: { ok: true },
      upstreamBaseUrl: 'https://api.anthropic.com',
    })
    expect(rec.transport).toBe('reverse')
    expect(rec.request_id).toBe('abc123')
    expect(rec.turn).toBe(3)
    expect(rec.duration_ms).toBe(42)
    expect((rec.request as any).method).toBe('POST')
    expect((rec.request as any).path).toBe('/v1/messages')
    expect((rec.request as any).body).toEqual({ hello: 'world' })
    // 脱敏落库：Authorization 前缀截断
    expect((rec.request as any).headers.Authorization).toBe('Bearer sk-an...')
    expect((rec.response as any).status).toBe(200)
    expect((rec.response as any).body).toEqual({ ok: true })
    expect(rec.upstream_base_url).toBe('https://api.anthropic.com')
    expect(typeof rec.timestamp).toBe('string')
  })
})

describe('safeJson —— 容错解析', () => {
  it('合法 JSON → 对象', () => { expect(safeJson(Buffer.from('{"a":1}'))).toEqual({ a: 1 }) })
  it('非 JSON → utf-8 字符串', () => { expect(safeJson(Buffer.from('not json'))).toBe('not json') })
  it('空 → null', () => { expect(safeJson(Buffer.from(''))).toBeNull(); expect(safeJson(null)).toBeNull() })
})

describe('TurnCounter —— 自增', () => {
  it('从 0 起自增', () => {
    const c = new TurnCounter()
    expect(c.next()).toBe(1)
    expect(c.next()).toBe(2)
  })
  it('可从已有记录数初始化', () => {
    const c = new TurnCounter(5)
    expect(c.next()).toBe(6)
  })
})

describe('extractRealSessionId —— claude 会话路由', () => {
  const uuid = '12345678-1234-1234-1234-1234567890ab'
  it('优先取 X-Claude-Code-Session-Id 头', () => {
    expect(extractRealSessionId({ 'X-Claude-Code-Session-Id': uuid }, null, 'fallback')).toBe(uuid)
  })
  it('头缺失 → body metadata.user_id 里的 session_<uuid>', () => {
    const body = Buffer.from(JSON.stringify({ metadata: { user_id: `user_x_session_${uuid}` } }))
    expect(extractRealSessionId({}, body, 'fallback')).toBe(uuid)
  })
  it('body metadata.session_id 直接 uuid', () => {
    const body = Buffer.from(JSON.stringify({ metadata: { session_id: uuid } }))
    expect(extractRealSessionId({}, body, 'fallback')).toBe(uuid)
  })
  it('都缺 → fallback', () => {
    expect(extractRealSessionId({}, null, 'fallback')).toBe('fallback')
  })
  it('头非 uuid → 不下探其它头，回落', () => {
    expect(extractRealSessionId({ 'X-Claude-Code-Session-Id': 'garbage' }, null, 'fallback')).toBe('fallback')
  })
})

describe('shouldSkipTraceRecord —— 非模型上游噪声过滤', () => {
  it('npm registry host → skip', () => {
    expect(shouldSkipTraceRecord({ upstreamUrl: 'https://registry.npmjs.org/foo', path: '/foo', responseHeaders: {}, method: 'GET' })).toBe(true)
  })
  it('模型上游 /v1/messages → 不 skip', () => {
    expect(shouldSkipTraceRecord({ upstreamUrl: 'https://api.anthropic.com/v1/messages', path: '/v1/messages', responseHeaders: { 'Content-Type': 'application/json' }, method: 'POST' })).toBe(false)
  })
})
