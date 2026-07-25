/**
 * mem 子命令 —— 跨 runtime 会话检索薄壳（BACKLOG #28 / GOAL A4 M4 / D3）。
 * 老仓真相源：skills/pipeline/scripts/mem/cli.py（六子命令语义 + 渲染 + flag 解析见 kernel/src/mem/index.ts 顶注）。
 *   list     (默认)      跨平台会话头列表（recency 降序）            老仓 cli.py:200
 *   search   <keyword>   全会话内容多 token AND 检索 + 评分排序      老仓 cli.py:218
 *   context  <id>        top-N hit turn + around 上下文 + 字符预算   老仓 cli.py:305
 *   extract  <id>        清洗对话 dump（--phase 切片 / --grep 过滤）  老仓 cli.py:401
 *   projects             项目 cwd 聚合 + per-platform 计数           老仓 cli.py:274
 * stdout/exit 对齐老仓：数据/人读表走 stdout，error/warning 走 stderr；错误 exit 2、成功 0。
 *
 * mem 只读外部 session（绝不写用户 session 历史）。
 */
import { resolve } from 'node:path'
import {
  extractMemDialogue,
  listMemProjects,
  listMemSessions,
  MemSessionNotFoundError,
  nodeMemFs,
  opencodeSqliteAvailable,
  readMemContext,
  searchMemSessions,
  type ContextResult,
  type ExtractResult,
  type MemDirent,
  type MemFilter,
  type MemFs,
  type MemPhase,
  type MemPlatformFilter,
} from '@pipeline-lite/kernel'
import { splitFlags } from '../argv.js'
import type { CliDeps } from '../deps.js'
import {
  memIsoDate,
  padMemLeft,
  padMemRight,
  printMemSessions,
  searchMatchJson,
  shortMemDate,
  shortMemPath,
} from './mem-render.js'

// 供 mock/集成测试构造 fake 树 / 真 fs 指向 fixture home
export type { MemDirent, MemFs } from '@pipeline-lite/kernel'
export { nodeMemFs } from '@pipeline-lite/kernel'

const VALID_PLATFORMS = ['claude', 'codex', 'opencode', 'pi', 'all']

/** 用法错误哨兵（对齐老仓 die → exit 2）。 */
class MemDie extends Error {}
function die(msg: string): never {
  throw new MemDie(msg)
}

/** flag 解析共享 argv.ts splitFlags（老仓 parse_argv:35 语义）；boolean 宽于 true 哨兵，协变兼容。 */
interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | boolean>
}

function parseDate(raw: string): number | null {
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : t
}

function parseOptionalNumberFlag(raw: string | boolean | undefined, name: string, fallback: number): number {
  if (raw === undefined || raw === false) return fallback
  if (typeof raw !== 'string') die(`${name} requires a number`)
  const value = Number(raw)
  if (Number.isNaN(value) || !Number.isFinite(value)) die(`bad ${name}: ${raw}`)
  return value
}

/** CLI flag → core MemFilter（校验失败 die exit 2——core 绝不见 raw CLI flag）。老仓 build_filter:64。 */
function buildFilter(deps: CliDeps, flags: Record<string, string | boolean>): MemFilter {
  const platformRaw = typeof flags.platform === 'string' ? flags.platform : 'all'
  if (!VALID_PLATFORMS.includes(platformRaw)) die(`unknown platform: ${platformRaw}`)

  let since: number | null = null
  if (typeof flags.since === 'string') {
    since = parseDate(flags.since)
    if (since === null) die(`bad --since: ${flags.since}`)
  }
  let until: number | null = null
  if (typeof flags.until === 'string') {
    until = parseDate(`${flags.until}T23:59:59.999Z`)
    if (until === null) die(`bad --until: ${flags.until}`)
  }

  let cwd: string | null
  if (flags.global) {
    cwd = null
  } else {
    const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : deps.cwd
    cwd = resolve(cwdFlag)
  }

  const limit = parseOptionalNumberFlag(flags.limit, '--limit', 50)
  return { platform: platformRaw as MemPlatformFilter, since, until, cwd, limit }
}

