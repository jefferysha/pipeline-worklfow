/**
 * worker-state —— reduceWorkerRegistry 纯函数投影（event-sourcing 核心：事件流 → worker 注册表）。
 * 老仓真相源：skills/pipeline/scripts/channel/worker_state.py（_identify_worker:26 / _new_worker:46
 *   / reduce_worker_registry:58）。
 *
 * 纯函数：只吃 event 数组，不碰 pid 文件 / inbox 游标 / host 时钟 / OS liveness。可在任意机器一致重放。
 *
 * 两正交维度：
 *   · lifecycle: starting/running/done/error/killed/crashed（后 4 个 terminal）
 *   · activity : idle / mid-turn（是否正在跑 turn）
 *
 * 铁律（不可阉割，与老仓一致）：
 *   · canCreate 防幻影：只有能明确指认 worker 的事件能 create 条目（spawned 等）。
 *   · done 非 synthesized = 仅转 idle 不终结（worker 复用命脉）；synthesized=true 才 terminal。
 *   · error: synthesized=true 或 by 以 'supervisor:' 开头 才 terminal。
 *   · killed reason=crash → lifecycle=crashed（区别 killed）。
 *   · pendingMessageCount 只从 durable 事件 + consumedInputSeq 水位数；terminal worker 恒 0。
 *   · 输出按 worker id 排序（确定性）。
 */
import { matchesInboxPolicy } from './filters.js'
import type { ChannelEvent, InboxPolicy, WorkerState } from './types.js'

const SUPERVISOR_PREFIX = 'supervisor:'

/** 内部投影态（含私有 consumedInputSeq 水位，输出前剥离）。 */
interface WorkerAccum extends WorkerState {
  consumedInputSeq: number
}

/** 返回 [worker_id, can_create] 或 undefined（不参与 worker 投影，worker_state.py:26）。 */
function identifyWorker(ev: ChannelEvent): [string, boolean] | undefined {
  const kind = ev.kind
  const by = typeof ev.by === 'string' ? ev.by : ''
  if (kind === 'spawned') {
    const wid = ev.as
    return typeof wid === 'string' && wid ? [wid, true] : undefined
  }
  if (kind === 'turn_started' || kind === 'turn_finished' || kind === 'interrupt_requested' || kind === 'interrupted') {
    const wid = ev.worker
    return typeof wid === 'string' && wid ? [wid, false] : undefined // 只能更新已存在的
  }
  if (kind === 'killed' || kind === 'done' || kind === 'error') {
    const wid = (typeof ev.worker === 'string' && ev.worker) || (typeof ev.as === 'string' && ev.as) || ''
    if (wid) return [wid, true]
    if (by.startsWith(SUPERVISOR_PREFIX)) return [by.slice(SUPERVISOR_PREFIX.length), true]
    return by ? [by, false] : undefined
  }
  return undefined
}

function newWorker(wid: string): WorkerAccum {
  return {
    id: wid,
    lifecycle: 'starting',
    activity: 'idle',
    terminal: false,
    consumedInputSeq: -1,
    inboxPolicy: 'explicitOnly',
    pendingMessageCount: 0,
  }
}

export function reduceWorkerRegistry(events: ChannelEvent[], channel?: string): { workers: WorkerState[] } {
  const workers = new Map<string, WorkerAccum>()

  for (const ev of events) {
    const ident = identifyWorker(ev)
    if (ident === undefined) continue
    const [wid, canCreate] = ident
    if (!workers.has(wid)) {
      if (!canCreate) continue // 防幻影：不能 create 的事件指向不存在 worker → 跳过
      workers.set(wid, newWorker(wid))
    }
    const w = workers.get(wid)!
    const kind = ev.kind
    const by = typeof ev.by === 'string' ? ev.by : ''
    const ts = typeof ev.ts === 'string' ? ev.ts : undefined

    if (kind === 'spawned') {
      w.lifecycle = 'running'
      w.terminal = false
      w.activity = 'idle'
      w.activeTurnId = null
      delete w.exitCode
      delete w.exitSignal
      delete w.reason
      delete w.error
      w.spawnedAt = ts
      w.idleSince = ts
      w.startedBy = by
      w.provider = ev.provider
      w.agent = ev.agent
      w.inboxPolicy = (typeof ev.inboxPolicy === 'string' ? (ev.inboxPolicy as InboxPolicy) : undefined) ?? 'explicitOnly'
    } else if (kind === 'turn_started') {
      w.activity = 'mid-turn'
      w.activeTurnId = typeof ev.turnId === 'string' ? ev.turnId : null
      w.activeTurnStartedAt = ts
      delete w.idleSince
      const iseq = ev.inputSeq
      if (typeof iseq === 'number' && Number.isInteger(iseq)) {
        w.consumedInputSeq = Math.max(w.consumedInputSeq, iseq)
      }
    } else if (kind === 'turn_finished' || kind === 'interrupted') {
      w.activity = 'idle'
      w.activeTurnId = null
      w.idleSince = ts
    } else if (kind === 'interrupt_requested') {
      // 纯 durable intent，不改 lifecycle/activity
    } else if (kind === 'done') {
      w.activeTurnId = null
      if (ev.synthesized === true) {
        w.terminal = true
        w.lifecycle = 'done'
        w.exitCode = ev.exit_code
        delete w.idleSince
      } else {
        w.idleSince = ts // 仅转 idle 不终结（复用命脉）
        w.activity = 'idle'
      }
    } else if (kind === 'error') {
      w.error = ev.message
      const isSup = by.startsWith(SUPERVISOR_PREFIX)
      if (ev.synthesized === true || isSup) {
        w.terminal = true
        w.lifecycle = 'error'
        w.exitCode = ev.exit_code
        w.exitSignal = ev.exit_signal
        delete w.idleSince
      } else {
        w.idleSince = ts
        w.activity = 'idle'
      }
    } else if (kind === 'killed') {
      w.lifecycle = ev.reason === 'crash' ? 'crashed' : 'killed'
      w.terminal = true
      w.activity = 'idle'
      w.activeTurnId = null
      delete w.idleSince
      w.reason = ev.reason
      w.signal = ev.signal
    }

    w.updatedAt = ts
    w.lastSeq = typeof ev.seq === 'number' ? ev.seq : w.lastSeq
  }

  // 第二遍：pendingMessageCount（非 terminal 才数；terminal 恒 0，worker_state.py:138）
  for (const w of workers.values()) {
    if (w.terminal) {
      w.pendingMessageCount = 0
      continue
    }
    let cnt = 0
    for (const ev of events) {
      const seq = ev.seq
      if (typeof seq !== 'number' || seq <= w.consumedInputSeq) continue
      if (matchesInboxPolicy(ev, w.id, w.inboxPolicy)) cnt += 1
    }
    w.pendingMessageCount = cnt
  }

  // 输出：丢内部 consumedInputSeq，按 id 排序（确定性）
  const out: WorkerState[] = []
  for (const wid of [...workers.keys()].sort()) {
    const { consumedInputSeq: _drop, ...rest } = workers.get(wid)!
    const w: WorkerState = { ...rest }
    if (channel) w.channel = channel
    out.push(w)
  }
  return { workers: out }
}
