import {
  readsRequiredForPhase,
  recordsRequiredForPhase,
  type DocumentContractPhase,
  type DocumentKind,
} from '../workflow/document-contract.js'
import { deltaSpecSlot, resolveDocument } from './document-path.js'
import { readDocumentLedger, type DocumentRecord } from './document-ledger.js'

export type DocumentEvidenceItemStatus = 'recorded' | 'missing' | 'stale' | 'unread'

export interface DocumentEvidenceItem {
  readonly kind: DocumentKind
  readonly status: DocumentEvidenceItemStatus
  readonly requiredRead: boolean
  readonly paths: readonly string[]
  readonly producers: readonly string[]
}

export interface DocumentEvidenceReport {
  readonly phase: DocumentContractPhase
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
): DocumentEvidenceItem {
  return {
    kind,
    status,
    requiredRead,
    paths: records.map((record) => record.path),
    producers: records.map((record) => record.producer),
  }
}

export async function evaluateDocumentEvidence(
  repoRoot: string,
  changeDir: string,
  phase: DocumentContractPhase,
  scope: DocumentEvidenceScope = {},
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
      blockers: ['缺少 .pipeline-documents.json；执行 pipeline document init 后按 phase 重新登记产物'],
      items: [],
    }
  }

  const recordKinds = scope.recordKinds ?? recordsRequiredForPhase(phase).map((requirement) => requirement.kind)
  const readRequirements = new Set(scope.readKinds ?? readsRequiredForPhase(phase))
  const kinds = new Set<DocumentKind>([...recordKinds, ...readRequirements])
  const blockers: string[] = []
  const items: DocumentEvidenceItem[] = []

  for (const kind of kinds) {
    const records = ledger.records.filter((record) => record.kind === kind)
    const requiredRead = readRequirements.has(kind)
    if (records.length === 0) {
      blockers.push(`缺少 document '${kind}'；执行 pipeline document record <change> ${kind} <path> --producer <skill>`)
      items.push(item(kind, 'missing', requiredRead, records))
      continue
    }
    const legacyDelta = kind === 'delta-spec'
      ? records.filter((record) => deltaSpecSlot(record.path, changeDir) === undefined)
      : []
    if (legacyDelta.length > 0) {
      blockers.push(
        `存在旧 delta-spec 记录，必须用 pipeline document migrate-delta 显式迁移: ${legacyDelta.map((record) => record.path).join(', ')}`,
      )
      items.push(item(kind, 'stale', requiredRead, records))
      continue
    }
    const digests = await Promise.all(records.map((record) => currentRecordDigest(repoRoot, record)))
    if (records.some((record, index) => digests[index] !== record.sha256)) {
      blockers.push(`document '${kind}' 已缺失或内容变化；重新执行 pipeline document record 后再继续`)
      items.push(item(kind, 'stale', requiredRead, records))
      continue
    }
    if (requiredRead && records.some((record) => !record.reads.some(
      (receipt) => receipt.phase === phase && receipt.sha256 === record.sha256,
    ))) {
      blockers.push(`document '${kind}' 尚未由 ${phase} 读取；执行 pipeline document read <change> ${kind}`)
      items.push(item(kind, 'unread', requiredRead, records))
      continue
    }
    items.push(item(kind, 'recorded', requiredRead, records))
  }
  return { phase, hasLedger: true, pass: blockers.length === 0, blockers, items }
}
