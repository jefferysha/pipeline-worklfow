/**
 * G1 canonical WorkflowRun state.
 *
 * `.pipeline-run/current.json` is the N-1-compatible committed wire revision. The matching immutable
 * file under `revisions/` must contain identical bytes; post-v1 logical fields may be restored only
 * from revision-bound companion records. A current file that is malformed, fails its digest, or
 * lacks its immutable twin is corruption and never authorizes a YAML fallback.
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { lstat, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type PipelineState,
  type StateProjectionMetadata,
} from '../types.js'
import type { TransitionRecord } from '../workflow/run-types.js'
import { atomicLinkPublish, atomicReplaceFile } from './atomic-publish.js'
import { diffWireFieldsToEffects } from './run-metadata.js'
import {
  RunStateCorruptError,
  createRunRevision,
  parseRunRevision,
  serializeRunRevision,
  type RunRevision,
  type RunStateMutation,
} from './run-revision-codec.js'
import { TRANSITION_RECORDS_DIR } from './transition-record-store.js'
import {
  hydratePreVerifyReview,
  hydratePreVerifyReviewFromSync,
  publishPreVerifyReviewRecord,
} from './pre-verify-review-store.js'
import { assertRunMetadataContinuity } from './run-revision-continuity.js'

export {
  RunStateCorruptError,
  hookStateFor,
  type RunHookState,
  type RunRevision,
  type RunStateMutation,
} from './run-revision-codec.js'

export const RUN_STATE_DIR = '.pipeline-run'
export const RUN_CURRENT_FILE = 'current.json'
export const RUN_REVISIONS_DIR = 'revisions'
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/

function errnoCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  const record = Object.fromEntries(Object.entries(error))
  return typeof record.code === 'string' ? record.code : undefined
}

/**
 * 同步生产入口（CLI 枚举、server 路由、SSE fingerprint）统一使用的状态来源选择。
 * current 只按“目录项存在”取得优先权：即使内容损坏也不能回退 YAML；真正读取时必须继续
 * 经过 canonical validator。只有 current 不存在时才兼容 legacy `.pipeline.yaml`。
 */
export function stateStorageSourcePathSync(changeDir: string): string | undefined {
  const current = join(changeDir, RUN_STATE_DIR, RUN_CURRENT_FILE)
  try {
    lstatSync(current)
    return current
  } catch (error) {
    if (errnoCode(error) !== 'ENOENT') throw error
  }
  const legacy = join(changeDir, '.pipeline.yaml')
  try {
    lstatSync(legacy)
    return legacy
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return undefined
    throw error
  }
}

export function stateStorageExistsSync(changeDir: string): boolean {
  return stateStorageSourcePathSync(changeDir) !== undefined
}

function ownRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return Object.fromEntries(Object.entries(value))
}

function previousRevisionIdFor(revision: RunRevision): string {
  if (revision.previousRevisionId === undefined) {
    throw new RunStateCorruptError('非初始 revision 缺 previousRevisionId')
  }
  return revision.previousRevisionId
}

function revisionFileName(revision: number, revisionId: string): string {
  return `${String(revision).padStart(6, '0')}-${revisionId}.json`
}

function assertTransitionRevisionLink(
  current: RunRevision,
  transition: unknown,
  raw: string,
  previous?: RunRevision,
): void {
  const observedDigest = createHash('sha256').update(raw).digest('hex')
  if (observedDigest !== current.mutation.transitionRecordDigest) {
    throw new RunStateCorruptError('TransitionRecord digest 与 canonical revision 审计绑定不一致')
  }
  const metadata = current.state.runMetadata
  if (metadata === undefined || metadata.transitionHead === undefined
    || metadata.transitionSequence < 1) {
    throw new RunStateCorruptError('transition revision 缺 canonical run head/sequence')
  }
  const record = ownRecord(transition)
  if (record === undefined) throw new RunStateCorruptError('transition revision 引用的 TransitionRecord 缺失')
  if (record.id !== current.mutation.transitionRecordId
    || record.sequence !== metadata.transitionSequence
    || record.runId !== metadata.runId
    || (previous !== undefined
      && record.previousRecordId !== previous.state.runMetadata?.transitionHead)
    || JSON.stringify(record.effects) !== JSON.stringify(current.mutation.effects)) {
    throw new RunStateCorruptError('transition revision 与 TransitionRecord 不一致')
  }
}

