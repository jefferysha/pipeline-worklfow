/**
 * channel 子命令 —— event-sourced worker 总线薄壳（BACKLOG #27 / GOAL A4 M4）。
 * 老仓真相源：skills/pipeline/scripts/channel-state.sh + channel/*.py（事件面语义见 kernel/src/channel/index.ts 顶注）。
 *
 * ★正交红线（架构级不可阉割）：channel 操作【正交持久 worker 层】，绝不触 barrier /
 *   confirm-review-interaction 三门 / build_sha / git-commit；主线仍 owns commits。
 *   本命令只引用 deps.io + deps.cwd（构造默认 host）——绝不读写 deps.store（.pipeline.yaml）、
 *   deps.flow（相位/转换）、三门 marker 或 git。事件全落在 channel root，与 openspec/changes 隔离。
 *
 * ── 事件面子命令 ──────────────────────────────────────────────────────────────────────────
 *   create / title / context / send / wait / messages / registry / interrupt / thread / forum / list / dir
 *   （send 三态校验：先 append message 永不丢，再据 delivery-mode + classifyDelivery 逐失败 target
 *    append undeliverable；thread 强制 forum 校验 + normalizeThreadKey + rename 防 silently merge。）
 * ── 进程管理层（非事件面）──────────────────────────────────────────────────────────────────
 *   spawn / kill / run / prune —— 建在 fork supervisor + OS 信号 + guard 四重 OS 判定之上
 *   （见 kernel guard.ts 顶注）；注入面见下方 ChannelHost 的 proc/fs/launchSupervisor。
 */
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  bucketDir,
  classifyDelivery,
  createChannelStore,
  echoOnlyAdapters,
  enforceSpawnBudget,
  eventsPath,
  formatBudgetOverflowError,
  formatThreadBoard,
  hasLiveWorker,
  matchesEventFilter,
  nodeChannelFs,
  nodeProcessFace,
  normalizeThreadKey,
  parseEventsText,
  projectKey,
  reduceThreads,
  resolveRoot,
  startSupervisor,
  toOverflowFacts,
  workerFile,
  type ChannelEnv,
  type ChannelEvent,
  type ChannelFs,
  type ChannelStore,
  type Clock,
  type DeliveryMode,
  type EventFilterOptions,
  type LivenessDeps,
  type ProcessFace,
  type Scope,
  type ShutdownReason,
  type SupervisorConfig,
  type WorkerGuardPolicy,
} from '@tenon/channel'
import { splitFlags } from '../argv.js'
import type { CliDeps } from '../deps.js'

/** run/spawn 起 supervisor 的产物：pid（forked）+ 可选 in-proc handle（shutdown/done，run 收尾用）。 */
export interface LaunchedSupervisor {
  pid: number | undefined
  shutdown?: (signalName: string, reason: ShutdownReason) => Promise<void>
  done?: Promise<number>
}

/** supervisor 启动器（缺省 fork CLI `channel __supervisor`；测试/run 注入 in-proc）。 */
export type SupervisorLauncher = (
  channel: string,
  worker: string,
  config: SupervisorConfig,
  scope: Scope,
) => Promise<LaunchedSupervisor> | LaunchedSupervisor

/**
 * channel host 注入面：event log store + env（事件面）+ 进程层注入（proc/fs/launchSupervisor）。
 * 事件面命令只用 store+env（缺省即可）；进程层命令（spawn/kill/run/prune）另用 proc/fs/launcher，
 * 全部可选、缺省真 node 面，集成/mock 注入 fake（真 fork/真信号在集成层）。
 */
export interface ChannelHost {
  store: ChannelStore
  env: ChannelEnv
  /** 真进程注入面（真 fork/kill/liveness）；缺省 nodeProcessFace()。 */
  proc?: ProcessFace
  /** channel fs 面（pid/reservation/cursor 文件）；缺省 nodeChannelFs()。 */
  fs?: ChannelFs
  /** 注入 now（预算/kill grace 判时）；缺省 Date.now。 */
  now?: () => number
  /** 注入 sleep（kill grace / run 轮询）；缺省真 setTimeout（unref）。 */
  sleep?: (ms: number) => Promise<void>
  /** 读环境变量（预算四级链的 env 层）；缺省 process.env。 */
  envVar?: (name: string) => string | undefined
  /** 递归删目录（prune/run 收尾）；缺省真 rmSync recursive（限 env.root 下）。 */
  rmrf?: (path: string) => void
  /** kill grace 上限 ms；缺省 8000。 */
  killGraceMs?: number
  /** supervisor 启动器；缺省 fork CLI `channel __supervisor`。 */
  launchSupervisor?: SupervisorLauncher
}

/** 真 host：$TRELLIS_CHANNEL_ROOT 或 ~/.trellis/channels + $TENON_CHANNEL_PROJECT 覆盖桶。 */
export function nodeChannelHost(cwd: string, clock?: Clock): ChannelHost {
  const root = resolveRoot(homedir(), process.env.TRELLIS_CHANNEL_ROOT)
  const override = process.env.TENON_CHANNEL_PROJECT
  const env: ChannelEnv = { root, cwd, ...(override ? { projectOverride: override } : {}) }
  return { store: createChannelStore(env, undefined, clock), env }
}

