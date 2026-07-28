/**
 * mem/paths —— home-based 会话根 + cwd→项目目录 sanitize + 目录遍历（注入 fs）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/internal/paths.py。
 *
 * claudeProjectDirFromCwd 字节级等于 collector encode_cwd（`[/\\:_.] → -`）。
 */
import { join, resolve } from 'node:path'
import type { DiscoveryFileSource, MemFs } from './fs.js'

const SEP_RE = /[/\\:_.]/g
const PI_SEP_RE = /[/\\:]/g
const PI_LEAD_RE = /^[/\\]/

function expandHome(fs: MemFs, p: string): string {
  if (p === '~') return fs.home
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(fs.home, p.slice(2))
  return p
}

export function claudeProjectsRoot(fs: MemFs): string {
  return join(fs.home, '.claude', 'projects')
}

export function codexSessionsRoot(fs: MemFs): string {
  return join(fs.home, '.codex', 'sessions')
}

/** Claude 把 cwd sanitize 成磁盘项目目录名：每个 / \ : _ . 替为 -。 */
export function claudeProjectDirFromCwd(fs: MemFs, cwd: string): string {
  return join(claudeProjectsRoot(fs), cwd.replace(SEP_RE, '-'))
}

export function piAgentDir(fs: MemFs): string {
  const env = fs.env?.('PI_CODING_AGENT_DIR')
  return expandHome(fs, env || join(fs.home, '.pi', 'agent'))
}

/** Pi 把 cwd 编码为 --<resolved-cwd 分隔符转 ->--。 */
export function piProjectDirFromCwd(fs: MemFs, cwd: string): string {
  const resolved = resolve(cwd)
  const safe = '--' + resolved.replace(PI_LEAD_RE, '').replace(PI_SEP_RE, '-') + '--'
  return join(piAgentDir(fs), 'sessions', safe)
}

function readPiSettingsSessionDir(fs: MemFs): string | null {
  const raw = fs.readText(join(piAgentDir(fs), 'settings.json'))
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const dir = (parsed as { sessionDir?: unknown }).sessionDir
  if (typeof dir === 'string' && dir.trim()) return expandHome(fs, dir)
  return null
}

/** Pi 三来源会话根：默认 sessions + PI_SESSIONS(env) + settings.json.sessionDir，resolve 去重。 */
export function piSessionRoots(fs: MemFs): string[] {
  const roots = [join(piAgentDir(fs), 'sessions')]
  const envSess = fs.env?.('PI_CODING_AGENT_SESSION_DIR')
  if (envSess) roots.push(expandHome(fs, envSess))
  const settingsDir = readPiSettingsSessionDir(fs)
  if (settingsDir) roots.push(settingsDir)

  const seen = new Set<string>()
  const out: string[] = []
  for (const root of roots) {
    const normalized = resolve(root)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(root)
  }
  return out
}

/** 栈式递归文件遍历——返 root 下每个文件路径。缺失 root + 不可读目录静默跳过。 */
export function walkDir(fs: MemFs, root: string): string[] {
  const out: string[] = []
  if (!fs.exists(root)) return out
  const stack = [root]
  while (stack.length) {
    const cur = stack.pop()
    if (cur === undefined) break
    for (const e of fs.readDir(cur)) {
      const full = join(cur, e.name)
      if (e.isDirectory) stack.push(full)
      else if (e.isFile) out.push(full)
    }
  }
  return out
}

interface RankedFile {
  path: string
  mtime: number
}

function insertRecentFile(files: RankedFile[], candidate: RankedFile, limit: number): void {
  let low = 0
  let high = files.length
  while (low < high) {
    const mid = (low + high) >>> 1
    const current = files[mid]
    if (current === undefined) break
    if (candidate.mtime > current.mtime || (
      candidate.mtime === current.mtime && candidate.path > current.path
    )) high = mid
    else low = mid + 1
  }
  files.splice(low, 0, candidate)
  if (files.length > limit) files.pop()
}

/**
 * Related Sessions-only bounded discovery. Directory entries are capped at the provider boundary,
 * traversal prefers newer lexical layout directories, and only a fixed top-K file set is retained.
 * Ordinary CLI callers keep walkDir's full-recall contract.
 */
