/**
 * liveness —— worker guard 运行时层（OS-liveness 四重判定 + SIGTERM cleanup + spawn 预算执行）。
 * 进程层（BACKLOG #27b / GOAL A4 M4），在 #27 只读 guard.ts 纯谓词之上加 OS 探针。
 * 老仓真相源：skills/pipeline/scripts/channel/guard.py（scan_live_workers:134 四重判定 +
 *   reservation 占位 / cleanup_expired_idle_workers:224 / enforce_spawn_budget:259 /
 *   _read_reservation_workers:113）+ channel-state.sh cmd_prune has_live_worker:601。
 *
 * ★正交不变量（不可阉割，与 #27 guard.ts 同律）：
 *   · 只读 events.jsonl + pid 文件 + ps，发 OS 信号（SIGTERM）+ 写 shutdown-reason 侧车；
 *   · 绝不 import state store、不读写 .pipeline.yaml 的 phase/gate/build_sha、不碰 git commit；
 *   · killed 事件由 supervisor 幂等漏斗发（liveness 从不自己 append killed）；
 *   · budget overflow 只 reject 新 spawn，主线 build/verify/ship barrier 完全不经此路径。
 *
 * 四重判定（scanLiveWorkers，缺一不可，照搬 guard.py:164-186）：
 *   ① 事件投影 reduceWorkerRegistry 非 terminal（durable 真相、可重放、跨机一致，guard.ts liveWorkerCandidates）
 *   ② <worker>.pid 文件存在（= supervisor 自己的 pid）
 *   ③ pid OS 存活（proc.pidAlive = os.kill(pid,0)）
 *   ④ ps cmdline 验证（proc.isSupervisorProcess，防 pid 复用：死 supervisor 的 pid 被分给别的进程）
 *
 * 纯逻辑 + 注入 ChannelFs（读盘）+ ProcessFace（OS 探针/信号）。零第三方依赖。
 */
import { parseEventsText } from './events.js'
import type { ChannelFs } from './fs.js'
import { isIdleCleanupEligible, spawnBudgetVerdict, TERMINAL_LIFECYCLES, type OverflowLiveFact } from './guard.js'
import { bucketDir, channelDir, eventsPath, workerFile, type ChannelEnv } from './paths.js'
import { reduceWorkerRegistry } from './worker-state.js'
import type { ProcessFace } from './process.js'
import type { Scope, WorkerState } from './types.js'

/** scanLiveWorkers 输出的一条活 worker 事实（供 barrier 只读 + cleanup 消费）。 */
export interface LiveWorker {
  channel: string
  workerId: string
  state: WorkerState
  supervisorPid: number
  supervisorVerified: boolean
  workerPid?: number
}

/** idle 清理 / spawn 预算 policy（走 R6 manifest 四级链，liveness 只消费不重解析）。 */
export interface WorkerGuardPolicy {
  idleTimeoutMs: number
  maxLiveWorkers: number
}

/** liveness 的注入面：读盘 + OS 探针。 */
export interface LivenessDeps {
  env: ChannelEnv
  fs: ChannelFs
  proc: ProcessFace
}

function readPid(fs: ChannelFs, path: string): number | undefined {
  const raw = fs.readText(path)
  if (raw === undefined) return undefined
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isInteger(n) ? n : undefined
}

/** 扫 <channel>/*.reservation → 合成 starting/idle 占位 worker（无 idleSince，永不被 idle 清理，guard.py:113）。 */
function readReservationWorkers(fs: ChannelFs, dir: string): { id: string; state: WorkerState }[] {
  const out: { id: string; state: WorkerState }[] = []
  const entries = fs.listDir(dir)
  const names = entries
    .filter((e) => e.isFile && e.name.endsWith('.reservation'))
    .map((e) => e.name)
    .sort()
  for (const name of names) {
    const wid = name.slice(0, -'.reservation'.length)
    if (!wid) continue
    out.push({
      id: wid,
      state: {
        id: wid,
        lifecycle: 'starting',
        activity: 'idle',
        terminal: false,
        inboxPolicy: 'explicitOnly',
        pendingMessageCount: 0,
      },
    })
  }
  return out
}

/**
 * 扫 project 桶下每 channel 的活 worker（四重判定）+ reservation 占位（guard.py:134）。
 * scope=project（cwd 桶，guard 只护当前项目）。返回按 (channel, workerId) 稳定序。
 */
