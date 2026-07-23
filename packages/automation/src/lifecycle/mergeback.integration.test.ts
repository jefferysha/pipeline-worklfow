import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { ExecFn } from '../runner/exec.js'
import { nodeExec } from '../runner/exec.js'
import { matchDenylist } from './denylist.js'
import { realWorktreePort } from './worktree.js'
import { SyncError, collectCommitsReal, diffNamesReal, mergeBackToBase, realGitFace } from './mergeback.js'

const execFileAsync = promisify(execFile)

/**
 * 真 merge-back 集成（诚实门：本机 git 可用真跑；无 git → honest skip）。
 * G²（loop 线 Stage B）纯算口径覆盖：
 *   ① 干净交付 + 工作树同步（阻断1，第五轮返工）：命名分支经 `git merge-tree` 纯算 merge 回 base、base ref
 *      真前进到两 parent merge commit，且 **CAS 成功后 `read-tree -m -u` 把 host 主工作树同步到 merge**——
 *      HEAD 随 base ref 到 merge commit、产物落 host 主工作树、`git status` 干净（不再只推 ref 留主树显 staged
 *      deletion）、无 MERGE_HEAD；未改动文件（f.txt）原样保留。
 *   ①-dirty（阻断1 dirty 分支）：merge 改动的路径在 host 主工作树有本地未提交改动 → CAS 成功但 read-tree 两
 *      tree 合并原子中止 → landed/hostSynced=false receipt（含 durable hostSyncError）+ 用户改动**绝不被覆盖**（base ref 已推进、
 *      工作树同步交人工）。
 *   ② 关键交错（阻断1/2/3 修）：**进入 mergeBackToBase、merge 已开始之后**（merge-tree↔update-ref 间）第三方
 *      推进 base → `git update-ref` expected-old CAS 被 git 原生拒绝 → SyncError{baseAdvanced} + **base 停外部值
 *      B（绝不覆盖回 A）** + 产物不漏 + 现场保留 + host 无 MERGE_HEAD（CAS 失败 read-tree 走不到、工作树零变更）。
 *   ③ 内容冲突：merge-tree 报冲突 → SyncError（**无 baseAdvanced**）+ 现场保留 + base/工作树/index 全干净（没碰 host）。
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

/** MERGE_HEAD 探测（残留 = 半合并脏 host）。 */
const mergeHeadState = async (root: string): Promise<'present' | 'absent'> => {
  try {
    await git(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])
    return 'present'
  } catch {
    return 'absent'
  }
}

let hasGit = false

