import { randomUUID } from 'node:crypto'
import {
  link, lstat, mkdir, readdir, rm, rmdir, unlink, writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import type { InitOptions } from '../types.js'
import { ensureTrustedProjectDirectory } from './trusted-project-path.js'

const CHANGE_NAME_RE = /^[a-zA-Z0-9_-]+$/
const INITIAL_LOCK_STALE_MS = 120_000
const INITIAL_LOCK_WAIT_MS = 10_000

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

function alreadyInitialized(pathname: string): NodeJS.ErrnoException {
  const error = new Error(`init: change 已存在，拒绝覆盖: ${pathname}`) as NodeJS.ErrnoException
  error.code = 'EEXIST'
  error.path = pathname
  return error
}

function contained(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (
    rel !== '..'
    && !rel.startsWith(`..${path.sep}`)
    && !path.isAbsolute(rel)
  )
}

async function assertMissing(target: string): Promise<void> {
  try {
    await lstat(target)
    throw alreadyInitialized(target)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
}

export interface InitialChangePublication {
  readonly repoRoot: string
  readonly changesDir: string
  readonly finalChangeDir: string
  readonly candidateChangeDir: string
  readonly lockDir: string
}

interface PublishedEntry {
  readonly pathname: string
  readonly dev: number
  readonly ino: number
  readonly kind: 'directory' | 'file'
}

function publicationOrder(name: string): number {
  // canonical current 是官方读取提交点：普通 sidecar / 初始文档先到位，run 目录倒数第二，
  // YAML projection 最后。run 目录内部同理让 current.json 排在 immutable revisions 后面。
  if (name === '.pipeline-run') return 1
  if (name === '.pipeline.yaml' || name === 'current.json') return 2
  return 0
}

async function rememberPublishedEntry(
  pathname: string,
  kind: PublishedEntry['kind'],
  published: PublishedEntry[],
): Promise<void> {
  const identity = await lstat(pathname)
  published.push({ pathname, dev: identity.dev, ino: identity.ino, kind })
}

async function publishTreeNoReplace(
  sourceDir: string,
  targetDir: string,
  published: PublishedEntry[],
): Promise<void> {
  const entries = await readdir(sourceDir, { withFileTypes: true })
  entries.sort((left, right) => (
    publicationOrder(left.name) - publicationOrder(right.name)
    || left.name.localeCompare(right.name)
  ))
  for (const entry of entries) {
    const source = path.join(sourceDir, entry.name)
    const target = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await mkdir(target)
      await rememberPublishedEntry(target, 'directory', published)
      await publishTreeNoReplace(source, target, published)
      await rmdir(source)
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`init: 候选目录含不受支持的文件类型: ${source}`)
    }
    // candidate 与 final 位于同一 changesDir，因此 hard-link 既是原子 no-replace，
    // 也不会跨设备。先发布链接、再移除候选名；同名竞态只会 EEXIST，绝不覆盖。
    await link(source, target)
    await rememberPublishedEntry(target, 'file', published)
    await unlink(source)
  }
}

async function rollbackPublishedEntries(published: PublishedEntry[]): Promise<void> {
  for (const entry of [...published].reverse()) {
    try {
      const current = await lstat(entry.pathname)
      // 只清理仍指向本次创建 inode 的名字；竞态方替换或新增的数据一律不碰。
      if (current.dev !== entry.dev || current.ino !== entry.ino) continue
      if (entry.kind === 'directory') await rmdir(entry.pathname)
      else await unlink(entry.pathname)
    } catch {
      // best-effort rollback：缺失、非空或已被竞态方接管都必须保守保留。
    }
  }
}

export function assertValidChangeName(name: string): void {
  if (!CHANGE_NAME_RE.test(name) || name.includes('..')) {
    throw new Error(`init: 非法 change 名 '${name}'（仅允许 a-zA-Z0-9_-，禁 ..）`)
  }
}

