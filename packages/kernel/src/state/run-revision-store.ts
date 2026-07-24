/**
 * G1 canonical WorkflowRun state.
 *
 * `.pipeline-run/current.json` is a self-contained copy of the committed revision. The matching
 * immutable file under `revisions/` must contain identical bytes. A current file that is malformed,
 * fails its digest, or lacks its immutable twin is corruption and never authorizes a YAML fallback.
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { lstat, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  FIELD_ORDER,
  LIST_FIELDS,
  REVIEW_GATE_FIELD_DEFAULTS,
  REVIEW_GATE_FIELDS,
  type FieldName,
  type PipelineState,
  type RunMetadata,
  type StateMutationKind,
  type StateProjectionMetadata,
} from '../types.js'
import type { StateFieldEffect } from '../workflow/run-types.js'
import { validateAutomationPolicySnapshot } from '../loops/automation-policy.js'
import { atomicLinkPublish, atomicReplaceFile } from './atomic-publish.js'
import { diffFieldsToEffects } from './run-metadata.js'
import { TRANSITION_RECORDS_DIR } from './transition-record-store.js'

export const RUN_STATE_DIR = '.pipeline-run'
export const RUN_CURRENT_FILE = 'current.json'
export const RUN_REVISIONS_DIR = 'revisions'

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
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const legacy = join(changeDir, '.pipeline.yaml')
  try {
    lstatSync(legacy)
    return legacy
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export function stateStorageExistsSync(changeDir: string): boolean {
  return stateStorageSourcePathSync(changeDir) !== undefined
}

const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/
const FIELD_SET = new Set<string>(FIELD_ORDER)
const LIST_FIELD_SET = new Set<string>(LIST_FIELDS)

export interface RunStateMutation {
  readonly kind: StateMutationKind
  readonly observedAt: string
  readonly effects: readonly StateFieldEffect[]
  readonly transitionRecordId?: string
  /** Exact SHA-256 of the immutable TransitionRecord bytes named above. */
  readonly transitionRecordDigest?: string
}

export interface RunHookState {
  readonly phase: string
  readonly workflow: string
  readonly track: string
  readonly archived: string
  readonly automation: string
}

export interface RunRevision {
  readonly schemaVersion: 1
  /** Hook keys deliberately precede the full state in compact JSON for pure-Bash readers. */
  readonly hookState: RunHookState
  readonly revision: number
  readonly revisionId: string
  readonly previousRevisionId?: string
  readonly state: PipelineState
  readonly mutation: RunStateMutation
  readonly stateDigest: string
}

export class RunStateCorruptError extends Error {
  readonly _tag = 'RunStateCorruptError'
}

function ownRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function stringField(fields: Record<FieldName, string | string[]>, field: FieldName): string {
  const value = fields[field]
  return Array.isArray(value) ? value.join(',') : value
}

export function hookStateFor(state: PipelineState): RunHookState {
  return {
    phase: stringField(state.fields, 'phase'),
    workflow: stringField(state.fields, 'workflow') || 'default',
    track: stringField(state.fields, 'track'),
    archived: stringField(state.fields, 'archived'),
    automation: stringField(state.fields, 'automation'),
  }
}

function canonicalRunMetadata(value: unknown): RunMetadata | undefined {
  if (value === undefined) return undefined
  const raw = ownRecord(value)
  if (!raw) throw new RunStateCorruptError('canonical state.runMetadata 不是对象')
  const allowed = new Set([
    'runId', 'transitionSequence', 'transitionHead', 'automationPolicy', 'loopId', 'iterationId',
  ])
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    throw new RunStateCorruptError('canonical state.runMetadata 含未知字段')
  }
  if (typeof raw.runId !== 'string' || raw.runId.length === 0
    || !Number.isSafeInteger(raw.transitionSequence) || (raw.transitionSequence as number) < 0
    || (raw.transitionHead !== undefined && typeof raw.transitionHead !== 'string')
    || (raw.loopId !== undefined && typeof raw.loopId !== 'string')
    || (raw.iterationId !== undefined && typeof raw.iterationId !== 'string')) {
    throw new RunStateCorruptError('canonical state.runMetadata 字段非法')
  }
  const automationPolicy = raw.automationPolicy === undefined
    ? undefined
    : validateAutomationPolicySnapshot(raw.automationPolicy)
  if ((raw.loopId === undefined) !== (raw.iterationId === undefined)) {
    throw new RunStateCorruptError('canonical governed identity 必须 loopId/iterationId 成对')
  }
  if (raw.loopId !== undefined && automationPolicy === undefined) {
    throw new RunStateCorruptError('canonical governed identity 缺 automationPolicy')
  }
  return {
    runId: raw.runId,
    transitionSequence: raw.transitionSequence as number,
    ...(raw.transitionHead === undefined ? {} : { transitionHead: raw.transitionHead as string }),
    ...(automationPolicy === undefined ? {} : { automationPolicy }),
    ...(raw.loopId === undefined ? {} : { loopId: raw.loopId as string, iterationId: raw.iterationId as string }),
  }
}