// ── 进程层 host 默认解析 ─────────────────────────────────────────────────────
export function hostFs(host: ChannelHost): ChannelFs {
  return host.fs ?? nodeChannelFs()
}
export function hostProc(host: ChannelHost): ProcessFace {
  return host.proc ?? nodeProcessFace()
}
export function hostNow(host: ChannelHost): () => number {
  return host.now ?? (() => Date.now())
}
function realSleep(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms)
    if (typeof t.unref === 'function') t.unref()
  })
}
export function hostSleep(host: ChannelHost): (ms: number) => Promise<void> {
  return host.sleep ?? realSleep
}
export function hostEnvVar(host: ChannelHost): (name: string) => string | undefined {
  return host.envVar ?? ((n) => process.env[n])
}
/** 递归删目录，硬护栏：只删 env.root 下的路径（绝不误删 cwd/openspec）。 */
export function hostRmrf(host: ChannelHost): (path: string) => void {
  return (
    host.rmrf ??
    ((path: string) => {
      if (!path.startsWith(host.env.root)) return // ★红线：绝不删 channel root 之外
      try {
        rmSync(path, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    })
  )
}

/** 缺省 supervisor 启动器：写 config 侧车 + fork CLI `channel __supervisor`（detached，同 root/桶 env）。 */
export function defaultLauncher(host: ChannelHost): SupervisorLauncher {
  return (channel, worker, config, scope) => {
    const fs = hostFs(host)
    const proc = hostProc(host)
    const cfgPath = workerFile(host.env, channel, worker, 'config', scope)
    fs.writeText(cfgPath, JSON.stringify(config))
    const entry = process.argv[1] ?? ''
    const childEnv: Record<string, string> = {
      TRELLIS_CHANNEL_ROOT: host.env.root,
      TENON_CHANNEL_PROJECT: projectKey(host.env),
    }
    const pid = proc.spawnDetached(process.execPath, [entry, 'channel', '__supervisor', channel, worker, cfgPath], {
      env: childEnv,
    })
    return { pid }
  }
}

export const KILL_GRACE_MS = 8000
export const CLEANUP_SUFFIXES = ['pid', 'worker-pid', 'config', 'spawnlock', 'reservation', 'shutdown-reason']

export function intFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const v = strFlag(flags, key)
  if (v === undefined) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isInteger(n) ? n : undefined
}
function intOrUndef(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isInteger(n) ? n : undefined
}

/** spawn/idle 预算 policy（CLI>env>default 三级链；manifest 四级由主线 barrier 侧管，进程层不碰）。 */
export function resolvePolicy(host: ChannelHost, flags: Record<string, string | true>): WorkerGuardPolicy {
  const envVar = hostEnvVar(host)
  const max = intFlag(flags, 'max-live-workers') ?? intOrUndef(envVar('TRELLIS_CHANNEL_MAX_LIVE_WORKERS')) ?? 0
  const idle = intFlag(flags, 'idle-timeout') ?? intOrUndef(envVar('TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT')) ?? 0
  return { idleTimeoutMs: idle, maxLiveWorkers: max }
}

/** 秒解析：<n>[ms|s|m|h|d]（缺省 s）。非法 → fallback。 */
export function parseDurationS(s: string | undefined, fallback: number): number {
  const m = /^(\d+)(ms|s|m|h|d)?$/.exec((s ?? '').trim())
  if (!m) return fallback
  const amount = m[1]
  if (amount === undefined) return fallback
  const n = Number.parseInt(amount, 10)
  const unit = m[2] ?? 's'
  const mul: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 }
  const multiplier = mul[unit]
  return multiplier === undefined ? fallback : n * multiplier
}

/**
 * 快照扫描「无匹配」的退出码。沿用 124 是为兼容既有调用方的判码习惯（124 = GNU timeout 的
 * 超时码），但**语义不是「等待超时」**——cmdWait 从不等待新事件，扫完现存事件即返回。
 * 措辞与常量名都按实际语义写，别再叫 TIMEOUT。
 */
export const NO_MATCH_EXIT = 124
export const USAGE_EXIT = 2

/** 用法/校验错误哨兵（对齐老仓 red → exit 2）。 */
export class ChannelDie extends Error {
  constructor(
    msg: string,
    readonly code = USAGE_EXIT,
  ) {
    super(msg)
  }
}
export function die(msg: string, code = USAGE_EXIT): never {
  throw new ChannelDie(msg, code)
}

/** flag 解析共享 argv.ts splitFlags（--key 后若 next 非 -- → 值，否则布尔 true）。 */
export interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

export function strFlag(flags: Record<string, string | true>, key: string): string | undefined {
  const v = flags[key]
  return typeof v === 'string' ? v : undefined
}

/**
 * 数值 flag 严格解析（对齐 mem.ts parseOptionalNumberFlag:84-90 口径）：未给 → undefined；
 * 给了但非有限数 → die exit 2（fail-loud，不让 NaN 静默失效过滤器/返回全部）。
 */
export function numberFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const v = flags[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string') die(`[channel] --${key} 需数值`)
  const n = Number(v)
  if (!Number.isFinite(n)) die(`[channel] --${key} 非法数值: ${v}`)
  return n
}

export function scopeOf(flags: Record<string, string | true>): Scope {
  return strFlag(flags, 'scope') === 'global' ? 'global' : 'project'
}

export function csv(v: string | undefined): string[] {
  if (!v) return []
  return v
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export function emit(deps: CliDeps, ev: unknown): void {
  deps.io.out(JSON.stringify(ev))
}

// ── create / title / context ─────────────────────────────────────────────────
