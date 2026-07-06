/**
 * 真 git worktree 管理（BACKLOG #29c，DESIGN §4.5 + §7-item12）—— 移植老仓 WorktreeManager.ts:210-344
 * + git.ts:32-37 NO_CONFIG_LOCK_FLAGS。
 *
 * per-change 命名分支 worktree 落在 `<repo>/.sandcastle/worktrees/<branch 折斜杠>`。并发安全三件套：
 *   - LC_ALL=C（execFn env 注入）：stderr 匹配稳定，不被本地化翻译破坏（issue #595）。
 *   - NO_CONFIG_LOCK_FLAGS：`worktree add -b` 不写 upstream tracking config → 不抢 .git/config.lock。
 *   - 命名分支 per-change 唯一（sandcastle-pipeline/<name>）：本身就防同秒撞名，无需随机后缀。
 *
 * 真 execFn（IT 真跑 `git worktree add/remove`）；argv 组装可 fake 单测。WorktreeError（_tag）→
 * classify 归 conflict（worktree 失败留现场，不重试撞同一错）。
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecFn } from '../runner/exec.js'
import type { WorktreePort } from './lifecycle.js'

/** git 全局 flag：阻止 `worktree add -b` 写 upstream tracking config（防 config.lock 竞争）。 */
export const NO_CONFIG_LOCK_FLAGS: readonly string[] = [
  '-c',
  'branch.autoSetupMerge=false',
  '-c',
  'push.autoSetupRemote=false',
]

const GIT_ENV = { LC_ALL: 'C' } as const

export class WorktreeError extends Error {
  override readonly name = 'WorktreeError'
  readonly _tag = 'WorktreeError'
}

/** per-change worktree 路径：`<repo>/.sandcastle/worktrees/<branch 斜杠折成 ->`（斜杠会嵌套目录）。 */
export const worktreePathFor = (repoDir: string, branch: string): string =>
  join(repoDir, '.sandcastle', 'worktrees', branch.replace(/\//g, '-'))

/**
 * 真 `git worktree add`：命名分支不存在则 `-b` 从 HEAD 建，已存在则直接 checkout。
 * 带 NO_CONFIG_LOCK_FLAGS + LC_ALL=C（并发安全三件套）。
 */
export const addWorktree = async (
  exec: ExecFn,
  repoDir: string,
  branch: string,
): Promise<{ path: string; branch: string }> => {
  await mkdir(join(repoDir, '.sandcastle', 'worktrees'), { recursive: true })
  const path = worktreePathFor(repoDir, branch)

  // 先试 `-b`（新建命名分支从 HEAD）；已存在则 git 报错，回退直接 checkout 现有分支。
  const created = await exec(
    'git',
    [...NO_CONFIG_LOCK_FLAGS, 'worktree', 'add', '-b', branch, path, 'HEAD'],
    { cwd: repoDir, env: GIT_ENV },
  )
  if (created.exitCode === 0) return { path, branch }

  const reused = await exec('git', [...NO_CONFIG_LOCK_FLAGS, 'worktree', 'add', path, branch], {
    cwd: repoDir,
    env: GIT_ENV,
  })
  if (reused.exitCode === 0) return { path, branch }

  throw new WorktreeError(
    `git worktree add failed for '${branch}': ${(reused.stderr || created.stderr).slice(0, 300)}`,
  )
}

/** 真 `git worktree remove --force`（repoDir 从 worktree 路径上跳三级派生）。 */
export const removeWorktree = async (exec: ExecFn, path: string): Promise<void> => {
  const repoDir = join(path, '..', '..', '..')
  const r = await exec('git', ['worktree', 'remove', '--force', path], { cwd: repoDir, env: GIT_ENV })
  if (r.exitCode !== 0) {
    // 兜底：git 拒删则 prune 元数据（脏 worktree 由上层 preserve 逻辑决定留不留）。
    await exec('git', ['worktree', 'prune'], { cwd: repoDir, env: GIT_ENV }).catch(() => {})
  }
}

/** 装配 #29 WorktreePort（create/remove 真 git）。 */
export const realWorktreePort = (exec: ExecFn): WorktreePort => ({
  create: (repoDir, branch) => addWorktree(exec, repoDir, branch),
  remove: (path) => removeWorktree(exec, path),
})