export function walkDirForRelatedSearch(
  fs: MemFs,
  root: string,
  accept: (path: string) => boolean,
  fileLimit: number,
  source: DiscoveryFileSource,
  shouldDescend: (path: string, depth: number) => boolean = () => true,
): string[] {
  const budget = fs.contentReadBudget
  if (
    !budget?.remainingDiscoveryEntries
    || !budget.consumeDiscoveryEntries
    || !budget.remainingDiscoveryFiles
    || !budget.consumeDiscoveryFiles
    || !budget.shouldContinueDiscovery
    || !budget.noteDiscoveryTruncated
  ) {
    return walkDir(fs, root)
      .filter(accept)
      .sort((left, right) => (fs.mtimeMs(right) ?? 0) - (fs.mtimeMs(left) ?? 0))
      .slice(0, fileLimit)
  }
  if (!fs.exists(root) || fileLimit <= 0) return []

  const files: RankedFile[] = []
  const remainingFiles = budget.remainingDiscoveryFiles(source)
  const effectiveFileLimit = Math.min(
    fileLimit,
    budget.maxDiscoveryFiles ?? fileLimit,
    remainingFiles,
  )
  if (effectiveFileLimit <= 0) {
    budget.noteDiscoveryTruncated()
    return []
  }
  const stack: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }]
  while (stack.length > 0) {
    if (!budget.shouldContinueDiscovery(source)) {
      budget.noteDiscoveryTruncated()
      break
    }
    const current = stack.pop()
    if (current === undefined) break
    const remaining = budget.remainingDiscoveryEntries(source)
    if (remaining <= 0) {
      budget.noteDiscoveryTruncated()
      break
    }
    const bounded = fs.readDirBounded?.(
      current.path,
      remaining,
      () => budget.shouldContinueDiscovery?.(source) === true,
    )
    const checked = bounded ?? fs.readDirChecked?.(current.path)
    const sourceEntries = checked?.entries ?? fs.readDir(current.path)
    const entries = sourceEntries.slice(0, remaining)
    budget.consumeDiscoveryEntries(source, entries.length)
    if (bounded?.truncated || (!bounded && sourceEntries.length > remaining)) {
      budget.noteDiscoveryTruncated()
    }

    const ranked: Array<{ entry: (typeof entries)[number]; path: string; mtime: number }> = []
    for (const entry of entries) {
      if (!budget.shouldContinueDiscovery(source)) {
        budget.noteDiscoveryTruncated()
        break
      }
      const path = join(current.path, entry.name)
      ranked.push({ entry, path, mtime: entry.isFile ? (fs.mtimeMs(path) ?? 0) : 0 })
    }
    ranked.sort((left, right) => {
      if (left.entry.isDirectory !== right.entry.isDirectory) {
        return left.entry.isDirectory ? -1 : 1
      }
      if (left.entry.isDirectory) return right.entry.name.localeCompare(left.entry.name)
      return right.mtime - left.mtime || right.entry.name.localeCompare(left.entry.name)
    })

    const directories: Array<{ path: string; depth: number }> = []
    for (const item of ranked) {
      if (item.entry.isFile && accept(item.path)) {
        if (files.length >= effectiveFileLimit) budget.noteDiscoveryTruncated()
        insertRecentFile(files, { path: item.path, mtime: item.mtime }, effectiveFileLimit)
      } else if (item.entry.isDirectory) {
        const childDepth = current.depth + 1
        if (!shouldDescend(item.path, childDepth)) continue
        if (current.depth >= (budget.maxDiscoveryDepth ?? 0)) {
          budget.noteDiscoveryTruncated()
        } else {
          directories.push({ path: item.path, depth: childDepth })
        }
      }
    }
    for (let index = directories.length - 1; index >= 0; index -= 1) {
      const directory = directories[index]
      if (directory !== undefined) stack.push(directory)
    }
  }
  budget.consumeDiscoveryFiles(source, files.length)
  return files.map((file) => file.path)
}
