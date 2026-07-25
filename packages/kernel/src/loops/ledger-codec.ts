/**
 * loop ledger 编解码（GOAL H1）—— LedgerRecord ↔ 单行 JSON。
 *
 * decode 做**真实窄校验**而非 as 断言（对齐 registry.ts 手写校验、零 schema 库的仓约）：
 * 合法 JSON → 顶层对象 → schema_version === 1 → kind 闭集 → 该 kind 的必填字段
 * 存在且类型正确（number 真是 number、string 真是 string、闭集字段真在闭集内、
 * 字面量字段逐值钉死）。可选字段缺席放行、**存在则同样校验**。
 * 错误消息带字段路径（如 `usage.tokens.total`），供 store 的 rejected 诊断面直读。
 */
import type { LedgerRecord } from './ledger-types.js'
import type { VerificationResult } from '../verification/types.js'
import { sanitizeVerificationResultForEncode, validateVerificationResult } from '../verification/validate.js'
// H10 §3/§8任务3：skill-bundle-snapshot.skill_bundle_id 复用既有 profile 词法校验器（同一 loops
// 域内的同目录文件，不另造正则——对齐 H10 设计定稿 §2「复用 T 线现有 profile 校验器」）。
import { SKILL_BUNDLE_ID_RE } from './registry.js'
import {
  checkBool,
  checkEnum,
  checkKnownKeys,
  checkLit,
  checkNum,
  checkPattern,
  checkSha256,
  checkSlotArray,
  checkStr,
  checkStrArray,
  isObj,
  missing,
  subObj,
  type Obj,
  typeName,
} from './ledger-codec-primitives.js'

export type LedgerDecodeResult = { ok: true; record: LedgerRecord } | { ok: false; error: string }

/**
 * LedgerRecord → 单行 JSON。无缩进的 JSON.stringify 不产生字面换行（字符串值内的换行
 * 被转义成 `\n` 两字符），单行契约由此成立；store 落盘时自行补行尾 `\n`。
 *
 * H7-S1（r2 阻断4：物理 merge/ledger 撕裂）：run 记录若带 verification，落盘前先用
 * sanitizeVerificationResultForEncode 单次读取抽取成全新 plain 副本再参与 JSON.stringify——
 * 直接对 record 调 JSON.stringify 会在 record.verification 带恶意 toJSON() 时改用 toJSON()
 * 的返回值序列化，而不是对象真实字段（toJSON 返回「另一份」合法但结论不同的 verification，
 * 物理 merge 依据的真实结论与落盘的 verification 由此对不上）。抽取副本没有 toJSON、没有多余键，
 * JSON.stringify 序列化的就是真实字段本身。非 run 记录、或 run 无 verification 字段时原样序列化。
 */
export function encodeLedgerRecord(record: LedgerRecord): string {
  if ((record.kind !== 'run' && record.kind !== 'merge-intent') || record.verification === undefined) {
    return JSON.stringify(record)
  }
  const sanitizedVerification = sanitizeVerificationResultForEncode(record.verification) as VerificationResult
  return JSON.stringify({ ...record, verification: sanitizedVerification })
}

// ── 各 kind 的字段校验（与 ledger-types.ts 判别联合一一对应）───────────────────────

