/**
 * supervisor —— worker 生命周期编排（进程层，BACKLOG #27b / GOAL A4 M4）。
 * 一个长驻编排 1:1 拥有一个 worker 子进程（echo/claude/codex），把 worker ↔ events.jsonl 双向桥接。
 *
 * 老仓真相源（合并多模块，逐处标行号）：
 *   · supervisor.py:97 run_supervisor（17 步启动顺序不可重排）、:88 _cleanup（删短暂件，留 log/session/cursor）。
 *   · shutdown.py:42 ShutdownController（幂等漏斗 + kill ladder + killed 一次性 + finalize_on_exit 冷退出合成）。
 *   · inbox_watcher.py:71 run_inbox_watcher（tail to=<worker> → adapter → stdin，持久 cursor 防重放）。
 *   · stdout_pump.py:66 apply_parse_result（stdout 行 → adapter.parse_line → 事件 + session/reply 副作用）。
 *   · idle.py:32 _IdleTimerHandle（idle 超时自杀，mid-turn pause，fire 三重护栏）。
 *   · adapters/echo.py:18 EchoAdapter（spawn cat -u 回显，最小可用基线）。
 *
 * 三循环（Node 单线程 async 模型，非 Python daemon thread）：
 *   循环1 stdout pump  = onStdoutLine 事件驱动，解析 worker stdout → adapter → 追加事件。
 *   循环3 inbox watcher = tailEvents 异步生成器，tail events.jsonl 取 to=<worker> → adapter → stdin。
 *   idle/timeout timer  = setTimeout（unref，对应 daemon Timer）；shutdown 漏斗收口所有退出触发源。
 *
 * ★正交（与 #27 同律）：supervisor 是【正交持久 worker 层】，与 build→verify barrier 正交，绝不触
 *   barrier/三门/build_sha；worker 只产事件 + 工作树文件改动，git commit 永远只由主线执行。
 * 纯逻辑 + 注入 ProcessFace/ChannelStore/ChannelFs/TailFs。零第三方依赖。
 */
import type { ChannelStore } from './store.js'
import type { ChannelFs } from './fs.js'
import type { ChannelEnv } from './paths.js'
import { eventsPath, workerFile } from './paths.js'
import type { ProcessFace, WorkerProcess } from './process.js'
import { nodeTailFs, tailEvents, type TailFs } from './watcher.js'
import { TurnTracker } from './turns.js'
import { matchesInboxPolicy } from './filters.js'
import type { ChannelEvent, EventPartial, InboxPolicy, Scope } from './types.js'

export type ShutdownReason = 'explicit-kill' | 'timeout' | 'crash' | 'idle-timeout'
export const SHUTDOWN_REASONS: readonly ShutdownReason[] = ['explicit-kill', 'timeout', 'crash', 'idle-timeout']

const SHUTDOWN_GRACE_MS = 3000
const DEFAULT_INBOX_POLICY: InboxPolicy = 'explicitOnly'

// ═══════════════════════ adapter 契约 + echo 落地 ═══════════════════════

/** adapter.parse_line 的产物（stdout_pump.py apply_parse_result 消费）。 */
export interface ParseResult {
  events: { kind: string; payload?: Record<string, unknown> }[]
  side?: {
    reply?: string[]
    persistSessionId?: string
    persistThreadId?: string
  } | null
}

/** worker adapter：把某 provider 的进程协议翻成 channel 语义（adapters/__init__.py）。 */
export interface WorkerAdapter<Ctx = unknown> {
  /** 进程二进制名（spawn 用）。 */
  readonly provider: string
  createCtx(): Ctx
  /** argv（不含二进制名）。 */
  buildArgs(view: AdapterView): string[]
  isReady(ctx: Ctx): boolean
  encodeUserMessage(text: string, ctx: Ctx): string
  encodeInterruptMessage(text: string, ctx: Ctx): string
  parseLine(line: string, ctx: Ctx): ParseResult
  handshake?(child: WorkerProcess, ctx: Ctx, view: AdapterView): void
}

export interface AdapterView {
  resume?: unknown
  model?: unknown
  systemPrompt?: unknown
  cwd?: string
}