/**
 * Canonical schemaVersion stayed at 1 across two review-receipt additions:
 *
 * - pre-receipt revisions omitted the complete review-gate suffix;
 * - the next release wrote the four phase/status/timestamp fields but not the later exact-event
 *   binding field.
 *
 * The first shape is semantically an empty receipt. The second is safe only when all of its old
 * receipt fields are empty: a non-empty receipt without its exact outgoing event must remain
 * unreadable rather than being allowed to approve an arbitrary transition. New writes always
 * publish the complete current shape.
 */
function canonicalState(value: unknown, opts: { allowLegacyReviewGateOmission?: boolean } = {}): PipelineState {
  const raw = ownRecord(value)
  if (!raw || Object.keys(raw).some((key) => !['fields', 'runMetadata', 'opaqueTail'].includes(key))) {
    throw new RunStateCorruptError('canonical state 形状非法')
  }
  const rawFields = ownRecord(raw.fields)
  const rawKeys = rawFields ? Object.keys(rawFields) : []
  const missing = rawFields
    ? FIELD_ORDER.filter((field) => !Object.prototype.hasOwnProperty.call(rawFields, field))
    : []
  const missingReviewGateFields = REVIEW_GATE_FIELDS.filter((field) => missing.includes(field))
  const isCompleteReviewGateOmission = missingReviewGateFields.length === REVIEW_GATE_FIELDS.length
  const isEmptyFourFieldReceiptWithoutEvent = missingReviewGateFields.length === 1
    && missingReviewGateFields[0] === 'review_gate_event'
    && REVIEW_GATE_FIELDS
      .filter((field) => field !== 'review_gate_event')
      .every((field) => rawFields?.[field] === '')
  const legacyReviewGateDefaults = opts.allowLegacyReviewGateOmission === true
    && (isCompleteReviewGateOmission || isEmptyFourFieldReceiptWithoutEvent)
    ? new Set<FieldName>(missingReviewGateFields)
    : new Set<FieldName>()
  if (!rawFields || rawKeys.some((key) => !FIELD_SET.has(key))
    || (legacyReviewGateDefaults.size === 0 && missing.length !== 0)) {
    throw new RunStateCorruptError('canonical state.fields 不是 FIELD_ORDER 闭集')
  }
  const fields = {} as Record<FieldName, string | string[]>
  for (const field of FIELD_ORDER) {
    if (legacyReviewGateDefaults.has(field)) {
      fields[field] = REVIEW_GATE_FIELD_DEFAULTS[field as typeof REVIEW_GATE_FIELDS[number]]
      continue
    }
    const fieldValue = rawFields[field]
    if (typeof fieldValue === 'string') {
      fields[field] = fieldValue
    } else if (LIST_FIELD_SET.has(field) && Array.isArray(fieldValue)
      && fieldValue.every((item) => typeof item === 'string')) {
      fields[field] = [...fieldValue] as string[]
    } else {
      throw new RunStateCorruptError(`canonical state.fields.${field} 类型非法`)
    }
  }
  if (typeof raw.opaqueTail !== 'string') throw new RunStateCorruptError('canonical opaqueTail 非 string')
  return {
    fields,
    ...(raw.runMetadata === undefined ? {} : { runMetadata: canonicalRunMetadata(raw.runMetadata) }),
    opaqueTail: raw.opaqueTail,
  }
}

