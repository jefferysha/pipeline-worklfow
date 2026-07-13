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
  // T4：automation_current_phase 的**逐笔**写入序列（限流断言要看历史，不能只看最新值）。
  const phaseWrites: string[] = []
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
    async diffNames() {
      log.push('diffNames')
      return []
    },
    async mergeToBase() {
      log.push('mergeToBase')
    },
    git: { revParse: async () => SHA },
    async setStateField(_name, field, value) {
      log.push(`setStateField:${field}`)
      if (field === 'automation_current_phase') phaseWrites.push(value)
      stateFields[field] = value
    },
    ...over,
  }
  return { ports, log, env: () => sandboxEnv, state: () => stateFields, phaseWrites }
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

  // B9：automation_sandbox/automation_worktree 只是给 dashboard 定位容器/worktree 的字段，写它的
  // setStateField 若瞬态抖动抛错，本可继续的成功 run 会被 catch 判死重来。对齐 phaseWatch/
  // agentExitWatch 既有 best-effort .catch 风格——字段写失败绝不拖垮 run。
  it('B9 · setStateField(automation_sandbox/worktree) 瞬态抛错 → 成功 run 不被判死（best-effort）', async () => {
    const { ports, log } = makePorts({
      async setStateField(_name, field) {
        if (field === 'automation_sandbox' || field === 'automation_worktree') {
          throw new Error('store hiccup')
        }
      },
    })
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true },
      new AbortController().signal,
    )
    expect(out.verifyResult).toBe('pass') // 字段写抖动没把成功 run 判死
    expect(out.buildSha).toBe(SHA)
    expect(log).toContain('mergeToBase') // 全链照常走完（L3 真合并）
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true) // 正常 teardown（非 conflict 保留）
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

/**
 * T4（v5 决策 G）：沙箱日志 [TRANSITION] 行 → automation_current_phase 运行期回写 + 结算清理。
 * fake 沙箱 exec 通过 options.onLine 逐行吐日志（真链路 = docker exec 的 stdout 流），lifecycle
 * 的 runWork exec 包装层负责 tee 给 phaseWatch——runWork 自己的 onLine（race idle 检测）不受影响。
 */
describe('runChangeInSandbox · 沙箱内阶段回写（automation_current_phase）', () => {
  /** 让 fake 沙箱 exec 逐行吐 script；runWork 真调 exec（覆盖默认「不碰 exec」的 fake）。 */
  const streamingOver = (script: string[], runWorkTail?: () => Promise<never>): Partial<LifecyclePorts> => ({
    async createSandbox(opts) {
      return {
        env: opts.env,
        containerName: FAKE_CONTAINER_NAME,
        async exec(_cmd, options) {
          for (const line of script) options?.onLine?.(line)
          return { stdout: '', stderr: '', exitCode: 0 }
        },
        async close() {},
      }
    },
    async runWork(exec) {
      await exec('PIPELINE_AFK=1 pipeline-afk-run x', {})
      if (runWorkTail) await runWorkTail()
      return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
    },
  })

  it('日志含 [TRANSITION] x: a -> b → 写 automation_current_phase=b；同值重复行不重写（限流）；结算清空', async () => {
    const { ports, phaseWrites, state } = makePorts(
      streamingOver([
        '[TRANSITION] x: build -> verify',
        '[TRANSITION] x: build -> verify', // 重复行：不产生第二笔写
        'compile ok',
        '[TRANSITION] x: verify -> ship',
      ]),
    )
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
    // 逐笔：verify → ship → ''（run 完成结算清理）
    expect(phaseWrites).toEqual(['verify', 'ship', ''])
    expect(state().automation_current_phase).toBe('')
  })

  it('其它 change 名的 [TRANSITION] 行忽略；无转换行的 run 全程零写（不产生指纹噪声）', async () => {
    const { ports, phaseWrites } = makePorts(streamingOver(['[TRANSITION] other: build -> verify', 'noise']))
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
    expect(phaseWrites).toEqual([])
  })

  it('run 失败路径同样结算清理（字段不能停留在中间态）', async () => {
    const { ports, phaseWrites } = makePorts(
      streamingOver(['[TRANSITION] x: build -> verify'], async () => {
        throw new Error('transient boom')
      }),
    )
    await expect(
      runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal),
    ).rejects.toThrow('transient boom')
    expect(phaseWrites).toEqual(['verify', ''])
  })

  it('dashboard 取消路径同样结算清理（保留现场但不保留中间态阶段字段）', async () => {
    const { ports, phaseWrites } = makePorts({
      ...streamingOver(['[TRANSITION] z: build -> verify']),
      worktree: {
        async create(_repoDir, branch) {
          return { path: `/wt/${branch}`, branch }
        },
        async remove() {},
        async hasCancelMarker() {
          return true
        },
      },
    })
    await expect(
      runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'z', base: 'main', autoMerge: false }, new AbortController().signal),
    ).rejects.toMatchObject({ _tag: 'CancelledRunError' })
    expect(phaseWrites).toEqual(['verify', ''])
  })
})

