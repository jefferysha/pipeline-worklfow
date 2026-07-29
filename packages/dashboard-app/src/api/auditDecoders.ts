import type {
  SessionLink,
  WbAttemptContext,
  WbLedgerRecord,
  WbRunDetail,
  WbRunIdentity,
  WbRunRevision,
  WbTransitionRecord,
} from './auditTypes'
import { isRecord, nullableString, optionalString, stringArray } from './transport'

export { decodeTraceRecords, decodeTraceSessions, decodeTraceTimeline } from './traceDecoders'

function decodeRunIdentity(value: unknown): WbRunIdentity | null {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.workflow_id !== 'string'
    || typeof value.current_step !== 'string'
    || (value.lifecycle !== 'active' && value.lifecycle !== 'archived')
    || typeof value.transition_sequence !== 'number'
    || !optionalString(value.transition_head)
    || typeof value.created_at !== 'string'
    || typeof value.updated_at !== 'string'
    || !optionalString(value.policy_id)
    || !optionalString(value.policy_version)
    || !optionalString(value.loop_id)
    || !optionalString(value.iteration_id)
    || (value.automation_policy !== undefined && !isRecord(value.automation_policy))) return null
  return {
    id: value.id,
    workflow_id: value.workflow_id,
    current_step: value.current_step,
    lifecycle: value.lifecycle,
    transition_sequence: value.transition_sequence,
    ...(value.transition_head === undefined ? {} : { transition_head: value.transition_head }),
    created_at: value.created_at,
    updated_at: value.updated_at,
    ...(value.policy_id === undefined ? {} : { policy_id: value.policy_id }),
    ...(value.policy_version === undefined ? {} : { policy_version: value.policy_version }),
    ...(value.loop_id === undefined ? {} : { loop_id: value.loop_id }),
    ...(value.iteration_id === undefined ? {} : { iteration_id: value.iteration_id }),
    ...(value.automation_policy === undefined ? {} : { automation_policy: value.automation_policy }),
  }
}

function decodeRevision(value: unknown): WbRunRevision | null {
  if (!isRecord(value)
    || typeof value.revision !== 'number'
    || typeof value.revisionId !== 'string'
    || !optionalString(value.previousRevisionId)
    || typeof value.stateDigest !== 'string'
    || !isRecord(value.mutation)
    || typeof value.mutation.kind !== 'string'
    || !optionalString(value.mutation.observedAt)
    || !optionalString(value.mutation.transitionRecordId)) return null
  return {
    ...value,
    revision: value.revision,
    revisionId: value.revisionId,
    ...(value.previousRevisionId === undefined ? {} : { previousRevisionId: value.previousRevisionId }),
    stateDigest: value.stateDigest,
    mutation: {
      kind: value.mutation.kind,
      ...(value.mutation.observedAt === undefined ? {} : { observedAt: value.mutation.observedAt }),
      ...(value.mutation.transitionRecordId === undefined
        ? {}
        : { transitionRecordId: value.mutation.transitionRecordId }),
    },
  }
}

function decodeTransition(value: unknown): WbTransitionRecord | null {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.runId !== 'string'
    || typeof value.sequence !== 'number'
    || typeof value.event !== 'string'
    || typeof value.from !== 'string'
    || typeof value.to !== 'string'
    || typeof value.observedAt !== 'string'
    || !Array.isArray(value.effects)) return null
  return {
    ...value,
    id: value.id,
    runId: value.runId,
    sequence: value.sequence,
    event: value.event,
    from: value.from,
    to: value.to,
    observedAt: value.observedAt,
    effects: value.effects,
  }
}

function decodeAttempt(value: unknown): WbAttemptContext | null {
  if (!isRecord(value)
    || typeof value.record_id !== 'string'
    || typeof value.recorded_at !== 'string'
    || typeof value.reservation_id !== 'string'
    || typeof value.attempt_id !== 'string'
    || !optionalString(value.iteration_id)
    || typeof value.loop_id !== 'string'
    || !stringArray(value.source_run_record_ids)
    || !stringArray(value.omitted_attempt_ids)
    || typeof value.rendered !== 'string'
    || !isRecord(value.stagnation)
    || typeof value.stagnation.stagnant !== 'boolean'
    || !optionalString(value.stagnation.fingerprint)
    || !stringArray(value.stagnation.repeated_attempt_ids)) return null
  return {
    record_id: value.record_id,
    recorded_at: value.recorded_at,
    reservation_id: value.reservation_id,
    attempt_id: value.attempt_id,
    ...(value.iteration_id === undefined ? {} : { iteration_id: value.iteration_id }),
    loop_id: value.loop_id,
    source_run_record_ids: value.source_run_record_ids,
    omitted_attempt_ids: value.omitted_attempt_ids,
    rendered: value.rendered,
    stagnation: {
      stagnant: value.stagnation.stagnant,
      ...(value.stagnation.fingerprint === undefined ? {} : { fingerprint: value.stagnation.fingerprint }),
      repeated_attempt_ids: value.stagnation.repeated_attempt_ids,
    },
  }
}

