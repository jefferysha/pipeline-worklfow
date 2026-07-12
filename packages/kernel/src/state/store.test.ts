import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuoteGateError, type StateStore } from '../types.js'
import { createStateStore } from './index.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const CLOCK = () => '2026-07-06T00:00:00Z'

let repoRoot: string
let store: StateStore

async function seedChange(name: string, fixture: string): Promise<string> {
  const changeDir = path.join(repoRoot, 'openspec', 'changes', name)
  await mkdir(changeDir, { recursive: true })
  await copyFile(path.join(FIXTURES, fixture), path.join(changeDir, '.pipeline.yaml'))
  return changeDir
}

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), 'pl-store-'))
  store = createStateStore()
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

describe('read / write / get', () => {
  it('read 解析磁盘文件；write 落盘后与原文件逐字节等价（含历史区逐字保留）', async () => {
    const dir = await seedChange('rt', 'dashboard-interaction-fixes.pipeline.yaml')
    const before = await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')
    const state = await store.read(dir)
    await store.write(dir, state)
    const after = await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')
    expect(after).toBe(before)
  })

  it('get 返回裸值（去引号后）；列表字段返回数组', async () => {
    const dir = await seedChange('g', 'synthetic-lists.pipeline.yaml')
    expect(await store.get(dir, 'track')).toBe('backend')
    expect(await store.get(dir, 'automation_sandbox')).toBe('')
    expect(await store.get(dir, 'scope')).toEqual(['packages/kernel', 'packages/cli'])
    expect(await store.get(dir, 'spec_scope')).toEqual([])
  })

  it('read 不存在的 change → 抛 ENOENT', async () => {
    await expect(store.read(path.join(repoRoot, 'nope'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('set / setMany / cas', () => {
  it('set 只改目标字段，历史区与其余字段逐字保留', async () => {
    const dir = await seedChange('s', 'zz-container-e2e.pipeline.yaml')
    const before = await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')
    await store.set(dir, 'phase', 'verify')
    const after = await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')
    expect(after).toBe(before.replace('phase: build\n', 'phase: verify\n'))
  })

  it('set 列表字段为数组 → 块序列；空数组 → []', async () => {
    const dir = await seedChange('sl', 'zz-container-e2e.pipeline.yaml')
    await store.set(dir, 'scope', ['a', 'b'])
    expect(await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')).toContain('scope:\n  - a\n  - b\n')
    await store.set(dir, 'scope', [])
    expect(await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')).toContain('scope: []\n')
  })

  it.each([
    ['冒号+空格', 'x: y'],
    ['空格+井号', 'x #y'],
    ['换行', 'x\ny'],
    ['首字符引号', '"x'],
  ])('四闸注入 set（%s）→ throw QuoteGateError 且文件零改动', async (_label, bad) => {
    const dir = await seedChange('gate', 'zz-container-e2e.pipeline.yaml')
    const before = await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')
    await expect(store.set(dir, 'plan', bad)).rejects.toThrow(QuoteGateError)
    expect(await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')).toBe(before)
  })

  it('setMany 原子批量；任一值触闸 → 整批拒绝零落盘', async () => {
    const dir = await seedChange('sm', 'zz-container-e2e.pipeline.yaml')
    await store.setMany(dir, { phase: 'verify', verify_result: 'pass' })
    expect(await store.get(dir, 'phase')).toBe('verify')
    expect(await store.get(dir, 'verify_result')).toBe('pass')

    const before = await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')
    await expect(store.setMany(dir, { phase: 'ship', plan: 'bad: value' })).rejects.toThrow(QuoteGateError)
    expect(await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')).toBe(before)
  })

  it('cas：expect 命中 → 写入返回 true；不命中 → 不写返回 false', async () => {
    const dir = await seedChange('cas', 'zz-container-e2e.pipeline.yaml')
    expect(await store.cas(dir, 'phase', 'build', 'verify')).toBe(true)
    expect(await store.get(dir, 'phase')).toBe('verify')
    const before = await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')
    expect(await store.cas(dir, 'phase', 'build', 'ship')).toBe(false)
    expect(await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')).toBe(before)
  })
})

describe('init（heredoc 语义）', () => {
  const HEREDOC = `track: backend
preset: full
created_by: unknown
assignee: null
phase: open
phase_status: pending
design_doc: null
plan: null
verification_report: null
build_mode: null
isolation: null
build_sha: null
agent_review_result: pending
codex_review_result: pending
verify_result: pending
branch_status: pending
direct_override: false
prd_path: null
pr_url: null
automation: off
automation_queued_at: ""
automation_sandbox: ""
automation_worktree: ""
automation_attempts: 0
automation_last_error: ""
automation_preserved_path: ""
branch: null
base_branch: main
scope: null
related_files: null
spec_scope: null
depends_on: null
created_at: 2026-07-06T00:00:00Z
updated_at: 2026-07-06T00:00:00Z
verified_at: null
archived_at: null
archived: false
workflow: default
automation_current_phase: ""
`

  it('建 change 骨架：目录 + .pipeline.yaml 与老仓 heredoc 逐字节一致（注入时钟）', async () => {
    const dir = await store.init({ repoRoot, name: 'my-change', track: 'backend', preset: 'full', clock: CLOCK })
    expect(dir).toBe(path.join(repoRoot, 'openspec', 'changes', 'my-change'))
    expect(await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')).toBe(HEREDOC)
  })

  it('pm track → agent/codex review 种为 skipped', async () => {
    const dir = await store.init({ repoRoot, name: 'pm-change', track: 'pm', preset: 'full', clock: CLOCK })
    expect(await store.get(dir, 'agent_review_result')).toBe('skipped')
    expect(await store.get(dir, 'codex_review_result')).toBe('skipped')
  })

  it('user 真值经四闸写入 created_by（先安全占位 unknown 再写真值）', async () => {
    const dir = await store.init({ repoRoot, name: 'u1', track: 'backend', preset: 'full', user: 'Host Dev', clock: CLOCK })
    expect(await store.get(dir, 'created_by')).toBe('Host Dev')
  })

  it('user 含破坏字符 → 触闸保留 unknown，不阻断 init', async () => {
    const dir = await store.init({ repoRoot, name: 'u2', track: 'backend', preset: 'full', user: 'Evil: Dev', clock: CLOCK })
    expect(await store.get(dir, 'created_by')).toBe('unknown')
  })

  it('base_branch 读 .git/HEAD 的当前分支；无 git 回退 main', async () => {
    await mkdir(path.join(repoRoot, '.git'), { recursive: true })
    await writeFile(path.join(repoRoot, '.git', 'HEAD'), 'ref: refs/heads/feat/wave1\n')
    const dir = await store.init({ repoRoot, name: 'b1', track: 'backend', preset: 'full', clock: CLOCK })
    expect(await store.get(dir, 'base_branch')).toBe('feat/wave1')
  })

  it('B8：worktree 内 .git 为文件(gitdir 指针)→ 解析指针读真 HEAD（automation 用 worktree，勿静默回退 main）', async () => {
    const gitdir = path.join(repoRoot, 'mainrepo', '.git', 'worktrees', 'wt1')
    await mkdir(gitdir, { recursive: true })
    await writeFile(path.join(gitdir, 'HEAD'), 'ref: refs/heads/afk/wave2\n')
    // worktree 根的 .git 是文件，内容是 `gitdir: <path>` 指针
    await writeFile(path.join(repoRoot, '.git'), `gitdir: ${gitdir}\n`)
    const dir = await store.init({ repoRoot, name: 'wtc', track: 'backend', preset: 'full', clock: CLOCK })
    expect(await store.get(dir, 'base_branch')).toBe('afk/wave2')
  })

  it('B8：.git 指针 detached（gitdir/HEAD 无 ref:）→ 回退 main（不阻断 init）', async () => {
    const gitdir = path.join(repoRoot, 'mainrepo', '.git', 'worktrees', 'wt2')
    await mkdir(gitdir, { recursive: true })
    await writeFile(path.join(gitdir, 'HEAD'), 'a1b2c3d4e5f6\n') // detached：裸 sha
    await writeFile(path.join(repoRoot, '.git'), `gitdir: ${gitdir}\n`)
    const dir = await store.init({ repoRoot, name: 'wtd', track: 'backend', preset: 'full', clock: CLOCK })
    expect(await store.get(dir, 'base_branch')).toBe('main')
  })

  it('非法 change 名（空/怪字符/..）→ 拒绝', async () => {
    await expect(store.init({ repoRoot, name: '', track: 'backend', preset: 'full', clock: CLOCK })).rejects.toThrow()
    await expect(store.init({ repoRoot, name: 'a/b', track: 'backend', preset: 'full', clock: CLOCK })).rejects.toThrow()
    await expect(store.init({ repoRoot, name: '..', track: 'backend', preset: 'full', clock: CLOCK })).rejects.toThrow()
  })

  it('已初始化的 change → fail-loud 拒绝（不覆盖既有状态）', async () => {
    await store.init({ repoRoot, name: 'dup', track: 'backend', preset: 'full', clock: CLOCK })
    await expect(store.init({ repoRoot, name: 'dup', track: 'backend', preset: 'full', clock: CLOCK })).rejects.toThrow()
  })
})

describe('并发（20 写锁零丢失）', () => {
  it('20 并发 withLock 读改写自增 → 零丢失（最终 =20）', async () => {
    const dir = await seedChange('cc1', 'zz-container-e2e.pipeline.yaml')
    await store.set(dir, 'automation_attempts', '0')
    await Promise.all(
      Array.from({ length: 20 }, () =>
        store.withLock(dir, async () => {
          const s = await store.read(dir)
          s.fields.automation_attempts = String(Number(s.fields.automation_attempts) + 1)
          await store.write(dir, s)
        }),
      ),
    )
    expect(await store.get(dir, 'automation_attempts')).toBe('20')
  })

  it('20 并发 set 不同字段 → 全部落盘且历史区完好', async () => {
    const dir = await seedChange('cc2', 'dashboard-interaction-fixes.pipeline.yaml')
    const fields = [
      'assignee', 'design_doc', 'plan', 'verification_report', 'build_mode',
      'isolation', 'build_sha', 'agent_review_result', 'codex_review_result', 'verify_result',
      'branch_status', 'prd_path', 'automation_sandbox', 'automation_worktree', 'automation_last_error',
      'automation_preserved_path', 'branch', 'base_branch', 'created_by', 'phase_status',
    ] as const
    await Promise.all(fields.map((f, i) => store.set(dir, f, `v-${i}`)))
    for (const [i, f] of fields.entries()) {
      expect(await store.get(dir, f)).toBe(`v-${i}`)
    }
    const raw = await readFile(path.join(dir, '.pipeline.yaml'), 'utf8')
    expect(raw).toContain('tools_history:')
    expect(raw.endsWith('coverage_confirmed_by: Host Dev\n')).toBe(true)
  })
})
