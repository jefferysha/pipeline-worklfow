/**
 * 真 merge-back 守卫（BACKLOG #29c，DESIGN §4.5 + §7-item2）—— 命名分支 DELIVERY-merge 回 host base。
 *
 * G²（loop 线 Stage B）正解 = mergeBackToBase 用 `git merge-tree` **纯算** merge tree（git 2.38+，纯算阶段零
 * host 副作用：不碰工作树 / index / HEAD / MERGE_HEAD / 任何 ref，只往对象库写 tree）+ `commit-tree` 造带两
 * parent（baseTip + 命名分支 tip）的 merge commit + 单条 `git update-ref <base> <merge> <baseTip>`
 * ——**git 原生 expected-old-SHA 原子 CAS**——推进 base ref。
 *
 * **CAS 成功后再 `git read-tree -m -u <baseTip> <merge>` 把 host 主工作树同步到新 merge**（阻断1，第五轮返工）：
 * 只推 base ref、不同步工作树 → HEAD 变到 merge commit 但 index/工作树仍是旧 tree(A) → host 主仓 `git status`
 * 显 staged/working-tree deletion、`git commit -a` 把 merge 进来的产物当成被删。read-tree 两 tree 合并把 merge
 * 改动的路径落工作树/index、**保留未改动路径上的本地未提交改动**（如本 change 自己的 openspec/changes/<name>/
 * .pipeline.yaml——run 期间被 scheduler `automation:running`/lifecycle automation_sandbox 写脏；reset --hard 会
 * 把它连同 automation 字段一起打回 committed 值、令结算期 setAutomationOwned 的 running→merged CAS 落空，故绝不
 * 用 reset --hard），merge 改动的路径若有本地未提交改动则**原子中止**；此时 base ref 已落地，返回
 * `hostSynced:false` receipt 并把失败细节再次 durable 落账，绝不误报 conflict、绝不覆盖用户改动。
 * AFK loop L3 merge-back 的语义就是把 sandbox 产物真的合进 base 让用户在 host 工作树看到。
 *
 * 三个 git 协议阻断（codex round3）由此逐条消：
 *   1) update-ref CAS 失败不再退化成「无 baseAdvanced 的普通 SyncError」——抛 SyncError{baseAdvanced:true}，
 *      lifecycle 原样透传、scheduler 据此 report.ok=false（fail-loud，CLI 非零，绝不假报「跑完一轮」）。
 *   2) 纯算阶段不碰 host → CAS 失败**无需任何清理**（天然干净，read-tree 同步只在 CAS 成功后跑，失败路走不到）
 *      → 根本不存在「`git merge --abort` (≈reset --merge ORIG_HEAD=A) 把外部推进值 B 覆盖回 A」这个阻断——
 *      base 停在外部值 B，绝不被覆盖。
 *   3) 纯算不产生 MERGE_HEAD / 脏 index → 没有 abort/reset 清理动作可吞退出码——不会「报 merged 却留脏 host」。
 *
 * baseTip = 冻结时读到的 base SHA（= expectedBaseSha，barrier 验证正是针对它）；branchTip = 命名分支 tip。
 * merge-tree 报冲突（exit 1）→ content-conflict：抛 SyncError（**无 baseAdvanced**），既有 conflict+preserve
 * 路由不变（classify 归 conflict、留现场），**全程不碰 host**。
 *
 * git < 2.38（`merge-tree --write-tree` 不可用）fallback：退回 `git merge --no-ff --no-commit`（合进 HEAD，
 * 会碰工作树/index）+ write-tree + commit-tree + `update-ref --stdin` 双 ref 原子事务，但**清理绝不用
 * `git merge --abort`**（那会
 * reset 到 ORIG_HEAD=A、覆盖外部推进 B，正是阻断 2）——改读「当时实际 base ref 值」`git reset --hard <it>`
 * 保留外部推进，且所有 git 操作核验非零退出 fail-loud（消阻断 3）。生产/测试环境 git ≥ 2.38 时永走纯算路径。
 *
 * DELIVERY-only merge（R2 reviewer HIGH）：命名分支 `git` 语义 merge（**非 cherry-pick**——命名分支可能带
 * merge commit，cherry-pick 会断）回 host base；权威 build_sha 仍锚不可变命名分支 tip（barrier.ts 派生），
 * 不锚 merge 后的 base HEAD。
 *
 * 冲突 / CAS 失败留现场（§7-item4「失败/冲突绝不清沙箱」）：抛 SyncError（_tag，携 preservedWorktreePath =
 * worktree 现场路径）→ classify 归 conflict（绝不重试，automation_preserved_path 供人工接管）。命名分支
 * explicit 模式绝不删。
 *
 * 并发安全（BUG-C1）：host mkdir 锁（原子、跨进程）串行化 merge-into-base，stale 锁按 mtime 回收。纯算路径
 * 本不抢 .git/index.lock（merge-tree 不碰 index），此锁只作 belt-and-suspenders 串行；**git 原生 ref CAS 才
 * 是并发正确性根基**——两个同 base 并发 merge，先到者 CAS 成功推进、后到者 CAS 失败标 base-advanced。
 */
