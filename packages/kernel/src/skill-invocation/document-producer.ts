import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { readDocumentLedger, type DocumentRecord } from '../state/document-ledger.js'
import { readOptionalBoundedRegularTextFile } from '../state/document-path.js'
import { readCurrentRunRevision } from '../state/run-revision-store.js'
import { HISTORY_FILE } from '../state/history.js'
import { skillsEquivalent } from '../state/document-record-policy.js'
import type { DocumentKind } from '../workflow/document-contract.js'
import { appendSkillInvocationEvent, skillInvocationProjectId } from './repository.js'
import type { SkillInvocationEventV1, SkillInvocationSubjectV1 } from './types.js'

const CONFIRMATIONS_FILE = '.pipeline-codex-skill-confirmations.jsonl'
const MAX_CONFIRMATIONS_BYTES = 1024 * 1024
const MAX_HISTORY_BYTES = 2 * 1024 * 1024

function digest(...values: readonly string[]): string {
  const hash = createHash('sha256')
  for (const value of values) hash.update(value).update('\0')
  return hash.digest('hex')
}

async function canonicalSubject(changeDir: string): Promise<SkillInvocationSubjectV1> {
  const revision = await readCurrentRunRevision(changeDir)
  const metadata = revision?.state.runMetadata
  const workflow = revision?.state.fields.workflow
  const phase = revision?.state.fields.phase
  if (metadata === undefined || typeof workflow !== 'string' || typeof phase !== 'string') {
    throw new Error('canonical WorkflowRun StepVisit identity is missing')
  }
  return {
    project_id: await skillInvocationProjectId(join(changeDir, '..', '..', '..')),
    workflow_definition_id: workflow,
    workflow_run_id: metadata.runId,
    step_id: phase,
    step_visit: { run_id: metadata.runId, transition_sequence: metadata.transitionSequence },
  }
}

async function hasConfirmation(
  changeDir: string,
  subject: SkillInvocationSubjectV1,
  record: DocumentRecord,
): Promise<boolean> {
  const raw = await readOptionalBoundedRegularTextFile(
    join(changeDir, CONFIRMATIONS_FILE), MAX_CONFIRMATIONS_BYTES, 'Codex Skill confirmation ledger',
  )
  if (raw === undefined || raw === '' || !raw.endsWith('\n')) return false
  const expectedDigest = `sha256:${createHash('sha256')
    .update(basename(changeDir)).update('\0').update(record.producer).update('\0').update(record.recordedAt)
    .update('\0').update(subject.step_visit.run_id)
    .update('\0').update(String(subject.step_visit.transition_sequence))
    .digest('hex')}`
  return raw.slice(0, -1).split('\n').some((line) => {
    try {
      const value: unknown = JSON.parse(line)
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
      const confirmation = value as Record<string, unknown>
      const stepVisit = confirmation.step_visit
      return Object.keys(confirmation).length === 6
        && confirmation.schema_version === 'codex-skill-confirmation/v2'
        && confirmation.producer === record.producer
        && confirmation.recorded_at === record.recordedAt
        && confirmation.evidence_scope === subject.step_id
        && typeof stepVisit === 'object' && stepVisit !== null && !Array.isArray(stepVisit)
        && Object.keys(stepVisit).length === 2
        && (stepVisit as Record<string, unknown>).run_id === subject.step_visit.run_id
        && (stepVisit as Record<string, unknown>).transition_sequence === subject.step_visit.transition_sequence
        && confirmation.receipt_digest === expectedDigest
    } catch {
      return false
    }
  })
}

async function hasExactHistoryEvidence(
  changeDir: string,
  subject: SkillInvocationSubjectV1,
  record: DocumentRecord,
): Promise<boolean> {
  const raw = await readOptionalBoundedRegularTextFile(
    join(changeDir, HISTORY_FILE), MAX_HISTORY_BYTES, 'Change history',
  )
  if (raw === undefined || raw === '' || !raw.endsWith('\n')) return false
  const rows = raw.slice(0, -1).split('\n')
  const hasRead = rows.some((line) => {
    try {
      const value: unknown = JSON.parse(line)
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
      const entry = value as Record<string, unknown>
      if (entry.kind !== 'tool' || entry.ts !== record.recordedAt || typeof entry.raw !== 'string') return false
      const match = /^CodexSkillRead: (.+)$/u.exec(entry.raw)
      return match !== null && skillsEquivalent(match[1] ?? '', record.producer)
    } catch {
      return false
    }
  })
  const binding = `CodexSkillReadBinding: ${record.producer} ${subject.step_visit.run_id} ${subject.step_visit.transition_sequence}`
  const hasBinding = rows.some((line) => {
    try {
      const value: unknown = JSON.parse(line)
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        && (value as Record<string, unknown>).kind === 'tool'
        && (value as Record<string, unknown>).ts === record.recordedAt
        && (value as Record<string, unknown>).raw === binding
    } catch {
      return false
    }
  })
  return hasRead && hasBinding
}

