import { createHash } from 'node:crypto'
import { appendFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { readOptionalBoundedRegularTextFile } from '../state/document-path.js'
import { HISTORY_FILE } from '../state/history.js'
import { skillsEquivalent } from '../state/document-record-policy.js'
import {
  readCurrentRunRevision,
  readImmutableRunRevision,
  type RunRevision,
  validateCanonicalRevisionHistory,
} from '../state/run-revision-store.js'
import { appendSkillInvocationEvent, readSkillInvocationEvidence, skillInvocationProjectId } from './repository.js'
import type { SkillInvocationEventV1, SkillInvocationSubjectV1 } from './types.js'
import {
  DOCUMENT_SKILL_CONFIRMATIONS_FILE,
  readDocumentSkillConfirmations,
  type DocumentSkillConfirmationV1,
} from './document-confirmation-store.js'
export {
  DOCUMENT_SKILL_CONFIRMATIONS_FILE,
  readDocumentSkillConfirmations,
  type DocumentSkillConfirmationV1,
} from './document-confirmation-store.js'

const MAX_HISTORY_BYTES = 2 * 1024 * 1024
const SAFE_OPAQUE_ID = /^[A-Za-z0-9._:-]{1,256}$/u

export interface NativeDocumentSkillReceipt {
  readonly sessionId: string
  readonly toolUseId: string
  readonly observedAt: string
}

interface CanonicalVisit {
  readonly changeName: string
  readonly phase: string
  readonly runId: string
  readonly transitionSequence: number
  readonly transitionHead?: string
  readonly initialMutation?: { readonly kind: string; readonly observedAt: string }
  readonly subject: SkillInvocationSubjectV1
}

interface HistoryRow {
  readonly line: string
  readonly value: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validTimestamp(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined
}

function digest(...values: readonly string[]): string {
  const hash = createHash('sha256')
  values.forEach((value, index) => {
    hash.update(value)
    if (index < values.length - 1) hash.update('\0')
  })
  return hash.digest('hex')
}

function receiptDigest(
  visit: CanonicalVisit,
  producer: string,
  confirmedAt: string,
  sessionId: string,
  toolUseId: string,
): string {
  return digest(
    visit.changeName, producer, confirmedAt, sessionId, toolUseId,
    visit.runId, String(visit.transitionSequence),
  )
}

function codexReceiptDigest(visit: CanonicalVisit, producer: string, confirmedAt: string): string {
  return digest(visit.changeName, producer, confirmedAt, visit.runId, String(visit.transitionSequence))
}

async function canonicalVisit(changeDir: string, evidenceScope: string): Promise<CanonicalVisit | undefined> {
  const revision = await readCurrentRunRevision(changeDir)
  const metadata = revision?.state.runMetadata
  const phase = revision?.state.fields.phase
  const workflow = revision?.state.fields.workflow
  if (revision === undefined || metadata === undefined || typeof phase !== 'string' || phase !== evidenceScope
    || typeof workflow !== 'string') return undefined
  await validateCanonicalRevisionHistory(changeDir)
  let initial: RunRevision = revision
  while (initial.revision > 0) {
    const previousId = initial.previousRevisionId
    if (previousId === undefined) return undefined
    const previous = await readImmutableRunRevision(changeDir, initial.revision - 1, previousId)
    if (previous === undefined) return undefined
    initial = previous
  }
  return {
    changeName: basename(changeDir),
    phase,
    runId: metadata.runId,
    transitionSequence: metadata.transitionSequence,
    ...(metadata.transitionHead === undefined ? {} : { transitionHead: metadata.transitionHead }),
    initialMutation: {
      kind: initial.mutation.kind,
      observedAt: initial.mutation.observedAt,
    },
    subject: {
      project_id: await skillInvocationProjectId(join(changeDir, '..', '..', '..')),
      workflow_definition_id: workflow,
      workflow_run_id: metadata.runId,
      step_id: phase,
      step_visit: { run_id: metadata.runId, transition_sequence: metadata.transitionSequence },
    },
  }
}

async function historyRows(changeDir: string): Promise<readonly HistoryRow[] | undefined> {
  const raw = await readOptionalBoundedRegularTextFile(
    join(changeDir, HISTORY_FILE), MAX_HISTORY_BYTES, 'Change history',
  )
  if (raw === undefined || raw === '' || !raw.endsWith('\n')) return undefined
  const rows: HistoryRow[] = []
  for (const line of raw.slice(0, -1).split('\n')) {
    try {
      const value: unknown = JSON.parse(line)
      if (!isRecord(value)) return undefined
      rows.push({ line, value })
    } catch {
      return undefined
    }
  }
  return rows
}

interface VisitAnchor {
  readonly afterIndex: number
  readonly observedAt: string
}

function currentVisitAnchor(rows: readonly HistoryRow[], visit: CanonicalVisit): VisitAnchor | undefined {
  if (visit.transitionSequence === 0) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]?.value
      const observedAt = row?.kind === 'init' ? validTimestamp(row.ts) : undefined
      if (observedAt !== undefined) return { afterIndex: index, observedAt }
    }
    const migrationAt = visit.initialMutation?.kind === 'migration'
      ? validTimestamp(visit.initialMutation.observedAt)
      : undefined
    if (migrationAt !== undefined) {
      let afterIndex = -1
      for (let index = 0; index < rows.length; index += 1) {
        const rowAt = validTimestamp(rows[index]?.value.ts)
        if (rowAt !== undefined && Date.parse(rowAt) < Date.parse(migrationAt)) afterIndex = index
      }
      return { afterIndex, observedAt: migrationAt }
    }
    return undefined
  }
  if (visit.transitionHead === undefined) return undefined
  const anchor = rows.findIndex(({ value }) =>
    value.kind === 'transition'
    && value.to === visit.phase
    && value.transitionRecordId === visit.transitionHead
    && validTimestamp(value.ts) !== undefined)
  if (anchor < 0) return undefined
  if (rows.slice(anchor + 1).some(({ value }) => value.kind === 'transition' || value.kind === 'init')) {
    return undefined
  }
  const observedAt = validTimestamp(rows[anchor]?.value.ts)
  return observedAt === undefined ? undefined : { afterIndex: anchor, observedAt }
}

