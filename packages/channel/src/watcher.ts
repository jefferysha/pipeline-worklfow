/**
 * watcher —— watchEvents 增量 tailer（进程层 live-tail，BACKLOG #27b / GOAL A4 M4）。
 * 老仓真相源：skills/pipeline/scripts/channel/watch.py（read_new_events:28 / initial_offset:72
 *   / watch_events:82 生成器）。对齐 MEMORY「abtop 滚动尾部重建」：增量读 + 截断归零 + carry
 *   跨 chunk + 200ms 兜底轮询。无 inotify 也能跑（纯 stat 轮询保底）。
 *
 * 铁律（不可阉割，逐条对齐 watch.py）：
 *   · carry 跨 chunk：高频追加一定读到半行，没 carry 就丢事件——最后一段挂起到下次（read_new_events:56）。
 *   · 截断检测：size < byteOffset（文件被截断/轮转）→ 归零重读（read_new_events:39）。
 *   · 三起始模式：fromStart→0；sinceSeq→0（读全但 yield 时按 seq 过滤）；都没→当前文件 size（只看新）。
 *   · 200ms 兜底：fs.watch 在 NFS/容器不可靠，纯轮询保底（watch_events:114）。
 *   · 坏行/空行跳过（read_new_events:59）。
 *
 * 纯逻辑 + 注入 TailFs（byte 级 size/readSlice）+ 注入 sleep/abort（tailEvents 的 live 循环）。
 * 零第三方依赖。
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { parseEventsText } from './events.js'
import type { ChannelEvent } from './types.js'

/** 读游标：byteOffset + carry（半行残留）。 */
export interface TailState {
  byteOffset: number
  carry: string
}

/** byte 级增量读注入面（size + readSlice）。缺省 nodeTailFs（真 fd 读）。 */
export interface TailFs {
  /** 文件字节大小（缺失/不可读 → undefined）。 */
  size(path: string): number | undefined
  /** 读 [start, start+length) 字节为 utf8（不可读 → undefined）。 */
  readSlice(path: string, start: number, length: number): string | undefined
}

/** 真 node fd tailer 面（缺省）。 */
export function nodeTailFs(): TailFs {
  return {
    size: (p) => {
      try {
        return statSync(p).size
      } catch {
        return undefined
      }
    },
    readSlice: (p, start, length) => {
      if (length <= 0) return ''
      let fd: number | undefined
      try {
        fd = openSync(p, 'r')
        const buf = Buffer.allocUnsafe(length)
        const n = readSync(fd, buf, 0, length, start)
        return buf.toString('utf8', 0, n)
      } catch {
        return undefined
      } finally {
        if (fd !== undefined) {
          try {
            closeSync(fd)
          } catch {
            /* best-effort */
          }
        }
      }
    },
  }
}

export interface StartMode {
  fromStart?: boolean
  sinceSeq?: number
}

/** 三起始模式 → 初始 byteOffset（watch.py:72）。 */
export function initialOffset(fs: TailFs, path: string, mode: StartMode): number {
  if (mode.fromStart || mode.sinceSeq !== undefined) return 0
  return fs.size(path) ?? 0
}

/**
 * 增量读新字节 → 解析新事件（坏行跳过、半行留 carry、截断归零）。mutates state（watch.py:28）。
 */
export function readNewEvents(fs: TailFs, path: string, state: TailState): ChannelEvent[] {
  const size = fs.size(path)
  if (size === undefined) {
    // 文件没了 → 归零返回空
    state.byteOffset = 0
    state.carry = ''
    return []
  }
  // 截断/轮转：size < offset → 归零重读
  if (size < state.byteOffset) {
    state.byteOffset = 0
    state.carry = ''
  }
  if (size <= state.byteOffset) return []

  const chunk = fs.readSlice(path, state.byteOffset, size - state.byteOffset)
  if (chunk === undefined) return []
  state.byteOffset = size

  const text = state.carry + chunk
  const lines = text.split('\n')
  state.carry = lines.pop() ?? '' // 末段可能是半行 → 留到下次
  // parseEventsText 复用 events.py:read_events 的坏行/空行跳过语义。
  return parseEventsText(lines.join('\n'))
}

export interface TailOptions extends StartMode {
  /** 轮询间隔 ms（缺省 200，watch.py poll_ms）。 */
  pollMs?: number
  /** 达到即停（缺省无限）。 */
  maxEvents?: number
  /** 总超时 ms（缺省无限，靠外部/abort 停）。 */
  timeoutMs?: number
  /** 事件过滤（缺省全过）。 */
  filter?: (ev: ChannelEvent) => boolean
  /** 中止信号（返回 true 即停，供 supervisor abort）。 */
  aborted?: () => boolean
  /** 注入睡眠（缺省真 setTimeout）；测试注入可控 sleep。 */
  sleep?: (ms: number) => Promise<void>
  /** 注入 now（缺省 Date.now）。 */
  now?: () => number
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    if (typeof t.unref === 'function') t.unref() // 对应 daemon timer，不吊住进程
  })
}

/**
 * 生成器：yield 匹配的新事件。200ms 轮询兜底（纯 stat，无 inotify 依赖，watch.py:82）。
 * abort/timeout/maxEvents 任一命中即结束；sinceSeq 边界过滤（seq<=sinceSeq 跳过）。
 */
export async function* tailEvents(
  fs: TailFs,
  path: string,
  opts: TailOptions = {},
): AsyncGenerator<ChannelEvent> {
  const pollMs = opts.pollMs ?? 200
  const sleep = opts.sleep ?? defaultSleep
  const now = opts.now ?? Date.now
  const state: TailState = {
    byteOffset: initialOffset(fs, path, opts),
    carry: '',
  }
  let yielded = 0
  const started = now()
  for (;;) {
    if (opts.aborted?.()) return
    for (const ev of readNewEvents(fs, path, state)) {
      if (opts.sinceSeq !== undefined) {
        const seq = ev.seq
        if (typeof seq === 'number' && seq <= opts.sinceSeq) continue
      }
      if (opts.filter !== undefined && !opts.filter(ev)) continue
      yield ev
      yielded += 1
      if (opts.maxEvents !== undefined && yielded >= opts.maxEvents) return
    }
    if (opts.timeoutMs !== undefined && now() - started >= opts.timeoutMs) return
    if (opts.aborted?.()) return
    await sleep(pollMs)
  }
}
