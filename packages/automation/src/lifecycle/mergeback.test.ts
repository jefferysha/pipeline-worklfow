import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExecFn } from '../runner/exec.js'
import type { MergeBackReceipt } from './mergeback.js'
import { SyncError, diffNamesReal, mergeBackToBase, mergeTreeSupported, parseMergeResult } from './mergeback.js'

/**
 * fallback（git < 2.38）路径的冲突判定（`git merge --no-ff --no-commit`）：exit 0 = 干净；非零 = 冲突。
 * 纯判定单测（不需 git）。纯算主路径（merge-tree）走 mergeback.integration.test.ts。
 */
describe('parseMergeResult（fallback 冲突判定）', () => {
  it('exit 0 → 无冲突（干净交付）', () => {
    expect(parseMergeResult({ exitCode: 0, stdout: 'Fast-forward', stderr: '' })).toEqual({ conflict: false })
  })
  it('非零退出 → conflict（settled，绝不重试）', () => {
    expect(parseMergeResult({ exitCode: 1, stdout: 'CONFLICT (content)', stderr: '' }).conflict).toBe(true)
  })
})

describe('SyncError', () => {
  it('_tag=SyncError + 结构化 preservedWorktreePath（classify 归 conflict，留现场）；默认 baseAdvanced=false', () => {
    const e = new SyncError('merge failed', '/wt/sandcastle-pipeline-x')
    expect(e._tag).toBe('SyncError')
    expect(e.preservedWorktreePath).toBe('/wt/sandcastle-pipeline-x')
    expect(e.baseAdvanced).toBe(false) // 普通 content-conflict：round 仍 ok
  })
  it('baseAdvanced=true（update-ref CAS 失败）：与 lifecycle BaseAdvancedError 同款 fail-loud 信号', () => {
    const e = new SyncError('base advanced', '/wt/x', { baseAdvanced: true })
    expect(e._tag).toBe('SyncError') // classify 仍归 conflict + 留现场（classify 侧零改）
    expect(e.baseAdvanced).toBe(true) // scheduler 据此另记 round failure 使 ok=false
  })
})

/** git 版本探测：≥ 2.38 → merge-tree --write-tree 可用（纯算主路径）；否则 fallback。 */
describe('mergeTreeSupported（git 版本探测）', () => {
  const versionExec = (out: string, exit = 0): ExecFn => async () => ({ stdout: out, stderr: '', exitCode: exit })
  it('git 2.39.5 → ok（纯算路径）', async () => {
    expect((await mergeTreeSupported(versionExec('git version 2.39.5 (Apple Git-154)'), '/r')).ok).toBe(true)
  })
  it('git 2.38.0 → ok（纯算路径下限）', async () => {
    expect((await mergeTreeSupported(versionExec('git version 2.38.0'), '/r')).ok).toBe(true)
  })
  it('git 2.37.9 → 不 ok（走 fallback）', async () => {
    expect((await mergeTreeSupported(versionExec('git version 2.37.9'), '/r')).ok).toBe(false)
  })
  it('git 3.0.0 → ok', async () => {
    expect((await mergeTreeSupported(versionExec('git version 3.0.0'), '/r')).ok).toBe(true)
  })
  it('探测非零退出 / 无法解析 → 不 ok（保守走 fallback）', async () => {
    expect((await mergeTreeSupported(versionExec('', 127), '/r')).ok).toBe(false)
    expect((await mergeTreeSupported(versionExec('garbage'), '/r')).ok).toBe(false)
  })
})

/**
 * T4 决议 #12：denylist 结算检查的数据源——本次 run 触碰的文件清单。
 */
