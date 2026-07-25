import { matchesInboxPolicy } from './filters.js'
import type { WorkerProcess } from './process.js'
import { ShutdownController } from './supervisor-lifecycle.js'
import { TurnTracker } from './turns.js'
import type { ChannelEvent, EventPartial, InboxPolicy } from './types.js'

export interface ParseResult {
  events: { kind: string; payload?: Record<string, unknown> }[]
  side?: {
    reply?: string[]
    persistSessionId?: string
    persistThreadId?: string
  } | null
}

export interface WorkerAdapter<Ctx = unknown> {
  readonly provider: string
  createCtx(): Ctx
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

export class EchoAdapter implements WorkerAdapter<{ ready: boolean }> {
  readonly provider = 'cat'

  createCtx(): { ready: boolean } {
    return { ready: true }
  }

  buildArgs(): string[] {
    return ['-u']
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
    return { events: [{ kind: 'done', payload: { text: line.trim() } }], side: null }
  }
}

export function applyParseResult(
  worker: string,
  result: ParseResult,
  child: WorkerProcess,
  shutdown: ShutdownController,
  append: (partial: EventPartial) => void,
  persist: (suffix: string, value: string) => void,
  turnTracker?: TurnTracker,
): void {
  for (const event of result.events) {
    const kind = event.kind
    if (kind === 'done' || kind === 'error') shutdown.markTerminalEmitted()
    append({ kind, by: worker, ...(event.payload ?? {}) })
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
  if (!side) return
  if (side.persistSessionId) persist('session-id', side.persistSessionId)
  if (side.persistThreadId) persist('thread-id', side.persistThreadId)
  for (const reply of side.reply ?? []) {
    try {
      child.write(reply)
    } catch {
      // A closed stdin means the supervisor shutdown path already owns completion.
    }
  }
}

export function inboxEventEligible(
  event: ChannelEvent,
  worker: string,
  policy: InboxPolicy,
): boolean {
  if (event.by === worker) return false
  if (event.kind === 'message') return matchesInboxPolicy(event, worker, policy)
  if (event.kind === 'interrupt_requested') return event.worker === worker
  return false
}
