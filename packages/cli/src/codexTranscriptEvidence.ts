/**
 * Host-owned Codex transcript verification for skill evidence.
 *
 * The direct PreToolUse receipt path stays deliberately small and exact.  The fallback discovery
 * path exists for Codex hosts that omit receipt identity or PostToolUse: it can scan a legitimately
 * long active transcript, but only inside the host sessions root and under both per-file and total
 * byte budgets.  This is a cold path executed while the change lock is held.
 */
import type { ReadStream } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { finished } from 'node:stream/promises'
import type { CodexSkillReceipt } from './codexSkillReceipt.js'
import {
  codexHomeRoot,
  trustedCodexSkillPath,
  type CodexSkillTrustRoots,
} from './codexSkillTrust.js'
import { transcriptExecInvocations } from './codexToolProgram.js'
import {
  explicitSiblingWorktreeTarget,
  isSameOrdinaryPhysicalDirectory,
} from './codexProjectIdentity.js'
import {
  commandTrustedSkillPaths,
  functionExecInvocation,
  outputMatchesTrustedSkillReads,
  transcriptInputTrustedSkillInvocation,
  type OutputAbi,
} from './codexTrustedSkillRead.js'
import {
  exactHostTranscript,
  hostTranscriptUnchanged,
  openVerifiedHostTranscript,
  recentHostTranscripts,
} from './codexTranscriptDiscovery.js'

// Long-lived Codex Desktop tasks can legitimately exceed 64 MiB. Exact receipts are still
// session/project/turn/tool/path bound and streamed rather than buffered, so use the same bounded
// ceiling as fallback discovery instead of making valid long conversations deadlock themselves.
const MAX_RECEIPT_TRANSCRIPT_BYTES = 512 * 1024 * 1024

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

async function settleBoundedStream(stream: ReadStream | undefined): Promise<void> {
  if (stream === undefined) return
  if (!stream.readableEnded && !stream.destroyed) stream.destroy()
  await finished(stream).catch(() => undefined)
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

  const transcript = await exactHostTranscript(sessionsRoot, candidate)
  if (transcript === undefined || transcript.size > MAX_RECEIPT_TRANSCRIPT_BYTES) return false
  const handle = await openVerifiedHostTranscript(transcript)
  if (handle === undefined) return false

  let matchesSession = false
  let matchesProject = false
  let sessionRoot: string | undefined
  let confirmed = false
  let input: ReadStream | undefined
  try {
    input = handle.createReadStream({
      encoding: 'utf8',
      autoClose: false,
      start: 0,
      end: transcript.size - 1,
    })
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
          sessionRoot = cwd
          matchesProject = cwd !== undefined
            && await isSameOrdinaryPhysicalDirectory(cwd, repoRoot)
        }
        continue
      }
      if (
        !matchesSession
        || event.type !== 'response_item'
        || !responseItemAtOrAfter(event, notBefore)
      ) continue
      const payload = event.payload
      if (!isRecord(payload) || receiptTurnId(payload) !== receipt.turnId) continue
      const functionInvocation = functionExecInvocation(payload)
      if (functionInvocation !== undefined) {
        const callId = asString(payload.call_id)
        const readPaths = commandTrustedSkillPaths(functionInvocation.command, receipt.skillPath)
        if (
          callId === receipt.toolUseId
          && (
            matchesProject
            || await explicitSiblingWorktreeTarget(sessionRoot, functionInvocation.workdir, repoRoot)
          )
          && readPaths !== undefined
        ) {
          confirmed = await matchingSuccessfulOutput(lines, receipt, 'function', readPaths)
          break
        }
        continue
      }
      if (payload.type === 'custom_tool_call') {
        const callId = asString(payload.call_id)
        const name = asString(payload.name)
        const status = asString(payload.status)
        const command = asString(payload.input)
        const invocation = command === undefined ? undefined
          : transcriptInputTrustedSkillInvocation(command, receipt.skillPath)
        if (
          callId === receipt.toolUseId
          && name === 'exec'
          && status === 'completed'
          && invocation !== undefined
          && (
            matchesProject
            || await explicitSiblingWorktreeTarget(sessionRoot, invocation.workdir, repoRoot)
          )
        ) {
          confirmed = await matchingSuccessfulOutput(
            lines,
            receipt,
            'custom',
            commandTrustedSkillPaths(invocation.command, receipt.skillPath) ?? [],
          )
          break
        }
        continue
      }
    }
    await settleBoundedStream(input)
    return confirmed && await hostTranscriptUnchanged(handle, transcript)
  } catch {
    return false
  } finally {
    await settleBoundedStream(input)
    await handle.close().catch(() => undefined)
  }
}