/**
 * T4（v5 决议 #12）：loop denylist 真实生效——run 结算时 git diff --name-only 对 denylist glob
 * 匹配，违规判 conflict 保留现场；无 loop 语境（cfg.denylist 空/未传）跳过检查、零 diff 开销。
 */
describe('runChangeInSandbox · denylist 结算检查（决议 #12）', () => {
  it('diff 命中 denylist → 抛 DenylistViolationError、不 merge、保留 worktree、容器仍杀', async () => {
    const { ports, log } = makePorts({
      async diffNames() {
        log.push('diffNames')
        return ['docs/a.md', 'src/ok.ts']
      },
    })
    await expect(
      runChangeInSandbox(
        ports,
        { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, denylist: ['docs/**'] },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      _tag: 'DenylistViolationError',
      preservedWorktreePath: '/wt/sandcastle-pipeline/x',
    })
    expect(log).not.toContain('mergeToBase') // 违规绝不 merge 回主线（即便 L3 autoMerge）
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false) // 保留现场
    expect(log).toContain('sandbox.close') // 容器不泄漏
  })

  it('denylist 非空但 diff 干净 → 正常结算（L3 照 merge、worktree 照清）', async () => {
    const { ports, log } = makePorts({
      async diffNames() {
        log.push('diffNames')
        return ['src/ok.ts']
      },
    })
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, denylist: ['docs/**'] },
      new AbortController().signal,
    )
    expect(out.verifyResult).toBe('pass')
    expect(log).toContain('diffNames')
    expect(log).toContain('mergeToBase')
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true)
  })

  it('无 loop 语境（denylist 未传/空数组）→ 跳过检查（不调 diffNames）', async () => {
    const a = makePorts()
    await runChangeInSandbox(a.ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true }, new AbortController().signal)
    expect(a.log).not.toContain('diffNames')

    const b = makePorts()
    await runChangeInSandbox(
      b.ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, denylist: [] },
      new AbortController().signal,
    )
    expect(b.log).not.toContain('diffNames')
  })

  it('零 commit（no-op run）→ 无产出可查，跳过 diff', async () => {
    const { ports, log } = makePorts({
      async collectCommits() {
        return []
      },
    })
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, denylist: ['docs/**'] },
      new AbortController().signal,
    )
    expect(out.noop).toBe(true)
    expect(log).not.toContain('diffNames')
  })
})

/**
 * 观察项③（决议 #14②）：codex agent 非零退出（认证失效 / codex 自身报错）可见度——沙箱脚本
 * codex 分支把 agent_exit≠0 以 `[AGENT_EXIT] codex <exit>` 标记行回放到流面，lifecycle 的 exec
 * tee 处检出 → 同步落 automation_last_error（固定模板 + exit 码，不含日志正文/凭证值）。run 的
 * 成败判定不变（脚本兜底 commit + 0 退出原样）；scheduler 成功路 writeBackSuccess 不清
 * automation_last_error → 成功 settle 后该消息仍可见，正是「run 仍成功、错误可见」的目标语义。
 */
