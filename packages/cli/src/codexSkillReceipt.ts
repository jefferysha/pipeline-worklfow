/**
 * Codex transcript-backed skill evidence bridge.
 *
 * Some Codex App/CLI tool paths invoke PreToolUse but do not emit the paired PostToolUse callback.
 * A PreToolUse receipt is therefore only a pending pointer to a host-owned transcript.  It never
 * becomes workflow evidence by itself: document registration and custom-workflow DAG checks first
 * locate the completed matching `custom_tool_call` plus successful output in that transcript, then
 * append the normal `CodexSkillRead` history entry under the target change lock.
 *
 * This is intentionally CLI adapter infrastructure, not kernel domain logic.  The kernel continues
 * to consume the same append-only history contract from every host.
 */
import { createHash } from 'node:crypto'
import { appendFile, lstat, mkdir, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  DOCUMENT_SKILL_CONFIRMATIONS_FILE,
  HISTORY_FILE,
  TERMINAL_SESSION_BINDINGS_DIR,
  TERMINAL_SESSION_PROTOCOL,
  withLock,
} from '@tenon/kernel'
import { recordCodexDocumentSkillConfirmation } from '../../kernel/dist/skill-invocation/producer-internal.js'
import type { HistoryWriter } from '@tenon/kernel'
import { errMsg, type CliDeps } from './deps.js'
import { isValidChangeName } from './paths.js'
import { discoverCompletedCodexSkillReads, transcriptConfirmsReceipt } from './codexTranscriptEvidence.js'
import {
  productionCodexSkillTrustRoots,
  trustedCodexSkillPath,
  type CodexSkillTrustRoots,
} from './codexSkillTrust.js'

export const CODEX_SKILL_RECEIPTS_FILE = join('.pipeline', 'codex-skill-receipts.jsonl')
/** @deprecated Confirmations are host-neutral even when the adapter is Codex. */
export const CODEX_SKILL_CONFIRMATIONS_FILE = DOCUMENT_SKILL_CONFIRMATIONS_FILE

const RECEIPT_VERSION = 1
export interface CodexSkillReceipt {
  readonly version: 1
  readonly receivedAt: string
  /** Exact active Change selected for this host session; never infer from journal mtime. */
  readonly changeName: string
  readonly skillId: string
  /** Exact host cache asset that PreToolUse structurally verified as a bundled SKILL.md read. */
  readonly skillPath: string
  /** Host-owned, never project-owned transcript pointer. */
  readonly transcriptPath: string
  readonly sessionId: string
  readonly turnId: string
  readonly toolUseId: string
}

export interface CodexSkillEvidenceResult {
  readonly confirmedSkillIds: readonly string[]
}

export interface CodexSkillEvidenceInput {
  readonly repoRoot: string
  readonly changeDir: string
  /** Exact document producer whose host call may be reconciled. */
  readonly producer?: string
  /** Current custom-workflow step's declared skill ids for a DAG reconciliation. */
  readonly candidateSkillIds?: readonly string[]
  readonly recordedAt: string
  readonly history?: HistoryWriter
  /**
   * Current canonical phase/step. Evidence is deduplicated only since the latest transition into
   * this node, so a lawful workflow loop (for example build → spec) must prove the skill again.
   */
  readonly evidenceScope?: string
  /** Exact canonical StepVisit for document-production evidence. */
  readonly stepVisit?: { readonly runId: string; readonly transitionSequence: number }
  /** Canonical document application key; hashed by the kernel and never persisted as caller text. */
  readonly applicationKey?: string
  /** Injectable for tests; production uses the current process user's Codex home. */
  readonly homeDir?: string
  /** Injectable Codex data root.  Production honours CODEX_HOME before falling back to ~/.codex. */
  readonly codexHomeDir?: string
  /** Exact plugin payload selected by Codex bootstrap for this host process. */
  readonly selectedPluginRoot?: string
  /** Exact process-provided trust roots; tests inject all three canonical root classes here. */
  readonly trustRoots?: CodexSkillTrustRoots
}

