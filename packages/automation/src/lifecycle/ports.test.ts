import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import { runChangeInSandbox, type LifecyclePorts } from './lifecycle.js'
import { SyncError } from './mergeback.js'
import { createLifecyclePorts } from './ports.js'
import { CANCEL_MARKER_FILE } from './worktree.js'

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
    expect(typeof ports.worktree.hasCancelMarker).toBe('function') // afk-workbench Task 3
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
 * afk-workbench Task 2 fix（teardown 现场缺口修复，见 `.superpowers/sdd/task-2-report.md`
 * "Fix: log survives teardown"）：Task 2 原实现把结算日志落在 worktree 内 `.sandcastle-run.log`
 * ——但 Task 2 自己的实测发现：`runChangeInSandbox` 的 finally 块对**成功**和**普通（非 tagged）
 * 失败**这两类最常见结局都会真删 worktree（`ports.worktree.remove` → 真 `git worktree remove
 * --force`），日志刚写完就随 worktree 一起被删，只有 abort/conflict 保留现场那一类才读得到
 * ——这正是"测试全绿但真实路径从没正确工作过"的反面典型（GOAL.md 清单 C9 明令禁止）。
 *
 * 修复：落盘位置改到 host 侧 `openspec/changes/<name>/.sandcastle-run.log`——这个目录只随 change
 * 本身存在（`.pipeline.yaml`/`.pipeline-history.jsonl` 的落地目录，从不随某次 run 的 worktree 一起
 * teardown），hostRepoDir 已经是 createLifecyclePorts 的工厂级依赖（闭包捕获），不需要额外注入。
 *
 * 直接单测 `ports.runWork`（不经 runChangeInSandbox 全链编排）：不需要真 git worktree——`runWork`
 * 的真实现从不碰 deps.exec，只吃调用方逐次传入的 sandboxExec 首参，和 createSandbox/collectCommits
 * 等其它端口完全独立。三条结算路径都要覆盖，因为 invokeWithRace 有两种质地不同的"结算"：
 *   ① resolve（含 exitCode!==0 的"沙箱内命令真失败"）——这时有完整 res.stdout/res.stderr 可读。
 *   ② reject（idle-timeout / abort / sandboxExec 自己抛错）——invokeWithRace 直接 reject，
 *      根本没有 res 可读；若只在 resolve 之后才读 res.stdout 落盘，这条路径的日志会整个丢失。
 */
describe('createLifecyclePorts().runWork · 结算落盘完整日志到 host 侧 openspec/changes/<name>/（afk-workbench Task 2 teardown 修复）', () => {
  let hostRepoDir: string

  beforeEach(async () => {
    hostRepoDir = await mkdtemp(join(tmpdir(), 'afk-runwork-log-'))
  })
  afterEach(async () => {
    await rm(hostRepoDir, { recursive: true, force: true })
    vi.useRealTimers()
  })

  const logPath = (name: string): string => join(hostRepoDir, 'openspec', 'changes', name, '.sandcastle-run.log')

  it('成功结算：host 侧落盘完整 stdout（超过 200 字符截断阈值，未被截）', async () => {
    const { exec } = makeExec()
    const ports = createLifecyclePorts({ exec, hostRepoDir, image: 'sandcastle:local' })
    const longOutput = 'x'.repeat(5000) // 超过 200 字符截断阈值，验证没有被截
    const sandboxExec = async (): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
      stdout: `${longOutput}\n<output>{"verify_result":"pass","build_sha":"${SHA}","phase_event":"verify-pass"}</output>\n`,
      stderr: '',
      exitCode: 0,
    })

    await ports.runWork(sandboxExec, 'y', new AbortController().signal)

    const logContent = await readFile(logPath('y'), 'utf8')
    expect(logContent.length).toBeGreaterThan(200)
    expect(logContent).toContain(longOutput.slice(0, 100))
  })

  it('失败结算（沙箱非零退出）：host 侧仍落盘完整 stderr（不是抛错信息里那 200 字符截断）', async () => {
    const { exec } = makeExec()
    const ports = createLifecyclePorts({ exec, hostRepoDir, image: 'sandcastle:local' })
    const longOutput = 'x'.repeat(5000)
    const sandboxExec = async (): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
      stdout: '',
      stderr: longOutput,
      exitCode: 1,
    })

    await expect(
      ports.runWork(sandboxExec, 'y', new AbortController().signal),
    ).rejects.toThrow(/pipeline afk-run failed/)

    const logContent = await readFile(logPath('y'), 'utf8')
    expect(logContent.length).toBeGreaterThan(200)
    expect(logContent).toContain(longOutput.slice(0, 100))
  })

  it('idle-timeout（invokeWithRace 直接 reject，无 res 可读）：host 侧仍落盘 onLine 已攒到的部分日志', async () => {
    const { exec } = makeExec()
    const ports = createLifecyclePorts({
      exec,
      hostRepoDir,
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
    const p = ports.runWork(sandboxExec, 'y', new AbortController().signal)
    const assertion = expect(p).rejects.toMatchObject({ _tag: 'AgentIdleTimeoutError' })
    await vi.advanceTimersByTimeAsync(5001)
    await assertion
    vi.useRealTimers()

    const logContent = await readFile(logPath('y'), 'utf8')
    expect(logContent).toContain(partial)
  })
})