const BINDING_SOURCES = ['explicit', 'longest-prefix'] as const
const TOKEN_BASES = ['budget.tokens_per_run', 'risk-default'] as const
const EXCEED_ACTIONS = ['skip-run', 'pause-loop', 'halt-round'] as const
const LEVELS = ['L1', 'L2', 'L3'] as const
const RUN_RESULTS = ['merged', 'paused', 'conflict', 'failed', 'retry-queued', 'skipped'] as const
const RUN_REASONS = [
  'completed', 'host-sync-pending', 'merge-journal-pending', 'no-op', 'verify-fail', 'claim-lost', 'admission-denied',
  'kill-switch', 'cancelled', 'infrastructure-error', 'recovered', 'reservation-expired',
  // H7 verifier Phase 2：settlement verification gate 的 fail-closed 诊断成因。
  'verification-missing', 'verification-untrusted', 'verification-inconclusive', 'verification-subject-mismatch',
  // H7-S2（返工 r2 阻断4 custom fail-closed）：custom workflow 核验结果未真正落在 workflow-transition
  // binding 时的诊断成因。
  'verification-binding-unresolved',
  'verification-policy-mismatch',
  'automation-policy-bind-failed',
  // H10 §5/§8任务5：admission/prepareSkillBundle 的精确 fail-closed 诊断闭集（同构镜像
  // automation/admission/execution-context.ts::PreparationFailureReason；前两值 unwired/
  // profile-not-found 实践中只出现在 AdmissionDenial 自由 string，从不落 RunRecord，仍纳入本
  // 闭集只为与设计定稿 §5 十项闭集保持同一份字面量列表，见 ledger-types.ts::RunRecord.reason 头注）。
  'skill-bundle-unwired', 'skill-bundle-profile-not-found', 'skill-bundle-resolve-failed',
  'skill-bundle-skill-not-found', 'skill-bundle-content-invalid', 'skill-bundle-source-ambiguous',
  'skill-bundle-policy-changed', 'skill-bundle-source-unstable', 'skill-bundle-snapshot-io',
  'skill-bundle-snapshot-corrupt',
] as const
const CHARGE_SOURCES = ['provider-structured', 'reserved-estimate', 'none'] as const
// H10 §3/§8任务3：镜像 workflow/skill-bundle-resolver.ts::SkillBundleResolutionSource 的值域
// （本文件不跨包引入该类型，只钉同构字面量闭集，两处值域保持一致）。
const RESOLUTION_SOURCES = ['default', 'custom'] as const

function validateBinding(o: Obj, errors: string[]): void {
  const p = 'change-loop-binding'
  checkStr(o, 'change', p, errors)
  checkStr(o, 'loop_id', p, errors)
  checkEnum(o, 'source', BINDING_SOURCES, p, errors)
  checkStr(o, 'supersedes_record_id', p, errors, true)
}

function validateReservation(o: Obj, errors: string[]): void {
  const p = 'budget-reservation'
  checkStr(o, 'reservation_id', p, errors)
  checkStr(o, 'attempt_id', p, errors)
  checkStr(o, 'iteration_id', p, errors, true)
  checkStr(o, 'loop_id', p, errors)
  checkStr(o, 'change', p, errors)
  checkStr(o, 'budget_day', p, errors)
  checkLit(o, 'reserved_runs', 1, p, errors)
  checkNum(o, 'reserved_tokens', p, errors)
  checkEnum(o, 'token_basis', TOKEN_BASES, p, errors)
  const limits = subObj(o, 'limits_snapshot', p, errors)
  if (limits !== null) {
    const lp = `${p}.limits_snapshot`
    checkNum(limits, 'max_runs_per_day', lp, errors)
    checkNum(limits, 'max_in_flight', lp, errors)
    checkNum(limits, 'max_tokens_per_day', lp, errors, true)
    checkEnum(limits, 'on_exceed', EXCEED_ACTIONS, lp, errors)
  }
  const context = subObj(o, 'attempt_context', p, errors, true)
  if (context !== null) {
    const cp = `${p}.attempt_context`
    checkKnownKeys(context, ['source_run_record_ids', 'omitted_attempt_ids', 'rendered', 'stagnation'], cp, errors)
    checkStrArray(context, 'source_run_record_ids', cp, errors)
    checkStrArray(context, 'omitted_attempt_ids', cp, errors)
    checkStr(context, 'rendered', cp, errors)
    const stagnation = subObj(context, 'stagnation', cp, errors)
    if (stagnation !== null) {
      const sp = `${cp}.stagnation`
      checkKnownKeys(stagnation, ['stagnant', 'fingerprint', 'repeated_attempt_ids'], sp, errors)
      checkBool(stagnation, 'stagnant', sp, errors)
      checkSha256(stagnation, 'fingerprint', sp, errors, true)
      checkStrArray(stagnation, 'repeated_attempt_ids', sp, errors)
    }
  }
  checkStr(o, 'expires_at', p, errors)
}

