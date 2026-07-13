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
import { readAutomationJson, type AutomationJsonFs } from '../config/automationJson.js'
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
  /** automation.json 读取的 fs 注入面（测试用）；缺省真 node fs。 */
  readonly configFs?: AutomationJsonFs
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
    // F-b 同写纪律：cause 同批落空串——中断 reason 是自由文本（非 tag，无法干净定成因），空串交
    // 读取端 regex 兜底；覆盖式写掉上一轮残留 cause，防与新 last_error 撕裂。
    void store.setMany(changeDir(name), { automation: 'failed', automation_last_error: reason, automation_cause: '' }).catch(() => {})
  },
})

export function createAutomation(deps: AutomationDeps): Automation {
  // T21 装配优先级：显式 deps.config > <root>/.pipeline/automation.json > SDK 内置
  // （enabled/defaultOptIn=true，显式构造即 opt-in）> DEFAULT_CONFIG。文件缺失/损坏 fail-open
  // 不改变既有行为；文件里的 image 归 dockerRunChange 装配点消费（cli/commands/afk.ts），
  // 不属于 AutomationConfig。enabled/level 不进文件（automationJson.ts 头【决策登记】）。
  const { image: _image, ...fileCfg } = readAutomationJson(deps.repoRoot, deps.configFs)
  const config: AutomationConfig = { ...DEFAULT_CONFIG, enabled: true, defaultOptIn: true, ...fileCfg, ...deps.config }
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
