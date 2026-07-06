/**
 * 对外 SDK（BACKLOG #29）—— AFK 自动化的编排入口。
 *
 * 老仓真相源：sdk/src/{createSandbox,run}.ts（编排入口）+ scheduler/main.ts（daemon 装配）。
 * lite 把队列面收敛成 3 个动词：enqueue（挂队）/ scanReady（就绪扫描）/ runRound（跑一轮）。
 *
 * 全部经 @pipeline-lite/kernel StateStore 真读写 change 的 automation_* 字段（只 import 不改 kernel）。
 * 默认 L1 report-only（成功停 paused，不自动 merge）——GOAL A5 安全默认。
 */
import { join } from 'node:path'
import type { StateStore } from '@pipeline-lite/kernel'
import { claim, getAutomation, incrAttempts, markQueued, setAutomationOwned } from '../queue/claim.js'
import { shouldEnqueueOnSpecComplete } from '../queue/gate.js'
import { scanReadyFromFs } from '../queue/scan.js'
import { type RunChange, type StateWriter, createScheduler } from '../scheduler/scheduler.js'
import { type AutomationConfig, DEFAULT_CONFIG } from '../types.js'

export interface AutomationDeps {
  readonly repoRoot: string
  readonly store: StateStore
  readonly clock: () => string
  /** 部分配置覆盖；SDK 默认 enabled/defaultOptIn 为 true（显式构造 SDK + 调 enqueue = 已 opt-in）。 */
  readonly config?: Partial<AutomationConfig>
}

export interface Automation {
  /** 挂队：off→queued + queued_at（经两层开关 + PM 永不闸）。返回是否入队。 */
  enqueue(name: string): Promise<boolean>
  /** 就绪扫描：真扫 openspec/changes/* 的 build+queued+deps 满足集（FIFO）。 */
  scanReady(): Promise<string[]>
  /** 跑一轮：scanReady → 逐 change claim + runChange + 分级 settle 写回。 */
  runRound(runChange: RunChange): Promise<void>
  /** 当前生效配置（含 level）。 */
  readonly config: AutomationConfig
}

const scalar = (v: string | string[] | undefined): string => (typeof v === 'string' ? v : '')

/** 把 kernel StateStore 适配成 scheduler 的 StateWriter port（每个方法定位到 changeDir(name)）。 */
export const storeWriter = (store: StateStore, changeDir: (name: string) => string): StateWriter => ({
  claim: (name) => claim(store, changeDir(name)),
  setAutomation: (name, s) => store.set(changeDir(name), 'automation', s),
  setField: (name, field, value) => store.set(changeDir(name), field as never, value),
  incrAttempts: (name, max) => incrAttempts(store, changeDir(name), max),
  getAutomation: (name) => getAutomation(store, changeDir(name)),
  setAutomationOwned: (name, next) => setAutomationOwned(store, changeDir(name), next),
  markFailedSync: (name, reason) => {
    // shutdown 同步 best-effort：无法 await，fire-and-forget（错误吞掉）。
    void store.setMany(changeDir(name), { automation: 'failed', automation_last_error: reason }).catch(() => {})
  },
})

export function createAutomation(deps: AutomationDeps): Automation {
  const config: AutomationConfig = { ...DEFAULT_CONFIG, enabled: true, defaultOptIn: true, ...deps.config }
  const { store, clock } = deps
  const changesDir = join(deps.repoRoot, 'openspec', 'changes')
  const changeDir = (name: string): string => join(changesDir, name)

  return {
    config,
    async enqueue(name) {
      const state = await store.read(changeDir(name))
      const eligible = shouldEnqueueOnSpecComplete({
        enabled: config.enabled,
        track: scalar(state.fields.track),
        automation: scalar(state.fields.automation),
        defaultOptIn: config.defaultOptIn,
      })
      if (!eligible) return false
      await markQueued(store, changeDir(name), clock)
      return true
    },
    scanReady() {
      return scanReadyFromFs(changesDir, store)
    },
    async runRound(runChange) {
      const candidates = await scanReadyFromFs(changesDir, store)
      const scheduler = createScheduler({
        state: storeWriter(store, changeDir),
        runChange,
        registerShutdown: () => () => {},
        config: { maxParallel: config.maxParallel, maxRetries: config.maxRetries, level: config.level },
      })
      await scheduler.runRoundOnce(candidates)
    },
  }
}