export interface CodexSkillReceiptCommandEnv {
  homeDir(): string
  codexHomeDir?(): string | undefined
  selectedPluginRoot?(): string | undefined
  trustRoots?(): CodexSkillTrustRoots
}

export const REAL_CODEX_SKILL_RECEIPT_ENV: CodexSkillReceiptCommandEnv = {
  homeDir: () => homedir(),
  codexHomeDir: () => process.env.CODEX_HOME,
  selectedPluginRoot: () => process.env.TENON_CODEX_PLUGIN_ROOT,
  trustRoots: productionCodexSkillTrustRoots,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isSafeSkillId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,160}$/.test(value)
}

function isSafeOpaqueId(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,256}$/.test(value)
}

function isInside(base: string, candidate: string): boolean {
  const fromBase = relative(base, candidate)
  return fromBase !== '' && fromBase !== '..' && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase)
}

function codexSessionsRoot(homeDir: string, configured?: string): string {
  const candidate = configured?.trim() || process.env.CODEX_HOME?.trim()
  const codexHome = candidate ? resolve(candidate) : resolve(homeDir, '.codex')
  return join(codexHome, 'sessions')
}

function isTrustedTranscriptPath(transcriptPath: string, homeDir: string, configured?: string): boolean {
  if (!isAbsolute(transcriptPath) || !transcriptPath.endsWith('.jsonl')) return false
  return isInside(codexSessionsRoot(homeDir, configured), resolve(transcriptPath))
}

function parseReceipt(value: unknown): CodexSkillReceipt | undefined {
  if (!isRecord(value) || value.version !== RECEIPT_VERSION) return undefined
  const receivedAt = asString(value.receivedAt)
  const changeName = asString(value.changeName)
  const skillId = asString(value.skillId)
  const skillPath = asString(value.skillPath)
  const transcriptPath = asString(value.transcriptPath)
  const sessionId = asString(value.sessionId)
  const turnId = asString(value.turnId)
  const toolUseId = asString(value.toolUseId)
  if (!receivedAt || !changeName || !skillId || !skillPath || !transcriptPath || !sessionId || !turnId || !toolUseId) return undefined
  if (!isValidChangeName(changeName) || !isSafeSkillId(skillId) || !isSafeOpaqueId(sessionId) || !isSafeOpaqueId(turnId) || !isSafeOpaqueId(toolUseId)) {
    return undefined
  }
  return {
    version: RECEIPT_VERSION,
    receivedAt,
    changeName,
    skillId,
    skillPath,
    transcriptPath,
    sessionId,
    turnId,
    toolUseId,
  }
}

async function regularFile(path: string): Promise<boolean> {
  try {
    const info = await lstat(path)
    return info.isFile() && !info.isSymbolicLink()
  } catch {
    return false
  }
}

async function trustedSelectedSkillPath(
  skillPath: string,
  skillId: string,
  trustRoots: CodexSkillTrustRoots,
  homeDir: string,
  configured?: string,
): Promise<boolean> {
  return await trustedCodexSkillPath(trustRoots, skillId, homeDir, configured) === resolve(skillPath)
}

async function validatedReceipt(
  value: CodexSkillReceipt,
  trustRoots: CodexSkillTrustRoots,
  homeDir: string,
  configured?: string,
): Promise<CodexSkillReceipt | undefined> {
  if (!await trustedSelectedSkillPath(value.skillPath, value.skillId, trustRoots, homeDir, configured)) return undefined
  if (!isTrustedTranscriptPath(value.transcriptPath, homeDir, configured)) return undefined
  return value
}

