/**
 * mem/projects —— 项目聚合：distinct 会话 cwd + 最后活跃时间 + per-platform 计数（注入 fs）。
 * 对位老仓 skills/pipeline/scripts/mem/projects.py。
 */
import type { MemFilter, MemPlatform, ProjectAgg } from './types.js'
import type { MemFs } from './fs.js'
import { listAll, resolveFilter, WIDE_LIMIT } from './sessions.js'

/**
 * 聚合每平台 distinct 项目 cwd。总是全局扫（cwd 作用域丢弃）——since/until/platform 仍生效。
 * 按 last_active 降序，caller 决定显示 cap。
 */
export function listMemProjects(fs: MemFs, options?: { filter?: Partial<MemFilter> }): ProjectAgg[] {
  const f = resolveFilter(options?.filter)
  const wide: MemFilter = { ...f, cwd: null, limit: WIDE_LIMIT }
  const all = listAll(fs, wide)

  const byCwd = new Map<string, ProjectAgg>()
  for (const s of all) {
    const cwd = s.cwd
    if (!cwd) continue
    const ts = s.updated || s.created || ''
    let agg = byCwd.get(cwd)
    if (!agg) {
      agg = { cwd, last_active: ts, sessions: 0, by_platform: { claude: 0, codex: 0, opencode: 0, pi: 0 } }
      byCwd.set(cwd, agg)
    }
    agg.sessions += 1
    agg.by_platform[s.platform as MemPlatform] += 1
    if (ts > agg.last_active) agg.last_active = ts
  }

  return [...byCwd.values()].sort((a, b) => (a.last_active < b.last_active ? 1 : a.last_active > b.last_active ? -1 : 0))
}
