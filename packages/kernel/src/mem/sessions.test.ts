/**
 * mem/sessions + adapters —— 会话编排单元（真解析 + 真检索算法，fake fs 仅替换磁盘字节源）。
 * 真实磁盘对位在 packages/cli/src/mem.integration.test.ts（nodeMemFs 真读真文件）。
 * 对位老仓 skills/pipeline/scripts/mem/{sessions,adapters/claude,adapters/codex}.py。
 */
import { basename, dirname } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { MemDirent, MemFs } from './fs.js'
import {
  buildChildIndex,
  extractMemDialogue,
  findSessionById,
  listMemSessions,
  MemSessionNotFoundError,
  searchMemSessions,
} from './sessions.js'
import { readMemContext } from './context.js'
import { listMemProjects } from './projects.js'

/** fake MemFs：从 path→content 映射派生目录树；仅替换磁盘读，解析/检索走真逻辑。 */
function fakeFs(files: Record<string, string>, mtimes: Record<string, number>): MemFs {
  const fileSet = new Set(Object.keys(files))
  const dirs = new Set<string>()
  for (const p of fileSet) {
    let d = dirname(p)
    while (d && !dirs.has(d)) {
      dirs.add(d)
      const parent = dirname(d)
      if (parent === d) break
      d = parent
    }
  }
  return {
    home: '/home/u',
    exists: (p) => fileSet.has(p) || dirs.has(p),
    readDir: (p) => {
      const out: MemDirent[] = []
      for (const f of fileSet) if (dirname(f) === p) out.push({ name: basename(f), isFile: true, isDirectory: false })
      for (const d of dirs) if (dirname(d) === p && d !== p) out.push({ name: basename(d), isFile: false, isDirectory: true })
      return out
    },
    readText: (p) => files[p],
    mtimeMs: (p) => mtimes[p] ?? (fileSet.has(p) ? Date.parse('2026-07-05T00:00:00Z') : undefined),
    env: () => undefined,
  }
}

const CLAUDE_DIR = '/home/u/.claude/projects/-home-u-work-proj'
const CLAUDE_FILE = `${CLAUDE_DIR}/sess-abc123.jsonl`
const CODEX_FILE = '/home/u/.codex/sessions/2026/07/rollout-2026-07-02T09-00-00-cdx789.jsonl'

const claudeLines = [
  JSON.stringify({
    type: 'user',
    message: { role: 'user', content: 'I need memory search' },
    cwd: '/home/u/work/proj',
    timestamp: '2026-07-01T10:00:00Z',
  }),
  JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Here is the memory design' }] },
    timestamp: '2026-07-01T10:01:00Z',
  }),
].join('\n')

