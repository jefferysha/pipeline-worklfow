/**
 * secrets.test —— HTTP 契约层单测：masked 规则 + body 校验 + 真落盘响应体不含明文
 * （server 侧，真 fs mkdtemp 隔离，不碰真实 HOME）。HTTP 端到端鉴权/round-trip 测试见
 * server.test.ts 的 `POST/GET/DELETE /api/secrets` 描述块；kernel 存储原语测试见
 * packages/kernel/src/state/secrets.test.ts。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSecrets, secretsPath } from '@pipeline-lite/kernel'
import {
  buildSecretsResponse, isValidSecretKey, maskSecret, removeSecret, SECRET_KEY_LIST, validateSecretWriteBody, writeSecret,
} from './secrets.js'

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pl-dash-secrets-'))
}

describe('maskSecret —— C.3 掩码规则（3 前缀+省略号+4 后缀，逐字符对应 sk-…7f3a 示例）', () => {
  it('①长度 >10 → 前 3 + 省略号 + 后 4', () => {
    expect(maskSecret('sk-ant-api03-abcdef7f3a')).toBe('sk-…7f3a')
    expect(maskSecret('12345678901')).toBe('123…8901') // 恰 11 位，边界值
  })

  it('②长度 ≤10（含恰为 10 的边界）→ 兜底整体 ***', () => {
    for (const v of ['', 'x', 'shortval', '1234567890']) {
      expect(maskSecret(v)).toBe('***')
    }
  })

  it('③掩码结果不含原始 value（防泄露基本检查）', () => {
    const secret = 'sk-ant-oat01-superlongsecretvalue7f3a'
    const masked = maskSecret(secret)
    expect(masked).not.toContain(secret)
    expect(masked.length).toBeLessThan(secret.length)
  })
})

describe('isValidSecretKey', () => {
  it('白名单内 → true；CODEX_HOME/ANTHROPIC_API_KEY/任意字符串 → false（决策 C2b/C2c）', () => {
    expect(isValidSecretKey('CLAUDE_CODE_OAUTH_TOKEN')).toBe(true)
    expect(isValidSecretKey('OPENAI_API_KEY')).toBe(true)
    expect(isValidSecretKey('CODEX_HOME')).toBe(false)
    expect(isValidSecretKey('ANTHROPIC_API_KEY')).toBe(false)
    expect(isValidSecretKey('')).toBe(false)
  })
})

describe('validateSecretWriteBody —— POST /api/secrets 请求体校验（fail-loud 400）', () => {
  it('非对象 body → 拒绝', () => {
    for (const bad of [null, 'x', 42, ['a'], undefined]) {
      expect(validateSecretWriteBody(bad).ok).toBe(false)
    }
  })

  it('key 非白名单 → 拒绝（含 CODEX_HOME/ANTHROPIC_API_KEY 这两个刻意排除的键）', () => {
    for (const bad of ['ANTHROPIC_API_KEY', 'CODEX_HOME', 'RANDOM', '', 42]) {
      expect(validateSecretWriteBody({ key: bad, value: 'x' }).ok).toBe(false)
    }
  })

  it('value 非字符串/空串 → 拒绝', () => {
    for (const bad of [undefined, 42, '', null, ['x']]) {
      expect(validateSecretWriteBody({ key: 'OPENAI_API_KEY', value: bad }).ok).toBe(false)
    }
  })

  it('value 超过 4KB → 拒绝；恰 4KB → 放行', () => {
    const tooLong = 'x'.repeat(4097)
    expect(validateSecretWriteBody({ key: 'OPENAI_API_KEY', value: tooLong }).ok).toBe(false)
    const exact = 'x'.repeat(4096)
    expect(validateSecretWriteBody({ key: 'OPENAI_API_KEY', value: exact }).ok).toBe(true)
  })

  it('合法 body → ok + 归一值', () => {
    const r = validateSecretWriteBody({ key: 'CLAUDE_CODE_OAUTH_TOKEN', value: 'sk-test-abc123' })
    expect(r).toEqual({ ok: true, value: { key: 'CLAUDE_CODE_OAUTH_TOKEN', value: 'sk-test-abc123' } })
  })

  it('SECRET_KEY_LIST 供路由层错误文案复用，含两个白名单键名', () => {
    expect(SECRET_KEY_LIST).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    expect(SECRET_KEY_LIST).toContain('OPENAI_API_KEY')
  })
})

describe('buildSecretsResponse / writeSecret / removeSecret —— 真落盘 + 响应体不含明文', () => {
  it('未设置任何 key → 两键皆 set:false，不带 masked 字段', async () => {
    const home = await tempHome()
    const path = secretsPath(home)
    const resp = buildSecretsResponse(path)
    expect(resp).toEqual({
      ok: true,
      keys: { CLAUDE_CODE_OAUTH_TOKEN: { set: false }, OPENAI_API_KEY: { set: false } },
    })
  })

  it('写入后响应体含 masked 值，不含原始 value 子串；真落盘可被 kernel 层回读出真值', async () => {
    const home = await tempHome()
    const path = secretsPath(home)
    const secretValue = 'sk-ant-oat01-realvaluesecretxyz789'

    const info = await writeSecret(path, 'CLAUDE_CODE_OAUTH_TOKEN', secretValue)
    expect(info.set).toBe(true)
    expect(info.masked).toBe(maskSecret(secretValue))
    expect(JSON.stringify(info)).not.toContain(secretValue)

    const resp = buildSecretsResponse(path)
    expect(JSON.stringify(resp)).not.toContain(secretValue)
    expect(resp.keys.CLAUDE_CODE_OAUTH_TOKEN).toEqual({ set: true, masked: maskSecret(secretValue) })
    expect(resp.keys.OPENAI_API_KEY).toEqual({ set: false })

    // 落盘本身就该是真值（write-only 是 HTTP 响应/日志的纪律，不是磁盘内容的纪律）
    const onDisk = readSecrets(path)
    expect(onDisk.keys.CLAUDE_CODE_OAUTH_TOKEN).toBe(secretValue)
  })

  it('删除后 set:false', async () => {
    const home = await tempHome()
    const path = secretsPath(home)
    await writeSecret(path, 'OPENAI_API_KEY', 'sk-proj-abcdefghij')
    await removeSecret(path, 'OPENAI_API_KEY')
    const resp = buildSecretsResponse(path)
    expect(resp.keys.OPENAI_API_KEY).toEqual({ set: false })
  })

  it('写一个键不影响另一个键的 set/masked 值', async () => {
    const home = await tempHome()
    const path = secretsPath(home)
    await writeSecret(path, 'CLAUDE_CODE_OAUTH_TOKEN', 'claude-secret-value-1')
    await writeSecret(path, 'OPENAI_API_KEY', 'openai-secret-value-2')
    const resp = buildSecretsResponse(path)
    expect(resp.keys.CLAUDE_CODE_OAUTH_TOKEN.set).toBe(true)
    expect(resp.keys.OPENAI_API_KEY.set).toBe(true)
    expect(resp.keys.CLAUDE_CODE_OAUTH_TOKEN.masked).not.toBe(resp.keys.OPENAI_API_KEY.masked)
  })
})
