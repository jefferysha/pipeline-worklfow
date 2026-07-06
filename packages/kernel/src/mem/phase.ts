/**
 * mem/phase —— phase 转换信号解析 + brainstorm 窗切片（纯逻辑）。
 * 对位老仓 skills/pipeline/scripts/mem/phase.py。
 *
 * 边界信号从 raw shell-call 字符串恢复。与 Trellis 差异：信号是 `task.py create|start`
 * （pipeline 的 phase 入口）；slug 前缀剥用 pipeline 的 YYYY-MM-DD-（≠ trellis MM-DD）。
 */
import type { BrainstormWindow, ParsedTaskCmd, PhaseEvent } from './types.js'

// phase 转换信号：行首/空白后/路径分隔符后的 task.py create|start（守卫①）
const FIND_RE = /(^|[\s/\\])task\.py\s+(create|start)(?:\s+|$)/g
// 散文剥除（守卫②）：裸 alphanumeric 词后跟另一全字母词 = 英文散文非真调用
const PROSE_RE = /^[A-Za-z][A-Za-z0-9_-]*\s+[A-Za-z]{2,}\b/
// slug 前缀剥：pipeline YYYY-MM-DD-
const SLUG_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/
const TRAIL_META_RE = /[)};&|>]+$/

/**
 * 找单条 Bash 命令串里所有 task.py create|start 调用（源序返回）。三守卫：
 * ① task.py 须在行首/空白后/路径分隔符后；② 散文剥除；③ create 无 slug/title 丢，start 无 taskDir 丢。
 */
export function parseTaskPyCommandsAll(cmd: unknown): ParsedTaskCmd[] {
  if (typeof cmd !== 'string' || cmd.length === 0) return []
  const matches: Array<{ action: 'create' | 'start'; bodyStart: number }> = []
  FIND_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FIND_RE.exec(cmd)) !== null) {
    matches.push({ action: m[2] as 'create' | 'start', bodyStart: m.index + m[0].length })
    if (m.index === FIND_RE.lastIndex) FIND_RE.lastIndex += 1
  }
  const out: ParsedTaskCmd[] = []
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!
    const nxt = matches[i + 1]
    const bodyEnd = nxt ? nxt.bodyStart : cmd.length
    const sl = cmd.slice(cur.bodyStart, bodyEnd)
    const restRaw = (sl.includes('\n') ? sl.split('\n')[0]! : sl).trim()
    if (PROSE_RE.test(restRaw)) continue
    const parsed = parseRest(cur.action, restRaw)
    if (cur.action === 'create' && !parsed.slug && !parsed.titleArg) continue
    if (cur.action === 'start' && !parsed.taskDir) continue
    out.push(parsed)
  }
  return out
}

/** 单结果封装——返首个或 null。 */
export function parseTaskPyCommand(cmd: unknown): ParsedTaskCmd | null {
  const out = parseTaskPyCommandsAll(cmd)
  return out[0] ?? null
}

function parseRest(action: 'create' | 'start', restRaw: string): ParsedTaskCmd {
  if (action === 'create') {
    const args = splitShellArgs(restRaw)
    let slug: string | null = null
    let titleArg: string | null = null
    let i = 0
    while (i < args.length) {
      const a = args[i]!
      if (a === '--slug' || a === '-s') {
        slug = args[i + 1] ?? null
        i += 2
        continue
      }
      if (a.startsWith('--slug=')) {
        slug = a.slice('--slug='.length)
        i += 1
        continue
      }
      if (a.startsWith('-')) {
        i += 1
        continue
      }
      if (titleArg === null) titleArg = a
      i += 1
    }
    return { action: 'create', slug, titleArg }
  }
  const args = splitShellArgs(restRaw)
  let taskDir: string | null = null
  for (const a of args) {
    if (a.startsWith('-')) continue
    taskDir = a
    break
  }
  return { action: 'start', taskDir }
}

