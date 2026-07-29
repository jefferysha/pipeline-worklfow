import type { Dirent } from 'node:fs'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

const MAX_TRANSCRIPT_BYTES = 512 * 1024 * 1024
const MAX_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_TRANSCRIPTS = 32

interface TranscriptFile {
  readonly path: string
  readonly modifiedAt: number
  readonly size: number
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
 */
export async function recentHostTranscripts(
  sessionsRoot: string,
): Promise<readonly string[] | undefined> {
  let physicalRoot: string
  try {
    physicalRoot = await realpath(sessionsRoot)
  } catch {
    return undefined
  }

  const discovered: TranscriptFile[] = []
  async function visit(directory: string, depth: number): Promise<boolean> {
    let entries: readonly Dirent<string>[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      const candidate = join(directory, entry.name)
      if (entry.isDirectory() && depth < 3) {
        if (!await visit(candidate, depth + 1)) return false
        continue
      }
      if (!entry.name.endsWith('.jsonl')) continue
      if (!entry.isFile()) return false
      try {
        const info = await lstat(candidate)
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_TRANSCRIPT_BYTES) return false
        const physical = await realpath(candidate)
        if (!isInside(physicalRoot, physical)) return false
        discovered.push({ path: physical, modifiedAt: info.mtimeMs, size: info.size })
      } catch {
        return false
      }
    }
    return true
  }
  if (!await visit(physicalRoot, 0)) return undefined

  let remaining = MAX_TOTAL_BYTES
  const selected: string[] = []
  for (const transcript of discovered.sort((left, right) => right.modifiedAt - left.modifiedAt)) {
    if (selected.length >= MAX_TRANSCRIPTS || transcript.size > remaining) break
    selected.push(transcript.path)
    remaining -= transcript.size
  }
  return selected
}
