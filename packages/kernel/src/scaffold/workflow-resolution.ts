/**
 * workflow-template-resolution —— 多 workflow id 解析 + removeHash 更新契约（纯逻辑）。
 *
 * 老仓真相源（严格只读参考 skills/pipeline/scripts/）：
 *   pipeline-workflow-variant.sh —— cmd_list / cmd_switch / resolve_workflow_template /
 *     _index_workflow_ids（列 marketplace 条目、跳 id==native 去重、native-always-first）/
 *     apply_hash_contract（非对称 hash 契约，见下）。
 *   template-hash.py update-entry / remove-entry —— 记 hash / 删条目 单文件 CLI。
 *
 * Trellis 语义（parity 收尾 ③「--workflow / --workflow-source resolution」）：
 *   Trellis init 支持按 workflow id 从 source 解析多个 workflow 变体，并在写盘后跑 hash 契约让升级
 *   不还原用户选择。老仓 partial：workflow.md 是插件单一权威文件（SessionStart 注入）+ preset 强度变体，
 *   无「多 workflow id 解析 + removeHash 更新契约」。本模块补齐纯逻辑：
 *     · parseWorkflowIds  —— 解析 source 索引成多 id（跳 native 去重、保序）。
 *     · resolveWorkflow   —— 请求 id → 解析（native offline-first 永远可用；源命中则非 native）。
 *     · applyWorkflowHashContract —— removeHash 更新契约（非对称，对标 apply_hash_contract）：
 *         native → 记 hash（record，升级把 native 当受管模板可 auto_update）；
 *         非 native → 删 hash 条目（remove，让升级 classify 见 storedHash=∅ → changed，绝不还原 native）。
 *
 * hash 计算/归一复用 ownership.ts（同包，单一真相源；CRLF→LF SHA256 与 owned manifest 一致）。
 * kernel 零第三方依赖（仅经 ownership 间接用 node:crypto 内建）。
 */
import { computeContentHash, normalizeOwnedKey, recordOwned } from '../state/ownership.js'

/** 内建 native workflow id（离线优先，永远可用；老仓 native-always-first）。 */
export const NATIVE_WORKFLOW_ID = 'native'
/** 活跃 workflow.md 落点（老仓 .pipeline/workflow.md）——removeHash 契约的 key。 */
export const WORKFLOW_MD_REL = '.pipeline/workflow.md'
/** workflow 来源 marker 文件名（记录非 native 来源 → 让升级不还原 native 的可见信号）。 */
export const WORKFLOW_SOURCE_MARKER = '.pipeline-workflow-source'

/**
 * 解析 source 索引成 workflow id 列表（对标 _index_workflow_ids）：
 *   逐行取首个空白分隔 token 为 id；跳空行/注释（# 开头）；丢弃 id==native（永远单列）；去重保序。
 */
export function parseWorkflowIds(indexText: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of indexText.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const id = line.split(/\s+/)[0] ?? ''
    if (id === '' || id === NATIVE_WORKFLOW_ID) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export type WorkflowResolution =
  | { ok: true; id: string; isNative: boolean; source: boolean }
  | { ok: false; error: string; available: string[] }

/**
 * 请求 workflow id → 解析：
 *   · 空 / undefined / 'native' → native（isNative=true, source=false）——离线优先永远可用。
 *   · 请求命中 available（source 索引 id）→ 非 native（isNative=false, source=true）。
 *   · 否则 → ok:false + 携带 available（调用方决定 fail 还是降级 native）。
 */
export function resolveWorkflow(
  requested: string | undefined,
  available: readonly string[],
): WorkflowResolution {
  if (requested === undefined || requested === '' || requested === NATIVE_WORKFLOW_ID) {
    return { ok: true, id: NATIVE_WORKFLOW_ID, isNative: true, source: false }
  }
  if (available.includes(requested)) {
    return { ok: true, id: requested, isNative: false, source: true }
  }
  return {
    ok: false,
    error: `unknown workflow id '${requested}' (available: ${available.length ? available.join(', ') : '(none)'} + native)`,
    available: [...available],
  }
}

/** hash 契约动作（native→record / 非 native→remove，非对称）。 */
export function workflowHashAction(isNative: boolean): 'record' | 'remove' {
  return isNative ? 'record' : 'remove'
}

/** 删除 workflow hash 条目（归一 key；纯，不改入参）——removeHash 契约的 remove 半边。 */
export function removeWorkflowHash(
  hashes: Record<string, string>,
  key: string,
): Record<string, string> {
  const norm = normalizeOwnedKey(key)
  const out = { ...hashes }
  if (norm !== undefined) delete out[norm]
  delete out[key]
  return out
}

/**
 * removeHash 更新契约（对标 apply_hash_contract 非对称）：
 *   · 非 native → removeWorkflowHash（删条目，升级不还原 native）。
 *   · native + 有内容 → recordOwned（记 content hash，native 保持受管模板）。
 *   · native + 无内容 → 原样返回（无法记 hash 时不误记空、不误删；保守 no-op）。
 * 纯函数，不改入参。
 */
export function applyWorkflowHashContract(
  hashes: Record<string, string>,
  key: string,
  isNative: boolean,
  content?: string,
): Record<string, string> {
  if (!isNative) return removeWorkflowHash(hashes, key)
  if (content === undefined) return { ...hashes }
  return recordOwned(hashes, key, computeContentHash(content))
}

/** workflow 来源 marker 文件内容（记 resolved id + source + 时间戳；升级读此判非 native）。 */
export function workflowSourceMarkerContent(id: string, source: string | undefined, ts: string): string {
  return (
    `id=${id}\n` +
    `source=${source ?? ''}\n` +
    `resolved_at=${ts}\n` +
    `# 本 workflow 由 --workflow-source 解析而来；升级时经 removeHash 契约保留，不还原 native。\n`
  )
}
