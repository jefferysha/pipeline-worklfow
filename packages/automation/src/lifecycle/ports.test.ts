import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import { createLifecyclePorts } from './ports.js'

const SHA = 'a'.repeat(40)

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

/**
 * afk-workbench Task 2：run 结算（成功/失败）真落盘完整 stdout+stderr 到 worktree 内
 * `.sandcastle-run.log`——不是 automation_last_error 里那 200 字符截断片段。直接单测
 * `ports.runWork`（不经 runChangeInSandbox 全链编排）：worktreePath 只需是真实存在的目录
 * （真 fs 写入/读回验证），不需要真 git worktree——`runWork` 的真实现从不碰 deps.exec，只吃
 * 调用方逐次传入的 sandboxExec 首参，和 createSandbox/collectCommits 等其它端口完全独立。
 *
 * 三条结算路径都要覆盖，因为 invokeWithRace 有两种质地不同的"结算"：
 *   ① resolve（含 exitCode!==0 的"沙箱内命令真失败"）——这时有完整 res.stdout/res.stderr 可读。
 *   ② reject（idle-timeout / abort / sandboxExec 自己抛错）——invokeWithRace 直接 reject，
 *      根本没有 res 可读；若只在 resolve 之后才读 res.stdout 落盘，这条路径的日志会整个丢失
 *      （brief 明确点名的风险：累积值在异常路径被提前丢弃）。真实现必须在 invokeWithRace 外面
 *      自己用 onLine 攒一份兜底尾部，reject 时也能落到点东西。
 */
describe('createLifecyclePorts().runWork · 结算落盘完整日志（afk-workbench Task 2）', () => {
  let worktreePath: string

  beforeEach(async () => {
    worktreePath = await mkdtemp(join(tmpdir(), 'afk-runwork-log-'))
  })
  afterEach(async () => {
    await rm(worktreePath, { recursive: true, force: true })
    vi.useRealTimers()
  })

  const logPath = (): string => join(worktreePath, '.sandcastle-run.log')

  it('成功结算：worktree 内落盘完整 stdout（超过 200 字符截断阈值，未被截）', async () => {
    const { exec } = makeExec()
    const ports = createLifecyclePorts({ exec, hostRepoDir: '/repo', image: 'sandcastle:local' })
    const longOutput = 'x'.repeat(5000) // 超过 200 字符截断阈值，验证没有被截
    const sandboxExec = async (): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
      stdout: `${longOutput}\n<output>{"verify_result":"pass","build_sha":"${SHA}","phase_event":"verify-pass"}</output>\n`,
      stderr: '',
      exitCode: 0,
    })

    await ports.runWork(sandboxExec, 'y', worktreePath, new AbortController().signal)

    const logContent = await readFile(logPath(), 'utf8')
    expect(logContent.length).toBeGreaterThan(200)
    expect(logContent).toContain(longOutput.slice(0, 100))
  })

  it('失败结算（沙箱非零退出）：worktree 内仍落盘完整 stderr（不是抛错信息里那 200 字符截断）', async () => {
    const { exec } = makeExec()
    const ports = createLifecyclePorts({ exec, hostRepoDir: '/repo', image: 'sandcastle:local' })
    const longOutput = 'x'.repeat(5000)
    const sandboxExec = async (): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
      stdout: '',
      stderr: longOutput,
      exitCode: 1,
    })

    await expect(
      ports.runWork(sandboxExec, 'y', worktreePath, new AbortController().signal),
    ).rejects.toThrow(/pipeline afk-run failed/)

    const logContent = await readFile(logPath(), 'utf8')
    expect(logContent.length).toBeGreaterThan(200)
    expect(logContent).toContain(longOutput.slice(0, 100))
  })

  it('idle-timeout（invokeWithRace 直接 reject，无 res 可读）：仍落盘 onLine 已攒到的部分日志', async () => {
    const { exec } = makeExec()
    const ports = createLifecyclePorts({
      exec,
      hostRepoDir: '/repo',
      image: 'sandcastle:local',
      idleMs: 5000,
      graceMs: 1000,
    })
    const partial = 'partial output before hang'
    const sandboxExec = (
      _cmd: string,
      options?: { onLine?: (line: string) => void },
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
      options?.onLine?.(partial)
      return new Promise(() => {}) // 永不 resolve，靠 idle 超时收口（这条路径上没有 res 可读）
    }

    vi.useFakeTimers()
    const p = ports.runWork(sandboxExec, 'y', worktreePath, new AbortController().signal)
    const assertion = expect(p).rejects.toMatchObject({ _tag: 'AgentIdleTimeoutError' })
    await vi.advanceTimersByTimeAsync(5001)
    await assertion
    vi.useRealTimers()

    const logContent = await readFile(logPath(), 'utf8')
    expect(logContent).toContain(partial)
  })
})
