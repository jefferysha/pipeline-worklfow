/**
 * mem/paths —— home-based 会话根 + cwd→项目目录 sanitize + 目录遍历（注入 fs）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/internal/paths.py。
 *
 * claudeProjectDirFromCwd 字节级等于 collector encode_cwd（`[/\\:_.] → -`）。
 */
import { join, resolve } from 'node:path'
import type { MemFs } from './fs.js'

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
    const cur = stack.pop()!
    for (const e of fs.readDir(cur)) {
      const full = join(cur, e.name)
      if (e.isDirectory) stack.push(full)
      else if (e.isFile) out.push(full)
    }
  }
  return out
}
