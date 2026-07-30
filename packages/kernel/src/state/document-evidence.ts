import {
  isAcceptedDocumentProducer,
  isRecordedDocumentProducerAllowedThroughPolicyStep,
  isDocumentContractPhase,
  recordsRequiredForPolicyStep,
  readsRequiredForPolicyStep,
  readsRequiredForPhase,
  recordsRequiredForPhase,
  type DocumentContractPhase,
  type DocumentGovernancePolicy,
  type DocumentKind,
} from '../workflow/document-contract.js'
import { deltaSpecSlot, resolveDocument } from './document-path.js'
import {
  currentDocumentStepVisitId,
  readDocumentLedger,
  type DocumentRecord,
} from './document-ledger.js'

export type DocumentEvidenceItemStatus = 'recorded' | 'missing' | 'stale' | 'unread'

export interface DocumentEvidenceItem {
  readonly kind: DocumentKind
  readonly status: DocumentEvidenceItemStatus
  readonly requiredRead: boolean
  readonly paths: readonly string[]
  readonly producers: readonly string[]
  readonly timeline: readonly { readonly producer: string; readonly recordedAt: string; readonly readAt?: string }[]
}

export interface DocumentEvidenceReport {
  readonly phase: string
  readonly hasLedger: boolean
  readonly pass: boolean
  readonly blockers: readonly string[]
  readonly items: readonly DocumentEvidenceItem[]
}

export interface DocumentEvidenceScope {
  readonly recordKinds?: readonly DocumentKind[]
  readonly readKinds?: readonly DocumentKind[]
}

async function currentRecordDigest(repoRoot: string, record: DocumentRecord): Promise<string | undefined> {
  try {
    return (await resolveDocument(repoRoot, record.path)).digest
  } catch {
    return undefined
  }
}

function item(
  kind: DocumentKind,
  status: DocumentEvidenceItemStatus,
  requiredRead: boolean,
  records: readonly DocumentRecord[],
  phase: string,
  currentVisitId?: string,
): DocumentEvidenceItem {
  return {
    kind,
    status,
    requiredRead,
    paths: records.map((record) => record.path),
    producers: records.map((record) => record.producer),
    timeline: records.map((record) => ({
      producer: record.producer,
      recordedAt: record.recordedAt,
      ...(status === 'recorded' && requiredRead
        ? (() => {
            const receipt = record.reads.find((candidate) => currentVisitId !== undefined && receiptMatchesVisit(candidate, phase, record.sha256, currentVisitId))
            return receipt === undefined ? {} : { readAt: receipt.readAt }
          })()
        : {}),
    })),
  }
}

function receiptMatchesVisit(
  receipt: DocumentRecord['reads'][number],
  phase: string,
  digest: string,
  visitId: string,
): boolean {
  return receipt.phase === phase
    && receipt.sha256 === digest
    && receipt.visitId === visitId
}

export async function evaluateDocumentEvidence(
  repoRoot: string,
  changeDir: string,
  phase: string,
  scope: DocumentEvidenceScope = {},
  policy?: DocumentGovernancePolicy,
): Promise<DocumentEvidenceReport> {
  let ledger
  try {
    ledger = await readDocumentLedger(changeDir)
  } catch (error) {
    return {
      phase,
      hasLedger: true,
      pass: false,
      blockers: [`document ledger 不可读取: ${error instanceof Error ? error.message : String(error)}`],
      items: [],
    }
  }
  if (!ledger) {
    return {
      phase,
      hasLedger: false,
      pass: false,
      blockers: ['缺少 .pipeline-documents.json；执行 tenon document init 后按 phase 重新登记产物'],
      items: [],
    }
  }

  const recordRequirements = policy
    ? recordsRequiredForPolicyStep(policy, phase)
    : isDocumentContractPhase(phase) ? recordsRequiredForPhase(phase) : []
  const recordKinds = scope.recordKinds ?? recordRequirements.map((requirement) => requirement.kind)
  const readRequirements = new Set(scope.readKinds ?? (
    policy
      ? readsRequiredForPolicyStep(policy, phase)
      : isDocumentContractPhase(phase) ? readsRequiredForPhase(phase) : []
  ))
  const kinds = new Set<DocumentKind>([...recordKinds, ...readRequirements])
  const blockers: string[] = []
  const items: DocumentEvidenceItem[] = []
  let currentVisitId: string | undefined
  if (readRequirements.size > 0) {
    try {
      currentVisitId = await currentDocumentStepVisitId(changeDir)
    } catch (error) {
      blockers.push(
        `current step visit 不可验证: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  for (const kind of kinds) {
    const records = ledger.records.filter((record) => record.kind === kind)
    const requiredRead = readRequirements.has(kind)
    if (records.length === 0) {
      blockers.push(`缺少 document '${kind}'；执行 tenon document record <change> ${kind} <path> --producer <skill>`)
      items.push(item(kind, 'missing', requiredRead, records, phase, currentVisitId))
      continue
    }
    if (records.some((record) => {
      return policy
        ? !isRecordedDocumentProducerAllowedThroughPolicyStep(policy, kind, phase, record.producer)
        : !isAcceptedDocumentProducer(kind, record.producer)
    })) {
      blockers.push(`document '${kind}' 的 producer 不符合当前 document contract`)
      items.push(item(kind, 'stale', requiredRead, records, phase, currentVisitId))
      continue
    }
    const legacyDelta = kind === 'delta-spec'
      ? records.filter((record) => deltaSpecSlot(record.path, changeDir) === undefined)
      : []
    if (legacyDelta.length > 0) {
      blockers.push(
        `存在旧 delta-spec 记录，必须用 tenon document migrate-delta 显式迁移: ${legacyDelta.map((record) => record.path).join(', ')}`,
      )
      items.push(item(kind, 'stale', requiredRead, records, phase, currentVisitId))
      continue
    }
    const digests: Array<string | undefined> = []
    for (const record of records) {
      digests.push(await currentRecordDigest(repoRoot, record))
    }
    if (records.some((record, index) => digests[index] !== record.sha256)) {
      blockers.push(`document '${kind}' 已缺失或内容变化；重新执行 tenon document record 后再继续`)
      items.push(item(kind, 'stale', requiredRead, records, phase, currentVisitId))
      continue
    }
    if (requiredRead && (
      currentVisitId === undefined
      || records.some((record) => !record.reads.some(
        (receipt) => receiptMatchesVisit(receipt, phase, record.sha256, currentVisitId),
      ))
    )) {
      if (currentVisitId !== undefined) {
        blockers.push(
          `document '${kind}' 尚未由 ${phase} 的当前 step visit 读取；执行 tenon document read <change> ${kind}`,
        )
      }
      items.push(item(kind, 'unread', requiredRead, records, phase, currentVisitId))
      continue
    }
    items.push(item(kind, 'recorded', requiredRead, records, phase, currentVisitId))
  }
  return { phase, hasLedger: true, pass: blockers.length === 0, blockers, items }
}
