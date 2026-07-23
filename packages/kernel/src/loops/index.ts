/**
 * kernel/loops 公共出口（BACKLOG #35 / GOAL B18 / D16 —— loop 治理子系统）：
 *   · loadRegistry / parseLoopsYaml / validateSchema / LOOPS_SCHEMA / nodeLoopIo  —— 登记表窄解析 + schema 校验
 *   · adjudicate / parseProgress / buildReport / budgetWarnThreshold / cadenceMinutes / enforcementFor —— R1-R11 裁决
 *   · 全部类型（LoopEntry/LoopRegistry/LoopVerdict/RunFacts/EnforceFs/…）
 *
 * 本子 barrel 由根 kernel src/index.ts re-export；消费方（cli/commands/loops.ts、server/loops.ts）
 * 一律经 '@pipeline-lite/kernel' 包名导入。
 */
export {
  loadRegistry, parseLoopsYaml, validateSchema, LOOPS_SCHEMA, nodeLoopIo, nodeLoopIoStrict, RegistryReadError,
  SKILL_BUNDLE_ID_RE,
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
export { LOOP_RUNNERS, assertLoopRunner, isLoopRunner } from './types.js'
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
// loop-init L1：+createLoopsYamlText/appendLoopToYamlText（新建/追加原语，产文自校验，P5 不写 autonomy_level）
export {
  updateLoopInYaml, PATCHABLE_SCALAR_FIELDS, PATCHABLE_BUDGET_FIELDS, PATCHABLE_ARRAY_FIELDS,
  createLoopsYamlText, appendLoopToYamlText,
} from './update.js'
export type { NewLoopEntryInput } from './update.js'
// GOAL H1：loop durable ledger 存储面——typed 记录（判别联合）+ 单行 JSON 编解码（窄校验）
// + 带锁原子 append store（复用 state/lock.ts）+ 宽容读 + run 窗口投影
// H10 §3/§8任务3：新增 SkillBundleSnapshotRecord（skill bundle 内容快照事实，绑 attempt/reservation）
export type {
  BudgetExceedAction, LedgerRecordBase, ChangeLoopBindingRecord, BudgetReservationRecord, AttemptContextLedgerSnapshot,
  SkillBundleSnapshotRecord, ReservationActivatedRecord, UsageRecord, MergeIntentRecord, MergeLandedRecord,
  RunResult, RunRecord, LedgerRecord,
} from './ledger-types.js'
export { projectLoopIterations } from './ledger-projection.js'
export type { LoopIteration } from './ledger-projection.js'
export { encodeLedgerRecord, decodeLedgerLine } from './ledger-codec.js'
export type { LedgerDecodeResult } from './ledger-codec.js'
export {
  createLoopLedgerStore, ledgerDirPath, ledgerFilePath, LEDGER_DIR, LEDGER_FILE,
  LedgerDegradedError, UnknownReservationError, ReservationCorruptionError,
  ReservationMismatchError, ReservationAppendError,
} from './ledger-store.js'
export type { LedgerReadResult, LoopLedgerStore, CloseReservationResult } from './ledger-store.js'
// GOAL H · Stage B：loop→change 归属绑定 + policy-identity 派生（显式 loop_id / 最长前缀发现 /
// on_exceed 归一 / 预占 token 依据 / UTC 预算日）——admission 与 ExecutionContext 的语义核心
export {
  latestChangeLoopBinding, resolveLoopBinding, normalizeOnExceed, reservedTokensFor, budgetDayOf,
} from './binding.js'
export type { BindingLoopSource, BindingDenyReason, BindingResolution } from './binding.js'
// GOAL H · Stage B 返工 #3+#4：registry governance（治理锁 + 内容 hash epoch + atomic writer + start/merge permit）
export {
  withRegistryGovernanceLock, readRegistrySnapshot, assertActiveAtEpoch, writeRegistryTextAtomic,
  writeRegistryWithGovernance, withLoopStartPermit, withLoopMergePermit, loopMaterialUnchanged,
  registryContentEpoch, loopsYamlPath, LoopNotActiveError, BaseRefCasError,
  // H10 §1（复审阻断1修复）：start permit 治理身份 TOCTOU 闸——见 governance.ts::withLoopStartPermit。
  LoopPolicyChangedError,
  ABSENT_REGISTRY_EPOCH,
} from './governance.js'
export type { LoopRegistrySnapshot, RegistryWriteResult, PreparedPolicySnapshot } from './governance.js'
// GOAL H · Stage C：ledger → typed 内存投影 + 纯额度判定（admission 判定与 CLI/server 读面同源）
// Stage B 返工 #1/#8：terminal 去重索引 + runsToday 计数纯函数
// H10 §3/§8任务3：indexSkillBundleSnapshots——reservation_id → skill-bundle-snapshot 记录的纯投影
export {
  projectLoopLedger, admissionDecision, remainingTokens, indexReservationTerminals, countsAsRun,
  indexSkillBundleSnapshots, indexMergeFactsByAttempt,
} from './ledger-projection.js'
export type {
  LoopLedgerProjection, AdmissionLimits, AdmissionBlock, AdmissionDecision, ReservationTerminalIndex,
  AttemptMergeFacts,
} from './ledger-projection.js'
// GOAL H3：7 个中性、版本化 automation policy 模板及其 fail-loud 查询/覆盖编译面。
export {
  AUTOMATION_POLICY_TEMPLATE_VERSION, AUTOMATION_POLICY_TEMPLATE_IDS,
  listAutomationPolicyTemplates, getAutomationPolicyTemplate,
  validateAutomationPolicyTemplate, compileAutomationPolicyTemplate,
} from './policy-template.js'
export {
  compileAutomationPolicySnapshot,
  compileConstraintPolicy,
  evaluateConstraintPolicy,
  validateAutomationPolicySnapshot,
  type AutomationPolicySnapshot,
  type ConstraintDecision,
  type ConstraintEvaluationInput,
  type ConstraintOperation,
  type ConstraintPolicy,
} from './automation-policy.js'
export type {
  AutomationPolicyTemplateVersion, AutomationPolicyTemplateId, AutomationPolicyRisk,
  AutomationPolicyTrigger, AutomationPolicyTemplateV1, AutomationPolicyTemplate,
  AutomationPolicyTemplateOverrideV1, AutomationPolicyTemplateOverride,
} from './policy-template.js'
// GOAL H13：typed reconciliation plan + strict 双资源快照 + governance/CAS 原子 apply。
export {
  RECONCILIATION_PLAN_KIND, RECONCILIATION_PLAN_SCHEMA_VERSION, RECONCILIATION_TARGET,
  MANAGED_LOOP_SECTION_OWNERSHIP, resourceEpoch, reconciliationPlanId,
  decodeReconciliationPlan, encodeReconciliationPlan, managedLoopSectionMarkers,
  applyReconciliationOperations, buildReconciliationPlan, ReconciliationPlanCodecError,
} from './reconciliation.js'
export type {
  ResourceEpoch, ReconciliationScope, ReconciliationOperation, ReconciliationBlockerReason,
  ReconciliationBlocker, ReconciliationPlan, ReconciliationPlanPayload,
  BuildReconciliationPlanInput, ApplyReconciliationOperationsInput,
  ApplyReconciliationOperationsResult, ReconciliationPlanCodecResult,
} from './reconciliation.js'
export {
  readReconciliationSnapshot, applyReconciliationPlan,
  ReconciliationResourceError, ReconciliationSourceError,
} from './reconciliation-store.js'
export type {
  ReconciliationSnapshot, ReconciliationResource, ReconciliationApplyWarning,
  ReconciliationEpochConflict, ReconciliationApplyResult,
} from './reconciliation-store.js'