function assertMutationEffects(current: RunRevision, previous: RunRevision): void {
  const expected = diffWireFieldsToEffects(previous.state.fields, current.state.fields)
  if (JSON.stringify(current.mutation.effects) !== JSON.stringify(expected)) {
    throw new RunStateCorruptError('canonical mutation.effects 与 previous→current 真实 diff 不一致')
  }
  assertRunMetadataContinuity(current, previous)
}

async function assertTransitionRecordFile(
  changeDir: string,
  revision: RunRevision,
  previous?: RunRevision,
): Promise<TransitionRecord | undefined> {
  if (revision.mutation.kind !== 'transition') return undefined
  const metadata = revision.state.runMetadata
  if (metadata === undefined || metadata.transitionHead === undefined || metadata.transitionSequence < 1) {
    throw new RunStateCorruptError('transition revision 缺 canonical run head/sequence')
  }
  const transitionPath = join(
    changeDir, TRANSITION_RECORDS_DIR,
    `${String(metadata.transitionSequence).padStart(6, '0')}-${revision.mutation.transitionRecordId}.json`,
  )
  const transitionRaw = await readRegularTextIfExists(transitionPath)
  if (transitionRaw === undefined) {
    throw new RunStateCorruptError('transition revision 引用的 TransitionRecord 缺失')
  }
  let transition: unknown
  try {
    transition = JSON.parse(transitionRaw)
  } catch (error) {
    throw new RunStateCorruptError(`TransitionRecord 损坏: ${String(error)}`)
  }
  assertTransitionRevisionLink(revision, transition, transitionRaw, previous)
  return transition as TransitionRecord
}

export function projectionMetadataFor(revision: RunRevision): StateProjectionMetadata {
  return {
    stateRevision: revision.revision,
    stateRevisionId: revision.revisionId,
    stateDigest: revision.stateDigest,
  }
}

export async function publishInitialRunRevision(
  changeDir: string,
  state: PipelineState,
  observedAt: string,
  kind: 'init' | 'migration' = 'init',
): Promise<RunRevision> {
  const runDir = join(changeDir, RUN_STATE_DIR)
  const revisionsDir = join(runDir, RUN_REVISIONS_DIR)
  await mkdir(revisionsDir, { recursive: true })
  const revision = createRunRevision({
    state,
    revision: 0,
    mutation: { kind, observedAt, effects: [] },
  })
  await publishPreVerifyReviewRecord(changeDir, revision, state)
  const raw = serializeRunRevision(revision)
  await atomicLinkPublish(
    revisionsDir,
    '.tmp',
    join(revisionsDir, revisionFileName(revision.revision, revision.revisionId)),
    raw,
  )
  await atomicLinkPublish(runDir, '.current.tmp', join(runDir, RUN_CURRENT_FILE), raw)
  return revision
}

