/**
 * events —— 21 kind 事件 schema + parseKind + 幂等扫描 + jsonl 解析（纯逻辑）。
 * 老仓真相源：skills/pipeline/scripts/channel/events.py（CHANNEL_EVENT_KINDS:27 / parse_channel_kind:42
 *   / _validate_event_base:133 / _find_idempotent_event:146 / read_events:205）。
 *
 * 铁律（不可阉割，与老仓一致）：
 *   · CHANNEL_EVENT_KINDS 是运行时校验 SOT（21 个），parseKind 命中白名单否则抛错并 join 完整白名单。
 *   · idempotencyKey 若提供不能空白；同 key 同 kind → 返回旧事件不追加；同 key 不同 kind → 抛错（不静默）。
 *   · origin ∈ {cli,api,worker}；meta 必须 plain object。
 *   · seq 分配 + 锁 + append 落盘在 store.ts（fs 面）；本文件只做纯 schema/解析。
 */
import type { ChannelEvent, ChannelOrigin, EventPartial } from './types.js'

// —— 21 种事件 kind（冻结白名单 = 运行时校验 SOT，events.py:27）——
export const CHANNEL_EVENT_KINDS = [
  // 会话/结构类
  'create', 'join', 'leave', 'message', 'thread', 'context', 'channel',
  // worker 生命周期类
  'spawned', 'killed', 'respawned', 'progress', 'done', 'error', 'waiting', 'awake',
  // 投递/中断/turn 类
  'undeliverable', 'interrupt_requested', 'turn_started', 'turn_finished',
  'interrupted', 'supervisor_warning',
] as const

export type ChannelEventKind = (typeof CHANNEL_EVENT_KINDS)[number]

const KIND_SET: ReadonlySet<string> = new Set(CHANNEL_EVENT_KINDS)

export const VALID_ORIGINS: readonly ChannelOrigin[] = ['cli', 'api', 'worker']
const ORIGIN_SET: ReadonlySet<string> = new Set(VALID_ORIGINS)

/** undefined/null 透传；不在白名单 → 抛错（消息含完整白名单）；命中返回（events.py:42）。 */
export function parseChannelKind(v: string | undefined | null): string | undefined {
  if (v === undefined || v === null) return undefined
  if (!KIND_SET.has(v)) {
    throw new Error(`未知 channel event kind: '${v}'。合法 kind: ${CHANNEL_EVENT_KINDS.join(', ')}`)
  }
  return v
}

/** CSV → split/trim/去空 → 逐个 parse → 去重保序；空则 undefined（events.py:53）。 */
export function parseChannelKinds(v: string | undefined | null): string[] | undefined {
  if (v === undefined || v === null) return undefined
  const parts = String(v)
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    parseChannelKind(p) // 单值错误消息是唯一 SOT
    if (!seen.has(p)) {
      seen.add(p)
      out.push(p)
    }
  }
  return out.length > 0 ? out : undefined
}

/** 通用事件基字段校验（events.py:133）。抛错即 fail-loud。 */
export function validateEventBase(partial: Partial<EventPartial>): void {
  const idem = partial.idempotencyKey
  if (idem !== undefined && idem !== null) {
    if (typeof idem !== 'string' || idem.trim() === '') {
      throw new Error('idempotencyKey 若提供不能是空白串')
    }
  }
  const origin = partial.origin
  if (origin !== undefined && origin !== null && !ORIGIN_SET.has(origin)) {
    throw new Error(`非法 origin: '${origin}'（合法: ${[...VALID_ORIGINS].sort().join(', ')}）`)
  }
  const meta = partial.meta
  if (meta !== undefined && meta !== null && (typeof meta !== 'object' || Array.isArray(meta))) {
    throw new Error('meta 必须是 plain object（dict）')
  }
}

/** 解析 events.jsonl 全文 → 事件数组（坏行/空行跳过，events.py:205 read_events）。 */
export function parseEventsText(text: string | undefined): ChannelEvent[] {
  const out: ChannelEvent[] = []
  if (!text) return out
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s) continue
    let obj: unknown
    try {
      obj = JSON.parse(s)
    } catch {
      continue
    }
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      out.push(obj as ChannelEvent)
    }
  }
  return out
}

/**
 * 全量扫 jsonl 找同 key 事件：同 kind 返回旧事件；不同 kind 抛错；无则 undefined（events.py:146）。
 * 输入是 events.jsonl 全文（store 在锁内读一次传入）。
 */
export function findIdempotentEvent(
  text: string | undefined,
  key: string,
  kind: string,
): ChannelEvent | undefined {
  if (!text) return undefined
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s) continue
    let obj: unknown
    try {
      obj = JSON.parse(s)
    } catch {
      continue
    }
    if (obj !== null && typeof obj === 'object' && (obj as ChannelEvent).idempotencyKey === key) {
      const existing = obj as ChannelEvent
      if (existing.kind === kind) return existing
      throw new Error(
        `idempotencyKey '${key}' 已被 kind='${existing.kind}' 用过，不能再给 kind='${kind}'`,
      )
    }
  }
  return undefined
}