function parsePhaseFlag(raw: string | boolean | undefined): MemPhase {
  if (raw === undefined || raw === false) return 'all'
  if (raw === 'brainstorm' || raw === 'implement' || raw === 'all') return raw
  die(`unknown --phase: ${String(raw)} (expected brainstorm|implement|all)`)
}

// ---------- OpenCode reader notice ----------

function maybeWarnOpencode(deps: CliDeps, f: MemFilter): void {
  if ((f.platform === 'all' || f.platform === 'opencode') && !opencodeSqliteAvailable()) {
    deps.io.err('⚠️  tl mem: OpenCode platform reader is unavailable on this Node runtime.')
    deps.io.err('    OpenCode reads require node:sqlite (Node >=22.13, or >=22.5 with --experimental-sqlite).')
  }
}

// ---------- commands ----------

function cmdList(deps: CliDeps, p: ParsedArgs, fs: MemFs): number {
  const f = buildFilter(deps, p.flags)
  maybeWarnOpencode(deps, f)
  const rows = listMemSessions(fs, { filter: f })
  if (p.flags.json) {
    deps.io.out(JSON.stringify(rows, null, 2))
    return 0
  }
  const scope = f.cwd ? `project=${shortMemPath(fs, f.cwd)}` : 'global'
  let line = `scope: ${scope}  platform=${f.platform}`
  if (f.since != null) line += `  since=${memIsoDate(f.since)}`
  if (f.until != null) line += `  until=${memIsoDate(f.until)}`
  deps.io.out(line)
  printMemSessions(deps, fs, rows)
  deps.io.out(`\n${rows.length} session(s)`)
  return 0
}

function cmdSearch(deps: CliDeps, p: ParsedArgs, fs: MemFs): number {
  const kw = p.positional[0]
  if (!kw) die('usage: search <keyword>')
  const f = buildFilter(deps, p.flags)
  maybeWarnOpencode(deps, f)
  const includeChildren = p.flags['include-children'] === true
  const result = searchMemSessions(fs, { keyword: kw, filter: f, includeChildren })
  const top = result.matches

  if (p.flags.json) {
    deps.io.out(JSON.stringify(top.map((m) => searchMatchJson(m, includeChildren)), null, 2))
    return 0
  }
  const scope = f.cwd ? `project=${shortMemPath(fs, f.cwd)}` : 'global'
  let head = `scope: ${scope}  keyword="${kw}"  platform=${f.platform}`
  if (includeChildren) head += '  include-children=on'
  deps.io.out(head)
  if (!top.length) {
    deps.io.out('(no matches)')
    return 0
  }
  for (const m of top) {
    const s = m.session
    const idShort = s.id.slice(0, 12)
    const score = m.score.toFixed(3)
    const childTag = includeChildren && m.descendantsMerged > 0 ? `  +${m.descendantsMerged} child` : ''
    const title = s.title ? `  — ${s.title}` : ''
    const hit = m.hit
    deps.io.out(
      `\n[${padMemRight(s.platform, 8)}] ${shortMemDate(s.updated || s.created)}  ${idShort}  ${shortMemPath(fs, s.cwd)}` +
        `  score=${score}  hits=${hit.count} (u=${hit.userCount},a=${hit.asstCount})  turns=${hit.totalTurns}${childTag}${title}`,
    )
    for (const ex of hit.excerpts) deps.io.out(`    [${ex.role}] ${ex.snippet}`)
  }
  const extra = result.totalMatches > top.length ? ` (of ${result.totalMatches})` : ''
  deps.io.out(`\n${top.length} session(s)${extra}`)
  return 0
}