export async function publishRunRevision(
  changeDir: string,
  current: RunRevision,
  state: PipelineState,
  mutation: Omit<RunStateMutation, 'effects' | 'transitionRecordDigest'>,
): Promise<RunRevision> {
  const runDir = join(changeDir, RUN_STATE_DIR)
  const revisionsDir = join(runDir, RUN_REVISIONS_DIR)
  await mkdir(revisionsDir, { recursive: true })
  let transitionRaw: string | undefined
  let transition: unknown
  let mutationWithDigest: Omit<RunStateMutation, 'effects'> = mutation
  if (mutation.kind === 'transition') {
    const metadata = state.runMetadata
    if (metadata === undefined || metadata.transitionHead !== mutation.transitionRecordId
      || metadata.transitionSequence < 1) {
      throw new RunStateCorruptError('transition publish 缺匹配的 canonical run head/sequence')
    }
    const transitionPath = join(
      changeDir, TRANSITION_RECORDS_DIR,
      `${String(metadata.transitionSequence).padStart(6, '0')}-${mutation.transitionRecordId}.json`,
    )
    transitionRaw = await readRegularTextIfExists(transitionPath)
    if (transitionRaw === undefined) {
      throw new RunStateCorruptError('transition publish 引用的 TransitionRecord 缺失')
    }
    try {
      transition = JSON.parse(transitionRaw)
    } catch (error) {
      throw new RunStateCorruptError(`transition publish 的 TransitionRecord 损坏: ${String(error)}`)
    }
    mutationWithDigest = {
      ...mutation,
      transitionRecordDigest: createHash('sha256').update(transitionRaw).digest('hex'),
    }
  }
  const revision = createRunRevision({
    state,
    revision: current.revision + 1,
    previousRevisionId: current.revisionId,
    mutation: {
      ...mutationWithDigest,
      effects: diffWireFieldsToEffects(current.state.fields, state.fields),
    },
  })
  // Reject an invalid metadata/effects chain before publishing the companion or immutable bytes;
  // every successful publish must be readable by the same validator immediately.
  assertMutationEffects(revision, current)
  if (transitionRaw !== undefined) {
    assertTransitionRevisionLink(revision, transition, transitionRaw, current)
  }
  await publishPreVerifyReviewRecord(changeDir, revision, state)
  const raw = serializeRunRevision(revision)
  await atomicLinkPublish(
    revisionsDir,
    '.tmp',
    join(revisionsDir, revisionFileName(revision.revision, revision.revisionId)),
    raw,
  )
  await atomicReplaceFile(join(runDir, RUN_CURRENT_FILE), raw)
  return revision
}

export async function readCurrentRunRevision(changeDir: string): Promise<RunRevision | undefined> {
  const currentPath = join(changeDir, RUN_STATE_DIR, RUN_CURRENT_FILE)
  const raw = await readRegularTextIfExists(currentPath)
  if (raw === undefined) return undefined
  const current = await hydratePreVerifyReview(changeDir, parseRunRevision(raw, currentPath))
  const immutablePath = join(
    changeDir,
    RUN_STATE_DIR,
    RUN_REVISIONS_DIR,
    revisionFileName(current.revision, current.revisionId),
  )
  const immutableRaw = await readRegularTextIfExists(immutablePath)
  if (immutableRaw === undefined) {
    throw new RunStateCorruptError(`current 引用的 immutable revision 缺失: ${immutablePath}`)
  }
  await hydratePreVerifyReview(changeDir, parseRunRevision(immutableRaw, immutablePath))
  if (immutableRaw !== raw) throw new RunStateCorruptError('current 与 immutable revision 字节不一致')
  let previous: RunRevision | undefined
  if (current.revision > 0) {
    const previousRevisionId = previousRevisionIdFor(current)
    previous = await readImmutableRunRevision(
      changeDir, current.revision - 1, previousRevisionId,
    )
    if (previous === undefined) {
      throw new RunStateCorruptError('current 引用的 previous revision 缺失')
    }
    if (previous.revisionId !== previousRevisionId
      || previous.revision !== current.revision - 1) {
      throw new RunStateCorruptError('current 引用的 previous revision 身份不一致')
    }
    assertMutationEffects(current, previous)
  }
  await assertTransitionRecordFile(changeDir, current, previous)
  return current
}

/**
 * History/audit 冷路径使用的全链验证。普通 state read 只校验 current、自身 twin、直接 previous
 * 与 head record，保持 current 自包含读的 O(1) 特性；history 展示前才沿 immutable revision 链
 * 回溯，并验证每一代 previous/effects 与每条 transition record digest。
 */
