import { describe, expect, it } from 'vitest'
import {
  compileAutomationPolicySnapshot, encodeLedgerRecord, validateVerificationResult,
  type LoopEntry, type VerificationResult,
} from '@tenon/kernel'
import { markLoopPrepared, markNonLoopPrepared, type PreparedSkillBundle } from '../admission/execution-context.js'
import { TENON_AFK_ENV } from '../queue/gate.js'
import { classifyFailure } from '../scheduler/classify.js'
import {
  createDefaultVerifierPort, DEFAULT_VERIFIER_ISSUER_IDENTITY, evaluateVerificationGate, type VerifierPort,
} from '../verifier/verifier.js'
import {
  AbortedRunError, BaseAdvancedError, CancelledRunError, TENON_AUTOMATION_POLICY_ENV,
  TENON_ATTEMPT_CONTEXT_B64_ENV, TENON_WORKFLOW_STEP_PROMPT_B64_ENV, SKILL_BUNDLE_CONTAINER_DIR, type LifecyclePorts, runChangeInSandbox,
} from './lifecycle.js'
import { SyncError } from './mergeback.js'

const SHA = 'a'.repeat(40)
const constrainedPolicy = () => compileAutomationPolicySnapshot({
  id: 'lp', name: 'Loop', kind: 'continuous', goal: 'Only change source', cadence: 'manual', risk: 'low',
  runner: 'codex', change_prefix: 'x', phases: [], human_gates: [], state: 'iteration', design_doc: 'GOAL.md',
  status: 'active', budget: { max_runs_per_day: 2, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: [],
  autonomy_level: 'L3', allowlist: ['src/**'], denylist: ['src/secrets/**'], skill_bundle_id: '_all',
} satisfies LoopEntry, { capturedAt: '2026-07-19T00:00:00.000Z' })

const policyContext = () => markNonLoopPrepared({
  attempt_id: 'att-policy', reservation_id: 'res-policy', loop_id: 'lp', change: 'x', level: 'L1', runner: 'codex',
  admitted_at: '2026-07-19T00:00:00.000Z', reservation: { runs: 1, tokens: 1, token_basis: 'risk-default' },
  policy_epoch: 'epoch', skill_bundle_id: null, automation_policy: constrainedPolicy(),
})
/** fake 沙箱句柄的容器名（对应真 container.ts::createDockerSandbox 生成的 sandcastle-<random>）。 */
const FAKE_CONTAINER_NAME = 'sandcastle-faketest'

/** H7 verifier Phase 2：默认 fake verifier（trusted passed，SHA 对齐上面的 report.build_sha 常量）
 *  ——本文件其余测试全不关心 verifier/verification，只关心 mergeToBase 是否被调（不受本字段影响，
 *  见 lifecycle.ts 设计裁决：merge 判断块本身不消费 verification，那是 scheduler 的消费点）。专测
 *  verifier 行为的用例通过 `over.verifier` 覆盖本默认值。 */
const fakeVerifier = (over: Partial<VerificationResult> = {}): VerifierPort => ({
  async verify(input) {
    return {
      schema_version: 1,
      verification_id: 'ver-fake',
      subject: {
        workflow_run_id: input.workflowRunId, attempt_id: input.context.attempt_id, change: input.context.change,
        revision: { kind: 'named-branch-head', sha: input.revisionSha },
      },
      binding: input.workflowBinding,
      verdict: 'passed',
      evidence: [{ kind: 'command-result', command_id: 'fake', exit_code: 0 }],
      issuer: { kind: 'host-verifier', verifier: 'fake-verifier', version: '1', trusted: true },
      evaluated_at: '2026-07-18T00:00:00.000Z',
      ...over,
    }
  },
})

/** 全 fake 面：驱动 change 沙箱生命周期的纯编排（挂队→沙箱→跑→merge-back→teardown）。 */
const makePorts = (over: Partial<LifecyclePorts> = {}) => {
  const log: string[] = []
  let sandboxEnv: Record<string, string> = {}
  // H10 §4/§8任务6：createSandbox 收到的 skillBundle 透传值（undefined = 本次未传，回归断言用）。
  let sandboxSkillBundle: PreparedSkillBundle | undefined
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
      sandboxSkillBundle = opts.skillBundle
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
    async mergeToBase(input) {
      log.push('mergeToBase')
      const receipt = { landed: true as const, hostSynced: true, mergedCommit: SHA, baseBefore: SHA, branchTip: SHA }
      await input.onIntent?.({ baseRef: 'refs/heads/main', baseBefore: SHA, branchRef: 'refs/heads/sandcastle-pipeline/x', branchTip: SHA, mergedCommit: SHA })
      await input.onLanded?.(receipt)
      return receipt
    },
    git: { revParse: async () => SHA },
    async setStateField(_name, field, value) {
      log.push(`setStateField:${field}`)
      if (field === 'automation_current_phase') phaseWrites.push(value)
      stateFields[field] = value
    },
    verifierExpectedIssuerIdentity: { kind: 'host-verifier', verifier: 'fake-verifier', version: '1' },
    verifier: fakeVerifier(),
    ...over,
  }
  return { ports, log, env: () => sandboxEnv, state: () => stateFields, phaseWrites, skillBundleSeen: () => sandboxSkillBundle }
}

