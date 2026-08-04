import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { readCurrentRunRevision } from '../state/run-revision-store.js'
import { readDocumentLedger } from '../state/document-ledger.js'
import { readBoundedRegularFile, readOptionalBoundedRegularTextFile } from '../state/document-path.js'
import { withLock } from '../state/lock.js'
import { readTaskPlanForChange } from '../state/task-plan-store.js'
import { decodeSkillInvocationEventV1, encodeSkillInvocationEventV1 } from './codec.js'
import { projectSkillInvocationEvents } from './domain.js'
import {
  SKILL_INVOCATION_LIMITS,
  type SkillInvocationArtifactBoundPayloadV1,
  type SkillInvocationArtifactIntentPayloadV1,
  type SkillInvocationDecisionPayloadV1,
  type SkillInvocationEventV1,
  type SkillInvocationListReadModelV1,
  type SkillInvocationQuestionPayloadV1,
  type SkillInvocationSubjectV1,
} from './types.js'

export const SKILL_INVOCATION_LEDGER_FILE = '.pipeline-skill-invocations.jsonl'

export class SkillInvocationEvidenceCorruptError extends Error {
  override readonly name = 'SkillInvocationEvidenceCorruptError'
}

export class SkillInvocationEvidenceBindingError extends Error {
  override readonly name = 'SkillInvocationEvidenceBindingError'
}

interface SkillInvocationBindingContextV1 {
  readonly project_id: string
  readonly workflow_definition_id: string
  readonly workflow_run_id: string
  readonly step_id: string
  readonly transition_sequence: number
  readonly task_plan_revision_id?: string
  readonly work_item_ids: readonly string[]
  readonly attempt?: { readonly attempt_id: string; readonly reservation_id: string }
}

export interface SkillInvocationRecommendedDefaultVerificationContextV1 {
  readonly decision: SkillInvocationDecisionPayloadV1
  readonly question: SkillInvocationQuestionPayloadV1
  readonly started: Extract<SkillInvocationEventV1, { type: 'invocation-started' }>
  readonly subject: SkillInvocationSubjectV1
  readonly events: readonly SkillInvocationEventV1[]
}

export interface SkillInvocationCompletionVerificationContextV1 {
  readonly completion: Extract<SkillInvocationEventV1, { type: 'invocation-completed' }>
  readonly started: Extract<SkillInvocationEventV1, { type: 'invocation-started' }>
  readonly subject: SkillInvocationSubjectV1
  readonly events: readonly SkillInvocationEventV1[]
}

export interface AppendSkillInvocationEventOptions {
  readonly attempt?: { readonly attempt_id: string; readonly reservation_id: string }
  readonly verify_recommended_default?: (
    context: SkillInvocationRecommendedDefaultVerificationContextV1,
  ) => Promise<boolean>
  readonly verify_completed_adapter?: (context: SkillInvocationCompletionVerificationContextV1) => Promise<boolean>
  readonly verify_interruption_recovery?: (
    event: Extract<SkillInvocationEventV1, { type: 'invocation-interrupted' }>,
  ) => Promise<boolean>
  readonly verify_artifact?: (
    intent: SkillInvocationArtifactIntentPayloadV1,
    binding: SkillInvocationArtifactBoundPayloadV1,
  ) => Promise<boolean>
}

function stringField(value: string | readonly string[] | undefined, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback
}

export async function skillInvocationProjectId(repoRoot: string): Promise<string> {
  const canonicalRoot = await realpath(repoRoot)
  return `project:${createHash('sha256').update(canonicalRoot).digest('hex')}`
}

async function canonicalBinding(
  changeDir: string,
  attempt: AppendSkillInvocationEventOptions['attempt'],
): Promise<SkillInvocationBindingContextV1> {
  const current = await readCurrentRunRevision(changeDir)
  const metadata = current?.state.runMetadata
  if (current === undefined || metadata === undefined) {
    throw new SkillInvocationEvidenceBindingError('canonical WorkflowRun identity is missing')
  }
  const workflowDefinitionId = stringField(current.state.fields.workflow, '')
  const stepId = stringField(current.state.fields.phase, '')
  if (workflowDefinitionId === '' || stepId === '') {
    throw new SkillInvocationEvidenceBindingError('canonical WorkflowDefinition or Step identity is missing')
  }
  const repoRoot = resolve(changeDir, '..', '..', '..')
  const plan = await readTaskPlanForChange(changeDir)
  return {
    project_id: await skillInvocationProjectId(repoRoot),
    workflow_definition_id: workflowDefinitionId,
    workflow_run_id: metadata.runId,
    step_id: stepId,
    transition_sequence: metadata.transitionSequence,
    ...(plan?.source === 'canonical' ? { task_plan_revision_id: plan.revision_id } : {}),
    work_item_ids: plan?.source === 'canonical' ? plan.items.map((item) => item.id) : [],
    ...(attempt === undefined ? {} : { attempt: { ...attempt } }),
  }
}

