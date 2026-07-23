/**
 * OpenSpec document evidence sidecar.
 *
 * `.pipeline.yaml` remains canonical workflow state. This sidecar is an independently rebuildable
 * evidence ledger: it records only safe project-relative documents, their content digest, intended
 * producing skill, and exact-hash phase read receipts. Callers must hold the change lock while
 * mutating it; each write is still atomically published to avoid a partially visible ledger.
 */
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  DOCUMENT_CONTRACT_PHASES,
  isAcceptedDocumentProducer,
  isDocumentContractPhase,
  isDocumentKind,
  outputsRequiredForPhase,
  producerCandidatesFor,
  readsRequiredForPhase,
  recordsRequiredForPhase,
  type DocumentContractPhase,
  type DocumentKind,
} from '../workflow/document-contract.js'
import { atomicLinkPublish, atomicReplaceFile } from './atomic-publish.js'
import { HISTORY_FILE } from './history.js'

export const DOCUMENT_LEDGER_FILE = '.pipeline-documents.json'

export interface DocumentReadReceipt {
  readonly phase: DocumentContractPhase
  readonly sha256: string
  readonly readAt: string
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

export class DocumentLedgerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentLedgerError'
  }
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

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
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
  if (!phase || !isDocumentContractPhase(phase)) {
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].phase 非法`)
  }
  if (!digest || !validDigest(digest)) {
    throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].sha256 非法`)
  }
  if (!readAt) throw new DocumentLedgerError(`document ledger records[${recordIndex}].reads[${receiptIndex}].readAt 必须是非空字符串`)
  return { phase, sha256: digest, readAt }
}

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
  if (!producer || !isAcceptedDocumentProducer(kind, producer)) {
    throw new DocumentLedgerError(`document ledger records[${index}].producer 不属于 '${kind}' 的允许 skill`)
  }
  if (!recordedAt) throw new DocumentLedgerError(`document ledger records[${index}].recordedAt 必须是非空字符串`)
  if (!Array.isArray(item.reads)) throw new DocumentLedgerError(`document ledger records[${index}].reads 必须是数组`)
  const reads = item.reads.map((receipt, receiptIndex) => parseReceipt(receipt, index, receiptIndex))
  const readPhases = new Set<string>()
  for (const receipt of reads) {
    if (readPhases.has(receipt.phase)) {
      throw new DocumentLedgerError(`document ledger records[${index}] 对 phase '${receipt.phase}' 有重复 read receipt`)
    }
    readPhases.add(receipt.phase)
  }
  return { kind, path, sha256: digest, producer, recordedAt, reads }
}

function parseLedger(raw: string): DocumentLedger {
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
  return raw === undefined ? undefined : parseLedger(raw)
}

export async function ensureDocumentLedger(changeDir: string, createdAt: string): Promise<DocumentLedger> {
  const existing = await readDocumentLedger(changeDir)
  if (existing) return existing
  const ledger: DocumentLedger = { version: 1, contract: 'openspec-v1', createdAt, records: [] }
  const target = join(changeDir, DOCUMENT_LEDGER_FILE)
  try {
    await atomicLinkPublish(changeDir, '.pipeline-documents.tmp', target, `${JSON.stringify(ledger, null, 2)}\n`)
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
  parseLedger(content)
  await atomicReplaceFile(join(changeDir, DOCUMENT_LEDGER_FILE), content)
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/')
}

function inside(base: string, candidate: string): boolean {
  const pathFromBase = relative(base, candidate)
  return pathFromBase !== ''
    && pathFromBase !== '..'
    && !pathFromBase.startsWith(`..${sep}`)
    && !isAbsolute(pathFromBase)
}

/** Resolve a ledger document without allowing root escape, symlinks, or empty/non-file records. */
async function resolveDocument(repoRoot: string, path: string): Promise<{ readonly relativePath: string; readonly digest: string }> {
  if (!path || isAbsolute(path)) throw new DocumentLedgerError(`document path 必须是项目相对路径: ${path || '(empty)'}`)
  const lexicalTarget = resolve(repoRoot, path)
  if (!inside(resolve(repoRoot), lexicalTarget)) throw new DocumentLedgerError(`document path 越出项目根: ${path}`)
  const relativePath = normalizeRelativePath(relative(resolve(repoRoot), lexicalTarget))
  if (!relativePath.startsWith('openspec/') && !relativePath.startsWith('docs/')) {
    throw new DocumentLedgerError(`document path 只能位于 openspec/ 或 docs/: ${relativePath}`)
  }
  const info = await lstat(lexicalTarget)
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new DocumentLedgerError(`document 必须是非 symlink 普通文件: ${relativePath}`)
  }
  const [realRoot, realTarget, content] = await Promise.all([
    realpath(repoRoot), realpath(lexicalTarget), readFile(lexicalTarget),
  ])
  if (!inside(realRoot, realTarget)) throw new DocumentLedgerError(`document realpath 越出项目根: ${relativePath}`)
  if (content.byteLength === 0) throw new DocumentLedgerError(`document 不得为空: ${relativePath}`)
  return { relativePath, digest: sha256(content) }
}

