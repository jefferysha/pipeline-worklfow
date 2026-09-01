/**
 * Crash-safe persistence adapter for the canonical orchestration aggregate.
 *
 * The ledger deliberately contains no workflow state rules.  `decideV2` and
 * `evolveV2` remain the only mutation authority; this module owns the durable
 * protocol (CAS, idempotency, immutable records, and recovery diagnostics).
 */
import { mkdir, lstat, readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { atomicLinkPublish, atomicReplaceFile } from '../state/atomic-publish.js'
import { withLock } from '../state/lock.js'
import { sha256Hex } from '../sha256.js'
import {
  createAggregateV2,
  decideV2,
  digestAggregate,
  evolveV2,
  type BoardCommandV2,
  type BoardEventV2,
  type BoardSnapshotV2,
  type OrchestrationAggregateV2,
  type V2Rejection,
} from './v2.js'
import {
  V2_MAX_BYTES,
  decodeBoardEventV2,
  decodeBoardSnapshotV2,
} from './v2-codec.js'
export const ORCHESTRATION_LEDGER_DIR = '.orchestration-v2'
export const ORCHESTRATION_CURRENT_FILE = 'current.json'
export const ORCHESTRATION_EVENTS_DIR = 'events'
export const ORCHESTRATION_SNAPSHOTS_DIR = 'snapshots'
export const ORCHESTRATION_IDEMPOTENCY_DIR = 'idempotency'
export const ORCHESTRATION_MAX_RECORD_BYTES = Math.min(V2_MAX_BYTES, 512_000)
export const ORCHESTRATION_MAX_EVENTS = 2_048
type LedgerRecordKind = 'event' | 'snapshot' | 'idempotency'
export interface OrchestrationSeed {
  readonly project_id: string
  readonly change_id: string
  readonly correlation_id: string
  readonly updated_at?: string
}
export interface OrchestrationIdempotencyRecordV1 {
  readonly schema_version: 'orchestration-idempotency/v1'
  readonly record_id: string
  readonly project_id: string
  readonly change_id: string
  readonly command_id: string
  readonly idempotency_key: string
  readonly command_digest: `sha256:${string}`
  readonly committed_revision: number
  readonly event_id: string
  readonly event_digest: `sha256:${string}`
  readonly snapshot_digest: `sha256:${string}`
  readonly created_at: string
}
export interface LeaseRecoveryDecisionV1 {
  readonly run_id: string
  readonly lease_id: string
  readonly decision: 'active' | 'expired-awaiting-scheduler' | 'released' | 'revoked'
  readonly observed_expires_at: string
}
export interface OrchestrationRecoveryReportV1 {
  readonly schema_version: 'orchestration-recovery-report/v1'
  readonly report_id: string
  readonly project_id: string
  readonly change_id: string
  readonly last_valid_revision: number
  readonly ignored_temp_files: readonly string[]
  readonly orphan_event_revisions: readonly number[]
  readonly corrupt_boundary?: {
    readonly kind: 'current-snapshot' | 'snapshot' | 'event' | 'idempotency'
    readonly path: string
    readonly revision?: number
    readonly reason: string
  }
  readonly lease_decisions: readonly LeaseRecoveryDecisionV1[]
  readonly recovered_from: 'current' | 'immutable' | 'genesis' | 'none'
  readonly snapshot_digest?: `sha256:${string}`
  readonly recovered_at: string
}
export type LedgerAppendResult =
  | { readonly kind: 'committed'; readonly event: BoardEventV2; readonly snapshot: BoardSnapshotV2; readonly replayed: false }
  | { readonly kind: 'replayed'; readonly event: BoardEventV2; readonly snapshot: BoardSnapshotV2; readonly replayed: true }
  | { readonly kind: 'rejected'; readonly rejection: V2Rejection }
export interface LedgerRecoveryResult {
  readonly snapshot?: BoardSnapshotV2
  readonly events: readonly BoardEventV2[]
  readonly report: OrchestrationRecoveryReportV1
}
export interface OrchestrationLedger {
  initialize(changeDir: string, seed: OrchestrationSeed): Promise<BoardSnapshotV2>
  readSnapshot(changeDir: string): Promise<BoardSnapshotV2 | undefined>
  readEvent(changeDir: string, eventId: string): Promise<BoardEventV2 | undefined>
  readEvents(changeDir: string, options?: { readonly fromRevision?: number; readonly toRevision?: number }): Promise<readonly BoardEventV2[]>
  append(changeDir: string, command: BoardCommandV2): Promise<LedgerAppendResult>
  recover(changeDir: string, now?: string): Promise<LedgerRecoveryResult>
}
interface Envelope<T> {
  readonly schema_version: 'orchestration-ledger-record/v1'
  readonly kind: LedgerRecordKind
  readonly checksum: `sha256:${string}`
  readonly payload: T
}
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
function stable(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`
}
function checksum(value: unknown): `sha256:${string}` {
  return `sha256:${sha256Hex(stable(value))}`
}
function json(value: unknown): string {
  return `${stable(value)}\n`
}
function safeId(value: string, label: string): void {
  if (!SAFE_ID.test(value)) throw new LedgerPathError(`${label} contains unsafe path characters`)
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function rootFor(changeDir: string): string { return path.join(path.resolve(changeDir), ORCHESTRATION_LEDGER_DIR) }
function dirFor(changeDir: string, name: string): string { return path.join(rootFor(changeDir), name) }
function currentPath(changeDir: string): string { return path.join(rootFor(changeDir), ORCHESTRATION_CURRENT_FILE) }
function eventPath(changeDir: string, revision: number, eventId: string): string {
  if (!integer(revision) || revision < 1) throw new LedgerPathError('event revision must be a positive integer')
  safeId(eventId, 'event id')
  return path.join(dirFor(changeDir, ORCHESTRATION_EVENTS_DIR), `${String(revision).padStart(12, '0')}-${eventId}.json`)
}
function snapshotPath(changeDir: string, revision: number, digest: string): string {
  if (!integer(revision)) throw new LedgerPathError('snapshot revision must be a non-negative integer')
  safeId(digest, 'snapshot digest')
  return path.join(dirFor(changeDir, ORCHESTRATION_SNAPSHOTS_DIR), `${String(revision).padStart(12, '0')}-${digest.slice(7, 23)}.json`)
}
function idempotencyPath(changeDir: string, commandId: string): string {
  safeId(commandId, 'command id')
  return path.join(dirFor(changeDir, ORCHESTRATION_IDEMPOTENCY_DIR), `${commandId}.json`)
}
export class LedgerPathError extends Error { readonly code = 'unsafe-path' }
export class LedgerCorruptionError extends Error { readonly code = 'corrupt-ledger' }
export class LedgerInitializationError extends Error { readonly code = 'invalid-initialization' }
async function ensureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  const item = await lstat(directory)
  if (!item.isDirectory() || item.isSymbolicLink()) throw new LedgerPathError(`ledger directory is not a regular directory: ${directory}`)
}
async function boundedRead(file: string): Promise<string> {
  const item = await lstat(file)
  if (!item.isFile() || item.isSymbolicLink()) throw new LedgerCorruptionError(`symlink or non-regular ledger record: ${file}`)
  if (item.size > ORCHESTRATION_MAX_RECORD_BYTES) throw new LedgerCorruptionError(`ledger record exceeds ${ORCHESTRATION_MAX_RECORD_BYTES} bytes: ${file}`)
  const raw = await readFile(file, 'utf8')
  if (Buffer.byteLength(raw, 'utf8') > ORCHESTRATION_MAX_RECORD_BYTES) throw new LedgerCorruptionError(`ledger record exceeds byte limit: ${file}`)
  return raw
}
function decodeEnvelope<T>(raw: string, file: string, kind: LedgerRecordKind): T {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new LedgerCorruptionError(`invalid JSON: ${file}`) }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new LedgerCorruptionError(`invalid envelope: ${file}`)
  const value = parsed as Record<string, unknown>
  const keys = Object.keys(value).sort().join(',')
  if (keys !== 'checksum,kind,payload,schema_version' || value.schema_version !== 'orchestration-ledger-record/v1' || value.kind !== kind || typeof value.checksum !== 'string') {
    throw new LedgerCorruptionError(`invalid envelope contract: ${file}`)
  }
  if (checksum(value.payload) !== value.checksum) throw new LedgerCorruptionError(`checksum mismatch: ${file}`)
  return value.payload as T
}
function envelope<T>(kind: LedgerRecordKind, payload: T): Envelope<T> {
  return { schema_version: 'orchestration-ledger-record/v1', kind, checksum: checksum(payload), payload }
}
async function readEnvelopeFile<T>(file: string, kind: LedgerRecordKind): Promise<T> {
  return decodeEnvelope(await boundedRead(file), file, kind)
}
async function publishImmutable<T>(fileDir: string, file: string, kind: LedgerRecordKind, payload: T): Promise<void> {
  await ensureDirectory(fileDir)
  const content = json(envelope(kind, payload))
  try {
    await atomicLinkPublish(fileDir, '.tmp', file, content)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const prior = await boundedRead(file)
    if (prior !== content) throw new LedgerCorruptionError(`immutable record collision: ${file}`)
  }
}
function reject(code: V2Rejection['code'], message: string, reason_code: string = code, next_actions: readonly string[] = []): LedgerAppendResult {
  return { kind: 'rejected', rejection: { code, message, reason_code, next_actions } }
}
function parseEvent(value: unknown, file: string): BoardEventV2 {
  const decoded = decodeBoardEventV2(value)
  if (!decoded.ok) throw new LedgerCorruptionError(`event schema invalid at ${file}: ${decoded.errors.map((error) => error.path).join(', ')}`)
  return decoded.value
}
function parseSnapshot(value: unknown, file: string): BoardSnapshotV2 {
  const decoded = decodeBoardSnapshotV2(value)
  if (!decoded.ok) throw new LedgerCorruptionError(`snapshot schema invalid at ${file}: ${decoded.errors.map((error) => error.path).join(', ')}`)
  return decoded.value
}
function parseIdempotency(value: unknown, file: string): OrchestrationIdempotencyRecordV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new LedgerCorruptionError(`idempotency schema invalid at ${file}`)
  const record = value as Record<string, unknown>
  const expected = ['change_id', 'command_digest', 'command_id', 'committed_revision', 'created_at', 'event_digest', 'event_id', 'idempotency_key', 'project_id', 'record_id', 'schema_version', 'snapshot_digest'].sort()
  if (Object.keys(record).sort().join(',') !== expected.join(',') || record.schema_version !== 'orchestration-idempotency/v1') throw new LedgerCorruptionError(`idempotency schema invalid at ${file}`)
  for (const key of ['record_id', 'project_id', 'change_id', 'command_id', 'idempotency_key', 'event_id', 'created_at']) if (typeof record[key] !== 'string' || !SAFE_ID.test(record[key] as string)) throw new LedgerCorruptionError(`idempotency identity invalid at ${file}`)
  if (!UTC.test(record.created_at as string) || !integer(record.committed_revision)) throw new LedgerCorruptionError(`idempotency value invalid at ${file}`)
  const command_digest = record.command_digest; const event_digest = record.event_digest; const snapshot_digest = record.snapshot_digest
  if (typeof command_digest !== 'string' || typeof event_digest !== 'string' || typeof snapshot_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(command_digest) || !/^sha256:[0-9a-f]{64}$/u.test(event_digest) || !/^sha256:[0-9a-f]{64}$/u.test(snapshot_digest)) throw new LedgerCorruptionError(`idempotency digest invalid at ${file}`)
  return {
    schema_version: 'orchestration-idempotency/v1', record_id: record.record_id as string, project_id: record.project_id as string,
    change_id: record.change_id as string, command_id: record.command_id as string, idempotency_key: record.idempotency_key as string,
    command_digest: command_digest as `sha256:${string}`, committed_revision: record.committed_revision as number,
    event_id: record.event_id as string, event_digest: event_digest as `sha256:${string}`, snapshot_digest: snapshot_digest as `sha256:${string}`,
    created_at: record.created_at as string,
  }
}
async function listFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile() || entry.isSymbolicLink()).map((entry) => entry.name).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
function parseRevision(name: string): number | undefined {
  const match = /^(\d+)-/.exec(name)
  if (!match) return undefined
  const revision = Number(match[1])
  return integer(revision) ? revision : undefined
}
async function readEventByPath(changeDir: string, file: string): Promise<BoardEventV2> {
  return parseEvent(await readEnvelopeFile(path.join(dirFor(changeDir, ORCHESTRATION_EVENTS_DIR), file), 'event'), file)
}
async function readEventsSorted(changeDir: string): Promise<{ events: BoardEventV2[]; invalid?: { path: string; revision?: number; reason: string }; tempFiles: string[] }> {
  const names = await listFiles(dirFor(changeDir, ORCHESTRATION_EVENTS_DIR))
  const events: BoardEventV2[] = []
  const tempFiles = names.filter((name) => name.includes('.tmp-') || name.startsWith('.tmp'))
  for (const name of names.filter((entry) => !tempFiles.includes(entry))) {
    const revision = parseRevision(name)
    try {
      if (revision === undefined || !name.endsWith('.json')) throw new LedgerCorruptionError('event filename is not versioned')
      const event = await readEventByPath(changeDir, name)
      if (event.revision !== revision || event.schema_version !== 'board-event/v2') throw new LedgerCorruptionError('event filename/revision mismatch')
      events.push(event)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { events, invalid: { path: path.join(dirFor(changeDir, ORCHESTRATION_EVENTS_DIR), name), revision, reason }, tempFiles }
    }
  }
  events.sort((a, b) => a.revision - b.revision)
  if (events.length > ORCHESTRATION_MAX_EVENTS) return { events: events.slice(0, ORCHESTRATION_MAX_EVENTS), invalid: { path: dirFor(changeDir, ORCHESTRATION_EVENTS_DIR), reason: 'event count exceeds bounded reader limit' }, tempFiles }
  return { events, tempFiles }
}
async function readCurrent(changeDir: string): Promise<BoardSnapshotV2 | undefined> {
  try {
    return parseSnapshot(await readEnvelopeFile(currentPath(changeDir), 'snapshot'), currentPath(changeDir))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
async function readSnapshotAtRevision(changeDir: string, revision: number, expectedDigest?: string): Promise<BoardSnapshotV2 | undefined> {
  const names = await listFiles(dirFor(changeDir, ORCHESTRATION_SNAPSHOTS_DIR))
  for (const name of names) {
    if (parseRevision(name) !== revision || !name.endsWith('.json')) continue
    try {
      const snapshot = parseSnapshot(await readEnvelopeFile(path.join(dirFor(changeDir, ORCHESTRATION_SNAPSHOTS_DIR), name), 'snapshot'), name)
      if (expectedDigest === undefined || checksum(snapshot) === expectedDigest) return snapshot
    } catch {
      // A corrupt immutable candidate is not a replay result; continue looking
      // for another file at the same revision and let recovery report the
      // boundary when no valid candidate remains.
    }
  }
  return undefined
}
async function readIdempotencyRecords(changeDir: string): Promise<{ records: OrchestrationIdempotencyRecordV1[]; invalid?: { path: string; reason: string } }> {
  const names = await listFiles(dirFor(changeDir, ORCHESTRATION_IDEMPOTENCY_DIR))
  if (names.filter((entry) => entry.endsWith('.json')).length > ORCHESTRATION_MAX_EVENTS) return { records: [], invalid: { path: dirFor(changeDir, ORCHESTRATION_IDEMPOTENCY_DIR), reason: 'idempotency index exceeds bounded reader limit' } }
  const records: OrchestrationIdempotencyRecordV1[] = []
  for (const name of names.filter((entry) => !entry.includes('.tmp-') && !entry.startsWith('.tmp'))) {
    try {
      if (!name.endsWith('.json')) throw new LedgerCorruptionError('idempotency filename is not JSON')
      const record = parseIdempotency(await readEnvelopeFile(path.join(dirFor(changeDir, ORCHESTRATION_IDEMPOTENCY_DIR), name), 'idempotency'), name)
      if (`${record.command_id}.json` !== name) throw new LedgerCorruptionError('idempotency filename/command mismatch')
      records.push(record)
    } catch (error) {
      return { records, invalid: { path: path.join(dirFor(changeDir, ORCHESTRATION_IDEMPOTENCY_DIR), name), reason: error instanceof Error ? error.message : String(error) } }
    }
  }
  return { records }
}
function leasesFor(snapshot: BoardSnapshotV2, now: string): LeaseRecoveryDecisionV1[] {
  return snapshot.runs.flatMap((run) => {
    const lease = run.lease
    if (!lease) return []
    const decision: LeaseRecoveryDecisionV1['decision'] = ['active', 'renewed'].includes(lease.status)
      ? lease.expires_at <= now ? 'expired-awaiting-scheduler' : 'active'
      : lease.status === 'released' ? 'released' : 'revoked'
    return [{ run_id: run.run_id, lease_id: lease.lease_id, decision, observed_expires_at: lease.expires_at }]
  })
}
function sameJson(a: unknown, b: unknown): boolean { return stable(a) === stable(b) }
class FsOrchestrationLedger implements OrchestrationLedger {
  async initialize(changeDir: string, seed: OrchestrationSeed): Promise<BoardSnapshotV2> {
    safeId(seed.project_id, 'project id'); safeId(seed.change_id, 'change id'); safeId(seed.correlation_id, 'correlation id')
    if (seed.updated_at !== undefined && !UTC.test(seed.updated_at)) throw new LedgerInitializationError('updated_at must be UTC')
    await ensureDirectory(rootFor(changeDir));
    await Promise.all([ORCHESTRATION_EVENTS_DIR, ORCHESTRATION_SNAPSHOTS_DIR, ORCHESTRATION_IDEMPOTENCY_DIR].map((name) => ensureDirectory(dirFor(changeDir, name))))
    return withLock(changeDir, async () => {
      const existing = await readCurrent(changeDir)
      if (existing !== undefined) {
        if (existing.project_id !== seed.project_id || existing.change_id !== seed.change_id || existing.correlation_id !== seed.correlation_id) throw new LedgerInitializationError('existing ledger identity does not match seed')
        return existing
      }
      const aggregate = createAggregateV2(seed.project_id, seed.change_id, seed.correlation_id, seed.updated_at)
      const digest = checksum(aggregate)
      await publishImmutable(dirFor(changeDir, ORCHESTRATION_SNAPSHOTS_DIR), snapshotPath(changeDir, 0, digest), 'snapshot', aggregate)
      await atomicReplaceFile(currentPath(changeDir), json(envelope('snapshot', aggregate)))
      return aggregate
    })
  }
  async readSnapshot(changeDir: string): Promise<BoardSnapshotV2 | undefined> { return readCurrent(changeDir) }
  async readEvent(changeDir: string, eventId: string): Promise<BoardEventV2 | undefined> {
    safeId(eventId, 'event id')
    const names = await listFiles(dirFor(changeDir, ORCHESTRATION_EVENTS_DIR))
    for (const name of names) {
      if (!name.endsWith(`-${eventId}.json`)) continue
      return readEventByPath(changeDir, name)
    }
    return undefined
  }
  async readEvents(changeDir: string, options: { readonly fromRevision?: number; readonly toRevision?: number } = {}): Promise<readonly BoardEventV2[]> {
    if (options.fromRevision !== undefined && !integer(options.fromRevision)) throw new LedgerPathError('fromRevision must be a non-negative integer')
    if (options.toRevision !== undefined && !integer(options.toRevision)) throw new LedgerPathError('toRevision must be a non-negative integer')
    const result = await readEventsSorted(changeDir)
    if (result.invalid) throw new LedgerCorruptionError(result.invalid.reason)
    const current = await readCurrent(changeDir)
    const upperBound = options.toRevision ?? current?.revision ?? 0
    return result.events.filter((event) => event.revision <= upperBound && (options.fromRevision === undefined || event.revision >= options.fromRevision))
  }
  async append(changeDir: string, command: BoardCommandV2): Promise<LedgerAppendResult> {
    safeId(command.command_id, 'command id'); safeId(command.idempotency_key, 'idempotency key')
    return withLock(changeDir, async () => {
      const current = await readCurrent(changeDir)
      if (current === undefined) return reject('not-found', 'orchestration ledger is not initialized', 'ledger-not-initialized')
      if (command.change_id !== current.change_id) return reject('contract-invalid', 'command change does not match ledger', 'identity-mismatch')
      const indexed = await readIdempotencyRecords(changeDir)
      if (indexed.invalid) return reject('contract-invalid', `idempotency index is corrupt: ${indexed.invalid.reason}`, 'idempotency-index-corrupt')
      const commandDigest = digestAggregate(command)
      const prior = indexed.records.find((record) => record.command_id === command.command_id || record.idempotency_key === command.idempotency_key)
      if (prior !== undefined) {
        if (prior.command_id !== command.command_id || prior.idempotency_key !== command.idempotency_key || prior.command_digest !== commandDigest) return reject('idempotency-conflict', 'command identity was already used with a different payload', 'idempotency-conflict')
        const event = await this.readEvent(changeDir, prior.event_id)
        const snapshot = await readSnapshotAtRevision(changeDir, prior.committed_revision, prior.snapshot_digest)
        if (!event || !snapshot) return reject('contract-invalid', 'idempotency record points to a missing event or snapshot', 'idempotency-orphan')
        return { kind: 'replayed', event, snapshot, replayed: true }
      }
      if (command.expected_revision !== current.revision) return reject('revision-conflict', `expected revision ${command.expected_revision}, current ${current.revision}`, 'stale-revision', ['reload-snapshot'])
      const decision = decideV2(current, command)
      if (!decision.ok) return { kind: 'rejected', rejection: decision.rejection }
      const event = decision.event
      const next = evolveV2(current, event)
      if (event.revision !== next.revision || next.event_head_id !== event.event_id || next.event_head_digest !== event.after_digest) throw new LedgerCorruptionError('aggregate/event digest linkage failed before publication')
      await publishImmutable(dirFor(changeDir, ORCHESTRATION_EVENTS_DIR), eventPath(changeDir, event.revision, event.event_id), 'event', event)
      const nextDigest = checksum(next)
      await publishImmutable(dirFor(changeDir, ORCHESTRATION_SNAPSHOTS_DIR), snapshotPath(changeDir, next.revision, nextDigest), 'snapshot', next)
      await atomicReplaceFile(currentPath(changeDir), json(envelope('snapshot', next)))
      const index: OrchestrationIdempotencyRecordV1 = {
        schema_version: 'orchestration-idempotency/v1', record_id: `idempotency:${command.command_id}`,
        project_id: current.project_id, change_id: current.change_id, command_id: command.command_id,
        idempotency_key: command.idempotency_key, command_digest: commandDigest, committed_revision: next.revision,
        event_id: event.event_id, event_digest: checksum(event), snapshot_digest: nextDigest, created_at: command.issued_at,
      }
      await publishImmutable(dirFor(changeDir, ORCHESTRATION_IDEMPOTENCY_DIR), idempotencyPath(changeDir, command.command_id), 'idempotency', index)
      return { kind: 'committed', event, snapshot: next, replayed: false }
    })
  }
  async recover(changeDir: string, now = new Date().toISOString()): Promise<LedgerRecoveryResult> {
    if (!UTC.test(now)) throw new LedgerPathError('recovery time must be UTC')
    const eventRead = await readEventsSorted(changeDir)
    const snapshotNames = await listFiles(dirFor(changeDir, ORCHESTRATION_SNAPSHOTS_DIR))
    let current: BoardSnapshotV2 | undefined
    let currentCorruption: OrchestrationRecoveryReportV1['corrupt_boundary']
    try { current = await readCurrent(changeDir) } catch (error) { currentCorruption = { kind: 'current-snapshot', path: currentPath(changeDir), reason: error instanceof Error ? error.message : String(error) } }
    const candidates: BoardSnapshotV2[] = []
    for (const name of snapshotNames.filter((entry) => !entry.includes('.tmp-') && !entry.startsWith('.tmp')).sort().reverse()) {
      try {
        if (!name.endsWith('.json')) throw new LedgerCorruptionError('snapshot filename is not JSON')
        const snapshot = parseSnapshot(await readEnvelopeFile(path.join(dirFor(changeDir, ORCHESTRATION_SNAPSHOTS_DIR), name), 'snapshot'), name)
        candidates.push(snapshot)
      } catch {
        // A lower immutable snapshot may still be valid; keep searching.
      }
    }
    if (current !== undefined) candidates.unshift(current)
    let recovered: BoardSnapshotV2 | undefined
    let recoveredFrom: OrchestrationRecoveryReportV1['recovered_from'] = 'none'
    let validEvents: BoardEventV2[] = []
    const genesisUpdatedAt = candidates.find((candidate) => candidate.revision === 0)?.updated_at ?? '1970-01-01T00:00:00.000Z'
    for (const candidate of candidates.sort((a, b) => b.revision - a.revision)) {
      const chain = eventRead.events.filter((event) => event.revision <= candidate.revision)
      if (candidate.revision === 0 && chain.length !== 0) continue
      if (chain.length !== candidate.revision) continue
      let aggregate = createAggregateV2(candidate.project_id, candidate.change_id, candidate.correlation_id, genesisUpdatedAt)
      let valid = true
      for (const event of chain) {
        if (event.revision !== aggregate.revision + 1 || event.project_id !== candidate.project_id || event.change_id !== candidate.change_id || event.correlation_id !== candidate.correlation_id || event.before_digest !== digestAggregate(aggregate)) { valid = false; break }
        aggregate = evolveV2(aggregate, event)
        if (aggregate.event_head_id !== event.event_id || aggregate.event_head_digest !== event.after_digest) { valid = false; break }
      }
      if (valid && sameJson(aggregate, candidate)) { recovered = candidate; validEvents = chain; recoveredFrom = candidate === current ? 'current' : 'immutable'; break }
    }
    if (recovered === undefined && snapshotNames.length === 0 && eventRead.events.length === 0) recoveredFrom = 'genesis'
    const orphan = [
      ...eventRead.events.filter((event) => recovered === undefined || event.revision > recovered.revision).map((event) => event.revision),
      ...(eventRead.invalid?.revision === undefined ? [] : [eventRead.invalid.revision]),
    ]
    const project_id = recovered?.project_id ?? current?.project_id ?? 'unknown'
    const change_id = recovered?.change_id ?? current?.change_id ?? 'unknown'
    const orphan_event_revisions = [...new Set(orphan)].sort((a, b) => a - b)
    const corrupt_boundary = currentCorruption
      ?? (eventRead.invalid ? { kind: 'event' as const, path: eventRead.invalid.path, ...(eventRead.invalid.revision === undefined ? {} : { revision: eventRead.invalid.revision }), reason: eventRead.invalid.reason } : undefined)
    const lease_decisions = recovered ? leasesFor(recovered, now) : []
    const reportIdentity = { project_id, change_id, last_valid_revision: recovered?.revision ?? 0, orphan_event_revisions, corrupt_boundary, recovered_from: recoveredFrom, snapshot_digest: recovered ? checksum(recovered) : undefined, recovered_at: now }
    const report: OrchestrationRecoveryReportV1 = {
      schema_version: 'orchestration-recovery-report/v1', report_id: `recovery:${checksum(reportIdentity).slice(7, 39)}`,
      project_id, change_id, last_valid_revision: recovered?.revision ?? 0, ignored_temp_files: eventRead.tempFiles,
      orphan_event_revisions, ...(corrupt_boundary ? { corrupt_boundary } : {}), lease_decisions, recovered_from: recoveredFrom,
      ...(recovered ? { snapshot_digest: checksum(recovered) } : {}), recovered_at: now,
    }
    // `current.json` is a replaceable projection, not the source of truth. If a
    // crash or manual corruption left it unreadable/stale, heal it from the
    // verified immutable snapshot before a scheduler attempts the next CAS.
    if (recovered !== undefined && (current === undefined || !sameJson(current, recovered))) {
      // Re-read immediately before healing so a concurrent writer that already
      // advanced the pointer can never be overwritten by an older recovery.
      const live = await readCurrent(changeDir).catch(() => undefined)
      if (live === undefined || live.revision <= recovered.revision) {
        await atomicReplaceFile(currentPath(changeDir), json(envelope('snapshot', recovered)))
      }
    }
    return { ...(recovered ? { snapshot: recovered } : {}), events: validEvents, report }
  }
}
export function createOrchestrationLedger(): OrchestrationLedger { return new FsOrchestrationLedger() }
