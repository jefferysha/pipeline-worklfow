/**
 * Host-owned Codex transcript verification for skill evidence.
 *
 * The direct PreToolUse receipt path stays deliberately small and exact.  The fallback discovery
 * path exists for Codex hosts that omit receipt identity or PostToolUse: it can scan a legitimately
 * long active transcript, but only inside the host sessions root and under both per-file and total
 * byte budgets.  This is a cold path executed while the change lock is held.
 */
import { createReadStream, type Dirent } from 'node:fs'
import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import type { CodexSkillReceipt } from './codexSkillReceipt.js'
import {
  codexHomeRoot,
  trustedCodexSkillPath,
  type CodexSkillTrustRoots,
} from './codexSkillTrust.js'
import { transcriptExecCommands } from './codexToolProgram.js'

const MAX_RECEIPT_TRANSCRIPT_BYTES = 64 * 1024 * 1024
const MAX_DISCOVERY_TRANSCRIPT_BYTES = 512 * 1024 * 1024
const MAX_DISCOVERY_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_DISCOVERED_TRANSCRIPTS = 32

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isInside(base: string, candidate: string): boolean {
  const fromBase = relative(base, candidate)
  return fromBase !== '' && fromBase !== '..' && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase)
}

function codexSessionsRoot(homeDir: string, configured?: string): string {
  return join(codexHomeRoot(homeDir, configured), 'sessions')
}

function isTrustedTranscriptPath(transcriptPath: string, homeDir: string, configured?: string): boolean {
  if (!isAbsolute(transcriptPath) || !transcriptPath.endsWith('.jsonl')) return false
  return isInside(codexSessionsRoot(homeDir, configured), resolve(transcriptPath))
}

function responseItemAtOrAfter(event: Record<string, unknown>, notBefore?: string): boolean {
  if (notBefore === undefined) return true
  const timestamp = asString(event.timestamp)
  if (!timestamp) return false
  const eventTime = Date.parse(timestamp)
  const lowerBound = Date.parse(notBefore)
  return !Number.isNaN(eventTime) && !Number.isNaN(lowerBound) && eventTime >= lowerBound
}
function receiptTurnId(payload: Record<string, unknown>): string | undefined {
  const metadata = payload.internal_chat_message_metadata_passthrough
  if (!isRecord(metadata)) return undefined
  return asString(metadata.turn_id)
}
function explicitExitCode(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = explicitExitCode(item)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  if (typeof value.exit_code === 'number') return value.exit_code
  for (const item of Object.values(value)) {
    const found = explicitExitCode(item)
    if (found !== undefined) return found
  }
  return undefined
}

