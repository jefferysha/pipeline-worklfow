/**
 * loop→change 归属绑定 + policy-identity 派生纯逻辑（GOAL H · Stage B —— ExecutionContext/显式
 * loop_id 的语义核心）。
 *
 * 权威归属口径（codex 第 2 节裁决，优先级固定，不再「无 loop 语境静默跑」）：
 *   ① 调用方显式指定的 loop_id（如 H14 `tenon loop run <loop-id>`，或 admission 显式入参）
 *   ② ledger 最新 change-loop-binding（`afk enqueue --loop` 落的 explicit 绑定 / 首次前缀发现物化）
 *   ③ 对尚未绑定的 legacy change 做**最长** change_prefix 发现（发现后由调用方立即 append binding）
 *   ④ 等长多命中 → fail-closed（歧义不猜）
 *   ⑤ 无匹配 → fail-closed（不再当成「无 loop 语境」静默运行）
 * 前缀只用于**首次兼容发现**；发现并 append binding 后，后续 registry 前缀变化不再改变已有绑定
 * （②优先于③——已绑定 change 走②，永不重跑前缀发现）。
 *
 * 本模块是**纯函数**（无 fs / 无 ledger IO）：ledger 最新绑定与 registry 由调用方读入后传值，
 * admission（automation/src/admission/loop-admission.ts）在仓级锁内组合「读 → resolveLoopBinding →
 * 物化 → append」的原子临界区。绑定/reservation/RunRecord 三处一致的 loop_id 才是权威归属
 * （loop_id **不落** .pipeline.yaml、不加 automation_* 字段——第 2 节裁决）。
 */
import { PATTERN_TOKENS_PER_RUN } from './budget.js'
import type { BudgetExceedAction, ChangeLoopBindingRecord, LedgerRecord } from './ledger-types.js'
import type { LoopEntry, LoopRisk } from './types.js'
import { required } from '../required.js'

/**
 * 从已按 ledger 文件序排列的事实流中选出指定 change 的最新归属绑定。
 *
 * 本函数只消费已由 codec 校验过的 typed records，不做 IO，也不重新解释
 * `supersedes_record_id`：append-only 账本的文件序最后一条匹配事实就是权威。
 */
export function latestChangeLoopBinding(
  records: readonly LedgerRecord[],
  change: string,
): ChangeLoopBindingRecord | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = required(records[index])
    if (record.kind === 'change-loop-binding' && record.change === change) return record
  }
  return undefined
}

/** resolveLoopBinding 只需 loop 的 id + change_prefix（结构化最小面，便于单测注入）。 */
export interface BindingLoopSource {
  readonly id: string
  readonly change_prefix: string | null
}

/** 绑定拒绝原因（全部 fail-closed，不放行）。 */
export type BindingDenyReason =
  | 'unknown-explicit-loop' // 显式 loop_id 在 registry 里不存在
  | 'bound-loop-missing' // ledger 已绑定的 loop 已从 registry 消失（不静默重绑）
  | 'ambiguous-prefix' // 等长前缀多个 loop 命中（歧义不猜）
  | 'no-match' // 无显式、无绑定、无前缀命中

export type BindingResolution =
  | { readonly ok: true; readonly loopId: string; readonly materialize: null | { readonly source: 'longest-prefix' } }
  | { readonly ok: false; readonly reason: BindingDenyReason; readonly detail: string }

/**
 * 归属判定（优先级 ①→⑤，纯函数）。`materialize` 非 null = 本次由最长前缀首次发现，调用方须
 * 立即 append 一条 change-loop-binding（source=longest-prefix）把绑定固化，之后走②不再重发现。
 */