import { randomUUID } from 'node:crypto'
import { mkdir, rmdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import type { GitFace } from './barrier.js'
import { NO_CONFIG_LOCK_FLAGS } from './worktree.js'

const GIT_ENV = { LC_ALL: 'C' } as const
const LOCK_TIMEOUT_MS = 300_000
const LOCK_STALE_MS = 120_000
const LOCK_POLL_MS = 25
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * merge-back 冲突 / CAS 失败时抛（classify 归 conflict，留现场）。
 *
 * baseAdvanced（G² loop 线 Stage B）：update-ref expected-old-SHA CAS 失败（base 被第三方在纯算窗口内推进）
 * 时置 true——scheduler 据此除 settle conflict 外**另记一条 round failure 使 ok=false**（fail-loud）；普通
 * content-conflict 为 false（正常 settle、round 仍 ok）。与 lifecycle BaseAdvancedError 同款信号
 * （_tag='SyncError' + baseAdvanced=true），使 update-ref CAS 失败与 permit 预检 CAS 失败殊途同归到 fail-loud。
 */
export class SyncError extends Error {
  override readonly name = 'SyncError'
  readonly _tag = 'SyncError'
  readonly preservedWorktreePath: string
  readonly baseAdvanced: boolean
  constructor(message: string, preservedWorktreePath: string, opts?: { baseAdvanced?: boolean }) {
    super(message)
    this.preservedWorktreePath = preservedWorktreePath
    this.baseAdvanced = opts?.baseAdvanced === true
  }
}

export interface MergeBackReceipt {
  readonly landed: true
  readonly hostSynced: boolean
  readonly mergedCommit: string
  readonly baseBefore: string
  readonly branchTip: string
  readonly hostSyncError?: string
  readonly landedJournalError?: string
}


export interface MergeIntentDraft {
  readonly baseRef: string
  readonly baseBefore: string
  readonly branchRef: string
  readonly branchTip: string
  readonly mergedCommit: string
}

export class MergeJournalError extends Error {
  override readonly name = 'MergeJournalError'
  readonly _tag = 'MergeJournalError'
  readonly landed = false
}

const safeMessage = (error: unknown): string => {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch { /* fallback below */ }
  try { return String(error) } catch { return 'unknown merge journal error' }
}

/**
 * `update-ref --stdin` 的返回码也有不确定结果窗口：transaction 已 commit，但调用进程在把 exit 0
 * 传回前被中断。仅查 base==mergedCommit 不够：onIntent 已暴露 mergedCommit，外部可自行把 base
 * 指过去，而本事务因 branch verify 失败根本没 commit。因此每个事务同时 create 一个不可预测的
 * marker ref；只有 base 和 marker 都精确指向本轮 mergedCommit，才能证明这个原子事务真提交。
 * 读失败、marker 缺失、旧值或其他 SHA 均 fail-closed。
 */
const transactionCommitIsVisible = async (
  git: (args: string[], input?: string) => Promise<ExecResult>,
  baseRef: string,
  mergedCommit: string,
  markerRef: string,
): Promise<boolean> => {
  const marker = await git(['rev-parse', markerRef])
  if (marker.exitCode !== 0 || marker.stdout.trim() !== mergedCommit) return false
  const base = await git(['rev-parse', baseRef])
  return base.exitCode === 0 && base.stdout.trim() === mergedCommit
}

const TRANSACTION_MARKER_NAMESPACE = 'refs/pipeline/mergeback-transactions/'

const transactionMarkerRef = (): string =>
  `${TRANSACTION_MARKER_NAMESPACE}${randomUUID().replaceAll('-', '')}`

/**
 * repo merge lock 内不存在本进程的活跃同仓 marker，因此这里列出的本 namespace refs 都是前次崩溃残留。
 * 用 objectname expected-old 的单个 ref transaction 回收，避免并发外力改写后误删；命令范围与逐条校验都
 * 锚定带尾 `/` 的精确 namespace，邻接的 `mergeback-transactions-*` refs 不会进入删除集合。
 */
const cleanupStaleTransactionMarkers = async (
  git: (args: string[], input?: string) => Promise<ExecResult>,
  preserve: (message: string) => SyncError,
): Promise<void> => {
  const listed = await git([
    'for-each-ref',
    '--format=%(refname) %(objectname)',
    TRANSACTION_MARKER_NAMESPACE,
  ])
  if (listed.exitCode !== 0) {
    throw preserve(
      `git for-each-ref failed while enumerating stale merge transaction markers ` +
        `(exit ${listed.exitCode}): ${(listed.stderr || listed.stdout).slice(0, 160)} — refusing to create another marker.`,
    )
  }
  const stale: Array<{ ref: string; oid: string }> = []
  for (const line of listed.stdout.split('\n')) {
    if (line === '') continue
    const separator = line.indexOf(' ')
    if (separator < 1) {
      throw preserve(`git for-each-ref returned a malformed stale merge transaction marker entry; refusing to delete any ref or create another marker.`)
    }
    const ref = line.slice(0, separator)
    const oid = line.slice(separator + 1)
    if (!ref.startsWith(TRANSACTION_MARKER_NAMESPACE) || ref.length === TRANSACTION_MARKER_NAMESPACE.length) {
      throw preserve(
        `git for-each-ref returned '${ref}' outside the exact merge transaction marker namespace; refusing to delete it or create another marker.`,
      )
    }
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(oid)) {
      throw preserve(`git for-each-ref returned an invalid object id for stale marker '${ref}'; refusing to delete any ref or create another marker.`)
    }
    stale.push({ ref, oid })
  }
  if (stale.length === 0) return
  const transaction = [
    'start',
    ...stale.map(({ ref, oid }) => `delete ${ref} ${oid}`),
    'prepare',
    'commit',
    '',
  ].join('\n')
  const removed = await git(['update-ref', '--stdin'], transaction)
  if (removed.exitCode !== 0) {
    throw preserve(
      `atomic cleanup of ${stale.length} stale merge transaction marker(s) failed ` +
        `(exit ${removed.exitCode}): ${(removed.stderr || removed.stdout).slice(0, 160)} — refusing to create another marker.`,
    )
  }
}