function skillsEquivalent(left: string, right: string): boolean {
  const aliases = (id: string): readonly string[] => {
    const values = new Set<string>([id])
    if (id.startsWith('pipeline-lite:')) values.add(id.slice('pipeline-lite:'.length))
    if (id.startsWith('superpowers:')) values.add(id.slice('superpowers:'.length))
    if (id === 'opsx:propose') values.add('openspec-propose')
    if (id === 'openspec-propose') values.add('opsx:propose')
    if (id === 'opsx:apply') values.add('openspec-apply-change')
    if (id === 'openspec-apply-change') values.add('opsx:apply')
    return [...values]
  }
  const leftAliases = new Set(aliases(left))
  return aliases(right).some((candidate) => leftAliases.has(candidate))
}

async function hasSkillEvidence(changeDir: string, producer: string): Promise<boolean> {
  let text: string
  try {
    text = await readFile(join(changeDir, HISTORY_FILE), 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false
    throw error
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const entry = object(JSON.parse(trimmed))
      if (!entry || entry.kind !== 'tool') continue
      const raw = string(entry.raw)
      const match = raw ? /^Skill: (.+)$/.exec(raw) : null
      if (match && skillsEquivalent(match[1] ?? '', producer)) return true
    } catch {
      // JSONL history is intentionally append-only and may contain pre-existing malformed lines.
      // A malformed line cannot satisfy evidence, but it must not conceal a later valid Skill row.
    }
  }
  return false
}

export interface RecordDocumentInput {
  readonly repoRoot: string
  readonly changeDir: string
  readonly phase: DocumentContractPhase
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
  const ownerPhase = DOCUMENT_CONTRACT_PHASES.find((phase) =>
    outputsRequiredForPhase(phase).some((requirement) => requirement.kind === input.kind),
  )
  if (!ownerPhase) {
    // `DocumentKind` and the matrix live together, but fail closed if a future edit accidentally
    // adds a kind without assigning its owning phase.
    throw new DocumentLedgerError(`document '${input.kind}' 未声明所属 phase`)
  }
  if (ownerPhase !== input.phase) {
    const ownerIndex = DOCUMENT_CONTRACT_PHASES.indexOf(ownerPhase)
    const currentIndex = DOCUMENT_CONTRACT_PHASES.indexOf(input.phase)
    if (!input.allowBackfill) {
      throw new DocumentLedgerError(`'${input.kind}' 只能在其所属 phase 登记（当前 ${input.phase}）`)
    }
    if (ownerIndex > currentIndex) {
      throw new DocumentLedgerError(`'${input.kind}' 属于未来 phase '${ownerPhase}'，不能从当前 ${input.phase} backfill`)
    }
  }
  if (!isAcceptedDocumentProducer(input.kind, input.producer)) {
    throw new DocumentLedgerError(
      `document '${input.kind}' 的 producer '${input.producer}' 不合法（允许: ${producerCandidatesFor(input.kind).join(' ')})`,
    )
  }
  if (!await hasSkillEvidence(input.changeDir, input.producer)) {
    throw new DocumentLedgerError(
      `缺少 Skill 调用证据: '${input.producer}'；先由宿主实际调用该 skill，确认 PostToolUse history 已记录后再登记 '${input.kind}'`,
    )
  }
  const current = await readDocumentLedger(input.changeDir)
  if (!current) throw new DocumentLedgerError(`document ledger 缺失；先执行 pipeline document init`)
  const resolved = await resolveDocument(input.repoRoot, input.path)
  const old = current.records.find((record) => record.kind === input.kind && record.path === resolved.relativePath)
  const replacement: DocumentRecord = {
    kind: input.kind,
    path: resolved.relativePath,
    sha256: resolved.digest,
    producer: input.producer,
    recordedAt: input.recordedAt,
    reads: old?.sha256 === resolved.digest ? old.reads : [],
  }
  const records = current.records.filter((record) => !(record.kind === input.kind && record.path === resolved.relativePath))
  records.push(replacement)
  const next: DocumentLedger = { ...current, records }
  await writeDocumentLedger(input.changeDir, next)
  return next
}