function cmdProjects(deps: CliDeps, p: ParsedArgs, fs: MemFs): number {
  const f = buildFilter(deps, { ...p.flags, global: true })
  maybeWarnOpencode(deps, f)
  const rows = listMemProjects(fs, { filter: f })
  const limit = parseOptionalNumberFlag(p.flags.limit, '--limit', 30)
  const top = rows.slice(0, limit)

  if (p.flags.json) {
    deps.io.out(JSON.stringify(top, null, 2))
    return 0
  }
  let head = 'active projects'
  if (f.since != null) head += `  since=${memIsoDate(f.since)}`
  if (f.until != null) head += `  until=${memIsoDate(f.until)}`
  deps.io.out(head)
  if (!top.length) {
    deps.io.out('(none)')
    return 0
  }
  for (const r of top) {
    const parts = Object.entries(r.by_platform)
      .filter(([, n]) => n > 0)
      .map(([pl, n]) => `${pl}:${n}`)
      .join(' ')
    deps.io.out(`${shortMemDate(r.last_active)}  sessions=${padMemLeft(String(r.sessions), 3)} (${parts})  ${shortMemPath(fs, r.cwd)}`)
  }
  const extra = rows.length > top.length ? ` (of ${rows.length})` : ''
  deps.io.out(`\n${top.length} project(s)${extra}`)
  return 0
}

function cmdContext(deps: CliDeps, p: ParsedArgs, fs: MemFs): number {
  const sid = p.positional[0]
  if (!sid) die('usage: context <session-id> [--grep KW] [--turns N] [--around M]')
  const f = buildFilter(deps, p.flags)
  maybeWarnOpencode(deps, f)

  const grep = typeof p.flags.grep === 'string' ? p.flags.grep : null
  if (grep !== null && grep.split(/\s+/).filter(Boolean).length === 0) die('--grep requires non-empty value')
  const nTurns = parseOptionalNumberFlag(p.flags.turns, '--turns', 3)
  const around = parseOptionalNumberFlag(p.flags.around, '--around', 1)
  const maxChars = parseOptionalNumberFlag(p.flags['max-chars'], '--max-chars', 6000)
  const includeChildren = p.flags['include-children'] === true

  const result: ContextResult = readMemContext(fs, {
    sessionId: sid,
    filter: f,
    grep,
    turns: nTurns,
    around,
    maxChars,
    includeChildren,
  })
  const s = result.session

  if (p.flags.json) {
    deps.io.out(
      JSON.stringify(
        {
          session: s,
          query: result.query,
          total_turns: result.totalTurns,
          total_hit_turns: result.totalHitTurns,
          merged_children: result.mergedChildren,
          turns: result.turns.map((t) => ({ idx: t.idx, role: t.role, text: t.text, is_hit: t.isHit })),
        },
        null,
        2,
      ),
    )
    return 0
  }

  const shown = grep ? Math.min(result.totalHitTurns, nTurns) : Math.min(nTurns, result.totalTurns)
  deps.io.out(`# context: [${s.platform}] ${s.id}`)
  if (s.title) deps.io.out(`# title: ${s.title}`)
  if (s.cwd) deps.io.out(`# cwd:   ${shortMemPath(fs, s.cwd)}`)
  if (grep) deps.io.out(`# query: "${grep}"  hit_turns=${result.totalHitTurns}  showing top ${shown}`)
  else deps.io.out(`# no grep — showing first ${shown} turns of ${result.totalTurns}`)
  if (result.mergedChildren > 0) deps.io.out(`# merged_children: ${result.mergedChildren}`)
  deps.io.out(`# turns shown: ${result.turns.length}  budget_used: ${result.budgetUsed}/${result.maxChars} chars`)
  deps.io.out('')
  for (const t of result.turns) {
    const marker = t.isHit ? '  ← hit' : ''
    deps.io.out(`## turn ${t.idx} (${t.role})${marker}\n`)
    deps.io.out(t.text)
    deps.io.out('\n---\n')
  }
  return 0
}

