/**
 * loop admission 只读视图（ledger 投影 + admission 判定的展示侧共享核心）。
 *
 * 「一份判定两处用」：loops `status`/`budget` 与 `loop run --dry-run` 共用同一套「durable ledger
 * 投影 → admissionDecision」逻辑——判定与展示同源，绝不各写一份漂移。本模块由 loops.ts 提出
 * （原为其私有 function），loops.ts 与 loop-run.ts 一并 import。
 *
 * 纯读面：ledgerProjections 只读 ledger 文件（existsSync + store.read），admissionProbe/
 * buildAdmissionJson 是纯函数（吃已投影的账本事实 + LoopEntry）。无写、无 docker。
 *
 * H10 §6/§8任务7：本模块新增 `evaluateSkillBundleWiring()`——`skill_bundle_id` wiring 判定的**唯一**
 * 实现（unwired/invalid/ready 三态，见其头注）。H11（`loops init`/`loops status` 的 wiring 展示）
 * 只应消费本函数、不得复制判断逻辑（设计定稿 §6：「H11 只消费该 evaluator，不复制判断逻辑」）；
 * 当前唯一消费点是 loop-run.ts 的 `--dry-run` wiring 预览。判定仍是纯读：resolver 只做静态解析
 * （不物化 CAS），locator.locate() 只读 stat/realpath（不复制/不写快照）——零状态写、零 docker，
 * 与本模块其余函数同一「纯读面」定位。
 */
import { existsSync } from 'node:fs'
import {
  admissionDecision,
  budgetDayOf,
  createLoopLedgerStore,
  ledgerFilePath,
  normalizeOnExceed,
  projectLoopLedger,
  remainingTokens,
  reservedTokensFor,
  type LoopEntry,
  type LoopLedgerProjection,
} from '@tenon/kernel'
export { evaluateSkillBundleWiring } from '@tenon/automation'
export type {
  SkillBundleWiringDeps,
  SkillBundleWiringResult,
  SkillBundleWiringStatus,
} from '@tenon/automation'

/**
 * GOAL H · Stage C 读面：durable ledger → typed 投影（与 admission 硬判定**同源**——`loops budget/
 * status` 与 `loop run --dry-run` 展示的与 scheduler 真判定用的是同一个 projectLoopLedger，不再把
 * progress.md 当硬事实源）。ledger 文件缺失 → missing（各计数 0，常态非错误）；坏行/IO 故障 → 计一条
 * rejected（health=degraded）。
 */
export async function ledgerProjections(
  cwd: string,
  loopIds: string[],
  now: Date,
): Promise<{ byId: Map<string, LoopLedgerProjection>; missing: boolean }> {
  const missing = !existsSync(ledgerFilePath(cwd))
  const byId = new Map<string, LoopLedgerProjection>()
  const budgetDay = budgetDayOf(now.toISOString())
  let records: Parameters<typeof projectLoopLedger>[0] = []
  let rejected = 0
  if (!missing) {
    try {
      const r = await createLoopLedgerStore().read(cwd)
      records = r.records
      rejected = r.rejected.length
    } catch {
      rejected = 1 // ENOENT 之外的 IO 故障：视为坏行（health=degraded），不崩读面
    }
  }
  for (const id of loopIds) byId.set(id, projectLoopLedger(records, rejected, id, budgetDay))
  return { byId, missing }
}

/** ledgerProjections 的注入面（loop-run --dry-run 测试注入 fake 投影，避免碰真 ledger IO）。 */
export type LedgerProjector = typeof ledgerProjections

/** 「此刻能否 admit 一次新运行」探针（复用 admissionDecision——与 scheduler 判定同源）：status 非
 *  active 直接 blocked；否则按同一额度判定回 allowed / blocked:<维度>。 */
export function admissionProbe(l: LoopEntry, p: LoopLedgerProjection): string {
  if (l.status !== 'active') return 'blocked:loop-inactive'
  const { tokens } = reservedTokensFor(l)
  const d = admissionDecision(
    p,
    { maxRunsPerDay: l.budget.max_runs_per_day, maxInFlight: l.budget.max_in_flight, maxTokensPerDay: l.budget.max_tokens_per_day, onExceed: normalizeOnExceed(l.budget.on_exceed) },
    { change: '(probe)', reservedTokens: tokens },
  )
  return d.allowed ? 'allowed' : `blocked:${d.block.limit}`
}

/** GOAL H · Stage B 返工 #7：budget --json 的 admission 字段——ledger 投影 + admissionDecision（与 scheduler
 *  硬判定 / loops status admit 列同源）。loop 缺失/非 active/degraded 各有确定表现。 */
export interface LoopAdmissionJson {
  source: 'ledger'
  health: 'ok' | 'degraded' | 'missing'
  allowed: boolean
  blocked_by: string | null
  runs_today: number
  in_flight: number
  activated_in_flight: number
  tokens: { settled_actual: number; settled_estimated: number; reserved_outstanding: number; remaining: number | null }
}

export function buildAdmissionJson(loop: LoopEntry | undefined, p: LoopLedgerProjection, missing: boolean): LoopAdmissionJson {
  const health: LoopAdmissionJson['health'] = missing ? 'missing' : p.health
  const tokens = {
    settled_actual: p.settledTokensActual,
    settled_estimated: p.settledTokensEstimated,
    reserved_outstanding: p.reservedTokensOutstanding,
    remaining: remainingTokens(p, loop?.budget.max_tokens_per_day),
  }
  const base = { source: 'ledger' as const, health, runs_today: p.runsToday, in_flight: p.inFlight, activated_in_flight: p.activatedInFlight, tokens }
  if (loop === undefined || loop.status !== 'active') {
    return { ...base, allowed: false, blocked_by: 'loop-inactive' }
  }
  const { tokens: reserved } = reservedTokensFor(loop)
  const d = admissionDecision(
    p,
    { maxRunsPerDay: loop.budget.max_runs_per_day, maxInFlight: loop.budget.max_in_flight, maxTokensPerDay: loop.budget.max_tokens_per_day, onExceed: normalizeOnExceed(loop.budget.on_exceed) },
    { change: '(probe)', reservedTokens: reserved },
  )
  return { ...base, allowed: d.allowed, blocked_by: d.allowed ? null : d.block.limit }
}
