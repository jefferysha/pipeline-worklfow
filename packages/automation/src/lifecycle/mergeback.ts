/**
 * 真 merge-back 守卫（BACKLOG #29c，DESIGN §4.5 + §7-item2）—— 移植老仓 SandboxLifecycle.ts:721-829
 * （explicit-branch merge-into-base）+ collectCommits:318-340 + acquireHostMergeLock:136-169。
 *
 * DELIVERY-only merge（R2 reviewer HIGH）：命名分支 `git merge`（**非 cherry-pick**——命名分支可能带
 * merge commit，cherry-pick 会断）回 host base，把 build commit 送上复核主线；权威 build_sha 仍锚
 * 不可变命名分支 tip（barrier.ts 派生），不锚 merge 后的 base HEAD。
 *
 * 冲突留现场（§7-item4「失败/冲突绝不清沙箱」）：merge 非零退出 = settled 冲突 → `git merge --abort`
 * （base 留干净、无半应用标记）→ 抛 SyncError（_tag，携 preservedWorktreePath = worktree 现场路径）
 * → classify 归 conflict（绝不重试，automation_preserved_path 供人工接管）。命名分支 explicit 模式绝不删。
 *
 * 并发安全（BUG-C1）：多 change 从同 base fork 并发 merge 会抢 .git/index.lock → mkdir host 锁
 * （原子、跨进程）串行化 merge-into-base；stale 锁（crash 的 merge）按 mtime 回收。
 */
import { mkdir, rmdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ExecFn } from '../runner/exec.js'
import type { GitFace } from './barrier.js'
import { NO_CONFIG_LOCK_FLAGS } from './worktree.js'

const GIT_ENV = { LC_ALL: 'C' } as const
const LOCK_TIMEOUT_MS = 300_000
const LOCK_STALE_MS = 120_000
const LOCK_POLL_MS = 25
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** merge-back 冲突 / 命名分支 merge 失败时抛（classify 归 conflict，留现场）。 */
export class SyncError extends Error {
  override readonly name = 'SyncError'
  readonly _tag = 'SyncError'
  readonly preservedWorktreePath: string
  constructor(message: string, preservedWorktreePath: string) {
    super(message)
    this.preservedWorktreePath = preservedWorktreePath
  }
}

/** `git merge` 结果判定：exit 0 = 干净交付；非零 = 冲突（settled，绝不重试）。 */
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
 * 把命名分支 DELIVERY-merge 回 host base（host 锁串行）。冲突 → abort + 抛 SyncError（留现场）。
 * 仅 L3（autoMerge=true）调（L1/L2 report-only 不自动合并，安全默认）。
 */
export const mergeBackToBase = async (
  exec: ExecFn,
  input: { hostRepoDir: string; worktreePath: string; branch: string; base: string },
): Promise<void> => {
  const { hostRepoDir, worktreePath, branch, base } = input
  // B3 fail-loud：真 merge 合进 host 当前 HEAD（从不 checkout/校验 base）——host 主树若被切到别的
  // 分支（或 detached），会静默把命名分支合进错分支。merge 前 assert host symbolic-ref HEAD 确实
  // == base，不等则抛 SyncError（留现场、绝不静默合错），供人工核对 host 主树状态后再重跑。
  const headRef = await exec('git', ['symbolic-ref', 'HEAD'], { cwd: hostRepoDir, env: GIT_ENV })
  const head = headRef.exitCode === 0 ? headRef.stdout.trim() : ''
  const headShort = head.replace(/^refs\/heads\//, '')
  const baseShort = base.replace(/^refs\/heads\//, '')
  if (headShort === '' || headShort !== baseShort) {
    throw new SyncError(
      `host repo HEAD is '${head || '(detached)'}' but merge target base is '${base}' — ` +
        `refusing to merge '${branch}' into the wrong branch. The named branch and worktree are PRESERVED at ${worktreePath}. ` +
        `To recover: check out '${base}' in the host repo (${hostRepoDir}) and re-run.`,
      worktreePath,
    )
  }
  const lock = await acquireMergeLock(exec, hostRepoDir, worktreePath)
  try {
    const merge = await exec(
      'git',
      [...NO_CONFIG_LOCK_FLAGS, 'merge', '--no-edit', `refs/heads/${branch}`],
      { cwd: hostRepoDir, env: GIT_ENV },
    )
    if (parseMergeResult(merge).conflict) {
      // settled 冲突：abort（base 留干净），保留命名分支 + worktree 现场，嵌入恢复命令。
      await exec('git', ['merge', '--abort'], { cwd: hostRepoDir, env: GIT_ENV }).catch(() => {})
      throw new SyncError(
        `Merge of '${branch}' into base '${base}' failed (conflict). ` +
          `The named branch '${branch}' and worktree are PRESERVED at ${worktreePath}. ` +
          `To retry: cd ${worktreePath} && git merge ${base} (resolve conflicts manually, then commit).`,
        worktreePath,
      )
    }
  } finally {
    await rmdir(lock).catch(() => {})
  }
}