export async function validateCanonicalRevisionHistory(changeDir: string): Promise<void> {
  let cursor = await readCurrentRunRevision(changeDir)
  if (cursor === undefined) return
  while (cursor.revision > 0) {
    const previousRevisionId = previousRevisionIdFor(cursor)
    const previous = await readImmutableRunRevision(
      changeDir, cursor.revision - 1, previousRevisionId,
    )
    if (previous === undefined) {
      throw new RunStateCorruptError(`canonical history revision ${cursor.revision - 1} 缺失`)
    }
    if (previous.revision !== cursor.revision - 1
      || previous.revisionId !== previousRevisionId) {
      throw new RunStateCorruptError('canonical history previous revision 身份不一致')
    }
    assertMutationEffects(cursor, previous)
    await assertTransitionRecordFile(changeDir, cursor, previous)
    cursor = previous
  }
}

/**
 * Resolve the current metadata head through the immutable revision that committed it, validating
 * the TransitionRecord bytes against that revision's anchored digest. Later set revisions may
 * preserve the head but can never make an unbound/mutated record authoritative.
 */
export async function readValidatedTransitionHead(
  changeDir: string,
): Promise<{ readonly current: RunRevision; readonly record: TransitionRecord } | undefined> {
  const current = await readCurrentRunRevision(changeDir)
  const metadata = current?.state.runMetadata
  if (current === undefined || metadata?.transitionHead === undefined
    || metadata.transitionSequence < 1) return undefined
  let cursor = current
  while (true) {
    if (cursor.revision === 0) {
      throw new RunStateCorruptError('canonical transition head 缺提交 revision')
    }
    const previousId = previousRevisionIdFor(cursor)
    const previous = await readImmutableRunRevision(changeDir, cursor.revision - 1, previousId)
    if (previous === undefined || previous.revisionId !== previousId) {
      throw new RunStateCorruptError('canonical transition head 回溯链损坏')
    }
    assertMutationEffects(cursor, previous)
    if (cursor.mutation.kind === 'transition'
      && cursor.mutation.transitionRecordId === metadata.transitionHead) {
      const record = await assertTransitionRecordFile(changeDir, cursor, previous)
      if (record === undefined || record.sequence !== metadata.transitionSequence
        || record.runId !== metadata.runId) {
        throw new RunStateCorruptError('canonical transition head 与提交 revision 不一致')
      }
      return { current, record }
    }
    cursor = previous
  }
}

async function readRegularTextIfExists(pathname: string): Promise<string | undefined> {
  let entry
  try {
    entry = await lstat(pathname)
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return undefined
    throw error
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new RunStateCorruptError(`${pathname}: canonical 文件必须是非 symlink 普通文件`)
  }
  try {
    return await readFile(pathname, 'utf8')
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      throw new RunStateCorruptError(`${pathname}: canonical 文件在校验期间消失`)
    }
    throw error
  }
}

function readTextSyncIfExists(pathname: string): string | undefined {
  let entry
  try {
    entry = lstatSync(pathname)
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return undefined
    throw error
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new RunStateCorruptError(`${pathname}: canonical 文件必须是非 symlink 普通文件`)
  }
  try {
    return readFileSync(pathname, 'utf8')
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      throw new RunStateCorruptError(`${pathname}: canonical 文件在校验期间消失`)
    }
    throw error
  }
}

/**
 * 同步消费者使用的完整 canonical reader。校验面与 async reader 相同：current schema/digest、
 * immutable twin、直接 previous revision、transition record linkage；current 缺失返回 undefined，
 * current 已存在但任一依赖损坏均 fail-loud。
 */
export type RunRevisionTextReader = (relativePath: string) => string | undefined

/**
 * 对受信任目录 fd 等自定义存储入口开放的同步 validator。reader 只接收受控相对路径；返回
 * undefined 表示该目录项不存在，其他 I/O/安全异常必须抛出。这样 server 可保留 O_NOFOLLOW
 * 边界，同时与普通路径 reader 共用完全相同的 canonical linkage 校验。
 */
