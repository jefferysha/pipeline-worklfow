/**
 * Terminal activity projection — a deliberately non-canonical, short-lived observability signal.
 *
 * Workflow state remains exclusively in the canonical run store.  A native host hook writes this
 * tiny sidecar only after a session has been explicitly bound to a Change; the dashboard may use
 * it to distinguish an actually executing terminal conversation from an idle Change, but no
 * guard, transition, or document rule is allowed to consume it.
 */

/** Per-Change sidecar written by the host hook. */
export const TERMINAL_ACTIVITY_FILE = '.pipeline-terminal-activity.json'

/** Project-relative directory containing session-to-Change bindings created by `session activate`. */
export const TERMINAL_SESSION_BINDINGS_DIR = '.pipeline/terminal-sessions'

export const TERMINAL_ACTIVITY_PROTOCOL = 'pipeline-terminal-activity-v1'
export const TERMINAL_SESSION_PROTOCOL = 'pipeline-terminal-session-v1'

/** A hook heartbeat is intentionally short-lived: a stopped host must disappear from "running" promptly. */
export const TERMINAL_ACTIVITY_TTL_MS = 120_000

const CHANGE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export interface TerminalActivityRecord {
  protocol: typeof TERMINAL_ACTIVITY_PROTOCOL
  change: string
  sessionId: string
  heartbeatAt: string
  turnId?: string
}

export interface LiveTerminalActivity {
  sessionId: string
  heartbeatAt: string
  expiresAt: string
  turnId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** The session id is also used as a filename, so retain a deliberately portable grammar. */
export function isTerminalSessionId(value: string): boolean {
  return SESSION_ID.test(value)
}

/** Keep Change identity validation aligned with the hook's path-safety boundary. */
export function isTerminalActivityChangeName(value: string): boolean {
  return CHANGE_NAME.test(value)
}

/**
 * Parse only the hook-owned schema.  A malformed/local sidecar is not an error for the dashboard:
 * it simply carries no liveness claim.
 */
export function parseTerminalActivityRecord(value: unknown): TerminalActivityRecord | null {
  if (!isRecord(value) || value.protocol !== TERMINAL_ACTIVITY_PROTOCOL) return null
  const change = asNonEmptyString(value.change)
  const sessionId = asNonEmptyString(value.session_id)
  const heartbeatAt = asNonEmptyString(value.heartbeat_at)
  if (change === null || sessionId === null || heartbeatAt === null) return null
  if (!isTerminalActivityChangeName(change) || !isTerminalSessionId(sessionId)) return null
  if (!Number.isFinite(Date.parse(heartbeatAt))) return null

  const turn = value.turn_id
  if (turn !== undefined && (typeof turn !== 'string' || turn === '')) return null
  return {
    protocol: TERMINAL_ACTIVITY_PROTOCOL,
    change,
    sessionId,
    heartbeatAt,
    ...(typeof turn === 'string' ? { turnId: turn } : {}),
  }
}

/**
 * A heartbeat from the far future is ignored as well as stale ones.  The small skew allowance
 * avoids flicker if the host and dashboard clocks differ by a few seconds, without allowing a
 * manually written sidecar to pin a task in the running state indefinitely.
 */
export function liveTerminalActivity(record: TerminalActivityRecord, nowMs: number): LiveTerminalActivity | null {
  const heartbeatMs = Date.parse(record.heartbeatAt)
  if (!Number.isFinite(heartbeatMs) || heartbeatMs > nowMs + 30_000) return null
  if (nowMs - heartbeatMs >= TERMINAL_ACTIVITY_TTL_MS) return null
  return {
    sessionId: record.sessionId,
    heartbeatAt: record.heartbeatAt,
    expiresAt: new Date(heartbeatMs + TERMINAL_ACTIVITY_TTL_MS).toISOString(),
    ...(record.turnId === undefined ? {} : { turnId: record.turnId }),
  }
}
