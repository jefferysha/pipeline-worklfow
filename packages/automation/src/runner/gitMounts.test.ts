import { describe, expect, it } from 'vitest'
import { parseGitdirPath, resolveGitMounts } from './gitMounts.js'

/**
 * git 双挂载不变量（老仓 lifecycle/gitMounts.ts:44-70，DESIGN §4.5）。
 * worktree 的 .git 是 `gitdir:` 指针文件——进容器必须**同时挂** .git 文件 + 父 .git 目录，
 * 各 host==sandbox（gitdir: 持 host 绝对路径，只有挂到同路径指针才在容器内解析）。
 * 纯逻辑真单测（注入 stat/readFile，不碰真 fs）。
 */
describe('resolveGitMounts（双挂载组装）', () => {
  const dirDeps = { stat: async () => ({ isDirectory: () => true }), readFile: async () => '' }
  const fileDeps = (content: string) => ({
    stat: async () => ({ isDirectory: () => false }),
    readFile: async () => content,
  })

  it('.git 是目录（普通 clone）→ 单挂载 host==sandbox', async () => {
    const m = await resolveGitMounts('/repo/.git', dirDeps)
    expect(m).toEqual([{ hostPath: '/repo/.git', sandboxPath: '/repo/.git' }])
  })

  it('.git 是 gitdir 指针文件 → 双挂载：.git 文件 + 父 .git 目录，各 host==sandbox', async () => {
    const gitPath = '/repo/.sandcastle/worktrees/x/.git'
    const m = await resolveGitMounts(gitPath, fileDeps('gitdir: /repo/.git/worktrees/x'))
    expect(m).toEqual([
      { hostPath: gitPath, sandboxPath: gitPath },
      { hostPath: '/repo/.git', sandboxPath: '/repo/.git' }, // 父 .git 目录，上跳两级
    ])
  })

  it('父 .git 目录 = gitdir 路径上跳两级（worktrees/<name> → worktrees → .git）', async () => {
    const m = await resolveGitMounts('/wt/.git', fileDeps('gitdir: /a/b/c/.git/worktrees/deep'))
    expect(m[1]).toEqual({ hostPath: '/a/b/c/.git', sandboxPath: '/a/b/c/.git' })
  })

  it('无法识别的文件内容 → 回退单挂载文件本身', async () => {
    const m = await resolveGitMounts('/repo/.git', fileDeps('not a gitdir pointer'))
    expect(m).toEqual([{ hostPath: '/repo/.git', sandboxPath: '/repo/.git' }])
  })
})

describe('parseGitdirPath', () => {
  it('拆 worktrees/<name> → parentGitDir + worktreeName', () => {
    expect(parseGitdirPath('/repo/.git/worktrees/mychange')).toEqual({
      parentGitDir: '/repo/.git',
      worktreeName: 'mychange',
    })
  })
})