export function readCurrentRunRevisionFromSync(
  readText: RunRevisionTextReader,
  sourceRoot = 'canonical state',
): RunRevision | undefined {
  const currentRel = join(RUN_STATE_DIR, RUN_CURRENT_FILE)
  const raw = readText(currentRel)
  if (raw === undefined) return undefined
  const currentSource = join(sourceRoot, currentRel)
  const current = hydratePreVerifyReviewFromSync(readText, parseRunRevision(raw, currentSource), sourceRoot)
  const revisionsRel = join(RUN_STATE_DIR, RUN_REVISIONS_DIR)
  const immutableRel = join(revisionsRel, revisionFileName(current.revision, current.revisionId))
  const immutableRaw = readText(immutableRel)
  if (immutableRaw === undefined) {
    throw new RunStateCorruptError(`current 引用的 immutable revision 缺失: ${join(sourceRoot, immutableRel)}`)
  }
  hydratePreVerifyReviewFromSync(
    readText,
    parseRunRevision(immutableRaw, join(sourceRoot, immutableRel)),
    sourceRoot,
  )
  if (immutableRaw !== raw) throw new RunStateCorruptError('current 与 immutable revision 字节不一致')
  let previous: RunRevision | undefined
  if (current.revision > 0) {
    const previousRevisionId = previousRevisionIdFor(current)
    const previousRel = join(
      revisionsRel,
      revisionFileName(current.revision - 1, previousRevisionId),
    )
    const previousRaw = readText(previousRel)
    if (previousRaw === undefined) throw new RunStateCorruptError('current 引用的 previous revision 缺失')
    previous = hydratePreVerifyReviewFromSync(
      readText,
      parseRunRevision(previousRaw, join(sourceRoot, previousRel)),
      sourceRoot,
    )
    if (previous.revisionId !== previousRevisionId
      || previous.revision !== current.revision - 1) {
      throw new RunStateCorruptError('current 引用的 previous revision 身份不一致')
    }
    assertMutationEffects(current, previous)
  }
  if (current.mutation.kind === 'transition') {
    const metadata = current.state.runMetadata
    if (metadata === undefined) {
      throw new RunStateCorruptError('transition revision 缺 canonical run metadata')
    }
    const transitionRel = join(
      TRANSITION_RECORDS_DIR,
      `${String(metadata.transitionSequence).padStart(6, '0')}-${current.mutation.transitionRecordId}.json`,
    )
    const transitionRaw = readText(transitionRel)
    if (transitionRaw === undefined) {
      throw new RunStateCorruptError('transition revision 引用的 TransitionRecord 缺失')
    }
    let transition: unknown
    try {
      transition = JSON.parse(transitionRaw)
    } catch (error) {
      throw new RunStateCorruptError(`TransitionRecord 损坏: ${String(error)}`)
    }
    assertTransitionRevisionLink(current, transition, transitionRaw, previous)
  }
  return current
}

export function readCurrentRunRevisionSync(changeDir: string): RunRevision | undefined {
  return readCurrentRunRevisionFromSync(
    (relativePath) => readTextSyncIfExists(join(changeDir, relativePath)),
    changeDir,
  )
}

export async function readImmutableRunRevision(
  changeDir: string,
  revision: number,
  revisionId: string,
): Promise<RunRevision | undefined> {
  if (!Number.isSafeInteger(revision) || revision < 0 || !SAFE_ID_RE.test(revisionId)) return undefined
  const pathname = join(changeDir, RUN_STATE_DIR, RUN_REVISIONS_DIR, revisionFileName(revision, revisionId))
  const raw = await readRegularTextIfExists(pathname)
  return raw === undefined
    ? undefined
    : hydratePreVerifyReview(changeDir, parseRunRevision(raw, pathname))
}