function decodeLedgerRecord(value: unknown): WbLedgerRecord | null {
  if (!isRecord(value)
    || typeof value.kind !== 'string'
    || typeof value.record_id !== 'string'
    || typeof value.recorded_at !== 'string') return null
  return { ...value, kind: value.kind, record_id: value.record_id, recorded_at: value.recorded_at }
}

export function decodeRunDetail(value: unknown): WbRunDetail | null {
  if (!isRecord(value)
    || value.ok !== true
    || typeof value.root !== 'string'
    || typeof value.change !== 'string'
    || (value.source !== 'canonical' && value.source !== 'legacy')
    || !isRecord(value.projection)
    || typeof value.projection.status !== 'string'
    || !Array.isArray(value.revisions)
    || !Array.isArray(value.transitions)
    || !Array.isArray(value.attempt_contexts)
    || !isRecord(value.ledger)
    || (value.ledger.health !== 'ok' && value.ledger.health !== 'degraded' && value.ledger.health !== 'missing')
    || !Array.isArray(value.ledger.records)
    || !Array.isArray(value.ledger.rejected)) return null
  const workflowRun = value.workflow_run === null ? null : decodeRunIdentity(value.workflow_run)
  const currentRevision = value.current_revision === null ? null : decodeRevision(value.current_revision)
  if (value.workflow_run !== null && !workflowRun) return null
  if (value.current_revision !== null && !currentRevision) return null
  const revisions = value.revisions.map(decodeRevision)
  const transitions = value.transitions.map(decodeTransition)
  const attempts = value.attempt_contexts.map(decodeAttempt)
  const records = value.ledger.records.map(decodeLedgerRecord)
  if (revisions.some((item) => item === null)
    || transitions.some((item) => item === null)
    || attempts.some((item) => item === null)
    || records.some((item) => item === null)) return null
  const rejected: WbRunDetail['ledger']['rejected'] = []
  for (const item of value.ledger.rejected) {
    if (!isRecord(item)
      || typeof item.line !== 'number'
      || typeof item.raw_hash !== 'string'
      || typeof item.error !== 'string') return null
    rejected.push({ line: item.line, raw_hash: item.raw_hash, error: item.error })
  }
  return {
    ok: true,
    root: value.root,
    change: value.change,
    source: value.source,
    projection: { ...value.projection, status: value.projection.status },
    workflow_run: workflowRun,
    current_revision: currentRevision,
    revisions: revisions.filter(isPresent),
    transitions: transitions.filter(isPresent),
    attempt_contexts: attempts.filter(isPresent),
    ledger: { health: value.ledger.health, rejected, records: records.filter(isPresent) },
  }
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

export function decodeSessionLink(value: unknown): SessionLink | null {
  if (!isRecord(value)
    || typeof value.found !== 'boolean'
    || !optionalString(value.platform)
    || !optionalString(value.sessionId)
    || !optionalString(value.dir)
    || (value.resumeCmd !== undefined && !nullableString(value.resumeCmd))
    || !optionalString(value.mtime)
    || !optionalString(value.reason)) return null
  return {
    found: value.found,
    ...(value.platform === undefined ? {} : { platform: value.platform }),
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
    ...(value.dir === undefined ? {} : { dir: value.dir }),
    ...(value.resumeCmd === undefined ? {} : { resumeCmd: value.resumeCmd }),
    ...(value.mtime === undefined ? {} : { mtime: value.mtime }),
    ...(value.reason === undefined ? {} : { reason: value.reason }),
  }
}

export function decodeSessionLinks(value: unknown): Record<string, SessionLink> | null {
  if (!isRecord(value) || !isRecord(value.links)) return null
  const links: Record<string, SessionLink> = {}
  for (const [key, item] of Object.entries(value.links)) {
    const decoded = decodeSessionLink(item)
    if (!decoded) return null
    links[key] = decoded
  }
  return links
}