/**
 * 只证明 `ports.runWork` 自己落对了地方还不够——本次要修的架构缺口是"`runChangeInSandbox` 的
 * finally 块会不会在日志写完后，把日志所在的目录整个删掉"。这里把真 `createLifecyclePorts().
 * runWork`（真 fs 写日志）接进真 `runChangeInSandbox` 编排一起跑，worktree 用一个真实存在、真被
 * 删除的临时目录模拟（不需要真 git——teardown 删不删目录是 `runChangeInSandbox` 自己的决定，不是
 * git worktree 特有行为；用真删除而非只打日志的假 remove，才能诚实证明"即使 worktree 目录真的从
 * 磁盘消失，日志在别处依然读得到"，而不是伪造一个从不真删除的假 remove 让测试形同虚设）。
 * collectCommits/git 复用上面 `makeExec()`（返回定长 'deadbeef' 的 fake exec，顶部
 * `describe('createLifecyclePorts', ...)` 已验证过这个组合能正确装配出可用的 collectCommits/
 * git.revParse，不需要真 git 仓库）。
 *
 * 三个结局都要跑：成功、普通失败（都会真删 worktree——此前日志会跟着消失）、conflict 保留现场
 * （本来就读得到，确认这次改动没有破坏它）。
 */
describe('runChangeInSandbox × createLifecyclePorts 全链：日志跨三类结算结局都在 host 侧存活', () => {
  let hostRepoDir: string

  beforeEach(async () => {
    hostRepoDir = await mkdtemp(join(tmpdir(), 'afk-teardown-'))
  })
  afterEach(async () => {
    await rm(hostRepoDir, { recursive: true, force: true })
  })

  const durableLogPath = (name: string): string =>
    join(hostRepoDir, 'openspec', 'changes', name, '.sandcastle-run.log')

  /** worktree 的最小真实模拟：真建真删一个临时目录（见上方大注释——真删除而非打日志假动作）。 */
  const realDeleteWorktreePort = (): { port: LifecyclePorts['worktree']; pathFor: (branch: string) => string } => {
    const pathFor = (branch: string): string => join(hostRepoDir, '.sandcastle-worktrees', branch.replace(/\//g, '-'))
    return {
      pathFor,
      port: {
        async create(_repoDir, branch) {
          const path = pathFor(branch)
          await mkdir(path, { recursive: true })
          return { path, branch }
        },
        async remove(path) {
          await rm(path, { recursive: true, force: true })
        },
        // 真磁盘探测（同 create/remove 一样真实，不是无差别 stub——afk-workbench Task 3）。
        async hasCancelMarker(path) {
          return access(join(path, CANCEL_MARKER_FILE)).then(
            () => true,
            () => false,
          )
        },
      },
    }
  }

  const fakeSandboxWith = (
    sandboxExec: (
      cmd: string,
      options?: { onLine?: (line: string) => void },
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>,
  ): Pick<LifecyclePorts, 'createSandbox'> => ({
    async createSandbox(opts) {
      return {
        env: opts.env,
        containerName: 'sandcastle-teardowntest',
        exec: sandboxExec,
        async close() {},
      }
    },
  })

  it('成功结算：worktree 真被 teardown 删掉后，日志仍可从 host 侧路径读到（此前会随 worktree 一起消失）', async () => {
    const { exec } = makeExec()
    const { port: worktree, pathFor } = realDeleteWorktreePort()
    const longOutput = 'y'.repeat(5000)
    const ports: LifecyclePorts = {
      ...createLifecyclePorts({ exec, hostRepoDir, image: 'sandcastle:local' }),
      worktree,
      ...fakeSandboxWith(async () => ({
        stdout: `${longOutput}\n<output>{"verify_result":"pass","build_sha":"deadbeef","phase_event":"verify-pass"}</output>\n`,
        stderr: '',
        exitCode: 0,
      })),
    }

    await runChangeInSandbox(
      ports,
      { hostRepoDir, name: 'succ', base: 'main', autoMerge: false },
      new AbortController().signal,
    )

    // teardown 真发生：worktree 目录真的从磁盘消失（不是编排层跳过了它——证明"日志能读到"不是因为
    // 偷懒没删 worktree）。
    await expect(access(pathFor('sandcastle-pipeline/succ'))).rejects.toThrow()

    // 日志在 host 侧路径读得到，未被截断
    const logContent = await readFile(durableLogPath('succ'), 'utf8')
    expect(logContent.length).toBeGreaterThan(200)
    expect(logContent).toContain(longOutput.slice(0, 100))
  })

  it('普通失败（非 tagged 错误，走 retry 分类）：worktree 仍被清，但日志仍在 host 侧路径读得到', async () => {
    const { exec } = makeExec()
    const { port: worktree, pathFor } = realDeleteWorktreePort()
    const longStderr = 'z'.repeat(5000)
    const ports: LifecyclePorts = {
      ...createLifecyclePorts({ exec, hostRepoDir, image: 'sandcastle:local' }),
      worktree,
      ...fakeSandboxWith(async () => ({ stdout: '', stderr: longStderr, exitCode: 1 })),
    }

    await expect(
      runChangeInSandbox(
        ports,
        { hostRepoDir, name: 'fail', base: 'main', autoMerge: false },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/pipeline afk-run failed/)

    // 普通（非 conflict）失败：worktree 照清（下轮重建，不误留现场——同 lifecycle-preserve.test.ts
    // 既有断言）。
    await expect(access(pathFor('sandcastle-pipeline/fail'))).rejects.toThrow()

    const logContent = await readFile(durableLogPath('fail'), 'utf8')
    expect(logContent.length).toBeGreaterThan(200)
    expect(logContent).toContain(longStderr.slice(0, 100))
  })

  it('conflict 类保留现场（如 SyncError）：worktree 不清——这类此前就读得到，确认没被这次改动破坏', async () => {
    const { exec } = makeExec()
    const { port: worktree, pathFor } = realDeleteWorktreePort()
    const ports: LifecyclePorts = {
      ...createLifecyclePorts({ exec, hostRepoDir, image: 'sandcastle:local' }),
      worktree,
      ...fakeSandboxWith(async () => ({
        stdout: `<output>{"verify_result":"pass","build_sha":"deadbeef","phase_event":"verify-pass"}</output>\n`,
        stderr: '',
        exitCode: 0,
      })),
      async mergeToBase() {
        throw new SyncError('merge conflict', pathFor('sandcastle-pipeline/conflict'))
      },
    }

    await expect(
      runChangeInSandbox(
        ports,
        { hostRepoDir, name: 'conflict', base: 'main', autoMerge: true },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(SyncError)

    // conflict 保留现场：worktree 目录仍在磁盘上（未被 teardown 删除）——DESIGN §7-item4「失败/
    // 冲突绝不清沙箱」，本次改动不能破坏这个既有行为。
    await expect(access(pathFor('sandcastle-pipeline/conflict'))).resolves.toBeUndefined()

    // 日志同样在 host 侧读得到（这一类此前就"恰好能读到"，改动不能破坏它）。
    const logContent = await readFile(durableLogPath('conflict'), 'utf8')
    expect(logContent.length).toBeGreaterThan(0)
  })
})
