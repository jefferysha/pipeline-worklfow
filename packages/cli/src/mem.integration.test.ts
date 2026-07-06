/**
 * mem 跨 runtime 会话检索 —— 真实端到端集成测试（BACKLOG #28，GOAL C9：无伪测试）。
 *
 * 零 mock：真建 fixture session 历史文件树（Claude/Codex/Pi 真磁盘格式）→ nodeMemFs 指向 fixture
 * home 真读真解析 → 真调 cmdMem search/list/context/extract/projects → 断言真实检索结果
 * （真读真解析真匹配，非 mock 返回）。realDeps 真 kernel deps；mem 只读外部 session（绝不写）。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { realDeps } from './integration-harness.js'
import { cmdMem, nodeMemFs } from './commands/mem.js'

let home: string
let projA: string
let projB: string

const sanitizeClaude = (cwd: string): string => cwd.replace(/[/\\:_.]/g, '-')
const encodePi = (cwd: string): string => `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`

async function writeJsonl(path: string, objs: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, objs.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8')
}

/** 真调 cmdMem（realDeps 真 kernel + nodeMemFs 真读 fixture home）。 */
async function mem(cwd: string, sub: string, args: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = []
  const err: string[] = []
  const code = await cmdMem(realDeps(cwd, out, err), sub, args, nodeMemFs(home))
  return { code, out, err }
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'mem-e2e-'))
  projA = join(home, 'work', 'alpha')
  projB = join(home, 'work', 'beta')

  // ── Claude：~/.claude/projects/<sanitize(cwd)>/<id>.jsonl，cwd=projA ──
  await writeJsonl(join(home, '.claude', 'projects', sanitizeClaude(projA), 'sess-claude-1.jsonl'), [
    { type: 'user', message: { role: 'user', content: 'I need the memory retrieval feature' }, cwd: projA, timestamp: '2026-07-01T10:00:00Z' },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Here is the memory design doc' }] }, timestamp: '2026-07-01T10:01:00Z' },
  ])

  // ── Codex：~/.codex/sessions/**\/rollout-<ts>-<id>.jsonl，cwd=projA（userCount 2 → 排名最高）──
  await writeJsonl(join(home, '.codex', 'sessions', '2026', '07', 'rollout-2026-07-02T09-00-00-cdxA.jsonl'), [
    { timestamp: '2026-07-02T09:00:00Z', payload: { id: 'cdxA', cwd: projA } },
    { payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex memory and more memory please' }] } },
    { payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'sure, no keyword here' }] } },
  ])

  // ── Pi：~/.pi/agent/sessions/--<enc-cwd>--/<ts>_<id>.jsonl，cwd=projB ──
  await writeJsonl(join(home, '.pi', 'agent', 'sessions', encodePi(projB), '2026-07-03_piA.jsonl'), [
    { type: 'session', id: 'piA', cwd: projB, timestamp: '2026-07-03T08:00:00Z' },
    { type: 'session_info', name: 'Pi Alpha Task' },
    { type: 'message', id: 'e1', message: { role: 'user', content: 'pi wants memory too', timestamp: '2026-07-03T08:01:00Z' } },
    { type: 'message', id: 'e2', parentId: 'e1', message: { role: 'assistant', content: [{ type: 'text', text: 'pi reply plain' }] } },
  ])
})