async function matchingSuccessfulOutput(
  lines: AsyncIterable<string>,
  receipt: CodexSkillReceipt,
  outputAbi: OutputAbi,
  readPaths: readonly string[],
): Promise<boolean> {
  if (readPaths.length === 0) return false
  const expectedOutputType = outputAbi === 'custom'
    ? 'custom_tool_call_output'
    : 'function_call_output'
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
      || payload.type !== expectedOutputType
      || asString(payload.call_id) !== receipt.toolUseId
    ) continue
    return outputMatchesTrustedSkillReads(payload.output, outputAbi, readPaths)
  }
  return false
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

function confirmsEveryCandidate(confirmed: ReadonlySet<string>, candidates: readonly string[]): boolean {
  return candidates.every((candidate) => [...confirmed].some((found) => skillsEquivalent(candidate, found)))
}

/**
 * ABI-compatibility proof for Codex hosts that omit transcript identifiers.  The caller supplies
 * only skill ids that the current phase allows; this function still requires the same physical
 * project root and an actual successful read from tenon's host cache.
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
  if (transcripts === undefined) return []
  const confirmed = new Set<string>()

  for (const transcript of transcripts) {
    if (confirmsEveryCandidate(confirmed, candidateSkillIds)) break
    const readsByCall = new Map<string, {
      readonly skillIds: readonly string[]
      readonly outputAbi: OutputAbi
      readonly readPaths: readonly string[]
    }>()
    const confirmedInLatestTurn = new Set<string>()
    let matchesRepo = false
    let matchesHostSession = hostSessionId === undefined
    let sessionRoot: string | undefined
    let latestTurnId: string | undefined
    let malformedTranscript = false
    const handle = await openVerifiedHostTranscript(transcript)
    if (handle === undefined) return []
    let stream: ReadStream | undefined
    try {
      stream = handle.createReadStream({
        encoding: 'utf8',
        autoClose: false,
        start: 0,
        end: transcript.size - 1,
      })
      const lines = createInterface({ input: stream, crlfDelay: Infinity })
      for await (const line of lines) {
        let event: unknown
        try {
          event = JSON.parse(line) as unknown
        } catch {
          malformedTranscript = true
          readsByCall.clear()
          confirmedInLatestTurn.clear()
          break
        }
        if (!isRecord(event)) continue
        if (event.type === 'session_meta') {
          const payload = event.payload
          if (isRecord(payload)) {
            const cwd = asString(payload.cwd)
            sessionRoot = cwd
            if (cwd) {
              matchesRepo = await isSameOrdinaryPhysicalDirectory(cwd, repoRoot)
            }
            if (hostSessionId !== undefined) {
              const sessionId = asString(payload.id)
              matchesHostSession = sessionId === hostSessionId
            }
          }
          continue
        }
        if (event.type === 'turn_context') {
          const payload = event.payload
          const turnId = isRecord(payload) ? asString(payload.turn_id) : undefined
          if (turnId === latestTurnId) continue
          latestTurnId = turnId
          readsByCall.clear()
          confirmedInLatestTurn.clear()
          continue
        }
        if (
          !matchesHostSession
          || latestTurnId === undefined
          || event.type !== 'response_item'
          || !responseItemAtOrAfter(event, notBefore)
        ) continue
        const payload = event.payload
        if (!isRecord(payload)) continue
        const eventTurnId = receiptTurnId(payload)
        if (eventTurnId !== undefined && eventTurnId !== latestTurnId) continue
        const functionInvocation = functionExecInvocation(payload)
        if (functionInvocation !== undefined) {
          const callId = asString(payload.call_id)
          if (!callId) continue
          if (
            !matchesRepo
            && !await explicitSiblingWorktreeTarget(sessionRoot, functionInvocation.workdir, repoRoot)
          ) continue
          const readIds = aliases.filter(
            (id) => {
              const path = selectedSkillPaths.get(id)
              return path !== undefined && commandTrustedSkillPaths(functionInvocation.command, path)
            },
          )
          if (readIds.length > 0) {
            const firstPath = selectedSkillPaths.get(readIds[0] ?? '')
            const readPaths = firstPath === undefined
              ? undefined
              : commandTrustedSkillPaths(functionInvocation.command, firstPath)
            if (readPaths !== undefined) {
              readsByCall.set(callId, { skillIds: readIds, outputAbi: 'function', readPaths })
            }
          }
          continue
        }
        if (payload.type === 'custom_tool_call') {
          const callId = asString(payload.call_id)
          const name = asString(payload.name)
          const status = asString(payload.status)
          const toolInput = asString(payload.input)
          if (!callId || name !== 'exec' || status !== 'completed' || !toolInput) continue
          const invocations = transcriptExecInvocations(toolInput)
          const invocation = invocations.length === 1 ? invocations[0] : undefined
          if (
            invocation === undefined
            || (
              !matchesRepo
              && !await explicitSiblingWorktreeTarget(sessionRoot, invocation.workdir, repoRoot)
            )
          ) continue
          const readIds = aliases.filter((id) => {
            const path = selectedSkillPaths.get(id)
            return path !== undefined && commandTrustedSkillPaths(invocation.command, path)
          })
          if (readIds.length > 0) {
            const firstPath = selectedSkillPaths.get(readIds[0] ?? '')
            const readPaths = firstPath === undefined
              ? undefined
              : commandTrustedSkillPaths(invocation.command, firstPath)
            if (readPaths !== undefined) {
              readsByCall.set(callId, { skillIds: readIds, outputAbi: 'custom', readPaths })
            }
          }
          continue
        }
        if (payload.type !== 'custom_tool_call_output' && payload.type !== 'function_call_output') continue
        const callId = asString(payload.call_id)
        const pendingRead = callId === undefined ? undefined : readsByCall.get(callId)
        const outputAbi: OutputAbi = payload.type === 'custom_tool_call_output'
          ? 'custom'
          : 'function'
        if (pendingRead === undefined || pendingRead.outputAbi !== outputAbi) continue
        const successful = await outputMatchesTrustedSkillReads(
          payload.output,
          outputAbi,
          pendingRead.readPaths,
        )
        if (successful) {
          for (const id of pendingRead.skillIds) confirmedInLatestTurn.add(id)
        }
      }
      await settleBoundedStream(stream)
      if (malformedTranscript) return []
      if (!await hostTranscriptUnchanged(handle, transcript)) return []
      if (matchesHostSession) {
        if (latestTurnId !== undefined) {
          for (const id of confirmedInLatestTurn) confirmed.add(id)
        }
        break
      }
    } catch {
      // A transcript I/O failure makes recency and completeness unknowable. Fail closed instead
      // of accepting evidence from an older file that may belong to a superseded host turn.
      return []
    } finally {
      await settleBoundedStream(stream)
      await handle.close().catch(() => undefined)
    }
    if (matchesHostSession) break
  }
  return [...confirmed]
}
