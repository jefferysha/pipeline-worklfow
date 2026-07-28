/**
 * mem —— 跨 runtime 会话历史检索子系统（BACKLOG #28 / GOAL A4 M4 / D3 超越 Tenon contract workspace journal）。
 *
 * 只读、零第三方依赖、注入 fs 面（绝不写用户 session 历史）。可复用的检索 + 对话上下文抽取，
 * 覆盖持久化的 Claude Code / Codex / OpenCode / Pi 会话。CLI 薄壳在 packages/cli/src/commands/mem.ts。
 *
 * ── 六子命令语义（老仓 skills/pipeline/scripts/mem/cli.py 真相源）──────────────────────────
 *   list     (默认)      list_all fan-out 跨平台会话头，recency 降序，cap limit    老仓 cli.py:200 / sessions.py:58
 *   search   <keyword>   多 token AND grep 全会话内容，加权密度评分排序           老仓 cli.py:218 / search.py:42 / sessions.py:263
 *   context  <id>        钻入单会话：top-N hit turn + around 上下文 + 字符预算      老仓 cli.py:305 / context.py:11,95
 *   extract  <id>        dump 清洗对话（--phase brainstorm/implement 切片，--grep 过滤）老仓 cli.py:401 / sessions.py:339 / phase.py:160
 *   projects             聚合 distinct 会话 cwd + per-platform 计数（发现 --cwd）    老仓 cli.py:274 / projects.py:11
 *   help                 用法                                                       老仓 cli.py:465
 *
 * ── 跨 runtime 会话格式（老仓 adapters/*.py 真相源）───────────────────────────────────────
 *   claude    ~/.claude/projects/<sanitize(cwd)>/<sessionId>.jsonl (+ sessions-index.json)
 *             事件行 type=user/assistant，assistant content 是 block 数组只取 text；isCompactSummary 重置。
 *             cwd sanitize：[/\\:_.] → -（claude.py / paths.py:41）
 *   codex     ~/.codex/sessions/**\/rollout-<ISO->-<id>.jsonl；首行 payload=meta(id/cwd)，
 *             message payload content=input_text/output_text；compacted.replacement_history 重置（codex.py）
 *   opencode  1.2+ SQLite —— node:sqlite 内建模块真读（零第三方依赖，G5 已闭，iteration-32 批次）；
 *             node 22.5–22.12 需 --experimental-sqlite 标志，探测不到时诚实降级空结果（不抛不假绿）
 *   pi        ~/.pi/agent/sessions/--<enc-cwd>--/<ts>_<id>.jsonl（+ env/settings 自定义根）；
 *             entry 经 id/parentId 成树，extract 沿末 leaf 回溯活跃分支 + compaction firstKeptEntryId 重建（pi.py）
 *
 * 覆盖状态：claude/codex/pi/opencode 全量移植（list/search/context/extract/projects + phase 切片 +
 *          compaction）；opencode 在不支持 node:sqlite 的运行时诚实降级空结果（见 opencodeSqliteAvailable）。
 */

// 类型契约
export type {
  BrainstormWindow,
  ContextResult,
  ContextTurn,
  DialogueGroup,
  DialogueTurn,
  ExtractResult,
  MemFilter,
  MemPhase,
  MemPlatform,
  MemPlatformFilter,
  MemSession,
  MemWarning,
  ParsedTaskCmd,
  PhaseEvent,
  ProjectAgg,
  RelatedSessionMatch,
  RelatedSessionSearchResult,
  SearchExcerpt,
  SearchHit,
  SearchMatch,
  SearchResult,
} from './types.js'

// fs 注入面
export type { BoundedTextRead, MemContentReadBudget, MemDirent, MemFs } from './fs.js'
export { mtimeIso, nodeMemFs } from './fs.js'

// 平台可用性探测（CLI 降级提示据此判断是否要出警告，而非无条件印，见 mem.ts maybeWarnOpencode）
export { opencodeSqliteAvailable } from './adapters/opencode.js'

// 纯逻辑原语
export { INJECTION_TAGS, isBootstrapTurn, stripInjectionTags } from './dialogue.js'
export { chunkAround, relevanceScore, searchInDialogue } from './search.js'
export { inRange, inRangeOverlap, sameProject } from './filter.js'
export type { RangeFilter } from './filter.js'
export {
  buildBrainstormWindows,
  parseTaskPyCommand,
  parseTaskPyCommandsAll,
  slugFromChangeDir,
  splitShellArgs,
} from './phase.js'
export { selectContextTurns } from './context.js'
export type { SelectResult } from './context.js'

// 编排入口（fs 注入）
export {
  buildChildIndex,
  extractMemDialogue,
  findSessionById,
  listAll,
  listMemSessions,
  MemSessionNotFoundError,
  resolveFilter,
  searchMemSessions,
  slicePhasePure,
  WIDE_LIMIT,
} from './sessions.js'
export { readMemContext } from './context.js'
export { listMemProjects } from './projects.js'
export {
  RELATED_SESSION_SEARCH_BUDGETS,
  RelatedSessionSearchInputError,
  searchRelatedSessions,
} from './relatedSearch.js'
export type {
  RelatedSessionSearchInputErrorReason,
  RelatedSessionSearchOptions,
} from './relatedSearch.js'
