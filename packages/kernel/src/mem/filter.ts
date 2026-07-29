/**
 * mem/filter —— 项目/时间范围过滤原语（纯逻辑）。
 * 对位老仓 skills/pipeline/scripts/mem/filter.py。
 *
 * since/until 为 epoch ms（CLI build_filter 从 YYYY-MM-DD 解析）；会话 start/end 是 ISO 字符串。
 */
import { resolve, sep } from 'node:path'
import type { MemFs } from './fs.js'

export interface RangeFilter {
  since?: number | null
  until?: number | null
}

function parseIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * 单点范围检查：since ≤ t ≤ until。iso 缺失/不可解析 → pass through。
 * 内部用——会话列表过滤走 inRangeOverlap。
 */
export function inRange(iso: string | null | undefined, f: RangeFilter): boolean {
  const t = parseIso(iso)
  if (t === null) return true
  if (f.since != null && t < f.since) return false
  if (f.until != null && t > f.until) return false
  return true
}

/**
 * 区间重叠检查：会话生命期 [start, end] 与查询窗 [since, until] 重叠才保留。
 * 跨天/长会话（created 早于 since 但仍活在窗内）必须存活——单点 inRange(created) 会误杀。
 * 退化：都空 → pass through；一端空 → 退到另一端单点语义；不可解析 iso → 让位可解析端。
 */
export function inRangeOverlap(
  start: string | null | undefined,
  end: string | null | undefined,
  f: RangeFilter,
): boolean {
  const s = start || end
  const e = end || start
  if (!s && !e) return true
  if (f.since != null && e) {
    const et = parseIso(e)
    if (et !== null && et < f.since) return false
  }
  if (f.until != null && s) {
    const st = parseIso(s)
    if (st !== null && st > f.until) return false
  }
  return true
}

/**
 * True iff sessionCwd 在 target 内（精确或后代目录）。target 空 → 无作用域全过；
 * 作用域下未知 cwd 丢弃。b+sep 防 /foo 误匹配 /foobar。
 */
export function sameProject(sessionCwd: string | null | undefined, target: string | null | undefined): boolean {
  if (!target) return true
  if (!sessionCwd) return false
  const a = resolve(sessionCwd)
  const b = resolve(target)
  return a === b || a.startsWith(b + sep)
}

/**
 * Related Sessions must compare physical paths so a lexical descendant symlink cannot escape the
 * registered root. Legacy mem callers retain sameProject's lexical compatibility contract.
 */
export function sameProjectForMemFs(
  fs: MemFs,
  sessionCwd: string | null | undefined,
  target: string | null | undefined,
): boolean {
  if (!fs.enforcePhysicalProjectScope) return sameProject(sessionCwd, target)
  if (!target) return true
  if (!sessionCwd || !fs.realPath) {
    fs.contentReadBudget?.noteProjectScopeUnavailable?.()
    return false
  }
  const physicalSession = fs.realPath(sessionCwd)
  const physicalTarget = fs.realPath(target)
  if (!physicalSession || !physicalTarget) {
    fs.contentReadBudget?.noteProjectScopeUnavailable?.()
    return false
  }
  return sameProject(physicalSession, physicalTarget)
}
