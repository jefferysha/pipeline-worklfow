/**
 * store —— 事件日志 I/O 编排（append-only JSONL + .seq 侧车 + 从事件重建）。绑 fs + env。
 * 老仓真相源：skills/pipeline/scripts/channel/{events.py append_event:171 / read_events:205,
 *   seq.py reconcile_seq:118 / write_sidecar:111} + channel-state.sh cmd_list:915。
 *
 * ★正交红线：channel 事件全落在 <root>/<bucket>/<channel>/（与 openspec/changes/*.pipeline.yaml
 *   完全隔离）。store 绝不读写 .pipeline.yaml / 三门 marker / build_sha / git——barrier 由主线独占。
 *
 * append 临界区（withChannelLock 覆盖，events.py:188）：
 *   读幂等 → reconcile seq（jsonl 尾为真相）→ 写 jsonl 行（seq=last+1, ts 注入）→ 原子写 .seq 侧车。
 */
import { findIdempotentEvent, parseChannelKind, parseEventsText, validateEventBase } from './events.js'
import { nodeChannelFs, withChannelLock, type ChannelFs } from './fs.js'
import {
  bucketDir,
  channelDir as pathsChannelDir,
  eventsPath,
  lockPath,
  seqPath,
  type ChannelEnv,
} from './paths.js'
import { nextSeq, parseSidecar, readLastJsonlSeqFromText } from './seq.js'
import { reduceWorkerRegistry } from './worker-state.js'
import type { ChannelEvent, EventPartial, Scope, WorkerState } from './types.js'

export type Clock = () => string

