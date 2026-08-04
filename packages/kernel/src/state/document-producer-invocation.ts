import { currentDocumentSkillConfirmation } from '../skill-invocation/document-confirmation.js'
import { DocumentLedgerError } from './document-path.js'
import { readCurrentRunRevision } from './run-revision-store.js'

export interface DocumentProducerInvocationAnchor {
  readonly confirmationInvocationId: string
  readonly evidenceScope: string
  readonly stepVisit: { readonly runId: string; readonly transitionSequence: number }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function parseDocumentProducerInvocation(
  value: unknown,
  recordIndex: number,
): DocumentProducerInvocationAnchor | undefined {
  if (value === undefined) return undefined
  const item = object(value)
  const stepVisit = object(item?.stepVisit)
  const confirmationInvocationId = item?.confirmationInvocationId
  const evidenceScope = item?.evidenceScope
  const runId = stepVisit?.runId
  const transitionSequence = stepVisit?.transitionSequence
  if (item === undefined || Object.keys(item).length !== 3
    || stepVisit === undefined || Object.keys(stepVisit).length !== 2
    || typeof confirmationInvocationId !== 'string' || !/^invocation-[a-f0-9]{64}$/u.test(confirmationInvocationId)
    || typeof evidenceScope !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(evidenceScope)
    || typeof runId !== 'string' || runId === ''
    || !Number.isSafeInteger(transitionSequence) || (transitionSequence as number) < 0) {
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].producerInvocation 非法`)
  }
  return {
    confirmationInvocationId,
    evidenceScope,
    stepVisit: { runId, transitionSequence: transitionSequence as number },
  }
}

export async function currentDocumentProducerInvocation(
  changeDir: string,
  producer: string,
  phase: string,
  recordedAt: string,
): Promise<DocumentProducerInvocationAnchor | undefined> {
  const confirmation = await currentDocumentSkillConfirmation(changeDir, producer, phase, recordedAt)
  return confirmation === undefined ? undefined : {
    confirmationInvocationId: confirmation.invocation_id,
    evidenceScope: confirmation.evidence_scope,
    stepVisit: {
      runId: confirmation.step_visit.run_id,
      transitionSequence: confirmation.step_visit.transition_sequence,
    },
  }
}

export async function requiredDocumentProducerInvocation(
  changeDir: string,
  producer: string,
  phase: string,
  recordedAt: string,
  allowBackfill: boolean,
): Promise<DocumentProducerInvocationAnchor | undefined> {
  const invocation = await currentDocumentProducerInvocation(changeDir, producer, phase, recordedAt)
  if (invocation === undefined && !allowBackfill) throw new DocumentLedgerError(
    `current StepVisit lacks exact host confirmation for document producer '${producer}'`,
  )
  return invocation
}

/** Stable authored-step visit identity; legacy YAML-only Changes fail closed until canonicalized. */
export async function currentDocumentStepVisitId(changeDir: string): Promise<string> {
  const metadata = (await readCurrentRunRevision(changeDir))?.state.runMetadata
  if (metadata === undefined) throw new DocumentLedgerError(
    '缺少 canonical WorkflowRun visit identity；旧 Change 必须先通过受控 state mutation 建立 run identity，再重新读取 document',
  )
  return JSON.stringify([metadata.runId, metadata.transitionSequence])
}