describe('runChangeInSandbox（沙箱生命周期纯编排 + 注入面）', () => {
  it('H6：runWork 返回 provider usage 后先 durable journal，再 collect/verifier/merge', async () => {
    const usage = {
      provider: 'openai-codex' as const, request_id: 'thread-lifecycle',
      tokens: { input: 10, cached_input: 2, output: 4, reasoning: 1, total: 14 },
    }
    const { ports, log } = makePorts({
      async runWork() {
        log.push('runWork')
        return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass', provider_usage: usage }
      },
    })
    await runChangeInSandbox(ports, {
      hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false,
      context: policyContext(),
      usageJournal: {
        async recordProviderUsage(input) {
          expect(input.context.attempt_id).toBe('att-policy')
          expect(input.usage).toEqual(usage)
          log.push('usageJournal')
        },
      },
    }, new AbortController().signal)
    expect(log.indexOf('runWork')).toBeLessThan(log.indexOf('usageJournal'))
    expect(log.indexOf('usageJournal')).toBeLessThan(log.indexOf('collectCommits'))
  })

  it('H6：报告有 provider usage 但调用方未接 durable journal → fail-closed', async () => {
    const { ports } = makePorts({
      async runWork() {
        return {
          verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass',
          provider_usage: { provider: 'openai-codex', tokens: { input: 1, cached_input: 0, output: 1, reasoning: 0, total: 2 } },
        }
      },
    })
    await expect(runChangeInSandbox(ports, {
      hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false,
    }, new AbortController().signal)).rejects.toThrow(/usage journal/i)
  })

  it('H5：AutomationPolicy 以不可被 extraEnv 覆盖的 base64url 元数据注入 runner wrapper', async () => {
    const { ports, env } = makePorts()
    await runChangeInSandbox(ports, {
      hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, context: policyContext(),
      extraEnv: { [TENON_AUTOMATION_POLICY_ENV]: 'attacker' },
    }, new AbortController().signal)
    expect(JSON.parse(Buffer.from(env()[TENON_AUTOMATION_POLICY_ENV]!, 'base64url').toString('utf8')))
      .toEqual(constrainedPolicy())
  })

  it('H2：durable attempt context 以不可覆盖的 base64url JSON 注入 runner wrapper', async () => {
    const context = markNonLoopPrepared({
      attempt_id: 'att-h2', reservation_id: 'res-h2', loop_id: 'lp', change: 'x', level: 'L1', runner: 'codex',
      admitted_at: '2026-07-19T00:00:00.000Z', reservation: { runs: 1, tokens: 1, token_basis: 'risk-default' },
      policy_epoch: 'epoch', skill_bundle_id: null,
      attempt_context: {
        source_run_record_ids: ['run-1'], omitted_attempt_ids: [], rendered: '# Attempts: lp/x\n- old failed: compile',
        stagnation: { stagnant: true, fingerprint: 'a'.repeat(64), repeated_attempt_ids: ['old-1', 'old-2', 'old-3'] },
      },
    })
    const { ports, env } = makePorts()
    await runChangeInSandbox(ports, {
      hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, context,
      extraEnv: { [TENON_ATTEMPT_CONTEXT_B64_ENV]: 'attacker' },
    }, new AbortController().signal)
    expect(JSON.parse(Buffer.from(env()[TENON_ATTEMPT_CONTEXT_B64_ENV]!, 'base64url').toString('utf8')))
      .toEqual(context.attempt_context)
  })

  it('沙箱注入 TENON_AFK=1（headless 放行三门）', async () => {
    const { ports, env } = makePorts()
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
    expect(env()[TENON_AFK_ENV]).toBe('1')
  })

  it('Codex-first 合成入口：普通/本 runner env 透传，对侧 Claude 凭证在 lifecycle 边界剔除', async () => {
    const { ports, env } = makePorts()
    await runChangeInSandbox(
      ports,
      {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false,
        extraEnv: {
          ANTHROPIC_BASE_URL: 'http://host.docker.internal:9',
          OPENAI_API_KEY: 'sk-codex', CODEX_HOME: '/home/u/.codex',
          CLAUDE_CODE_OAUTH_TOKEN: 'must-not-leak',
        },
      },
      new AbortController().signal,
    )
    expect(env().ANTHROPIC_BASE_URL).toBe('http://host.docker.internal:9')
    expect(env().OPENAI_API_KEY).toBe('sk-codex')
    expect(env().CODEX_HOME).toBe('/home/u/.codex')
    expect(env().CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    expect(env()[TENON_AFK_ENV]).toBe('1') // extraEnv 不挤掉既有硬护栏 env
  })

  it('显式 Claude 入口：Claude token 透传，Codex key/home 在 lifecycle 边界剔除', async () => {
    const { ports, env } = makePorts()
    await runChangeInSandbox(
      ports,
      {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'claude-code',
        extraEnv: {
          ANTHROPIC_BASE_URL: 'http://host.docker.internal:9',
          CLAUDE_CODE_OAUTH_TOKEN: 'tok-claude', OPENAI_API_KEY: 'must-not-leak',
          CODEX_HOME: '/tmp/must-not-mount',
        },
      },
      new AbortController().signal,
    )
    expect(env().ANTHROPIC_BASE_URL).toBe('http://host.docker.internal:9')
    expect(env().CLAUDE_CODE_OAUTH_TOKEN).toBe('tok-claude')
    expect(env().OPENAI_API_KEY).toBeUndefined()
    expect(env().CODEX_HOME).toBeUndefined()
  })

  it('未知 runner 在 worktree/createSandbox 之前 fail-loud，零宿主与 Docker 副作用', async () => {
    const { ports, log } = makePorts()
    await expect(runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, runner: 'cron' },
      new AbortController().signal,
    )).rejects.toThrow(/runner.*cron.*claude-code.*codex/i)
    expect(log).not.toContain('wt.create')
    expect(log).not.toContain('sandbox.create')
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
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] },
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
      runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, controller.signal),
    ).rejects.toMatchObject({ _tag: 'AbortedRunError', preservedPath: '/wt/sandcastle-pipeline/x' })
    // DESIGN §7-item4：失败/abort 绝不清沙箱——留现场
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false)
    expect(log).toContain('sandbox.close') // 容器仍杀
  })

  it('H14 r9：敌意 abort reason 的 message/toPrimitive/toString 全抛 → 仍构造可信 AbortedRunError，不遮蔽取消语义', async () => {
    const reason = new Proxy({}, {
      get(_target, key) {
        if (key === 'message' || key === Symbol.toPrimitive || key === 'toString') {
          throw new Error('hostile abort reason getter')
        }
        return undefined
      },
      getPrototypeOf() {
        throw new Error('hostile abort reason prototype')
      },
    })
    const controller = new AbortController()
    const { ports, log } = makePorts({
      async runWork() {
        controller.abort(reason)
        return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
      },
    })

    let observed: unknown
    try {
      await runChangeInSandbox(
        ports,
        { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] },
        controller.signal,
      )
    } catch (error) {
      observed = error
    }

    expect(observed).toMatchObject({
      _tag: 'AbortedRunError', preservedPath: '/wt/sandcastle-pipeline/x', message: 'unreadable error value',
    })
    expect(classifyFailure(observed)).toMatchObject({ kind: 'conflict', cause: 'cancelled' })
    expect(log.some((line) => line.startsWith('wt.remove'))).toBe(false)
    expect(log).toContain('sandbox.close')
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
        throw new Error('tenon afk-run failed (exit 137): container killed')
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

  it('业务流程成功但 sandbox.close 失败 → 整个 run fail-loud，保留 worktree，绝不返回伪成功', async () => {
    const cleanupError = Object.assign(new Error('docker rm failed; container still exists'), {
      _tag: 'ContainerCleanupError' as const,
      containerName: FAKE_CONTAINER_NAME,
    })
    const { ports, log } = makePorts({
      async createSandbox(opts) {
        return {
          env: opts.env,
          containerName: FAKE_CONTAINER_NAME,
          async exec() { return { stdout: '', stderr: '', exitCode: 0 } },
          async close() { throw cleanupError },
        }
      },
    })

    let observed: unknown
    try {
      await runChangeInSandbox(
        ports,
        { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false },
        new AbortController().signal,
      )
    } catch (error) {
      observed = error
    }
    expect(observed).toMatchObject({
      _tag: 'ContainerCleanupError',
      cleanupError,
      cause: cleanupError,
      preservedWorktreePath: '/wt/sandcastle-pipeline/x',
    })
    expect(Object.isFrozen(observed)).toBe(true)
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false)
  })

  it('runWork 主错误后 sandbox.close 又失败 → 统一封装可信 RunAndCleanupError，保留主错误/cause，worktree 不删', async () => {
    const primaryError = new Error('agent execution failed')
    const cleanupError = Object.assign(new Error('docker rm failed; container still exists'), {
      _tag: 'ContainerCleanupError' as const,
      containerName: FAKE_CONTAINER_NAME,
    })
    const { ports, log } = makePorts({
      async createSandbox(opts) {
        return {
          env: opts.env,
          containerName: FAKE_CONTAINER_NAME,
          async exec() { return { stdout: '', stderr: '', exitCode: 0 } },
          async close() { throw cleanupError },
        }
      },
      async runWork() { throw primaryError },
    })

    let observed: unknown
    try {
      await runChangeInSandbox(
        ports,
        { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false },
        new AbortController().signal,
      )
    } catch (error) {
      observed = error
    }
    expect(observed).not.toBe(primaryError)
    expect(observed).toMatchObject({
      _tag: 'RunAndCleanupError',
      primaryError,
      cause: primaryError,
      cleanupError: { _tag: 'ContainerCleanupError', cleanupError },
    })
    expect(Object.isFrozen(observed)).toBe(true)
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false)
  })

  for (const variant of [
    {
      name: '主错误已有 cleanupError:undefined（可配置）',
      makePrimary() {
        return Object.assign(new Error('agent failed before cleanup'), { cleanupError: undefined })
      },
    },
    {
      name: '主错误已有不可写/不可配置 cleanupError',
      makePrimary() {
        const error = new Error('agent failed before cleanup')
        Object.defineProperty(error, 'cleanupError', { value: undefined, writable: false, configurable: false })
        return error
      },
    },
    {
      name: '主错误已有旧 cleanupError（可写/可配置）',
      makePrimary() {
        const error = new Error('agent failed before cleanup')
        Object.defineProperty(error, 'cleanupError', {
          value: { _tag: 'ContainerCleanupError', message: 'stale cleanup diagnostic' },
          writable: true,
          configurable: true,
        })
        return error
      },
    },
  ]) {
    it(`${variant.name} → 不信任主错误属性，统一保存本次 cleanup error/cause，分类仍 fail-closed`, async () => {
      const primaryError = variant.makePrimary()
      const cleanupError = Object.assign(new Error('current docker rm failed'), {
        _tag: 'ContainerCleanupError' as const,
        containerName: FAKE_CONTAINER_NAME,
      })
      const { ports, log } = makePorts({
        async createSandbox(opts) {
          return {
            env: opts.env,
            containerName: FAKE_CONTAINER_NAME,
            async exec() { return { stdout: '', stderr: '', exitCode: 0 } },
            async close() { throw cleanupError },
          }
        },
        async runWork() { throw primaryError },
      })

      let observed: unknown
      try {
        await runChangeInSandbox(
          ports,
          { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false },
          new AbortController().signal,
        )
      } catch (error) {
        observed = error
      }

      expect(observed).not.toBe(primaryError)
      const wrapped = observed as {
        _tag?: string; primaryError?: unknown; cause?: unknown
        cleanupError?: { _tag?: string; cleanupError?: unknown }
      }
      expect(wrapped._tag).toBe('RunAndCleanupError')
      expect(wrapped.primaryError).toBe(primaryError)
      expect(wrapped.cause).toBe(primaryError)
      expect(wrapped.cleanupError?._tag).toBe('ContainerCleanupError')
      expect(wrapped.cleanupError?.cleanupError).toBe(cleanupError)
      expect(Object.isFrozen(observed)).toBe(true)
      expect(classifyFailure(observed)).toMatchObject({ kind: 'conflict', cause: 'container-cleanup' })
      expect(log.some((line) => line.startsWith('wt.remove'))).toBe(false)
    })
  }

  it('合法 Proxy 虚报 cleanup descriptor → 仍统一抛可信不可变 RunAndCleanupError，分类为 container-cleanup', async () => {
    const cleanupError = Object.assign(new Error('current docker rm failed'), {
      _tag: 'ContainerCleanupError' as const,
      containerName: FAKE_CONTAINER_NAME,
    })
    const primaryTarget = new Error('agent failed before cleanup')
    const worktreePath = '/wt/sandcastle-pipeline/x'
    const primaryError = new Proxy(primaryTarget, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'cleanupError') {
          return { value: cleanupError, writable: false, enumerable: true, configurable: true }
        }
        if (key === 'preservedWorktreePath') {
          return { value: worktreePath, writable: false, enumerable: true, configurable: true }
        }
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    const { ports, log } = makePorts({
      async createSandbox(opts) {
        return {
          env: opts.env,
          containerName: FAKE_CONTAINER_NAME,
          async exec() { return { stdout: '', stderr: '', exitCode: 0 } },
          async close() { throw cleanupError },
        }
      },
      async runWork() { throw primaryError },
    })

    let observed: unknown
    try {
      await runChangeInSandbox(
        ports,
        { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false },
        new AbortController().signal,
      )
    } catch (error) {
      observed = error
    }

    expect(observed).not.toBe(primaryError)
    expect(observed).toMatchObject({
      _tag: 'RunAndCleanupError',
      primaryError,
      cause: primaryError,
      preservedWorktreePath: worktreePath,
      cleanupError: {
        _tag: 'ContainerCleanupError',
        cleanupError,
        preservedWorktreePath: worktreePath,
      },
    })
    expect(Object.isFrozen(observed)).toBe(true)
    expect(classifyFailure(observed)).toMatchObject({ kind: 'conflict', cause: 'container-cleanup' })
    expect(log.some((line) => line.startsWith('wt.remove'))).toBe(false)
  })

  for (const variant of [
    {
      name: 'getPrototypeOf trap 抛错',
      makePrimary: () => new Proxy({}, {
        getPrototypeOf() { throw new Error('hostile getPrototypeOf') },
      }),
    },
    {
      name: '_tag get trap 抛错',
      makePrimary: () => new Proxy(new Error('agent failed'), {
        get(target, key, receiver) {
          if (key === '_tag') throw new Error('hostile _tag getter')
          return Reflect.get(target, key, receiver)
        },
      }),
    },
    {
      name: 'Symbol.toPrimitive/toString trap 抛错',
      makePrimary: () => new Proxy({}, {
        get(target, key, receiver) {
          if (key === Symbol.toPrimitive || key === 'toString') throw new Error('hostile coercion')
          return Reflect.get(target, key, receiver)
        },
      }),
    },
  ]) {
    it(`敌意主错误 Proxy 的 ${variant.name} + cleanup 失败 → 仍保存原 primary/cause 并统一封装`, async () => {
      const primaryError = variant.makePrimary()
      const cleanupError = Object.assign(new Error('docker rm failed'), {
        _tag: 'ContainerCleanupError' as const,
        containerName: FAKE_CONTAINER_NAME,
      })
      const { ports, log } = makePorts({
        async createSandbox(opts) {
          return {
            env: opts.env,
            containerName: FAKE_CONTAINER_NAME,
            async exec() { return { stdout: '', stderr: '', exitCode: 0 } },
            async close() { throw cleanupError },
          }
        },
        async runWork() { throw primaryError },
      })

      let observed: unknown
      try {
        await runChangeInSandbox(
          ports,
          { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false },
          new AbortController().signal,
        )
      } catch (error) {
        observed = error
      }

      const wrapped = observed as {
        _tag?: string; primaryError?: unknown; cause?: unknown
        cleanupError?: { _tag?: string; cleanupError?: unknown }
      }
      expect(wrapped._tag).toBe('RunAndCleanupError')
      expect(wrapped.primaryError).toBe(primaryError)
      expect(wrapped.cause).toBe(primaryError)
      expect(wrapped.cleanupError?._tag).toBe('ContainerCleanupError')
      expect(wrapped.cleanupError?.cleanupError).toBe(cleanupError)
      expect(Object.isFrozen(observed)).toBe(true)
      expect(classifyFailure(observed)).toMatchObject({ kind: 'conflict', cause: 'container-cleanup' })
      expect(log.some((line) => line.startsWith('wt.remove'))).toBe(false)
    })
  }

  it('sandbox handle 的 containerName getter 抛错且 close 失败 → 仍必须先执行 close，再抛可信 cleanup error', async () => {
    const cleanupError = new Error('docker rm failed')
    let closeCalled = false
    let containerNameReads = 0
    const { ports, log } = makePorts({
      async createSandbox(opts) {
        return new Proxy({
          env: opts.env,
          containerName: FAKE_CONTAINER_NAME,
          async exec() { return { stdout: '', stderr: '', exitCode: 0 } },
          async close() {
            closeCalled = true
            throw cleanupError
          },
        }, {
          get(target, key, receiver) {
            if (key === 'containerName' && ++containerNameReads > 1) {
              throw new Error('hostile containerName getter')
            }
            return Reflect.get(target, key, receiver)
          },
        })
      },
    })

    let observed: unknown
    try {
      await runChangeInSandbox(
        ports,
        { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false },
        new AbortController().signal,
      )
    } catch (error) {
      observed = error
    }

    expect(closeCalled).toBe(true)
    expect(observed).toMatchObject({
      _tag: 'ContainerCleanupError',
      cleanupError,
      containerName: '<unavailable-owned-container>',
      preservedWorktreePath: '/wt/sandcastle-pipeline/x',
    })
    expect(Object.isFrozen(observed)).toBe(true)
    expect(classifyFailure(observed)).toMatchObject({ kind: 'conflict', cause: 'container-cleanup' })
    expect(log.some((line) => line.startsWith('wt.remove'))).toBe(false)
  })

  it('空 commits → noop=true（诚实化，即便 verify pass）', async () => {
    const { ports } = makePorts({
      async collectCommits() {
        return []
      },
    })
    const out = await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] },
      new AbortController().signal,
    )
    expect(out.buildSha).toBeUndefined()
    expect(out.noop).toBe(true)
  })

  describe('H7 verifier Phase 2：merge 之前、barrier 派生权威 build_sha 之后调 VerifierPort', () => {
    it('真有构建（commits 非空）→ 调 verifier.verify，RunOutcome.verification 携带其结构化返回', async () => {
      const seen: unknown[] = []
      const { ports } = makePorts({
        verifierExpectedIssuerIdentity: { kind: 'host-verifier', verifier: 'seen-verifier', version: '1' },
        verifier: {
          async verify(input) {
            seen.push(input)
            return {
              schema_version: 1,
              verification_id: 'ver-seen',
              subject: { workflow_run_id: input.workflowRunId, attempt_id: input.context.attempt_id, change: input.context.change, revision: { kind: 'named-branch-head', sha: input.revisionSha } },
              binding: input.workflowBinding,
              verdict: 'passed',
              evidence: [{ kind: 'command-result', command_id: 'x', exit_code: 0 }],
              issuer: { kind: 'host-verifier', verifier: 'seen-verifier', version: '1', trusted: true },
              evaluated_at: '2026-07-18T00:00:00.000Z',
            }
          },
        },
      })
      const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
      expect(seen).toHaveLength(1)
      // 权威 build SHA（barrier 派生，非沙箱自报）作为 verifier 的 revisionSha 入参。
      expect((seen[0] as { revisionSha: string }).revisionSha).toBe(SHA)
      expect((seen[0] as { worktreePath: string }).worktreePath).toBe('/wt/sandcastle-pipeline/x')
      // default-transition binding：event 取自沙箱握手的 phase_event（本例 fake runWork 恒 verify-pass）。
      expect((seen[0] as { workflowBinding: unknown }).workflowBinding).toEqual({ kind: 'default-transition', event: 'verify-pass' })
      expect(out.verification?.verification_id).toBe('ver-seen')
      expect(out.verification?.issuer.trusted).toBe(true)
    })

    it('cfg.context 真透传 → verifier 收到的 context/workflowRunId 就是调用方的真实 ExecutionContext', async () => {
      const seen: unknown[] = []
      const { ports } = makePorts({
        verifier: {
          async verify(input) { seen.push(input); return fakeVerifier().verify(input) },
        },
      })
      // H10 r1 阻断3/D5 返工（任务B1）：唯一合法构造点是 markNonLoopPrepared()——这份 context 没有
      // 走 admission.reserve()/prepareSkillBundle，没有真实治理 epoch/bundle 归属，是非 loop 直跑
      // 分支（同 lifecycle.ts 合成兜底 context 的诚实空值惯例）。
      const ctx = markNonLoopPrepared({
        attempt_id: 'att-real', reservation_id: 'res-real', loop_id: 'lp-real', change: 'x',
        level: 'L3' as const, runner: 'claude-code', admitted_at: 't', workflow_run_id: 'wfr-real',
        reservation: { runs: 1 as const, tokens: 2000, token_basis: 'risk-default' as const },
        policy_epoch: '', skill_bundle_id: null,
      })
      await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], context: ctx }, new AbortController().signal)
      expect(seen).toHaveLength(1)
      expect((seen[0] as { context: unknown }).context).toEqual(ctx)
      expect((seen[0] as { workflowRunId: string }).workflowRunId).toBe('wfr-real')
    })

    it('未传 cfg.context → 合成最小 context（attempt_id 用 workflowRunId 兜底），不炸、不冒充真实归属', async () => {
      const seen: unknown[] = []
      const { ports } = makePorts({
        verifier: { async verify(input) { seen.push(input); return fakeVerifier().verify(input) } },
      })
      await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
      expect(seen).toHaveLength(1)
      const input = seen[0] as { context: { change: string }; workflowRunId: string }
      expect(input.context.change).toBe('x')
      expect(input.workflowRunId.length).toBeGreaterThan(0)
    })

    it('未传 cfg.context 时合成 context 使用注入 clock，不直读系统 Date', async () => {
      const seen: unknown[] = []
      const { ports } = makePorts({
        verifier: { async verify(input) { seen.push(input); return fakeVerifier().verify(input) } },
      })
      await runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false,
        clock: () => '2030-01-02T03:04:05.000Z',
      }, new AbortController().signal)
      expect((seen[0] as { context: { admitted_at: string } }).context.admitted_at).toBe('2030-01-02T03:04:05.000Z')
    })

    it('空 commits（no-op）→ 不调 verifier（没有可核验的构建），RunOutcome.verification 为 undefined', async () => {
      let calls = 0
      const { ports } = makePorts({
        async collectCommits() { return [] },
        verifier: { async verify(input) { calls++; return fakeVerifier().verify(input) } },
      })
      const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
      expect(calls).toBe(0)
      expect(out.verification).toBeUndefined()
      expect(out.noop).toBe(true)
    })

    it('verifier 回 inconclusive（默认兜底档）→ 原样落进 RunOutcome.verification，不冒充 passed', async () => {
      const { ports } = makePorts({ verifier: fakeVerifier({ verdict: 'inconclusive', evidence: [] }) })
      const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
      expect(out.verification?.verdict).toBe('inconclusive')
    })

    it('L1（autoMerge=false）也调 verifier（verification 不是只服务 L3 merge 判断，settlement 全档都要诚实记录）', async () => {
      let calls = 0
      const { ports } = makePorts({ verifier: { async verify(input) { calls++; return fakeVerifier().verify(input) } } })
      await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
      expect(calls).toBe(1)
    })

    it('verifier 回 inconclusive/untrusted/failed（gate 未授权）→ 跳过物理 mergeToBase（fail-closed：绝不能物理已合并但结算判"未合并"撕裂说谎）', async () => {
      const { ports, log } = makePorts({ verifier: fakeVerifier({ verdict: 'inconclusive', evidence: [] }) })
      const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
      expect(log).not.toContain('mergeToBase') // gate 未授权：本层自己就不物理 merge，不靠 scheduler 事后描述掩盖
      expect(out.killSwitched).toBe(false) // 语义不同——不是 loop 停用（kill-switch 恒 false），是核验未授权
      expect(out.verification?.verdict).toBe('inconclusive')
      expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true) // 非 conflict：worktree 仍照常 teardown（不是留现场类错误）
    })

    it('verifier 回 trusted passed + SHA 符（gate 授权）→ mergeToBase 照常物理执行（本 mergeback 实现/kill-switch permit 原语零改动，只多一层前置 gate）', async () => {
      const { ports, log } = makePorts({ verifier: fakeVerifier() }) // 默认 trusted passed + SHA 对齐 barrier.buildSha
      const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
      expect(log).toContain('mergeToBase')
      expect(out.verification?.verdict).toBe('passed')
    })

    it('base ref 已落地但 host 工作树同步失败 → outcome 仍记 mergeLanded=true，另记 hostSyncPending，不抛 conflict', async () => {
      const { ports } = makePorts({
        async mergeToBase() {
          return { landed: true, hostSynced: false, mergedCommit: SHA, baseBefore: SHA, branchTip: SHA, hostSyncError: 'dirty host path' }
        },
      })
      const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
      expect(out.mergeLanded).toBe(true)
      expect(out.hostSyncPending).toBe(true)
    })

    it('durable merge journal 顺序接线：intent 携 verification/artifacts 且先于 landed receipt', async () => {
      const events: string[] = []
      const { ports } = makePorts()
      await runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], requireMergeJournal: true,
        mergeJournal: {
          async recordMergeIntent(input) {
            events.push('intent')
            expect(input.context.change).toBe('x')
            expect(input.verification?.verdict).toBe('passed')
            expect(input.commits).toEqual([{ sha: SHA }])
            expect(input.draft.mergedCommit).toBe(SHA)
            return 'intent-rec-1'
          },
          async recordMergeLanded(input) {
            events.push('landed')
            expect(input.intentRecordId).toBe('intent-rec-1')
            expect(input.receipt.mergedCommit).toBe(SHA)
          },
        },
      }, new AbortController().signal)
      expect(events).toEqual(['intent', 'landed'])
    })

    it('requireMergeJournal=true 但缺少装配 → update-ref 前 fail-closed，mergeToBase 零调用', async () => {
      const { ports, log } = makePorts()
      await expect(runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], requireMergeJournal: true,
      }, new AbortController().signal)).rejects.toMatchObject({ _tag: 'MergeJournalError', landed: false })
      expect(log).not.toContain('mergeToBase')
    })

    it('L1（autoMerge=false）：verifier 回 inconclusive 也不影响（本就不试图 merge，只是诚实记录 verification）', async () => {
      const { ports, log } = makePorts({ verifier: fakeVerifier({ verdict: 'inconclusive', evidence: [] }) })
      const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
      expect(log).not.toContain('mergeToBase')
      expect(out.verification?.verdict).toBe('inconclusive')
    })

    describe('H7 复审阻断1/2/4：VerifierPort 运行时输出边界——伪造/非法 result 绝不原样直信，绝不物理 merge（fail-closed，无撕裂）', () => {
      /** verifier 直接返回一个完全自定义的"伪造"对象（不经 fakeVerifier 的合法基底）：TS 静态类型
       *  挡不住运行时注入实现绕过不变式（`as` 强转/反序列化外部数据），模拟不可信 VerifierPort 实现。
       *  复审 §2 原文 PoC 原样落地：sandbox 冒充 trusted:true + verdict passed + 零 evidence。 */
      const forgingVerifier = (forged: unknown): VerifierPort => ({
        async verify() { return forged as VerificationResult },
      })

      it('sandbox 冒充 trusted:true（复审 §2 原文 PoC）→ RunOutcome.verification 被替换为安全 sentinel（非 passed/非 trusted），绝不 mergeToBase', async () => {
        const forged = {
          issuer: { kind: 'sandbox-report', trusted: true },
          verdict: 'passed',
          evidence: [],
          subject: { revision: { sha: SHA } },
        }
        const { ports, log } = makePorts({ verifier: forgingVerifier(forged) })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).not.toContain('mergeToBase') // 核心：绝不能让伪造的 trusted:true 触发物理 merge
        expect(out.verification?.issuer.trusted).toBe(false) // 不采信伪造对象里的 trusted:true
        expect(out.verification?.verdict).not.toBe('passed') // 不冒充 passed
        // 阻断4：sentinel 自身必须合法——否则即便不 merge，ledger 写入时仍会因非法 verification 被拒，
        // 形成"未合并但也没法诚实记账"的次生撕裂。这里直接证明它是 schema-valid，不会拖垮 ledger 写入。
        expect(validateVerificationResult(out.verification!).ok).toBe(true)
      })

      // 以下三条：override 建立在 fakeVerifier 的合法基底之上（subject/binding 仍从真实 input 派生），
      // 只单独破坏一个字段——更贴近"host verifier 实现本身有 bug"而非"整个对象都是垃圾"的现实场景。
      it('passed 但零 evidence（非法 schema：裸判决不成立）→ 同样被拦，绝不 mergeToBase', async () => {
        const { ports, log } = makePorts({ verifier: fakeVerifier({ evidence: [] }) }) // verdict 仍默认 passed
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).not.toContain('mergeToBase')
        expect(out.verification?.verdict).not.toBe('passed')
        expect(validateVerificationResult(out.verification!).ok).toBe(true)
      })

      it('verdict 为闭集外垃圾字面量 → 同样被拦，绝不 mergeToBase（不因"不是 failed/inconclusive"就漏判 authorized）', async () => {
        const { ports, log } = makePorts({ verifier: fakeVerifier({ verdict: 'garbage' as unknown as VerificationResult['verdict'] }) })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).not.toContain('mergeToBase')
        expect(validateVerificationResult(out.verification!).ok).toBe(true)
      })

      it('阻断3 端到端：repo-file evidence.revision_sha ≠ subject.revision.sha（旧 revision 证据撑新 revision passed）→ 被拦，绝不 mergeToBase', async () => {
        const { ports, log } = makePorts({
          // SHA 全 'a'（真实 subject.revision.sha，从 barrier.buildSha 派生）；evidence 却绑 40 位全 'c'——旧 revision 证据。
          verifier: fakeVerifier({ evidence: [{ kind: 'repo-file', path: 'a.ts', sha256: 'b'.repeat(64), revision_sha: 'c'.repeat(40) }] }),
        })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).not.toContain('mergeToBase')
        expect(out.verification?.verdict).not.toBe('passed')
        expect(validateVerificationResult(out.verification!).ok).toBe(true)
      })

      it('合法 result（fakeVerifier 默认）不受边界影响——原样放行，字段不变（回归：消毒层不误伤诚实 verifier）', async () => {
        const { ports } = makePorts({ verifier: fakeVerifier() })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(out.verification?.verification_id).toBe('ver-fake')
        expect(out.verification?.verdict).toBe('passed')
        expect(out.verification?.issuer.trusted).toBe(true)
      })
    })

    describe('H7 复审 §6：subject 归属一致性——形状完全合法、host-verifier trusted passed + 非空 evidence、revision SHA 与 buildSha 相符，但 subject.change/attempt_id 是别的 change 的（verifier 张冠李戴/复用了别的 change 的合法结果）→ 同样绝不 mergeToBase', () => {
      it('subject.change/attempt_id 与本次 run 的 change 不符（workflow_run_id/revision.sha 正确）→ RunOutcome.verification 被替换为安全 sentinel，绝不 mergeToBase', async () => {
        const { ports, log } = makePorts({
          verifier: {
            async verify(input) {
              return {
                schema_version: 1,
                verification_id: 'ver-other-change',
                subject: {
                  workflow_run_id: input.workflowRunId, attempt_id: 'other-att', change: 'other-change',
                  revision: { kind: 'named-branch-head', sha: input.revisionSha },
                },
                binding: input.workflowBinding,
                verdict: 'passed',
                evidence: [{ kind: 'command-result', command_id: 'fake', exit_code: 0 }],
                issuer: { kind: 'host-verifier', verifier: 'fake-verifier', version: '1', trusted: true },
                evaluated_at: '2026-07-18T00:00:00.000Z',
              }
            },
          },
        })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).not.toContain('mergeToBase') // 核心：subject 张冠李戴不得触发物理 merge
        expect(out.verification?.verdict).not.toBe('passed') // 不冒充 passed
        expect(validateVerificationResult(out.verification!).ok).toBe(true) // sentinel 自身仍合法，ledger 写入不受拖累
      })
    })

    describe('H7 复审阻断5：custom workflow 坐标——cfg.workflowCoordinate 真持有时才用 workflow-transition，未持有仍诚实落 default-transition', () => {
      it('cfg.workflowCoordinate 提供真实坐标 → binding 是 workflow-transition，携带真实 workflow_digest/workflow/step + 沙箱握手 event', async () => {
        const seen: unknown[] = []
        const { ports } = makePorts({
          verifier: { async verify(input) { seen.push(input); return fakeVerifier().verify(input) } },
        })
        await runChangeInSandbox(
          ports,
          {
            hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'],
            workflowCoordinate: { workflow_digest: 'digest-real-123', workflow: 'ship-review', step: 'verify' },
          },
          new AbortController().signal,
        )
        expect(seen).toHaveLength(1)
        expect((seen[0] as { workflowBinding: unknown }).workflowBinding).toEqual({
          kind: 'workflow-transition', workflow_digest: 'digest-real-123', workflow: 'ship-review', step: 'verify', event: 'verify-pass',
        })
      })

      it('未提供 cfg.workflowCoordinate（本仓当前一切生产调用点现状）→ 仍诚实落 default-transition，不伪造坐标', async () => {
        const seen: unknown[] = []
        const { ports } = makePorts({
          verifier: { async verify(input) { seen.push(input); return fakeVerifier().verify(input) } },
        })
        await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect((seen[0] as { workflowBinding: unknown }).workflowBinding).toEqual({ kind: 'default-transition', event: 'verify-pass' })
      })
    })

    describe('H7 issuer identity 装配锚：LifecyclePorts.verifierExpectedIssuerIdentity——未设置兼容默认端口，设置后逐类型完整核对', () => {
      const humanReviewVerifier: VerifierPort = {
        async verify(input) {
          return {
            schema_version: 1, verification_id: 'ver-human',
            subject: { workflow_run_id: input.workflowRunId, attempt_id: input.context.attempt_id, change: input.context.change, revision: { kind: 'named-branch-head', sha: input.revisionSha } },
            binding: input.workflowBinding, verdict: 'passed',
            evidence: [{ kind: 'command-result', command_id: 'x', exit_code: 0 }],
            issuer: { kind: 'human-review', actor_id: 'reviewer-1', trusted: true },
            evaluated_at: '2026-07-18T00:00:00.000Z',
          }
        },
      }

      it('verifier 签发 human-review，但未注入完整 identity（缺省锚定默认 host verifier）→ 替换成安全 sentinel，绝不物理 merge', async () => {
        const { ports, log } = makePorts({ verifierExpectedIssuerIdentity: undefined, verifier: humanReviewVerifier })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).not.toContain('mergeToBase')
        expect(out.verification?.verdict).not.toBe('passed')
        expect(out.verification?.issuer.kind).toBe('sandbox-report') // sentinel 降级，绝不因 issuer.kind 自报 human-review 就放行
      })

      it('显式注入完整 human-review identity，verifier 签发同一 actor → 相符，原样放行，正常物理 merge', async () => {
        const { ports, log } = makePorts({
          verifierExpectedIssuerIdentity: { kind: 'human-review', actor_id: 'reviewer-1' },
          verifier: humanReviewVerifier,
        })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).toContain('mergeToBase')
        expect(out.verification?.verdict).toBe('passed')
      })

      it('装配锚定 host A@1 时，verifier 返回 B@1 或 A@999 均降级 sentinel，绝不物理 merge', async () => {
        for (const issuer of [
          { kind: 'host-verifier', verifier: 'B', version: '1', trusted: true },
          { kind: 'host-verifier', verifier: 'A', version: '999', trusted: true },
        ] as const) {
          const { ports, log } = makePorts({
            verifierExpectedIssuerIdentity: { kind: 'host-verifier', verifier: 'A', version: '1' },
            verifier: fakeVerifier({ issuer }),
          })
          const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
          expect(log).not.toContain('mergeToBase')
          expect(out.verification?.verification_id).toContain('verifier-boundary-rejected')
        }
      })

      it('未显式配置 identity 时，createDefaultVerifierPort 产物与默认完整锚对齐，不被替换', async () => {
        const verifier = createDefaultVerifierPort({
          newId: () => 'ver-default-lifecycle',
          clock: () => '2026-07-18T00:00:00.000Z',
        })
        const { ports, log } = makePorts({ verifierExpectedIssuerIdentity: undefined, verifier })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).not.toContain('mergeToBase') // 默认端口诚实 inconclusive，仍不授权 merge。
        expect(out.verification?.verification_id).toBe('ver-default-lifecycle')
        expect(out.verification?.issuer).toEqual({ ...DEFAULT_VERIFIER_ISSUER_IDENTITY, trusted: true })
      })
    })

    describe('H7-S2 阻断5 收口：verifier 把 binding 整份换成别的 workflow 坐标（subject 仍对齐）→ RunOutcome.verification 被替换为安全 sentinel，绝不 mergeToBase', () => {
      it('binding.kind 被换成 runtime-verifier（input.workflowBinding 是 default-transition）→ 被拦，绝不 mergeToBase', async () => {
        const { ports, log } = makePorts({
          verifier: {
            async verify(input) {
              return {
                schema_version: 1, verification_id: 'ver-binding-swap',
                subject: { workflow_run_id: input.workflowRunId, attempt_id: input.context.attempt_id, change: input.context.change, revision: { kind: 'named-branch-head', sha: input.revisionSha } },
                binding: { kind: 'runtime-verifier', verifier: 'evil', version: '9' }, // 与 input.workflowBinding 完全不同的坐标
                verdict: 'passed',
                evidence: [{ kind: 'command-result', command_id: 'x', exit_code: 0 }],
                issuer: { kind: 'host-verifier', verifier: 'fake', version: '1', trusted: true },
                evaluated_at: '2026-07-18T00:00:00.000Z',
              }
            },
          },
        })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).not.toContain('mergeToBase')
        expect(out.verification?.verdict).not.toBe('passed')
        expect(out.verification?.binding).toEqual({ kind: 'default-transition', event: 'verify-pass' }) // sentinel 只采信 input 自己的 binding
      })
    })

    describe('H7-S2 custom fail-closed：cfg.workflowKind——custom workflow 的核验结果必须真落在 workflow-transition binding 才授权 merge', () => {
      it('cfg.workflowKind="custom" + 未提供 workflowCoordinate（binding 落 default-transition，坐标未真正解析）→ mergeGate 不授权，绝不物理 merge；requireWorkflowBinding 透传 RunOutcome 供 scheduler 同判', async () => {
        const { ports, log } = makePorts({ verifier: fakeVerifier() }) // 默认 trusted passed + SHA 对齐，但 binding 会是 default-transition
        const out = await runChangeInSandbox(
          ports,
          { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], workflowKind: 'custom' },
          new AbortController().signal,
        )
        expect(log).not.toContain('mergeToBase') // custom workflow 坐标未解析：fail-closed，不物理 merge
        expect(out.requireWorkflowBinding).toBe(true) // 透传给 scheduler，供其 gate 同样拒绝授权
        expect(out.verification?.verdict).toBe('passed') // 核验本身诚实记录（trusted+passed），只是 binding 不满足 custom 要求
      })

      it('cfg.workflowKind="custom" + workflowCoordinate 提供真实坐标（binding 落 workflow-transition）→ mergeGate 授权，正常物理 merge', async () => {
        const { ports, log } = makePorts({ verifier: fakeVerifier() })
        const out = await runChangeInSandbox(
          ports,
          {
            hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], workflowKind: 'custom',
            workflowCoordinate: { workflow_digest: 'd1', workflow: 'ship', step: 'verify' },
          },
          new AbortController().signal,
        )
        expect(log).toContain('mergeToBase')
        expect(out.requireWorkflowBinding).toBe(true)
      })

      it('回归：未传 cfg.workflowKind（存量单测/未升级调用点）→ requireWorkflowBinding=false（default 语义），default-transition binding 仍可正常 merge（行为不变）', async () => {
        const { ports, log } = makePorts({ verifier: fakeVerifier() })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)
        expect(log).toContain('mergeToBase')
        expect(out.requireWorkflowBinding).toBe(false)
      })
    })

    describe('H7-S2 敌意/撕裂：校验后突变——verifier 返回的原始对象在 mergeToBase await 期间被外部突变，冻结 canonical 副本不受影响', () => {
      it('fake verifier 返回合法可变对象；mergeToBase 执行期间突变原对象（verdict/issuer.trusted）→ outcome.verification 冻结副本仍是突变前的真值；scheduler gate 与 ledger encode 落盘字段均据此真值判定/落盘，不因原对象事后被突变而分裂', async () => {
        let capturedRaw: { verdict: string; issuer: { trusted: boolean } } | undefined
        const { ports, log } = makePorts({
          verifierExpectedIssuerIdentity: { kind: 'host-verifier', verifier: 'tearing-verifier', version: '1' },
          verifier: {
            async verify(input) {
              const raw = {
                schema_version: 1 as const,
                verification_id: 'ver-tearing',
                subject: {
                  workflow_run_id: input.workflowRunId, attempt_id: input.context.attempt_id, change: input.context.change,
                  revision: { kind: 'named-branch-head' as const, sha: input.revisionSha },
                },
                binding: input.workflowBinding,
                verdict: 'passed' as const,
                evidence: [{ kind: 'command-result' as const, command_id: 'x', exit_code: 0 }],
                issuer: { kind: 'host-verifier' as const, verifier: 'tearing-verifier', version: '1', trusted: true as const },
                evaluated_at: '2026-07-18T00:00:00.000Z',
              }
              capturedRaw = raw as unknown as { verdict: string; issuer: { trusted: boolean } }
              return raw
            },
          },
          async mergeToBase() {
            log.push('mergeToBase')
            // 撕裂时机：物理 merge 执行期间突变 verifier 早前返回的原始对象（同一引用，非冻结副本）。
            if (capturedRaw) {
              capturedRaw.verdict = 'failed'
              capturedRaw.issuer.trusted = false
            }
          },
        })
        const out = await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] }, new AbortController().signal)

        // 物理 merge 已经真实执行（gate 在突变发生之前就已基于冻结副本授权）：
        expect(log).toContain('mergeToBase')

        // outcome.verification 是突变前的冻结副本，不受随后突变影响：
        expect(out.verification?.verdict).toBe('passed')
        expect(out.verification?.issuer.trusted).toBe(true)
        expect(Object.isFrozen(out.verification)).toBe(true)

        // scheduler 消费同一份 outcome.verification 重算 gate：判定与物理 merge 时刻完全一致（authorized），
        // 不因原对象事后被突变而分裂成"物理已合并但结算判未授权"。
        const gate = evaluateVerificationGate({
          verification: out.verification, buildSha: out.buildSha,
          expectedSubject: { workflow_run_id: 'x', attempt_id: 'x', change: 'x' },
          requireWorkflowBinding: false,
        })
        expect(gate.kind).toBe('authorized')

        // ledger encode 落盘的也是突变前的真值，不是被突变污染的版本。
        const encoded = encodeLedgerRecord({
          schema_version: 1, record_id: 'r1', recorded_at: '2026-07-18T00:00:00.000Z',
          kind: 'run', run_record_id: 'run-1', attempt_id: 'x', loop_id: 'x', change: 'x',
          level: 'L3', runner: 'claude-code', admitted_at: '2026-07-18T00:00:00.000Z', finished_at: '2026-07-18T00:00:00.000Z',
          result: 'merged', usage_record_ids: [], accounting: { reserved_tokens: 0, charged_tokens: 0, charge_source: 'none' },
          verification: out.verification,
        })
        const onDisk = JSON.parse(encoded) as { verification: { verdict: string; issuer: { trusted: boolean } } }
        expect(onDisk.verification.verdict).toBe('passed')
        expect(onDisk.verification.issuer.trusted).toBe(true)
      })
    })
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
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'] },
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