/** echo adapter：spawn `cat -u`（unbuffered 行回显），验证三循环桥接不依赖真 LLM（echo.py:18）。 */
export class EchoAdapter implements WorkerAdapter<{ ready: boolean }> {
  readonly provider = 'cat'
  createCtx(): { ready: boolean } {
    return { ready: true }
  }
  buildArgs(): string[] {
    return ['-u'] // cat -u：unbuffered 行回显
  }
  isReady(): boolean {
    return true
  }
  encodeUserMessage(text: string): string {
    return text + '\n'
  }
  encodeInterruptMessage(text: string): string {
    return text + '\n'
  }
  parseLine(line: string): ParseResult {
    // 回显行 → done 事件（携回显文本），让 wait --kind done 醒。
    return { events: [{ kind: 'done', payload: { text: line.trim() } }], side: null }
  }
}

// ═══════════════════════ ShutdownController 幂等漏斗 ═══════════════════════

/** 定时器注入面（默认 setTimeout+unref = daemon Timer；测试注入手动步进）。 */
export type Scheduler = (fn: () => void, ms: number) => () => void

const defaultScheduler: Scheduler = (fn, ms) => {
  const t = setTimeout(fn, ms)
  if (typeof t.unref === 'function') t.unref()
  return () => clearTimeout(t)
}

export interface ShutdownDeps {
  worker: string
  append: (partial: EventPartial) => void
  child: () => WorkerProcess
  graceMs?: number
  timeoutMs?: number
  idleTimeoutMs?: number
  schedule?: Scheduler
  log?: (s: string) => void
}

/**
 * 唯一收口「worker 要走了」所有触发源（explicit-kill/timeout/crash/idle-timeout/信号/child exit）。
 * 铁律（shutdown.py:17）：① 幂等首调用胜；② kill ladder 一次性（killedStarted 守卫）；③ 冷退出合成
 * 只在无 reason（有显式 shutdown 时 killed 已 terminal）；④ 合成 synthesized=true、by=worker 名；
 * ⑤ finalize_on_exit await 在途 killed 才 exit（防事件 race 进程死）。
 */
export class ShutdownController {
  private reason: string | undefined
  private signal: string | undefined
  private terminalEmitted = false
  private killedStarted = false
  private killedDone = false
  private killedWaiters: (() => void)[] = []
  private readonly ladderCancels: (() => void)[] = []
  private readonly schedule: Scheduler
  private readonly graceMs: number
  private readonly log: (s: string) => void

  constructor(private readonly deps: ShutdownDeps) {
    this.schedule = deps.schedule ?? defaultScheduler
    this.graceMs = deps.graceMs ?? SHUTDOWN_GRACE_MS
    this.log = deps.log ?? (() => {})
  }

  isShuttingDown(): boolean {
    return this.reason !== undefined
  }
  markTerminalEmitted(): void {
    this.terminalEmitted = true
  }
  hasTerminalEvent(): boolean {
    return this.terminalEmitted
  }
  /** 首占返 true；已占返 false（幂等首调用胜，shutdown.py:72）。 */
  claim(reason: string): boolean {
    if (this.reason !== undefined) return false
    this.reason = reason
    return true
  }

  private settleKilled(): void {
    this.killedDone = true
    const waiters = this.killedWaiters.splice(0)
    for (const w of waiters) w()
  }

  private awaitKilled(): Promise<void> {
    if (this.killedDone || !this.killedStarted) return Promise.resolve()
    return new Promise((resolve) => this.killedWaiters.push(resolve))
  }

  // kill ladder：close stdin → grace → SIGTERM → grace → SIGKILL（shutdown.py:93）。
  private startKillLadder(): void {
    const child = this.deps.child()
    child.closeStdin()
    const step3 = (): void => {
      if (!child.exited()) {
        this.log('[supervisor] still alive, SIGKILL worker\n')
        child.kill('SIGKILL')
      }
    }
    const step2 = (): void => {
      if (!child.exited()) {
        this.log('[supervisor] grace expired, SIGTERM worker\n')
        child.kill('SIGTERM')
        this.ladderCancels.push(this.schedule(step3, this.graceMs))
      }
    }
    this.ladderCancels.push(this.schedule(step2, this.graceMs))
  }

