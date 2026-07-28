/** OpenSpec document evidence sidecar; callers hold the Change lock while mutating it. */
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DOCUMENT_CONTRACT_PHASES,
  documentOwnerPhase,
  documentOwnerPolicyStep,
  isDocumentContractPhase,
  isDocumentKind,
  isDocumentProducerAllowedInPhase,
  isDocumentProducerAllowedInPolicyStep,
  isDocumentRecordAllowedInPhase,
  isDocumentRecordAllowedInPolicyStep,
  recordProducerCandidatesForPolicyStep,
  recordProducerCandidatesFor,
  readsRequiredForPolicyStep,
  readsRequiredForPhase,
  type DocumentContractPhase,
  type DocumentGovernancePolicy,
  type DocumentKind,
} from '../workflow/document-contract.js'
import { atomicLinkPublish, atomicReplaceFile } from './atomic-publish.js'
import {
  deltaSpecSlot,
  documentSlot,
  DocumentLedgerError,
  resolveDocument,
} from './document-path.js'
import { HISTORY_FILE } from './history.js'
import {
  currentSpecVisitEnteredViaRequirementsChanged,
  skillsEquivalent,
  requiresRequirementsChangedForSpecAdr,
} from './document-record-policy.js'
import { readCurrentRunRevision } from './run-revision-store.js'

export { DocumentLedgerError } from './document-path.js'

export const DOCUMENT_LEDGER_FILE = '.pipeline-documents.json'
export interface DocumentReadReceipt {
  readonly phase: string
  readonly sha256: string
  readonly readAt: string
  readonly visitId?: string
}

export interface DocumentRecord {
  readonly kind: DocumentKind
  readonly path: string
  readonly sha256: string
  readonly producer: string
  readonly recordedAt: string
  readonly reads: readonly DocumentReadReceipt[]
}

export interface DocumentLedger {
  readonly version: 1
  readonly contract: 'openspec-v1'
  readonly createdAt: string
  readonly records: readonly DocumentRecord[]
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function object(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function validDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value)
}