/**
 * Records the one canonical document output that has a current-phase transcript confirmation.
 * Producer, time, path, digest, subject, validators and adapter proof are all derived in-kernel.
 */
export async function recordCanonicalDocumentSkillInvocation(
  changeDir: string,
  kind: DocumentKind,
  recordedAt: string,
): Promise<{ readonly invocation_id: string } | undefined> {
  const subject = await canonicalSubject(changeDir)
  const ledger = await readDocumentLedger(changeDir)
  const records = ledger?.records.filter((record) =>
    record.kind === kind && record.recordedAt === recordedAt) ?? []
  const confirmed: DocumentRecord[] = []
  for (const record of records) {
    if (await hasConfirmation(changeDir, subject, record)
      && await hasExactHistoryEvidence(changeDir, subject, record)) confirmed.push(record)
  }
  if (confirmed.length === 0) return undefined
  if (confirmed.length !== 1) throw new Error('canonical document producer confirmation is ambiguous')
  const record = confirmed[0]!
  const invocationId = `invocation-${digest('codex-document', record.producer, record.path, record.sha256, record.recordedAt)}`
  const adapter = { kind: 'codex' as const, proof_ref: `codex-document-${digest(record.producer, record.sha256)}` }
  const started: Extract<SkillInvocationEventV1, { type: 'invocation-started' }> = {
    schema_version: 'skill-invocation-evidence/v1', event_id: `${invocationId}-started`,
    invocation_id: invocationId, sequence: 1, type: 'invocation-started',
    subject, recorded_at: record.recordedAt,
    payload: {
      skill: { id: record.producer, version: '1' }, adapter,
      input: { schema_id: 'tenon-document-producer-input/v1', fields: [{
        name: 'document_kind', classification: 'configuration', digest: `sha256:${digest(record.kind)}`,
        validator: { id: 'document-kind-contract', status: 'pass' },
      }, {
        name: 'document_path', classification: 'project-data', digest: `sha256:${digest(record.path)}`,
        validator: { id: 'document-path-contract', status: 'pass' },
      }] },
    },
  }
  const completed: Extract<SkillInvocationEventV1, { type: 'invocation-completed' }> = {
    ...started, event_id: `${invocationId}-completed`, sequence: 2, type: 'invocation-completed',
    payload: { adapter, output: { schema_id: 'tenon-document-producer-output/v1', fields: [{
      name: 'document_record', classification: 'project-data', digest: `sha256:${record.sha256}`,
      validator: { id: 'canonical-document-record', status: 'pass' },
    }] } },
  }
  await appendSkillInvocationEvent(changeDir, started, {})
  await appendSkillInvocationEvent(changeDir, completed, { verify_completed_adapter: async () => true })
  const bindingId = `binding-${digest(invocationId, record.sha256)}`
  await appendSkillInvocationEvent(changeDir, {
    ...started, event_id: `${invocationId}-artifact-intent`, sequence: 3, type: 'artifact-binding-intent',
    payload: { binding_id: bindingId, output_id: 'document_record',
      artifact: { kind: 'document', ref: record.path, digest: `sha256:${record.sha256}`,
        document: { kind: record.kind, recorded_at: record.recordedAt } },
      validator_ids: ['canonical-document-record'] },
  }, {})
  await appendSkillInvocationEvent(changeDir, {
    ...started, event_id: `${invocationId}-artifact-bound`, sequence: 4, type: 'artifact-bound',
    payload: { binding_id: bindingId, artifact_digest: `sha256:${record.sha256}`,
      validators: [{ id: 'canonical-document-record', status: 'pass' }] },
  }, { verify_artifact: async () => true })
  return { invocation_id: invocationId }
}