  private writeKilled(reason: string, signal: string): void {
    const partial: EventPartial = { kind: 'killed', by: `supervisor:${this.deps.worker}`, reason, signal }
    if (reason === 'timeout' && this.deps.timeoutMs) partial.timeout_ms = this.deps.timeoutMs
    if (reason === 'idle-timeout' && this.deps.idleTimeoutMs) partial.idle_timeout_ms = this.deps.idleTimeoutMs
    try {
      this.deps.append(partial)
    } finally {
      this.settleKilled()
    }
  }

  /** 幂等漏斗：起 kill ladder + 写 killed（一次性，shutdown.py:142）。 */
  async request(signalName: string, reason: string): Promise<void> {
    let already: boolean
    if (this.killedStarted) {
      already = true
    } else {
      already = false
      this.killedStarted = true
      if (this.reason === undefined) this.reason = reason
      if (this.signal === undefined) this.signal = signalName
    }
    if (already) {
      await this.awaitKilled() // 已有在途/完成的 ladder——等它落地（保排序）。
      return
    }
    this.log(`[supervisor] shutting down worker (reason=${this.reason}, signal=${this.signal})\n`)
    this.startKillLadder()
    this.writeKilled(this.reason!, this.signal!)
  }

  /** child exit 时调：冷退出合成 fallback + 等在途 killed 落地（shutdown.py:164）。 */
  async finalizeOnExit(code: number | null, signalObj: string | null): Promise<void> {
    this.log(`[supervisor] worker exit code=${code ?? 'null'} signal=${signalObj ?? 'null'}\n`)
    let synth = false
    if (!this.terminalEmitted && this.reason === undefined) {
      this.terminalEmitted = true
      synth = true
    }
    if (synth) {
      if (code === 0) {
        this.deps.append({ kind: 'done', by: this.deps.worker, synthesized: true, exit_code: code })
      } else {
        this.deps.append({
          kind: 'error',
          by: this.deps.worker,
          message: `worker exited without terminal event (code=${code}, signal=${signalObj})`,
          synthesized: true,
          exit_code: code,
          exit_signal: signalObj,
        })
      }
    }
    if (this.killedStarted) await this.awaitKilled()
  }

  /** supervisor 收尾：取消在途 ladder timer（防泄漏）。 */
  dispose(): void {
    for (const c of this.ladderCancels.splice(0)) c()
  }
}

// ═══════════════════════ idle timer（OOM 护栏）═══════════════════════

/** idle 超时自杀计时器（idle.py:32）。绑 TurnTracker：mid-turn pause / idle reset。fire 三重护栏。 */
export class IdleTimer {
  private cancel: (() => void) | undefined
  private cancelled = false
  constructor(
    private readonly idleTimeoutMs: number,
    private readonly shutdown: ShutdownController,
    private readonly isChildExited: () => boolean,
    private readonly schedule: Scheduler = defaultScheduler,
  ) {
    if (idleTimeoutMs > 0) this.reset()
  }
  private clear(): void {
    if (this.cancel) {
      this.cancel()
      this.cancel = undefined
    }
  }
  private fire(): void {
    this.cancel = undefined
    if (this.cancelled) return
    // 三重护栏（纵深防御，idle.py:53）。
    if (this.shutdown.isShuttingDown() || this.shutdown.hasTerminalEvent() || this.isChildExited()) return
    void this.shutdown.request('SIGTERM', 'idle-timeout')
  }
  reset(): void {
    if (this.cancelled || this.idleTimeoutMs <= 0) return
    this.clear()
    this.cancel = this.schedule(() => this.fire(), this.idleTimeoutMs)
  }
  pause(): void {
    this.clear()
  }
  dispose(): void {
    this.cancelled = true
    this.clear()
  }
}

// ═══════════════════════ stdout pump 核心（apply_parse_result）═══════════════════════

