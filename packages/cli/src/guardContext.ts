import { readdirSync, readFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readCurrentRunRevisionSync,
  stateStorageExistsSync,
} from '@pipeline-lite/kernel'
import type { GuardFileContext } from './deps.js'

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
    dirExists: (path) => {
      try { return statSync(abs(path)).isDirectory() } catch { return false }
    },
    activeChangeArchived: (dep) => activeCanonicalArchived(cwd, dep),
    changeArchived: (dep) => physicallyArchived(cwd, dep),
    automationRunner: process.env.PIPELINE_AUTOMATION_RUNNER === '1',
  })
}