function exactNativeSkillRow(
  rows: readonly HistoryRow[],
  visit: CanonicalVisit,
  producer: string,
  observedAt: string,
): boolean {
  const anchor = currentVisitAnchor(rows, visit)
  if (anchor === undefined || validTimestamp(observedAt) === undefined) return false
  if (Date.parse(observedAt) < Date.parse(anchor.observedAt)) return false
  return rows.slice(anchor.afterIndex + 1).some(({ value }) => {
    if (value.kind !== 'tool' || value.ts !== observedAt || typeof value.raw !== 'string') return false
    const match = /^Skill: (.+)$/u.exec(value.raw)
    return match !== null && skillsEquivalent(match[1] ?? '', producer)
  })
}

async function appendConfirmation(
  changeDir: string,
  visit: CanonicalVisit,
  producer: string,
  confirmedAt: string,
  invocationId: string,
  adapter: DocumentSkillConfirmationV1['adapter'],
): Promise<void> {
  const confirmation: DocumentSkillConfirmationV1 = {
    schema_version: 'document-skill-confirmation/v1',
    invocation_id: invocationId,
    producer,
    confirmed_at: confirmedAt,
    evidence_scope: visit.phase,
    step_visit: { run_id: visit.runId, transition_sequence: visit.transitionSequence },
    adapter,
  }
  await appendFile(join(changeDir, DOCUMENT_SKILL_CONFIRMATIONS_FILE), `${JSON.stringify(confirmation)}\n`, {
    encoding: 'utf8', mode: 0o600,
  })
}

