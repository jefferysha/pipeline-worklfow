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

function codexHomeRoot(homeDir: string, configured?: string): string {
  const candidate = configured?.trim() || process.env.CODEX_HOME?.trim()
  return candidate && isAbsolute(candidate) ? resolve(candidate) : resolve(homeDir, '.codex')
}

function codexPluginCacheRoot(homeDir: string, configured?: string): string {
  return join(codexHomeRoot(homeDir, configured), 'plugins', 'cache', 'pipeline-lite', 'pipeline-lite')
}

function codexSessionsRoot(homeDir: string, configured?: string): string {
  return join(codexHomeRoot(homeDir, configured), 'sessions')
}

function isTrustedTranscriptPath(transcriptPath: string, homeDir: string, configured?: string): boolean {
  if (!isAbsolute(transcriptPath) || !transcriptPath.endsWith('.jsonl')) return false
  return isInside(codexSessionsRoot(homeDir, configured), resolve(transcriptPath))
}

function receiptTurnId(payload: Record<string, unknown>): string | undefined {
  const metadata = payload.internal_chat_message_metadata_passthrough
  if (!isRecord(metadata)) return undefined
  return asString(metadata.turn_id)
}

function successfulOutput(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.includes('Script completed') || /(?:Process exited with code|exit_code["']?\s*:)\s*0\b/.test(value)
  }
  if (Array.isArray(value)) return value.some((item) => successfulOutput(item))
  if (!isRecord(value)) return false
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
  homeDir = homedir(),
  configured?: string,
): Promise<boolean> {
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

  const matchingCalls = new Set<string>()
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
      if (!isRecord(event) || event.type !== 'response_item') continue
      const payload = event.payload
      if (!isRecord(payload) || receiptTurnId(payload) !== receipt.turnId) continue
      const functionCommand = functionExecCommand(payload)
      if (functionCommand !== undefined) {
        const callId = asString(payload.call_id)
        if (callId && functionCommand.includes(receipt.skillPath)) matchingCalls.add(callId)
        continue
      }
      if (payload.type === 'custom_tool_call') {
        const callId = asString(payload.call_id)
        const name = asString(payload.name)
        const status = asString(payload.status)
        const command = asString(payload.input)
        if (callId && name === 'exec' && status === 'completed' && command?.includes(receipt.skillPath)) matchingCalls.add(callId)
        continue
      }
      if (payload.type !== 'custom_tool_call_output' && payload.type !== 'function_call_output') continue
      const callId = asString(payload.call_id)
      if (callId && matchingCalls.has(callId) && successfulOutput(payload.output)) return true
    }
  } catch {
    return false
  }
  return false
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The host transcript stores JavaScript source for the custom tool call, not the command itself.
 * Extract only the JSON object actually passed to `tools.exec_command` before inspecting `cmd`.
 * In particular, a multiline command is represented there as the two source characters `\\n`;
 * matching the raw program text makes a real later `sed` look like the suffix of that `n`.
 */
function transcriptExecCommands(input: string): readonly string[] {
  const marker = 'tools.exec_command('
  const commands: string[] = []
  let cursor = 0

  while (cursor < input.length) {
    const markerAt = input.indexOf(marker, cursor)
    if (markerAt < 0) break
    let objectStart = markerAt + marker.length
    while (/\s/.test(input[objectStart] ?? '')) objectStart += 1
    if (input[objectStart] !== '{') {
      cursor = markerAt + marker.length
      continue
    }

    let depth = 0
    let inString = false
    let escaped = false
    let objectEnd: number | undefined
    for (let index = objectStart; index < input.length; index += 1) {
      const char = input[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') {
        inString = true
        continue
      }
      if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          objectEnd = index + 1
          break
        }
        if (depth < 0) break
      }
    }

    if (objectEnd === undefined) {
      cursor = markerAt + marker.length
      continue
    }
    try {
      const args = JSON.parse(input.slice(objectStart, objectEnd)) as unknown
      if (isRecord(args)) {
        const command = asString(args.cmd) ?? asString(args.command)
        if (command) commands.push(command)
      }
    } catch {
      // The host has emitted non-JSON JavaScript arguments.  Discovery deliberately declines
      // that ambiguous source instead of treating a string mention as completed skill evidence.
    }
    cursor = objectEnd
  }
  return commands
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
function commandReadsTrustedSkill(command: string, skillId: string, homeDir: string, configured?: string): boolean {
  const cacheRoot = codexPluginCacheRoot(homeDir, configured)
  const suffix = join('skills', skillId, 'SKILL.md')
  const trustedPath = new RegExp(
    `^${escapeRegex(cacheRoot)}${escapeRegex(sep)}[A-Za-z0-9._-]+${escapeRegex(sep)}${escapeRegex(suffix)}$`,
  )
  // Keep the same deliberately conservative grammar as the hot hook: separator handling inside
  // exotic quoted sed expressions fails closed, while normal multiline/&& Codex reads work.
  return command
    .split(/&&|\|\||;|\r?\n/)
    .some((segment) => {
      const read = unwrapReadCommand(segment)
      const path = read ? finalReadPath(read) : undefined
      return path !== undefined && trustedPath.test(path)
    })
}

/** The transcript stores tool-program source, so inspect only its decoded, executed command values. */
function transcriptInputReadsTrustedSkill(input: string, skillId: string, homeDir: string, configured?: string): boolean {
  return transcriptExecCommands(input)
    .some((command) => commandReadsTrustedSkill(command, skillId, homeDir, configured))
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
  homeDir = homedir(),
  configured?: string,
  hostSessionId?: string,
): Promise<readonly string[]> {
  const aliases = [...new Set(candidateSkillIds.flatMap(skillAliases))]
    .filter((id) => /^[A-Za-z0-9_-]{1,160}$/.test(id))
  if (aliases.length === 0) return []
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
        if (!matchesRepo || !matchesHostSession || event.type !== 'response_item') continue
        const payload = event.payload
        if (!isRecord(payload)) continue
        const functionCommand = functionExecCommand(payload)
        if (functionCommand !== undefined) {
          const callId = asString(payload.call_id)
          if (!callId) continue
          const readIds = aliases.filter(
            (id) => commandReadsTrustedSkill(functionCommand, id, homeDir, configured),
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
          const readIds = aliases.filter((id) => transcriptInputReadsTrustedSkill(toolInput, id, homeDir, configured))
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