const codexLines = [
  JSON.stringify({ timestamp: '2026-07-02T09:00:00Z', payload: { id: 'cdx789', cwd: '/home/u/work/proj' } }),
  JSON.stringify({ payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex memory memory question' }] } }),
  JSON.stringify({ payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer without keyword' }] } }),
].join('\n')

function fs2(): MemFs {
  return fakeFs(
    { [CLAUDE_FILE]: claudeLines, [CODEX_FILE]: codexLines },
    { [CLAUDE_FILE]: Date.parse('2026-07-05T00:00:00Z'), [CODEX_FILE]: Date.parse('2026-07-04T00:00:00Z') },
  )
}

describe('listMemSessions —— fan-out 跨 runtime（老仓 list_all:58）', () => {
  test('claude + codex 会话都被枚举，recency 降序', () => {
    const rows = listMemSessions(fs2(), { filter: { cwd: null } })
    expect(rows).toHaveLength(2)
    expect(rows[0]?.platform).toBe('claude') // 2026-07-05 更新更新
    expect(rows[1]?.platform).toBe('codex')
    const claude = rows.find((r) => r.platform === 'claude')!
    expect(claude.id).toBe('sess-abc123')
    expect(claude.cwd).toBe('/home/u/work/proj')
    expect(claude.created).toBe('2026-07-01T10:00:00Z')
    expect(claude.updated?.startsWith('2026-07-05')).toBe(true)
  })

  test('platform=claude 只出 claude', () => {
    const rows = listMemSessions(fs2(), { filter: { cwd: null, platform: 'claude' } })
    expect(rows.map((r) => r.platform)).toEqual(['claude'])
  })

  test('cwd 作用域过滤（不匹配 → 空）', () => {
    const rows = listMemSessions(fs2(), { filter: { cwd: '/other/project' } })
    expect(rows).toHaveLength(0)
  })
})

describe('searchMemSessions —— 跨 runtime 检索 + 评分排序（老仓 search_mem_sessions:263）', () => {
  test('codex（userCount 2 → score 3.0）排在 claude（score 2.0）之前', () => {
    const res = searchMemSessions(fs2(), { keyword: 'memory', filter: { cwd: null } })
    expect(res.totalMatches).toBe(2)
    expect(res.matches[0]?.session.platform).toBe('codex')
    expect(res.matches[0]?.score).toBeCloseTo(3.0)
    expect(res.matches[1]?.session.platform).toBe('claude')
    expect(res.matches[1]?.score).toBeCloseTo(2.0)
    expect(res.matches[0]?.hit.userCount).toBe(2)
  })

  test('无命中关键词 → 空 matches', () => {
    const res = searchMemSessions(fs2(), { keyword: 'zzznomatch', filter: { cwd: null } })
    expect(res.matches).toEqual([])
    expect(res.totalMatches).toBe(0)
  })
})

describe('buildChildIndex —— platform-scoped OpenCode parent identity', () => {
  test('does not attach an OpenCode child to a Codex session with the same bare id', () => {
    const codex = {
      platform: 'codex' as const,
      id: 'shared',
      filePath: '/codex/shared.jsonl',
    }
    const opencodeParent = {
      platform: 'opencode' as const,
      id: 'shared',
      filePath: '/opencode.db',
    }
    const opencodeChild = {
      platform: 'opencode' as const,
      id: 'child',
      parent_id: 'shared',
      filePath: '/opencode.db',
    }

    const index = buildChildIndex([codex, opencodeParent, opencodeChild])

    expect(index.get('codex:shared')).toBeUndefined()
    expect(index.get('opencode:shared')).toEqual([opencodeChild])
  })
})

describe('extractMemDialogue —— 按 id 解析清洗对话（老仓 extract_mem_dialogue:339）', () => {
  test('codex 会话 → user/asst turns', () => {
    const res = extractMemDialogue(fs2(), { sessionId: 'cdx789', filter: { cwd: null } })
    expect(res.session.platform).toBe('codex')
    expect(res.turns.map((t) => t.role)).toEqual(['user', 'assistant'])
    expect(res.turns[0]?.text).toBe('codex memory memory question')
  })

  test('grep 过滤 turns（单子串 includes）', () => {
    const res = extractMemDialogue(fs2(), { sessionId: 'cdx789', filter: { cwd: null }, grep: 'without' })
    expect(res.turns).toHaveLength(1)
    expect(res.turns[0]?.role).toBe('assistant')
  })

  test('未知 id → MemSessionNotFoundError', () => {
    expect(() => extractMemDialogue(fs2(), { sessionId: 'nope', filter: { cwd: null } })).toThrow(MemSessionNotFoundError)
  })
})

describe('findSessionById —— 精确 + 前缀解析（老仓 find_session_by_id:148）', () => {
  test('前缀匹配', () => {
    const s = findSessionById(fs2(), 'sess-abc', { cwd: null })
    expect(s?.id).toBe('sess-abc123')
  })
  test('不存在 → null', () => {
    expect(findSessionById(fs2(), 'ghost', { cwd: null })).toBeNull()
  })
})

describe('readMemContext —— 钻入单会话上下文（老仓 read_mem_context:95）', () => {
  test('grep 命中 turn + 预算', () => {
    const res = readMemContext(fs2(), { sessionId: 'sess-abc123', filter: { cwd: null }, grep: 'memory', turns: 3, around: 0 })
    expect(res.session.id).toBe('sess-abc123')
    expect(res.totalTurns).toBe(2)
    expect(res.totalHitTurns).toBe(2)
    expect(res.turns.every((t) => t.isHit)).toBe(true)
  })
})

describe('listMemProjects —— 项目聚合（老仓 list_mem_projects:11）', () => {
  test('按 cwd 聚合 + per-platform 计数', () => {
    const rows = listMemProjects(fs2(), { filter: {} })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.cwd).toBe('/home/u/work/proj')
    expect(rows[0]?.sessions).toBe(2)
    expect(rows[0]?.by_platform).toEqual({ claude: 1, codex: 1, opencode: 0, pi: 0 })
  })
})
