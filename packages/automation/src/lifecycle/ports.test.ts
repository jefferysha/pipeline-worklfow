import { describe, expect, it } from 'vitest'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import { createLifecyclePorts } from './ports.js'

/**
 * 生产 LifecyclePorts 装配（#29c）—— 把真 docker/git/worktree 实现接进 #29 lifecycle 的注入面。
 * fake ExecFn 驱动 git 侧端口（worktree/collectCommits/git.revParse）——证明 wiring 真路由到 git 命令
 * （无 docker/无真 git 也可断言 argv）；真 git 端到端在 worktree/mergeback IT 覆盖。
 */
const makeExec = () => {
  const calls: string[][] = []
  const exec: ExecFn = async (file, args) => {
    calls.push([file, ...args])
    const res: ExecResult = { stdout: 'deadbeef\n', stderr: '', exitCode: 0 }
    return res
  }
  return { exec, calls }
}

describe('createLifecyclePorts', () => {
  it('装配出 #29 LifecyclePorts 全部端口', () => {
    const { exec } = makeExec()
    const ports = createLifecyclePorts({ exec, hostRepoDir: '/repo', image: 'sandcastle:local' })
    expect(typeof ports.worktree.create).toBe('function')
    expect(typeof ports.worktree.remove).toBe('function')
    expect(typeof ports.createSandbox).toBe('function')
    expect(typeof ports.runWork).toBe('function')
    expect(typeof ports.collectCommits).toBe('function')
    expect(typeof ports.mergeToBase).toBe('function')
    expect(typeof ports.git.revParse).toBe('function')
  })

  it('git 端口路由到真 git 命令（fake exec 录 argv）', async () => {
    const { exec, calls } = makeExec()
    const ports = createLifecyclePorts({ exec, hostRepoDir: '/repo', image: 'sandcastle:local' })
    const sha = await ports.git.revParse('refs/heads/sandcastle-pipeline/x')
    expect(sha).toBe('deadbeef')
    expect(calls.some((c) => c[0] === 'git' && c.includes('rev-parse'))).toBe(true)

    await ports.collectCommits({ worktreePath: '/wt', branch: 'sandcastle-pipeline/x', base: 'main' })
    expect(calls.some((c) => c[0] === 'git' && c.includes('rev-list'))).toBe(true)
  })
})
