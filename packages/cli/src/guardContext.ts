import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  readFileSync,
  statSync,
  type BigIntStats,
} from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readCurrentRunRevisionSync,
  stateStorageExistsSync,
} from '@tenon/kernel'
import type { BoundedFileRead, GuardFileContext } from './deps.js'

function sameBoundedFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

/**
 * Synchronous because GuardContext is synchronous, but still opens before reading and fences the
 * regular-file identity before/after materialization. Oversized/symlink/replaced inputs are never
 * returned as text, so TaskPlan byte budgets apply before allocation rather than after it.
 */
export function readBoundedRegularFileSync(path: string, maxBytes: number): BoundedFileRead {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return { kind: 'invalid' }
  let fd: number | undefined
  let inspected = false
  try {
    const lexical = lstatSync(path, { bigint: true })
    inspected = true
    if (!lexical.isFile() || lexical.size > BigInt(maxBytes)) return { kind: 'invalid' }
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const opened = fstatSync(fd, { bigint: true })
    if (!opened.isFile() || !sameBoundedFile(lexical, opened)) return { kind: 'invalid' }
    // Never let a concurrent grow race make readFileSync allocate past the admitted size. One
    // bounded extra byte is enough to prove overflow without materializing attacker-controlled tail.
    const raw = Buffer.allocUnsafe(maxBytes + 1)
    let length = 0
    while (length < raw.byteLength) {
      const read = readSync(fd, raw, length, raw.byteLength - length, null)
      if (read === 0) break
      length += read
    }
    if (length > maxBytes || BigInt(length) !== opened.size) return { kind: 'invalid' }
    const after = fstatSync(fd, { bigint: true })
    const current = lstatSync(path, { bigint: true })
    if (!sameBoundedFile(opened, after) || !sameBoundedFile(opened, current)) return { kind: 'invalid' }
    return {
      kind: 'ok',
      text: new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, length)),
    }
  } catch (error) {
    return !inspected && (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { kind: 'missing' }
      : { kind: 'invalid' }
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd) } catch { /* Best-effort cleanup; the read result is already bounded. */ }
    }
  }
}

export async function listChanges(changesRoot: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(changesRoot, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .filter((entry) => stateStorageExistsSync(join(changesRoot, entry.name)))
    .map((entry) => entry.name)
    .sort()
}

/**
 * Track-reference scans must include unreadable/partial directories so the
 * caller can fail closed instead of silently dropping a reference candidate.
 */
export async function listChangeDirs(changesRoot: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(changesRoot, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
    .sort()
}

function activeCanonicalArchived(cwd: string, dep: string): boolean {
  try {
    const current = readCurrentRunRevisionSync(join(cwd, 'openspec', 'changes', dep))
    return current?.state.fields.archived === 'true'
  } catch {
    return false
  }
}

function physicallyArchived(cwd: string, dep: string): boolean {
  try {
    return readdirSync(join(cwd, 'openspec', 'changes', 'archive'), { withFileTypes: true })
      .some((entry) => entry.isDirectory() && entry.name.endsWith(`-${dep}`))
  } catch {
    return false
  }
}

export function makeGuardCtx(cwd: string): (name: string) => GuardFileContext {
  const abs = (relativePath: string): string => join(cwd, relativePath)
  return (name) => ({
    changeDirRel: `openspec/changes/${name}`,
    stateExists: (changeDirRel) => stateStorageExistsSync(abs(changeDirRel)),
    fileExists: (path) => {
      try { return statSync(abs(path)).isFile() } catch { return false }
    },
    fileNonempty: (path) => {
      try {
        const state = statSync(abs(path))
        return state.isFile() && state.size > 0
      } catch {
        return false
      }
    },
    readFile: (path) => {
      try { return readFileSync(abs(path), 'utf8') } catch { return undefined }
    },
    readFileBounded: (path, maxBytes) => readBoundedRegularFileSync(abs(path), maxBytes),
    dirExists: (path) => {
      try { return statSync(abs(path)).isDirectory() } catch { return false }
    },
    activeChangeArchived: (dep) => activeCanonicalArchived(cwd, dep),
    changeArchived: (dep) => physicallyArchived(cwd, dep),
    automationRunner: process.env.TENON_AUTOMATION_RUNNER === '1',
  })
}