describe('BaseAdvancedError（G² 子问题1：base 被外部推进 fail-loud + 留现场）', () => {
  it('_tag=SyncError（classify 归 conflict 留现场）+ baseAdvanced 标记（scheduler 据此 round ok=false）+ preservedWorktreePath', () => {
    const e = new BaseAdvancedError('base advanced externally', '/wt/x')
    expect(e._tag).toBe('SyncError') // 复用 SyncError 路由：classify → conflict + 留现场，classify 侧零改
    expect(e.baseAdvanced).toBe(true) // scheduler 据此另记 round failure 使 ok=false（区别于普通 content-conflict）
    expect(e.preservedWorktreePath).toBe('/wt/x')
    expect(e.message).toBe('base advanced externally')
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
      await exec('TENON_AFK=1 tenon-afk-run x', {})
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
        { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], denylist: ['docs/**'] },
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
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], denylist: ['docs/**'] },
      new AbortController().signal,
    )
    expect(out.verifyResult).toBe('pass')
    expect(log).toContain('diffNames')
    expect(log).toContain('mergeToBase')
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true)
  })

  it('L1 无 loop 路径策略（denylist 未传/空数组）→ 跳过检查（不调 diffNames）', async () => {
    const a = makePorts()
    await runChangeInSandbox(a.ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
    expect(a.log).not.toContain('diffNames')

    const b = makePorts()
    await runChangeInSandbox(
      b.ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, denylist: [] },
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
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], denylist: ['docs/**'] },
      new AbortController().signal,
    )
    expect(out.noop).toBe(true)
    expect(log).not.toContain('diffNames')
  })
})

