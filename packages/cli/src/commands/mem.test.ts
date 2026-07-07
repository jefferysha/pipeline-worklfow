/**
 * mem 子命令 —— mock 层快速回归（TEST-REALITY.md：真实对位在 mem.integration.test.ts 真 fs）。
 * fake MemFs 仅替换磁盘字节源，dispatch/格式/flag 解析/错误路径穷举；真解析真检索走 kernel。
 */
import { basename, dirname } from 'node:path'
import { opencodeSqliteAvailable } from '@pipeline-lite/kernel'
import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdMem, type MemDirent, type MemFs } from './mem.js'

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

const CLAUDE_FILE = '/home/u/.claude/projects/-repo-proj/s1.jsonl'
const CODEX_FILE = '/home/u/.codex/sessions/rollout-2026-07-02T09-00-00-cdx9.jsonl'

function tree(): MemFs {
  return fakeFs({
    [CLAUDE_FILE]: [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'I need memory search' }, cwd: '/repo/proj', timestamp: '2026-07-01T10:00:00Z' }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Here is the memory design' }] } }),
    ].join('\n'),
    [CODEX_FILE]: [
      JSON.stringify({ timestamp: '2026-07-02T09:00:00Z', payload: { id: 'cdx9', cwd: '/repo/proj' } }),
      JSON.stringify({ payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex memory memory question' }] } }),
    ].join('\n'),
  })
}

describe('list —— 默认命令 + 渲染（老仓 cmd_list）', () => {
  test('--global text：scope 行 + 会话行 + 计数', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'list', ['--global'], tree())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('scope: global  platform=all')
    expect(out).toContain('[claude  ]')
    expect(out).toContain('[codex   ]')
    expect(out).toContain('2 session(s)')
  })

  test('--json：JSON 数组', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'list', ['--global', '--json'], tree())).toBe(0)
    const rows = JSON.parse(deps.outLines.join('\n'))
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(2)
  })

  test('--platform claude：只出 claude', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'list', ['--global', '--platform', 'claude'], tree())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('[claude  ]')
    expect(out).not.toContain('[codex   ]')
    expect(out).toContain('1 session(s)')
  })

  test('未知 platform → stderr + exit 2', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'list', ['--platform', 'bogus'], tree())).toBe(2)
    expect(deps.errLines.join('\n')).toContain('unknown platform')
  })
})

describe('search —— 检索 + 评分（老仓 cmd_search）', () => {
  test('keyword text：命中会话 + score + excerpt', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'search', ['memory', '--global'], tree())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('keyword="memory"')
    expect(out).toContain('score=')
    expect(out).toContain('[user] I need memory search')
    expect(out).toMatch(/\d session\(s\)/)
  })

  test('--json：snake_case 契约字段', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'search', ['memory', '--global', '--json'], tree())).toBe(0)
    const arr = JSON.parse(deps.outLines.join('\n'))
    expect(arr[0]).toHaveProperty('hit_count')
    expect(arr[0]).toHaveProperty('user_count')
    expect(arr[0]).toHaveProperty('total_turns')
    expect(arr[0]).toHaveProperty('score')
  })

  test('无命中 → (no matches)', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'search', ['zzznope', '--global'], tree())).toBe(0)
    expect(deps.outLines.join('\n')).toContain('(no matches)')
  })

  test('缺 keyword → usage + exit 2', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'search', ['--global'], tree())).toBe(2)
    expect(deps.errLines.join('\n')).toContain('usage: search')
  })
})

describe('context —— 钻入单会话（老仓 cmd_context）', () => {
  test('grep 命中 turn text 渲染', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'context', ['s1', '--global', '--grep', 'memory'], tree())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('# context: [claude] s1')
    expect(out).toContain('# query: "memory"')
    expect(out).toContain('I need memory search')
  })

  test('--json：is_hit 契约', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'context', ['s1', '--global', '--grep', 'memory', '--json'], tree())).toBe(0)
    const obj = JSON.parse(deps.outLines.join('\n'))
    expect(obj.total_turns).toBe(2)
    expect(obj.turns[0]).toHaveProperty('is_hit')
  })

  test('缺 id → usage + exit 2', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'context', ['--global'], tree())).toBe(2)
    expect(deps.errLines.join('\n')).toContain('usage: context')
  })

  test('会话不存在 → exit 2', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'context', ['ghost', '--global'], tree())).toBe(2)
    expect(deps.errLines.join('\n')).toContain('session not found')
  })
})

describe('extract —— 清洗对话 dump（老仓 cmd_extract）', () => {
  test('text：session header + Human/Assistant 段', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'extract', ['cdx9', '--global'], tree())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('# session: [codex] cdx9')
    expect(out).toContain('## Human')
    expect(out).toContain('codex memory memory question')
  })

  test('--grep 过滤：无命中 turn → phase 行 turns 0', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'extract', ['cdx9', '--global', '--grep', 'zzznope'], tree())).toBe(0)
    expect(deps.outLines.join('\n')).toContain('turns: 0/1')
  })
})

describe('projects —— cwd 聚合（老仓 cmd_projects）', () => {
  test('text：active projects + per-platform 计数', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'projects', [], tree())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('active projects')
    expect(out).toContain('sessions=  2')
    expect(out).toContain('claude:1')
    expect(out).toContain('codex:1')
    expect(out).toContain('1 project(s)')
  })
})

describe('dispatch / help / opencode warning', () => {
  test('help → 用法 exit 0', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'help', [], tree())).toBe(0)
    expect(deps.outLines.join('\n')).toContain('pipeline mem —')
  })

  test('未知子命令 → exit 2', async () => {
    const deps = makeDeps()
    expect(await cmdMem(deps, 'bogus', ['--global'], tree())).toBe(2)
    expect(deps.errLines.join('\n')).toContain('unknown command')
  })

  test('platform=all → OpenCode warning 仅当 node:sqlite 不可用时走 stderr（G5 闭：真检测而非硬编码）', async () => {
    const deps = makeDeps()
    await cmdMem(deps, 'list', ['--global'], tree())
    const stderr = deps.errLines.join('\n')
    if (opencodeSqliteAvailable()) {
      expect(stderr).not.toContain('OpenCode')
    } else {
      expect(stderr).toContain('OpenCode')
    }
  })
})
