import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nodeExec } from '../runner/exec.js'
import { matchDenylist } from './denylist.js'
import { realWorktreePort } from './worktree.js'
import { SyncError, collectCommitsReal, diffNamesReal, mergeBackToBase, realGitFace } from './mergeback.js'

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

  // B6：git diff --name-only 默认 core.quotePath=true，非 ASCII 路径输出成 "\346..." 八进制转义串，
  // denylist glob 匹配不到 → 中文/emoji 文件名越界产出逃检（L3 自动 merge）。diffNamesReal 加
  // -c core.quotePath=false → 输出 literal UTF-8 路径，denylist 真命中。
  it('B6 · 非 ASCII 路径（中文 + emoji）经 diffNamesReal 输出 literal UTF-8 → denylist glob 真命中', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    await mkdir(join(wt.path, 'docs'), { recursive: true })
    await writeFile(join(wt.path, 'docs', '文档.md'), 'x\n')
    await writeFile(join(wt.path, '🚀.txt'), 'y\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'add non-ascii files'])

    const files = await diffNamesReal(nodeExec, { hostRepoDir: root, branch: 'sandcastle-pipeline/x', base: 'main' })
    // literal UTF-8 路径（不是 "\346\226..." 转义双引号串）
    expect(files).toContain('docs/文档.md')
    expect(files).toContain('🚀.txt')
    expect(files.every((f) => !f.startsWith('"'))).toBe(true) // 无一条被 quotePath 转义成双引号包裹串
    // 决议 #12 denylist 结算检查真命中（escape 后正是逃过这条检查）
    expect(matchDenylist(files, ['docs/**']).map((v) => v.file)).toContain('docs/文档.md')
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  // B3：mergeBackToBase 收 base 但真 merge 合进当前 HEAD，从不 checkout/校验 base。host 主树被切到
  // 别的分支时会静默 merge 进错分支。修：merge 前 assert host HEAD == base，不等则 fail-loud（SyncError）。
  it('B3 · host 主树被切到别的分支 → mergeBackToBase fail-loud（不静默把命名分支合进错分支）', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    await writeFile(join(wt.path, 'g.txt'), 'built\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'build commit'])

    // host 主树切到别的分支（模拟主树被别的工作切走）——base 仍传 main
    await git(root, ['checkout', '-q', '-b', 'other'])
    const otherBefore = (await git(root, ['rev-parse', 'other'])).stdout.trim()

    let thrown: unknown
    try {
      await mergeBackToBase(nodeExec, { hostRepoDir: root, worktreePath: wt.path, branch: 'sandcastle-pipeline/x', base: 'main' })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(SyncError) // fail-loud，不静默合错
    // other 一动不动（命名分支绝没被合进当前 HEAD）
    const otherAfter = (await git(root, ['rev-parse', 'other'])).stdout.trim()
    expect(otherAfter).toBe(otherBefore)
    const { stdout: filesAtOther } = await git(root, ['ls-tree', '--name-only', otherAfter])
    expect(filesAtOther).not.toContain('g.txt') // build 产物没漏进错分支
    // worktree 现场保留供人工核对
    expect((await stat(wt.path)).isDirectory()).toBe(true)
    await port.remove(wt.path).catch(() => {})
  }, 60_000)
})
