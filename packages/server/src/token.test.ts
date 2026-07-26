/** token.test —— B5 一次性 token：生成 / 0600 握手文件 / header 解析 / 常量时间比较（真 fs）。 */
import { describe, expect, it } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { generateToken, tokenFromHeaders, tokensMatch, writeTokenHandshake } from './token.js'
import { makeTempHome } from './test-support.js'

describe('generateToken', () => {
  it('64 位十六进制（256-bit）且两次不同', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe('writeTokenHandshake —— 0600 握手文件', () => {
  it('真写文件、权限 0600、内容含 token', async () => {
    const home = await makeTempHome()
    const p = join(home, 'dashboard-token.json')
    await writeTokenHandshake(p, 'tok-123', { pid: 4242, port: 8765 })
    const st = await stat(p)
    expect(st.mode & 0o777).toBe(0o600)
    const parsed = JSON.parse(await readFile(p, 'utf8'))
    expect(parsed.token).toBe('tok-123')
    expect(parsed.port).toBe(8765)
  })
})

describe('tokenFromHeaders', () => {
  it('Authorization: Bearer <t>', () => {
    expect(tokenFromHeaders({ authorization: 'Bearer abc' })).toBe('abc')
  })
  it('X-Pipeline-Token: <t>', () => {
    expect(tokenFromHeaders({ 'x-pipeline-token': 'xyz' })).toBe('xyz')
  })
  it('缺失 → null', () => {
    expect(tokenFromHeaders({})).toBeNull()
  })
})

describe('tokensMatch —— 常量时间比较', () => {
  it('相等 → true', () => {
    expect(tokensMatch('deadbeef', 'deadbeef')).toBe(true)
  })
  it('不等 → false', () => {
    expect(tokensMatch('deadbeef', 'deadbee0')).toBe(false)
  })
  it('长度不同 → false（不抛）', () => {
    expect(tokensMatch('short', 'longer-token')).toBe(false)
  })
  it('空串 → false', () => {
    expect(tokensMatch('', 'x')).toBe(false)
  })
})