/** skill-bundle-snapshot 窄校验（H10 §3/§8任务3，H10 r1 复审阻断2/D4 补全 provenance 字段）：绑
 *  attempt_id/reservation_id/loop_id（均必填——写下本记录时对应 reservation 必然已存在，见
 *  ledger-types.ts 头注）；skill_bundle_id 复用既有 profile 词法（SKILL_BUNDLE_ID_RE，不另造正则）；
 *  policy_epoch 是纯 string（governance.ts::registryContentEpoch 可返回 'absent' 字面量，非恒为
 *  sha256，故不用 checkSha256）；resolution_source 闭集；workflow_run_id/workflow/step/track 均为
 *  必填纯 string（无预定词法，写入方保证语义正确，本层只钉「存在且是 string」）；coordinate_digest
 *  与 snapshot_sha256、slots[].tree_sha256 均须为合法 sha256；slots[].alternatives 必填 string[]
 *  （允许空数组，本层不核对 concrete_skill_id 是否确实是其中之一）；slots 本身允许空数组（合法的
 *  「空快照」）。 */
function validateSkillBundleSnapshot(o: Obj, errors: string[]): void {
  const p = 'skill-bundle-snapshot'
  checkStr(o, 'attempt_id', p, errors)
  checkStr(o, 'reservation_id', p, errors)
  checkStr(o, 'loop_id', p, errors)
  checkPattern(o, 'skill_bundle_id', SKILL_BUNDLE_ID_RE, p, errors)
  checkStr(o, 'policy_epoch', p, errors)
  checkEnum(o, 'resolution_source', RESOLUTION_SOURCES, p, errors)
  checkStr(o, 'workflow_run_id', p, errors)
  checkStr(o, 'workflow', p, errors)
  checkStr(o, 'step', p, errors)
  checkStr(o, 'track', p, errors)
  checkSha256(o, 'coordinate_digest', p, errors)
  checkSha256(o, 'snapshot_sha256', p, errors)
  checkStr(o, 'cas_relative_path', p, errors)
  checkSlotArray(o, 'slots', p, errors)
}

function validateActivated(o: Obj, errors: string[]): void {
  const p = 'reservation-activated'
  checkStr(o, 'reservation_id', p, errors)
  checkStr(o, 'attempt_id', p, errors)
  checkStr(o, 'iteration_id', p, errors, true)
  checkStr(o, 'loop_id', p, errors)
  checkStr(o, 'change', p, errors)
  checkStr(o, 'started_at', p, errors)
}

function validateUsage(o: Obj, errors: string[]): void {
  const p = 'usage'
  checkStr(o, 'usage_id', p, errors)
  checkStr(o, 'attempt_id', p, errors)
  checkStr(o, 'iteration_id', p, errors, true)
  checkStr(o, 'loop_id', p, errors)
  checkStr(o, 'provider', p, errors)
  checkStr(o, 'model', p, errors, true)
  checkStr(o, 'request_id', p, errors, true)
  const tokens = subObj(o, 'tokens', p, errors)
  if (tokens !== null) {
    const tp = `${p}.tokens`
    checkNum(tokens, 'input', tp, errors)
    checkNum(tokens, 'output', tp, errors)
    checkNum(tokens, 'cached_input', tp, errors, true)
    checkNum(tokens, 'reasoning', tp, errors, true)
    checkNum(tokens, 'total', tp, errors)
    const count = (key: string): number | undefined => {
      const value = tokens[key]
      if (typeof value !== 'number') return undefined
      if (!Number.isSafeInteger(value) || value < 0) {
        errors.push(`${tp}.${key}: token count 必须是非负 safe integer`)
        return undefined
      }
      return value
    }
    const input = count('input')
    const output = count('output')
    const cached = missing(tokens, 'cached_input') ? undefined : count('cached_input')
    const reasoning = missing(tokens, 'reasoning') ? undefined : count('reasoning')
    const total = count('total')
    if (input !== undefined && cached !== undefined && cached > input) {
      errors.push(`${tp}.cached_input: 不得大于 input`)
    }
    if (output !== undefined && reasoning !== undefined && reasoning > output) {
      errors.push(`${tp}.reasoning: 不得大于 output`)
    }
    if (input !== undefined && output !== undefined && total !== undefined
      && (!Number.isSafeInteger(input + output) || total !== input + output)) {
      errors.push(`${tp}.total: 必须等于 input + output`)
    }
  }
  checkLit(o, 'source', 'provider-structured', p, errors)
  checkStr(o, 'observed_at', p, errors)
}