describe('runChangeInSandbox · L3 allowlist 结算检查（G5）', () => {
  it('H5 write authorization：L1 也按 AutomationPolicy.write 拒绝越界产出，不能等到 merge 才检查', async () => {
    const { ports } = makePorts({ diffNames: async () => ['docs/outside.md'] })
    await expect(runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, context: policyContext() },
      new AbortController().signal,
    )).rejects.toMatchObject({ _tag: 'AllowlistViolationError', files: ['docs/outside.md'] })
  })

  it('direct lifecycle L3 缺少 allowlist → 最早边界 fail-loud，零 worktree/docker 副作用', async () => {
    const { ports, log } = makePorts()
    await expect(runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true },
      new AbortController().signal,
    )).rejects.toMatchObject({ _tag: 'PathPolicyUnconfiguredError' })
    expect(log).toEqual([])
  })

  it('L3 diff 含 allowlist 外路径 → conflict、保留现场且绝不 merge', async () => {
    const { ports, log } = makePorts({
      async diffNames() {
        log.push('diffNames')
        return ['src/ok.ts', '.github/workflows/ci.yml']
      },
    })
    await expect(runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['src/**'] },
      new AbortController().signal,
    )).rejects.toMatchObject({
      _tag: 'AllowlistViolationError',
      files: ['.github/workflows/ci.yml'],
      preservedWorktreePath: '/wt/sandcastle-pipeline/x',
    })
    expect(log).not.toContain('mergeToBase')
    expect(log.some((line) => line.startsWith('wt.remove'))).toBe(false)
    expect(log).toContain('sandbox.close')
  })

  it('L3 显式空 allowlist → 任意真实产出都拒绝', async () => {
    const { ports } = makePorts({ async diffNames() { return ['src/a.ts'] } })
    await expect(runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: [] },
      new AbortController().signal,
    )).rejects.toMatchObject({ _tag: 'AllowlistViolationError', files: ['src/a.ts'], allowlist: [] })
  })

  it('L3 全部命中 allowlist → 继续 verifier/merge；L1 不以 allowlist 限制报告产出', async () => {
    const l3 = makePorts({ async diffNames() { return ['src/a.ts', 'src/nested/b.ts'] } })
    await expect(runChangeInSandbox(
      l3.ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['src/**'] },
      new AbortController().signal,
    )).resolves.toMatchObject({ verifyResult: 'pass' })
    expect(l3.log).toContain('mergeToBase')

    const l1 = makePorts()
    await expect(runChangeInSandbox(
      l1.ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, allowlist: [] },
      new AbortController().signal,
    )).resolves.toMatchObject({ verifyResult: 'pass' })
    expect(l1.log).not.toContain('diffNames')
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
      await exec('TENON_AFK=1 TENON_RUNNER=codex tenon-afk-run x', {})
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

  it('未传 cfg.runner/context → 合成 context 与 runWork 都显式收到 codex（Codex-first）', async () => {
    const seen: (string | undefined)[] = []
    const { ports } = makePorts({
      async runWork(_exec, _name, _signal, runner) {
        seen.push(runner)
        return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
      },
    })
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
    expect(seen).toEqual(['codex'])
  })
})

