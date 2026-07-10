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
  'workflow',
  // v5 T4（决策 G）：沙箱内当前阶段（automation runner 检出 [TRANSITION] 行运行期回写；run 结算
  // 清空）。host 阶段（phase 字段）在 run 结束后才结算，两者并存不冲突。**新字段必须追加在末尾**
  // （同 workflow 先例）：老版本窄解析器遇到首个未知 key 起整段进 opaqueTail——新字段若插在中段，
  // 老读者会把其后所有真字段（branch/base_branch/workflow…）当不透明尾巴，回写时用缺省值再造一份
  // → 重复 key 静默腐蚀；放末尾则老读者只把这一行当尾巴逐字保留，混版本读写无损。
  'automation_current_phase',
] as const

export type FieldName = (typeof FIELD_ORDER)[number]

export const LIST_FIELDS = ['scope', 'related_files', 'spec_scope', 'depends_on'] as const satisfies readonly FieldName[]

export const PHASES = ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'] as const
export type Phase = (typeof PHASES)[number]

export const TRACKS = ['chat', 'pm', 'frontend', 'backend'] as const
export type Track = (typeof TRACKS)[number]

/** 门 marker 文件名（项目根），age ≤ GATE_TTL_MS[kind] 视为新鲜（age > TTL 才陈旧，同老内核 fresh()） */
export const GATE_MARKERS = ['.pipeline-pending-confirm', '.pipeline-pending-review', '.pipeline-pending-interaction'] as const

/**
 * 门 marker TTL 分级（BACKLOG #13，对齐老内核 pipeline-gate.sh，勿改回统一值）：
 *   - confirm 300s：正常流程同轮 AskUserQuestion 即清（秒级），300s 只是「漏确认」安全网，
 *     把残留误判的爆炸半径从 30 分钟降到 5 分钟。
 *   - review / interaction 1800s：要跨整个决策 phase（explore/spec/verify 常 >5min），
 *     若缩到 300s 会在 phase 中途被 fresh 判定清掉 → 绕过强制复核。
 * bash 侧镜像：hooks/gate.sh、hooks/statusline.sh（纯 bash 红线，无法 import——改这里必须同步改那边）。
 */
export const GATE_TTL_MS = {
  confirm: 300_000,
  review: 1_800_000,
  interaction: 1_800_000,
} as const satisfies Record<GateKind, number>

export type GateKind = 'confirm' | 'review' | 'interaction'

/** @deprecated BACKLOG #13 起门 TTL 分级（见 GATE_TTL_MS），统一 15min 仅为旧调用面向后兼容保留 */
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
  /**
   * 非阻断告警（BACKLOG #12 加法扩展）：老 guard 的 yellow 提示面
   * （coverage 豁免 / 覆盖阻塞层明细等）。无告警时省略本键（lite 调用面 toEqual 兼容）。
   */
  warnings?: string[]
}

/**
 * guardCheck 的注入依赖（BACKLOG #12 加法扩展，全部可选）。
 * 老 guard 在项目根以 bash 直接摸文件系统；kernel 纯函数化后由 CLI 注入等价原语。
 * 未注入某能力时，依赖该能力的检查静默跳过（guardCheck(state) 退化为 lite 纯字段面，
 * 语义盘点见 packages/kernel/src/flow/GUARD-RULES.md §7.2）。
 * 所有路径参数均为**相对项目根**的相对路径（老 guard 运行于项目根，字段值直接 `[ -f ]`）。
 */
export interface GuardContext {
  /** 文件存在（老 guard `[ -f ]`：file_exists / yaml_file_exists 谓词） */
  fileExists?: (relPath: string) => boolean
  /** 文件存在且非空（老 guard file_nonempty：`[ -f ] && [ -s ]`） */
  fileNonempty?: (relPath: string) => boolean
  /** 读文件文本，不存在 → undefined（tasks.md 勾选统计 / design_doc coverage 块解析） */
  readFile?: (relPath: string) => string | undefined
  /** 目录存在（depends_on 活跃 change 判定：openspec/changes/<dep>） */
  dirExists?: (relPath: string) => boolean
  /** dep 已归档：openspec/changes/archive/*-<dep> 目录存在（老 guard find -name "*-$dep"） */
  changeArchived?: (dep: string) => boolean
  /** 当前 change 目录相对项目根（openspec/changes/<name>）；change 内产物检查的路径锚点 */
  changeDirRel?: string
  /** PIPELINE_AUTOMATION_RUNNER=1 调度器旁路（build 相位 automation=queued 闸的逃生口） */
  automationRunner?: boolean
}

export interface FlowEngine {
  manifest: ManifestData
  legalTransitions(phase: Phase): readonly Phase[]
  /** 非法转换 → throw IllegalTransitionError（cli 层映射 exit 2） */
  transition(state: PipelineState, to: Phase, clock?: () => string): TransitionResult
  /** ctx 缺省 = lite 纯字段面；注入 GuardContext 后为老 guard 全量校验面（BACKLOG #12 加法） */
  guardCheck(state: PipelineState, ctx?: GuardContext): GuardResult
}

export interface HistoryEntry {
  ts: string
  /** tool/prompt/import 为老仓历史导入扩展（BACKLOG #11，加法、不影响 .pipeline.yaml 兼容） */
  kind: 'transition' | 'set' | 'init' | 'tool' | 'prompt' | 'import'
  field?: string
  from?: string
  to?: string
  by?: string
  /** 导入的原始载荷（工具名+详情 / Q|A / 事件名） */
  raw?: string
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
