/**
 * mem 类型契约 —— 跨 runtime 会话检索的共享 shape。
 * 对位老仓 skills/pipeline/scripts/mem/{filter,search,sessions,phase,projects}.py 的 dict 契约。
 */

export type MemPlatform = 'claude' | 'codex' | 'opencode' | 'pi'
export type MemPlatformFilter = MemPlatform | 'all'
export type MemPhase = 'brainstorm' | 'implement' | 'all'

/** 已解析的会话选择过滤器（since/until 为 epoch ms；CLI 层从 YYYY-MM-DD 解析）。 */
export interface MemFilter {
  platform: MemPlatformFilter
  since: number | null
  until: number | null
  /** 项目作用域根；null = 全局全过（老仓 --global） */
  cwd: string | null
  limit: number
}

/** 单条持久化会话头（老仓 list_all 产出的 session dict）。 */
export interface MemSession {
  platform: MemPlatform
  id: string
  title?: string | null
  cwd?: string | null
  /** 会话创建时间 ISO（首事件/文件名派生） */
  created?: string | null
  /** 最后活跃 ISO（文件 mtime / 末消息时间戳） */
  updated?: string | null
  filePath: string
  /** OpenCode 子 agent 链的父会话 id（其它平台无原生 parent） */
  parent_id?: string | null
}

export interface DialogueTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface SearchExcerpt {
  role: 'user' | 'assistant'
  snippet: string
}

export interface SearchHit {
  count: number
  userCount: number
  asstCount: number
  totalTurns: number
  excerpts: SearchExcerpt[]
}

export interface SearchMatch {
  session: MemSession
  hit: SearchHit
  score: number
  descendantsMerged: number
}

export interface MemWarning {
  code: string
  message: string
}

export interface SearchResult {
  matches: SearchMatch[]
  totalMatches: number
  warnings: MemWarning[]
}

export interface ContextTurn {
  idx: number
  role: 'user' | 'assistant'
  text: string
  isHit: boolean
}

export interface ContextResult {
  session: MemSession
  query: string | null
  totalTurns: number
  totalHitTurns: number
  mergedChildren: number
  budgetUsed: number
  maxChars: number
  turns: ContextTurn[]
  warnings: MemWarning[]
}

export interface DialogueGroup {
  label: string | null
  turns: DialogueTurn[]
}

export interface ExtractResult {
  session: MemSession
  phase: MemPhase
  windows: BrainstormWindow[]
  totalTurns: number
  groups: DialogueGroup[]
  turns: DialogueTurn[]
  warnings: MemWarning[]
}

export interface ProjectAgg {
  cwd: string
  last_active: string
  sessions: number
  by_platform: Record<MemPlatform, number>
}

/** task.py create|start 信号（从 raw shell 命令串恢复）。 */
export interface ParsedTaskCmd {
  action: 'create' | 'start'
  slug?: string | null
  titleArg?: string | null
  taskDir?: string | null
}

/** 带 turnIndex 的 phase 转换事件（适配器在单遍扫时产出）。 */
export interface PhaseEvent {
  action: 'create' | 'start'
  slug?: string | null
  taskDir?: string | null
  timestamp?: string
  turnIndex: number
}

export interface BrainstormWindow {
  label: string
  startTurn: number
  endTurn: number
}
