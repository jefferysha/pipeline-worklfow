/**
 * 契约类型 —— 与 docs/CONTRACT.md 互为镜像。
 * 字段序/引号/列表语义以老内核 state-init.sh heredoc 为准，改动 = human gate（LOOP.md）。
 */

export const FIELD_ORDER = [
  'track', 'preset', 'created_by', 'assignee', 'phase', 'phase_status',
  'design_doc', 'plan', 'verification_report', 'build_mode', 'isolation', 'build_sha',
  'agent_review_result', 'codex_review_result', 'verify_result', 'branch_status', 'direct_override',
  'prd_path', 'pr_url',
  'automation', 'automation_queued_at', 'automation_sandbox', 'automation_worktree',
  'automation_attempts', 'automation_last_error', 'automation_preserved_path',
  'branch', 'base_branch', 'scope', 'related_files', 'spec_scope', 'depends_on',
  'created_at', 'updated_at', 'verified_at', 'archived_at', 'archived',
] as const

export type FieldName = (typeof FIELD_ORDER)[number]

export const LIST_FIELDS = ['scope', 'related_files', 'spec_scope', 'depends_on'] as const satisfies readonly FieldName[]

export const PHASES = ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'] as const
export type Phase = (typeof PHASES)[number]

export const TRACKS = ['chat', 'pm', 'frontend', 'backend'] as const
export type Track = (typeof TRACKS)[number]

/** 门 marker 文件名（项目根），mtime < GATE_FRESH_MS 视为新鲜 */
export const GATE_MARKERS = ['.pipeline-pending-confirm', '.pipeline-pending-review', '.pipeline-pending-interaction'] as const
export const GATE_FRESH_MS = 15 * 60 * 1000

export interface PipelineState {
  fields: Record<FieldName, string | string[]>
  /** 老内核 base64 历史区等未知尾块——读时跳过、写回原样逐字保留 */
  opaqueTail: string
}

export interface InitOptions {
  repoRoot: string
  name: string
  track: Track
  preset: string
  user?: string
  /** 测试注入时钟；业务码禁止散落 new Date() */
  clock?: () => string
}

export interface StateStore {
  read(changeDir: string): Promise<PipelineState>
  /** 严格按 FIELD_ORDER 全量写回；值命中四闸（": " / " #" / 换行 / 首引号）→ throw */
  write(changeDir: string, state: PipelineState): Promise<void>
  get(changeDir: string, field: FieldName): Promise<string | string[] | undefined>
  set(changeDir: string, field: FieldName, value: string | string[]): Promise<void>
  setMany(changeDir: string, kv: Partial<Record<FieldName, string | string[]>>): Promise<void>
  /** compare-and-set：当前值 === expect 才写；返回是否写入 */
  cas(changeDir: string, field: FieldName, expect: string, next: string): Promise<boolean>
  /** 返回创建的 change 目录绝对路径 */
  init(opts: InitOptions): Promise<string>
  /** mkdir 原子锁（含陈锁回收），锁内串行执行 fn */
  withLock<T>(changeDir: string, fn: () => Promise<T>): Promise<T>
}

export interface ManifestData {
  phases: readonly Phase[]
  /** from-phase -> 合法目标（build⇄verify 双向在此表达） */
  transitions: Readonly<Record<Phase, readonly Phase[]>>
  /** 引擎侧真读——构造性修复老内核 state-transition.sh 硬编码欠账 */
  reviewPhases: readonly Phase[]
}

export interface TransitionResult {
  from: Phase
  to: Phase
  state: PipelineState
}

export interface GuardResult {
  pass: boolean
  failures: string[]
}

export interface FlowEngine {
  manifest: ManifestData
  legalTransitions(phase: Phase): readonly Phase[]
  /** 非法转换 → throw IllegalTransitionError（cli 层映射 exit 2） */
  transition(state: PipelineState, to: Phase, clock?: () => string): TransitionResult
  guardCheck(state: PipelineState): GuardResult
}

export interface HistoryEntry {
  ts: string
  kind: 'transition' | 'set' | 'init'
  field?: string
  from?: string
  to?: string
  by?: string
}

export interface HistoryWriter {
  /** append 一行 JSON 到 changeDir/.pipeline-history.jsonl */
  append(changeDir: string, entry: HistoryEntry): Promise<void>
}

export class IllegalTransitionError extends Error {
  constructor(public readonly from: Phase, public readonly to: Phase) {
    super(`illegal transition: ${from} -> ${to}`)
  }
}

export class QuoteGateError extends Error {
  constructor(public readonly field: FieldName, public readonly reason: string) {
    super(`quote gate rejected write to ${field}: ${reason}`)
  }
}
