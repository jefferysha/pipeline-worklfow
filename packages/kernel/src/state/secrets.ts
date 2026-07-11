/**
 * 机器级凭证存储 —— ~/.claude/pipeline-secrets.json（v6 T1，proposal C 节：存储 schema/掩码规则/
 * 端点鉴权）读写模块。对齐 projectRegistry.ts 的 injectable-home 模式：路径由调用方注入
 * （server main.ts 传 homedir()、cli main.ts 同样传 homedir()、hermetic 测试传临时目录），
 * kernel 不直接碰真实 HOME。
 *
 * 红线复述（proposal C 节，违反=方案作废）：
 *   · key 绝不落仓库内文件——本文件固定写到 `<home>/.claude/`，不是 `.pipeline/`（仓库内）。
 *   · 凭证值不进日志——本模块任何 throw 分支只拼接 key 名/白名单文案，绝不把 value 拼进
 *     Error message（见 assertWhitelisted）。
 *
 * 白名单仅两个真正的密钥字符串（不是任意 key-value，防手滑存了不该存的东西）：
 *   · CLAUDE_CODE_OAUTH_TOKEN（claude-code 路径）
 *   · OPENAI_API_KEY（codex 路径）
 * CODEX_HOME 刻意不进（决策点 C2b：它是目录路径不是密钥，现有 host env 透传已工作，masked
 * 显示对路径无意义）；ANTHROPIC_API_KEY 刻意不进（决策点 C2c：全链零消费者，加了是摆设字段）。
 *
 * 存储形状：`{ version: 1, keys: { CLAUDE_CODE_OAUTH_TOKEN?: string, OPENAI_API_KEY?: string } }`。
 * 读：缺失/损坏/非对象/keys 非对象 → `{ version: 1, keys: {} }`（fail-open，不抛错，绝不阻断
 *   消费方，同 readProjectRegistry 容错语义）；手塞的非白名单键在读侧过滤，不会因为文件被人手
 *   改过就把杂质 key 带出去。
 * 写：0600 权限 + 同目录 tmp+rename 原子写（对齐 token.ts::writeTokenHandshake 的 0600 先例 +
 *   projectRegistry.ts::registerProjectRoot 的 tmp+rename 先例）。POSIX 上 rename 保留源 inode
 *   的 mode 位，tmp 文件建时给的 0600 会原样带到目标文件，不需要额外 chmod。
 * 非白名单 key 写入/删除均 fail-loud 抛错——HTTP 契约层（server/src/secrets.ts）已校验一次，
 *   这里是第二道防线，供其余调用方（如 T2 cli 侧 readSecretsEnv）复用本模块时不必各自重复。
 */
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const SECRETS_FILE_NAME = 'pipeline-secrets.json'

/** 白名单：真正的密钥字符串（不是任意 key-value）。 */
export const SECRET_KEYS = ['CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY'] as const
export type SecretKey = (typeof SECRET_KEYS)[number]

export interface SecretsStore {
  version: 1
  keys: Partial<Record<SecretKey, string>>
}

function isSecretKey(key: string): key is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(key)
}

/** 白名单校验（fail-loud）：错误消息只含 key 名与白名单文案，绝不拼接调用方传入的 value。 */
function assertSecretKey(key: string): asserts key is SecretKey {
  if (!isSecretKey(key)) {
    throw new Error(`非法 key '${key}'（仅允许 ${SECRET_KEYS.join(' / ')}）`)
  }
}

/** 存储缺省路径：<home>/.claude/pipeline-secrets.json（与 pipeline-projects.json/.pipeline-dashboard-token 同目录）。 */
export function secretsPath(home: string): string {
  return join(home, '.claude', SECRETS_FILE_NAME)
}

/** 读存储：缺失/损坏/形状不对 → { version:1, keys:{} }（fail-open，不抛错，绝不阻断消费方）。 */
export function readSecrets(path: string): SecretsStore {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { version: 1, keys: {} }
    const rawKeys = (parsed as Record<string, unknown>).keys
    if (typeof rawKeys !== 'object' || rawKeys === null || Array.isArray(rawKeys)) return { version: 1, keys: {} }
    const keys: Partial<Record<SecretKey, string>> = {}
    for (const k of SECRET_KEYS) {
      const v = (rawKeys as Record<string, unknown>)[k]
      if (typeof v === 'string' && v !== '') keys[k] = v
    }
    return { version: 1, keys }
  } catch {
    return { version: 1, keys: {} }
  }
}

let tmpSeq = 0

/** 同目录 tmp+rename 原子写，tmp 文件建时即 0600（对齐 projectRegistry.ts::registerProjectRoot）。 */
async function atomicWriteSecrets(path: string, store: SecretsStore): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp.${process.pid}.${tmpSeq++}`
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(tmp, path)
}

/**
 * 写入单键（覆盖式：同键旧值直接替换，不追加；写盘形状恒为 canonical `{version,keys}`）。
 * 非白名单 key → 抛错（fail-loud）。
 */
export async function writeSecretKey(path: string, key: string, value: string): Promise<void> {
  assertSecretKey(key)
  const current = readSecrets(path)
  await atomicWriteSecrets(path, { version: 1, keys: { ...current.keys, [key]: value } })
}

/**
 * 删除单键，其余键原样保留。非白名单 key → 抛错（同 writeSecretKey 防线）。
 * 键本就未设置 → no-op（不写盘，幂等，同现有 DELETE 惯例）。
 */
export async function deleteSecretKey(path: string, key: string): Promise<void> {
  assertSecretKey(key)
  const current = readSecrets(path)
  if (!(key in current.keys)) return
  const keys = { ...current.keys }
  delete keys[key]
  await atomicWriteSecrets(path, { version: 1, keys })
}