async function appendReceipt(repoRoot: string, receipt: CodexSkillReceipt): Promise<void> {
  const journalDir = join(resolve(repoRoot), '.pipeline')
  await mkdir(journalDir, { recursive: true })
  const line = `${JSON.stringify(receipt)}\n`
  // This receipt journal is append-only.  The existing cross-process mkdir lock serializes writers;
  // appendFile then emits exactly one complete JSONL record while that lock is held.
  await withLock(journalDir, async () => {
    await appendFile(join(journalDir, 'codex-skill-receipts.jsonl'), line, 'utf8')
  })
}

async function loadReceipts(repoRoot: string): Promise<readonly CodexSkillReceipt[]> {
  const path = join(resolve(repoRoot), CODEX_SKILL_RECEIPTS_FILE)
  if (!await regularFile(path)) return []
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return []
  }
  const receipts: CodexSkillReceipt[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      const receipt = parseReceipt(JSON.parse(line) as unknown)
      if (receipt) receipts.push(receipt)
    } catch {
      // A malformed append-only record cannot prove anything.  Keep scanning later records.
    }
  }
  return receipts
}

function skillAliases(id: string): readonly string[] {
  const aliases = new Set<string>([id])
  if (id.startsWith('tenon:')) aliases.add(id.slice('tenon:'.length))
  if (id.startsWith('superpowers:')) aliases.add(id.slice('superpowers:'.length))
  if (id === 'opsx:propose') aliases.add('openspec-propose')
  if (id === 'openspec-propose') aliases.add('opsx:propose')
  if (id === 'opsx:apply') aliases.add('openspec-apply-change')
  if (id === 'openspec-apply-change') aliases.add('opsx:apply')
  return [...aliases]
}

function skillsEquivalent(left: string, right: string): boolean {
  const leftAliases = new Set(skillAliases(left))
  return skillAliases(right).some((candidate) => leftAliases.has(candidate))
}

interface CurrentVisitEvidence {
  readonly completedSkillIds: ReadonlySet<string>
  readonly startedAt?: string
  readonly valid: boolean
}

function validTimestamp(value: unknown): string | undefined {
  const timestamp = asString(value)
  return timestamp !== undefined && !Number.isNaN(Date.parse(timestamp)) ? timestamp : undefined
}

function currentVisitEvidence(history: string, evidenceScope?: string): CurrentVisitEvidence {
  const entries: unknown[] = []
  for (const line of history.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      entries.push(JSON.parse(line) as unknown)
    } catch {
      // A malformed old row cannot satisfy evidence or conceal later valid rows.
    }
  }
  let start = 0
  let startedAt: string | undefined
  let valid = evidenceScope === undefined
  if (evidenceScope) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (isRecord(entry) && entry.kind === 'transition' && entry.to === evidenceScope) {
        start = index + 1
        startedAt = validTimestamp(entry.ts)
        valid = startedAt !== undefined
        break
      }
    }
    const hasAnyTransition = entries.some(
      (entry) => isRecord(entry) && entry.kind === 'transition',
    )
    if (!valid && !hasAnyTransition) {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index]
        if (isRecord(entry) && entry.kind === 'init') {
          start = index + 1
          startedAt = validTimestamp(entry.ts)
          valid = startedAt !== undefined
          break
        }
      }
    }
  }
  const ids = new Set<string>()
  for (const entry of entries.slice(start)) {
    if (!isRecord(entry) || entry.kind !== 'tool') continue
    const raw = asString(entry.raw)
    const match = raw ? /^(?:Skill|CodexSkillRead): (.+)$/.exec(raw) : null
    if (match?.[1]) ids.add(match[1])
  }
  return { completedSkillIds: ids, startedAt, valid }
}

async function readHistory(changeDir: string): Promise<string> {
  try {
    return await readFile(join(changeDir, HISTORY_FILE), 'utf8')
  } catch {
    return ''
  }
}

/**
 * Prefer the exact host conversation bound by the normal-chat router when Codex omitted a
 * PreToolUse receipt identity. The binding only narrows fallback transcript discovery; it can
 * neither create evidence nor mutate workflow state.
 */