export function resolveLoopBinding(input: {
  readonly change: string
  readonly explicitLoopId?: string
  /** ledger 中该 change 最新 change-loop-binding 的 loop_id（无则 undefined）。 */
  readonly latestBindingLoopId?: string
  readonly loops: readonly BindingLoopSource[]
}): BindingResolution {
  const { change, explicitLoopId, latestBindingLoopId, loops } = input
  const has = (id: string): boolean => loops.some((l) => l.id === id)

  // ① 显式 loop_id（调用方点名）——必须真实存在，否则 fail-closed（不静默回落前缀）。
  if (explicitLoopId !== undefined && explicitLoopId !== '') {
    if (!has(explicitLoopId)) {
      return { ok: false, reason: 'unknown-explicit-loop', detail: `显式 loop_id「${explicitLoopId}」在登记表中不存在` }
    }
    return { ok: true, loopId: explicitLoopId, materialize: null }
  }

  // ② ledger 最新绑定（已固化的权威归属）——绑定的 loop 若已从 registry 删除则 fail-closed
  //    （宁拒不静默重绑：删 loop 后残留 change 应由人处置，不该被前缀悄悄改判到别的 loop）。
  if (latestBindingLoopId !== undefined && latestBindingLoopId !== '') {
    if (!has(latestBindingLoopId)) {
      return { ok: false, reason: 'bound-loop-missing', detail: `已绑定 loop「${latestBindingLoopId}」已从登记表消失，拒绝静默重绑` }
    }
    return { ok: true, loopId: latestBindingLoopId, materialize: null }
  }

  // ③④⑤ 最长 change_prefix 首次发现（仅对未绑定 legacy change）：取最长命中；等长多命中歧义 fail-closed。
  let best: { len: number; ids: string[] } | null = null
  for (const l of loops) {
    const prefix = l.change_prefix
    if (prefix === null || prefix === '') continue
    if (!change.startsWith(prefix)) continue
    const len = prefix.length
    if (best === null || len > best.len) best = { len, ids: [l.id] }
    else if (len === best.len) best.ids.push(l.id)
  }
  if (best === null) {
    return { ok: false, reason: 'no-match', detail: `change「${change}」无显式绑定、无 ledger 绑定、无 change_prefix 命中` }
  }
  // 等长多命中：去重后仍 >1 = 真歧义（同一 loop 不会自撞——loops[] 内 id 唯一）。
  const uniq = [...new Set(best.ids)]
  if (uniq.length > 1) {
    return { ok: false, reason: 'ambiguous-prefix', detail: `change「${change}」被等长前缀（len=${best.len}）多个 loop 命中：${uniq.join(', ')}` }
  }
  return { ok: true, loopId: required(uniq[0]), materialize: { source: 'longest-prefix' } }
}

/**
 * on_exceed 归一到闭集 BudgetExceedAction（第 3 节 typed on_exceed）。
 *   canonical（skip-run/pause-loop/halt-round）→ 原样；legacy skip→skip-run、halt→halt-round；
 *   **其它自由字符串 fail-closed → pause-loop**（无法识别的超限策略按最保守的「暂停该 loop」处置，
 *   只挡这一个 loop、不误伤同轮其它 loop；不 throw、不使读面崩，超限时才生效）。
 *
 * 归一只发生在 **admission 边界**（reservation 的 limits_snapshot）——不回写 loadRegistry 输出的
 * budget.on_exceed（该原值被 registry.test/server loops.test 精确断言、被 dashboard LoopCard 的
 * skip/pause chip 集消费，回写即破坏并行区与 test:web；权威归属靠 reservation 快照，不靠登记表原值）。
 */
export function normalizeOnExceed(raw: string): BudgetExceedAction {
  switch (raw) {
    case 'skip-run':
    case 'pause-loop':
    case 'halt-round':
      return raw
    case 'skip':
      return 'skip-run'
    case 'halt':
      return 'halt-round'
    default:
      return 'pause-loop' // fail-closed：不认识的策略按最保守的「暂停该 loop」，不静默放行超限
  }
}

/** reservation 预占 token 数与依据（第 1 节 token_basis）：显式 budget.tokens_per_run 优先，
 *  否则按 risk 档位默认（未知 risk 兜 medium，对齐 budget.ts::estimateCost 的兜底口径）。 */
export function reservedTokensFor(loop: Pick<LoopEntry, 'risk' | 'budget'>): {
  tokens: number
  basis: 'budget.tokens_per_run' | 'risk-default'
} {
  const declared = loop.budget.tokens_per_run
  if (declared !== undefined && declared !== null) return { tokens: declared, basis: 'budget.tokens_per_run' }
  const preset = (PATTERN_TOKENS_PER_RUN as Record<string, number | undefined>)[loop.risk as LoopRisk]
  return { tokens: preset ?? PATTERN_TOKENS_PER_RUN.medium, basis: 'risk-default' }
}

/** ISO-8601 时间戳 → UTC 预算日 `YYYY-MM-DD`（reservation.budget_day / 日额度归属键）。 */
export function budgetDayOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}
