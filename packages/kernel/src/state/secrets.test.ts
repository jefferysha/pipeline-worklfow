/**
 * secrets.test —— 机器级凭证存储 ~/.claude/pipeline-secrets.json 读写（T1，hermetic 临时 HOME，
 * 对齐 projectRegistry.test.ts 基座：真 fs、mkdtemp 隔离，绝不碰真实 HOME）。
 */
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { deleteSecretKey, readSecrets, SECRET_KEYS, secretsPath, writeSecretKey } from './secrets.js'

describe('secrets —— 机器级凭证存储读写（T1，proposal C 节）', () => {
  let home: string
  let path: string
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'lite-secrets-'))
    path = secretsPath(home)
  })
  afterEach(async () => {
    // 不可写用例会把目录改成只读，先恢复权限再删（对齐 projectRegistry.test.ts 收尾）
    await chmod(join(home, '.claude'), 0o755).catch(() => {})
    await rm(home, { recursive: true, force: true })
  })

  test('secretsPath = <home>/.claude/pipeline-secrets.json（同 pipeline-projects.json/.pipeline-dashboard-token 目录）', () => {
    expect(path).toBe(join(home, '.claude', 'pipeline-secrets.json'))
  })

  test('SECRET_KEYS 白名单恰为两项：CLAUDE_CODE_OAUTH_TOKEN / OPENAI_API_KEY（不含 CODEX_HOME/ANTHROPIC_API_KEY，见决策 C2b/C2c）', () => {
    expect(SECRET_KEYS).toEqual(['CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY'])
  })

  describe('readSecrets —— 容错语义（fail-open，绝不阻断消费方）', () => {
    test('文件缺失 → { version:1, keys:{} }（不抛错）', () => {
      expect(readSecrets(path)).toEqual({ version: 1, keys: {} })
    })

    test('损坏 JSON → 空 keys', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(path, '{oops', 'utf8')
      expect(readSecrets(path)).toEqual({ version: 1, keys: {} })
    })

    test('非对象顶层 JSON（数组/字符串）→ 空 keys', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(path, '[1,2,3]', 'utf8')
      expect(readSecrets(path)).toEqual({ version: 1, keys: {} })
      await writeFile(path, '"just-a-string"', 'utf8')
      expect(readSecrets(path)).toEqual({ version: 1, keys: {} })
    })

    test('keys 字段非对象（数组/字符串）→ 空 keys', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(path, JSON.stringify({ version: 1, keys: ['a', 'b'] }), 'utf8')
      expect(readSecrets(path)).toEqual({ version: 1, keys: {} })
    })

    test('合法内容原样读出', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(path, JSON.stringify({ version: 1, keys: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-abc1234567' } }), 'utf8')
      expect(readSecrets(path)).toEqual({ version: 1, keys: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-abc1234567' } })
    })

    test('手塞非白名单 key（如 ANTHROPIC_API_KEY/CODEX_HOME）→ 读侧过滤，不出现在结果里', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await writeFile(
        path,
        JSON.stringify({ version: 1, keys: { CLAUDE_CODE_OAUTH_TOKEN: 'tok', ANTHROPIC_API_KEY: 'sneaky', CODEX_HOME: '/x' } }),
        'utf8',
      )
      expect(readSecrets(path)).toEqual({ version: 1, keys: { CLAUDE_CODE_OAUTH_TOKEN: 'tok' } })
    })
  })

  describe('writeSecretKey —— 白名单校验 + 0600 权限 + 原子写', () => {
    test('①写入后文件 mode 恰为 0o600', async () => {
      await writeSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN', 'sk-test-value-123')
      const st = await stat(path)
      expect(st.mode & 0o777).toBe(0o600)
    })

    test('②tmp+rename 原子写：同目录内写后只剩最终文件，无 *.tmp* 残留', async () => {
      await writeSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN', 'v1')
      await writeSecretKey(path, 'OPENAI_API_KEY', 'v2')
      const entries = await readdir(join(home, '.claude'))
      expect(entries).toEqual(['pipeline-secrets.json'])
    })

    test('③非白名单 key 写入抛错，且不落盘（fail-loud，防线不是唯一防线——HTTP 契约层另有一道）', async () => {
      await expect(writeSecretKey(path, 'ANTHROPIC_API_KEY', 'x')).rejects.toThrow()
      await expect(writeSecretKey(path, 'CODEX_HOME', '/some/path')).rejects.toThrow()
      await expect(writeSecretKey(path, 'RANDOM_JUNK', 'x')).rejects.toThrow()
      expect(readSecrets(path)).toEqual({ version: 1, keys: {} })
    })

    test('写入内容真实可回读（round-trip）', async () => {
      await writeSecretKey(path, 'OPENAI_API_KEY', 'sk-proj-abcdef1234')
      expect(readSecrets(path)).toEqual({ version: 1, keys: { OPENAI_API_KEY: 'sk-proj-abcdef1234' } })
    })

    test('同键重复写入覆盖旧值（不追加）', async () => {
      await writeSecretKey(path, 'OPENAI_API_KEY', 'first-value')
      await writeSecretKey(path, 'OPENAI_API_KEY', 'second-value')
      expect(readSecrets(path)).toEqual({ version: 1, keys: { OPENAI_API_KEY: 'second-value' } })
    })

    test('写一个键不影响另一个已存在的键', async () => {
      await writeSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN', 'claude-tok')
      await writeSecretKey(path, 'OPENAI_API_KEY', 'openai-tok')
      expect(readSecrets(path)).toEqual({
        version: 1,
        keys: { CLAUDE_CODE_OAUTH_TOKEN: 'claude-tok', OPENAI_API_KEY: 'openai-tok' },
      })
    })

    test('并发写不同键不丢更新（withLock 串行化 read-modify-write；codex review P1 回归守）', async () => {
      // 无锁时两个并发 read-modify-write 各读同一旧态、后 rename 覆盖前者 → 丢一个键。
      await Promise.all([
        writeSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN', 'claude-concurrent'),
        writeSecretKey(path, 'OPENAI_API_KEY', 'openai-concurrent'),
      ])
      expect(readSecrets(path)).toEqual({
        version: 1,
        keys: { CLAUDE_CODE_OAUTH_TOKEN: 'claude-concurrent', OPENAI_API_KEY: 'openai-concurrent' },
      })
    })

    test('并发写+删不同键互不吞没', async () => {
      await writeSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN', 'keep-me')
      await Promise.all([
        writeSecretKey(path, 'OPENAI_API_KEY', 'new-openai'),
        deleteSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN'),
      ])
      // claude 被删、openai 被写，两个操作都不因竞态互相覆盖
      expect(readSecrets(path)).toEqual({ version: 1, keys: { OPENAI_API_KEY: 'new-openai' } })
    })

    test('目录不可写 → 抛错（fail-loud；best-effort 由调用方兜，对齐 projectRegistry.ts 职责切分）', async () => {
      await mkdir(join(home, '.claude'), { recursive: true })
      await chmod(join(home, '.claude'), 0o555)
      await expect(writeSecretKey(path, 'OPENAI_API_KEY', 'x')).rejects.toThrow()
    })
  })

  describe('deleteSecretKey —— 删单键，其余键保留', () => {
    test('④删除单键后其余键保留', async () => {
      await writeSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN', 'tok-1')
      await writeSecretKey(path, 'OPENAI_API_KEY', 'tok-2')
      await deleteSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN')
      expect(readSecrets(path)).toEqual({ version: 1, keys: { OPENAI_API_KEY: 'tok-2' } })
    })

    test('删除不存在的键 → 不抛错、幂等（同现有 DELETE 惯例）', async () => {
      await expect(deleteSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN')).resolves.toBeUndefined()
      expect(readSecrets(path)).toEqual({ version: 1, keys: {} })
    })

    test('非白名单 key 删除抛错', async () => {
      await expect(deleteSecretKey(path, 'ANTHROPIC_API_KEY')).rejects.toThrow()
    })

    test('删除后文件仍保持 0600 权限', async () => {
      await writeSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN', 'tok-1')
      await writeSecretKey(path, 'OPENAI_API_KEY', 'tok-2')
      await deleteSecretKey(path, 'CLAUDE_CODE_OAUTH_TOKEN')
      const st = await stat(path)
      expect(st.mode & 0o777).toBe(0o600)
    })
  })

  test('⑤文件缺失时读取返回空 keys 集合（fail-open，不抛错——同上方 readSecrets 首个用例，交叉核对 TDD 判据编号）', () => {
    expect(() => readSecrets(join(home, '.claude', 'never-written.json'))).not.toThrow()
    expect(readSecrets(join(home, '.claude', 'never-written.json'))).toEqual({ version: 1, keys: {} })
  })

  test('凭证值不进异常消息：非白名单 key 的错误文案不包含调用方传入的 value', async () => {
    const sensitiveValue = 'super-secret-should-never-leak-xyz789'
    await expect(writeSecretKey(path, 'NOT_WHITELISTED', sensitiveValue)).rejects.toSatisfy((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      return !msg.includes(sensitiveValue)
    })
  })
})
