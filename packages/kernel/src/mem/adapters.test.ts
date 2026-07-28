/**
 * mem/adapters —— Pi runtime 格式 + Claude compaction 重置（真解析，fake fs 字节源）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/{pi,claude}.py。
 */
import { basename, dirname } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { MemDirent, MemFs } from './fs.js'
import { extractMemDialogue, listMemSessions } from './sessions.js'

function fakeFs(files: Record<string, string>): MemFs {
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
    mtimeMs: (p) => (fileSet.has(p) ? Date.parse('2026-07-05T00:00:00Z') : undefined),
    env: () => undefined,
  }
}

const PI_FILE = '/home/u/.pi/agent/sessions/--home-u-work-proj--/2026-07-03_pi-sess-1.jsonl'
const piLines = [
  JSON.stringify({ type: 'session', id: 'pi-sess-1', cwd: '/home/u/work/proj', timestamp: '2026-07-03T08:00:00Z' }),
  JSON.stringify({ type: 'session_info', name: 'My Pi Task' }),
  JSON.stringify({ type: 'message', id: 'e1', message: { role: 'user', content: 'pi memory thoughts', timestamp: '2026-07-03T08:01:00Z' } }),
  JSON.stringify({ type: 'message', id: 'e2', parentId: 'e1', message: { role: 'assistant', content: [{ type: 'text', text: 'pi memory reply' }] } }),
].join('\n')

describe('Pi runtime —— session 树 + 活跃分支解析（老仓 pi.py）', () => {
  test('list 出 pi 会话（title 从 session_info、cwd 从 header）', () => {
    const rows = listMemSessions(fakeFs({ [PI_FILE]: piLines }), { filter: { cwd: null, platform: 'pi' } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('pi-sess-1')
    expect(rows[0]?.title).toBe('My Pi Task')
    expect(rows[0]?.cwd).toBe('/home/u/work/proj')
    expect(rows[0]?.created).toBe('2026-07-03T08:00:00Z')
  })

  test('extract 沿 id/parentId 活跃分支得 user/asst turns', () => {
    const res = extractMemDialogue(fakeFs({ [PI_FILE]: piLines }), { sessionId: 'pi-sess-1', filter: { cwd: null } })
    expect(res.turns).toEqual([
      { role: 'user', text: 'pi memory thoughts' },
      { role: 'assistant', text: 'pi memory reply' },
    ])
  })
})

const CLAUDE_FILE = '/home/u/.claude/projects/-home-u-work-proj/comp.jsonl'
const claudeCompactionLines = [
  JSON.stringify({ type: 'user', message: { role: 'user', content: 'early stuff' }, cwd: '/home/u/work/proj', timestamp: '2026-07-01T10:00:00Z' }),
  JSON.stringify({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'the summary' } }),
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'post compact' }] } }),
].join('\n')

describe('Claude compaction —— isCompactSummary 重置 turns（老仓 claude.py:127）', () => {
  test('compaction 前的 turn 被丢弃，替为 [compact summary]', () => {
    const res = extractMemDialogue(fakeFs({ [CLAUDE_FILE]: claudeCompactionLines }), {
      sessionId: 'comp',
      filter: { cwd: null },
    })
    expect(res.turns[0]).toEqual({ role: 'user', text: '[compact summary]\nthe summary' })
    expect(res.turns[1]).toEqual({ role: 'assistant', text: 'post compact' })
    expect(res.turns.find((t) => t.text === 'early stuff')).toBeUndefined()
  })

  test('项目目录名碰撞且会话缺少 cwd 时 fail closed，不泄露到请求项目', () => {
    const collision = '/home/u/.claude/projects/-home-u-work-proj/missing-cwd.jsonl'
    const rows = listMemSessions(fakeFs({
      [collision]: JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'private session from a colliding path' },
        timestamp: '2026-07-01T10:00:00Z',
      }),
    }), {
      filter: { cwd: '/home/u/work/proj', platform: 'claude' },
    })

    expect(rows).toEqual([])
  })
})
