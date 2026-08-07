import { join } from 'node:path'
import { readOptionalBoundedRegularTextFile } from '../state/document-path.js'

export const DOCUMENT_SKILL_CONFIRMATIONS_FILE = '.pipeline-skill-confirmations.jsonl'
const MAX_CONFIRMATIONS_BYTES = 1024 * 1024

export interface DocumentSkillConfirmationV1 {
  readonly schema_version: 'document-skill-confirmation/v1'
  readonly invocation_id: string
  readonly producer: string
  readonly confirmed_at: string
  readonly evidence_scope: string
  readonly step_visit: { readonly run_id: string; readonly transition_sequence: number }
  readonly adapter: {
    readonly kind: 'native' | 'codex'
    readonly proof_ref: string
    readonly host_session_ref?: string
    readonly tool_use_ref?: string
    readonly application_ref?: string
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseConfirmation(value: unknown): DocumentSkillConfirmationV1 | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 7) return undefined
  const stepVisit = value.step_visit
  const adapter = value.adapter
  if (!isRecord(stepVisit) || Object.keys(stepVisit).length !== 2 || !isRecord(adapter)) return undefined
  const adapterKeys = Object.keys(adapter)
  if (adapter.kind === 'native') {
    if (adapterKeys.length !== 4
      || typeof adapter.host_session_ref !== 'string'
      || typeof adapter.tool_use_ref !== 'string') return undefined
  } else if ((adapterKeys.length !== 2 && adapterKeys.length !== 3)
    || (adapterKeys.length === 3 && typeof adapter.application_ref !== 'string')) return undefined
  if (value.schema_version !== 'document-skill-confirmation/v1'
    || typeof value.invocation_id !== 'string' || !/^invocation-[0-9a-f]{64}$/u.test(value.invocation_id)
    || typeof value.producer !== 'string' || value.producer === ''
    || typeof value.confirmed_at !== 'string' || Number.isNaN(Date.parse(value.confirmed_at))
    || typeof value.evidence_scope !== 'string' || value.evidence_scope === ''
    || typeof stepVisit.run_id !== 'string' || stepVisit.run_id === ''
    || !Number.isSafeInteger(stepVisit.transition_sequence) || (stepVisit.transition_sequence as number) < 0
    || (adapter.kind !== 'native' && adapter.kind !== 'codex')
    || typeof adapter.proof_ref !== 'string' || adapter.proof_ref === '') return undefined
  return {
    schema_version: value.schema_version,
    invocation_id: value.invocation_id,
    producer: value.producer,
    confirmed_at: value.confirmed_at,
    evidence_scope: value.evidence_scope,
    step_visit: { run_id: stepVisit.run_id, transition_sequence: stepVisit.transition_sequence as number },
    adapter: adapter.kind === 'native'
      ? {
          kind: adapter.kind,
          proof_ref: adapter.proof_ref,
          host_session_ref: adapter.host_session_ref as string,
          tool_use_ref: adapter.tool_use_ref as string,
        }
      : {
          kind: adapter.kind,
          proof_ref: adapter.proof_ref,
          ...(typeof adapter.application_ref === 'string'
            ? { application_ref: adapter.application_ref }
            : {}),
        },
  }
}

export async function readDocumentSkillConfirmations(
  changeDir: string,
): Promise<readonly DocumentSkillConfirmationV1[]> {
  const raw = await readOptionalBoundedRegularTextFile(
    join(changeDir, DOCUMENT_SKILL_CONFIRMATIONS_FILE),
    MAX_CONFIRMATIONS_BYTES,
    'document Skill confirmation ledger',
  )
  if (raw === undefined || raw === '' || !raw.endsWith('\n')) return []
  const confirmations: DocumentSkillConfirmationV1[] = []
  for (const line of raw.slice(0, -1).split('\n')) {
    try {
      const confirmation = parseConfirmation(JSON.parse(line) as unknown)
      if (confirmation === undefined) return []
      confirmations.push(confirmation)
    } catch {
      return []
    }
  }
  return confirmations
}
