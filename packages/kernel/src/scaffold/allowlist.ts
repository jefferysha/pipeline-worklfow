/**
 * known-untracked-template-allowlist —— 已知不追踪模板 hash 白名单（🔴 唯一 missing，N/A-with-entry）。
 *
 * 老仓真相源（严格只读参考）：skills/pipeline/scripts/migrations.py:61-83
 *   KNOWN_UNTRACKED_ALLOWLIST = {}（空常量）+ apply_known_untracked_allowlist(cwd, hashes)（原样返回）。
 *
 * Trellis 语义（parity 收尾 ④）：Trellis 有「无 hash→hash-track」迁移期的历史包袱——旧项目里 pristine
 *   的 untracked 模板（如早期 AGENTS.md）无存储 hash，为让它们能走 auto-update 而非保守 changed，Trellis
 *   维护一份 hash 白名单在 classify 之前并入 stored hashes。
 *
 * ★诚实标注（GOAL C 精神，老仓自标 N/A，本移植如实沿用——不硬凑）：
 *   pipeline 从设计起就 hash-track，**无**该迁移期，故白名单为空、无对应用例。忠实补齐老仓的
 *   「N/A 但留占位入口」：空常量 + pass-through 应用 + 判定函数。空白名单下三者全无副作用。
 *   将来若 pipeline 真经历该迁移期，只需填 KNOWN_UNTRACKED_ALLOWLIST = { relPath: [hash,...] }，
 *   在 ownership.classifyOwned/loadOwnedManifest 之前对 stored hashes 跑一次 applyKnownUntrackedAllowlist
 *   即可，**不必**届时改 classify 主路径（接线见 CLI scaffold.ts 顶注 + 报告）。
 *
 * key 归一复用 ownership.normalizeOwnedKey（与 owned manifest 同口径 POSIX）。kernel 零第三方依赖。
 */
import { normalizeOwnedKey } from '../state/ownership.js'

/**
 * 已知不追踪模板 hash 白名单：{ POSIX相对路径: [允许的 pristine hash, ...] }。
 * N/A 占位——当前为空（pipeline 无「无 hash→hash-track」迁移期）。
 */
export const KNOWN_UNTRACKED_ALLOWLIST: Record<string, readonly string[]> = {}

/**
 * 在 classify 前把白名单 hash 并入 stored hashes（对标 apply_known_untracked_allowlist）：
 *   · 白名单为空 → **原样返回同一 stored（零拷贝 pass-through，无副作用）**。
 *   · 否则：对每个 rel，若 stored 未含且其 hash 列表非空 → 并入首个 hash（归一 key）；不覆盖既有。
 * 纯函数，非空分支不改入参。
 */
export function applyKnownUntrackedAllowlist(
  stored: Record<string, string>,
  allowlist: Record<string, readonly string[]> = KNOWN_UNTRACKED_ALLOWLIST,
): Record<string, string> {
  if (Object.keys(allowlist).length === 0) return stored // 空 → 原样返回（对标 if not KNOWN...: return hashes）
  const merged = { ...stored }
  for (const [rel, hashList] of Object.entries(allowlist)) {
    if (hashList.length === 0) continue
    const key = normalizeOwnedKey(rel) ?? rel
    if (!(key in merged) && !(rel in merged)) {
      merged[key] = hashList[0] as string
    }
  }
  return merged
}

/**
 * 判定 (rel, hash) 是否为白名单认可的 pristine 未追踪模板。
 * 空白名单恒 false；否则归一 rel 后查其允许 hash 列表是否含 hash。
 */
export function isKnownUntracked(
  rel: string,
  hash: string,
  allowlist: Record<string, readonly string[]> = KNOWN_UNTRACKED_ALLOWLIST,
): boolean {
  const key = normalizeOwnedKey(rel) ?? rel
  const list = allowlist[key] ?? allowlist[rel]
  return list !== undefined && list.includes(hash)
}