function parseReceipt(value: unknown, recordIndex: number, receiptIndex: number): DocumentReadReceipt {
  const item = object(value)
  if (!item) throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}] 必须是对象`)
  const phase = string(item.phase)
  const digest = string(item.sha256)
  const readAt = string(item.readAt)
  const visitId = item.visitId === undefined ? undefined : string(item.visitId)
  if (!phase || !/^[A-Za-z0-9_-]+$/.test(phase)) {
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].phase 非法`)
  }
  if (!digest || !validDigest(digest)) {
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].sha256 非法`)
  }
  if (!readAt) throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].readAt 必须是非空字符串`)
  if (item.visitId !== undefined && !visitId) throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].visitId 非法`)
  return { phase, sha256: digest, readAt, ...(visitId === undefined ? {} : { visitId }) }
}
function receiptKey(receipt: DocumentReadReceipt): string { return JSON.stringify([receipt.phase, receipt.visitId ?? 'legacy']) }

function parseRecord(value: unknown, index: number): DocumentRecord {
  const item = object(value)
  if (!item) throw new DocumentLedgerError(`document ledger records[${index}] 必须是对象`)
  const kind = string(item.kind)
  const path = string(item.path)
  const digest = string(item.sha256)
  const producer = string(item.producer)
  const recordedAt = string(item.recordedAt)
  if (!kind || !isDocumentKind(kind)) throw new DocumentLedgerError(`document ledger records[${index}].kind 非法`)
  if (!path) throw new DocumentLedgerError(`document ledger records[${index}].path 必须是非空字符串`)
  if (!digest || !validDigest(digest)) throw new DocumentLedgerError(`document ledger records[${index}].sha256 非法`)
  if (!producer || !/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/.test(producer)) {
    throw new DocumentLedgerError(`document ledger records[${index}].producer 非法`)
  }
  if (!recordedAt) throw new DocumentLedgerError(`document ledger records[${index}].recordedAt 必须是非空字符串`)
  if (!Array.isArray(item.reads)) throw new DocumentLedgerError(`document ledger records[${index}].reads 必须是数组`)
  const reads = item.reads.map((receipt, receiptIndex) => parseReceipt(receipt, index, receiptIndex))
  const readVisits = new Set<string>()
  for (const receipt of reads) {
    const key = receiptKey(receipt)
    if (readVisits.has(key)) throw new DocumentLedgerError(`document ledger records[${index}] 对 phase '${receipt.phase}' 的同一 visit 有重复 read receipt`)
    readVisits.add(key)
  }
  return { kind, path, sha256: digest, producer, recordedAt, reads }
}
/** Stable authored-step visit identity; legacy YAML-only Changes fail closed until canonicalized. */
export async function currentDocumentStepVisitId(changeDir: string): Promise<string> {
  const metadata = (await readCurrentRunRevision(changeDir))?.state.runMetadata
  if (metadata === undefined) throw new DocumentLedgerError(
    '缺少 canonical WorkflowRun visit identity；旧 Change 必须先通过受控 state mutation 建立 run identity，再重新读取 document',
  )
  return JSON.stringify([metadata.runId, metadata.transitionSequence])
}

export function parseDocumentLedger(raw: string): DocumentLedger {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new DocumentLedgerError('document ledger 不是合法 JSON')
  }
  const item = object(value)
  if (!item) throw new DocumentLedgerError('document ledger 必须是 JSON 对象')
  if (item.version !== 1) throw new DocumentLedgerError('document ledger version 必须为 1')
  if (item.contract !== 'openspec-v1') throw new DocumentLedgerError("document ledger contract 必须为 'openspec-v1'")
  const createdAt = string(item.createdAt)
  if (!createdAt) throw new DocumentLedgerError('document ledger createdAt 必须是非空字符串')
  if (!Array.isArray(item.records)) throw new DocumentLedgerError('document ledger records 必须是数组')
  const records = item.records.map((record, index) => parseRecord(record, index))
  const unique = new Set<string>()
  for (const record of records) {
    const key = `${record.kind}\u0000${record.path}`
    if (unique.has(key)) throw new DocumentLedgerError(`document ledger 有重复 record: ${record.kind} ${record.path}`)
    unique.add(key)
  }
  return { version: 1, contract: 'openspec-v1', createdAt, records }
}

async function ledgerText(changeDir: string): Promise<string | undefined> {
  const path = join(changeDir, DOCUMENT_LEDGER_FILE)
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new DocumentLedgerError(`document ledger 必须是非 symlink 普通文件: ${path}`)
    }
    return await readFile(path, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

export async function readDocumentLedger(changeDir: string): Promise<DocumentLedger | undefined> {
  const raw = await ledgerText(changeDir)
  return raw === undefined ? undefined : parseDocumentLedger(raw)
}

export function initialDocumentLedgerContent(createdAt: string): string {
  const ledger: DocumentLedger = { version: 1, contract: 'openspec-v1', createdAt, records: [] }
  return `${JSON.stringify(ledger, null, 2)}\n`
}

export async function ensureDocumentLedger(changeDir: string, createdAt: string): Promise<DocumentLedger> {
  const existing = await readDocumentLedger(changeDir)
  if (existing) return existing
  const ledger: DocumentLedger = { version: 1, contract: 'openspec-v1', createdAt, records: [] }
  const target = join(changeDir, DOCUMENT_LEDGER_FILE)
  try {
    await atomicLinkPublish(changeDir, '.pipeline-documents.tmp', target, initialDocumentLedgerContent(createdAt))
    return ledger
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
    const raced = await readDocumentLedger(changeDir)
    if (!raced) throw new DocumentLedgerError(`document ledger 并发创建后不可读取: ${target}`)
    return raced
  }
}

async function writeDocumentLedger(changeDir: string, ledger: DocumentLedger): Promise<void> {
  // Re-parse serialized bytes before publication, so callers cannot accidentally introduce an
  // invalid in-memory shape through future extension code.
  const content = `${JSON.stringify(ledger, null, 2)}\n`
  parseDocumentLedger(content)
  await atomicReplaceFile(join(changeDir, DOCUMENT_LEDGER_FILE), content)
}

async function hasSkillEvidence(
  changeDir: string,
  producer: string,
  phase: string,
  allowEarlierPhaseEvidence: boolean,
): Promise<boolean> {
  let text: string
  try {
    text = await readFile(join(changeDir, HISTORY_FILE), 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false
    throw error
  }
  const entries: Record<string, unknown>[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const entry = object(JSON.parse(trimmed))
      if (entry) entries.push(entry)
    } catch {
      // JSONL history is intentionally append-only and may contain pre-existing malformed lines.
      // A malformed line cannot satisfy evidence, but it must not conceal a later valid Skill row.
    }
  }
  // A normal record must be backed by a Skill invocation from the current visit to the phase.
  // `--backfill` is the sole migration exception because an upgraded Change may already have
  // crossed the document's owning phase before this ledger existed.
  let start = 0
  if (!allowEarlierPhaseEvidence) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (entry?.kind === 'transition' && entry.to === phase) {
        start = index + 1
        break
      }
    }
  }
  for (const entry of entries.slice(start)) {
    if (entry.kind !== 'tool') continue
    try {
      const raw = string(entry.raw)
      // Claude exposes a first-class Skill event, while Codex exposes a completed, restricted
      // bundled SKILL.md read as host-observed evidence. The hook records those two provenance
      // labels distinctly; both are valid proof that the exact packaged producer was loaded.
      const match = raw ? /^(?:Skill|CodexSkillRead): (.+)$/.exec(raw) : null
      if (match && skillsEquivalent(match[1] ?? '', producer)) return true
    } catch { /* malformed legacy tool entry cannot satisfy evidence */ }
  }
  return false
}

export interface RecordDocumentInput {
  readonly repoRoot: string
  readonly changeDir: string
  readonly phase: string
  readonly policy?: DocumentGovernancePolicy
  readonly kind: DocumentKind
  readonly path: string
  readonly producer: string
  readonly recordedAt: string
  /**
   * Explicitly adopt an already-existing document from an earlier governed phase.
   *
   * This is intentionally opt-in for upgrades: normal authoring may only register outputs in its
   * owning phase, while a Change created before the ledger existed may already be at spec/build.
   * It never permits future-phase records and still requires the same real Skill history evidence
   * and digest-bound file validation as a normal record.
   */
  readonly allowBackfill?: boolean
}

export async function recordDocument(input: RecordDocumentInput): Promise<DocumentLedger> {
  const ownerPhase = input.policy
    ? documentOwnerPolicyStep(input.policy, input.kind)
    : documentOwnerPhase(input.kind)
  if (!ownerPhase) {
    // `DocumentKind` and the matrix live together, but fail closed if a future edit accidentally
    // adds a kind without assigning its owning phase.
    throw new DocumentLedgerError(`document '${input.kind}' 未声明所属 phase`)
  }
  const current = await readDocumentLedger(input.changeDir)
  if (!current) throw new DocumentLedgerError(`document ledger 缺失；先执行 tenon document init`)
  const resolved = await resolveDocument(input.repoRoot, input.path)
  const slot = documentSlot(input.kind, resolved.relativePath, input.changeDir)
  const oldCandidates = current.records.filter((record) => {
    if (record.kind !== input.kind) return false
    if (record.kind !== 'delta-spec') return true
    return deltaSpecSlot(record.path, input.changeDir) === slot
  })
  const old = oldCandidates.find((record) => record.sha256 === resolved.digest) ?? oldCandidates[0]
  const policySteps = input.policy?.steps ?? DOCUMENT_CONTRACT_PHASES
  const ownerIndex = policySteps.indexOf(ownerPhase)
  const currentIndex = policySteps.indexOf(input.phase)
  if (currentIndex < 0) {
    throw new DocumentLedgerError(`当前 step '${input.phase}' 不属于 document contract`)
  }

  if (input.allowBackfill) {
    if (oldCandidates.length > 0) {
      throw new DocumentLedgerError(
        `--backfill 只能首次登记历史 document 槽；'${slot}' 已有 record，修改后必须使用当前 phase 的实际 producer 重新登记`,
      )
    }
    if (ownerIndex >= currentIndex) {
      if (ownerIndex > currentIndex) {
        throw new DocumentLedgerError(`'${input.kind}' 属于未来 phase '${ownerPhase}'，不能从当前 ${input.phase} backfill`)
      }
      throw new DocumentLedgerError(`'${input.kind}' 当前正处于所属 phase '${ownerPhase}'；不得使用 --backfill`)
    }
    const producerAllowed = input.policy
      ? isDocumentProducerAllowedInPolicyStep(input.policy, input.kind, ownerPhase, input.producer)
      : isDocumentProducerAllowedInPhase(input.kind, ownerPhase as DocumentContractPhase, input.producer)
    const producerCandidates = input.policy
      ? recordProducerCandidatesForPolicyStep(input.policy, input.kind, ownerPhase)
      : recordProducerCandidatesFor(input.kind, ownerPhase as DocumentContractPhase)
    if (!producerAllowed) {
      throw new DocumentLedgerError(
        `document '${input.kind}' 的历史 producer '${input.producer}' 不合法（允许: ${producerCandidates.join(' ')})`,
      )
    }
  } else {
    if (requiresRequirementsChangedForSpecAdr(input)
      && !await currentSpecVisitEnteredViaRequirementsChanged(input.changeDir)) {
      throw new DocumentLedgerError(
        "ADR living-document 兼容面只允许当前 requirements-changed 回到 spec 的 visit",
      )
    }
    const recordAllowed = input.policy
      ? isDocumentRecordAllowedInPolicyStep(input.policy, input.kind, input.phase)
      : isDocumentContractPhase(input.phase) && isDocumentRecordAllowedInPhase(input.kind, input.phase)
    if (!recordAllowed) {
      throw new DocumentLedgerError(
        `'${input.kind}' 只能在其所属 phase 或允许的后续更新 phase 登记（当前 ${input.phase}）`,
      )
    }
    const producerAllowed = input.policy
      ? isDocumentProducerAllowedInPolicyStep(input.policy, input.kind, input.phase, input.producer)
      : isDocumentContractPhase(input.phase) && isDocumentProducerAllowedInPhase(input.kind, input.phase, input.producer)
    const candidates = input.policy
      ? recordProducerCandidatesForPolicyStep(input.policy, input.kind, input.phase)
      : isDocumentContractPhase(input.phase) ? recordProducerCandidatesFor(input.kind, input.phase) : []
    if (!producerAllowed) {
      throw new DocumentLedgerError(
        `document '${input.kind}' 的 producer '${input.producer}' 不合法（当前 ${input.phase} 允许: ${candidates.join(' ')})`,
      )
    }
  }
  if (!await hasSkillEvidence(input.changeDir, input.producer, input.phase, input.allowBackfill === true)) {
    throw new DocumentLedgerError(
      `缺少 Skill 调用证据（当前 phase）: '${input.producer}'；先由宿主在本 phase 实际调用该 skill，确认完成态证据已写入 history 后再登记 '${input.kind}'`,
    )
  }
  const replacement: DocumentRecord = {
    kind: input.kind,
    path: resolved.relativePath,
    sha256: resolved.digest,
    producer: input.producer,
    recordedAt: input.recordedAt,
    reads: old?.sha256 === resolved.digest ? old.reads : [],
  }
  // Singleton kinds use one named slot. Delta specs use one slot per canonical capability.
  // Unmapped legacy records remain intact until an explicit, digest-preserving migration.
  const records = current.records.filter((record) => {
    if (record.kind !== input.kind) return true
    if (record.kind !== 'delta-spec') return false
    const recordSlot = deltaSpecSlot(record.path, input.changeDir)
    return recordSlot === undefined || recordSlot !== slot
  })
  records.push(replacement)
  const next: DocumentLedger = { ...current, records }
  await writeDocumentLedger(input.changeDir, next)
  return next
}

export interface MigrateLegacyDeltaDocumentInput {
  readonly repoRoot: string
  readonly changeDir: string
  readonly legacyPath: string
  readonly canonicalPath: string
}

/** Replace one explicitly named legacy delta path without changing its digest or provenance. */
export async function migrateLegacyDeltaDocument(
  input: MigrateLegacyDeltaDocumentInput,
): Promise<DocumentLedger> {
  const current = await readDocumentLedger(input.changeDir)
  if (!current) throw new DocumentLedgerError('document ledger 缺失；先执行 tenon document init')
  const canonical = await resolveDocument(input.repoRoot, input.canonicalPath)
  const slot = documentSlot('delta-spec', canonical.relativePath, input.changeDir)
  const source = current.records.find((record) =>
    record.kind === 'delta-spec'
    && record.path === input.legacyPath
    && deltaSpecSlot(record.path, input.changeDir) === undefined)
  const target = current.records.find((record) =>
    record.kind === 'delta-spec' && deltaSpecSlot(record.path, input.changeDir) === slot)
  if (!source) {
    if (target?.path === canonical.relativePath && target.sha256 === canonical.digest) return current
    throw new DocumentLedgerError(`未找到指定的旧 delta-spec record: ${input.legacyPath}`)
  }
  if (source.sha256 !== canonical.digest) {
    throw new DocumentLedgerError('迁移拒绝：canonical 文件内容与旧 delta-spec digest 不一致')
  }
  if (target && target.sha256 !== source.sha256) {
    throw new DocumentLedgerError(`迁移拒绝：目标槽 '${slot}' 已有不同内容`)
  }
  if (target && (target.producer !== source.producer || target.recordedAt !== source.recordedAt)) {
    throw new DocumentLedgerError(`迁移拒绝：目标槽 '${slot}' 与旧 record 的 provenance 冲突`)
  }
  const receipts = new Map<string, DocumentReadReceipt>()
  for (const receipt of target?.reads ?? []) receipts.set(receiptKey(receipt), receipt)
  for (const receipt of source.reads) {
    const key = receiptKey(receipt)
    const existing = receipts.get(key)
    if (existing && JSON.stringify(existing) !== JSON.stringify(receipt)) {
      throw new DocumentLedgerError(`迁移拒绝：目标槽 '${slot}' 的 ${receipt.phase} read receipt 冲突`)
    }
    receipts.set(key, receipt)
  }
  const replacement: DocumentRecord = target
    ? { ...target, reads: [...receipts.values()] }
    : { ...source, path: canonical.relativePath, reads: [...receipts.values()] }
  const records = current.records.filter((record) => record !== source && record !== target)
  records.push(replacement)
  const next: DocumentLedger = { ...current, records }
  await writeDocumentLedger(input.changeDir, next)
  return next
}

export interface ReadDocumentsInput {
  readonly repoRoot: string
  readonly changeDir: string
  readonly phase: string
  readonly policy?: DocumentGovernancePolicy
  readonly kind: DocumentKind | 'all'
  readonly readAt: string
}

export async function recordDocumentReads(input: ReadDocumentsInput): Promise<DocumentLedger> {
  const current = await readDocumentLedger(input.changeDir)
  if (!current) throw new DocumentLedgerError(`document ledger 缺失；先执行 tenon document init`)
  const visitId = await currentDocumentStepVisitId(input.changeDir)
  const requiredKinds = input.policy
    ? readsRequiredForPolicyStep(input.policy, input.phase)
    : isDocumentContractPhase(input.phase) ? readsRequiredForPhase(input.phase) : []
  const kinds = input.kind === 'all' ? [...requiredKinds] : [input.kind]
  for (const kind of kinds) {
    if (!requiredKinds.includes(kind)) {
      throw new DocumentLedgerError(`phase '${input.phase}' 不要求读取 document '${kind}'`)
    }
  }
  const selected = current.records.filter((record) => kinds.includes(record.kind))
  for (const kind of kinds) {
    if (!selected.some((record) => record.kind === kind)) {
      throw new DocumentLedgerError(`缺少 document '${kind}'；先登记后再读取`)
    }
  }
  const legacyDelta = selected.filter((record) =>
    record.kind === 'delta-spec' && deltaSpecSlot(record.path, input.changeDir) === undefined)
  if (legacyDelta.length > 0) {
    throw new DocumentLedgerError(
      `存在旧 delta-spec 记录，必须用 tenon document migrate-delta 显式迁移: ${legacyDelta.map((record) => record.path).join(', ')}`,
    )
  }
  const updated: DocumentRecord[] = []
  for (const record of current.records) {
    if (!kinds.includes(record.kind)) {
      updated.push(record)
      continue
    }
    const resolved = await resolveDocument(input.repoRoot, record.path)
    if (resolved.digest !== record.sha256) {
      throw new DocumentLedgerError(`document '${record.kind}' 已变更: ${record.path}；先重新 record 后再 read`)
    }
    const reads = record.reads.filter(
      (receipt) => receipt.phase !== input.phase || receipt.visitId !== visitId,
    )
    reads.push({ phase: input.phase, sha256: resolved.digest, readAt: input.readAt, visitId })
    updated.push({ ...record, reads })
  }
  const next: DocumentLedger = { ...current, records: updated }
  await writeDocumentLedger(input.changeDir, next)
  return next
}