function canonicalEffect(value: unknown, index: number): StateFieldEffect {
  const raw = ownRecord(value)
  if (!raw || Object.keys(raw).sort().join(',') !== 'field,from,kind,to'
    || raw.kind !== 'state-field-change'
    || typeof raw.field !== 'string' || !FIELD_SET.has(raw.field)) {
    throw new RunStateCorruptError(`canonical mutation.effects[${index}] shape 非法`)
  }
  const field = raw.field as FieldName
  const valueAt = (candidate: unknown, side: 'from' | 'to'): string | readonly string[] => {
    if (typeof candidate === 'string') return candidate
    if (LIST_FIELD_SET.has(field) && Array.isArray(candidate)
      && candidate.every((item) => typeof item === 'string')) return [...candidate] as string[]
    throw new RunStateCorruptError(`canonical mutation.effects[${index}].${side} 类型非法`)
  }
  return {
    kind: 'state-field-change',
    field,
    from: valueAt(raw.from, 'from'),
    to: valueAt(raw.to, 'to'),
  }
}

function revisionBody(input: Omit<RunRevision, 'stateDigest'>): Omit<RunRevision, 'stateDigest'> {
  return {
    schemaVersion: 1,
    hookState: input.hookState,
    revision: input.revision,
    revisionId: input.revisionId,
    ...(input.previousRevisionId === undefined ? {} : { previousRevisionId: input.previousRevisionId }),
    state: input.state,
    mutation: input.mutation,
  }
}

function digestBody(body: Omit<RunRevision, 'stateDigest'>): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export function createRunRevision(input: {
  readonly state: PipelineState
  readonly revision: number
  readonly previousRevisionId?: string
  readonly mutation: RunStateMutation
  readonly revisionId?: string
}): RunRevision {
  // TypeScript 的必填字段不是运行时信任边界。JS 调用方、旧测试夹具或反序列化输入都可能把
  // undefined 塞进 `Record<FieldName, ...>`；若直接 JSON.stringify，undefined 键会被静默丢弃，
  // 造成 publish 报成功、下一次 read 却因字段闭集不完整而永久失败。发布前先走与读取端同一份
  // closed-schema 规范化，保证任何成功写出的 revision 都能被本实现重新读取。
  const state = canonicalState({
    fields: structuredClone(input.state.fields),
    ...(input.state.runMetadata === undefined ? {} : { runMetadata: structuredClone(input.state.runMetadata) }),
    opaqueTail: input.state.opaqueTail,
  })
  const body = revisionBody({
    schemaVersion: 1,
    hookState: hookStateFor(state),
    revision: input.revision,
    revisionId: input.revisionId ?? randomUUID(),
    ...(input.previousRevisionId === undefined ? {} : { previousRevisionId: input.previousRevisionId }),
    state,
    mutation: input.mutation,
  })
  return { ...body, stateDigest: digestBody(body) }
}