/** worker stdout 行的 adapter 产物 → channel 事件 + 副作用（stdout_pump.py:66）。 */
export function applyParseResult(
  worker: string,
  result: ParseResult,
  child: WorkerProcess,
  shutdown: ShutdownController,
  append: (partial: EventPartial) => void,
  persist: (suffix: string, value: string) => void,
  turnTracker?: TurnTracker,
): void {
  for (const ev of result.events ?? []) {
    const kind = ev.kind
    // 同步先占 terminal slot（防 racing child exit→finalizeOnExit 看到 false 双合成）。
    if (kind === 'done' || kind === 'error') shutdown.markTerminalEmitted()
    append({ kind, by: worker, ...(ev.payload ?? {}) })
    if (kind === 'done' || kind === 'error') {
      const turn = turnTracker?.finish()
      if (turn) {
        append({
          kind: 'turn_finished',
          by: worker,
          worker,
          inputSeq: turn.inputSeq,
          turnId: turn.turnId,
          outcome: kind === 'done' ? 'done' : 'error',
        })
      }
    }
  }
  const side = result.side
  if (side) {
    if (side.persistSessionId) persist('session-id', side.persistSessionId)
    if (side.persistThreadId) persist('thread-id', side.persistThreadId)
    if (side.reply) {
      for (const r of side.reply) {
        try {
          child.write(r)
        } catch {
          /* stdin 关——supervisor 即将退 */
        }
      }
    }
  }
}

// ═══════════════════════ inbox watcher 事件资格（inbox_watcher.py 过滤）═══════════════════════

/** 这条事件该不该被 <worker> 的 inbox watcher 处理（inbox_watcher.py:86 + matches_inbox_policy）。 */
export function inboxEventEligible(ev: ChannelEvent, worker: string, policy: InboxPolicy): boolean {
  if (ev.by === worker) return false // 忽略自己发的
  if (ev.kind === 'message') return matchesInboxPolicy(ev, worker, policy)
  if (ev.kind === 'interrupt_requested') return ev.worker === worker
  return false
}

// ═══════════════════════ SupervisorConfig + startSupervisor ═══════════════════════

export interface SupervisorConfig {
  provider: string
  cwd?: string
  systemPrompt?: string
  env?: Record<string, string>
  model?: string
  resume?: unknown
  timeoutMs?: number
  warnBeforeMs?: number
  idleTimeoutMs?: number
  spawnedBy?: string
  agent?: unknown
  inboxPolicy?: InboxPolicy
  contextFiles?: unknown
  contextManifests?: unknown
}

export interface SupervisorDeps {
  store: ChannelStore
  proc: ProcessFace
  fs: ChannelFs
  env: ChannelEnv
  /** provider → adapter（缺省仅 echo）。 */
  resolveAdapter: (provider: string) => WorkerAdapter
  scope?: Scope
  schedule?: Scheduler
  /** inbox watcher 轮询间隔 ms（缺省 25）。 */
  pollMs?: number
  /** 注入 sleep（缺省真 setTimeout）；测试可控。 */
  sleep?: (ms: number) => Promise<void>
  tailFs?: TailFs
  log?: (s: string) => void
}

export interface SupervisorHandle {
  channel: string
  worker: string
  /** worker 子进程 pid（spawn 失败 → undefined）。 */
  workerPid: number | undefined
  /** spawn 是否落地成功（pre-spawn 失败 → false，已 append error(by=supervisor:)）。 */
  spawned: boolean
  /** worker 退出 + cleanup 完成后 resolve（exit code 语义：0 正常收尾）。 */
  done: Promise<number>
  /** 请求优雅收尾（SIGTERM kill ladder + killed 事件）。 */
  shutdown(signalName: string, reason: ShutdownReason): Promise<void>
}

const CLEANUP_SUFFIXES = ['pid', 'worker-pid', 'config', 'spawnlock', 'shutdown-reason', 'reservation']

function sleepReal(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms)
    if (typeof t.unref === 'function') t.unref()
  })
}

/**
 * 启动 supervisor（in-process 编排 + 真 fork worker 子进程）。返回 handle 后三循环已在跑。
 * 严格启动顺序（supervisor.py:97 步骤 2-17）：写 pid → 选 adapter → spawn → shutdown 控制器 →
 * 挂 child exit → 等 spawn settle → 写 worker-pid → append spawned → idle timer + TurnTracker →
 * stdout pump → inbox watcher → handshake。pre-spawn 失败 → ONE error(by=supervisor:) + cleanup。
 */