function successfulOutput(value: unknown): boolean {
  const exitCode = explicitExitCode(value)
  if (exitCode !== undefined) return exitCode === 0
  if (typeof value === 'string') {
    const statuses = [...value.matchAll(
      /(?:Process exited with code|exit_code["']?\s*:)\s*(\d+)\b/g,
    )].map((match) => Number(match[1]))
    return statuses.length > 0 && statuses.every((status) => status === 0)
  }
  if (Array.isArray(value)) return value.some((item) => successfulOutput(item))
  if (!isRecord(value)) return false
  if (typeof value.exit_code === 'number') return value.exit_code === 0
  return Object.values(value).some((item) => successfulOutput(item))
}
function functionExecCommand(payload: Record<string, unknown>): string | undefined {
  if (payload.type !== 'function_call' || asString(payload.name) !== 'exec_command') return undefined
  const argumentsText = asString(payload.arguments)
  if (!argumentsText) return undefined
  try {
    const args = JSON.parse(argumentsText) as unknown
    if (!isRecord(args)) return undefined
    return asString(args.cmd) ?? asString(args.command)
  } catch {
    return undefined
  }
}
/** Verify an exact PreToolUse receipt against its completed host call. */
export async function transcriptConfirmsReceipt(
  receipt: CodexSkillReceipt,
  trustRoots: CodexSkillTrustRoots,
  repoRoot: string,
  homeDir = homedir(),
  configured?: string,
  notBefore?: string,
): Promise<boolean> {
  const expectedSkillPath = await trustedCodexSkillPath(
    trustRoots,
    receipt.skillId,
    homeDir,
    configured,
  )
  if (expectedSkillPath !== resolve(receipt.skillPath)) return false
  const sessionsRoot = codexSessionsRoot(homeDir, configured)
  const candidate = resolve(receipt.transcriptPath)
  if (!isTrustedTranscriptPath(receipt.transcriptPath, homeDir, configured)) return false

  let physicalRoot: string
  let physicalTranscript: string
  try {
    const info = await lstat(candidate)
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_RECEIPT_TRANSCRIPT_BYTES) return false
    physicalRoot = await realpath(sessionsRoot)
    physicalTranscript = await realpath(candidate)
    if (!isInside(physicalRoot, physicalTranscript)) return false
    const physicalInfo = await stat(physicalTranscript)
    if (!physicalInfo.isFile() || physicalInfo.size > MAX_RECEIPT_TRANSCRIPT_BYTES) return false
  } catch {
    return false
  }

  let matchesSession = false
  let matchesProject = false
  try {
    const input = createReadStream(physicalTranscript, { encoding: 'utf8' })
    const lines = createInterface({ input, crlfDelay: Infinity })
    for await (const line of lines) {
      let event: unknown
      try {
        event = JSON.parse(line) as unknown
      } catch {
        continue
      }
      if (!isRecord(event)) continue
      if (event.type === 'session_meta') {
        const session = event.payload
        if (isRecord(session)) {
          const sessionId = asString(session.session_id) ?? asString(session.id)
          matchesSession = sessionId === receipt.sessionId
          const cwd = asString(session.cwd)
          matchesProject = cwd !== undefined && await isSamePhysicalDirectory(cwd, repoRoot)
        }
        continue
      }
      if (
        !matchesSession
        || !matchesProject
        || event.type !== 'response_item'
        || !responseItemAtOrAfter(event, notBefore)
      ) continue
      const payload = event.payload
      if (!isRecord(payload) || receiptTurnId(payload) !== receipt.turnId) continue
      const functionCommand = functionExecCommand(payload)
      if (functionCommand !== undefined) {
        const callId = asString(payload.call_id)
        if (
          callId === receipt.toolUseId
          && commandReadsTrustedSkill(functionCommand, receipt.skillPath)
        ) return await matchingSuccessfulOutput(lines, receipt)
        continue
      }
      if (payload.type === 'custom_tool_call') {
        const callId = asString(payload.call_id)
        const name = asString(payload.name)
        const status = asString(payload.status)
        const command = asString(payload.input)
        if (
          callId === receipt.toolUseId
          && name === 'exec'
          && status === 'completed'
          && command !== undefined
          && transcriptInputReadsTrustedSkill(command, receipt.skillPath)
        ) return await matchingSuccessfulOutput(lines, receipt)
        continue
      }
    }
  } catch {
    return false
  }
  return false
}

async function matchingSuccessfulOutput(
  lines: AsyncIterable<string>,
  receipt: CodexSkillReceipt,
): Promise<boolean> {
  for await (const line of lines) {
    let event: unknown
    try {
      event = JSON.parse(line) as unknown
    } catch {
      continue
    }
    if (!isRecord(event) || event.type !== 'response_item') continue
    const payload = event.payload
    if (
      !isRecord(payload)
      || receiptTurnId(payload) !== receipt.turnId
      || (payload.type !== 'custom_tool_call_output' && payload.type !== 'function_call_output')
      || asString(payload.call_id) !== receipt.toolUseId
    ) continue
    return successfulOutput(payload.output)
  }
  return false
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function unwrapReadCommand(segment: string): string | undefined {
  const command = segment.trim()
  if (/^(?:cat|sed|head|tail)(?:\s|$)/.test(command)) return command
  for (const prefix of ['/bin/zsh -lc "', '/bin/zsh -c "', 'zsh -lc "', 'zsh -c "']) {
    if (!command.startsWith(prefix) || !command.endsWith('"')) continue
    return command.slice(prefix.length, -1)
  }
  return undefined
}

function finalReadPath(command: string): string | undefined {
  const quoted = /(?:"([^"\r\n]+)"|'([^'\r\n]+)'|(\S+))\s*$/.exec(command)
  return quoted?.[1] ?? quoted?.[2] ?? quoted?.[3]
}

/** The decoded command must structurally be a supported read of this exact host-cache asset. */
function commandReadsTrustedSkill(command: string, skillPath: string): boolean {
  if (command.includes('||')) return false
  const trustedPath = new RegExp(`^${escapeRegex(skillPath)}$`)
  const unwrapped = unwrapReadCommand(command) ?? command
  const hasAnd = unwrapped.includes('&&')
  const hasSequence = /;|\r?\n/.test(unwrapped)
  if (hasAnd && hasSequence) return false
  const segments = unwrapped.split(hasAnd ? /&&/ : /;|\r?\n/).filter((segment) => segment.trim() !== '')
  const skillsRoot = resolve(skillPath, '..', '..')
  let observedRead = false
  for (const segment of segments) {
    const commandSegment = unwrapReadCommand(segment) ?? segment.trim()
    const path = commandSegment ? finalReadPath(commandSegment) : undefined
    if (path === undefined) return false
    const sibling = relative(skillsRoot, resolve(path)).split(sep)
    if (sibling.length !== 2 || sibling[0] === '' || sibling[1] !== 'SKILL.md') return false
    if (/^(?:cat|sed|head|tail)(?:\s|$)/.test(commandSegment)) {
      if (trustedPath.test(path)) observedRead = true
      continue
    }
    if (/^wc\s+-(?:l|c|w)(?:\s|$)/.test(commandSegment)) continue
    return false
  }
  return observedRead
}

/** The transcript stores tool-program source, so inspect only its decoded, executed command values. */
function transcriptInputReadsTrustedSkill(input: string, skillPath: string): boolean {
  const commands = transcriptExecCommands(input)
  return commands.length === 1 && commandReadsTrustedSkill(commands[0] ?? '', skillPath)
}

function skillAliases(id: string): readonly string[] {
  const aliases = new Set<string>([id])
  if (id.startsWith('pipeline-lite:')) aliases.add(id.slice('pipeline-lite:'.length))
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

async function isSamePhysicalDirectory(left: string, right: string): Promise<boolean> {
  try {
    return await realpath(left) === await realpath(right)
  } catch {
    return false
  }
}

interface TranscriptFile {
  readonly path: string
  readonly modifiedAt: number
  readonly size: number
}

/** Enumerate current host transcripts without allowing one old archive to consume unbounded I/O. */
async function recentHostTranscripts(sessionsRoot: string): Promise<readonly string[]> {
  let physicalRoot: string
  try {
    physicalRoot = await realpath(sessionsRoot)
  } catch {
    return []
  }

  const discovered: TranscriptFile[] = []
  async function visit(directory: string, depth: number): Promise<void> {
    let entries: readonly Dirent<string>[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const candidate = join(directory, entry.name)
      if (entry.isDirectory() && depth < 3) {
        await visit(candidate, depth + 1)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      try {
        const info = await lstat(candidate)
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_DISCOVERY_TRANSCRIPT_BYTES) continue
        const physical = await realpath(candidate)
        if (!isInside(physicalRoot, physical)) continue
        discovered.push({ path: physical, modifiedAt: info.mtimeMs, size: info.size })
      } catch {
        // A concurrent host rotation cannot turn into proof.
      }
    }
  }
  await visit(physicalRoot, 0)

  let remaining = MAX_DISCOVERY_TOTAL_BYTES
  const selected: string[] = []
  for (const transcript of discovered.sort((left, right) => right.modifiedAt - left.modifiedAt)) {
    if (selected.length >= MAX_DISCOVERED_TRANSCRIPTS || transcript.size > remaining) continue
    selected.push(transcript.path)
    remaining -= transcript.size
  }
  return selected
}

function confirmsEveryCandidate(confirmed: ReadonlySet<string>, candidates: readonly string[]): boolean {
  return candidates.every((candidate) => [...confirmed].some((found) => skillsEquivalent(candidate, found)))
}

/**
 * ABI-compatibility proof for Codex hosts that omit transcript identifiers.  The caller supplies
 * only skill ids that the current phase allows; this function still requires the same physical
 * project root and an actual successful read from pipeline-lite's host cache.
 */
export async function discoverCompletedCodexSkillReads(
  repoRoot: string,
  candidateSkillIds: readonly string[],
  trustRoots: CodexSkillTrustRoots,
  homeDir = homedir(),
  configured?: string,
  hostSessionId?: string,
  notBefore?: string,
): Promise<readonly string[]> {
  const aliases = [...new Set(candidateSkillIds.flatMap(skillAliases))]
    .filter((id) => /^[A-Za-z0-9_-]{1,160}$/.test(id))
  if (aliases.length === 0) return []
  const selectedSkillPaths = new Map<string, string>()
  for (const alias of aliases) {
    const path = await trustedCodexSkillPath(trustRoots, alias, homeDir, configured)
    if (path) selectedSkillPaths.set(alias, path)
  }
  if (selectedSkillPaths.size === 0) return []
  const transcripts = await recentHostTranscripts(codexSessionsRoot(homeDir, configured))
  const confirmed = new Set<string>()

  for (const transcript of transcripts) {
    if (confirmsEveryCandidate(confirmed, candidateSkillIds)) break
    const readsByCall = new Map<string, readonly string[]>()
    let matchesRepo = false
    let matchesHostSession = hostSessionId === undefined
    try {
      const stream = createReadStream(transcript, { encoding: 'utf8' })
      const lines = createInterface({ input: stream, crlfDelay: Infinity })
      for await (const line of lines) {
        let event: unknown
        try {
          event = JSON.parse(line) as unknown
        } catch {
          continue
        }
        if (!isRecord(event)) continue
        if (event.type === 'session_meta') {
          const payload = event.payload
          if (isRecord(payload)) {
            const cwd = asString(payload.cwd)
            if (cwd) matchesRepo = await isSamePhysicalDirectory(cwd, repoRoot)
            if (hostSessionId !== undefined) {
              const sessionId = asString(payload.session_id) ?? asString(payload.id)
              matchesHostSession = sessionId === hostSessionId
            }
          }
          continue
        }
        if (
          !matchesRepo
          || !matchesHostSession
          || event.type !== 'response_item'
          || !responseItemAtOrAfter(event, notBefore)
        ) continue
        const payload = event.payload
        if (!isRecord(payload)) continue
        const functionCommand = functionExecCommand(payload)
        if (functionCommand !== undefined) {
          const callId = asString(payload.call_id)
          if (!callId) continue
          const readIds = aliases.filter(
            (id) => {
              const path = selectedSkillPaths.get(id)
              return path !== undefined && commandReadsTrustedSkill(functionCommand, path)
            },
          )
          if (readIds.length > 0) readsByCall.set(callId, readIds)
          continue
        }
        if (payload.type === 'custom_tool_call') {
          const callId = asString(payload.call_id)
          const name = asString(payload.name)
          const status = asString(payload.status)
          const toolInput = asString(payload.input)
          if (!callId || name !== 'exec' || status !== 'completed' || !toolInput) continue
          const readIds = aliases.filter((id) => {
            const path = selectedSkillPaths.get(id)
            return path !== undefined && transcriptInputReadsTrustedSkill(toolInput, path)
          })
          if (readIds.length > 0) readsByCall.set(callId, readIds)
          continue
        }
        if (payload.type !== 'custom_tool_call_output' && payload.type !== 'function_call_output') continue
        const callId = asString(payload.call_id)
        if (callId && successfulOutput(payload.output)) {
          for (const id of readsByCall.get(callId) ?? []) confirmed.add(id)
          if (confirmsEveryCandidate(confirmed, candidateSkillIds)) break
        }
      }
    } catch {
      // An unreadable/rotated transcript cannot provide evidence; continue with another host file.
    }
  }
  return [...confirmed]
}
