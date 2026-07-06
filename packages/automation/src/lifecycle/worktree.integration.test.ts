import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nodeExec } from '../runner/exec.js'
import { realWorktreePort } from './worktree.js'

const execFileAsync = promisify(execFile)

/**
 * 真 git worktree 集成（诚实门：本机 git 可用真跑 worktree add/remove；无 git → honest skip）。
 * 真建仓 → realWorktreePort.create 真 `git worktree add` → 断言目录 + 分支真实存在 → remove 真清。
 */
const git = (cwd: string, args: string[]) =>
  execFileAsync('git', args, { cwd, env: { ...process.env, LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null' } })

let hasGit = false

describe('worktree 真 git 集成', () => {
  let root: string

  beforeAll(async () => {
    try {
      await execFileAsync('git', ['--version'])
      hasGit = true
    } catch {
      console.warn('[HONEST SKIP] git 不可用 → worktree 真 git 集成跳过（绝不伪绿）')
    }
  })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'afk-wt-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('create 真 worktree add → 目录 + 命名分支真实存在；remove 真清', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await git(root, ['init', '-q', '-b', 'main'])
    await git(root, ['config', 'user.email', 'afk@test'])
    await git(root, ['config', 'user.name', 'afk'])
    await writeFile(join(root, 'f.txt'), 'hi')
    await git(root, ['add', '.'])
    await git(root, ['commit', '-q', '-m', 'c1'])

    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/mychange')
    expect(wt.branch).toBe('sandcastle-pipeline/mychange')

    // 目录真实存在
    const s = await stat(wt.path)
    expect(s.isDirectory()).toBe(true)
    // git 真的认这个 worktree（porcelain 列表含它）
    const { stdout } = await git(root, ['worktree', 'list', '--porcelain'])
    expect(stdout).toContain(wt.path)
    // 命名分支真实存在
    const { stdout: branches } = await git(root, ['branch', '--list', 'sandcastle-pipeline/mychange'])
    expect(branches.trim()).toContain('sandcastle-pipeline/mychange')

    await port.remove(wt.path)
    await expect(stat(wt.path)).rejects.toThrow() // 目录真被清
    const { stdout: after } = await git(root, ['worktree', 'list', '--porcelain'])
    expect(after).not.toContain(wt.path)
  }, 60_000)
})