describe('runChangeInSandbox · codex agent 非零退出可见度（automation_last_error，观察项③）', () => {
  /** fake 沙箱 exec 逐行吐 script（同上 streamingOver 口径）；runWork 走 codex 命令形态。 */
  const codexStreamingOver = (script: string[]): Partial<LifecyclePorts> => ({
    async createSandbox(opts) {
      return {
        env: opts.env,
        containerName: FAKE_CONTAINER_NAME,
        async exec(_cmd, options) {
          for (const line of script) options?.onLine?.(line)
          return { stdout: '', stderr: '', exitCode: 0 }
        },
        async close() {},
      }
    },
    async runWork(exec) {
      await exec('PIPELINE_AFK=1 PIPELINE_RUNNER=codex pipeline-afk-run x', {})
      return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
    },
  })

  it('流面检出 [AGENT_EXIT] codex 96 → 落 automation_last_error（含 exit 码），run 仍成功结算（可见度不改判）', async () => {
    const { ports, state, log } = makePorts(codexStreamingOver(['agent noise', '[AGENT_EXIT] codex 96']))
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'codex' },
      new AbortController().signal,
    )
    expect(out.verifyResult).toBe('pass') // 成败判定不变
    expect(out.noop).toBe(false)
    expect(state().automation_last_error).toContain('codex')
    expect(state().automation_last_error).toContain('exit 96')
    // F-b：结构化成因与 last_error 同落——诚实 tag agent-exit（它只知道 agent 非零退出，不猜凭证）
    expect(state().automation_cause).toBe('agent-exit')
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true) // 正常 teardown 不受影响
  })

  it('重复标记行只写一次（幂等，防日志重复回放行；cause 同口径）', async () => {
    const { ports, log } = makePorts(
      codexStreamingOver(['[AGENT_EXIT] codex 96', '[AGENT_EXIT] codex 96', '[AGENT_EXIT] codex 96']),
    )
    await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'codex' },
      new AbortController().signal,
    )
    expect(log.filter((l) => l === 'setStateField:automation_last_error')).toHaveLength(1)
    expect(log.filter((l) => l === 'setStateField:automation_cause')).toHaveLength(1)
  })

  it('codex P2:观察器在途写在 run 结算前排空——延迟的 cause 写不得晚于 run promise 落定(防倒序覆盖 scheduler 终态成因)', async () => {
    // store 抖动模拟:cause 写慢 30ms(晚于 runWork 完成)。无 finally 排空时 runChangeInSandbox
    // 先结算、延迟写后落地——scheduler applyFailure 的权威成因(verify-fail/conflict)会被倒序覆盖。
    const landed: string[] = []
    const base = codexStreamingOver(['[AGENT_EXIT] codex 96'])
    const { ports, state } = makePorts({
      ...base,
      async setStateField(_name, field, value) {
        if (field === 'automation_cause') await new Promise((r) => setTimeout(r, 30))
        landed.push(`${field}=${value}`)
      },
    })
    await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'codex' },
      new AbortController().signal,
    )
    // run promise 已落定 → 观察器双字段写必须均已落地(settle 排空);后续 scheduler 写严格更晚,权威性成立
    expect(landed.some((l) => l.startsWith('automation_cause=agent-exit'))).toBe(true)
    expect(landed.some((l) => l.startsWith('automation_last_error='))).toBe(true)
    void state
  })

  it('exit=0 标记行不写（脚本层本不输出，宿主侧同样防御）；无标记行的 run 零写', async () => {
    const a = makePorts(codexStreamingOver(['[AGENT_EXIT] codex 0']))
    await runChangeInSandbox(
      a.ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'codex' },
      new AbortController().signal,
    )
    expect(a.log).not.toContain('setStateField:automation_last_error')
    expect(a.log).not.toContain('setStateField:automation_cause')

    const b = makePorts(codexStreamingOver(['just noise', '[TRANSITION] x: build -> verify']))
    await runChangeInSandbox(
      b.ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'codex' },
      new AbortController().signal,
    )
    expect(b.log).not.toContain('setStateField:automation_last_error')
    expect(b.log).not.toContain('setStateField:automation_cause')
  })

  it('消息为固定模板：不含日志正文/凭证值（凭证红线），≤200 字符（scheduler sanitize 截断口径）', async () => {
    const { ports, state } = makePorts(
      codexStreamingOver(['OPENAI_API_KEY=sk-super-secret 认证失败详情', '[AGENT_EXIT] codex 96']),
    )
    await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'codex' },
      new AbortController().signal,
    )
    const msg = state().automation_last_error ?? ''
    expect(msg).not.toBe('')
    expect(msg).not.toContain('sk-super-secret') // 任何日志正文/凭证不进状态字段
    expect(msg.length).toBeLessThanOrEqual(200)
  })

  it('写回失败吞掉（best-effort，同 setStateField 既有 .catch 风格），不拖垮 run', async () => {
    const { ports } = makePorts({
      ...codexStreamingOver(['[AGENT_EXIT] codex 96']),
      async setStateField(_name, field) {
        if (field === 'automation_last_error') throw new Error('disk boom')
      },
    })
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'codex' },
      new AbortController().signal,
    )
    expect(out.verifyResult).toBe('pass')
  })
})