/**
 * 尽力 shell-arg 拆分：尊重 "…"/'…' 引号，空白拆，把 ; | & ( ) 作 token 边界，
 * 剥每 token 尾部 shell-meta（)};&|>）。非完整 POSIX 解析——够从 task.py 调用抠 slug/path。
 */
export function splitShellArgs(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  const flush = (): void => {
    if (!cur) return
    const cleaned = cur.replace(TRAIL_META_RE, '')
    if (cleaned) out.push(cleaned)
    cur = ''
  }
  for (const ch of s) {
    if (quote) {
      if (ch === quote) {
        quote = null
        continue
      }
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      flush()
      continue
    }
    if (ch === ';' || ch === '|' || ch === '&' || ch === '(' || ch === ')') {
      flush()
      continue
    }
    cur += ch
  }
  flush()
  return out
}

/**
 * 从 start task-dir 路径派生 slug，如 changes/2026-06-22-mem-phase-slice/ → mem-phase-slice
 * （YYYY-MM-DD- 日期前缀剥除，匹配配对 create 的 --slug）。
 */
export function slugFromChangeDir(p: string | null | undefined): string | null {
  if (!p) return null
  const norm = p.replace(/\\+/g, '/').replace(/\/+$/g, '')
  const parts = norm.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const last = parts[parts.length - 1]!
  return last.replace(SLUG_PREFIX_RE, '')
}

/**
 * 配对 create → start 事件成 brainstorm 窗。
 * 1. slug 精确匹配；2. FIFO 兜底（剩余 create 配后面首个未用 start）；
 * 3. 未配 create → [create, totalTurns)；4. 未配 start → [0, start)。
 * 窗按 startTurn 升序，pushWindow 守卫 endTurn<startTurn 丢弃。
 */
export function buildBrainstormWindows(events: readonly PhaseEvent[], totalTurns: number): BrainstormWindow[] {
  const creates = events.map((e, i) => ({ e, i })).filter((x) => x.e.action === 'create')
  const starts = events.map((e, i) => ({ e, i })).filter((x) => x.e.action === 'start')

  const usedStart = new Set<number>()
  const usedCreate = new Set<number>()
  const windows: BrainstormWindow[] = []
  let counter = 0

  const push = (startTurn: number, endTurn: number, slug: string | null | undefined): void => {
    counter += 1
    if (endTurn < startTurn) return
    windows.push({ label: slug ? slug : `window-${counter}`, startTurn, endTurn })
  }

  // Pass 1: slug 匹配
  for (const c of creates) {
    const createEv = c.e
    if (!createEv.slug) continue
    let matchIdx = -1
    for (let j = 0; j < starts.length; j++) {
      const st = starts[j]!
      if (!usedStart.has(st.i) && slugFromChangeDir(st.e.taskDir) === createEv.slug) {
        matchIdx = j
        break
      }
    }
    if (matchIdx === -1) continue
    const startEntry = starts[matchIdx]!
    usedStart.add(startEntry.i)
    usedCreate.add(c.i)
    push(createEv.turnIndex, startEntry.e.turnIndex, createEv.slug)
  }

  // Pass 2: FIFO
  for (const c of creates) {
    if (usedCreate.has(c.i)) continue
    const createEv = c.e
    let paired: { e: PhaseEvent; i: number } | undefined
    for (const st of starts) {
      if (!usedStart.has(st.i) && st.i > c.i) {
        paired = st
        break
      }
    }
    if (paired) {
      usedStart.add(paired.i)
      usedCreate.add(c.i)
      const slug = createEv.slug || slugFromChangeDir(paired.e.taskDir)
      push(createEv.turnIndex, paired.e.turnIndex, slug)
    } else {
      usedCreate.add(c.i)
      push(createEv.turnIndex, totalTurns, createEv.slug)
    }
  }

  // Pass 3: 未配 start
  for (const st of starts) {
    if (usedStart.has(st.i)) continue
    push(0, st.e.turnIndex, slugFromChangeDir(st.e.taskDir))
  }

  windows.sort((a, b) => a.startTurn - b.startTurn)
  return windows
}
