/**
 * 调度核心 —— 移植老仓 scheduler/scheduler.ts:1-374 的纯编排（over 注入 ports）。
 *
 * 一轮 = 处理一个候选列表，有界并发：
 *   claim（TOCTOU 原子）→ 标 running → 跑沙箱（runChange）→ settle → 写回。
 *
 * 与老仓的（有意）差异：把成功落态按 L1→L3 分级（settleSuccess）——默认 L1 report-only 落
 * paused（不自动 merge，安全），L3 才 merged。老仓无分级、一律 merged。
 *
 * 不变量（逐条对齐老仓注释）：
 *  ② semaphore 限并发到 maxParallel。
 *  ③ 失败 → classifyFailure → retry(queued, attempts++) | conflict(留现场, 不重试)。
 *  ④ inFlight Set + registerShutdown teardown 同步把每个 running change 标 failed（shutdown 回调
 *     无法 await），kanban 绝不卡在 running。
 *  ⑤ 写回绝不双写：终态经 setAutomationOwned 的双 cas 提交点；claim 是唯一原子认领点。
 *  ⑥ Promise.allSettled 收口——一个 reject 绝不连累其余的写回。
 */
import { isSettled } from '../queue/claim.js'
import { settleFailure, settleSuccess } from '../queue/state-machine.js'
import { type AutomationConfig, type AutomationState, type RunOutcome } from '../types.js'
import { classifyFailure } from './classify.js'
import { createSemaphore } from './semaphore.js'

/** 写回 port（由 fs StateStore 适配，见 sdk.ts::storeWriter）。全部经 kernel 锁串行。 */
export interface StateWriter {
  /** 原子认领 queued→scheduled；true=本 caller 赢。 */
  claim(name: string): Promise<boolean>
  /** 轻量 automation 态 set（queued→scheduled→running→…）。 */
  setAutomation(name: string, state: AutomationState): Promise<void>
  /** set 自由 automation 字段（last_error / preserved_path / attempts）。 */
  setField(name: string, field: string, value: string): Promise<void>
  /** 原子自增 attempts，报告是否超预算。 */
  incrAttempts(name: string, max: number): Promise<{ value: number; exhausted: boolean }>
  /** 读当前 automation（fast-path settled 检查）。 */
  getAutomation(name: string): Promise<string>
  /** 写终态提交点（双 cas）；false=已被外部 settle → 跳过一切从属写。 */
  setAutomationOwned(name: string, next: AutomationState): Promise<boolean>
  /** shutdown teardown 的同步 best-effort failed 标记（不 await）。 */
  markFailedSync(name: string, reason: string): void
}

/** 跑一个 change 端到端（runner + lifecycle）。成功 resolve RunOutcome，失败 throw tagged error。 */
export type RunChange = (name: string, signal: AbortSignal) => Promise<RunOutcome>

/** 注册同步 shutdown teardown；返回反注册 fn。 */
export type RegisterShutdown = (teardown: () => void) => () => void

/** 旁路 kanban observer（fire-and-forget，绝不 throw 出去）。 */
export interface AfkObserver {
  onState(name: string, state: AutomationState, extra?: Record<string, string>): void
}

export type SchedulerConfig = Pick<AutomationConfig, 'maxParallel' | 'maxRetries' | 'level'>

export interface SchedulerDeps {
  readonly state: StateWriter
  readonly runChange: RunChange
  readonly registerShutdown: RegisterShutdown
  readonly config: SchedulerConfig
  readonly observer?: AfkObserver
}

export interface Scheduler {
  /** 处理一个显式候选列表到收口（allSettled）。 */
  runRoundOnce(candidates: string[]): Promise<void>
}

/**
 * yaml_set 拒 换行 / ": " / 首引号（kernel 四闸）。把错误 message 压成单行安全 token，
 * 让字段写永不弹（老仓 scheduler/scheduler.ts:232-239）。
 */