/** Native adapter boundary: called synchronously by the real Skill PostToolUse hook. */
export async function recordNativeDocumentSkillConfirmation(
  changeDir: string,
  producer: string,
  evidenceScope: string,
  receipt: NativeDocumentSkillReceipt,
): Promise<boolean> {
  if (!SAFE_OPAQUE_ID.test(receipt.sessionId) || !SAFE_OPAQUE_ID.test(receipt.toolUseId)) return false
  const visit = await canonicalVisit(changeDir, evidenceScope)
  const rows = await historyRows(changeDir)
  if (visit === undefined || rows === undefined
    || !exactNativeSkillRow(rows, visit, producer, receipt.observedAt)) return false
  const proofRef = `native-post-tool-use-${receiptDigest(
    visit, producer, receipt.observedAt, receipt.sessionId, receipt.toolUseId,
  )}`
  const invocationId = `invocation-${digest(
    'native-document-skill', visit.runId, String(visit.transitionSequence), producer, proofRef,
  )}`
  const hostSessionRef = `sha256:${digest('native-host-session', receipt.sessionId)}`
  const toolUseRef = `sha256:${digest('native-tool-use', receipt.toolUseId)}`
  const started: Extract<SkillInvocationEventV1, { type: 'invocation-started' }> = {
    schema_version: 'skill-invocation-evidence/v1',
    event_id: `${invocationId}-started`,
    invocation_id: invocationId,
    sequence: 1,
    type: 'invocation-started',
    subject: visit.subject,
    recorded_at: receipt.observedAt,
    payload: {
      skill: { id: producer, version: '1' },
      adapter: { kind: 'native', proof_ref: proofRef },
      input: {
        schema_id: 'tenon-native-skill-input/v1',
        fields: [{
          name: 'evidence_scope',
          classification: 'configuration',
          digest: `sha256:${digest(visit.phase)}`,
          validator: { id: 'canonical-step-visit', status: 'pass' },
        }],
      },
    },
  }
  const existing = (await readDocumentSkillConfirmations(changeDir)).find((confirmation) =>
    confirmation.invocation_id === invocationId
    && confirmation.producer === producer
    && confirmation.confirmed_at === receipt.observedAt
    && confirmation.adapter.kind === 'native'
    && confirmation.adapter.proof_ref === proofRef)
  if (existing !== undefined && await confirmationIsValid(changeDir, visit, rows, existing)) {
    await appendSkillInvocationEvent(changeDir, started, {})
    return true
  }
  // Publish started under the repository's canonical Change lock before the confirmation becomes
  // visible. A concurrent document command therefore sees no confirmation (safe retry) until the
  // exact invocation start is durable.
  await appendSkillInvocationEvent(changeDir, started, {})
  await appendFile(join(changeDir, HISTORY_FILE), `${JSON.stringify({
    ts: receipt.observedAt,
    kind: 'tool',
    raw: `NativeSkillReadBinding: ${producer} ${visit.runId} ${visit.transitionSequence} ${proofRef}`,
  })}\n`, 'utf8')
  await appendConfirmation(changeDir, visit, producer, receipt.observedAt, invocationId, {
    kind: 'native', proof_ref: proofRef, host_session_ref: hostSessionRef, tool_use_ref: toolUseRef,
  })
  return (await currentDocumentSkillConfirmation(
    changeDir, producer, evidenceScope, receipt.observedAt,
  ))?.invocation_id === invocationId
}

/** Codex adapter boundary: called only after a host transcript has proved completed execution. */
export async function recordCodexDocumentSkillConfirmation(
  changeDir: string,
  producer: string,
  confirmedAt: string,
  evidenceScope: string,
  expectedStepVisit: { readonly runId: string; readonly transitionSequence: number },
  transcriptReceiptDigest: string,
  applicationKey = '',
): Promise<boolean> {
  const visit = await canonicalVisit(changeDir, evidenceScope)
  if (visit === undefined
    || visit.runId !== expectedStepVisit.runId
    || visit.transitionSequence !== expectedStepVisit.transitionSequence
    || Buffer.byteLength(applicationKey) > 4096
    || transcriptReceiptDigest !== `sha256:${codexReceiptDigest(visit, producer, confirmedAt)}`) return false
  const proofRef = `codex-transcript-${transcriptReceiptDigest.slice('sha256:'.length)}`
  const applicationRef = `sha256:${digest(applicationKey)}`
  const invocationId = `invocation-${digest(
    'codex-document-skill', visit.runId, String(visit.transitionSequence), producer, proofRef, applicationRef,
  )}`
  await appendConfirmation(changeDir, visit, producer, confirmedAt, invocationId, {
    kind: 'codex', proof_ref: proofRef, application_ref: applicationRef,
  })
  return true
}

async function confirmationIsValid(
  changeDir: string,
  visit: CanonicalVisit,
  rows: readonly HistoryRow[],
  confirmation: DocumentSkillConfirmationV1,
): Promise<boolean> {
  if (confirmation.step_visit.run_id !== visit.runId
    || confirmation.step_visit.transition_sequence !== visit.transitionSequence
    || confirmation.evidence_scope !== visit.phase) return false
  if (confirmation.adapter.kind === 'native') {
    const expectedInvocationId = `invocation-${digest(
      'native-document-skill', visit.runId, String(visit.transitionSequence),
      confirmation.producer, confirmation.adapter.proof_ref,
    )}`
    if (confirmation.invocation_id !== expectedInvocationId) return false
    if (!exactNativeSkillRow(rows, visit, confirmation.producer, confirmation.confirmed_at)) return false
    const binding = `NativeSkillReadBinding: ${confirmation.producer} ${visit.runId} ${visit.transitionSequence} ${confirmation.adapter.proof_ref}`
    return rows.some(({ value }) =>
      value.kind === 'tool' && value.ts === confirmation.confirmed_at && value.raw === binding)
  }
  const expected = `codex-transcript-${codexReceiptDigest(visit, confirmation.producer, confirmation.confirmed_at)}`
  if (confirmation.adapter.proof_ref !== expected) return false
  const expectedInvocationId = confirmation.adapter.application_ref === undefined
    ? `invocation-${digest(
        'codex-document-skill', visit.runId, String(visit.transitionSequence),
        confirmation.producer, confirmation.adapter.proof_ref,
      )}`
    : /^sha256:[a-f0-9]{64}$/u.test(confirmation.adapter.application_ref)
      ? `invocation-${digest(
          'codex-document-skill', visit.runId, String(visit.transitionSequence),
          confirmation.producer, confirmation.adapter.proof_ref, confirmation.adapter.application_ref,
        )}`
      : undefined
  if (confirmation.invocation_id !== expectedInvocationId) return false
  const read = `CodexSkillRead: ${confirmation.producer}`
  const binding = `CodexSkillReadBinding: ${confirmation.producer} ${visit.runId} ${visit.transitionSequence}`
  return rows.some(({ value }) =>
    value.kind === 'tool' && value.ts === confirmation.confirmed_at && value.raw === read)
    && rows.some(({ value }) =>
      value.kind === 'tool' && value.ts === confirmation.confirmed_at && value.raw === binding)
}

