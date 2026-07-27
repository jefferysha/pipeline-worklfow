import type { ManagedReleaseJournalRecord } from './installer.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed)
  return Object.keys(value).every((key) => keys.has(key))
}

export function decodeManagedHostSteps(
  value: unknown,
): ManagedReleaseJournalRecord['hostSteps'] | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null
  const ids = new Set<string>()
  const steps: NonNullable<ManagedReleaseJournalRecord['hostSteps']>[number][] = []
  for (const item of value) {
    if (!isRecord(item)
      || !exactKeys(item, [
        'id', 'state', 'before', 'desired', 'replayPolicy', 'observedAfter', 'result',
      ])
      || typeof item.id !== 'string'
      || !/^[a-zA-Z0-9_-]+$/.test(item.id)
      || ids.has(item.id)
      || (item.state !== 'started' && item.state !== 'completed')
      || (item.state === 'started'
        && (item.observedAfter !== undefined || item.result !== undefined))
      || (item.before !== undefined
        && (typeof item.before !== 'string' || item.before === '' || item.before.length > 1_000_000))
      || (item.desired !== undefined
        && (typeof item.desired !== 'string' || item.desired === '' || item.desired.length > 1_000_000))
      || (item.replayPolicy !== undefined
        && item.replayPolicy !== 'observe-before-replay-v1')
      || (item.observedAfter !== undefined
        && (typeof item.observedAfter !== 'string'
          || item.observedAfter === ''
          || item.observedAfter.length > 1_000_000))
      || (item.result !== undefined
        && (typeof item.result !== 'string' || item.result.length > 1_000_000))) return null
    const hasReconciliation = item.before !== undefined
      || item.desired !== undefined
      || item.replayPolicy !== undefined
      || item.observedAfter !== undefined
    if (hasReconciliation
      && (typeof item.before !== 'string'
        || typeof item.desired !== 'string'
        || item.replayPolicy !== 'observe-before-replay-v1'
        || (item.state === 'completed' && typeof item.observedAfter !== 'string'))) return null
    ids.add(item.id)
    steps.push({
      id: item.id,
      state: item.state,
      ...(item.before === undefined ? {} : { before: item.before as string }),
      ...(item.desired === undefined ? {} : { desired: item.desired as string }),
      ...(item.replayPolicy === undefined
        ? {}
        : { replayPolicy: 'observe-before-replay-v1' as const }),
      ...(item.observedAfter === undefined ? {} : { observedAfter: item.observedAfter as string }),
      ...(item.result === undefined ? {} : { result: item.result as string }),
    })
  }
  return steps
}
