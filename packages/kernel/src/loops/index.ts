/**
 * kernel/loops 公共出口（BACKLOG #35 / GOAL B18 / D16 —— loop 治理子系统）：
 *   · loadRegistry / parseLoopsYaml / validateSchema / LOOPS_SCHEMA / nodeLoopIo  —— 登记表窄解析 + schema 校验
 *   · adjudicate / parseProgress / buildReport / budgetWarnThreshold / cadenceMinutes / enforcementFor —— R1-R11 裁决
 *   · 全部类型（LoopEntry/LoopRegistry/LoopVerdict/RunFacts/EnforceFs/…）
 *
 * 接线备注（收编前的临时桥）：根 kernel src/index.ts barrel 归主会话，本子 barrel 尚未被其 re-export，
 * 故 cli/commands/loops.ts 暂用相对桥直取（../../../kernel/src/loops/index.js，tsc -b/vitest/esbuild 三路已验证）。
 * 主会话收编时：在 kernel src/index.ts 追加 `export * from './loops/index.js'`，并把 cli loops.ts 的相对桥
 * 换成 '@pipeline-lite/kernel'（见报告接线清单）。
 */
export {
  loadRegistry, parseLoopsYaml, validateSchema, LOOPS_SCHEMA, nodeLoopIo,
} from './registry.js'
export type { LoopIo, YamlValue } from './registry.js'
export {
  adjudicate, parseProgress, buildReport, budgetWarnThreshold, cadenceMinutes, enforcementFor,
  FAIL_STREAK_KILL, FAIL_STREAK_WARN, DRY_ROUNDS_KILL, DRY_ROUNDS_WARN, BUDGET_WARN_RATIO, STRIKE_MULTIPLIER,
} from './enforce.js'
export type { ParsedLoop, EnforceFs, EnforceReport } from './enforce.js'
// #36 token 预算 + circuit breaker + 成本估算（GOAL B20 / D16）
export {
  sumRunLogTokens, computeBudgetStatus, estimateCost, buildBudgetReport, buildCostReport, PATTERN_TOKENS_PER_RUN,
} from './budget.js'
export type { BreakerState, BudgetStatus, CostEstimate, BudgetFs, BudgetReport, CostReport } from './budget.js'
// #37 漂移检测（loop-sync）+ loop-ready 就绪评分（loop-audit）（GOAL B21 / D16）
export {
  detectDrift, computeReadiness, extractDocLoopIds, buildDriftReport, buildAuditReport,
  DRIFT_CADENCE_MULTIPLIER, READY_STRONG, READY_THRESHOLD,
} from './drift.js'
export type {
  DriftDimension, DriftSeverity, DriftItem, DriftReport, DriftReportEnvelope,
  ReadinessBand, ReadinessDimension, ReadinessScore, DriftFs, AuditReport, AuditReportEnvelope,
} from './drift.js'
export type {
  LoopKind, LoopStatus, LoopRisk, AutonomyLevel, LoopBudget, LoopEntry, LoopRegistry,
  Verdict, Enforcement, VerdictReason, VerdictMetrics, LoopVerdict, RunFacts,
} from './types.js'
// v5 T20：runner 双支持数据面（编排页下拉双选项；LoopEntry.runner 本身仍是自由字符串）
export { LOOP_RUNNERS } from './types.js'
export type { LoopRunner } from './types.js'
// #38 分级放权 L1→L3 毕业制升降档裁决（GOAL B19 / D16）
export {
  decideGraduation, planLevelChange, parseRunHistory, setAutonomyLevelInYaml,
  buildGraduationReport, applyLevelChange, MIN_L2_RUNS_FOR_L3,
} from './graduation.js'
export type {
  GraduationHistory, GraduationInputs, GraduationVerdict, LevelChangeKind, LevelChangePlan,
  GraduationFs, GraduationReport, GraduationReportEnvelope, ApplyLevelResult,
} from './graduation.js'
// loop-init P2：草稿标记 sidecar（「agent 草稿 · 待你审阅」标记，纯展示元数据，fail-open 读 + 幂等增删原子写）
export {
  draftMarksPath, readDraftMarks, addDraftMark, clearDraftMark, DRAFT_MARKS_FILE,
} from './drafts.js'
// v5 T3：loops.yaml 字段级文本手术（决议 #3 #12 存储侧；升降档另走 graduation）
export {
  updateLoopInYaml, PATCHABLE_SCALAR_FIELDS, PATCHABLE_BUDGET_FIELDS, PATCHABLE_ARRAY_FIELDS,
} from './update.js'