afterAll(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('真实 e2e —— list 跨 runtime 全量枚举', () => {
  test('--global：claude + codex + pi 三 runtime 都真读到', async () => {
    const r = await mem(projA, 'list', ['--global'])
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('[claude  ]')
    expect(out).toContain('[codex   ]')
    expect(out).toContain('[pi      ]')
    expect(out).toContain('3 session(s)')
  })

  test('--platform pi：真解析 Pi session 树（title 从 session_info）', async () => {
    const r = await mem(projA, 'list', ['--global', '--platform', 'pi', '--json'])
    expect(r.code).toBe(0)
    const rows = JSON.parse(r.out.join('\n'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ platform: 'pi', id: 'piA', title: 'Pi Alpha Task', cwd: projB })
  })

  test('cwd 作用域（deps.cwd=projA，无 --global）：只出 projA 会话（claude+codex），pi(projB) 剔除', async () => {
    const r = await mem(projA, 'list', [])
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('2 session(s)')
    expect(out).toContain('[claude  ]')
    expect(out).toContain('[codex   ]')
    expect(out).not.toContain('[pi      ]')
  })
})

describe('真实 e2e —— search 跨 runtime 真检索 + 评分排序', () => {
  test('"memory" --global：真匹配三会话，codex(score3.0) > claude(2.0) > pi(1.5)', async () => {
    const r = await mem(projA, 'search', ['memory', '--global', '--json'])
    expect(r.code).toBe(0)
    const arr = JSON.parse(r.out.join('\n'))
    expect(arr).toHaveLength(3)
    expect(arr.map((m: { session: { platform: string } }) => m.session.platform)).toEqual(['codex', 'claude', 'pi'])
    expect(arr[0].score).toBeCloseTo(3.0)
    expect(arr[0].user_count).toBe(2)
    expect(arr[1].score).toBeCloseTo(2.0)
    expect(arr[2].score).toBeCloseTo(1.5)
  })

  test('text 渲染：真 excerpt 出自真会话内容', async () => {
    const r = await mem(projA, 'search', ['retrieval', '--global'])
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('[claude  ]')
    expect(out).toContain('[user] I need the memory retrieval feature')
    expect(out).toContain('1 session(s)')
  })

  test('无命中关键词 → (no matches)', async () => {
    const r = await mem(projA, 'search', ['zzznomatch', '--global'])
    expect(r.code).toBe(0)
    expect(r.out.join('\n')).toContain('(no matches)')
  })
})

describe('真实 e2e —— context 钻入真会话', () => {
  test('id 前缀 + --grep：真读真选 hit turn', async () => {
    const r = await mem(projA, 'context', ['sess-claude', '--global', '--grep', 'memory'])
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('# context: [claude] sess-claude-1')
    expect(out).toContain('# query: "memory"')
    expect(out).toContain('I need the memory retrieval feature')
  })

  test('--json：真解析 total_turns + is_hit', async () => {
    const r = await mem(projA, 'context', ['cdxA', '--global', '--grep', 'memory', '--json'])
    expect(r.code).toBe(0)
    const obj = JSON.parse(r.out.join('\n'))
    expect(obj.session.platform).toBe('codex')
    expect(obj.total_turns).toBe(2)
    expect(obj.turns.some((t: { is_hit: boolean }) => t.is_hit)).toBe(true)
  })

  test('会话不存在 → exit 2', async () => {
    const r = await mem(projA, 'context', ['ghost-id', '--global'])
    expect(r.code).toBe(2)
    expect(r.err.join('\n')).toContain('session not found')
  })
})

describe('真实 e2e —— extract 真清洗对话', () => {
  test('codex：真 dump Human/Assistant 段', async () => {
    const r = await mem(projA, 'extract', ['cdxA', '--global'])
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('# session: [codex] cdxA')
    expect(out).toContain('## Human')
    expect(out).toContain('codex memory and more memory please')
    expect(out).toContain('## Assistant')
  })

  test('--grep 过滤 turns（单子串 includes）', async () => {
    const r = await mem(projA, 'extract', ['sess-claude-1', '--global', '--grep', 'retrieval'])
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('turns: 1/2')
    expect(out).toContain('I need the memory retrieval feature')
    expect(out).not.toContain('Here is the memory design doc')
  })
})

describe('真实 e2e —— projects 真聚合', () => {
  test('--json：projA(claude+codex, sessions=2) + projB(pi, sessions=1)', async () => {
    const r = await mem(projA, 'projects', ['--json'])
    expect(r.code).toBe(0)
    const rows = JSON.parse(r.out.join('\n'))
    expect(rows).toHaveLength(2)
    const a = rows.find((x: { cwd: string }) => x.cwd === projA)
    const b = rows.find((x: { cwd: string }) => x.cwd === projB)
    expect(a).toMatchObject({ sessions: 2, by_platform: { claude: 1, codex: 1, opencode: 0, pi: 0 } })
    expect(b).toMatchObject({ sessions: 1, by_platform: { claude: 0, codex: 0, opencode: 0, pi: 1 } })
  })
})