/**
 * marker 只用于非零返回的后置消歧；landed 已确认后尽力删除，删除失败不能反向改写已落地事实。
 * 残留由下一轮在同一 repo lock 内预清理；若清理故障持续，下一轮会在创建新 marker 前 fail-closed，
 * 因而每仓残留数量有界，不会用“回滚已经 landed”来换取表面清洁。
 */
const cleanupTransactionMarker = async (
  git: (args: string[], input?: string) => Promise<ExecResult>,
  markerRef: string,
  mergedCommit: string,
): Promise<void> => {
  await git(['update-ref', '-d', markerRef, mergedCommit])
}

/** `git merge` 结果判定（fallback 路径用）：exit 0 = 干净交付；非零 = 冲突（settled，绝不重试）。 */
export const parseMergeResult = (r: { exitCode: number; stdout: string; stderr: string }): { conflict: boolean } => ({
  conflict: r.exitCode !== 0,
})

/** git 只读注入面（barrier 需 rev-parse 一个 ref）。非零退出抛错（barrier 会转 BarrierDriftError）。 */
export const realGitFace = (exec: ExecFn, cwd: string): GitFace => ({
  async revParse(ref) {
    const r = await exec('git', ['rev-parse', ref], { cwd, env: GIT_ENV })
    if (r.exitCode !== 0) throw new Error(`git rev-parse ${ref} failed: ${r.stderr.slice(0, 200)}`)
    return r.stdout.trim()
  },
})

/**
 * 收集命名分支相对 base 的 commits（FIFO；last = build HEAD）。范围 `<base>..refs/heads/<branch>`
 * 读**不可变命名 ref**（sibling-proof，不受并发 merge-into-base 串味）。空/出错 → [] (no-op run)。
 */
export const collectCommitsReal = async (
  exec: ExecFn,
  input: { hostRepoDir: string; branch: string; base: string },
): Promise<{ sha: string }[]> => {
  const r = await exec(
    'git',
    ['rev-list', `${input.base}..refs/heads/${input.branch}`, '--reverse'],
    { cwd: input.hostRepoDir, env: GIT_ENV },
  )
  if (r.exitCode !== 0) return []
  const lines = r.stdout.trim()
  if (!lines) return []
  return lines.split('\n').map((sha) => ({ sha: sha.trim() }))
}

/**
 * 本次 run 触碰的文件清单（T4 决议 #12 denylist 结算检查的数据源）：
 * `git diff --name-only <base>...refs/heads/<branch>`（三点号 = 相对 merge-base 的分支侧改动，
 * 不把 base 上并行推进的文件算到本 run 头上）。读**不可变命名 ref**（sibling-proof，同
 * collectCommitsReal）。空/出错 → []（容错口径同 collectCommitsReal——git 故障不误判成违规）。
 */
