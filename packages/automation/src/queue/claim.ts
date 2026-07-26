/**
 * cas 并发闸（BACKLOG #29b）—— automation 字段的原子认领 / 终态提交 / attempts 自增。
 *
 * 老仓真相源：scheduler/types.ts:98-146（StateWriter.claim / setAutomationOwned / attempts）+
 * scheduler/scheduler.ts:287-289（handleOne 的 claim gate）。
 *
 * 全部走 @tenon/kernel 的 StateStore（cas / withLock）——**automation 零 kernel 修改，
 * 只 import**。cas 提供 compare-and-set 的原子闸（kernel 内 mkdir 锁串行 + 读比对写）。
 *
 * 关键并发不变量：
 *   - claim：queued→scheduled 的 TOCTOU-safe 原子认领。两个 worker 同抢 → 恰一个赢（cas 只有一次
 *     读到 queued）。老仓靠 .txn 锁；lite 靠 kernel cas（同 mkdir 锁语义）。
 *   - setAutomationOwned：写终态的唯一正确姿势 = 双 cas（running→next，落空再 scheduled→next）。
 *     两 cas 都落空 = change 已被外部 settle（merged/failed/conflict/…）或被重排 → 返回 false，
 *     调用面必须跳过一切从属写（防"幽灵重排"，老仓 scheduler-shutdown-requeue-rootfix）。
 *   - commitFailureOwned：owner 校验、attempts 自增、诊断与终态在**同一把锁**内一次提交；CAS
 *     所有权已丢失时零写入，避免先耗 retry budget 再发现终态不能提交。
 *   - incrAttempts：保留给低层兼容调用；scheduler 失败终态不得单独调用它。
 */
import type { StateStore } from '@tenon/kernel'
import { settleFailure } from './state-machine.js'

/** daemon 拥有的两个态：只有它们能被 setAutomationOwned 翻成终态。 */
const DAEMON_OWNED: readonly string[] = ['running', 'scheduled']

export interface FailureCommitInput {
  readonly classification: 'conflict' | 'retry'
  readonly maxRetries: number
  readonly fields: Readonly<Record<string, string>>
}

export type FailureCommitResult =
  | { readonly status: 'committed'; readonly automation: 'conflict' | 'queued' | 'failed'; readonly attempts?: number }
  | { readonly status: 'ownership-lost'; readonly observed: string }

/**
 * 挂队：写 automation=queued + automation_queued_at（原子 setMany，经 kernel 四闸 + 锁）。
 * 幂等安全：重复调只是刷新 queued_at。返回是否写入（当前 automation 已是终态时也照写——
 * 由更上层的 shouldEnqueue 决定资格，本函数只负责落盘）。
 */
export async function markQueued(store: StateStore, changeDir: string, clock: () => string): Promise<void> {
  await store.setMany(changeDir, { automation: 'queued', automation_queued_at: clock() })
}

/**
 * 原子认领：queued→scheduled。返回 true=本 caller 赢得认领；false=已被他人认领（TOCTOU-safe）。
 * 老仓 StateWriter.claim（scheduler/types.ts:99-105）。
 */
export function claim(store: StateStore, changeDir: string): Promise<boolean> {
  return store.cas(changeDir, 'automation', 'queued', 'scheduled')
}

/**
 * 写终态提交点：双 cas（running→next，落空再 scheduled→next）。返回 true=赢（either cas 落地），
 * false=两 cas 都落空（change 已非 daemon-owned = 被外部 settle / 重排）。老仓 setAutomationOwned。
 */
export async function setAutomationOwned(store: StateStore, changeDir: string, next: string): Promise<boolean> {
  if (await store.cas(changeDir, 'automation', 'running', next)) return true
  return store.cas(changeDir, 'automation', 'scheduled', next)
}

/** 终态与其从属诊断字段的单次原子提交。 */
export function setAutomationOwnedWithFields(
  store: StateStore,
  changeDir: string,
  next: string,
  fields: Readonly<Record<string, string>>,
): Promise<boolean> {
  return store.casMany(changeDir, 'automation', DAEMON_OWNED, {
    ...(fields as Partial<Record<import('@tenon/kernel').FieldName, string>>),
    automation: next,
  })
}

/**
 * execution failure 的单次 owner commit：在同一把 StateStore 锁内重读 automation、校验 daemon
 * ownership，并把 retry attempts 自增、目标态与全部诊断字段一次写盘。owner 已丢失时零写入并返回
 * 同锁内 observed，调用方据此区分外部终态与 recovery-pending；绝不先耗 attempts 再输终态 CAS。
 */
export function commitFailureOwned(
  store: StateStore,
  changeDir: string,
  input: FailureCommitInput,
): Promise<FailureCommitResult> {
  return store.withLock(changeDir, async () => {
    const state = await store.read(changeDir)
    const writable = state.fields as Record<string, string | string[] | undefined>
    const rawAutomation = writable.automation
    const observed = typeof rawAutomation === 'string' ? rawAutomation : ''
    if (!DAEMON_OWNED.includes(observed)) return { status: 'ownership-lost', observed }

    let attempts: number | undefined
    let automation: 'conflict' | 'queued' | 'failed'
    if (input.classification === 'conflict') {
      automation = 'conflict'
    } else {
      const rawAttempts = writable.automation_attempts
      const parsed = Number(typeof rawAttempts === 'string' ? rawAttempts : '0')
      attempts = (Number.isFinite(parsed) ? parsed : 0) + 1
      automation = settleFailure('retry', attempts, input.maxRetries)
      writable.automation_attempts = String(attempts)
    }

    for (const [field, value] of Object.entries(input.fields)) writable[field] = value
    writable.automation = automation
    await store.writeUnderLock(changeDir, state, { kind: 'automation' })
    return { status: 'committed', automation, ...(attempts === undefined ? {} : { attempts }) }
  })
}

/**
 * 读当前 automation 值（fast-path settled 检查用；空串 = 未知，调用面 fail 向既有行为）。
 */
export async function getAutomation(store: StateStore, changeDir: string): Promise<string> {
  const v = await store.get(changeDir, 'automation')
  return typeof v === 'string' ? v : ''
}

/**
 * 是否已 settle（非 daemon-owned = 已被他人落终态）。空串当"未知"（不当已 settle，向既有行为兜底）。
 */
export function isSettled(automation: string): boolean {
  return automation !== '' && !DAEMON_OWNED.includes(automation)
}

/**
 * 原子自增 automation_attempts 并报告是否超预算。read-modify-write 在同一把 withLock 内完成
 * （无 get+set TOCTOU）。exhausted = 新值 > max（预算耗尽 → 调用面标 failed）。
 */
export function incrAttempts(store: StateStore, changeDir: string, max: number): Promise<{ value: number; exhausted: boolean }> {
  return store.withLock(changeDir, async () => {
    const state = await store.read(changeDir)
    const raw = state.fields.automation_attempts
    const prev = Number(typeof raw === 'string' ? raw : '0')
    const value = (Number.isFinite(prev) ? prev : 0) + 1
    state.fields.automation_attempts = String(value)
    await store.writeUnderLock(changeDir, state, { kind: 'automation' })
    return { value, exhausted: value > max }
  })
}