function parseRunRevision(raw: string, source: string): RunRevision {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new RunStateCorruptError(`${source}: JSON 损坏（${String(error)}）`)
  }
  const record = ownRecord(value)
  if (!record || Object.keys(record).some((key) => ![
    'schemaVersion', 'hookState', 'revision', 'revisionId', 'previousRevisionId',
    'state', 'mutation', 'stateDigest',
  ].includes(key))) throw new RunStateCorruptError(`${source}: 顶层字段闭集非法`)
  const hook = ownRecord(record.hookState)
  const mutation = ownRecord(record.mutation)
  if (record.schemaVersion !== 1
    || !Number.isSafeInteger(record.revision) || (record.revision as number) < 0
    || typeof record.revisionId !== 'string' || !SAFE_ID_RE.test(record.revisionId)
    || ((record.revision === 0) !== (record.previousRevisionId === undefined))
    || (record.previousRevisionId !== undefined
      && (typeof record.previousRevisionId !== 'string' || !SAFE_ID_RE.test(record.previousRevisionId)))
    || typeof record.stateDigest !== 'string' || !/^[0-9a-f]{64}$/.test(record.stateDigest)
    || !hook || Object.keys(hook).sort().join(',') !== 'archived,automation,phase,track,workflow'
    || Object.values(hook).some((item) => typeof item !== 'string')
    || !mutation || Object.keys(mutation).some((key) => ![
      'kind', 'observedAt', 'effects', 'transitionRecordId', 'transitionRecordDigest',
    ].includes(key))
    || !['init', 'migration', 'replace', 'set', 'set-many', 'cas', 'cas-many', 'automation', 'transition', 'legacy-import']
      .includes(String(mutation.kind))
    || typeof mutation.observedAt !== 'string'
    || !Array.isArray(mutation.effects)
    || (mutation.transitionRecordId !== undefined
      && (typeof mutation.transitionRecordId !== 'string' || !SAFE_ID_RE.test(mutation.transitionRecordId)))
    || (mutation.transitionRecordDigest !== undefined
      && (typeof mutation.transitionRecordDigest !== 'string'
        || !/^[0-9a-f]{64}$/.test(mutation.transitionRecordDigest)))) {
    throw new RunStateCorruptError(`${source}: canonical revision 字段非法`)
  }
  // 摘要绑定的是发布时的精确 JSON body（包括嵌套对象键序）。先对原始 JSON.parse 结果复算，
  // 再做下面的 closed-schema 规范化；不能拿规范化后的 automation policy 等对象复算，否则
  // 合法内容仅因 validator 重建了键序就会被误判为损坏。
  const { stateDigest: _rawDigest, ...rawBody } = record
  const observedDigest = createHash('sha256').update(JSON.stringify(rawBody)).digest('hex')
  if (observedDigest !== record.stateDigest) {
    throw new RunStateCorruptError(`${source}: digest 不匹配`)
  }
  const state = canonicalState(record.state, { allowLegacyReviewGateOmission: true })
  const effects = mutation.effects.map(canonicalEffect)
  const transitionRecordId = mutation.transitionRecordId as string | undefined
  const transitionRecordDigest = mutation.transitionRecordDigest as string | undefined
  const isTransition = mutation.kind === 'transition'
  const isInitial = mutation.kind === 'init' || mutation.kind === 'migration'
  if ((record.revision === 0) !== isInitial
    || (record.revision === 0 && effects.length !== 0)) {
    throw new RunStateCorruptError(`${source}: revision 0 与 init/migration 空 effects 必须成对`)
  }
  if (isTransition !== (transitionRecordId !== undefined && transitionRecordDigest !== undefined)) {
    throw new RunStateCorruptError(
      `${source}: transition mutation 与 transitionRecordId/transitionRecordDigest 必须成对`,
    )
  }
  if (isTransition && state.runMetadata?.transitionHead !== transitionRecordId) {
    throw new RunStateCorruptError(`${source}: transitionRecordId 与 state transitionHead 不一致`)
  }
  const parsed: RunRevision = {
    schemaVersion: 1,
    hookState: hook as unknown as RunHookState,
    revision: record.revision as number,
    revisionId: record.revisionId,
    ...(record.previousRevisionId === undefined ? {} : { previousRevisionId: record.previousRevisionId as string }),
    state,
    mutation: {
      kind: mutation.kind as StateMutationKind,
      observedAt: mutation.observedAt as string,
      effects,
      ...(transitionRecordId === undefined ? {} : { transitionRecordId }),
      ...(transitionRecordDigest === undefined ? {} : { transitionRecordDigest }),
    },
    stateDigest: record.stateDigest,
  }
  if (JSON.stringify(parsed.hookState) !== JSON.stringify(hookStateFor(state))) {
    throw new RunStateCorruptError(`${source}: hookState 与完整 state 不一致`)
  }
  return parsed
}

function revisionFileName(revision: number, revisionId: string): string {
  return `${String(revision).padStart(6, '0')}-${revisionId}.json`
}

function assertTransitionRevisionLink(current: RunRevision, transition: unknown, raw: string): void {
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
    || JSON.stringify(record.effects) !== JSON.stringify(current.mutation.effects)) {
    throw new RunStateCorruptError('transition revision 与 TransitionRecord 不一致')
  }
}