async function acquireInitialNameLock(changesDir: string, name: string): Promise<string> {
  const lockDir = path.join(changesDir, `.pipeline-init-lock-${name}`)
  const deadline = Date.now() + INITIAL_LOCK_WAIT_MS
  while (true) {
    try {
      await mkdir(lockDir)
      return lockDir
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
      try {
        const info = await lstat(lockDir)
        if (!info.isDirectory() || info.isSymbolicLink()) {
          throw alreadyInitialized(lockDir)
        }
        if (Date.now() - info.mtimeMs > INITIAL_LOCK_STALE_MS) {
          await rmdir(lockDir)
          continue
        }
      } catch (inspectionError) {
        if (errorCode(inspectionError) === 'ENOENT') continue
        if (errorCode(inspectionError) !== 'ENOTEMPTY') throw inspectionError
      }
      if (Date.now() >= deadline) {
        const timeout = new Error(`init: 等待同名 Change 初始化锁超时: ${lockDir}`) as NodeJS.ErrnoException
        timeout.code = 'EBUSY'
        throw timeout
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5))
    }
  }
}

export async function releaseInitialChangePublication(
  publication: InitialChangePublication,
): Promise<void> {
  await rmdir(publication.lockDir).catch(() => {})
}

export async function prepareInitialChangePublication(
  inputRoot: string,
  name: string,
): Promise<InitialChangePublication> {
  const repoRoot = path.resolve(inputRoot)
  const changesDir = path.join(repoRoot, 'openspec', 'changes')
  const finalChangeDir = path.join(changesDir, name)
  await ensureTrustedProjectDirectory(repoRoot, changesDir)
  const lockDir = await acquireInitialNameLock(changesDir, name)
  try {
    await assertMissing(finalChangeDir)
    const candidateChangeDir = path.join(
      changesDir,
      `.pipeline-init-${name}-${process.pid}-${randomUUID()}`,
    )
    await mkdir(candidateChangeDir)
    return { repoRoot, changesDir, finalChangeDir, candidateChangeDir, lockDir }
  } catch (error) {
    await rmdir(lockDir).catch(() => {})
    throw error
  }
}

export async function writeInitialChangeFiles(
  changeDir: string,
  files: InitOptions['initialFiles'],
): Promise<void> {
  const observed = new Set<string>()
  for (const file of files ?? []) {
    const target = path.resolve(changeDir, file.relativePath)
    if (file.relativePath === '' || !contained(changeDir, target) || observed.has(target)) {
      throw new Error(`init: initial file 路径非法或重复: ${file.relativePath}`)
    }
    observed.add(target)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.content, { encoding: 'utf8', flag: 'wx' })
  }
}

export async function publishInitialChange(
  publication: InitialChangePublication,
): Promise<void> {
  const { candidateChangeDir, changesDir, finalChangeDir, repoRoot } = publication
  await ensureTrustedProjectDirectory(repoRoot, changesDir)
  const published: PublishedEntry[] = []
  try {
    // `rename(candidate, final)` 在 POSIX 上允许静默替换一个竞态出现的空目录。最终名称改由
    // mkdir 原子独占；随后每个文件都用 link no-replace 发布，任何层级的同名对象都只会失败。
    await mkdir(finalChangeDir)
    await rememberPublishedEntry(finalChangeDir, 'directory', published)
    await publishTreeNoReplace(candidateChangeDir, finalChangeDir, published)
    await rmdir(candidateChangeDir)
  } catch (error) {
    await rollbackPublishedEntries(published)
    if (!['ENOTDIR', 'EEXIST', 'ENOTEMPTY'].includes(errorCode(error) ?? '')) throw error
    throw alreadyInitialized(finalChangeDir)
  }
}

export async function discardInitialChangeCandidate(changeDir: string): Promise<void> {
  await rm(changeDir, { recursive: true, force: true }).catch(() => {})
}