async function latestBoundHostSessionId(repoRoot: string, changeName: string): Promise<string | undefined> {
  const bindingsDir = join(resolve(repoRoot), TERMINAL_SESSION_BINDINGS_DIR)
  let entries: readonly string[]
  try {
    entries = await readdir(bindingsDir)
  } catch {
    return undefined
  }

  let latest: { readonly sessionId: string; readonly boundAt: string } | undefined
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const path = join(bindingsDir, entry)
    if (!await regularFile(path)) continue
    try {
      const value = JSON.parse(await readFile(path, 'utf8')) as unknown
      if (!isRecord(value) || value.protocol !== TERMINAL_SESSION_PROTOCOL || asString(value.change) !== changeName) continue
      const sessionId = asString(value.session_id)
      const boundAt = asString(value.bound_at)
      if (!sessionId || !boundAt || !isSafeOpaqueId(sessionId) || Number.isNaN(Date.parse(boundAt))) continue
      if (latest === undefined || boundAt > latest.boundAt) latest = { sessionId, boundAt }
    } catch {
      // A damaged dashboard projection cannot broaden evidence discovery.
    }
  }
  return latest?.sessionId
}

/**
 * Reconcile only host-completed reads into normal history entries.  Callers must already hold the
 * target change lock, so ledger/DAG evaluation observes the appended proof in the same critical
 * section rather than racing an asynchronous hook.
 */
export async function reconcileCodexSkillEvidence(input: CodexSkillEvidenceInput): Promise<CodexSkillEvidenceResult> {
  if (!input.history) return { confirmedSkillIds: [] }
  const homeDir = input.homeDir ?? homedir()
  const codexHomeDir = input.codexHomeDir
  const selectedPluginRoot = input.selectedPluginRoot ?? process.env.TENON_CODEX_PLUGIN_ROOT
  const trustRoots = input.trustRoots
    ?? (selectedPluginRoot ? { selectedCacheRoot: selectedPluginRoot } : productionCodexSkillTrustRoots())
  const visitEvidence = currentVisitEvidence(await readHistory(input.changeDir), input.evidenceScope)
  if (!visitEvidence.valid) return { confirmedSkillIds: [] }
  const existing = visitEvidence.completedSkillIds
  // Document production needs a fresh v2 binding for this exact StepVisit even when the normal
  // skill gate already wrote CodexSkillRead in the same visit.  That earlier row proves ordering,
  // but it does not carry the run/sequence identity required by the evidence producer.
  const deduplicatedExisting = input.stepVisit === undefined ? existing : new Set<string>()
  const changeName = basename(resolve(input.changeDir))
  if (!isValidChangeName(changeName)) return { confirmedSkillIds: [] }
  const boundHostSessionId = await latestBoundHostSessionId(input.repoRoot, changeName)
  const receipts = await loadReceipts(input.repoRoot)
  const confirmed = new Set<string>()

  for (const rawReceipt of receipts) {
    if (rawReceipt.changeName !== changeName) continue
    if (
      visitEvidence.startedAt !== undefined
      && Date.parse(rawReceipt.receivedAt) < Date.parse(visitEvidence.startedAt)
    ) continue
    if (input.producer && !skillsEquivalent(rawReceipt.skillId, input.producer)) continue
    if ([...deduplicatedExisting, ...confirmed].some((skill) => skillsEquivalent(skill, rawReceipt.skillId))) continue
    const receipt = await validatedReceipt(rawReceipt, trustRoots, homeDir, codexHomeDir)
    if (!receipt) continue
    if (
      await transcriptConfirmsReceipt(
        receipt,
        trustRoots,
        input.repoRoot,
        homeDir,
        codexHomeDir,
        visitEvidence.startedAt,
      )
    ) confirmed.add(receipt.skillId)
  }

  // Current Codex hook ABI can omit receipt identity for one or more reads in a batched exec.
  // Always discover the unresolved candidates, not only the all-or-nothing "no receipt" case:
  // otherwise a strict receipt for the first SKILL.md suppresses transcript proof for later skills
  // from the same completed host call. Discovery remains bound to this physical project root and
  // the same trusted plugin cache that supplied the instructions.
  const candidates = [...new Set([
    ...(input.producer ? [input.producer] : []),
    ...(input.candidateSkillIds ?? []),
  ])]
  const unresolvedCandidates = candidates.filter(
    (candidate) =>
      ![...deduplicatedExisting, ...confirmed].some((skill) => skillsEquivalent(skill, candidate)),
  )
  if (unresolvedCandidates.length > 0 && boundHostSessionId !== undefined) {
    for (const skillId of await discoverCompletedCodexSkillReads(
      input.repoRoot,
      unresolvedCandidates,
      trustRoots,
      homeDir,
      codexHomeDir,
      boundHostSessionId,
      visitEvidence.startedAt,
    )) {
      if (![...deduplicatedExisting, ...confirmed].some((skill) => skillsEquivalent(skill, skillId))) confirmed.add(skillId)
    }
  }

  const recorded = new Set<string>()
  for (const skillId of confirmed) {
    const receiptHash = createHash('sha256')
      .update(changeName).update('\0').update(skillId).update('\0').update(input.recordedAt)
    if (input.stepVisit !== undefined) {
      receiptHash.update('\0').update(input.stepVisit.runId)
        .update('\0').update(String(input.stepVisit.transitionSequence))
    }
    const receiptDigest = `sha256:${receiptHash.digest('hex')}`
    if (input.stepVisit !== undefined) {
      const confirmationRecorded = await recordCodexDocumentSkillConfirmation(
        input.changeDir,
        skillId,
        input.recordedAt,
        input.evidenceScope ?? '',
        input.stepVisit,
        receiptDigest,
        input.applicationKey,
      )
      if (!confirmationRecorded) continue
    }
    await input.history.append(input.changeDir, {
      ts: input.recordedAt,
      kind: 'tool',
      raw: `CodexSkillRead: ${skillId}`,
    })
    if (input.stepVisit !== undefined) {
      await input.history.append(input.changeDir, {
        ts: input.recordedAt,
        kind: 'tool',
        raw: `CodexSkillReadBinding: ${skillId} ${input.stepVisit.runId} ${input.stepVisit.transitionSequence}`,
      })
    }
    recorded.add(skillId)
  }
  return { confirmedSkillIds: [...recorded] }
}