/**
 * 观察项③ runner 无关性佐证（批 3 R2 · P1-T1 claude 补齐依赖此性质）：createAgentExitWatch 的
 * AGENT_EXIT_LINE_RE = /^\[AGENT_EXIT\] (\S+) (\d+)\s*$/ 按 (\S+) 抓 runner 名——脚本 claude 分支
 * 新发的 `[AGENT_EXIT] claude <exit>` 经既有 exec tee → 同一 watcher 落 automation_last_error，
 * **lifecycle 一行不改**。此测钉住这条「runner 无关」链路不被后续回改破坏（与 codex 侧同款断言）。
 */
describe('runChangeInSandbox · claude agent 非零退出可见度（runner 无关，批 3 R2 · P1-T1）', () => {
  /** fake 沙箱 exec 逐行吐 script；runWork 走 claude 缺省命令形态（不带 TENON_RUNNER）。 */
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
      await exec('TENON_AFK=1 tenon-afk-run x', {})
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

  describe('Stage B 返工 #3 · docker start / merge permit（kill-switch 原子性）', () => {
    const paused = (): Error => Object.assign(new Error('loop paused'), { _tag: 'LoopNotActiveError' })
    const baseCas = (): Error => Object.assign(new Error('base moved'), { _tag: 'BaseRefCasError' })

    it('start permit 抛 LoopNotActiveError → 不启动容器（sandbox.create 0 次），killSwitched，worktree 清理', async () => {
      const { ports, log } = makePorts()
      const out = await runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], withStartPermit: async () => { throw paused() },
      }, new AbortController().signal)
      expect(log).not.toContain('sandbox.create')
      expect(log).not.toContain('runWork') // 根本没进执行
      expect(out.killSwitched).toBe(true)
      expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true)
    })

    it('start permit 放行 → 正常启动（fn 被调一次）', async () => {
      const { ports, log } = makePorts()
      let calls = 0
      await runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, withStartPermit: async (fn) => { calls++; return fn() },
      }, new AbortController().signal)
      expect(calls).toBe(1)
      expect(log).toContain('sandbox.create')
    })

    it('merge permit 抛 LoopNotActiveError → 不 merge（mergeToBase 0 次），killSwitched', async () => {
      const { ports, log } = makePorts()
      const out = await runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], withMergePermit: async () => { throw paused() },
      }, new AbortController().signal)
      expect(log).not.toContain('mergeToBase')
      expect(out.killSwitched).toBe(true)
    })

    // G² 子问题1：BaseRefCasError（base 被外部推进）绝不再被吞成 killSwitched 成功——转 BaseAdvancedError
    // fail-loud（_tag=SyncError + baseAdvanced）、**留现场（worktree 不删）**，对照上一条 LoopNotActiveError 正常 killSwitched。
    it('merge permit 抛 BaseRefCasError（base 被推进）→ fail-loud 抛 BaseAdvancedError + 留现场（不删 worktree），绝不 killSwitched 吞成功', async () => {
      const { ports, log } = makePorts()
      await expect(runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], withMergePermit: async () => { throw baseCas() },
      }, new AbortController().signal)).rejects.toMatchObject({ _tag: 'SyncError', baseAdvanced: true, preservedWorktreePath: '/wt/sandcastle-pipeline/x' })
      expect(log).not.toContain('mergeToBase') // 产物不合进未验证过的新 base
      expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false) // 留现场：worktree 不删（对照 LoopNotActiveError 那条正常清理）
      expect(log).toContain('sandbox.close') // 容器仍杀
    })

    it('merge permit 放行 → 真 merge（fn 被调一次，持锁到 mergeToBase 完成）', async () => {
      const { ports, log } = makePorts()
      let calls = 0
      await runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], withMergePermit: async (fn) => { calls++; return fn() },
      }, new AbortController().signal)
      expect(calls).toBe(1)
      expect(log).toContain('mergeToBase')
    })

    // ── G②：真实 merge 接线传 verifyBase——base-SHA CAS 关掉 freeze→merge 的 TOCTOU ──
    it('G² base 被第三方推进（verifyBase=false）→ merge permit 抛 BaseRefCasError → fail-loud 抛 BaseAdvancedError、不 merge、留现场（非 killSwitched）', async () => {
      let baseCalls = 0
      const { ports, log } = makePorts({
        // 冻结时读 BASE_OLD；merge 前（verifyBase）重读得 BASE_NEW（第三方推进）；命名分支（barrier）恒 SHA。
        git: { revParse: async (ref) => (ref === 'main' ? (++baseCalls === 1 ? 'BASE_OLD' : 'BASE_NEW') : SHA) },
      })
      await expect(runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'],
        // 真 permit 语义（同 kernel withLoopMergePermit）：verifyBase()=false → 抛 BaseRefCasError，不执行 merge。
        withMergePermit: async (fn, verifyBase) => { if (!(await verifyBase())) throw baseCas(); return fn() },
      }, new AbortController().signal)).rejects.toMatchObject({ _tag: 'SyncError', baseAdvanced: true })
      expect(log).not.toContain('mergeToBase') // base 变 → 产物不合进未验证过的新 base
      expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false) // 留现场：worktree 不删
    })

    it('G② base 未变（verifyBase=true）→ merge 执行；冻结 base SHA 传入 mergeToBase（供 mergeBackToBase 二次 CAS）', async () => {
      const merges: Array<string | undefined> = []
      const { ports, log } = makePorts({
        // base ref → 冻结 SHA；命名分支（barrier）→ SHA（与 landed commit 一致，不触发 barrier 漂移）。
        git: { revParse: async (ref) => (ref === 'main' ? 'BASE_FROZEN' : SHA) },
        async mergeToBase(input) { log.push('mergeToBase'); merges.push(input.expectedBaseSha) },
      })
      await runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'],
        withMergePermit: async (fn, verifyBase) => { expect(await verifyBase()).toBe(true); return fn() },
      }, new AbortController().signal)
      expect(log).toContain('mergeToBase')
      expect(merges[0]).toBe('BASE_FROZEN') // 冻结时 base ref SHA 透传给 mergeToBase → mergeBackToBase base-SHA CAS
    })

    // ── 阻断1 串联：permit verifyBase 预检**放行**（freeze→merge-pre 窗口 base 未变）后，base 在「merge 已开始
    //    之后」被推进 → mergeBackToBase 自身 update-ref CAS 失败、抛 SyncError{baseAdvanced:true}。lifecycle 必须
    //    **原样透传**（不吞成无 baseAdvanced 的普通 conflict、更不吞成 killSwitched 成功）——scheduler 才据 baseAdvanced
    //    使 round ok=false。区别于上面「verifyBase=false → permit 抛 BaseRefCasError」那条预检路径。 ──
    it('permit 放行但 mergeToBase 自身 CAS 失败（merge 已开始之后 base 被推进）→ SyncError{baseAdvanced} 原样透传（非吞成普通 conflict/killSwitched）+ 留现场', async () => {
      const { ports, log } = makePorts({
        async mergeToBase() { log.push('mergeToBase'); throw new SyncError('base advanced during merge (update-ref CAS rejected)', '/wt/sandcastle-pipeline/x', { baseAdvanced: true }) },
      })
      await expect(runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'],
        withMergePermit: async (fn, verifyBase) => { expect(await verifyBase()).toBe(true); return fn() }, // 预检放行 → 真调 mergeToBase
      }, new AbortController().signal)).rejects.toMatchObject({ _tag: 'SyncError', baseAdvanced: true })
      expect(log).toContain('mergeToBase') // permit 放行、真进 mergeToBase（区别于 verifyBase=false 那条 mergeToBase 0 次）
      expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false) // 留现场：worktree 不删（_tag=SyncError → preserve）
    })

    it('无 permit：mergeToBase 自身 CAS 失败 → SyncError{baseAdvanced} 经 outer catch 透传 + preserve（留现场）', async () => {
      const { ports, log } = makePorts({
        async mergeToBase() { log.push('mergeToBase'); throw new SyncError('base advanced during merge', '/wt/sandcastle-pipeline/x', { baseAdvanced: true }) },
      })
      await expect(runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'], // 无 withMergePermit → checkActive 预检 + 直调 mergeToBase
      }, new AbortController().signal)).rejects.toMatchObject({ _tag: 'SyncError', baseAdvanced: true })
      expect(log).toContain('mergeToBase')
      expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false)
    })
  })
})