function assertMutationEffects(current: RunRevision, previous: RunRevision): void {
  const expected = diffFieldsToEffects(previous.state.fields, current.state.fields)
  if (JSON.stringify(current.mutation.effects) !== JSON.stringify(expected)) {
    throw new RunStateCorruptError('canonical mutation.effects 与 previous→current 真实 diff 不一致')
  }
}

async function assertTransitionRecordFile(changeDir: string, revision: RunRevision): Promise<void> {
  if (revision.mutation.kind !== 'transition') return
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
  assertTransitionRevisionLink(revision, transition, transitionRaw)
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
  const raw = JSON.stringify(revision)
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
      effects: diffFieldsToEffects(current.state.fields, state.fields),
    },
  })
  if (transitionRaw !== undefined) assertTransitionRevisionLink(revision, transition, transitionRaw)
  const raw = JSON.stringify(revision)
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
  const current = parseRunRevision(raw, currentPath)
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
  parseRunRevision(immutableRaw, immutablePath)
  if (immutableRaw !== raw) throw new RunStateCorruptError('current 与 immutable revision 字节不一致')
  if (current.revision > 0) {
    const previous = await readImmutableRunRevision(
      changeDir, current.revision - 1, current.previousRevisionId!,
    )
    if (previous === undefined) {
      throw new RunStateCorruptError('current 引用的 previous revision 缺失')
    }
    if (previous.revisionId !== current.previousRevisionId
      || previous.revision !== current.revision - 1) {
      throw new RunStateCorruptError('current 引用的 previous revision 身份不一致')
    }
    assertMutationEffects(current, previous)
  }
  await assertTransitionRecordFile(changeDir, current)
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
    const previous = await readImmutableRunRevision(
      changeDir, cursor.revision - 1, cursor.previousRevisionId!,
    )
    if (previous === undefined) {
      throw new RunStateCorruptError(`canonical history revision ${cursor.revision - 1} 缺失`)
    }
    if (previous.revision !== cursor.revision - 1
      || previous.revisionId !== cursor.previousRevisionId) {
      throw new RunStateCorruptError('canonical history previous revision 身份不一致')
    }
    assertMutationEffects(cursor, previous)
    await assertTransitionRecordFile(changeDir, previous)
    cursor = previous
  }
}

async function readRegularTextIfExists(pathname: string): Promise<string | undefined> {
  let entry
  try {
    entry = await lstat(pathname)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new RunStateCorruptError(`${pathname}: canonical 文件必须是非 symlink 普通文件`)
  }
  try {
    return await readFile(pathname, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new RunStateCorruptError(`${pathname}: canonical 文件必须是非 symlink 普通文件`)
  }
  try {
    return readFileSync(pathname, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
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
  const current = parseRunRevision(raw, currentSource)
  const revisionsRel = join(RUN_STATE_DIR, RUN_REVISIONS_DIR)
  const immutableRel = join(revisionsRel, revisionFileName(current.revision, current.revisionId))
  const immutableRaw = readText(immutableRel)
  if (immutableRaw === undefined) {
    throw new RunStateCorruptError(`current 引用的 immutable revision 缺失: ${join(sourceRoot, immutableRel)}`)
  }
  parseRunRevision(immutableRaw, join(sourceRoot, immutableRel))
  if (immutableRaw !== raw) throw new RunStateCorruptError('current 与 immutable revision 字节不一致')
  if (current.revision > 0) {
    const previousRel = join(
      revisionsRel,
      revisionFileName(current.revision - 1, current.previousRevisionId!),
    )
    const previousRaw = readText(previousRel)
    if (previousRaw === undefined) throw new RunStateCorruptError('current 引用的 previous revision 缺失')
    const previous = parseRunRevision(previousRaw, join(sourceRoot, previousRel))
    if (previous.revisionId !== current.previousRevisionId
      || previous.revision !== current.revision - 1) {
      throw new RunStateCorruptError('current 引用的 previous revision 身份不一致')
    }
    assertMutationEffects(current, previous)
  }
  if (current.mutation.kind === 'transition') {
    const metadata = current.state.runMetadata!
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
    assertTransitionRevisionLink(current, transition, transitionRaw)
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
  return raw === undefined ? undefined : parseRunRevision(raw, pathname)
}
