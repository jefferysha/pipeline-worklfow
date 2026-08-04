import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
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

export const MAX_DOCUMENT_SOURCE_BYTES = 2 * 1024 * 1024

export function decodeUtf8Text(content: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content)
  } catch {
    throw new DocumentLedgerError(`${label} 不是有效 UTF-8 文本`)
  }
}

export type BoundedFileHandleReader = (
  handle: FileHandle,
  maxBytes: number,
) => Promise<Buffer>

export async function readBoundedFileHandle(
  handle: FileHandle,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  while (total <= maxBytes) {
    const remaining = maxBytes + 1 - total
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, remaining))
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null)
    if (bytesRead === 0) break
    chunks.push(bytesRead === chunk.byteLength ? chunk : chunk.subarray(0, bytesRead))
    total += bytesRead
  }
  return Buffer.concat(chunks, total)
}

export async function readBoundedRegularFile(
  path: string,
  maxBytes: number,
  label: string,
  readSource: BoundedFileHandleReader = readBoundedFileHandle,
): Promise<Buffer> {
  const parent = dirname(path)
  const parentBefore = await lstat(parent, { bigint: true })
  if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink()) {
    throw new DocumentLedgerError(`${label} 不得通过 symlink 或路径别名读取`)
  }
  const parentRealBefore = await realpath(parent)
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile()) throw new DocumentLedgerError(`${label} 必须是非 symlink 普通文件: ${path}`)
    const assertStable = async (): Promise<void> => {
      const [parentNow, parentRealNow, targetNow] = await Promise.all([
        lstat(parent, { bigint: true }),
        realpath(parent),
        lstat(path, { bigint: true }),
      ])
      if (
        !parentNow.isDirectory()
        || parentNow.isSymbolicLink()
        || parentNow.dev !== parentBefore.dev
        || parentNow.ino !== parentBefore.ino
        || parentRealNow !== parentRealBefore
        || !targetNow.isFile()
        || targetNow.isSymbolicLink()
        || targetNow.dev !== opened.dev
        || targetNow.ino !== opened.ino
        || targetNow.size !== opened.size
        || targetNow.mtimeNs !== opened.mtimeNs
        || targetNow.ctimeNs !== opened.ctimeNs
      ) {
        throw new DocumentLedgerError(`${label} 在读取期间变化: ${path}`)
      }
    }
    await assertStable()
    if (opened.size > maxBytes) throw new DocumentLedgerError(`${label} 超过 ${maxBytes} bytes 上限`)
    const content = await readSource(handle, maxBytes)
    if (content.byteLength > maxBytes) {
      throw new DocumentLedgerError(`${label} 超过 ${maxBytes} bytes 上限`)
    }
    const after = await handle.stat({ bigint: true })
    if (
      !after.isFile()
      || after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.size !== opened.size
      || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs
    ) {
      throw new DocumentLedgerError(`${label} 在读取期间变化: ${path}`)
    }
    await assertStable()
    return content
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && Reflect.get(error, 'code') === 'ENOENT'
    ) {
      throw new DocumentLedgerError(`${label} 在读取期间变化: ${path}`)
    }
    throw error
  } finally {
    await handle.close()
  }
}

export async function readOptionalBoundedRegularTextFile(
  path: string,
  maxBytes: number,
  label: string,
  readSource: BoundedFileHandleReader = readBoundedFileHandle,
): Promise<string | undefined> {
  try {
    const content = await readBoundedRegularFile(path, maxBytes, label, readSource)
    return decodeUtf8Text(content, label)
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && Reflect.get(error, 'code') === 'ENOENT'
    ) return undefined
    throw error
  }
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

export function isSafeProjectRelativePath(value: string): boolean {
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0')
    || /^[A-Za-z]:/.test(value)) return false
  return value.split('/').every((segment) =>
    segment !== '' && segment !== '.' && segment !== '..')
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
export async function resolveDocument(
  repoRoot: string,
  path: string,
  readSource: BoundedFileHandleReader = readBoundedFileHandle,
): Promise<ResolvedDocument> {
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
  if (info.size > MAX_DOCUMENT_SOURCE_BYTES) {
    throw new DocumentLedgerError(`document 超过 ${MAX_DOCUMENT_SOURCE_BYTES} bytes 上限: ${relativePath}`)
  }
  const [realRoot, realTarget, content] = await Promise.all([
    realpath(repoRoot),
    realpath(lexicalTarget),
    readBoundedRegularFile(
      lexicalTarget,
      MAX_DOCUMENT_SOURCE_BYTES,
      `document ${relativePath}`,
      readSource,
    ),
  ])
  if (!inside(realRoot, realTarget)) throw new DocumentLedgerError(`document realpath 越出项目根: ${relativePath}`)
  const realRelativePath = normalizeRelativePath(relative(realRoot, realTarget))
  if (realRelativePath !== relativePath) {
    throw new DocumentLedgerError(`document 不得通过 symlink 或路径别名登记: ${relativePath} -> ${realRelativePath}`)
  }
  if (content.byteLength === 0) throw new DocumentLedgerError(`document 不得为空: ${relativePath}`)
  return { relativePath, digest: createHash('sha256').update(content).digest('hex') }
}
