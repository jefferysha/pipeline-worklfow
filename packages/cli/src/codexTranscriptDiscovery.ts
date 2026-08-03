import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, opendir, realpath, type FileHandle } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

const MAX_TRANSCRIPT_BYTES = 512 * 1024 * 1024
const MAX_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_TRANSCRIPTS = 32
const MAX_DISCOVERY_ENTRIES = 4096
// The metadata walk is already bounded independently. Long-lived Codex installations can retain
// hundreds of ordinary transcripts, so the transcript count must not fail before that existing
// entry budget or an otherwise valid, explicitly bound current session becomes undiscoverable.
const MAX_DISCOVERED_TRANSCRIPTS = MAX_DISCOVERY_ENTRIES

export interface HostTranscriptDiscoveryLimits {
  readonly maxEntries: number
  readonly maxTranscripts: number
}

const DEFAULT_DISCOVERY_LIMITS: HostTranscriptDiscoveryLimits = {
  maxEntries: MAX_DISCOVERY_ENTRIES,
  maxTranscripts: MAX_DISCOVERED_TRANSCRIPTS,
}

export interface HostTranscriptCandidate {
  readonly path: string
  readonly modifiedAt: number
  readonly size: number
  readonly device: bigint
  readonly inode: bigint
  readonly modifiedAtNs: bigint
  readonly changedAtNs: bigint
}

export function compareHostTranscriptsNewestFirst(
  left: HostTranscriptCandidate,
  right: HostTranscriptCandidate,
): number {
  if (left.modifiedAtNs !== right.modifiedAtNs) return left.modifiedAtNs > right.modifiedAtNs ? -1 : 1
  if (left.changedAtNs !== right.changedAtNs) return left.changedAtNs > right.changedAtNs ? -1 : 1
  if (left.path === right.path) return 0
  return left.path < right.path ? -1 : 1
}

type HostTranscriptInspection =
  | { readonly kind: 'candidate'; readonly candidate: HostTranscriptCandidate }
  | { readonly kind: 'empty'; readonly modifiedAt: number }

async function inspectHostTranscript(
  physicalRoot: string,
  candidate: string,
): Promise<HostTranscriptInspection | undefined> {
  try {
    const info = await lstat(candidate, { bigint: true })
    if (
      !info.isFile()
      || info.isSymbolicLink()
      || info.size > BigInt(MAX_TRANSCRIPT_BYTES)
    ) return undefined
    const physical = await realpath(candidate)
    if (!isInside(physicalRoot, physical)) return undefined
    if (info.size === 0n) {
      return { kind: 'empty', modifiedAt: Number(info.mtimeMs) }
    }
    return {
      kind: 'candidate',
      candidate: {
        path: physical,
        modifiedAt: Number(info.mtimeMs),
        size: Number(info.size),
        device: info.dev,
        inode: info.ino,
        modifiedAtNs: info.mtimeNs,
        changedAtNs: info.ctimeNs,
      },
    }
  } catch {
    return undefined
  }
}

function isInside(base: string, candidate: string): boolean {
  const fromBase = relative(base, candidate)
  return fromBase !== ''
    && fromBase !== '..'
    && !fromBase.startsWith(`..${sep}`)
    && !isAbsolute(fromBase)
}

/**
 * Enumerate newest host transcripts within fixed I/O budgets. An unreadable or oversized JSONL
 * candidate makes recency unknowable, so discovery fails closed instead of accepting an older file.
 * A zero-byte transcript is ignored only when its mtime is strictly older than a readable candidate;
 * an empty latest/equal-time file may be the current host session and therefore remains ambiguous.
 */
export async function recentHostTranscripts(
  sessionsRoot: string,
  limits: HostTranscriptDiscoveryLimits = DEFAULT_DISCOVERY_LIMITS,
): Promise<readonly HostTranscriptCandidate[] | undefined> {
  if (
    !Number.isSafeInteger(limits.maxEntries) || limits.maxEntries <= 0
    || !Number.isSafeInteger(limits.maxTranscripts) || limits.maxTranscripts <= 0
  ) return undefined
  let physicalRoot: string
  try {
    physicalRoot = await realpath(sessionsRoot)
  } catch {
    return undefined
  }

  const discovered: HostTranscriptCandidate[] = []
  const emptyModifiedAt: number[] = []
  let visitedEntries = 0
  let visitedTranscripts = 0
  async function visit(directory: string, depth: number): Promise<boolean> {
    try {
      const entries = await opendir(directory)
      for await (const entry of entries) {
        visitedEntries += 1
        if (visitedEntries > limits.maxEntries) return false
        const candidate = join(directory, entry.name)
        if (entry.isDirectory() && depth < 3) {
          if (!await visit(candidate, depth + 1)) return false
          continue
        }
        if (!entry.name.endsWith('.jsonl')) continue
        visitedTranscripts += 1
        if (visitedTranscripts > limits.maxTranscripts) return false
        if (!entry.isFile()) return false
        const inspected = await inspectHostTranscript(physicalRoot, candidate)
        if (inspected === undefined) return false
        if (inspected.kind === 'empty') emptyModifiedAt.push(inspected.modifiedAt)
        else discovered.push(inspected.candidate)
      }
      return true
    } catch {
      return false
    }
  }
  if (!await visit(physicalRoot, 0)) return undefined

  const newestReadable = discovered.reduce(
    (newest, transcript) => Math.max(newest, transcript.modifiedAt),
    Number.NEGATIVE_INFINITY,
  )
  if (emptyModifiedAt.some((modifiedAt) => modifiedAt >= newestReadable)) return undefined

  let remaining = MAX_TOTAL_BYTES
  const selected: HostTranscriptCandidate[] = []
  for (const transcript of discovered.sort(compareHostTranscriptsNewestFirst)) {
    if (selected.length >= MAX_TRANSCRIPTS || transcript.size > remaining) break
    selected.push(transcript)
    remaining -= transcript.size
  }
  return selected
}

export async function exactHostTranscript(
  sessionsRoot: string,
  transcriptPath: string,
): Promise<HostTranscriptCandidate | undefined> {
  try {
    const inspected = await inspectHostTranscript(await realpath(sessionsRoot), transcriptPath)
    return inspected?.kind === 'candidate' ? inspected.candidate : undefined
  } catch {
    return undefined
  }
}

function matchesCandidate(
  candidate: HostTranscriptCandidate,
  info: BigIntStats,
): boolean {
  return info.isFile()
    && info.dev === candidate.device
    && info.ino === candidate.inode
    && info.size === BigInt(candidate.size)
    && info.mtimeNs === candidate.modifiedAtNs
    && info.ctimeNs === candidate.changedAtNs
}

export async function openVerifiedHostTranscript(
  candidate: HostTranscriptCandidate,
): Promise<FileHandle | undefined> {
  let handle: FileHandle | undefined
  try {
    handle = await open(candidate.path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = await handle.stat({ bigint: true })
    if (matchesCandidate(candidate, info)) return handle
  } catch {
    // The caller treats a replaced or unreadable candidate as an overall discovery failure.
  }
  await handle?.close().catch(() => undefined)
  return undefined
}

export async function hostTranscriptUnchanged(
  handle: FileHandle,
  candidate: HostTranscriptCandidate,
): Promise<boolean> {
  let currentPathHandle: FileHandle | undefined
  try {
    if (!matchesCandidate(candidate, await handle.stat({ bigint: true }))) return false
    currentPathHandle = await openVerifiedHostTranscript(candidate)
    return currentPathHandle !== undefined
  } catch {
    return false
  } finally {
    await currentPathHandle?.close().catch(() => undefined)
  }
}
