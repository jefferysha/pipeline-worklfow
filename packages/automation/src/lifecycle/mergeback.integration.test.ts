import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nodeExec } from '../runner/exec.js'
import { realWorktreePort } from './worktree.js'
import { SyncError, collectCommitsReal, mergeBackToBase, realGitFace } from './mergeback.js'

const execFileAsync = promisify(execFile)

/**
 * 真 merge-back 集成（诚实门：本机 git 可用真跑 merge；无 git → honest skip）。
 * 覆盖：① 干净交付 → 命名分支 merge 回 base、base 真前进；② 真冲突 → git merge --abort +
 * 抛 SyncError（_tag）+ **worktree 现场保留**（不清）+ base 回到干净（无残留 merge 标记）。
 */
const git = (cwd: string, args: string[]) =>
  execFileAsync('git', args, { cwd, env: { ...process.env, LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null' } })

const setupRepo = async (root: string) => {
  await git(root, ['init', '-q', '-b', 'main'])
  await git(root, ['config', 'user.email', 'afk@test'])
  await git(root, ['config', 'user.name', 'afk'])
  await writeFile(join(root, 'f.txt'), 'base\n')
  await git(root, ['add', '.'])
  await git(root, ['commit', '-q', '-m', 'c1'])
}

let hasGit = false

describe('merge-back 真 git 集成', () => {
  let root: string

  beforeAll(async () => {
    try {
      await execFileAsync('git', ['--version'])
      hasGit = true
    } catch {
      console.warn('[HONEST SKIP] git 不可用 → merge-back 真 git 集成跳过（绝不伪绿）')
    }
  })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'afk-mb-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('干净交付：命名分支真 merge 回 base，base 真前进，collectCommits 收命名分支 commit', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    // 在 worktree（命名分支）上真造一个新 commit（沙箱 build 的等价）
    await writeFile(join(wt.path, 'g.txt'), 'built\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'build commit'])
    const landed = (await git(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()

    const commits = await collectCommitsReal(nodeExec, { hostRepoDir: root, branch: 'sandcastle-pipeline/x', base: 'main' })
    expect(commits.map((c) => c.sha)).toContain(landed)

    // barrier 派生走真 git face（命名分支 HEAD == landed）
    const face = realGitFace(nodeExec, root)
    expect(await face.revParse('refs/heads/sandcastle-pipeline/x')).toBe(landed)

    await mergeBackToBase(nodeExec, { hostRepoDir: root, worktreePath: wt.path, branch: 'sandcastle-pipeline/x', base: 'main' })
    // base 真的含 build commit 的文件
    const mainHead = (await git(root, ['rev-parse', 'main'])).stdout.trim()
    const { stdout: filesAtMain } = await git(root, ['ls-tree', '--name-only', mainHead])
    expect(filesAtMain).toContain('g.txt')
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('真冲突：base 与命名分支分歧改同文件 → SyncError（_tag）+ worktree 现场保留 + base 干净', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    // 命名分支：改 f.txt
    await writeFile(join(wt.path, 'f.txt'), 'sandbox-version\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'sandbox edit'])
    // base(main)：对同一行分歧改动 → 保证 merge 冲突
    await writeFile(join(root, 'f.txt'), 'host-version\n')
    await git(root, ['add', '.'])
    await git(root, ['commit', '-q', '-m', 'host edit'])
    const baseBefore = (await git(root, ['rev-parse', 'main'])).stdout.trim()

    let thrown: unknown
    try {
      await mergeBackToBase(nodeExec, { hostRepoDir: root, worktreePath: wt.path, branch: 'sandcastle-pipeline/x', base: 'main' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(SyncError)
    expect((thrown as SyncError)._tag).toBe('SyncError')
    // 现场保留：worktree 目录仍在（供人工接管）
    expect((thrown as SyncError).preservedWorktreePath).toBe(wt.path)
    expect((await stat(wt.path)).isDirectory()).toBe(true)
    // base 回到冲突前（git merge --abort 真跑，无半应用标记）
    const baseAfter = (await git(root, ['rev-parse', 'main'])).stdout.trim()
    expect(baseAfter).toBe(baseBefore)
    const { stdout: status } = await git(root, ['status', '--porcelain'])
    expect(status.trim()).toBe('') // 无残留冲突标记，工作树干净
    // 命名分支仍在（explicit 模式绝不删）
    const { stdout: branches } = await git(root, ['branch', '--list', 'sandcastle-pipeline/x'])
    expect(branches).toContain('sandcastle-pipeline/x')
    await port.remove(wt.path).catch(() => {})
  }, 60_000)
})
