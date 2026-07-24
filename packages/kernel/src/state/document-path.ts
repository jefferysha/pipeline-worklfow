import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import type { DocumentKind } from '../workflow/document-contract.js'

export class DocumentLedgerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentLedgerError'
  }
}

export interface ResolvedDocument {
  readonly relativePath: string
  readonly digest: string
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

export function deltaSpecSlot(path: string, changeDir: string): string | undefined {
  const parts = path.split('/')
  const changeName = basename(resolve(changeDir))
  if (
    parts.length !== 6
    || parts[0] !== 'openspec'
    || parts[1] !== 'changes'
    || parts[2] !== changeName
    || parts[3] !== 'specs'
    || !parts[4]
    || parts[5] !== 'spec.md'
  ) {
    return undefined
  }
  return `delta-spec:${parts[4]}`
}

export function documentSlot(kind: DocumentKind, path: string, changeDir: string): string {
  if (kind !== 'delta-spec') return kind
  const slot = deltaSpecSlot(path, changeDir)
  if (!slot) {
    throw new DocumentLedgerError(
      `delta-spec 必须位于当前 Change 的 canonical capability 路径: openspec/changes/${basename(resolve(changeDir))}/specs/<capability>/spec.md`,
    )
  }
  return slot
}

/** Resolve a document without root escape, symlinks/path aliases, or empty/non-file records. */
export async function resolveDocument(repoRoot: string, path: string): Promise<ResolvedDocument> {
  if (!path || isAbsolute(path)) throw new DocumentLedgerError(`document path 必须是项目相对路径: ${path || '(empty)'}`)
  const lexicalRoot = resolve(repoRoot)
  const lexicalTarget = resolve(repoRoot, path)
  if (!inside(lexicalRoot, lexicalTarget)) throw new DocumentLedgerError(`document path 越出项目根: ${path}`)
  const relativePath = normalizeRelativePath(relative(lexicalRoot, lexicalTarget))
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
  const realRelativePath = normalizeRelativePath(relative(realRoot, realTarget))
  if (realRelativePath !== relativePath) {
    throw new DocumentLedgerError(`document 不得通过 symlink 或路径别名登记: ${relativePath} -> ${realRelativePath}`)
  }
  if (content.byteLength === 0) throw new DocumentLedgerError(`document 不得为空: ${relativePath}`)
  return { relativePath, digest: createHash('sha256').update(content).digest('hex') }
}