/** Hidden hook target.  It records only a pending receipt; it never writes skill completion evidence. */
export async function cmdInternalCodexSkillReceipt(
  deps: CliDeps,
  changeName: string,
  skillId: string,
  skillPath: string,
  transcriptPath: string,
  sessionId: string,
  turnId: string,
  toolUseId: string,
  env: CodexSkillReceiptCommandEnv = REAL_CODEX_SKILL_RECEIPT_ENV,
): Promise<number> {
  try {
    const parsed = parseReceipt({
      version: RECEIPT_VERSION,
      receivedAt: deps.clock(),
      changeName,
      skillId,
      skillPath,
      transcriptPath,
      sessionId,
      turnId,
      toolUseId,
    })
    const selectedPluginRoot = env.selectedPluginRoot?.() ?? process.env.TENON_CODEX_PLUGIN_ROOT
    const trustRoots = env.trustRoots?.()
      ?? (selectedPluginRoot ? { selectedCacheRoot: selectedPluginRoot } : productionCodexSkillTrustRoots())
    const receipt = parsed
      ? await validatedReceipt(parsed, trustRoots, env.homeDir(), env.codexHomeDir?.())
      : undefined
    if (!receipt) {
      deps.io.err('internal-codex-skill-receipt: 收到不可信的 Codex skill receipt')
      return 1
    }
    await appendReceipt(deps.cwd, receipt)
    return 0
  } catch (error) {
    deps.io.err(`internal-codex-skill-receipt: ${errMsg(error)}`)
    return 1
  }
}
