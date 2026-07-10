/**
 * loop 治理子系统类型面（BACKLOG #35 / GOAL B18 / D16 —— loop-engineering 内建）。
 *
 * 老仓真相源（严格移植，行号锚定 workflow-plugin/skills/pipeline/scripts/）：
 *   · registry 数据模式 ← loops.schema.json（version/loops[]/budget/kill_criteria/human_gates …）。
 *   · 裁决信封 ← loops_enforce.py::adjudicate 384-397（id/verdict/reasons/metrics）。
 *
 * 本轮新增（老仓无，loop-engineering 分级放权 L1→L3 打地基，对标 cobusgreyling/loop-engineering
 * "Phased Rollout" × 老仓 human_gates）：`autonomy_level` 字段 + verdict 信封的 enforcement/report_only。
 * 缺省 L1 = report-only（观察不动手）；L2 assisted（人工门）；L3 unattended（allowlist 自动）。
 * 本项只把级别纳入 schema + 让 enforce「认」这个级别（信封回显）；把 verdict×level 翻成
 * 具体 gate/halt 动作是 #38（分级放权执行面），budget 熔断是 #36，漂移审计是 #37——均留后续。
 */

export type LoopKind = 'orchestrator' | 'executor'
export type LoopStatus = 'active' | 'paused' | 'retired'
export type LoopRisk = 'low' | 'medium' | 'high'

/** 分级放权级别（loop-engineering 核心思想；缺省 L1）。 */
export type AutonomyLevel = 'L1' | 'L2' | 'L3'

/**
 * v5 T20：已知 agent runner 清单（编排页 runner 下拉的双选项数据面；automation 分派口径见
 * automation/runner.ts::buildAfkRunCommand——仅 'codex' 走 codex exec 无头会话，其余一律缺省
 * Claude 路径）。注意 LoopEntry.runner 仍是自由字符串（历史登记表存在 'cron'/'cron-session'
 * 等非 agent 值，schema 不收紧成 enum 以免旧表载入即坏）。
 */
export const LOOP_RUNNERS = ['claude-code', 'codex'] as const
export type LoopRunner = (typeof LOOP_RUNNERS)[number]

/** 预算声明（老 loops.schema.json budget 76-93）。
 * #36 追加可选 token 级预算（向后兼容，旧登记表无需改）：
 *   · max_tokens_per_day —— token 预算/circuit breaker 硬阈值（累计今日花费达/超即熔断）。
 *   · tokens_per_run     —— 成本估算 pattern 覆盖（每轮 token 足迹；缺省按 risk 预设）。
 * 追踪/熔断/估算纯逻辑在 loops/budget.ts；本处仅声明字段类型。 */
export interface LoopBudget {
  max_runs_per_day: number
  max_in_flight: number
  on_exceed: string
  /** #36：token 预算硬阈值（circuit breaker）；缺省 = 无 token 预算（仅追踪花费）。 */
  max_tokens_per_day?: number
  /** #36：每轮 token 足迹（成本估算 pattern 覆盖）；缺省按 risk 预设。 */
  tokens_per_run?: number
}

/** 登记表单条 loop（老 loops.schema.json loops.items 14-100 + 本轮 autonomy_level）。 */
export interface LoopEntry {
  id: string
  name: string
  kind: LoopKind
  goal: string
  cadence: string
  risk: LoopRisk
  runner: string
  change_prefix: string | null
  phases: string[]
  human_gates: string[]
  state: string
  design_doc: string
  status: LoopStatus
  budget: LoopBudget
  kill_criteria: string[]
  /** 分级放权级别（缺省填 L1；loadRegistry 派生时补默认）。 */
  autonomy_level: AutonomyLevel
  /** v5 决议 #12：路径 glob 白名单（存储侧；L3 unattended 自动合并的许可范围，执行面另落）。缺省 []。 */
  allowlist: string[]
  /** v5 决议 #12：路径 glob 黑名单（存储侧；运行时校验见 automation/lifecycle/denylist.ts，
   * 该模块以鸭子类型只读 change_prefix + denylist——本字段名即其消费契约，勿改名）。缺省 []。 */
  denylist: string[]
}

export interface LoopRegistry {
  version: 1
  loops: LoopEntry[]
}

/** 裁决三值（老 ok/warn/kill，kill > warn > ok 取最严；对齐老仓 --json）。 */
export type Verdict = 'ok' | 'warn' | 'kill'

/** 分级放权级别 → 执行模式（本轮回显；具体动作面留 #38）。 */
export type Enforcement = 'report-only' | 'assisted' | 'unattended'

/** 单条触发规则（老 adjudicate reasons 元素：{rule, detail}）。 */
export interface VerdictReason {
  rule: string
  detail: string
}

/** 裁决度量（老 adjudicate metrics 388-396）。 */
export interface VerdictMetrics {
  runs_today: number
  fail_streak: number
  dry_rounds: number
  in_flight: number
  minutes_since_last_run: number | null
  latest_row_ok: boolean
  misaccounted: number
}

/** 单个 loop 的裁决信封（老 adjudicate 返回 384-397 + 本轮 autonomy_level/enforcement/report_only）。 */
export interface LoopVerdict {
  id: string
  verdict: Verdict
  autonomy_level: AutonomyLevel
  /** 由 autonomy_level 派生：L1→report-only / L2→assisted / L3→unattended。 */
  enforcement: Enforcement
  /** = autonomy_level === 'L1'：即便 kill 判据命中也只报告不自动停（执行面留 #38）。 */
  report_only: boolean
  reasons: VerdictReason[]
  metrics: VerdictMetrics
}

/**
 * 运行事实（adjudicate 的纯输入）：progress.md 解析 + 在途计数 + barrier audit 的汇总。
 * 老 adjudicate 直接吃散参数（parsed/in_flight/misaccounted）；本仓聚成一个只读结构便于测试与注入。
 */
export interface RunFacts {
  runsToday: number
  failStreak: number
  dryRounds: number
  lastRunAt: Date | null
  latestRowOk: boolean
  inFlight: number
  misaccounted: readonly string[]
}