/** Selects only a sealed confirmation from the canonical current StepVisit at or before the write. */
export async function currentDocumentSkillConfirmation(
  changeDir: string,
  producer: string,
  evidenceScope: string,
  notAfter: string,
): Promise<DocumentSkillConfirmationV1 | undefined> {
  const visit = await canonicalVisit(changeDir, evidenceScope)
  const rows = await historyRows(changeDir)
  if (visit === undefined || rows === undefined || validTimestamp(notAfter) === undefined) return undefined
  const candidates = (await readDocumentSkillConfirmations(changeDir)).filter((confirmation) =>
    skillsEquivalent(confirmation.producer, producer)
    && confirmation.evidence_scope === evidenceScope
    && Date.parse(confirmation.confirmed_at) <= Date.parse(notAfter))
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const confirmation = candidates[index]
    if (confirmation !== undefined && await confirmationIsValid(changeDir, visit, rows, confirmation)) {
      return confirmation
    }
  }
  return undefined
}

export interface NativeActiveDocumentSkill {
  readonly invocationId: string
  readonly producer: string
  readonly hostSessionRef: string
  readonly toolUseRef: string
}

/** Privacy-safe lookup for question/decision adapters; raw host ids are never persisted. */
export async function resolveNativeActiveDocumentSkill(
  changeDir: string,
  input: {
    readonly sessionId: string
    readonly observedAt: string
    readonly invocationId?: string
  },
): Promise<NativeActiveDocumentSkill | undefined> {
  if (!SAFE_OPAQUE_ID.test(input.sessionId) || validTimestamp(input.observedAt) === undefined) return undefined
  const revision = await readCurrentRunRevision(changeDir)
  const phase = revision?.state.fields.phase
  if (typeof phase !== 'string') return undefined
  const visit = await canonicalVisit(changeDir, phase)
  const rows = await historyRows(changeDir)
  if (visit === undefined || rows === undefined) return undefined
  const hostSessionRef = `sha256:${digest('native-host-session', input.sessionId)}`
  const evidence = await readSkillInvocationEvidence(changeDir)
  if (evidence.state === 'corrupt') return undefined
  const eligible = (await readDocumentSkillConfirmations(changeDir)).filter((confirmation) =>
    confirmation.adapter.kind === 'native'
    && confirmation.adapter.host_session_ref === hostSessionRef
    && confirmation.evidence_scope === phase
    && confirmation.step_visit.run_id === visit.runId
    && confirmation.step_visit.transition_sequence === visit.transitionSequence
    && Date.parse(confirmation.confirmed_at) <= Date.parse(input.observedAt)
    && (input.invocationId === undefined || confirmation.invocation_id === input.invocationId)
    && evidence.items.some((item) =>
      item.invocation_id === confirmation.invocation_id && item.status === 'incomplete'))
  const candidates: DocumentSkillConfirmationV1[] = []
  for (const confirmation of eligible) {
    if (await confirmationIsValid(changeDir, visit, rows, confirmation)) candidates.push(confirmation)
  }
  if (candidates.length === 0) return undefined
  const first = candidates[0]
  if (first === undefined) return undefined
  const latestAt = candidates.reduce(
    (latest, candidate) => candidate.confirmed_at > latest ? candidate.confirmed_at : latest,
    first.confirmed_at,
  )
  const latest = candidates.filter((candidate) => candidate.confirmed_at === latestAt)
  if (latest.length !== 1) return undefined
  const selected = latest[0]
  if (selected === undefined || selected.adapter.kind !== 'native'
    || selected.adapter.tool_use_ref === undefined) return undefined
  return {
    invocationId: selected.invocation_id,
    producer: selected.producer,
    hostSessionRef,
    toolUseRef: selected.adapter.tool_use_ref,
  }
}