describe('diffNamesReal（git diff --name-only，决议 #12 数据源）', () => {
  const fakeExec = (result: { stdout: string; exitCode: number }): { exec: ExecFn; calls: { file: string; args: string[]; cwd?: string }[] } => {
    const calls: { file: string; args: string[]; cwd?: string }[] = []
    const exec: ExecFn = async (file, args, opts) => {
      calls.push({ file, args, cwd: opts?.cwd })
      return { stdout: result.stdout, stderr: '', exitCode: result.exitCode }
    }
    return { exec, calls }
  }

  it('argv：git -c core.quotePath=false diff --name-only <base>...refs/heads/<branch>，cwd=hostRepoDir', async () => {
    const { exec, calls } = fakeExec({ stdout: 'docs/a.md\nsrc/x.ts\n', exitCode: 0 })
    const files = await diffNamesReal(exec, { hostRepoDir: '/repo', branch: 'sandcastle-pipeline/x', base: 'main' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.file).toBe('git')
    expect(calls[0]!.args).toEqual(['-c', 'core.quotePath=false', 'diff', '--name-only', 'main...refs/heads/sandcastle-pipeline/x'])
    expect(calls[0]!.cwd).toBe('/repo')
    expect(files).toEqual(['docs/a.md', 'src/x.ts'])
  })

  it('空 diff → []', async () => {
    const { exec } = fakeExec({ stdout: '\n', exitCode: 0 })
    expect(await diffNamesReal(exec, { hostRepoDir: '/repo', branch: 'b', base: 'main' })).toEqual([])
  })

  it('git 非零退出 → []（容错口径同 collectCommitsReal，不把 git 故障误判成违规）', async () => {
    const { exec } = fakeExec({ stdout: '', exitCode: 128 })
    expect(await diffNamesReal(exec, { hostRepoDir: '/repo', branch: 'b', base: 'main' })).toEqual([])
  })
})

/**
 * G²（loop 线 Stage B）：mergeBackToBase 用 `git merge-tree --write-tree`（纯算 merge tree，**零 host 副作用**：
 * 不碰工作树/index/HEAD/MERGE_HEAD/任何 ref）+ `commit-tree`（两 parent merge commit）+ 单条 `git update-ref
 * <base> <merge> <baseTip>`（**expected-old-SHA 原子 CAS**）推进 base ref。base 被第三方在纯算窗口内推进 →
 * update-ref CAS 失败（git 拒绝）→ **base-advanced fail-loud**（SyncError{baseAdvanced:true}），无需任何清理
 * （没碰 host、天然干净）。用真临时 .git（merge 锁真 mkdir）+ fake exec 录 argv。真机端到端见 integration。
 */
describe('mergeBackToBase · G² merge-tree 纯算 + 原子 update-ref CAS（持 merge 锁内）', () => {
  let repo: string
  beforeEach(async () => { repo = await mkdtemp(join(tmpdir(), 'mb-')); await mkdir(join(repo, '.git'), { recursive: true }) })
  afterEach(async () => { await rm(repo, { recursive: true, force: true }) })

  /**
   * fake exec：symbolic-ref HEAD=refs/heads/main；rev-parse HEAD=HEAD_SHA / 命名分支=BRANCH_TIP / base=currentBase；
   * git --version 由 ctl.version 控（默认 2.39.5 → 纯算）；merge-tree/update-ref/merge(fallback)/reset 退出码由 ctl 控。
   */
  const makeExec = (ctl: {
    head?: string
    version?: string
    revParseHeadExit?: number
    revParseBranchExit?: number
    mergeTreeExit?: number
    mergeTreeOut?: string
    updateRefExit?: number
    updateRefErr?: string
    readTreeExit?: number
    readTreeErr?: string
    writeTreeExit?: number
    mergeExit?: number
    resetExit?: number
    currentBase?: string
    staleMarkerListing?: string
    staleCleanupExit?: number
    staleCleanupErr?: string
  } = {}): { exec: ExecFn; calls: string[][] } => {
    const calls: string[][] = []
    const ok = (stdout: string, exitCode = 0, stderr = ''): { stdout: string; stderr: string; exitCode: number } => ({ stdout, stderr, exitCode })
    const exec: ExecFn = async (file, args, opts) => {
      calls.push([file, ...args])
      if (opts?.input !== undefined) calls.push(['stdin', opts.input])
      if (args[0] === 'symbolic-ref') return ok(`${ctl.head ?? 'refs/heads/main'}\n`)
      if (args[0] === '--version') return ok(ctl.version ?? 'git version 2.39.5 (Apple Git-154)')
      if (args[0] === 'for-each-ref') return ok(ctl.staleMarkerListing ?? '')
      if (args[0] === 'rev-parse') {
        if (args[1] === '--git-common-dir') return ok('.git\n')
        if (args[1] === 'HEAD') return ok('HEAD_SHA\n', ctl.revParseHeadExit ?? 0)
        if (String(args[1]).includes('sandcastle')) return ok('BRANCH_TIP\n', ctl.revParseBranchExit ?? 0)
        return ok(`${ctl.currentBase ?? 'BASE_CUR'}\n`) // refs/heads/main（base）——fallback cleanup 读
      }
      if (args[0] === 'merge-tree') return ok(ctl.mergeTreeOut ?? 'TREE_MERGED\n', ctl.mergeTreeExit ?? 0)
      if (args[0] === 'commit-tree') return ok('MERGED\n')
      if (args[0] === 'update-ref' && opts?.input?.includes('delete refs/pipeline/mergeback-transactions/')) {
        return ok('', ctl.staleCleanupExit ?? 0, ctl.staleCleanupErr ?? '')
      }
      if (args[0] === 'update-ref') return ok('', ctl.updateRefExit ?? 0, ctl.updateRefErr ?? '')
      // 阻断1（纯算 CAS 成功后 host 主工作树同步）：read-tree -m -u <baseTip> <merged>。
      if (args[0] === 'read-tree') return ok('', ctl.readTreeExit ?? 0, ctl.readTreeErr ?? '')
      if (args[0] === 'write-tree') return ok('TREE\n', ctl.writeTreeExit ?? 0)
      if (args.includes('merge') && args.includes('--abort')) return ok('', 0) // 若被误调则录下（断言绝不调）
      if (args.includes('merge')) return ok('', ctl.mergeExit ?? 0) // fallback --no-ff --no-commit
      if (args[0] === 'reset') return ok('', ctl.resetExit ?? 0)
      return ok('')
    }
    return { exec, calls }
  }
  const isMergeTree = (c: string[]): boolean => c.includes('merge-tree')
  const isPlainMerge = (c: string[]): boolean => c.includes('merge') && !c.includes('merge-tree')
  const isAbort = (c: string[]): boolean => c.includes('merge') && c.includes('--abort')
  const isResetHard = (c: string[]): boolean => c.includes('reset') && c.includes('--hard')
  const isReadTreeSync = (c: string[]): boolean => c[1] === 'read-tree' && c.includes('-m') && c.includes('-u')
  const findUpdateRef = (calls: string[][]): string[] | undefined => calls.find((c) => c.includes('update-ref'))

  const input = (expectedBaseSha?: string) => ({ hostRepoDir: repo, worktreePath: '/wt/x', branch: 'sandcastle-pipeline/x', base: 'main', expectedBaseSha })

  it('锁内 stale marker 原子清理失败 → 新 merge fail-closed，绝不计算 merge、写 intent 或创建下一枚 marker', async () => {
    const staleRef = 'refs/pipeline/mergeback-transactions/22222222222222222222222222222222'
    const staleOid = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const { exec, calls } = makeExec({
      staleMarkerListing: `${staleRef} ${staleOid}\n`,
      staleCleanupExit: 1,
      staleCleanupErr: 'cannot lock stale marker ref',
    })
    let intents = 0

    await expect(mergeBackToBase(exec, {
      ...input('BASE_OLD'),
      onIntent: async () => { intents += 1 },
    })).rejects.toMatchObject({
      _tag: 'SyncError',
      baseAdvanced: false,
      preservedWorktreePath: '/wt/x',
    })

    const transactions = calls.filter((call) => call[0] === 'stdin').map((call) => call[1] ?? '')
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toContain(`delete ${staleRef} ${staleOid}`)
    expect(transactions[0]).not.toContain('create refs/pipeline/mergeback-transactions/')
    expect(calls.some(isMergeTree)).toBe(false)
    expect(calls.some((call) => call.includes('commit-tree'))).toBe(false)
    expect(intents).toBe(0)
  })

  it('命名分支在 verify 后推进：branch tip 与 expectedBranchSha 不符 → merge-tree/update-ref 均不执行', async () => {
    const { exec, calls } = makeExec({})
    await expect(mergeBackToBase(exec, { ...input('BASE_OLD'), expectedBranchSha: 'VERIFIED_TIP' }))
      .rejects.toThrow('advanced from verified revision')
    expect(calls.some(isMergeTree)).toBe(false)
    expect(findUpdateRef(calls)).toBeUndefined()
  })

  it('CAS 成功（纯算）→ 无 SyncError；merge-tree --write-tree <baseTip> <branchTip> → commit-tree(树,两parent) → update-ref <merge> <baseTip> →（阻断1）read-tree -m -u <baseTip> <merge> 同步工作树；绝不裸 git merge / 不 abort / 不 reset --hard 全树打回', async () => {
    const { exec, calls } = makeExec({ updateRefExit: 0 })
    await expect(mergeBackToBase(exec, input('BASE_OLD'))).resolves.toMatchObject({ landed: true, hostSynced: true, mergedCommit: 'MERGED' })
    // 纯算：merge-tree --write-tree baseTip branchTip（baseTip=冻结 BASE_OLD）
    expect(calls.find(isMergeTree)).toEqual(['git', 'merge-tree', '--write-tree', 'BASE_OLD', 'BRANCH_TIP'])
    // commit-tree 用 merge-tree 输出树 + 两 parent（baseTip + 命名分支 tip）
    expect(calls.find((c) => c.includes('commit-tree'))).toEqual(['git', 'commit-tree', 'TREE_MERGED', '-p', 'BASE_OLD', '-p', 'BRANCH_TIP', '-m', "Merge branch 'sandcastle-pipeline/x' into 'main'"])
    // 原子 CAS：expected-old = 冻结 baseTip
    expect(findUpdateRef(calls)).toEqual(['git', 'update-ref', '--stdin'])
    expect(calls.find((c) => c[0] === 'stdin')?.[1]).toContain('verify refs/heads/sandcastle-pipeline/x BRANCH_TIP')
    expect(calls.find((c) => c[0] === 'stdin')?.[1]).toContain('update refs/heads/main MERGED BASE_OLD')
    // 阻断1：CAS 成功后 read-tree -m -u <baseTip> <merged> 同步 host 主工作树（两 tree 合并，保留未改动路径本地改动）
    expect(calls.find(isReadTreeSync)).toEqual(['git', 'read-tree', '-m', '-u', 'BASE_OLD', 'MERGED'])
    // 顺序铁律：read-tree 同步严格在 update-ref CAS **之后**（先原子推进 ref、成功才碰工作树）
    expect(calls.findIndex(isReadTreeSync)).toBeGreaterThan(calls.findIndex((c) => c.includes('update-ref')))
    // 绝不走裸 git merge、不 abort、不 reset（--hard 全树打回会连带把 .pipeline.yaml automation 字段还原、令结算 CAS 落空）、不 fallback write-tree
    expect(calls.some(isPlainMerge)).toBe(false)
    expect(calls.some(isAbort)).toBe(false)
    expect(calls.some((c) => c[0] === 'reset')).toBe(false)
    expect(calls.some((c) => c[1] === 'write-tree')).toBe(false)
  })

  it('durable 顺序：commit-tree 后先 await intent，intent 成功才 update-ref，CAS 后再 await landed，最后 host sync', async () => {
    const { exec, calls } = makeExec({ updateRefExit: 0 })
    const journal: string[] = []
    const receipt = await mergeBackToBase(exec, {
      ...input('BASE_OLD'),
      onIntent: async (draft) => { journal.push(`intent:${draft.mergedCommit}`); calls.push(['hook', 'intent']) },
      onLanded: async (landed) => { journal.push(`landed:${landed.mergedCommit}`); calls.push(['hook', 'landed']) },
    })
    expect(journal).toEqual(['intent:MERGED', 'landed:MERGED', 'landed:MERGED'])
    const intentAt = calls.findIndex((call) => call[0] === 'hook' && call[1] === 'intent')
    const updateAt = calls.findIndex((call) => call.includes('update-ref'))
    const landedAt = calls.findIndex((call) => call[0] === 'hook' && call[1] === 'landed')
    const syncAt = calls.findIndex(isReadTreeSync)
    expect(intentAt).toBeGreaterThan(calls.findIndex((call) => call.includes('commit-tree')))
    expect(updateAt).toBeGreaterThan(intentAt)
    expect(landedAt).toBeGreaterThan(updateAt)
    expect(syncAt).toBeGreaterThan(landedAt)
    expect(receipt.landedJournalError).toBeUndefined()
  })

  it('intent fsync 失败 → update-ref 零调用、ref 零推进', async () => {
    const { exec, calls } = makeExec({ updateRefExit: 0 })
    await expect(mergeBackToBase(exec, {
      ...input('BASE_OLD'), onIntent: async () => { throw new Error('ledger fsync failed') },
    })).rejects.toMatchObject({ _tag: 'MergeJournalError', landed: false })
    expect(findUpdateRef(calls)).toBeUndefined()
  })

  it('CAS 已成功后 landed fsync 失败 → 仍 resolve landed receipt，携 landedJournalError 供 recovery，不抛 conflict', async () => {
    const { exec, calls } = makeExec({ updateRefExit: 0 })
    const receipt = await mergeBackToBase(exec, {
      ...input('BASE_OLD'), onLanded: async () => { throw new Error('ledger disk full') },
    })
    expect(findUpdateRef(calls)).toBeDefined()
    expect(receipt).toMatchObject({ landed: true, mergedCommit: 'MERGED', landedJournalError: expect.stringContaining('ledger disk full') })
  })

  it('阻断1 修：CAS 失败（base 在 merge 已开始之后被推进 → git 拒绝 update-ref）→ 抛 SyncError{baseAdvanced:true} 留现场；纯算无需清理（绝不 abort / 绝不 reset / 绝不 read-tree 碰工作树）', async () => {
    const { exec, calls } = makeExec({ updateRefExit: 1, updateRefErr: "cannot lock ref 'refs/heads/main': is at NEW but expected BASE_OLD" })
    await expect(mergeBackToBase(exec, input('BASE_OLD')))
      .rejects.toMatchObject({ _tag: 'SyncError', baseAdvanced: true, preservedWorktreePath: '/wt/x' })
    expect(findUpdateRef(calls)).toEqual(['git', 'update-ref', '--stdin']) // 真走了双 ref 原子 transaction
    // 纯算全程没碰 host → CAS 失败无需任何清理（既不 merge --abort、也不 reset）；且 read-tree 同步在 CAS 之后，
    // CAS 失败走不到 → **工作树零变更**（失败不碰 host 的不变量不因新增同步而破）。
    expect(calls.some(isAbort)).toBe(false)
    expect(calls.some((c) => c[0] === 'reset')).toBe(false)
    expect(calls.some((c) => c.includes('read-tree'))).toBe(false)
  })

  it('纯算主路：transaction 已 commit 但执行器回传非零，base 后置事实已精确指向 mergedCommit → 继续作 landed，不误报 conflict', async () => {
    const { exec, calls } = makeExec({
      updateRefExit: 143,
      updateRefErr: 'interrupted after commit',
      currentBase: 'MERGED',
    })
    await expect(mergeBackToBase(exec, input('BASE_OLD')))
      .resolves.toMatchObject({ landed: true, hostSynced: true, mergedCommit: 'MERGED' })
    expect(calls.find(isReadTreeSync)).toEqual(['git', 'read-tree', '-m', '-u', 'BASE_OLD', 'MERGED'])
  })

  it('阻断1 修：CAS 成功但 read-tree 同步失败 → 返回 landed + hostSynced=false，绝不把已合并事实重分类为 conflict', async () => {
    const { exec, calls } = makeExec({ updateRefExit: 0, readTreeExit: 128, readTreeErr: "error: Entry 'f.txt' would be overwritten by merge. Cannot merge." })
    const landed: MergeBackReceipt[] = []
    await expect(mergeBackToBase(exec, {
      ...input('BASE_OLD'),
      onLanded: async (receipt) => { landed.push(receipt) },
    })).resolves.toMatchObject({
      landed: true, hostSynced: false, mergedCommit: 'MERGED',
      hostSyncError: expect.stringContaining('would be overwritten'),
    })
    expect(landed).toHaveLength(2)
    expect(landed[1]).toMatchObject({
      landed: true,
      hostSynced: false,
      hostSyncError: expect.stringContaining('would be overwritten'),
    })
    expect(findUpdateRef(calls)).toEqual(['git', 'update-ref', '--stdin']) // CAS 已成功（ref 真推进）
    expect(calls.find(isReadTreeSync)).toEqual(['git', 'read-tree', '-m', '-u', 'BASE_OLD', 'MERGED']) // 真走了同步且失败
    expect(calls.some(isResetHard)).toBe(false) // 绝不 reset --hard 强推工作树覆盖用户改动
  })

  it('阻断2 修：rev-parse HEAD 非零退出 → SyncError fail-loud（不把非零命令的空/垃圾 stdout 当有效 OID 喂下一步）；绝不进 merge-tree', async () => {
    const { exec, calls } = makeExec({ revParseHeadExit: 128 })
    let thrown: unknown
    try { await mergeBackToBase(exec, input('BASE_OLD')) } catch (e) { thrown = e }
    expect((thrown as SyncError)._tag).toBe('SyncError')
    expect((thrown as SyncError).baseAdvanced).toBe(false)
    expect(calls.some(isMergeTree)).toBe(false) // rev-parse HEAD 失败即抛，绝不带垃圾 OID 进 merge
    expect(findUpdateRef(calls)).toBeUndefined()
  })

  it('阻断2 修：rev-parse refs/heads/<branch> 非零退出 → SyncError fail-loud；绝不进 merge-tree', async () => {
    const { exec, calls } = makeExec({ revParseBranchExit: 128 })
    let thrown: unknown
    try { await mergeBackToBase(exec, input('BASE_OLD')) } catch (e) { thrown = e }
    expect((thrown as SyncError)._tag).toBe('SyncError')
    expect((thrown as SyncError).baseAdvanced).toBe(false)
    expect(calls.some(isMergeTree)).toBe(false)
    expect(findUpdateRef(calls)).toBeUndefined()
  })

  it('内容冲突（merge-tree exit 1）→ SyncError（**无 baseAdvanced**，普通 conflict round 仍 ok）；绝不 commit-tree/update-ref、绝不碰 host', async () => {
    const { exec, calls } = makeExec({ mergeTreeExit: 1, mergeTreeOut: 'TREE_WITH_CONFLICTS\nHASH file\n' })
    let thrown: unknown
    try { await mergeBackToBase(exec, input('BASE_OLD')) } catch (e) { thrown = e }
    expect(thrown).toMatchObject({ _tag: 'SyncError', preservedWorktreePath: '/wt/x' })
    expect((thrown as SyncError).baseAdvanced).toBe(false) // content-conflict：不 fail-loud
    expect(calls.some((c) => c.includes('commit-tree'))).toBe(false) // 冲突绝不造 merge commit
    expect(findUpdateRef(calls)).toBeUndefined() // 绝不推进 base
    expect(calls.some(isAbort)).toBe(false) // 纯算冲突：没碰 host，无需 abort
    expect(calls.some((c) => c[0] === 'reset')).toBe(false)
  })

  it('merge-tree 其它错误（exit 128）→ SyncError（无 baseAdvanced），绝不 update-ref', async () => {
    const { exec, calls } = makeExec({ mergeTreeExit: 128 })
    let thrown: unknown
    try { await mergeBackToBase(exec, input('BASE_OLD')) } catch (e) { thrown = e }
    expect((thrown as SyncError)._tag).toBe('SyncError')
    expect((thrown as SyncError).baseAdvanced).toBe(false)
    expect(findUpdateRef(calls)).toBeUndefined()
  })

  it('B3：host 主树被切到别的分支 → fail-loud（SyncError，无 baseAdvanced），绝不进 merge-tree', async () => {
    const { exec, calls } = makeExec({ head: 'refs/heads/other' })
    let thrown: unknown
    try { await mergeBackToBase(exec, input('BASE_OLD')) } catch (e) { thrown = e }
    expect((thrown as SyncError)._tag).toBe('SyncError')
    expect((thrown as SyncError).baseAdvanced).toBe(false)
    expect(calls.some(isMergeTree)).toBe(false) // B3 在锁/纯算之前就拦下
  })

  it('未传 expectedBaseSha → baseTip/CAS expected-old 回退当前 HEAD（best-effort）', async () => {
    const { exec, calls } = makeExec({ updateRefExit: 0 })
    await expect(mergeBackToBase(exec, input())).resolves.toMatchObject({ landed: true, hostSynced: true, baseBefore: 'HEAD_SHA' })
    expect(calls.find(isMergeTree)).toEqual(['git', 'merge-tree', '--write-tree', 'HEAD_SHA', 'BRANCH_TIP'])
    expect(findUpdateRef(calls)).toEqual(['git', 'update-ref', '--stdin'])
    expect(calls.find((c) => c[0] === 'stdin')?.[1]).toContain('update refs/heads/main MERGED HEAD_SHA')
  })

  // ── fallback（git < 2.38）：merge --no-commit 合进 HEAD；清理绝不用 --abort（用 reset --hard <当时实际 base ref>）──
  describe('fallback（git < 2.38，merge-tree 不可用）', () => {
    it('版本旧 → 走 fallback：merge --no-ff --no-commit + write-tree + commit-tree + 双 ref 原子 transaction（绝不 merge-tree）', async () => {
      const { exec, calls } = makeExec({ version: 'git version 2.37.9', updateRefExit: 0 })
      await expect(mergeBackToBase(exec, input('BASE_OLD'))).resolves.toMatchObject({ landed: true, hostSynced: true, baseBefore: 'BASE_OLD' })
      expect(calls.some(isMergeTree)).toBe(false)
      expect(calls.some(isPlainMerge)).toBe(true) // --no-ff --no-commit
      expect(calls.some((c) => c.includes('write-tree'))).toBe(true)
      expect(findUpdateRef(calls)).toEqual(['git', 'update-ref', '--stdin'])
      const transaction = calls.find((c) => c[0] === 'stdin')?.[1]
      expect(transaction).toContain('verify refs/heads/sandcastle-pipeline/x BRANCH_TIP')
      // update 的 old-value 在同一事务内原子核对 base==BASE_OLD。
      expect(transaction).toContain('update refs/heads/main MERGED BASE_OLD')
      expect(calls.some(isAbort)).toBe(false) // 成功路不 abort
    })

    it('旧 Git 不支持 start/verify transaction → fail-closed + 清理现场，绝不降级为单 ref CAS', async () => {
      const { exec, calls } = makeExec({
        version: 'git version 2.37.9',
        updateRefExit: 129,
        updateRefErr: 'unknown command: start',
        currentBase: 'BASE_STILL',
      })
      await expect(mergeBackToBase(exec, input('BASE_OLD')))
        .rejects.toMatchObject({ _tag: 'SyncError', baseAdvanced: true })
      const updateCalls = calls.filter((call) => call.includes('update-ref'))
      expect(updateCalls).toEqual([['git', 'update-ref', '--stdin']])
      expect(calls.find(isResetHard)).toEqual(['git', 'reset', '--hard', 'BASE_STILL'])
    })

    it('fallback transaction 已 commit 但执行器回传非零，base 后置事实已精确指向 mergedCommit → 继续 landed，不跑失败清理', async () => {
      const { exec, calls } = makeExec({
        version: 'git version 2.37.9',
        updateRefExit: 143,
        updateRefErr: 'interrupted after commit',
        currentBase: 'MERGED',
      })
      await expect(mergeBackToBase(exec, input('BASE_OLD')))
        .resolves.toMatchObject({ landed: true, hostSynced: true, mergedCommit: 'MERGED' })
      expect(calls.some(isResetHard)).toBe(false)
      expect(calls).toContainEqual(['git', 'reset', '--mixed', 'HEAD'])
    })

    it('阻断2 修：fallback CAS 失败 → 清理用 `git reset --hard <当时实际 base ref>`（保留外部推进 B），**绝不 merge --abort**；SyncError{baseAdvanced:true}', async () => {
      const { exec, calls } = makeExec({ version: 'git version 2.37.9', updateRefExit: 1, updateRefErr: 'is at B but expected BASE_OLD', currentBase: 'EXTERNAL_B' })
      await expect(mergeBackToBase(exec, input('BASE_OLD')))
        .rejects.toMatchObject({ _tag: 'SyncError', baseAdvanced: true })
      expect(calls.some(isAbort)).toBe(false) // 阻断2：绝不 --abort（那会 reset ORIG_HEAD=A 覆盖外部推进）
      // 读当时实际 base ref（EXTERNAL_B）→ reset --hard EXTERNAL_B 保留外部推进
      expect(calls.find(isResetHard)).toEqual(['git', 'reset', '--hard', 'EXTERNAL_B'])
    })

    it('阻断2 修：fallback 内容冲突 → 清理 reset --hard（非 --abort）+ SyncError（无 baseAdvanced）', async () => {
      const { exec, calls } = makeExec({ version: 'git version 2.37.9', mergeExit: 1, currentBase: 'BASE_STILL' })
      let thrown: unknown
      try { await mergeBackToBase(exec, input('BASE_OLD')) } catch (e) { thrown = e }
      expect((thrown as SyncError).baseAdvanced).toBe(false)
      expect(calls.some(isAbort)).toBe(false)
      expect(calls.find(isResetHard)).toEqual(['git', 'reset', '--hard', 'BASE_STILL'])
      expect(findUpdateRef(calls)).toBeUndefined() // 冲突绝不推进 base
    })

    it('阻断3 修：fallback 成功后 reset --mixed 非零退出 → 返回 landed + hostSynced=false，不把已推进 ref 说成 conflict', async () => {
      const { exec } = makeExec({ version: 'git version 2.37.9', updateRefExit: 0, resetExit: 1 })
      const landed: MergeBackReceipt[] = []
      await expect(mergeBackToBase(exec, {
        ...input('BASE_OLD'),
        onLanded: async (receipt) => { landed.push(receipt) },
      }))
        .resolves.toMatchObject({ landed: true, hostSynced: false, mergedCommit: 'MERGED' })
      expect(landed).toHaveLength(2)
      expect(landed[1]).toMatchObject({
        landed: true,
        hostSynced: false,
        hostSyncError: expect.stringContaining('reset --mixed HEAD failed'),
      })
    })

    it('阻断2 修：fallback write-tree 非零退出 → fail-loud（清理 reset --hard <当时实际 base> + SyncError），绝不把非零 write-tree 的 stdout 当 tree OID 喂 commit-tree', async () => {
      const { exec, calls } = makeExec({ version: 'git version 2.37.9', writeTreeExit: 128, currentBase: 'BASE_STILL' })
      await expect(mergeBackToBase(exec, input('BASE_OLD')))
        .rejects.toMatchObject({ _tag: 'SyncError' })
      expect(calls.some((c) => c.includes('commit-tree'))).toBe(false) // write-tree 失败即抛，绝不带垃圾 tree OID 进 commit-tree
      expect(findUpdateRef(calls)).toBeUndefined() // 更没推进 base
      expect(calls.some(isAbort)).toBe(false) // 清理绝不用 --abort
      expect(calls.find(isResetHard)).toEqual(['git', 'reset', '--hard', 'BASE_STILL']) // 读当时实际 base ref 还原工作树
    })
  })
})
