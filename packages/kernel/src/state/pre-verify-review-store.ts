/**
 * Revision-bound storage for the logical canonical `pre_verify_review_result`.
 *
 * The schemaVersion=1 WorkflowRun wire closure is consumed by the previous released runtime and
 * cannot grow an unknown state field without breaking rollback. Each new revision therefore owns
 * one immutable companion record. The record is published before the immutable revision/current
 * pointer; a crash can only leave an unreachable orphan. Missing records read as `pending`, which
 * preserves pre-feature revisions and fails closed for Build authorization.
 */
import { lstat, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  PRE_VERIFY_REVIEW_DEFAULT,
  PRE_VERIFY_REVIEW_FIELD,
  type PipelineState,
} from '../types.js'
import { atomicLinkPublish } from './atomic-publish.js'
import {
  preVerifyReviewPayloadDigest,
  RunStateCorruptError,
  splitPreVerifyReviewAnchor,
  type RunRevision,
} from './run-revision-codec.js'

export const PRE_VERIFY_REVIEW_DIR = 'pre-verify-review'
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/
const ALLOWED_RESULTS = new Set(['pending', 'pass'])

interface PreVerifyReviewRecord {
  readonly schemaVersion: 1
  readonly revision: number
  readonly revisionId: string
  readonly stateDigest: string
  readonly result: string
}

function errnoCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

export function preVerifyReviewFileName(revision: number, revisionId: string): string {
  return `${String(revision).padStart(6, '0')}-${revisionId}.json`
}

export function preVerifyReviewRelativePath(revision: number, revisionId: string): string {
  return join('.pipeline-run', PRE_VERIFY_REVIEW_DIR, preVerifyReviewFileName(revision, revisionId))
}

function resultFor(state: PipelineState): string {
  const value = state.fields[PRE_VERIFY_REVIEW_FIELD]
  if (typeof value !== 'string' || !ALLOWED_RESULTS.has(value)) {
    throw new RunStateCorruptError(
      `canonical ${PRE_VERIFY_REVIEW_FIELD} 非法：仅允许 pending/pass`,
    )
  }
  return value
}

function recordFor(revision: RunRevision, state: PipelineState): PreVerifyReviewRecord {
  return {
    schemaVersion: 1,
    revision: revision.revision,
    revisionId: revision.revisionId,
    stateDigest: revision.stateDigest,
    result: resultFor(state),
  }
}

function parseRecord(raw: string, source: string): PreVerifyReviewRecord {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new RunStateCorruptError(`${source}: pre-Verify companion JSON 损坏（${String(error)}）`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RunStateCorruptError(`${source}: pre-Verify companion 不是对象`)
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'result,revision,revisionId,schemaVersion,stateDigest'
    || record.schemaVersion !== 1
    || typeof record.revision !== 'number'
    || !Number.isSafeInteger(record.revision) || record.revision < 0
    || typeof record.revisionId !== 'string' || !SAFE_ID_RE.test(record.revisionId)
    || typeof record.stateDigest !== 'string' || !/^[0-9a-f]{64}$/.test(record.stateDigest)
    || typeof record.result !== 'string' || !ALLOWED_RESULTS.has(record.result)) {
    throw new RunStateCorruptError(`${source}: pre-Verify companion 形状非法`)
  }
  return {
    schemaVersion: 1,
    revision: record.revision,
    revisionId: record.revisionId,
    stateDigest: record.stateDigest,
    result: record.result,
  }
}

function attach(revision: RunRevision, record?: PreVerifyReviewRecord): RunRevision {
  const { state, anchor } = splitPreVerifyReviewAnchor(revision.state)
  const anchorIsCurrent = anchor !== undefined
    && anchor.revision === revision.revision
    && anchor.revisionId === revision.revisionId
  // A previous runtime may preserve an old anchor while creating a new revision. That stale
  // anchor must never carry a prior `pass` forward; treat the logical field as pending until the
  // current runtime publishes a freshly bound companion.
  const result = anchorIsCurrent && record !== undefined
    ? record.result
    : PRE_VERIFY_REVIEW_DEFAULT
  if (record !== undefined && (
    record.revision !== revision.revision
    || record.revisionId !== revision.revisionId
    || record.stateDigest !== revision.stateDigest
  )) {
    throw new RunStateCorruptError('pre-Verify companion 与 canonical revision 身份/摘要不一致')
  }
  if (anchorIsCurrent && record !== undefined
    && anchor.payloadDigest !== preVerifyReviewPayloadDigest(
      record.revision,
      record.revisionId,
      record.result,
    )) {
    throw new RunStateCorruptError('pre-Verify companion 内容与 canonical anchor 摘要不一致')
  }
  return {
    ...revision,
    state: {
      ...state,
      fields: {
        ...state.fields,
        [PRE_VERIFY_REVIEW_FIELD]: result,
      },
    },
  }
}

export async function publishPreVerifyReviewRecord(
  changeDir: string,
  revision: RunRevision,
  logicalState: PipelineState,
): Promise<void> {
  const dir = join(changeDir, '.pipeline-run', PRE_VERIFY_REVIEW_DIR)
  await mkdir(dir, { recursive: true })
  const target = join(dir, preVerifyReviewFileName(revision.revision, revision.revisionId))
  await atomicLinkPublish(dir, '.tmp', target, `${JSON.stringify(recordFor(revision, logicalState))}\n`)
}

export async function hydratePreVerifyReview(
  changeDir: string,
  revision: RunRevision,
): Promise<RunRevision> {
  const target = join(
    changeDir,
    preVerifyReviewRelativePath(revision.revision, revision.revisionId),
  )
  let info
  try {
    info = await lstat(target)
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return attach(revision)
    throw error
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new RunStateCorruptError(`${target}: pre-Verify companion 必须是非 symlink 普通文件`)
  }
  return attach(revision, parseRecord(await readFile(target, 'utf8'), target))
}

export type PreVerifyReviewTextReader = (relativePath: string) => string | undefined

export function hydratePreVerifyReviewFromSync(
  readText: PreVerifyReviewTextReader,
  revision: RunRevision,
  sourceRoot = 'canonical state',
): RunRevision {
  const relative = preVerifyReviewRelativePath(revision.revision, revision.revisionId)
  const raw = readText(relative)
  return attach(
    revision,
    raw === undefined ? undefined : parseRecord(raw, join(sourceRoot, relative)),
  )
}