const RECORD_HEAD_KEYS = ['schema_version', 'record_id', 'recorded_at', 'kind'] as const
const VERIFY_KEYS = ['result', 'source', 'trusted'] as const
const ARTIFACT_KEYS = ['build_sha', 'build_sha_source', 'branch', 'commit_shas'] as const
const ACCOUNTING_KEYS = ['reserved_tokens', 'charged_tokens', 'charge_source'] as const
const ERROR_KEYS = ['cause', 'message'] as const

function validateMergeIntent(o: Obj, errors: string[]): void {
  const p = 'merge-intent'
  checkKnownKeys(o, [
    ...RECORD_HEAD_KEYS,
    'attempt_id', 'iteration_id', 'reservation_id', 'loop_id', 'change', 'workflow_run_id',
    'base_ref', 'expected_base_sha', 'branch_ref', 'expected_branch_sha', 'merged_commit_sha',
    'level', 'runner', 'image', 'admitted_at', 'started_at', 'created_at',
    'verify', 'verification', 'artifacts', 'skill_bundle_snapshot_sha256',
    'usage_record_ids', 'accounting',
  ], p, errors)
  checkStr(o, 'attempt_id', p, errors)
  checkStr(o, 'iteration_id', p, errors, true)
  checkStr(o, 'reservation_id', p, errors)
  checkStr(o, 'loop_id', p, errors)
  checkStr(o, 'change', p, errors)
  checkStr(o, 'workflow_run_id', p, errors)
  checkStr(o, 'base_ref', p, errors)
  checkStr(o, 'expected_base_sha', p, errors)
  checkStr(o, 'branch_ref', p, errors)
  checkStr(o, 'expected_branch_sha', p, errors)
  checkStr(o, 'merged_commit_sha', p, errors)
  checkEnum(o, 'level', LEVELS, p, errors)
  checkStr(o, 'runner', p, errors)
  checkStr(o, 'image', p, errors, true)
  checkStr(o, 'admitted_at', p, errors)
  checkStr(o, 'started_at', p, errors, true)
  checkStr(o, 'created_at', p, errors)

  const verify = subObj(o, 'verify', p, errors, true)
  if (verify !== null) {
    const vp = `${p}.verify`
    checkKnownKeys(verify, VERIFY_KEYS, vp, errors)
    checkEnum(verify, 'result', ['pass', 'fail'], vp, errors)
    checkLit(verify, 'source', 'sandbox-output', vp, errors)
    checkLit(verify, 'trusted', false, vp, errors)
  }
  if (!missing(o, 'verification')) {
    const verified = validateVerificationResult(o.verification, `${p}.verification`)
    if (!verified.ok) errors.push(...verified.errors)
    else o.verification = verified.value
  }
  const artifacts = subObj(o, 'artifacts', p, errors, true)
  if (artifacts !== null) {
    const ap = `${p}.artifacts`
    checkKnownKeys(artifacts, ARTIFACT_KEYS, ap, errors)
    checkStr(artifacts, 'build_sha', ap, errors, true)
    checkLit(artifacts, 'build_sha_source', 'named-branch-head', ap, errors, true)
    checkStr(artifacts, 'branch', ap, errors, true)
    checkStrArray(artifacts, 'commit_shas', ap, errors)
  }
  checkSha256(o, 'skill_bundle_snapshot_sha256', p, errors, true)
  checkStrArray(o, 'usage_record_ids', p, errors)
  const accounting = subObj(o, 'accounting', p, errors)
  if (accounting !== null) {
    const ap = `${p}.accounting`
    checkKnownKeys(accounting, ACCOUNTING_KEYS, ap, errors)
    checkNum(accounting, 'reserved_tokens', ap, errors)
    checkNum(accounting, 'charged_tokens', ap, errors)
    checkEnum(accounting, 'charge_source', CHARGE_SOURCES, ap, errors)
  }
}

