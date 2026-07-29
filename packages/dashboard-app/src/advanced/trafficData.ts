export {
  fetchTraceSessions,
  fetchTraceTimeline,
  type TraceSessionRow,
  type TraceSessionsResponse,
  type TraceTimelineEntry,
  type TraceTimelineOutcome,
  type TraceTimelineResponse,
} from '../api/client'

import type { TraceTimelineEntry, TraceTimelineOutcome } from '../api/client'

export type TraceTimelineFilter = 'all' | Extract<TraceTimelineOutcome, 'success' | 'error'>

export function filterTimelineEntries(
  entries: TraceTimelineEntry[],
  filter: TraceTimelineFilter,
): TraceTimelineEntry[] {
  if (filter === 'all') return entries
  return entries.filter((entry) => entry.outcome === filter)
}

export function actualTokenTotal(
  entry: Pick<TraceTimelineEntry, 'input_tokens' | 'output_tokens'>,
): number | null {
  const { input_tokens: input, output_tokens: output } = entry
  if (input === null || output === null) return null
  return Math.min(Number.MAX_SAFE_INTEGER, input + output)
}