describe('merge-back 真 git 集成（merge-tree 纯算）', () => {
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

  it('transaction marker 回收：上轮崩溃残留的本 namespace ref 在下一轮锁内清掉，邻接 namespace ref 原样保留', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    await writeFile(join(wt.path, 'g.txt'), 'built after stale marker\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'build after stale marker'])
    const frozen = (await git(root, ['rev-parse', 'main'])).stdout.trim()
    const staleMarker = 'refs/pipeline/mergeback-transactions/11111111111111111111111111111111'
    const neighboringRef = 'refs/pipeline/mergeback-transactions-audit/keep'
    await git(root, ['update-ref', staleMarker, frozen])
    await git(root, ['update-ref', neighboringRef, frozen])

    await mergeBackToBase(nodeExec, {
      hostRepoDir: root,
      worktreePath: wt.path,
      branch: 'sandcastle-pipeline/x',
      base: 'main',
      expectedBaseSha: frozen,
    })

    const markers = await git(root, [
      'for-each-ref',
      '--format=%(refname)',
      'refs/pipeline/mergeback-transactions/',
    ])
    expect(markers.stdout.trim()).toBe('')
    expect((await git(root, ['rev-parse', neighboringRef])).stdout.trim()).toBe(frozen)
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('marker 清理持续失败：已提交 transaction 仍如实返回 landed；下一轮在创建 marker 前 fail-closed，残留数量不增长', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    await writeFile(join(wt.path, 'g.txt'), 'first landed build\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'first landed build'])
    const frozen = (await git(root, ['rev-parse', 'main'])).stdout.trim()
    let markerCreates = 0
    const cleanupFailingExec: ExecFn = async (file, args, opts) => {
      const input = opts?.input ?? ''
      if (file === 'git' && args[0] === 'update-ref' && args.includes('--stdin') && input.includes('create refs/pipeline/mergeback-transactions/')) {
        markerCreates += 1
      }
      if (
        file === 'git' && args[0] === 'update-ref' &&
        ((args[1] === '-d' && String(args[2]).startsWith('refs/pipeline/mergeback-transactions/')) ||
          (args.includes('--stdin') && input.includes('delete refs/pipeline/mergeback-transactions/')))
      ) {
        return { stdout: '', stderr: 'simulated marker cleanup failure', exitCode: 1 }
      }
      return nodeExec(file, args, opts)
    }

    const first = await mergeBackToBase(cleanupFailingExec, {
      hostRepoDir: root,
      worktreePath: wt.path,
      branch: 'sandcastle-pipeline/x',
      base: 'main',
      expectedBaseSha: frozen,
    })
    expect(first).toMatchObject({ landed: true, hostSynced: true })
    expect((await git(root, ['rev-parse', 'main'])).stdout.trim()).toBe(first.mergedCommit)
    const markersAfterLanded = await git(root, [
      'for-each-ref', '--format=%(refname)', 'refs/pipeline/mergeback-transactions/',
    ])
    expect(markersAfterLanded.stdout.trim().split('\n')).toHaveLength(1)

    await writeFile(join(wt.path, 'second.txt'), 'must not land while cleanup is broken\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'second build waits for cleanup recovery'])
    let secondIntents = 0
    await expect(mergeBackToBase(cleanupFailingExec, {
      hostRepoDir: root,
      worktreePath: wt.path,
      branch: 'sandcastle-pipeline/x',
      base: 'main',
      expectedBaseSha: first.mergedCommit,
      onIntent: async () => { secondIntents += 1 },
    })).rejects.toMatchObject({ _tag: 'SyncError', baseAdvanced: false })

    expect((await git(root, ['rev-parse', 'main'])).stdout.trim()).toBe(first.mergedCommit)
    const markersAfterBlockedRound = await git(root, [
      'for-each-ref', '--format=%(refname)', 'refs/pipeline/mergeback-transactions/',
    ])
    expect(markersAfterBlockedRound.stdout.trim().split('\n')).toHaveLength(1)
    expect(markerCreates).toBe(1)
    expect(secondIntents).toBe(0)
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('① 干净交付（纯算）+ 工作树同步（阻断1）：base 前进到两 parent merge commit；CAS 成功后 read-tree 把产物同步进 host 主工作树、HEAD 随之到 merge、status 干净、无 MERGE_HEAD；未改动文件保留', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    // 在 worktree（命名分支）上真造一个新 commit（沙箱 build 的等价）
    await writeFile(join(wt.path, 'g.txt'), 'built\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'build commit'])
    const landed = (await git(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()
    const frozen = (await git(root, ['rev-parse', 'main'])).stdout.trim()

    const commits = await collectCommitsReal(nodeExec, { hostRepoDir: root, branch: 'sandcastle-pipeline/x', base: 'main' })
    expect(commits.map((c) => c.sha)).toContain(landed)
    const face = realGitFace(nodeExec, root)
    expect(await face.revParse('refs/heads/sandcastle-pipeline/x')).toBe(landed)

    // ── 同步前：快照 host HEAD symbolic-ref（read-tree 更新 index/工作树、**不 repoint HEAD**）+ f.txt（未改动文件）──
    const headSymBefore = (await git(root, ['symbolic-ref', 'HEAD'])).stdout.trim()
    const fTxtBefore = await readFile(join(root, 'f.txt'), 'utf8')

    await mergeBackToBase(nodeExec, { hostRepoDir: root, worktreePath: wt.path, branch: 'sandcastle-pipeline/x', base: 'main', expectedBaseSha: frozen })

    // base ref 真前进到带两 parent（base commit + 命名分支 tip）的 merge commit（commit-tree 造，非 fast-forward）
    const mainHead = (await git(root, ['rev-parse', 'main'])).stdout.trim()
    expect(mainHead).not.toBe(frozen) // base ref 真推进
    const { stdout: filesAtMain } = await git(root, ['ls-tree', '--name-only', mainHead])
    expect(filesAtMain).toContain('g.txt') // base 真含 build commit 的文件
    const parents = (await git(root, ['rev-list', '--parents', '-n', '1', mainHead])).stdout.trim().split(/\s+/)
    expect(parents).toHaveLength(3) // <merge> <parent1=base> <parent2=命名分支 tip>
    expect(parents).toContain(frozen) // 第一 parent = 冻结 base
    expect(parents).toContain(landed) // 第二 parent = 命名分支 build commit

    // ── 阻断1：CAS 成功后 read-tree -m -u 已把 host 主工作树同步到 merge commit ──
    // HEAD 仍指 refs/heads/main（read-tree 更新 index/工作树，不 repoint HEAD——base ref 由 update-ref 推进后 HEAD 自然跟到 merge）
    expect((await git(root, ['symbolic-ref', 'HEAD'])).stdout.trim()).toBe(headSymBefore)
    expect((await git(root, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(mainHead) // HEAD→main→merge commit
    // 产物 g.txt **真落进 host 主工作树**（此前只推 ref 不同步、主树看不到；现在用户 host `git status` 就能看到产物）
    expect(await readFile(join(root, 'g.txt'), 'utf8')).toBe('built\n')
    // host 主工作树相对新 HEAD **干净**：tracked 树无 staged/working-tree deletion、index==HEAD、工作树==HEAD。
    // （--untracked-files=no 排除测试脚手架落在 root/.sandcastle/worktrees/x 的**未跟踪链接 worktree** 噪声——
    // 那是 realWorktreePort 建的沙箱 worktree、非产物同步的关切；tracked 干净由下面两条 diff 精确钉死。）
    expect((await git(root, ['status', '--porcelain', '--untracked-files=no'])).stdout.trim()).toBe('')
    expect((await git(root, ['diff', '--cached', 'HEAD'])).stdout.trim()).toBe('') // index 与 HEAD 一致（无 staged 差异，含无 staged deletion）
    expect((await git(root, ['diff', 'HEAD'])).stdout.trim()).toBe('') // 工作树与 HEAD 一致（产物真同步进树）
    expect(await readFile(join(root, 'f.txt'), 'utf8')).toBe(fTxtBefore) // 未改动文件 f.txt 原样保留
    expect(await mergeHeadState(root)).toBe('absent') // read-tree -m -u 不产生 MERGE_HEAD
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('①-dirty（阻断1）：merge 改动的路径在 host 主工作树有本地未提交改动 → CAS 成功、receipt 标记 hostSyncPending，用户改动绝不被覆盖', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    // 命名分支：改 f.txt（build 改了 host 主树也在改的同一文件——制造「同步会覆盖用户改动」的重叠）
    await writeFile(join(wt.path, 'f.txt'), 'sandbox-built\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'build edits f.txt'])
    const frozen = (await git(root, ['rev-parse', 'main'])).stdout.trim()

    // host 主工作树：对 f.txt 有本地未提交改动（用户正在改，尚未 commit）——merge 恰改同一文件 → 同步会撞它
    await writeFile(join(root, 'f.txt'), 'user-local-edit\n')

    const receipt = await mergeBackToBase(nodeExec, { hostRepoDir: root, worktreePath: wt.path, branch: 'sandcastle-pipeline/x', base: 'main', expectedBaseSha: frozen })
    expect(receipt).toMatchObject({ landed: true, hostSynced: false })
    expect(receipt.hostSyncError).toContain('Cannot merge')
    // 用户本地未提交改动**绝不被覆盖**（read-tree 两 tree 合并撞本地改动即原子中止、工作树零变更）
    expect(await readFile(join(root, 'f.txt'), 'utf8')).toBe('user-local-edit\n')
    // base ref 已原子推进（merge 已落地 base；产物在 ref、工作树同步交人工）——CAS 成功后才判 dirty
    const mainAfter = (await git(root, ['rev-parse', 'main'])).stdout.trim()
    expect(mainAfter).not.toBe(frozen)
    expect((await git(root, ['show', `${mainAfter}:f.txt`])).stdout).toBe('sandbox-built\n') // base ref 树含 merge 结果
    expect(await mergeHeadState(root)).toBe('absent') // read-tree 中止不留 MERGE_HEAD
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('② 关键交错（阻断1/2/3）：merge 已开始之后（merge-tree↔update-ref 间）第三方推进 base → update-ref CAS 拒绝 → SyncError{baseAdvanced} + base 停外部值 B（绝不覆盖回 A）+ 产物不漏 + 现场保留 + 无 MERGE_HEAD', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    await writeFile(join(wt.path, 'g.txt'), 'built\n')
    await git(wt.path, ['add', '.'])
    await git(wt.path, ['commit', '-q', '-m', 'build commit'])
    // 冻结「当时 base SHA」（barrier/collect 时刻读到的 base = A）
    const frozen = (await git(root, ['rev-parse', 'main'])).stdout.trim()

    // 注入 ExecFn：在 mergeBackToBase 即将跑 `git update-ref` CAS **之前**（merge-tree 已纯算完 tree、commit-tree
    // 已造好 merge commit——「merge 已开始之后」）由第三方推进 base（human commit 改 h.txt，与命名分支不同文件 →
    // 不影响已算好的 merge，只让 base ref 从 A 移到 B）。这正是原「rev-parse 预检 + git merge」非原子关不掉的确定性竞态。
    let injected = false
    const injectingExec: ExecFn = async (file, args, opts) => {
      if (file === 'git' && args[0] === 'update-ref' && !injected) {
        injected = true
        await writeFile(join(root, 'h.txt'), 'host advanced\n')
        await git(root, ['add', 'h.txt'])
        await git(root, ['commit', '-q', '-m', 'external host commit (between merge-tree and update-ref)'])
      }
      return nodeExec(file, args, opts)
    }

    let thrown: unknown
    try {
      await mergeBackToBase(injectingExec, { hostRepoDir: root, worktreePath: wt.path, branch: 'sandcastle-pipeline/x', base: 'main', expectedBaseSha: frozen })
    } catch (e) { thrown = e }

    expect(injected).toBe(true) // 确认第三方推进真发生在 update-ref 之前（merge 已开始之后）
    expect(thrown).toBeInstanceOf(SyncError)
    expect((thrown as SyncError).baseAdvanced).toBe(true) // 阻断1：update-ref CAS 失败 → base-advanced fail-loud（非无 baseAdvanced 的普通 SyncError）
    // 阻断2：base 停在外部推进后的 commit（B）——绝没被覆盖回 frozen(A)、也不是本 run 的 merge 产物
    const baseAfter = (await git(root, ['rev-parse', 'main'])).stdout.trim()
    expect(baseAfter).not.toBe(frozen) // 不是 A（外部推进没被抹掉）
    const { stdout: filesAtBase } = await git(root, ['ls-tree', '--name-only', baseAfter])
    expect(filesAtBase).toContain('h.txt') // 是外部推进的 B
    expect(filesAtBase).not.toContain('g.txt') // 命名分支产物没漏进未验证 base
    // 阻断3：现场保留 + host 主树干净（无 MERGE_HEAD、无脏 index）——纯算没碰 host、无 abort/reset 可留脏；
    // 外部推进那条 commit 已干净落地（h.txt committed），我们的失败 CAS 没留任何半合并残留。
    expect((await stat(wt.path)).isDirectory()).toBe(true)
    const { stdout: branches } = await git(root, ['branch', '--list', 'sandcastle-pipeline/x'])
    expect(branches).toContain('sandcastle-pipeline/x')
    expect(await mergeHeadState(root)).toBe('absent')
    const { stdout: status } = await git(root, ['status', '--porcelain', '--untracked-files=no'])
    expect(status.trim()).toBe('') // tracked 工作树干净：无残留冲突标记 / 半合并 index
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('H7 r7：旧 Git fallback 在读取 branch tip 后、最终 ref CAS 前命名分支被推进 → 双 ref 事务原子拒绝，base 不落地未核验结果', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    await writeFile(join(wt.path, 'g.txt'), 'verified build\n')
    await git(wt.path, ['add', 'g.txt'])
    await git(wt.path, ['commit', '-q', '-m', 'verified build commit'])
    const verifiedBranchTip = (await git(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()
    const frozenBase = (await git(root, ['rev-parse', 'main'])).stdout.trim()

    // 只伪造版本探测以强制走旧 Git fallback；merge/write-tree/commit-tree/update-ref 全部仍由真 Git 执行。
    // 注入点严格在最终 update-ref 之前：此时 mergeBackToBase 已读取并核验 verifiedBranchTip，
    // fallback 也已完成 merge + commit-tree。随后在 linked worktree 真提交，把命名分支推进到未核验 SHA。
    let injected = false
    let advancedBranchTip = ''
    const oldGitInjectingExec: ExecFn = async (file, args, opts) => {
      if (file === 'git' && args[0] === '--version') {
        return { stdout: 'git version 2.37.9\n', stderr: '', exitCode: 0 }
      }
      if (file === 'git' && args[0] === 'update-ref' && !injected) {
        injected = true
        await writeFile(join(wt.path, 'late.txt'), 'unverified branch advance\n')
        await git(wt.path, ['add', 'late.txt'])
        await git(wt.path, ['commit', '-q', '-m', 'advance branch after verification'])
        advancedBranchTip = (await git(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()
      }
      return nodeExec(file, args, opts)
    }

    let thrown: unknown
    try {
      await mergeBackToBase(oldGitInjectingExec, {
        hostRepoDir: root,
        worktreePath: wt.path,
        branch: 'sandcastle-pipeline/x',
        base: 'main',
        expectedBaseSha: frozenBase,
        expectedBranchSha: verifiedBranchTip,
      })
    } catch (error) {
      thrown = error
    }

    expect(injected).toBe(true)
    expect(advancedBranchTip).not.toBe(verifiedBranchTip)
    expect(thrown).toBeInstanceOf(SyncError)
    expect((thrown as SyncError).baseAdvanced).toBe(true)
    expect((await git(root, ['rev-parse', 'main'])).stdout.trim()).toBe(frozenBase)
    expect((await git(root, ['rev-parse', 'refs/heads/sandcastle-pipeline/x'])).stdout.trim()).toBe(advancedBranchTip)
    expect((await git(root, ['ls-tree', '--name-only', 'main'])).stdout).not.toContain('g.txt')
    expect(await mergeHeadState(root)).toBe('absent')
    expect((await git(root, ['status', '--porcelain', '--untracked-files=no'])).stdout.trim()).toBe('')
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('H7 r8：旧 Git fallback 的 ref transaction 已真 commit，但执行器在回传成功码前中断 → 以 base ref 真实后置事实确认 landed，不误报失败', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    await writeFile(join(wt.path, 'g.txt'), 'transaction really landed\n')
    await git(wt.path, ['add', 'g.txt'])
    await git(wt.path, ['commit', '-q', '-m', 'verified fallback build'])
    const verifiedBranchTip = (await git(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()
    const frozenBase = (await git(root, ['rev-parse', 'main'])).stdout.trim()

    let transactionReallyCommitted = false
    const interruptedAfterCommitExec: ExecFn = async (file, args, opts) => {
      if (file === 'git' && args[0] === '--version') {
        return { stdout: 'git version 2.37.9\n', stderr: '', exitCode: 0 }
      }
      if (file === 'git' && args[0] === 'update-ref') {
        const real = await nodeExec(file, args, opts)
        transactionReallyCommitted = real.exitCode === 0
        if (transactionReallyCommitted) {
          return {
            stdout: real.stdout,
            stderr: 'simulated executor interruption after transaction commit',
            exitCode: 143,
          }
        }
        return real
      }
      return nodeExec(file, args, opts)
    }

    const landed: Array<{ landed: true; mergedCommit: string }> = []
    const receipt = await mergeBackToBase(interruptedAfterCommitExec, {
      hostRepoDir: root,
      worktreePath: wt.path,
      branch: 'sandcastle-pipeline/x',
      base: 'main',
      expectedBaseSha: frozenBase,
      expectedBranchSha: verifiedBranchTip,
      onLanded: async (value) => { landed.push(value) },
    })

    expect(transactionReallyCommitted).toBe(true)
    expect(receipt).toMatchObject({ landed: true, hostSynced: true, branchTip: verifiedBranchTip })
    expect(landed.length).toBeGreaterThan(0)
    const baseAfter = (await git(root, ['rev-parse', 'main'])).stdout.trim()
    expect(baseAfter).toBe(receipt.mergedCommit)
    expect(baseAfter).not.toBe(frozenBase)
    expect(await readFile(join(root, 'g.txt'), 'utf8')).toBe('transaction really landed\n')
    expect(await mergeHeadState(root)).toBe('absent')
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('H7 r9：外部从 intent 得到 mergedCommit，自行推 base 到该 SHA 并推进 branch，本 transaction 真失败 → 不得仅凭 base==mergedCommit 误报 landed', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await setupRepo(root)
    const port = realWorktreePort(nodeExec)
    const wt = await port.create(root, 'sandcastle-pipeline/x')
    await writeFile(join(wt.path, 'g.txt'), 'verified build\n')
    await git(wt.path, ['add', 'g.txt'])
    await git(wt.path, ['commit', '-q', '-m', 'verified build before spoof'])
    const verifiedBranchTip = (await git(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()
    const frozenBase = (await git(root, ['rev-parse', 'main'])).stdout.trim()

    let exposedMergedCommit = ''
    let transactionReallyFailed = false
    let injected = false
    const spoofingExec: ExecFn = async (file, args, opts) => {
      if (file === 'git' && args[0] === '--version') {
        return { stdout: 'git version 2.37.9\n', stderr: '', exitCode: 0 }
      }
      if (file === 'git' && args[0] === 'update-ref' && args.includes('--stdin') && !injected) {
        injected = true
        // onIntent 已暴露本轮 commit OID：外部先把 branch 推到未核验 commit，再绕过本事务直接把
        // base 设为已暴露的 mergedCommit。随后真执行本 transaction，branch verify/base expected-old 都必须失败。
        await writeFile(join(wt.path, 'late.txt'), 'unverified late commit\n')
        await git(wt.path, ['add', 'late.txt'])
        await git(wt.path, ['commit', '-q', '-m', 'advance branch before spoofed transaction'])
        await git(root, ['update-ref', 'refs/heads/main', exposedMergedCommit, frozenBase])
        const real = await nodeExec(file, args, opts)
        transactionReallyFailed = real.exitCode !== 0
        return real
      }
      return nodeExec(file, args, opts)
    }

    let thrown: unknown
    try {
      await mergeBackToBase(spoofingExec, {
        hostRepoDir: root,
        worktreePath: wt.path,
        branch: 'sandcastle-pipeline/x',
        base: 'main',
        expectedBaseSha: frozenBase,
        expectedBranchSha: verifiedBranchTip,
        onIntent: async (draft) => { exposedMergedCommit = draft.mergedCommit },
      })
    } catch (error) {
      thrown = error
    }

    expect(injected).toBe(true)
    expect(exposedMergedCommit).not.toBe('')
    expect(transactionReallyFailed).toBe(true)
    expect(thrown).toBeInstanceOf(SyncError)
    expect((thrown as SyncError).baseAdvanced).toBe(true)
    // 物理 base 是外部操作所为；本事务未 commit，API 必须 fail-loud，不能冒充自己的 landed 事实。
    expect((await git(root, ['rev-parse', 'main'])).stdout.trim()).toBe(exposedMergedCommit)
    expect(await mergeHeadState(root)).toBe('absent')
    await port.remove(wt.path).catch(() => {})
  }, 60_000)

  it('③ 内容冲突（纯算）：base 与命名分支分歧改同文件 → merge-tree 报冲突 → SyncError（无 baseAdvanced）+ 现场保留 + base/工作树/index 全干净（没碰 host）', async (ctx) => {
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
    const indexTreeBefore = (await git(root, ['write-tree'])).stdout.trim()

    let thrown: unknown
    try {
      await mergeBackToBase(nodeExec, { hostRepoDir: root, worktreePath: wt.path, branch: 'sandcastle-pipeline/x', base: 'main', expectedBaseSha: baseBefore })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(SyncError)
    expect((thrown as SyncError)._tag).toBe('SyncError')
    expect((thrown as SyncError).baseAdvanced).toBe(false) // content-conflict：round 仍 ok（区别于 base-advanced）
    // 现场保留：worktree 目录仍在（供人工接管）
    expect((thrown as SyncError).preservedWorktreePath).toBe(wt.path)
    expect((await stat(wt.path)).isDirectory()).toBe(true)
    // base 一动不动（纯算冲突没碰 host、没造任何 commit）
    expect((await git(root, ['rev-parse', 'main'])).stdout.trim()).toBe(baseBefore)
    expect((await git(root, ['write-tree'])).stdout.trim()).toBe(indexTreeBefore) // index 零变化
    const { stdout: status } = await git(root, ['status', '--porcelain'])
    expect(status.trim()).toBe('') // 纯算冲突：工作树全干净，无残留冲突标记（无需 abort）
    expect(await mergeHeadState(root)).toBe('absent')
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

  // B3：mergeBackToBase 保留「host 主树 == base」守卫。host 主树被切到别的分支时 fail-loud（不静默合错）。
  // 纯算路径 explicit 打 refs/heads/<base> 不靠 HEAD 定目标，此守卫核对 host 处于预期状态。
  it('B3 · host 主树被切到别的分支 → mergeBackToBase fail-loud（SyncError，无 baseAdvanced），产物没漏进错分支', async (ctx) => {
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
    expect((thrown as SyncError).baseAdvanced).toBe(false) // B3 不是 base-advanced
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