export async function startSupervisor(
  channelName: string,
  workerName: string,
  config: SupervisorConfig,
  deps: SupervisorDeps,
): Promise<SupervisorHandle> {
  const scope: Scope = deps.scope ?? 'project'
  const { store, proc, fs, env } = deps
  const log = deps.log ?? (() => {})
  const schedule = deps.schedule ?? defaultScheduler
  const tailFs = deps.tailFs ?? nodeTailFs()
  const pollMs = deps.pollMs ?? 25
  const sleep = deps.sleep ?? sleepReal
  const append = (partial: EventPartial): ChannelEvent => store.append(channelName, partial, scope)
  const wfile = (worker: string, suffix: string): string => workerFile(env, channelName, worker, suffix, scope)
  const persist = (suffix: string, value: string): void => fs.writeText(wfile(workerName, suffix), value)

  // 2. 写 <worker>.pid（= 编排自己的 pid，让 kill/liveness 找到 supervisor）。
  store.ensureDir(channelName, scope)
  fs.writeText(wfile(workerName, 'pid'), String(proc.selfPid))

  // 3. 选 adapter / args / env。
  const adapter = deps.resolveAdapter(config.provider)
  const ctx = adapter.createCtx()
  const view: AdapterView = { resume: config.resume, model: config.model, systemPrompt: config.systemPrompt, cwd: config.cwd }
  const args = adapter.buildArgs(view)
  const childEnv: Record<string, string> = { ...(config.env ?? {}) }
  childEnv.TRELLIS_HOOKS = '0'
  childEnv.TRELLIS_CHANNEL = channelName
  childEnv.TRELLIS_CHANNEL_AS = workerName

  log(`[supervisor] starting ${adapter.provider} ${args.join(' ')}\n`)

  // 4. spawn worker（PIPE×3）。捕获 pre-spawn 失败（防线 A：ENOENT/EACCES）。
  const child = proc.spawn(adapter.provider, args, { cwd: config.cwd, env: childEnv })
  const settled = new Promise<boolean>((resolve) => {
    child.onSpawn(() => resolve(true))
    child.onError((err) => {
      log(`[supervisor] worker error: ${err.message}\n`)
      resolve(false)
    })
  })
  child.onStderr((chunk) => log(chunk))

  // 5. shutdown 控制器（在挂 child 监听之前）。
  const shutdown = new ShutdownController({
    worker: workerName,
    append: (p) => void append(p),
    child: () => child,
    timeoutMs: config.timeoutMs,
    idleTimeoutMs: config.idleTimeoutMs,
    schedule,
    log,
  })

  const abort = { aborted: false }
  let idleTimer: IdleTimer | undefined
  let doneResolve!: (code: number) => void
  const done = new Promise<number>((r) => (doneResolve = r))

  // 6. 挂 child exit（冷退出合成 + 等在途 killed）。
  child.onExit((code, signal) => {
    void (async () => {
      await shutdown.finalizeOnExit(code, signal)
      abort.aborted = true
      idleTimer?.dispose()
    })()
  })

  // 8. 等 spawn settle。9. spawn 失败 → ONE error(by=supervisor:) + cleanup + spawned=false。
  const ok = await settled
  if (!ok) {
    try {
      append({ kind: 'error', by: `supervisor:${workerName}`, message: 'worker spawn failed', provider: config.provider })
    } catch {
      /* best-effort */
    }
    cleanup(fs, wfile, workerName)
    doneResolve(1)
    return { channel: channelName, worker: workerName, workerPid: undefined, spawned: false, done, shutdown: async () => {} }
  }

  // 10. spawn 期间被抢跑 → 不写误导性 spawned。
  if (shutdown.isShuttingDown()) {
    doneResolve(0)
    return { channel: channelName, worker: workerName, workerPid: child.pid, spawned: false, done, shutdown: (s, r) => shutdown.request(s, r) }
  }

  // 11. 写 <worker>.worker-pid。
  if (child.pid !== undefined) fs.writeText(wfile(workerName, 'worker-pid'), String(child.pid))

  // 12. append spawned（durable 后才起 idle timer）。
  const spawnedPartial: EventPartial = {
    kind: 'spawned',
    by: config.spawnedBy || 'main',
    as: workerName,
    provider: config.provider,
    inboxPolicy: config.inboxPolicy || DEFAULT_INBOX_POLICY,
  }
  if (child.pid !== undefined) spawnedPartial.pid = child.pid
  if (config.agent) spawnedPartial.agent = config.agent
  if (config.contextFiles) spawnedPartial.files = config.contextFiles
  if (config.contextManifests) spawnedPartial.manifests = config.contextManifests
  append(spawnedPartial)

  // 13. idle timer + TurnTracker（hooks 互绑：mid-turn pause / idle reset）。
  idleTimer = new IdleTimer(config.idleTimeoutMs ?? 0, shutdown, () => child.exited(), schedule)
  const turnTracker = new TurnTracker(
    () => idleTimer!.pause(),
    () => idleTimer!.reset(),
  )

  // 14. 循环1 stdout pump（事件驱动）。
  child.onStdoutLine((line) => {
    log(line.endsWith('\n') ? line : line + '\n')
    let result: ParseResult
    try {
      result = adapter.parseLine(line, ctx)
    } catch (e) {
      log(`[supervisor] stdout line handler failed: ${e instanceof Error ? e.message : String(e)}\n`)
      try {
        append({ kind: 'error', by: `supervisor:${workerName}`, message: `stdout pipeline error: ${e instanceof Error ? e.message : String(e)}` })
      } catch {
        /* best-effort */
      }
      return
    }
    applyParseResult(workerName, result, child, shutdown, (p) => void append(p), persist, turnTracker)
  })

  // 16. 循环3 inbox watcher（在 handshake 前起，捕握手窗口内消息）。
  void runInboxWatcher({
    channelName,
    workerName,
    adapter,
    ctx,
    child,
    abort,
    inboxPolicy: config.inboxPolicy || DEFAULT_INBOX_POLICY,
    turnTracker,
    scope,
    env,
    fs,
    tailFs,
    append: (p) => void append(p),
    pollMs,
    sleep,
  })

  // 17. adapter handshake（无 initial prompt）；失败 → error(by=supervisor:) → shutdown。
  if (typeof adapter.handshake === 'function') {
    try {
      adapter.handshake(child, ctx, view)
    } catch (err) {
      log(`[supervisor] adapter handshake failed: ${err instanceof Error ? err.message : String(err)}\n`)
      try {
        append({ kind: 'error', by: `supervisor:${workerName}`, message: `handshake failed: ${err instanceof Error ? err.message : String(err)}`, detail: { source: 'handshake' } })
      } catch {
        /* best-effort */
      }
      void shutdown.request('SIGTERM', 'crash')
    }
  }

  // child exit → cleanup → resolve done。
  child.onExit(() => {
    void (async () => {
      // 等 finalizeOnExit（另一个 onExit 回调）落地在途 killed。
      await sleep(0)
      idleTimer?.dispose()
      shutdown.dispose()
      cleanup(fs, wfile, workerName)
      doneResolve(0)
    })()
  })

  return {
    channel: channelName,
    worker: workerName,
    workerPid: child.pid,
    spawned: true,
    done,
    shutdown: (s, r) => shutdown.request(s, r),
  }
}