/** v5 T20：cfg.runner 真透传到 runWork（ports.ts 真实现据此在命令构造点分派 codex）。 */
describe('runChangeInSandbox · cfg.runner 透传（v5 T20 双 runner）', () => {
  it('cfg.runner=codex → runWork 第 4 参收到 codex', async () => {
    const seen: (string | undefined)[] = []
    const { ports } = makePorts({
      async runWork(_exec, _name, _signal, runner) {
        seen.push(runner)
        return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
      },
    })
    await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'codex' },
      new AbortController().signal,
    )
    expect(seen).toEqual(['codex'])
  })

  it('未传 cfg.runner → runWork 第 4 参 undefined（缺省 Claude 路径零回归）', async () => {
    const seen: (string | undefined)[] = []
    const { ports } = makePorts({
      async runWork(_exec, _name, _signal, runner) {
        seen.push(runner)
        return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
      },
    })
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
    expect(seen).toEqual([undefined])
  })
})

/**
 * 观察项③ runner 无关性佐证（批 3 R2 · P1-T1 claude 补齐依赖此性质）：createAgentExitWatch 的
 * AGENT_EXIT_LINE_RE = /^\[AGENT_EXIT\] (\S+) (\d+)\s*$/ 按 (\S+) 抓 runner 名——脚本 claude 分支
 * 新发的 `[AGENT_EXIT] claude <exit>` 经既有 exec tee → 同一 watcher 落 automation_last_error，
 * **lifecycle 一行不改**。此测钉住这条「runner 无关」链路不被后续回改破坏（与 codex 侧同款断言）。
 */
describe('runChangeInSandbox · claude agent 非零退出可见度（runner 无关，批 3 R2 · P1-T1）', () => {
  /** fake 沙箱 exec 逐行吐 script；runWork 走 claude 缺省命令形态（不带 PIPELINE_RUNNER）。 */
  const claudeStreamingOver = (script: string[]): Partial<LifecyclePorts> => ({
    async createSandbox(opts) {
      return {
        env: opts.env,
        containerName: FAKE_CONTAINER_NAME,
        async exec(_cmd, options) {
          for (const line of script) options?.onLine?.(line)
          return { stdout: '', stderr: '', exitCode: 0 }
        },
        async close() {},
      }
    },
    async runWork(exec) {
      await exec('PIPELINE_AFK=1 pipeline-afk-run x', {})
      return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
    },
  })

  it('流面检出 [AGENT_EXIT] claude 1 → 既有 watcher 落 automation_last_error（含 claude + exit 1），run 仍成功（可见度不改判）', async () => {
    const { ports, state, log } = makePorts(claudeStreamingOver(['agent noise', '[AGENT_EXIT] claude 1']))
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false },
      new AbortController().signal,
    )
    expect(out.verifyResult).toBe('pass') // 成败判定不变（确定性/真 agent 兜底原样）
    expect(state().automation_last_error).toContain('claude') // watcher 按 (\S+) 回填 runner 名，runner 无关
    expect(state().automation_last_error).toContain('exit 1')
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true) // 正常 teardown 不受影响
  })

  it('claude exit=0 标记行不写（脚本本不输出，宿主侧同款防御）', async () => {
    const { ports, log } = makePorts(claudeStreamingOver(['[AGENT_EXIT] claude 0']))
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
    expect(log).not.toContain('setStateField:automation_last_error')
  })
})