function cmdExtract(deps: CliDeps, p: ParsedArgs, fs: MemFs): number {
  const sid = p.positional[0]
  if (!sid) die('usage: extract <session-id>')
  const f = buildFilter(deps, p.flags)
  maybeWarnOpencode(deps, f)

  const phase = parsePhaseFlag(p.flags.phase)
  const grep = typeof p.flags.grep === 'string' ? p.flags.grep.toLowerCase() : null

  const result: ExtractResult = extractMemDialogue(fs, { sessionId: sid, filter: f, phase, grep })
  for (const w of result.warnings) deps.io.err(`warning: ${w.message}`)

  const s = result.session
  if (p.flags.json) {
    deps.io.out(
      JSON.stringify(
        {
          session: s,
          phase: result.phase,
          windows: result.windows,
          total_turns: result.totalTurns,
          groups: result.groups,
          turns: result.turns,
        },
        null,
        2,
      ),
    )
    return 0
  }

  deps.io.out(`# session: [${s.platform}] ${s.id}`)
  if (s.title) deps.io.out(`# title: ${s.title}`)
  if (s.cwd) deps.io.out(`# cwd:   ${shortMemPath(fs, s.cwd)}`)
  if (s.created) deps.io.out(`# date:  ${shortMemDate(s.created)}`)
  let line = `# phase: ${result.phase}  turns: ${result.turns.length}/${result.totalTurns}`
  if (grep) line += ` (filtered by /${grep}/)`
  if (result.windows.length > 0) line += `  windows: ${result.windows.length}`
  deps.io.out(line)
  deps.io.out('')
  for (const g of result.groups) {
    if (g.label !== null) deps.io.out(`--- task: ${g.label} ---\n`)
    for (const t of g.turns) {
      deps.io.out(`## ${t.role === 'user' ? 'Human' : 'Assistant'}\n`)
      deps.io.out(t.text)
      deps.io.out('\n---\n')
    }
  }
  return 0
}

function cmdHelp(deps: CliDeps): void {
  deps.io.out(`pipeline mem — list/search Claude/Codex/OpenCode/Pi sessions

commands:
  list                          list sessions (default if no command)
  search <keyword>              find sessions whose contents match keyword
  context <session-id>          drill-down: top-N hit turns + surrounding context
  extract <session-id>          dump cleaned dialogue (use --grep KW to filter turns)
  projects                      list active projects (cwds) with session counts

flags:
  --platform claude|codex|opencode|pi|all   default all
  --since YYYY-MM-DD / --until YYYY-MM-DD    inclusive bounds
  --global                                   include all projects (default: cwd-scoped)
  --cwd <path>                               override the project cwd
  --limit N                                  cap output (default 50; projects 30)
  --grep KW                                  extract / context: filter turns by keyword
  --phase brainstorm|implement|all           extract: slice by pipeline brainstorm windows
  --turns N / --around N / --max-chars N      context: window + budget
  --include-children                         search / context: merge sub-agent sessions
  --json                                     emit JSON`)
}

/**
 * mem 子命令分派（纯函数 + deps 注入 + fs 注入面）。
 * fs 缺省真 node fs（读用户真实 session 目录）；mock 层注入 fake 树、集成层 nodeMemFs 指向 fixture home。
 */
export async function cmdMem(deps: CliDeps, sub: string, args: string[], fs: MemFs = nodeMemFs()): Promise<number> {
  const p = splitFlags(args)
  if (p.flags.help || p.flags.h || sub === 'help' || sub === '--help') {
    cmdHelp(deps)
    return 0
  }
  const cmd = sub || 'list'
  try {
    switch (cmd) {
      case 'list':
        return cmdList(deps, p, fs)
      case 'search':
        return cmdSearch(deps, p, fs)
      case 'context':
        return cmdContext(deps, p, fs)
      case 'extract':
        return cmdExtract(deps, p, fs)
      case 'projects':
        return cmdProjects(deps, p, fs)
      default:
        die(`unknown command: ${cmd} (try 'help')`)
    }
  } catch (e) {
    if (e instanceof MemDie) {
      deps.io.err(`error: ${e.message}`)
      return 2
    }
    if (e instanceof MemSessionNotFoundError) {
      deps.io.err(`error: session not found: ${e.sessionId}`)
      return 2
    }
    throw e
  }
}