export const diffNamesReal = async (
  exec: ExecFn,
  input: { hostRepoDir: string; branch: string; base: string },
): Promise<string[]> => {
  const r = await exec(
    'git',
    // B6：git 默认 core.quotePath=true，非 ASCII 路径输出成 "\346..." 八进制转义双引号串，下游
    // denylist glob 匹配不到 → 中文/emoji 文件名越界产出逃检（L3 自动 merge）。-c core.quotePath=false
    // 关掉转义 → 输出 literal UTF-8 路径，denylist 真命中。
    ['-c', 'core.quotePath=false', 'diff', '--name-only', `${input.base}...refs/heads/${input.branch}`],
    { cwd: input.hostRepoDir, env: GIT_ENV },
  )
  if (r.exitCode !== 0) return []
  const lines = r.stdout.trim()
  if (!lines) return []
  return lines.split('\n').map((f) => f.trim()).filter((f) => f !== '')
}

/** git-common-dir 解析（worktree 的 .git 是 gitfile stub，锁必须落真 .git 公共目录）。 */
const resolveLockDir = async (exec: ExecFn, hostRepoDir: string): Promise<string> => {
  const r = await exec('git', ['rev-parse', '--git-common-dir'], { cwd: hostRepoDir, env: GIT_ENV })
  const out = r.exitCode === 0 ? r.stdout.trim() : '.git'
  return join(resolve(hostRepoDir, out || '.git'), 'sandcastle-mergeback.lock.d')
}

const acquireMergeLock = async (exec: ExecFn, hostRepoDir: string, preservedPath: string): Promise<string> => {
  const lockdir = await resolveLockDir(exec, hostRepoDir)
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    try {
      await mkdir(lockdir, { recursive: false })
      return lockdir
    } catch {
      // stale 锁（crash 的 merge，mtime 老于阈值）回收。
      try {
        const s = await stat(lockdir)
        if (Date.now() - s.mtimeMs > LOCK_STALE_MS) await rmdir(lockdir).catch(() => {})
      } catch {
        /* 已消失 — 重试 mkdir */
      }
      if (Date.now() >= deadline) {
        throw new SyncError(`host merge-back lock not acquired within ${LOCK_TIMEOUT_MS}ms (${lockdir})`, preservedPath)
      }
      await sleep(LOCK_POLL_MS)
    }
  }
}

/**
 * git ≥ 2.38 → `git merge-tree --write-tree` 可用（纯算 merge tree OID + 冲突退出码，零 host 副作用）。
 * `git --version` 探测；解析失败 / 版本旧 → { ok:false }（走 fallback）。version 原样带回供报告。
 */
export const mergeTreeSupported = async (exec: ExecFn, hostRepoDir: string): Promise<{ ok: boolean; version: string }> => {
  const r = await exec('git', ['--version'], { cwd: hostRepoDir, env: GIT_ENV })
  const version = r.stdout.trim()
  if (r.exitCode !== 0) return { ok: false, version }
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(version)
  if (!m) return { ok: false, version }
  const major = Number(m[1])
  const minor = Number(m[2])
  return { ok: major > 2 || (major === 2 && minor >= 38), version }
}

/**
 * 把命名分支 DELIVERY-merge 回 host base（host 锁串行）。纯算路径零 host 副作用（见文件头）；冲突 / CAS
 * 失败 → 抛 SyncError（留现场），CAS 失败额外携 baseAdvanced=true（fail-loud）。仅 L3（autoMerge=true）调。
 *
 * expectedBaseSha（G²）= 冻结（收集 commits/barrier）时读到的 base ref SHA = 纯算 baseTip + CAS expected-old；
 * 未传时回退当前 HEAD（best-effort，非 L3 生产路径不走此分支）。上游 withLoopMergePermit 的 verifyBase 已在
 * governance 锁内 CAS 一次；此 update-ref CAS 是持 merge 锁内、覆盖「freeze→verify↔本次 CAS 全窗口」的第二道
 * belt-and-suspenders——third-party 推进 base 无论落在哪个窗口，git 原生 ref CAS 都在推进那一刻挡住。
 */
