import { createHash, randomUUID } from 'node:crypto'
import {
  FIELD_ORDER,
  LIST_FIELDS,
  REVIEW_GATE_FIELD_DEFAULTS,
  REVIEW_GATE_FIELDS,
  type FieldName,
  type PipelineState,
  type RunMetadata,
  type StateMutationKind,
} from '../types.js'
import type { StateFieldEffect } from '../workflow/run-types.js'
import { validateAutomationPolicySnapshot } from '../loops/automation-policy.js'
import { diffFieldsToEffects } from './run-metadata.js'

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
  return Object.fromEntries(Object.entries(value))
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
    'runId', 'transitionSequence', 'transitionHead', 'automationPolicy', 'loopId', 'iterationId', 'documentProfile',
    'documentGovernanceFingerprint', 'workflowPlanFingerprint',
  ])
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    throw new RunStateCorruptError('canonical state.runMetadata 含未知字段')
  }
  if (typeof raw.runId !== 'string' || raw.runId.length === 0
    || !Number.isSafeInteger(raw.transitionSequence) || (raw.transitionSequence as number) < 0
    || (raw.transitionHead !== undefined && typeof raw.transitionHead !== 'string')
    || (raw.documentProfile !== undefined
      && raw.documentProfile !== 'legacy-full'
      && raw.documentProfile !== 'document-v1')
    || (raw.documentGovernanceFingerprint !== undefined
      && (typeof raw.documentGovernanceFingerprint !== 'string'
        || !/^[0-9a-f]{64}$/.test(raw.documentGovernanceFingerprint)))
    || (raw.workflowPlanFingerprint !== undefined
      && (typeof raw.workflowPlanFingerprint !== 'string'
        || !/^[0-9a-f]{64}$/.test(raw.workflowPlanFingerprint)))
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
  if (raw.documentGovernanceFingerprint !== undefined && raw.documentProfile === undefined) {
    throw new RunStateCorruptError('canonical document governance fingerprint 缺 profile')
  }
  return {
    runId: raw.runId,
    transitionSequence: raw.transitionSequence as number,
    ...(raw.transitionHead === undefined ? {} : { transitionHead: raw.transitionHead as string }),
    ...(raw.documentProfile === undefined ? {} : { documentProfile: raw.documentProfile }),
    ...(raw.documentGovernanceFingerprint === undefined
      ? {}
      : { documentGovernanceFingerprint: raw.documentGovernanceFingerprint as string }),
    ...(raw.workflowPlanFingerprint === undefined
      ? {}
      : { workflowPlanFingerprint: raw.workflowPlanFingerprint as string }),
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

export function parseRunRevision(raw: string, source: string): RunRevision {
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
    || typeof record.revision !== 'number' || !Number.isSafeInteger(record.revision) || record.revision < 0
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
  const phase = hook.phase
  const workflow = hook.workflow
  const track = hook.track
  const archived = hook.archived
  const automation = hook.automation
  if (typeof phase !== 'string' || typeof workflow !== 'string' || typeof track !== 'string'
    || typeof archived !== 'string' || typeof automation !== 'string') {
    throw new RunStateCorruptError(`${source}: hookState 字段非法`)
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
  const transitionRecordId = typeof mutation.transitionRecordId === 'string'
    ? mutation.transitionRecordId
    : undefined
  const transitionRecordDigest = typeof mutation.transitionRecordDigest === 'string'
    ? mutation.transitionRecordDigest
    : undefined
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
    hookState: { phase, workflow, track, archived, automation },
    revision: record.revision,
    revisionId: record.revisionId,
    ...(typeof record.previousRevisionId === 'string' ? { previousRevisionId: record.previousRevisionId } : {}),
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
