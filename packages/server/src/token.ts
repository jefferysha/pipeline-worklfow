/**
 * B5 一次性 token —— 修老仓「写端点无鉴权（已接受风险）」欠账（欠账 #4 / CONTEXT.md L33）。
 * 启动生成 256-bit 随机 token；写 0600 握手文件供同源前端 / 本机可信工具读取；
 * 所有 POST 写端点校验 header（Authorization: Bearer / X-Pipeline-Token）——常量时间比较防时序侧信道。
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import type { IncomingHttpHeaders } from 'node:http'

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/** 写握手文件（0600：仅属主可读写——挡同机其它用户）。内容 = {token, ...meta}。 */
export async function writeTokenHandshake(
  tokenPath: string,
  token: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const payload = JSON.stringify({ token, ...meta })
  await writeFile(tokenPath, payload, { encoding: 'utf8', mode: 0o600 })
}

/** 从请求头取 token：优先 Authorization: Bearer <t>，回退 X-Pipeline-Token: <t>；无 → null。 */
export function tokenFromHeaders(headers: IncomingHttpHeaders): string | null {
  const auth = headers['authorization']
  if (typeof auth === 'string') {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
    if (m?.[1]) return m[1].trim()
  }
  const x = headers['x-pipeline-token']
  if (typeof x === 'string' && x.trim() !== '') return x.trim()
  return null
}

/** 常量时间比较（长度不等直接 false，不抛；空串 false）。 */
export function tokensMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