export const mergeBackToBase = async (
  exec: ExecFn,
  input: {
    hostRepoDir: string; worktreePath: string; branch: string; base: string
    expectedBaseSha?: string; expectedBranchSha?: string
    onIntent?: (draft: MergeIntentDraft) => Promise<void>
    onLanded?: (receipt: MergeBackReceipt) => Promise<void>
  },
): Promise<MergeBackReceipt> => {
  const { hostRepoDir, worktreePath, branch, base, expectedBaseSha, expectedBranchSha, onIntent, onLanded } = input
  const baseShort = base.replace(/^refs\/heads\//, '')
  const git = (args: string[], input?: string): Promise<ExecResult> => exec('git', args, { cwd: hostRepoDir, env: GIT_ENV, input })

  // B3 fail-loud：host 主树若被切到别的分支（或 detached），拒绝 merge。纯算路径 explicit 打 refs/heads/<base>
  // （不靠 HEAD 定合并目标，已不会「静默合进当前错分支」），但保留此守卫核对 host 处于预期状态（主树 == base）
  // ——不等则抛 SyncError（留现场、绝不静默），供人工核对 host 主树状态后再重跑。
  const headRef = await git(['symbolic-ref', 'HEAD'])
  const head = headRef.exitCode === 0 ? headRef.stdout.trim() : ''
  const headShort = head.replace(/^refs\/heads\//, '')
  if (headShort === '' || headShort !== baseShort) {
    throw new SyncError(
      `host repo HEAD is '${head || '(detached)'}' but merge target base is '${base}' — ` +
        `refusing to merge '${branch}' into a host repo that is not on the base branch. The named branch and worktree are PRESERVED at ${worktreePath}. ` +
        `To recover: check out '${base}' in the host repo (${hostRepoDir}) and re-run.`,
      worktreePath,
    )
  }

  const lock = await acquireMergeLock(exec, hostRepoDir, worktreePath)
  const preserve = (message: string, opts?: { baseAdvanced?: boolean }): SyncError =>
    new SyncError(`${message} The named branch '${branch}' and worktree are PRESERVED at ${worktreePath}.`, worktreePath, opts)
  try {
    await cleanupStaleTransactionMarkers(git, preserve)
    // headSha = host 当前 HEAD（B3 已保证 == base ref）。baseTip = 冻结值 expectedBaseSha（barrier 验证针对它）
    // 优先，未传回退 headSha（best-effort）。纯算全程用 baseTip；fallback 的 merge 合进 HEAD（=headSha）。
    // 阻断2（第五轮返工）：每个 git 操作按自身退出码 fail-loud——非零即抛（含错误归因），绝不把非零命令的
    // stdout 当有效 OID 继续喂 merge-tree/commit-tree/read-tree。
    const headRp = await git(['rev-parse', 'HEAD'])
    if (headRp.exitCode !== 0) {
      throw preserve(`git rev-parse HEAD failed while merging '${branch}' into '${base}' (exit ${headRp.exitCode}): ${headRp.stderr.slice(0, 160)}.`)
    }
    const headSha = headRp.stdout.trim()
    const baseTip = expectedBaseSha !== undefined && expectedBaseSha !== '' ? expectedBaseSha : headSha
    const branchRp = await git(['rev-parse', `refs/heads/${branch}`])
    if (branchRp.exitCode !== 0) {
      throw preserve(`git rev-parse refs/heads/${branch} failed while merging into '${base}' (exit ${branchRp.exitCode}): ${branchRp.stderr.slice(0, 160)}.`)
    }
    const branchTip = branchRp.stdout.trim()
    if (baseTip === '' || branchTip === '') {
      throw preserve(`git rev-parse returned an empty OID while merging '${branch}' into '${base}' (baseTip='${baseTip}', branchTip='${branchTip}').`)
    }
    if (expectedBranchSha !== undefined && branchTip !== expectedBranchSha) {
      throw preserve(
        `branch '${branch}' advanced from verified revision ${expectedBranchSha.slice(0, 12)} to ${branchTip.slice(0, 12)} before merge — refusing to merge an unverified revision.`,
      )
    }

    const support = await mergeTreeSupported(exec, hostRepoDir)
    const mergeMsg = `Merge branch '${branch}' into '${baseShort}'`

    if (support.ok) {
      // ══ 纯算路径（git ≥ 2.38）：merge-tree/commit-tree 纯算零副作用；update-ref CAS 推进 base ref；
      //    CAS 成功后 read-tree -m -u 同步 host 主工作树到 merge（保留未改动路径的本地未提交改动）══
      // 1) merge-tree --write-tree baseTip branchTip：纯算 merge tree（写对象库，**不碰工作树/index/HEAD/任何 ref**）。
      //    exit 0 = 干净；exit 1 = 内容冲突（settled）；其余 = 错误。全程没碰 host，任一失败都无需清理。
      const mt = await git(['merge-tree', '--write-tree', baseTip, branchTip])
      if (mt.exitCode === 1) {
        // content-conflict：**无 baseAdvanced**（普通冲突是正常 settle、round 仍 ok），既有 conflict+preserve 路由不变。
        throw preserve(
          `Merge of '${branch}' into base '${base}' failed (content conflict). ` +
            `To retry: cd ${worktreePath} && git merge ${base} (resolve conflicts manually, then commit).`,
        )
      }
      if (mt.exitCode !== 0) {
        throw preserve(`git merge-tree failed merging '${branch}' into '${base}': ${mt.stderr.slice(0, 160)}.`)
      }
      // merge-tree --write-tree 输出：第一行 = merged tree OID（干净 merge 只此一行）。
      const mergeTree = (mt.stdout.split('\n')[0] ?? '').trim()
      if (mergeTree === '') {
        throw preserve(`git merge-tree returned an empty tree merging '${branch}' into '${base}'.`)
      }

      // 2) commit-tree：merge tree + 两 parent（baseTip + 命名分支 tip）→ merge commit（保 merge 语义/两 parent = 非
      //    fast-forward，走 git config identity）。不靠 `git merge` 自动推进 ref。
      const commit = await git(['commit-tree', mergeTree, '-p', baseTip, '-p', branchTip, '-m', mergeMsg])
      const mergedCommit = commit.stdout.trim()
      if (commit.exitCode !== 0 || mergedCommit === '') {
        throw preserve(`git commit-tree failed merging '${branch}' into '${base}': ${commit.stderr.slice(0, 160)}.`)
      }

      const intent: MergeIntentDraft = {
        baseRef: `refs/heads/${baseShort}`, baseBefore: baseTip,
        branchRef: `refs/heads/${branch}`, branchTip, mergedCommit,
      }
      try {
        await onIntent?.(intent)
      } catch (error) {
        throw new MergeJournalError(`merge intent 持久化失败，base ref 未推进：${safeMessage(error)}`)
      }

      // 3) expected-old-SHA 原子 CAS 推进 base ref（merge 落地的原子 host 变更；工作树同步在下面第 4 步）。base 被
      //    第三方在纯算窗口内推进（refs/heads/<base> != baseTip）→ git 原生拒绝（非零）→ **base-advanced fail-loud**
      //    （baseAdvanced=true）：base 停在外部值（绝不覆盖）、产物绝不合进未验证 base、**无需任何清理**（CAS 失败时
      //    read-tree 同步还没跑，全程没碰 host 工作树，天然干净）。
      // 同一 ref transaction 内同时验证命名分支仍停在已核验 SHA，并以 expected-old 更新 base。
      // 单独“先 rev-parse branch、后 update base”仍留有检查后被推进的窗口；update-ref --stdin
      // 会同时持有两条 ref 的锁，任一 verify/update 不满足则整个 transaction 零写入。
      const markerRef = transactionMarkerRef()
      const refTxn = [
        'start',
        `verify refs/heads/${branch} ${branchTip}`,
        `update refs/heads/${baseShort} ${mergedCommit} ${baseTip}`,
        `create ${markerRef} ${mergedCommit}`,
        'prepare',
        'commit',
        '',
      ].join('\n')
      const upd = await git(['update-ref', '--stdin'], refTxn)
      const committedDespiteError = upd.exitCode !== 0 && await transactionCommitIsVisible(
        git,
        `refs/heads/${baseShort}`,
        mergedCommit,
        markerRef,
      )
      if (upd.exitCode !== 0 && !committedDespiteError) {
        throw preserve(
          `base '${base}' or verified branch '${branch}' changed since this run was frozen ` +
            `(atomic ref transaction failed: ${upd.stderr.slice(0, 160)}) — refusing to auto-merge onto un-verified refs. ` +
            `To recover: re-run against the current '${base}' in the host repo (${hostRepoDir}).`,
          { baseAdvanced: true },
        )
      }
      await cleanupTransactionMarker(git, markerRef, mergedCommit)

      let landedJournalError: string | undefined
      const landedReceipt: MergeBackReceipt = {
        landed: true, hostSynced: false, mergedCommit, baseBefore: baseTip, branchTip,
      }
      try {
        await onLanded?.(landedReceipt)
      } catch (error) {
        landedJournalError = safeMessage(error)
      }

      // 4) 阻断1（第五轮返工）：CAS 成功 → base ref 已原子推进到 merge commit（HEAD→base→merge）。同步 host
      //    主工作树到 merge——否则 index/工作树仍是旧 tree(A)，host `git status` 显 staged deletion、用户
      //    `git commit -a` 把产物当被删。`git read-tree -m -u <baseTip> <merge>` 两 tree 合并：merge 改动的
      //    路径落工作树/index（产物真正可见）、**保留未改动路径上的本地未提交改动**（run 期间被 scheduler/
      //    lifecycle 写脏的本 change .pipeline.yaml automation 状态——保留它才不打断结算期 running→merged CAS，
      //    这正是绝不用 reset --hard 全树打回的原因）。merge 改动的路径若有本地未提交改动 → read-tree 原子
      //    中止（非零、工作树零变更）→ `hostSynced:false` durable receipt（ref 已推进、产物已在 base，
      //    工作树同步交人工，非 base 被抢），绝不 reset --hard 覆盖用户改动。CAS 失败路走不到这里（上面已抛），
      //    故「失败不碰工作树」不变。
      const sync = await git(['read-tree', '-m', '-u', baseTip, mergedCommit])
      if (sync.exitCode !== 0) {
        const hostSyncError = `git read-tree: ${(sync.stderr || sync.stdout).slice(0, 160)}`
        try {
          await onLanded?.({
            landed: true, hostSynced: false, mergedCommit, baseBefore: baseTip, branchTip, hostSyncError,
          })
          landedJournalError = undefined
        } catch (error) {
          landedJournalError = safeMessage(error)
        }
        return {
          landed: true, hostSynced: false, mergedCommit, baseBefore: baseTip, branchTip,
          hostSyncError,
          landedJournalError,
        }
      }
      // 成功：base ref 原子推进 + host 主工作树已同步反映 merge（产物落工作树，未改动路径的本地改动保留）。
      try {
        await onLanded?.({ landed: true, hostSynced: true, mergedCommit, baseBefore: baseTip, branchTip })
        landedJournalError = undefined
      } catch (error) {
        landedJournalError = safeMessage(error)
      }
      return { landed: true, hostSynced: true, mergedCommit, baseBefore: baseTip, branchTip, landedJournalError }
    }

    // ══ fallback（git < 2.38，merge-tree --write-tree 不可用）：merge --no-commit 合进 HEAD，清理绝不用 --abort ══
    return await mergeBackFallback(git, { branch, base, baseShort, headSha, branchTip, casExpectedOld: baseTip, mergeMsg, preserve, onIntent, onLanded })
  } finally {
    await rmdir(lock).catch(() => {})
  }
}

/**
 * git < 2.38 fallback：`git merge --no-ff --no-commit` 合进 HEAD（会碰工作树/index）+ write-tree + commit-tree
 * + `update-ref --stdin` 原子执行「verify 已核验 branch tip + 以 expected-old 更新 base」。关键区别于阻断版：
 * 清理**绝不用 `git merge --abort`**（那 reset 到
 * ORIG_HEAD=A、覆盖外部推进 B）——改读「当时实际 base ref 值」`git reset --hard <it>` 保留外部推进；**所有
 * git 操作核验非零退出 fail-loud**。ref 已变化或旧 Git 不支持 transaction/verify 均 fail-closed，绝不降级成
 * 单 ref CAS；失败携 baseAdvanced=true（与纯算路径同款 fail-loud）。
 */
const mergeBackFallback = async (
  git: (args: string[], input?: string) => Promise<ExecResult>,
  ctx: {
    branch: string
    base: string
    baseShort: string
    headSha: string
    branchTip: string
    casExpectedOld: string
    mergeMsg: string
    preserve: (message: string, opts?: { baseAdvanced?: boolean }) => SyncError
    onIntent?: (draft: MergeIntentDraft) => Promise<void>
    onLanded?: (receipt: MergeBackReceipt) => Promise<void>
  },
): Promise<MergeBackReceipt> => {
  const { branch, base, baseShort, headSha, branchTip, casExpectedOld, mergeMsg, preserve, onIntent, onLanded } = ctx

  // 清理：读「当时实际 base ref 值」→ `git reset --hard <it>` 还原工作树/index、清 MERGE_HEAD，**保留外部推进**
  // （绝不 `git merge --abort`——那 reset 到 ORIG_HEAD 会把外部推进值覆盖回本 run 冻结前的旧 base）。核验退出码。
  const cleanup = async (): Promise<string> => {
    const cur = await git(['rev-parse', `refs/heads/${baseShort}`])
    const target = cur.exitCode === 0 ? cur.stdout.trim() : ''
    if (target === '') return ' [cleanup: cannot read current base ref — host may be left mid-merge]'
    const reset = await git(['reset', '--hard', target])
    return reset.exitCode === 0 ? '' : ` [cleanup: git reset --hard ${target.slice(0, 12)} failed (exit ${reset.exitCode})]`
  }
  const failCleanup = async (message: string, opts?: { baseAdvanced?: boolean }): Promise<never> => {
    const note = await cleanup()
    throw preserve(`${message}${note}`, opts)
  }

  // 1) merge --no-ff --no-commit：合并结果落 index/工作树，不自动 commit、不推进 ref（--no-ff 保非 fast-forward）。
  const merge = await git([...NO_CONFIG_LOCK_FLAGS, 'merge', '--no-ff', '--no-commit', `refs/heads/${branch}`])
  if (parseMergeResult(merge).conflict) {
    await failCleanup(
      `Merge of '${branch}' into base '${base}' failed (conflict). ` +
        `To retry in the worktree: git merge ${base} (resolve conflicts manually, then commit).`,
    )
  }
  // 2) write-tree + commit-tree（两 parent = headSha + 命名分支 tip → 非 fast-forward merge commit）。
  //    阻断2：write-tree 按退出码 fail-loud（不只判空 stdout——非零命令的 stdout 绝不当有效 tree OID 喂 commit-tree）。
  const treeRes = await git(['write-tree'])
  const tree = treeRes.stdout.trim()
  if (treeRes.exitCode !== 0 || tree === '') {
    await failCleanup(`git write-tree failed merging '${branch}' into '${base}' (exit ${treeRes.exitCode}): ${treeRes.stderr.slice(0, 160)}.`)
  }
  const commit = await git(['commit-tree', tree, '-p', headSha, '-p', branchTip, '-m', mergeMsg])
  const mergedCommit = commit.stdout.trim()
  if (commit.exitCode !== 0 || mergedCommit === '') {
    await failCleanup(`git commit-tree failed merging '${branch}' into '${base}': ${commit.stderr.slice(0, 160)}.`)
  }
  try {
    await onIntent?.({
      baseRef: `refs/heads/${baseShort}`, baseBefore: casExpectedOld,
      branchRef: `refs/heads/${branch}`, branchTip, mergedCommit,
    })
  } catch (error) {
    await failCleanup(`merge intent 持久化失败，base ref 未推进：${safeMessage(error)}.`)
  }
  // 3) 双 ref 原子事务：`verify branch <branchTip>` 与 `update base <merged> <expected-old>` 在同一
  //    transaction 中持锁并提交。update 命令的 old-value 就是对 base==casExpectedOld 的原子 verify；Git 不允许
  //    同一 transaction 对同一 ref 再写一条独立 verify（会报 multiple updates），故这里不是遗漏 base 校验。
  //    branch/base 任一在初读后变化，或旧 Git 连 start/verify transaction 都不支持，命令均非零并 fail-closed；
  //    绝不退回只保护 base 的单 ref CAS，否则会重新打开「核验后 branch 推进」窗口。
  const markerRef = transactionMarkerRef()
  const refTxn = [
    'start',
    `verify refs/heads/${branch} ${branchTip}`,
    `update refs/heads/${baseShort} ${mergedCommit} ${casExpectedOld}`,
    `create ${markerRef} ${mergedCommit}`,
    'prepare',
    'commit',
    '',
  ].join('\n')
  const upd = await git(['update-ref', '--stdin'], refTxn)
  const committedDespiteError = upd.exitCode !== 0 && await transactionCommitIsVisible(
    git,
    `refs/heads/${baseShort}`,
    mergedCommit,
    markerRef,
  )
  if (upd.exitCode !== 0 && !committedDespiteError) {
    await failCleanup(
      `base '${base}' or verified branch '${branch}' changed since this run was frozen, or this Git cannot provide ` +
        `the required atomic ref transaction (exit ${upd.exitCode}: ${upd.stderr.slice(0, 160)}) — refusing to ` +
        `auto-merge onto un-verified refs; single-ref fallback is forbidden.`,
      { baseAdvanced: true },
    )
  }
  await cleanupTransactionMarker(git, markerRef, mergedCommit)
  let landedJournalError: string | undefined
  try {
    await onLanded?.({ landed: true, hostSynced: false, mergedCommit, baseBefore: casExpectedOld, branchTip })
  } catch (error) {
    landedJournalError = safeMessage(error)
  }
  // 4) 成功：清 merge-in-progress 标记（MERGE_HEAD），工作树/index 已是合并结果不动它；核验退出（消阻断 3：
  //    绝不吞 reset 退出码报 merged 却留脏 host）。
  const reset = await git(['reset', '--mixed', 'HEAD'])
  if (reset.exitCode !== 0) {
    const hostSyncError = `git reset --mixed HEAD failed (exit ${reset.exitCode}): ${(reset.stderr || reset.stdout).slice(0, 160)}`
    try {
      await onLanded?.({
        landed: true, hostSynced: false, mergedCommit, baseBefore: casExpectedOld, branchTip, hostSyncError,
      })
      landedJournalError = undefined
    } catch (error) {
      landedJournalError = safeMessage(error)
    }
    return {
      landed: true, hostSynced: false, mergedCommit, baseBefore: casExpectedOld, branchTip,
      hostSyncError,
      landedJournalError,
    }
  }
  try {
    await onLanded?.({ landed: true, hostSynced: true, mergedCommit, baseBefore: casExpectedOld, branchTip })
    landedJournalError = undefined
  } catch (error) {
    landedJournalError = safeMessage(error)
  }
  return { landed: true, hostSynced: true, mergedCommit, baseBefore: casExpectedOld, branchTip, landedJournalError }
}