/** 删短暂运行时件（保留 log/session-id/thread-id/inbox-cursor，supervisor.py:88）。 */
function cleanup(fs: ChannelFs, wfile: (worker: string, suffix: string) => string, worker: string): void {
  for (const suffix of CLEANUP_SUFFIXES) {
    try {
      fs.remove(wfile(worker, suffix))
    } catch {
      /* best-effort */
    }
  }
}

interface InboxWatcherArgs {
  channelName: string
  workerName: string
  adapter: WorkerAdapter
  ctx: unknown
  child: WorkerProcess
  abort: { aborted: boolean }
  inboxPolicy: InboxPolicy
  turnTracker: TurnTracker
  scope: Scope
  env: ChannelEnv
  fs: ChannelFs
  tailFs: TailFs
  append: (partial: EventPartial) => void
  pollMs: number
  sleep: (ms: number) => Promise<void>
}

const READY_DEADLINE_MS = 60_000

function readInboxCursor(fs: ChannelFs, env: ChannelEnv, channel: string, worker: string, scope: Scope): number {
  const raw = fs.readText(workerFile(env, channel, worker, 'inbox-cursor', scope))
  if (raw === undefined) return 0
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isInteger(n) && n > 0 ? n : 0
}

function writeInboxCursor(fs: ChannelFs, env: ChannelEnv, channel: string, worker: string, seq: number, scope: Scope): void {
  try {
    fs.writeText(workerFile(env, channel, worker, 'inbox-cursor', scope), String(seq))
  } catch {
    /* best-effort；最坏重放一条 */
  }
}