function assertBinding(event: SkillInvocationEventV1, expected: SkillInvocationBindingContextV1): void {
  const subject = event.subject
  if (
    subject.project_id !== expected.project_id
    || subject.workflow_definition_id !== expected.workflow_definition_id
    || subject.workflow_run_id !== expected.workflow_run_id
    || subject.step_id !== expected.step_id
    || subject.step_visit.run_id !== expected.workflow_run_id
    || subject.step_visit.transition_sequence !== expected.transition_sequence
  ) throw new SkillInvocationEvidenceBindingError('event subject does not match the canonical StepVisit')
  if (subject.work_item_id !== undefined) {
    if (
      subject.task_plan_revision_id !== expected.task_plan_revision_id
      || !expected.work_item_ids.includes(subject.work_item_id)
    ) throw new SkillInvocationEvidenceBindingError('event subject does not match the canonical TaskPlan WorkItem')
  }
  if (subject.attempt !== undefined) {
    if (
      expected.attempt === undefined
      || subject.attempt.attempt_id !== expected.attempt.attempt_id
      || subject.attempt.reservation_id !== expected.attempt.reservation_id
    ) throw new SkillInvocationEvidenceBindingError('event subject does not match the execution attempt')
  }
  if (event.type === 'invocation-started' && event.payload.adapter.kind === 'afk' && subject.attempt === undefined) {
    throw new SkillInvocationEvidenceBindingError('AFK invocation requires exact attempt and reservation binding')
  }
}

function ledgerPath(changeDir: string): string {
  return join(changeDir, SKILL_INVOCATION_LEDGER_FILE)
}

async function readLedgerEvents(changeDir: string): Promise<SkillInvocationEventV1[]> {
  let raw: string | undefined
  try {
    raw = await readOptionalBoundedRegularTextFile(
      ledgerPath(changeDir),
      SKILL_INVOCATION_LIMITS.maxLedgerBytes,
      'SkillInvocation evidence ledger',
    )
  } catch (cause) {
    throw new SkillInvocationEvidenceCorruptError(`SkillInvocation ledger cannot be read: ${String(cause)}`)
  }
  if (raw === undefined || raw === '') return []
  const lines = raw.split('\n')
  if (lines.at(-1) !== '') throw new SkillInvocationEvidenceCorruptError('SkillInvocation ledger has an incomplete final line')
  lines.pop()
  if (lines.length > SKILL_INVOCATION_LIMITS.maxEvents) throw new SkillInvocationEvidenceCorruptError('SkillInvocation ledger exceeds event budget')
  return lines.map((line, index) => {
    const decoded = decodeSkillInvocationEventV1(line)
    if (!decoded.ok) {
      throw new SkillInvocationEvidenceCorruptError(`SkillInvocation ledger line ${index + 1} is invalid: ${decoded.code} ${decoded.path}`)
    }
    return decoded.value
  })
}

interface LedgerIdentity {
  readonly dev: number
  readonly ino: number
  readonly size: number
}

async function captureLedgerIdentity(path: string): Promise<LedgerIdentity | undefined> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new SkillInvocationEvidenceCorruptError('SkillInvocation ledger must be a regular file')
    }
    return { dev: info.dev, ino: info.ino, size: info.size }
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && Reflect.get(cause, 'code') === 'ENOENT') return undefined
    if (cause instanceof SkillInvocationEvidenceCorruptError) throw cause
    throw new SkillInvocationEvidenceCorruptError(`SkillInvocation ledger identity cannot be read: ${String(cause)}`)
  }
}