function validateMergeLanded(o: Obj, errors: string[]): void {
  const p = 'merge-landed'
  checkKnownKeys(o, [
    ...RECORD_HEAD_KEYS,
    'intent_record_id', 'attempt_id', 'reservation_id', 'loop_id', 'change', 'base_ref',
    'base_before_sha', 'branch_sha', 'merged_commit_sha', 'host_synced', 'host_sync_error', 'landed_at',
  ], p, errors)
  checkStr(o, 'intent_record_id', p, errors)
  checkStr(o, 'attempt_id', p, errors)
  checkStr(o, 'reservation_id', p, errors)
  checkStr(o, 'loop_id', p, errors)
  checkStr(o, 'change', p, errors)
  checkStr(o, 'base_ref', p, errors)
  checkStr(o, 'base_before_sha', p, errors)
  checkStr(o, 'branch_sha', p, errors)
  checkStr(o, 'merged_commit_sha', p, errors)
  checkBool(o, 'host_synced', p, errors)
  const syncError = subObj(o, 'host_sync_error', p, errors, true)
  if (syncError !== null) {
    const ep = `${p}.host_sync_error`
    checkKnownKeys(syncError, ERROR_KEYS, ep, errors)
    checkStr(syncError, 'cause', ep, errors)
    checkStr(syncError, 'message', ep, errors)
    if (o.host_synced === true) errors.push(`${p}.host_sync_error: host_synced=true 时不得存在`)
  }
  checkStr(o, 'landed_at', p, errors)
}