/**
 * H10 §4/§8任务6：容器只读消费面——cfg.context.skillBundle 存在时，本层注入三条元数据 env
 * （TENON_SKILL_BUNDLE_DIR/SHA256/ID，绝不放正文）并把 skillBundle 原样透传给
 * ports.createSandbox（挂载 + 容器前重新核验由 ports.ts 真实现负责，见 ports.test.ts）。skillBundle
 * 缺席（none-bundle 直通/非 loop AFK 直跑）→ 两者皆不发生，行为与本字段引入前完全一致。
 */
describe('runChangeInSandbox · skill bundle 元数据 env + mount 透传（H10 §4/§8任务6）', () => {
  const bundle: PreparedSkillBundle = {
    snapshotSha256: 'bundle-sha-abc',
    casRelativePath: '.pipeline/loops/skill-snapshots/sha256/bundle-sha-abc',
    resolutionSource: 'default',
    slots: [{ token: 'primary', alternatives: ['demo-skill'], concreteSkillId: 'demo-skill', treeSha256: 'tree-sha-xyz' }],
  }
  const baseCtx = {
    attempt_id: 'att', reservation_id: 'res', loop_id: 'lp', change: 'x',
    level: 'L1' as const, runner: 'claude-code', admitted_at: 't',
    reservation: { runs: 1 as const, tokens: 0, token_basis: 'risk-default' as const },
    policy_epoch: 'epoch-1', skill_bundle_id: 'profile-a',
  }
  // H10 r1 阻断3/D5 返工（任务B1）：唯一合法构造点是 markLoopPrepared()——不再手写字面量+skillBundle
  // 字段冒充满足 PreparedExecutionContext（裸字面量按结构类型曾经天然满足接口，是 r1 复审阻断3 的
  // 确切成因）。
  const ctxWithBundle = markLoopPrepared(baseCtx, bundle)

  it('cfg.context.skillBundle 存在 → env 含三条元数据键，ports.createSandbox 收到同一 skillBundle 引用', async () => {
    const { ports, env, skillBundleSeen } = makePorts()
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, context: ctxWithBundle }, new AbortController().signal)
    expect(env().TENON_SKILL_BUNDLE_DIR).toBe(SKILL_BUNDLE_CONTAINER_DIR)
    expect(env().TENON_SKILL_BUNDLE_SHA256).toBe('bundle-sha-abc')
    expect(env().TENON_SKILL_BUNDLE_ID).toBe('profile-a')
    expect(skillBundleSeen()).toEqual(bundle)
  })

  it('cfg.workflowStepPrompt → 只以 base64url 环境值进入沙箱，任意换行/引号逐字可逆', async () => {
    const { ports, env } = makePorts()
    const prompt = 'Run browser E2E.\nPreserve "$HOME" literally.'
    await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, workflowStepPrompt: prompt },
      new AbortController().signal,
    )
    const encoded = env()[TENON_WORKFLOW_STEP_PROMPT_B64_ENV]
    expect(encoded).toBe(Buffer.from(prompt, 'utf8').toString('base64url'))
    expect(Buffer.from(encoded!, 'base64url').toString('utf8')).toBe(prompt)
  })

  it('cfg.context 未传（无 skillBundle）→ env 不含任何 TENON_SKILL_BUNDLE_* 键，ports.createSandbox 收到 skillBundle=undefined（现状完全一致）', async () => {
    const { ports, env, skillBundleSeen } = makePorts()
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
    expect(Object.keys(env()).some((k) => k.startsWith('TENON_SKILL_BUNDLE_'))).toBe(false)
    expect(skillBundleSeen()).toBeUndefined()
  })

  it('cfg.context 是 NonLoopExecutionContext（非 loop 直跑，无 skillBundle 可携带）→ 同上，不注入、不透传', async () => {
    const { ports, env, skillBundleSeen } = makePorts()
    // H10 r1 阻断3/D5 返工（任务B1）：「context 存在但无 bundle」不再是「PreparedExecutionContext
    // 省略了 skillBundle 字段」这种伪造（该形状现已不可结构赋值，见 execution-context.test-d.ts）——
    // 唯一诚实的表达是判别联合的 non-loop 分支，经 markNonLoopPrepared() 产出。
    const ctxNoBundle = markNonLoopPrepared(baseCtx)
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, context: ctxNoBundle }, new AbortController().signal)
    expect(Object.keys(env()).some((k) => k.startsWith('TENON_SKILL_BUNDLE_'))).toBe(false)
    expect(skillBundleSeen()).toBeUndefined()
  })

  it('cfg.extraEnv 试图覆盖 TENON_SKILL_BUNDLE_SHA256 → 不生效（硬护栏优先，同 TENON_AFK_ENV 既有纪律）', async () => {
    const { ports, env } = makePorts()
    await runChangeInSandbox(
      ports,
      { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, context: ctxWithBundle, extraEnv: { TENON_SKILL_BUNDLE_SHA256: 'attacker-supplied' } },
      new AbortController().signal,
    )
    expect(env().TENON_SKILL_BUNDLE_SHA256).toBe('bundle-sha-abc')
  })

  it('skillBundle 存在但 skill_bundle_id 缺席（不应发生的组合）→ TENON_SKILL_BUNDLE_ID 诚实回退空串（不炸、不编造）', async () => {
    const { ports, env } = makePorts()
    const ctxNoId = { ...ctxWithBundle, skill_bundle_id: undefined }
    await runChangeInSandbox(ports, { hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: false, context: ctxNoId }, new AbortController().signal)
    expect(env().TENON_SKILL_BUNDLE_ID).toBe('')
  })
})
