import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { PipelineState, RunMetadata } from '../types.js'
import type { TransitionRecord } from '../workflow/run-types.js'
import type { RunRevision } from './run-revision-codec.js'
import { RunStateCorruptError } from './run-revision-validation.js'
import { parseTransitionRecord, TRANSITION_RECORDS_DIR } from './transition-record-store.js'

const PREFIX = '# tenon-internal-transition-head-v1: '
const SHA256_RE = /^[0-9a-f]{64}$/
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/

export interface TransitionHeadAnchor {
  readonly schemaVersion: 1
  readonly runId: string
  readonly sequence: number
  readonly recordId: string
  readonly recordDigest: string
}

function parseAnchor(encoded: string): TransitionHeadAnchor {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch (error) {
    throw new RunStateCorruptError(`transition head opaqueTail anchor 损坏（${String(error)}）`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RunStateCorruptError('transition head opaqueTail anchor 形状非法')
  }
  const raw = Object.fromEntries(Object.entries(value))
  if (Object.keys(raw).sort().join(',')
      !== 'recordDigest,recordId,runId,schemaVersion,sequence'
    || raw.schemaVersion !== 1
    || typeof raw.runId !== 'string' || !SAFE_ID_RE.test(raw.runId)
    || typeof raw.sequence !== 'number' || !Number.isSafeInteger(raw.sequence) || raw.sequence < 1
    || typeof raw.recordId !== 'string' || !SAFE_ID_RE.test(raw.recordId)
    || typeof raw.recordDigest !== 'string' || !SHA256_RE.test(raw.recordDigest)) {
    throw new RunStateCorruptError('transition head opaqueTail anchor 形状非法')
  }
  return {
    schemaVersion: 1,
    runId: raw.runId,
    sequence: raw.sequence,
    recordId: raw.recordId,
    recordDigest: raw.recordDigest,
  }
}

export function readTransitionHeadAnchor(state: PipelineState): TransitionHeadAnchor | undefined {
  if (!state.opaqueTail.startsWith(PREFIX)) return undefined
  const lineEnd = state.opaqueTail.indexOf('\n')
  if (lineEnd < 0) throw new RunStateCorruptError('transition head opaqueTail anchor 缺换行')
  const encoded = state.opaqueTail.slice(PREFIX.length, lineEnd)
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new RunStateCorruptError('transition head opaqueTail anchor 编码非法')
  }
  return parseAnchor(encoded)
}

export function withTransitionHeadAnchor(
  state: PipelineState,
  metadata: RunMetadata,
  recordDigest: string,
): PipelineState {
  if (metadata.transitionHead === undefined || metadata.transitionSequence < 1
    || !SHA256_RE.test(recordDigest)) {
    throw new RunStateCorruptError('transition head anchor 缺匹配的 canonical metadata/digest')
  }
  const existing = readTransitionHeadAnchor(state)
  const tail = existing === undefined
    ? state.opaqueTail
    : state.opaqueTail.slice(state.opaqueTail.indexOf('\n') + 1)
  const anchor: TransitionHeadAnchor = {
    schemaVersion: 1,
    runId: metadata.runId,
    sequence: metadata.transitionSequence,
    recordId: metadata.transitionHead,
    recordDigest,
  }
  const encoded = Buffer.from(JSON.stringify(anchor), 'utf8').toString('base64url')
  return { ...state, opaqueTail: `${PREFIX}${encoded}\n${tail}` }
}

export function assertTransitionHeadAnchorMatchesMetadata(
  anchor: TransitionHeadAnchor,
  metadata: RunMetadata,
): void {
  if (!transitionHeadAnchorMatchesMetadata(anchor, metadata)) {
    throw new RunStateCorruptError('transition head anchor 与 canonical runMetadata 不一致')
  }
}

export function transitionHeadAnchorMatchesMetadata(
  anchor: TransitionHeadAnchor,
  metadata: RunMetadata,
): boolean {
  return anchor.runId === metadata.runId
    && anchor.sequence === metadata.transitionSequence
    && anchor.recordId === metadata.transitionHead
}

function anchoredRecordPath(anchor: TransitionHeadAnchor): string {
  return join(
    TRANSITION_RECORDS_DIR,
    `${String(anchor.sequence).padStart(6, '0')}-${anchor.recordId}.json`,
  )
}

function validateAnchoredRecord(
  revision: RunRevision,
  raw: string,
  source: string,
): TransitionRecord {
  const anchor = readTransitionHeadAnchor(revision.state)
  if (anchor === undefined) throw new RunStateCorruptError('transition head anchor 缺失')
  if (createHash('sha256').update(raw).digest('hex') !== anchor.recordDigest) {
    throw new RunStateCorruptError('canonical head TransitionRecord digest 与 anchor 不一致')
  }
  try {
    const record = parseTransitionRecord(JSON.parse(raw), source)
    if (record.id !== anchor.recordId || record.sequence !== anchor.sequence
      || record.runId !== anchor.runId) {
      throw new RunStateCorruptError('canonical head TransitionRecord 与 anchor 不一致')
    }
    return record
  } catch (error) {
    if (error instanceof RunStateCorruptError) throw error
    throw new RunStateCorruptError(`canonical head TransitionRecord 损坏: ${String(error)}`)
  }
}

export async function validateAnchoredTransitionHead(
  revision: RunRevision,
  readText: (relativePath: string) => Promise<string | undefined>,
  sourceRoot: string,
): Promise<TransitionRecord | undefined> {
  const anchor = readTransitionHeadAnchor(revision.state)
  if (anchor === undefined) return undefined
  const metadata = revision.state.runMetadata
  if (metadata === undefined) {
    throw new RunStateCorruptError('transition head anchor 缺 canonical runMetadata')
  }
  // N-1 runtimes preserve opaqueTail but do not know how to advance this anchor. A stale anchor is
  // therefore a compatibility signal, not authority; the caller must use the bounded immutable
  // committing-revision fallback.
  if (!transitionHeadAnchorMatchesMetadata(anchor, metadata)) return undefined
  const relativePath = anchoredRecordPath(anchor)
  const raw = await readText(relativePath)
  if (raw === undefined) throw new RunStateCorruptError('canonical head TransitionRecord 缺失')
  return validateAnchoredRecord(revision, raw, join(sourceRoot, relativePath))
}

export function validateAnchoredTransitionHeadFromSync(
  revision: RunRevision,
  readText: (relativePath: string) => string | undefined,
  sourceRoot: string,
): TransitionRecord | undefined {
  const anchor = readTransitionHeadAnchor(revision.state)
  if (anchor === undefined) return undefined
  const metadata = revision.state.runMetadata
  if (metadata === undefined) {
    throw new RunStateCorruptError('transition head anchor 缺 canonical runMetadata')
  }
  if (!transitionHeadAnchorMatchesMetadata(anchor, metadata)) return undefined
  const relativePath = anchoredRecordPath(anchor)
  const raw = readText(relativePath)
  if (raw === undefined) throw new RunStateCorruptError('canonical head TransitionRecord 缺失')
  return validateAnchoredRecord(revision, raw, join(sourceRoot, relativePath))
}