function validateRun(o: Obj, errors: string[]): void {
  const p = 'run'
  checkStr(o, 'run_record_id', p, errors)
  checkStr(o, 'attempt_id', p, errors)
  checkStr(o, 'iteration_id', p, errors, true)
  checkStr(o, 'reservation_id', p, errors, true)
  checkStr(o, 'loop_id', p, errors)
  checkStr(o, 'change', p, errors)
  checkStr(o, 'workflow_run_id', p, errors, true)
  checkEnum(o, 'level', LEVELS, p, errors)
  checkStr(o, 'runner', p, errors)
  checkStr(o, 'image', p, errors, true)
  checkStr(o, 'admitted_at', p, errors)
  checkStr(o, 'started_at', p, errors, true)
  checkStr(o, 'finished_at', p, errors)
  checkEnum(o, 'result', RUN_RESULTS, p, errors)
  checkEnum(o, 'reason', RUN_REASONS, p, errors, true)
  const verify = subObj(o, 'verify', p, errors, true)
  if (verify !== null) {
    const vp = `${p}.verify`
    checkEnum(verify, 'result', ['pass', 'fail'], vp, errors)
    checkLit(verify, 'source', 'sandbox-output', vp, errors)
    checkLit(verify, 'trusted', false, vp, errors)
  }
  // H7 结构化 verification（可选，向后兼容）：缺席放行（旧行 → undefined）；存在则先经 kernel
  // verification 模块单次读取抽取，再在抽取副本上窄校验（H7-S1：不再直接对 parsed 的裸字段调
  // collectVerificationResultErrors——decode 输入虽来自 JSON.parse、天然没有 getter/Proxy，但仍
  // 可能带多余键；统一走 validateVerificationResult 让 decode/encode 两侧共享同一套 canonical
  // 抽取语义）。窄校验通过后用抽取副本回写 o.verification，往下游流转的是冻结副本，不是原始
  // parsed.verification 引用——decode 若整体失败，o 本身也会被丢弃，这里的回写不产生副作用泄漏。
  if (!missing(o, 'verification')) {
    const verified = validateVerificationResult(o.verification, `${p}.verification`)
    if (!verified.ok) errors.push(...verified.errors)
    else o.verification = verified.value
  }
  const artifacts = subObj(o, 'artifacts', p, errors, true)
  if (artifacts !== null) {
    const ap = `${p}.artifacts`
    checkStr(artifacts, 'build_sha', ap, errors, true)
    checkLit(artifacts, 'build_sha_source', 'named-branch-head', ap, errors, true)
    checkStr(artifacts, 'branch', ap, errors, true)
    checkStrArray(artifacts, 'commit_shas', ap, errors)
  }
  // H10 §3/§8任务3：终态关联的 skill bundle 快照聚合 hash（可选——旧行缺席合法，见 ledger-types.ts
  // RunRecord.skill_bundle_snapshot_sha256 头注）；存在则须为合法 sha256。
  checkSha256(o, 'skill_bundle_snapshot_sha256', p, errors, true)
  checkStrArray(o, 'usage_record_ids', p, errors)
  const accounting = subObj(o, 'accounting', p, errors)
  if (accounting !== null) {
    const cp = `${p}.accounting`
    checkNum(accounting, 'reserved_tokens', cp, errors)
    checkNum(accounting, 'charged_tokens', cp, errors)
    checkEnum(accounting, 'charge_source', CHARGE_SOURCES, cp, errors)
  }
  const error = subObj(o, 'error', p, errors, true)
  if (error !== null) {
    const ep = `${p}.error`
    checkStr(error, 'cause', ep, errors)
    checkStr(error, 'message', ep, errors)
  }
}

const KIND_VALIDATORS: Record<string, (o: Obj, errors: string[]) => void> = {
  'change-loop-binding': validateBinding,
  'budget-reservation': validateReservation,
  'skill-bundle-snapshot': validateSkillBundleSnapshot,
  'reservation-activated': validateActivated,
  usage: validateUsage,
  'merge-intent': validateMergeIntent,
  'merge-landed': validateMergeLanded,
  run: validateRun,
}

/**
 * 单行 JSON → LedgerRecord（窄校验通过才 ok）。任何一层不合规 → `{ok:false, error}`，
 * error 汇总全部字段错误（`; ` 连接）供诊断；本函数绝不 throw。
 */
export function decodeLedgerLine(line: string): LedgerDecodeResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch (e) {
    return { ok: false, error: `非法 JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!isObj(parsed)) {
    return { ok: false, error: `顶层必须是对象（一行一条记录），实得 ${typeName(parsed)}` }
  }

  const errors: string[] = []
  checkLit(parsed, 'schema_version', 1, 'record', errors)
  checkStr(parsed, 'record_id', 'record', errors)
  checkStr(parsed, 'recorded_at', 'record', errors)

  const kind = parsed.kind
  const validate = typeof kind === 'string' ? KIND_VALIDATORS[kind] : undefined
  if (validate === undefined) {
    errors.push(`record.kind: 未知记录类型 ${JSON.stringify(kind)}（闭集 ${Object.keys(KIND_VALIDATORS).join('|')}）`)
    return { ok: false, error: errors.join('; ') }
  }
  validate(parsed, errors)

  if (!isValidatedLedgerRecord(parsed, errors)) return { ok: false, error: errors.join('; ') }
  return { ok: true, record: parsed }
}

function isValidatedLedgerRecord(value: unknown, errors: readonly string[]): value is LedgerRecord {
  return isObj(value) && errors.length === 0
}