const sanitize = (s: string): string =>
  s
    .replace(/[\r\n]+/g, ' ')
    .replace(/:\s/g, '; ')
    .replace(/\s#/g, ' ')
    .replace(/^["']+/, '')
    .slice(0, 200)
    .trim() || 'error'

/** 已 settle 的终态；"skipped" = 写回发现 change 已被他人 settle，啥都没动。 */
type Terminal = AutomationState | 'skipped'

export const createScheduler = (deps: SchedulerDeps): Scheduler => {
  const { state, runChange, registerShutdown, config } = deps
  const observer = deps.observer
  const semaphore = createSemaphore(config.maxParallel)
  // in-flight = automation 此刻为 running 的 change；shutdown teardown 同步读它逐个标 failed。
  const inFlight = new Set<string>()

  registerShutdown(() => {
    for (const name of inFlight) {
      try {
        state.markFailedSync(name, 'scheduler interrupted')
      } catch {
        // best-effort：一个标失败不阻断其余
      }
    }
  })

  const emit = (name: string, s: AutomationState, extra?: Record<string, string>): void => {
    if (!observer) return
    try {
      observer.onState(name, s, extra)
    } catch {
      // 旁路 channel——吞错，绝不拖垮写回
    }
  }

  /** 成功写回：verify-fail 转失败路；否则按分级 settleSuccess 落 merged(L3) / paused(L1/L2)。 */
  const writeBackSuccess = async (name: string, outcome: RunOutcome): Promise<Terminal> => {
    if (outcome.verifyResult === 'fail') {
      return applyFailure(name, { verifyFail: true })
    }
    const current = await state.getAutomation(name).catch(() => '')
    if (isSettled(current)) return 'skipped'
    const target = settleSuccess(config.level) // L1/L2 → paused；L3 → merged
    const won = await state.setAutomationOwned(name, target)
    if (!won) return 'skipped'
    // 成功 = 问题已花完，attempts 清零（若日后重排从干净预算起）。
    await state.setField(name, 'automation_attempts', '0')
    return target
  }

  /** 失败写回：分类 → conflict(留现场, 不重试) | retry(queued, attempts++) → failed(耗尽)。 */
  const applyFailure = async (name: string, err: unknown): Promise<Terminal> => {
    const c = classifyFailure(err)
    const lastError = sanitize(c.message)
    // fast-path settled FIRST：已被外部 settle → 跳过一切，连 attempts 都不烧（防幽灵重排）。
    const current = await state.getAutomation(name).catch(() => '')
    if (isSettled(current)) return 'skipped'

    if (c.kind === 'conflict') {
      const won = await state.setAutomationOwned(name, 'conflict')
      if (!won) return 'skipped'
      await state.setField(name, 'automation_last_error', lastError)
      if (c.preservedPath) await state.setField(name, 'automation_preserved_path', sanitize(c.preservedPath))
      return 'conflict'
    }

    // retry 类：原子自增 attempts（决定 queued vs failed），再双 cas 提交。
    const { value } = await state.incrAttempts(name, config.maxRetries)
    const next = settleFailure('retry', value, config.maxRetries) // queued | failed
    const won = await state.setAutomationOwned(name, next)
    if (!won) return 'skipped'
    await state.setField(name, 'automation_last_error', lastError)
    return next
  }

  const emitTerminal = (name: string, settled: Terminal): void => {
    if (settled === 'skipped') return
    emit(name, settled)
  }

  const handleOne = async (name: string): Promise<void> => {
    // ⑤ 原子认领：只有一个 worker 赢 queued→scheduled
    const won = await state.claim(name)
    if (!won) return // 已被他人/人工拿走，静默跳过

    // ② semaphore：限并发沙箱
    await semaphore.acquire()
    const controller = new AbortController()
    try {
      await state.setAutomation(name, 'running')
      emit(name, 'running')
      inFlight.add(name)
      try {
        const outcome = await runChange(name, controller.signal)
        emitTerminal(name, await writeBackSuccess(name, outcome))
      } catch (err) {
        emitTerminal(name, await applyFailure(name, err))
      } finally {
        // settle 完 → 不再 in-flight（迟到的 shutdown 不会再标它）
        inFlight.delete(name)
      }
    } finally {
      semaphore.release() // ② 槽永远归还，即便 throw
    }
  }

  const runRoundOnce = async (candidates: string[]): Promise<void> => {
    // ⑥ allSettled——绝不 Promise.all：单个 reject 不取消其余的写回。
    await Promise.allSettled(candidates.map((name) => handleOne(name)))
  }

  return { runRoundOnce }
}