export interface ReadDocumentsInput {
  readonly repoRoot: string
  readonly changeDir: string
  readonly phase: DocumentContractPhase
  readonly kind: DocumentKind | 'all'
  readonly readAt: string
}

export async function recordDocumentReads(input: ReadDocumentsInput): Promise<DocumentLedger> {
  const current = await readDocumentLedger(input.changeDir)
  if (!current) throw new DocumentLedgerError(`document ledger 缺失；先执行 pipeline document init`)
  const requiredKinds = readsRequiredForPhase(input.phase)
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
    const reads = record.reads.filter((receipt) => receipt.phase !== input.phase)
    reads.push({ phase: input.phase, sha256: resolved.digest, readAt: input.readAt })
    updated.push({ ...record, reads })
  }
  const next: DocumentLedger = { ...current, records: updated }
  await writeDocumentLedger(input.changeDir, next)
  return next
}

async function currentRecordDigest(repoRoot: string, record: DocumentRecord): Promise<string | undefined> {
  try {
    return (await resolveDocument(repoRoot, record.path)).digest
  } catch {
    return undefined
  }
}

export async function evaluateDocumentEvidence(
  repoRoot: string,
  changeDir: string,
  phase: DocumentContractPhase,
): Promise<DocumentEvidenceReport> {
  let ledger: DocumentLedger | undefined
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

  const recordRequirements = recordsRequiredForPhase(phase)
  const readRequirements = new Set(readsRequiredForPhase(phase))
  const kinds = new Set<DocumentKind>([
    ...recordRequirements.map((requirement) => requirement.kind),
    ...readRequirements,
  ])
  const blockers: string[] = []
  const items: DocumentEvidenceItem[] = []

  for (const kind of kinds) {
    const records = ledger.records.filter((record) => record.kind === kind)
    const requiredRead = readRequirements.has(kind)
    if (records.length === 0) {
      blockers.push(`缺少 document '${kind}'；执行 pipeline document record <change> ${kind} <path> --producer <skill>`)
      items.push({ kind, status: 'missing', requiredRead, paths: [], producers: [] })
      continue
    }
    const digests = await Promise.all(records.map((record) => currentRecordDigest(repoRoot, record)))
    const stale = records.some((record, index) => digests[index] !== record.sha256)
    if (stale) {
      blockers.push(`document '${kind}' 已缺失或内容变化；重新执行 pipeline document record 后再继续`)
      items.push({
        kind, status: 'stale', requiredRead,
        paths: records.map((record) => record.path), producers: records.map((record) => record.producer),
      })
      continue
    }
    if (requiredRead && records.some((record) => !record.reads.some(
      (receipt) => receipt.phase === phase && receipt.sha256 === record.sha256,
    ))) {
      blockers.push(`document '${kind}' 尚未由 ${phase} 读取；执行 pipeline document read <change> ${kind}`)
      items.push({
        kind, status: 'unread', requiredRead,
        paths: records.map((record) => record.path), producers: records.map((record) => record.producer),
      })
      continue
    }
    items.push({
      kind, status: 'recorded', requiredRead,
      paths: records.map((record) => record.path), producers: records.map((record) => record.producer),
    })
  }
  return { phase, hasLedger: true, pass: blockers.length === 0, blockers, items }
}