export function scanLiveWorkers(deps: LivenessDeps, scope: Scope = 'project'): LiveWorker[] {
  const { env, fs, proc } = deps
  const bucket = bucketDir(env, scope)
  const out: LiveWorker[] = []
  const entries = fs.listDir(bucket)
  const channels = entries
    .filter((e) => e.isDirectory && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()

  for (const channel of channels) {
    const dir = channelDir(env, channel, scope)
    const seen = new Set<string>()
    const evText = fs.readText(eventsPath(env, channel, scope))
    const workers = reduceWorkerRegistry(parseEventsText(evText)).workers
    for (const st of workers) {
      // 判定①：事件投影 — 非 terminal。
      if (st.terminal || TERMINAL_LIFECYCLES.has(st.lifecycle)) continue
      // 判定②：supervisor pid 文件存在。
      const supPid = readPid(fs, workerFile(env, channel, st.id, 'pid', scope))
      // 判定③：pid OS 存活。
      if (supPid === undefined || !proc.pidAlive(supPid)) continue
      // 判定④：ps cmdline 验证（防 pid 复用）。
      const verified = proc.isSupervisorProcess(supPid, channel, st.id)
      const rec: LiveWorker = { channel, workerId: st.id, state: st, supervisorPid: supPid, supervisorVerified: verified }
      const wp = readPid(fs, workerFile(env, channel, st.id, 'worker-pid', scope))
      if (wp !== undefined) rec.workerPid = wp
      out.push(rec)
      seen.add(st.id)
    }
    // reservation 占位（第四重的孪生，防 spawn 事件落盘前的 race 窗口漏算，guard.py:188）。
    for (const rsv of readReservationWorkers(fs, dir)) {
      if (seen.has(rsv.id)) continue
      const supPid = readPid(fs, workerFile(env, channel, rsv.id, 'pid', scope))
      if (supPid === undefined || !proc.pidAlive(supPid)) continue
      out.push({
        channel,
        workerId: rsv.id,
        state: rsv.state,
        supervisorPid: supPid,
        supervisorVerified: proc.isSupervisorProcess(supPid, channel, rsv.id),
      })
    }
  }
  return out
}

export interface CleanupResult {
  killed: LiveWorker[]
  failed: { worker: LiveWorker; error: string }[]
}

/**
 * 对过期 idle worker 写 shutdown-reason 侧车 + SIGTERM supervisor（不直杀 worker、不写 killed，guard.py:224）。
 * 唯一 killed 事件由 supervisor 幂等漏斗发（事件单一来源）。失败收集不致命，下次 scan 重判。
 */
export function cleanupExpiredIdleWorkers(
  deps: LivenessDeps,
  candidates: LiveWorker[],
  idleTimeoutMs: number,
  nowMs: number,
  scope: Scope = 'project',
): CleanupResult {
  const { env, fs, proc } = deps
  const result: CleanupResult = { killed: [], failed: [] }
  if (idleTimeoutMs <= 0) return result
  for (const live of candidates) {
    if (!isIdleCleanupEligible(live, idleTimeoutMs, nowMs)) continue
    try {
      // 再查三条（scan 与 cleanup 间可能变）：pid 在 + verified + alive。
      const supPid = live.supervisorPid
      if (supPid === undefined || live.supervisorVerified !== true || !proc.pidAlive(supPid)) continue
      const reasonFile = workerFile(env, live.channel, live.workerId, 'shutdown-reason', scope)
      fs.writeText(reasonFile, 'idle-timeout\n') // 先写侧车
      const sent = proc.kill(supPid, 'SIGTERM') // 再 SIGTERM supervisor
      if (!sent) {
        fs.remove(reasonFile) // 失败回滚侧车（防下次误判 idle）
        result.failed.push({ worker: live, error: 'SIGTERM failed' })
        continue
      }
      result.killed.push(live)
    } catch (e) {
      result.failed.push({ worker: live, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}

export interface EnforceResult {
  cleaned: LiveWorker[]
  remaining: LiveWorker[]
  allowed: boolean
}

/**
 * spawn 预算执行：scan→cleanup 过期 idle→重扫剔已杀→判额（guard.py:259）。
 * maxLiveWorkers<=0 → 禁用预算（allowed=True）。重扫剔已杀不可省：SIGTERM 异步，grace 期 pid 文件
 * 还在，直接重扫会把刚杀的算进 remaining → 误判超额。
 */
export function enforceSpawnBudget(
  deps: LivenessDeps,
  policy: WorkerGuardPolicy,
  nowMs: number,
  scope: Scope = 'project',
): EnforceResult {
  const initial = scanLiveWorkers(deps, scope)
  const cleanup = cleanupExpiredIdleWorkers(deps, initial, policy.idleTimeoutMs, nowMs, scope)
  const killedIds = new Set(cleanup.killed.map((w) => `${w.channel}::${w.workerId}`))
  const rescan = scanLiveWorkers(deps, scope)
  const remaining = rescan.filter((w) => !killedIds.has(`${w.channel}::${w.workerId}`))
  const allowed = spawnBudgetVerdict(remaining.length, policy.maxLiveWorkers).allowed
  return { cleaned: cleanup.killed, remaining, allowed }
}

/** LiveWorker → OverflowLiveFact（formatBudgetOverflowError 消费，guard.ts:88）。 */
export function toOverflowFacts(live: LiveWorker[]): OverflowLiveFact[] {
  return live.map((w) => ({
    channel: w.channel,
    workerId: w.workerId,
    provider: w.state.provider,
    lifecycle: w.state.lifecycle,
    activity: w.state.activity,
    supervisorPid: w.supervisorPid,
    supervisorVerified: w.supervisorVerified,
  }))
}

/**
 * 某 channel 目录是否有活 worker（prune 跳 hasLiveWorker 不可阉割，channel-state.sh:601）。
 * 扫 *.pid 文件，任一 pid OS 存活即 true。
 */
export function hasLiveWorker(fs: ChannelFs, proc: ProcessFace, dir: string): boolean {
  for (const e of fs.listDir(dir)) {
    if (!e.isFile || !e.name.endsWith('.pid')) continue
    const pid = readPid(fs, `${dir}/${e.name}`)
    if (pid !== undefined && proc.pidAlive(pid)) return true
  }
  return false
}
