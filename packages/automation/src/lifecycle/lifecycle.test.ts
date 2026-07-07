import { describe, expect, it } from 'vitest'
import { PIPELINE_AFK_ENV } from '../queue/gate.js'
import { AbortedRunError, CancelledRunError, type LifecyclePorts, runChangeInSandbox } from './lifecycle.js'

const SHA = 'a'.repeat(40)
/** fake 沙箱句柄的容器名（对应真 container.ts::createDockerSandbox 生成的 sandcastle-<random>）。 */
const FAKE_CONTAINER_NAME = 'sandcastle-faketest'

/** 全 fake 面：驱动 change 沙箱生命周期的纯编排（挂队→沙箱→跑→merge-back→teardown）。 */
const makePorts = (over: Partial<LifecyclePorts> = {}) => {
  const log: string[] = []
  let sandboxEnv: Record<string, string> = {}
  // automation_sandbox/automation_worktree 的 fake 落态（真 kernel StateStore 未写入字段前的
  // 默认值语义同为空串——同一断言风格 `.not.toBe('')` 在写回前后都有意义）。
  const stateFields: Record<string, string> = { automation_sandbox: '', automation_worktree: '' }
  const ports: LifecyclePorts = {
    worktree: {
      async create(_repoDir, branch) {
        log.push('wt.create')
        return { path: `/wt/${branch}`, branch }
      },
      async remove(path) {
        log.push(`wt.remove:${path}`)
      },
      // 默认无取消标记（afk-workbench Task 3）；专测覆盖见下方 CancelledRunError 相关 it。
      async hasCancelMarker() {
        return false
      },
    },
    async createSandbox(opts) {
      log.push('sandbox.create')
      sandboxEnv = opts.env
      return {
        env: opts.env,
        containerName: FAKE_CONTAINER_NAME,
        async exec() {
          return { stdout: '', stderr: '', exitCode: 0 }
        },
        async close() {
          log.push('sandbox.close')
        },
      }
    },
    async runWork() {
      log.push('runWork')
      return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
    },
    async collectCommits() {
      log.push('collectCommits')
      return [{ sha: SHA }]
    },
    async mergeToBase() {
      log.push('mergeToBase')
    },
    git: { revParse: async () => SHA },
    async setStateField(_name, field, value) {
      log.push(`setStateField:${field}`)
      stateFields[field] = value
    },
    ...over,
  }
  return { ports, log, env: () => sandboxEnv, state: () => stateFields }
}