/** 缺省时钟：ISO8601 秒级 UTC（对齐老仓 time.strftime("%Y-%m-%dT%H:%M:%SZ")）。 */
function defaultClock(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export interface ListOptions {
  scope?: Scope
  /** 显示 ephemeral（缺省隐藏，channel-state.sh cmd_list:959）。 */
  all?: boolean
  /** 跨桶聚合（root 下每子目录一个 project 桶，含 _global）。 */
  allProjects?: boolean
}

export interface ChannelListRow {
  name: string
  project: string
  task: unknown
  type: string
  createdAt: unknown
  lastEventTs: unknown
  lastKind: unknown
  events: number
  ephemeral: boolean
  workersTotal: number
  workersAlive: number
}

export interface ChannelStore {
  /** 追加一个事件（整段在锁内）。返回最终事件（含内部分配的 seq）。 */
  append(name: string, partial: EventPartial, scope?: Scope): ChannelEvent
  /** 读全部事件（坏行跳过）。 */
  read(name: string, scope?: Scope): ChannelEvent[]
  /** 以 jsonl 尾为真相对齐侧车，返回 last seq。 */
  reconcile(name: string, scope?: Scope): number
  /** 某 channel 目录绝对路径（不创建）。 */
  channelDir(name: string, scope?: Scope): string
  /** mkdir -p 桶+channel 目录，返回目录。 */
  ensureDir(name: string, scope?: Scope): string
  /** reduceWorkerRegistry 投影（含 channel 字段）。 */
  registry(name: string, scope?: Scope): { workers: WorkerState[] }
  /** 桶内 channel 汇总（channel-state.sh cmd_list）。 */
  list(opts?: ListOptions): ChannelListRow[]
}

export function createChannelStore(env: ChannelEnv, fs: ChannelFs = nodeChannelFs(), clock: Clock = defaultClock): ChannelStore {
  const ensureDir = (name: string, scope: Scope): string => {
    const dir = pathsChannelDir(env, name, scope)
    fs.mkdirp(dir)
    return dir
  }

  const read = (name: string, scope: Scope): ChannelEvent[] => {
    return parseEventsText(fs.readText(eventsPath(env, name, scope)))
  }

  const reconcile = (name: string, scope: Scope): number => {
    const evText = fs.readText(eventsPath(env, name, scope)) ?? ''
    const last = readLastJsonlSeqFromText(evText)
    const sidecarPath = seqPath(env, name, scope)
    const sidecarText = fs.readText(sidecarPath)
    const sidecar = sidecarText === undefined ? undefined : parseSidecar(sidecarText)
    if (sidecar !== last) writeSidecar(fs, sidecarPath, last)
    return last
  }

  const append = (name: string, partial: EventPartial, scope: Scope): ChannelEvent => {
    const kind = parseChannelKind(partial.kind)
    if (kind === undefined) throw new Error('append 缺 kind')
    if (!partial.by) throw new Error('append 缺 by')
    validateEventBase(partial)

    const dir = ensureDir(name, scope)
    const evFile = eventsPath(env, name, scope)
    const sidecarFile = seqPath(env, name, scope)
    const lock = lockPath(env, name, scope)

    return withChannelLock(fs, lock, () => {
      const evText = fs.readText(evFile) ?? ''
      const idem = partial.idempotencyKey
      if (idem) {
        const existing = findIdempotentEvent(evText, idem, kind)
        if (existing !== undefined) return existing // 幂等命中，不追加
      }
      const last = readLastJsonlSeqFromText(evText)
      const event: ChannelEvent = { ...partial } as ChannelEvent
      event.seq = nextSeq(last) // ★覆盖调用方写的 seq
      event.ts = typeof partial.ts === 'string' && partial.ts ? partial.ts : clock()
      fs.appendText(evFile, JSON.stringify(event) + '\n')
      writeSidecar(fs, sidecarFile, event.seq)
      // dir 已在临界区外 ensure；引用消除 lint 未用告警
      void dir
      return event
    })
  }

  const registry = (name: string, scope: Scope): { workers: WorkerState[] } => {
    return reduceWorkerRegistry(read(name, scope), name)
  }

  const list = (opts: ListOptions): ChannelListRow[] => {
    const scope: Scope = opts.scope ?? 'project'
    const showAll = opts.all === true
    const buckets: string[] = []
    if (opts.allProjects) {
      for (const e of fs.listDir(env.root)) {
        if (e.isDirectory) buckets.push(e.name)
      }
      buckets.sort()
    } else {
      // 单桶：解析 bucket 名 = bucketDir 的末段
      const bdir = bucketDir(env, scope)
      buckets.push(bdir.slice(env.root.length + 1))
    }

    const rows: ChannelListRow[] = []
    for (const bucketName of buckets) {
      const bdir = `${env.root}/${bucketName}`
      for (const e of fs.listDir(bdir)) {
        if (!e.isDirectory || e.name.startsWith('.')) continue
        const chanScope: Scope = bucketName === '_global' ? 'global' : scope
        const evs =
          bucketName === '_global' || !opts.allProjects
            ? read(e.name, chanScope)
            : readInDir(fs, `${bdir}/${e.name}`)
        const first = evs[0] ?? ({} as ChannelEvent)
        const last = evs[evs.length - 1] ?? ({} as ChannelEvent)
        const ephemeral = Boolean(first.ephemeral)
        if (ephemeral && !showAll) continue
        let workersTotal = 0
        let workersAlive = 0
        for (const f of fs.listDir(`${bdir}/${e.name}`)) {
          if (!f.isFile || !f.name.endsWith('.pid')) continue
          workersTotal += 1
          const pidText = fs.readText(`${bdir}/${e.name}/${f.name}`)
          const pid = pidText === undefined ? NaN : Number.parseInt(pidText.trim(), 10)
          if (Number.isInteger(pid) && fs.pidAlive(pid)) workersAlive += 1
        }
        rows.push({
          name: e.name,
          project: bucketName,
          task: first.task,
          type: (typeof first.type === 'string' && first.type) || 'chat',
          createdAt: first.ts,
          lastEventTs: last.ts,
          lastKind: last.kind,
          events: evs.length,
          ephemeral,
          workersTotal,
          workersAlive,
        })
      }
    }
    rows.sort((a, b) => {
      const av = typeof a.lastEventTs === 'string' ? a.lastEventTs : ''
      const bv = typeof b.lastEventTs === 'string' ? b.lastEventTs : ''
      return av < bv ? 1 : av > bv ? -1 : 0
    })
    return rows
  }

  return {
    append: (name, partial, scope = 'project') => append(name, partial, scope),
    read: (name, scope = 'project') => read(name, scope),
    reconcile: (name, scope = 'project') => reconcile(name, scope),
    channelDir: (name, scope = 'project') => pathsChannelDir(env, name, scope),
    ensureDir: (name, scope = 'project') => ensureDir(name, scope),
    registry: (name, scope = 'project') => registry(name, scope),
    list: (o = {}) => list(o),
  }
}

/** 直接读某 channel 目录的 events.jsonl（allProjects 跨桶时不经 env bucket 解析）。 */
function readInDir(fs: ChannelFs, chanDir: string): ChannelEvent[] {
  return parseEventsText(fs.readText(`${chanDir}/events.jsonl`))
}

/** tmp+rename 原子写侧车（同目录 rename 原子，读者永远看到完整值，seq.py:111）。 */
function writeSidecar(fs: ChannelFs, path: string, seq: number): void {
  const tmp = `${path}.tmp.${fs.pid}.${Date.now()}`
  fs.writeText(tmp, String(seq))
  fs.rename(tmp, path)
}
