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
import type { ChannelEvent, EventPartial, InboxPolicy, Scope } from './types.js'
import {
  defaultSupervisorScheduler,
  IdleTimer,
  ShutdownController,
  type Scheduler,
} from './supervisor-lifecycle.js'
import {
  applyParseResult,
  EchoAdapter,
  inboxEventEligible,
  type AdapterView,
  type ParseResult,
  type WorkerAdapter,
} from './supervisor-adapter.js'

export {
  IdleTimer,
  ShutdownController,
  type Scheduler,
  type ShutdownDeps,
} from './supervisor-lifecycle.js'
export {
  applyParseResult,
  EchoAdapter,
  inboxEventEligible,
  type AdapterView,
  type ParseResult,
  type WorkerAdapter,
} from './supervisor-adapter.js'

export type ShutdownReason = 'explicit-kill' | 'timeout' | 'crash' | 'idle-timeout'
export const SHUTDOWN_REASONS: readonly ShutdownReason[] = ['explicit-kill', 'timeout', 'crash', 'idle-timeout']

const DEFAULT_INBOX_POLICY: InboxPolicy = 'explicitOnly'

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
  const schedule = deps.schedule ?? defaultSupervisorScheduler
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
    () => idleTimer?.pause(),
    () => idleTimer?.reset(),
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
  throw new Error(`未知 provider: '${provider}'（内置解析器只支持 echo/cat；其他 provider 需注入自定义 resolveAdapter）`)
}