describe('runChangeInSandbox（沙箱生命周期纯编排 + 注入面）', () => {
  it('沙箱注入 PIPELINE_AFK=1（headless 放行三门）', async () => {
    const { ports, env } = makePorts()
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true }, new AbortController().signal)
    expect(env()[PIPELINE_AFK_ENV]).toBe('1')
  })

  it('cfg.extraEnv 真透传进沙箱 env（真部署接线：token/代理地址等），不覆盖 PIPELINE_AFK=1', async () => {
    const { ports, env } = makePorts()
    await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, extraEnv: { ANTHROPIC_BASE_URL: 'http://host.docker.internal:9', CLAUDE_CODE_OAUTH_TOKEN: 'tok' } },
      new AbortController().signal,
    )
    expect(env().ANTHROPIC_BASE_URL).toBe('http://host.docker.internal:9')
    expect(env().CLAUDE_CODE_OAUTH_TOKEN).toBe('tok')
    expect(env()[PIPELINE_AFK_ENV]).toBe('1') // extraEnv 不挤掉既有硬护栏 env
  })

  it('容器/worktree 创建成功后，真写回 automation_sandbox / automation_worktree 字段', async () => {
    const { ports, log, state } = makePorts()
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
    expect(state().automation_sandbox).not.toBe('')
    expect(state().automation_sandbox).toBe(FAKE_CONTAINER_NAME)
    expect(state().automation_worktree).not.toBe('')
    expect(state().automation_worktree).toBe('/wt/sandcastle-pipeline/x')
    // 写回时机：sandbox 创建成功之后、runWork 执行之前（不是结算时才补写）。
    expect(log.indexOf('setStateField:automation_sandbox')).toBeGreaterThan(log.indexOf('sandbox.create'))
    expect(log.indexOf('setStateField:automation_worktree')).toBeLessThan(log.indexOf('runWork'))
  })

  it('happy L3（autoMerge）：跑 → 收集 commits → merge-back → barrier → 清 worktree', async () => {
    const { ports, log } = makePorts()
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true },
      new AbortController().signal,
    )
    expect(out.buildSha).toBe(SHA)
    expect(out.verifyResult).toBe('pass')
    expect(out.commits).toEqual([{ sha: SHA }])
    expect(out.noop).toBe(false)
    expect(log).toContain('mergeToBase') // L3 真合并回主线
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true) // teardown
  })

  it('L1 report-only（autoMerge=false）：收集 commits + barrier 但不 merge-back', async () => {
    const { ports, log } = makePorts()
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false },
      new AbortController().signal,
    )
    expect(out.buildSha).toBe(SHA) // 仍派生 build_sha（供 kanban / 人工复核）
    expect(log).not.toContain('mergeToBase') // 关键：不自动合并（安全默认）
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true)
  })

  it('abort：保留 worktree（不 remove）+ 抛 AbortedRunError 带 preservedPath', async () => {
    const controller = new AbortController()
    const { ports, log } = makePorts({
      async runWork() {
        controller.abort(new Error('停止'))
        return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
      },
    })
    await expect(
      runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true }, controller.signal),
    ).rejects.toMatchObject({ _tag: 'AbortedRunError', preservedPath: '/wt/sandcastle-pipeline/x' })
    // DESIGN §7-item4：失败/abort 绝不清沙箱——留现场
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false)
    expect(log).toContain('sandbox.close') // 容器仍杀
  })

  it('cancel 标记存在 + runWork 碰巧仍 resolve（窄竞态：run 抢在 kill 生效前跑完）→ 抛 CancelledRunError 带 preservedPath，保留 worktree（不 remove）+ 容器仍杀（afk-workbench Task 3）', async () => {
    const { ports, log } = makePorts({
      worktree: {
        async create(_repoDir, branch) {
          log.push('wt.create')
          return { path: `/wt/${branch}`, branch }
        },
        async remove(path) {
          log.push(`wt.remove:${path}`)
        },
        async hasCancelMarker() {
          return true
        },
      },
    })
    await expect(
      runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'z', base: 'main', autoMerge: false }, new AbortController().signal),
    ).rejects.toMatchObject({ _tag: 'CancelledRunError', preservedPath: '/wt/sandcastle-pipeline/z' })
    // 同 abort：dashboard 取消也绝不清 worktree——留现场供人工接管，不能"点了取消，worktree 却被清了"。
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false)
    expect(log).toContain('sandbox.close') // 容器仍杀（幂等 close，真实场景这时容器可能已被 docker kill）
  })

  it('cancel 标记存在 + runWork 真实路径抛普通 Error（docker kill 容器后 exec 非零退出，ports.ts 真实现对此直接 throw，从不 resolve 一个"非零退出"的报告回来）→ 仍抛 CancelledRunError 而非原始普通 Error，保留 worktree（afk-workbench Task 3：这是 docker kill 后的主路径，不是竞态旁支——必须覆盖 catch 分支，不能只查 runWork resolve 之后那一处）', async () => {
    const { ports, log } = makePorts({
      async runWork() {
        log.push('runWork')
        throw new Error('pipeline afk-run failed (exit 137): container killed')
      },
      worktree: {
        async create(_repoDir, branch) {
          log.push('wt.create')
          return { path: `/wt/${branch}`, branch }
        },
        async remove(path) {
          log.push(`wt.remove:${path}`)
        },
        async hasCancelMarker() {
          return true
        },
      },
    })
    await expect(
      runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'z', base: 'main', autoMerge: false }, new AbortController().signal),
    ).rejects.toMatchObject({ _tag: 'CancelledRunError', preservedPath: '/wt/sandcastle-pipeline/z' })
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false)
    expect(log).toContain('sandbox.close')
  })

  it('普通失败（非 abort、无 cancel 标记）：hasCancelMarker=false 时原始错误原样透传，不误转 CancelledRunError', async () => {
    const { ports, log } = makePorts({
      async runWork() {
        throw new Error('transient boom')
      },
    })
    await expect(
      runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal),
    ).rejects.toThrow('transient boom')
    // 非 conflict：worktree 照清（同 lifecycle-preserve.test.ts 既有断言风格），确认新增的取消探测
    // 没有让"普通失败"也被误保留现场。
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true)
  })

  it('空 commits → noop=true（诚实化，即便 verify pass）', async () => {
    const { ports } = makePorts({
      async collectCommits() {
        return []
      },
    })
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true },
      new AbortController().signal,
    )
    expect(out.buildSha).toBeUndefined()
    expect(out.noop).toBe(true)
  })
})

describe('CancelledRunError', () => {
  it('携带 preservedPath；_tag 供 classify 路由到 conflict（afk-workbench Task 3）', () => {
    const e = new CancelledRunError('cancel requested via dashboard', '/wt/z')
    expect(e._tag).toBe('CancelledRunError')
    expect(e.preservedPath).toBe('/wt/z')
    expect(e.message).toBe('cancel requested via dashboard')
  })
})

describe('AbortedRunError', () => {
  it('携带 unwrapped reason + preservedPath', () => {
    const e = new AbortedRunError('停止', '/wt/x')
    expect(e._tag).toBe('AbortedRunError')
    expect(e.preservedPath).toBe('/wt/x')
    expect(e.message).toBe('停止')
  })
})
