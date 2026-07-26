/**
 * secrets —— 机器级凭证存储 HTTP 契约层（v6 T1，proposal C 节：存储 schema/掩码规则/端点鉴权）。
 * 只做 body 校验 + masking 规则 + 调用 kernel 存储原语（真落盘）；server.ts 只做接线（三端点
 * 路由分派 + 已有 Host/token 三道纵深复用），业务逻辑集中在本文件，对齐
 * automationConfig.ts/hooksConfig.ts「业务逻辑独立同名模块」惯例。
 *
 * 红线复述：本文件任何分支均不得把 value 明文拼进返回体/异常消息——GET 只回 masked（C.3：
 * 「永不回明文」），POST 的确认响应同样只回 masked（不是原值），这条纪律对两个端点一致。
 *
 * 白名单：CLAUDE_CODE_OAUTH_TOKEN（claude-code）/ OPENAI_API_KEY（codex），直接复用 kernel
 * secrets.ts 的 SECRET_KEYS（不本地重复定义，避免两侧漂移）。CODEX_HOME 刻意不进（决策点
 * C2b：路径不是密钥，现有 host env 透传已工作）；ANTHROPIC_API_KEY 刻意不进（决策点 C2c：
 * 全链零消费者，加了是摆设字段）。
 */
import { deleteSecretKey, readSecrets, SECRET_KEYS, writeSecretKey } from '@tenon/kernel'
import type { SecretKey } from '@tenon/kernel'

/** 4KB，纯防御（防误粘贴大段文本膨胀文件），不对值本身做格式假设（不同 provider token 形状不同）。 */
const MAX_VALUE_LENGTH = 4096

/** 供路由层错误消息复用，避免各处各写一份白名单文案（server.ts 的 DELETE 分支消费）。 */
export const SECRET_KEY_LIST = SECRET_KEYS.join(' / ')

export function isValidSecretKey(key: string): key is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(key)
}

/** masked 规则（C.3，逐字符对应示例 sk-…7f3a）：>10 字符取前3+…+后4；否则整体 ***（防御短值）。 */
export function maskSecret(value: string): string {
  if (value.length > 10) return `${value.slice(0, 3)}…${value.slice(-4)}`
  return '***'
}

export interface SecretKeyInfo {
  set: boolean
  masked?: string
}

export type SecretsKeys = Record<SecretKey, SecretKeyInfo>

export interface SecretsResponse {
  ok: true
  keys: SecretsKeys
}

/** GET /api/secrets 响应体：白名单每键给 set +（已设置时）masked；未设置键不带 masked 字段。 */
export function buildSecretsResponse(path: string): SecretsResponse {
  const store = readSecrets(path)
  const keys = {} as SecretsKeys
  for (const key of SECRET_KEYS) {
    const value = store.keys[key]
    keys[key] = typeof value === 'string' && value !== '' ? { set: true, masked: maskSecret(value) } : { set: false }
  }
  return { ok: true, keys }
}

export type SecretWriteValidation =
  | { ok: true; value: { key: SecretKey; value: string } }
  | { ok: false; error: string }

/** POST /api/secrets 请求体校验（fail-loud 400；不需要 root——机器级资源，见 proposal C.3）。 */
export function validateSecretWriteBody(body: unknown): SecretWriteValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: '请求体须为 JSON 对象' }
  }
  const { key, value } = body as Record<string, unknown>
  if (typeof key !== 'string' || !isValidSecretKey(key)) {
    return { ok: false, error: `非法 key（仅允许 ${SECRET_KEY_LIST}）` }
  }
  if (typeof value !== 'string' || value === '') {
    return { ok: false, error: 'value 须为非空字符串' }
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return { ok: false, error: `value 过长（≤ ${MAX_VALUE_LENGTH} 字符）` }
  }
  return { ok: true, value: { key, value } }
}

/** 真写入 + 返回该键的最新 masked 信息（供 POST 响应直接回显，绝不带原值）。 */
export async function writeSecret(path: string, key: SecretKey, value: string): Promise<SecretKeyInfo> {
  await writeSecretKey(path, key, value)
  return { set: true, masked: maskSecret(value) }
}

/** 真删除单键（幂等：本就未设置也不报错，见 kernel deleteSecretKey）。 */
export async function removeSecret(path: string, key: SecretKey): Promise<void> {
  await deleteSecretKey(path, key)
}
