/**
 * record.test —— 纯函数移植真值（老仓 capture_proxy.py filter_headers/build_record/
 * _extract_real_session_id/TurnCounter 逐条对位）。无 socket，纯逻辑；真实副作用由 proxy e2e 覆盖。
 */
import { describe, expect, it } from 'vitest'
import {
  buildRecord, extractRealSessionId, filterHeaders, redactBodySecrets, safeJson, shouldSkipTraceRecord, TurnCounter,
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

  it('body 凭证脱敏：response 里 refresh_token/access_token 逐字入库被 *** 遮（codex OAuth 刷新泄漏面）', () => {
    const rec = buildRecord({
      reqId: 'r', turn: 1, durationMs: 1, method: 'POST', path: '/backend-api/codex/token',
      reqHeaders: {}, reqBody: 'grant_type=refresh_token&refresh_token=RT-secret-abc&scope=all',
      status: 200, respHeaders: {},
      respBody: { access_token: 'AT-secret-xyz', refresh_token: 'RT-secret-abc', id_token: 'ID-secret', expires_in: 3600 },
    })
    const rb = (rec.response as any).body
    expect(rb.access_token).toBe('***')
    expect(rb.refresh_token).toBe('***')
    expect(rb.id_token).toBe('***')
    expect(rb.expires_in).toBe(3600) // 非凭证键原样保留
    // form-urlencoded 字符串 body 也脱敏
    expect((rec.request as any).body).toBe('grant_type=refresh_token&refresh_token=***&scope=all')
  })
})

describe('redactBodySecrets —— body 凭证脱敏（deep JSON + 字符串两路）', () => {
  it('嵌套对象/数组里的凭证键值全遮，非凭证键（含 input_tokens 等用量）不动', () => {
    const out = redactBodySecrets({
      messages: [{ role: 'user', content: 'hi' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      auth: { access_token: 'AT', nested: { client_secret: 'CS' } },
      api_key: 'sk-xxx',
    }) as any
    expect(out.usage).toEqual({ input_tokens: 10, output_tokens: 5 })
    expect(out.messages[0].content).toBe('hi')
    expect(out.auth.access_token).toBe('***')
    expect(out.auth.nested.client_secret).toBe('***')
    expect(out.api_key).toBe('***')
  })
  it('JSON-as-string body 里的 "refresh_token":"…" 也脱敏', () => {
    expect(redactBodySecrets('{"refresh_token":"RT-secret","model":"gpt"}'))
      .toBe('{"refresh_token":"***","model":"gpt"}')
  })
  it('无凭证键 → 原样返回', () => {
    expect(redactBodySecrets({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' })
  })
  it('裸 token / session_token 等纵深键也遮（I2），access_token 不误伤内嵌 token 计数', () => {
    const out = redactBodySecrets({ token: 'T', session_token: 'ST', input_tokens: 9 }) as any
    expect(out.token).toBe('***')
    expect(out.session_token).toBe('***')
    expect(out.input_tokens).toBe(9) // input_tokens 无词边界匹配裸 token，保留
  })
})

describe('buildRecord —— path query 凭证脱敏（I1 + codex review：Google 式 ?key= / OAuth ?code=）', () => {
  it('query 里 ?access_token=/?api_key=/?key=/?code= 均被遮，非凭证参数与 path 段保留', () => {
    const rec = buildRecord({
      reqId: 'r', turn: 1, durationMs: 1, method: 'GET',
      path: '/v1beta/models/x:generateContent?access_token=AT&api_key=AK&key=GK-secret&code=OC-secret&model=gpt',
      reqHeaders: {}, reqBody: null, status: 200, respHeaders: {}, respBody: null,
    })
    const path = (rec.request as any).path
    expect(path).toContain('access_token=***')
    expect(path).toContain('api_key=***')
    expect(path).toContain('key=***') // Google 式 ?key=（codex review P1）
    expect(path).toContain('code=***') // OAuth ?code=
    expect(path).toContain('model=gpt') // 非凭证参数保留
    expect(path).toContain('/v1beta/models/x:generateContent?') // path 段原样
  })
  it('无 query → 原样（path 段不含 key= 误伤）', () => {
    const rec = buildRecord({
      reqId: 'r', turn: 1, durationMs: 1, method: 'POST', path: '/backend-api/codex/responses',
      reqHeaders: {}, reqBody: null, status: 200, respHeaders: {}, respBody: null,
    })
    expect((rec.request as any).path).toBe('/backend-api/codex/responses')
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