function sameLedgerIdentity(actual: LedgerIdentity | undefined, expected: LedgerIdentity | undefined): boolean {
  return actual === undefined || expected === undefined
    ? actual === expected
    : actual.dev === expected.dev && actual.ino === expected.ino && actual.size === expected.size
}

async function assertLedgerIdentity(path: string, expected: LedgerIdentity | undefined): Promise<void> {
  if (!sameLedgerIdentity(await captureLedgerIdentity(path), expected)) {
    throw new SkillInvocationEvidenceCorruptError('SkillInvocation ledger identity changed during the transaction')
  }
}

function grouped(events: readonly SkillInvocationEventV1[]): Map<string, SkillInvocationEventV1[]> {
  const result = new Map<string, SkillInvocationEventV1[]>()
  for (const event of events) {
    const bucket = result.get(event.invocation_id) ?? []
    bucket.push(event)
    result.set(event.invocation_id, bucket)
  }
  if (result.size > SKILL_INVOCATION_LIMITS.maxInvocations) throw new SkillInvocationEvidenceCorruptError('SkillInvocation ledger exceeds invocation budget')
  return result
}

async function appendFsync(path: string, line: string, expected: LedgerIdentity | undefined): Promise<void> {
  const flags = expected === undefined
    ? constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
    : constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW
  let handle
  try {
    handle = await open(path, flags, 0o600)
  } catch (cause) {
    throw new SkillInvocationEvidenceCorruptError(`SkillInvocation ledger changed before append: ${String(cause)}`)
  }
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new SkillInvocationEvidenceCorruptError('SkillInvocation ledger must be a regular file')
    const openedIdentity = { dev: info.dev, ino: info.ino, size: info.size }
    if ((expected === undefined && info.size !== 0) || (expected !== undefined && !sameLedgerIdentity(openedIdentity, expected))) {
      throw new SkillInvocationEvidenceCorruptError('SkillInvocation ledger identity changed before append')
    }
    await handle.writeFile(line, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function inside(base: string, candidate: string): boolean {
  const fromBase = relative(base, candidate)
  return fromBase !== '' && fromBase !== '..' && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase)
}

async function verifyFileArtifact(changeDir: string, intent: SkillInvocationArtifactIntentPayloadV1): Promise<boolean> {
  const repoRoot = resolve(changeDir, '..', '..', '..')
  const target = resolve(repoRoot, intent.artifact.ref)
  if (!inside(repoRoot, target)) return false
  const [rootReal, targetReal, info] = await Promise.all([realpath(repoRoot), realpath(target), lstat(target)])
  if (!info.isFile() || info.isSymbolicLink() || !inside(rootReal, targetReal)) return false
  const bytes = await readBoundedRegularFile(target, SKILL_INVOCATION_LIMITS.maxLedgerBytes, 'SkillInvocation artifact')
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}` === intent.artifact.digest
}

async function verifyDocumentArtifact(changeDir: string, intent: SkillInvocationArtifactIntentPayloadV1): Promise<boolean> {
  const document = intent.artifact.document
  if (document === undefined) return false
  const ledger = await readDocumentLedger(changeDir)
  return ledger?.records.some((record) =>
    record.kind === document.kind
    && record.path === intent.artifact.ref
    && record.recordedAt === document.recorded_at
    && `sha256:${record.sha256}` === intent.artifact.digest) ?? false
}

async function verifyArtifact(
  changeDir: string,
  intent: SkillInvocationArtifactIntentPayloadV1,
  binding: SkillInvocationArtifactBoundPayloadV1,
  options: AppendSkillInvocationEventOptions,
): Promise<boolean> {
  if (intent.artifact.kind === 'document') {
    if (!await verifyDocumentArtifact(changeDir, intent)) return false
    if (intent.validator_ids.every((id) => id === 'document-ledger')) return true
  } else if (intent.artifact.kind === 'file') {
    if (!await verifyFileArtifact(changeDir, intent)) return false
    if (intent.validator_ids.every((id) => id === 'digest')) return true
  }
  return options.verify_artifact?.(structuredClone(intent), structuredClone(binding)) ?? Promise.resolve(false)
}

function validateExistingLedger(events: readonly SkillInvocationEventV1[]): void {
  try {
    for (const invocationEvents of grouped(events).values()) projectSkillInvocationEvents(invocationEvents)
  } catch (cause) {
    if (cause instanceof SkillInvocationEvidenceCorruptError) throw cause
    throw new SkillInvocationEvidenceCorruptError(`SkillInvocation ledger violates aggregate invariants: ${String(cause)}`)
  }
}

export async function readSkillInvocationEventsForApplication(
  changeDir: string,
): Promise<readonly SkillInvocationEventV1[]> {
  const identity = await captureLedgerIdentity(ledgerPath(changeDir))
  const events = await readLedgerEvents(changeDir)
  await assertLedgerIdentity(ledgerPath(changeDir), identity)
  validateExistingLedger(events)
  return structuredClone(events)
}

function validateResultingLedger(events: readonly SkillInvocationEventV1[]): void {
  if (events.length > SKILL_INVOCATION_LIMITS.maxEvents) {
    throw new SkillInvocationEvidenceBindingError('SkillInvocation ledger would exceed the event budget')
  }
  try {
    for (const invocationEvents of grouped(events).values()) projectSkillInvocationEvents(invocationEvents)
  } catch (cause) {
    if (cause instanceof SkillInvocationEvidenceBindingError) throw cause
    throw new SkillInvocationEvidenceBindingError(`SkillInvocation event violates aggregate invariants: ${String(cause)}`)
  }
}

function startedEvent(
  events: readonly SkillInvocationEventV1[],
): Extract<SkillInvocationEventV1, { type: 'invocation-started' }> {
  const started = events.find((event): event is Extract<SkillInvocationEventV1, { type: 'invocation-started' }> =>
    event.type === 'invocation-started')
  if (started === undefined) throw new SkillInvocationEvidenceBindingError('invocation started event is missing')
  return started
}

function intentFor(
  events: readonly SkillInvocationEventV1[],
  event: Extract<SkillInvocationEventV1, { type: 'artifact-bound' }>,
): SkillInvocationArtifactIntentPayloadV1 | undefined {
  const intent = events.find((candidate): candidate is Extract<SkillInvocationEventV1, { type: 'artifact-binding-intent' }> =>
    candidate.invocation_id === event.invocation_id
    && candidate.type === 'artifact-binding-intent'
    && candidate.payload.binding_id === event.payload.binding_id)
  return intent?.payload
}

export interface SkillInvocationChangeLock {
  readonly kind: 'skill-invocation-change-lock'
}

const activeChangeLocks = new WeakMap<SkillInvocationChangeLock, string>()

export async function withSkillInvocationChangeLock<T>(
  changeDir: string,
  operation: (lock: SkillInvocationChangeLock) => Promise<T>,
): Promise<T> {
  return withLock(changeDir, async () => {
    const lock: SkillInvocationChangeLock = Object.freeze({ kind: 'skill-invocation-change-lock' })
    activeChangeLocks.set(lock, changeDir)
    try {
      return await operation(lock)
    } finally {
      activeChangeLocks.delete(lock)
    }
  })
}

async function appendSkillInvocationEventWithLockHeld(
  changeDir: string,
  input: SkillInvocationEventV1,
  options: AppendSkillInvocationEventOptions,
): Promise<{ readonly appended: boolean }> {
  const identity = await captureLedgerIdentity(ledgerPath(changeDir))
  const events = await readLedgerEvents(changeDir)
  await assertLedgerIdentity(ledgerPath(changeDir), identity)
  validateExistingLedger(events)
  const replay = events.find((event) => event.event_id === input.event_id)
  if (replay !== undefined) {
    if (encodeSkillInvocationEventV1(replay) === encodeSkillInvocationEventV1(input)) {
      await assertLedgerIdentity(ledgerPath(changeDir), identity)
      return { appended: false }
    }
    throw new SkillInvocationEvidenceCorruptError('event id conflicts with an existing fact')
  }
  const expected = await canonicalBinding(changeDir, options.attempt)
  assertBinding(input, expected)
  const invocationEvents = events.filter((event) => event.invocation_id === input.invocation_id)
  const resultingEvents = [...events, input]
  const encodedLine = `${encodeSkillInvocationEventV1(input)}\n`
  if ((identity?.size ?? 0) + Buffer.byteLength(encodedLine) > SKILL_INVOCATION_LIMITS.maxLedgerBytes) {
    throw new SkillInvocationEvidenceBindingError('SkillInvocation ledger would exceed the byte budget')
  }
  validateResultingLedger(resultingEvents)
  const invocationStarted = startedEvent(
    input.type === 'invocation-started' ? [input] : invocationEvents,
  )
  if (input.type === 'decision-recorded' && input.payload.mode === 'recommended-default') {
    const decisionEvent = input
    const question = invocationEvents.find((event): event is Extract<SkillInvocationEventV1, { type: 'question-recorded' }> =>
      event.type === 'question-recorded' && event.payload.question_id === decisionEvent.payload.question_id)
    if (question === undefined || !await (options.verify_recommended_default?.({
      decision: structuredClone(decisionEvent.payload),
      question: structuredClone(question.payload),
      started: structuredClone(invocationStarted),
      subject: structuredClone(decisionEvent.subject),
      events: structuredClone(invocationEvents),
    }) ?? Promise.resolve(false))) {
      throw new SkillInvocationEvidenceBindingError('recommended default is not allowed by the exact frozen policy')
    }
  }
  if (
    input.type === 'invocation-completed'
    && !await (options.verify_completed_adapter?.({
      completion: structuredClone(input),
      started: structuredClone(invocationStarted),
      subject: structuredClone(input.subject),
      events: structuredClone(invocationEvents),
    }) ?? Promise.resolve(false))
  ) {
    throw new SkillInvocationEvidenceBindingError('completed invocation lacks a trusted adapter verdict')
  }
  if (
    input.type === 'invocation-interrupted'
    && !await (options.verify_interruption_recovery?.(structuredClone(input)) ?? Promise.resolve(false))
  ) {
    throw new SkillInvocationEvidenceBindingError('interrupted invocation lacks exact ownership recovery')
  }
  if (input.type === 'artifact-bound') {
    const intent = intentFor(events, input)
    if (intent === undefined || !await verifyArtifact(changeDir, intent, input.payload, options)) {
      throw new SkillInvocationEvidenceBindingError('artifact binding does not match the current artifact or canonical document record')
    }
  }
  await appendFsync(ledgerPath(changeDir), encodedLine, identity)
  return { appended: true }
}

function decodeApplicationEvent(input: SkillInvocationEventV1): SkillInvocationEventV1 {
  const decoded = decodeSkillInvocationEventV1(input)
  if (!decoded.ok) {
    throw new SkillInvocationEvidenceBindingError(`event codec rejected input: ${decoded.code} ${decoded.path}`)
  }
  return decoded.value
}

export async function appendSkillInvocationEvent(
  changeDir: string,
  input: SkillInvocationEventV1,
  options: AppendSkillInvocationEventOptions,
): Promise<{ readonly appended: boolean }> {
  const decoded = decodeApplicationEvent(input)
  return withLock(changeDir, async () => appendSkillInvocationEventWithLockHeld(changeDir, decoded, options))
}

/** Internal application-command seam. The caller must already own the canonical Change lock. */
export async function appendSkillInvocationEventUnderLock(
  changeDir: string,
  lock: SkillInvocationChangeLock,
  input: SkillInvocationEventV1,
  options: AppendSkillInvocationEventOptions,
): Promise<{ readonly appended: boolean }> {
  if (activeChangeLocks.get(lock) !== changeDir) {
    throw new SkillInvocationEvidenceBindingError('SkillInvocation Change lock capability is invalid')
  }
  const decoded = decodeApplicationEvent(input)
  return appendSkillInvocationEventWithLockHeld(changeDir, decoded, options)
}

export async function readSkillInvocationEvidence(changeDir: string): Promise<SkillInvocationListReadModelV1> {
  const identity = await captureLedgerIdentity(ledgerPath(changeDir))
  const events = await readLedgerEvents(changeDir)
  await assertLedgerIdentity(ledgerPath(changeDir), identity)
  if (events.length === 0) return { schema_version: 'skill-invocation-list/v1', state: 'empty', items: [] }
  try {
    const items = [...grouped(events).values()]
      .map((invocationEvents) => projectSkillInvocationEvents(invocationEvents))
      .sort((a, b) => b.started_at.localeCompare(a.started_at) || a.invocation_id.localeCompare(b.invocation_id))
    return { schema_version: 'skill-invocation-list/v1', state: 'ready', items }
  } catch (cause) {
    throw new SkillInvocationEvidenceCorruptError(`SkillInvocation ledger violates aggregate invariants: ${String(cause)}`)
  }
}