/**
 * inbox watcher（inbox_watcher.py:71 的 TS 等价）：tail events.jsonl 取 to=<worker> 的
 * message / interrupt_requested → 经 adapter 编码喂 worker stdin。持久 cursor 防 respawn 重放。
 * 铁律：cursor 写在 stdin write 之后；非 interrupt 等当前 turn 完（串行化）；interrupt 走 abort_current。
 */
async function runInboxWatcher(a: InboxWatcherArgs): Promise<void> {
  const { channelName: channel, workerName: worker, adapter, ctx, child, abort, inboxPolicy, turnTracker, scope, env, fs, tailFs, append, pollMs, sleep } = a
  let cursor = readInboxCursor(fs, env, channel, worker, scope)
  const path = eventsPath(env, channel, scope)

  const stream = tailEvents(tailFs, path, {
    fromStart: cursor === 0,
    sinceSeq: cursor > 0 ? cursor : undefined,
    pollMs,
    aborted: () => abort.aborted,
    sleep,
    filter: (ev) => inboxEventEligible(ev as ChannelEvent, worker, inboxPolicy),
  })

  for await (const ev of stream) {
    if (abort.aborted) return
    const kind = ev.kind
    const isInterrupt = kind === 'interrupt_requested'
    const text = String(ev.text ?? '').trim()
    const interruptText = String(ev.message ?? '').trim()
    if (!text && (!isInterrupt || !interruptText)) continue
    const seq = typeof ev.seq === 'number' ? ev.seq : cursor

    // 阻塞到 adapter 能收输入（如 codex thread/start 出 threadId）。
    if (!adapter.isReady(ctx)) {
      const deadline = Date.now() + READY_DEADLINE_MS
      while (!adapter.isReady(ctx) && Date.now() < deadline && !abort.aborted) await sleep(pollMs)
      if (!adapter.isReady(ctx)) {
        cursor = seq // 始终没 ready → 前进游标 continue（不死磕防卡死）。
        writeInboxCursor(fs, env, channel, worker, cursor, scope)
        continue
      }
    }

    if (!isInterrupt) {
      while (turnTracker.current() && !abort.aborted) await sleep(pollMs) // 等当前 turn 完（串行化）。
      if (abort.aborted) return
    }

    if (isInterrupt) {
      const aborted = turnTracker.abortCurrent()
      if (aborted) {
        append({ kind: 'turn_finished', by: worker, worker, inputSeq: aborted.inputSeq, turnId: aborted.turnId, outcome: 'aborted' })
      }
      const interruptedPartial: EventPartial = {
        kind: 'interrupted',
        by: worker,
        worker,
        reason: 'user',
        method: 'stdin',
        outcome: aborted ? 'interrupted' : 'no-active-turn',
      }
      if (aborted?.turnId) interruptedPartial.turnId = aborted.turnId
      append(interruptedPartial)
    }

    const turn = turnTracker.begin(seq)
    try {
      append({ kind: 'turn_started', by: worker, worker, inputSeq: seq, turnId: turn.turnId })
      const encoded = isInterrupt ? adapter.encodeInterruptMessage(interruptText, ctx) : adapter.encodeUserMessage(text, ctx)
      child.write(encoded)
      cursor = seq
      writeInboxCursor(fs, env, channel, worker, cursor, scope)
    } catch {
      // stdin 关，worker 退出——收尾。
      const t = turnTracker.finish()
      if (t) {
        try {
          append({ kind: 'turn_finished', by: worker, worker, inputSeq: t.inputSeq, turnId: t.turnId, outcome: 'aborted' })
        } catch {
          /* best-effort */
        }
      }
      return
    }
  }
}

/**
 * 缺省 adapter 解析器：只识别 echo/cat（→ EchoAdapter），其他 provider 抛错。
 * 真实 provider（claude/codex）的进程协议由调用方注入自己的 resolveAdapter 实现
 * （SupervisorDeps.resolveAdapter），本模块不内置。
 */
export function echoOnlyAdapters(provider: string): WorkerAdapter {
  if (provider === 'echo' || provider === 'cat') return new EchoAdapter()
  throw new Error(`未知 provider: '${provider}'（内置解析器只支持 echo；其他 provider 需注入自定义 resolveAdapter）`)
}
