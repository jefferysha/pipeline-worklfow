import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { compileAutomationPolicySnapshot, validateVerificationResult, type LoopEntry, type VerificationResult } from '@tenon/kernel'
import type { ExecutionContext } from '../admission/execution-context.js'
import {
  createDefaultVerifierPort, DEFAULT_VERIFIER_ISSUER_IDENTITY, enforceVerificationBoundary, evaluateVerificationGate, freezeVerifierInput,
  type VerificationGateInput, type VerifierInput,
} from './verifier.js'

const SHA = 'a'.repeat(40)
const policy = () => compileAutomationPolicySnapshot({
  id: 'lp', name: 'Loop', kind: 'continuous', goal: 'Ship the requested behavior', cadence: 'manual', risk: 'low',
  runner: 'codex', change_prefix: 'c', phases: [], human_gates: [], state: 'iteration', design_doc: 'GOAL.md',
  status: 'active', budget: { max_runs_per_day: 2, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: [],
  autonomy_level: 'L3', allowlist: ['packages/**'], denylist: [], skill_bundle_id: '_all',
} satisfies LoopEntry, { capturedAt: '2026-07-19T00:00:00.000Z' })

describe('freezeVerifierInput —— 不可信 verifier 不得改写自己的期望锚', () => {
  it('context/binding/issuer expectation 均为脱钩冻结副本', () => {
    const sourceContext = ctx()
    const sourceBinding = { kind: 'default-transition', event: 'verify-pass' } as const
    const sourceIssuerIdentity = { kind: 'host-verifier', verifier: 'A', version: '1' } as const
    const frozen = freezeVerifierInput({
      context: sourceContext, workflowRunId: 'wfr-1', workflowBinding: sourceBinding,
      revisionSha: SHA, worktreePath: '/wt/x', expectedIssuerIdentity: sourceIssuerIdentity,
    })
    expect(frozen.context).not.toBe(sourceContext)
    expect(frozen.workflowBinding).not.toBe(sourceBinding)
    expect(frozen.expectedIssuerIdentity).not.toBe(sourceIssuerIdentity)
    expect(Object.isFrozen(frozen)).toBe(true)
    expect(Object.isFrozen(frozen.context)).toBe(true)
    expect(Object.isFrozen(frozen.workflowBinding)).toBe(true)
    expect(Object.isFrozen(frozen.expectedIssuerIdentity)).toBe(true)
    expect(() => { (frozen.context as { change: string }).change = 'other' }).toThrow()
    expect(() => { (frozen.expectedIssuerIdentity as { version: string }).version = '999' }).toThrow()
  })

  it('H4：AutomationPolicy 也必须脱钩深冻结，不能借 verifier 改 goal/version', () => {
    const sourcePolicy = JSON.parse(JSON.stringify(policy())) as ReturnType<typeof policy>
    const frozen = freezeVerifierInput({
      context: ctx({ automation_policy: sourcePolicy }), workflowRunId: 'wfr-1',
      workflowBinding: { kind: 'default-transition', event: 'verify-pass' },
      revisionSha: SHA, worktreePath: '/wt/x', expectedIssuerIdentity: DEFAULT_VERIFIER_ISSUER_IDENTITY,
    })
    expect(frozen.context.automation_policy).not.toBe(sourcePolicy)
    expect(Object.isFrozen(frozen.context.automation_policy)).toBe(true)
    expect(Object.isFrozen(frozen.context.automation_policy?.constraints.write.allowlist)).toBe(true)
    expect(() => { (frozen.context.automation_policy as { goal: string }).goal = 'attacker goal' }).toThrow()
    sourcePolicy.goal = 'mutated after freeze'
    expect(frozen.context.automation_policy?.goal).toBe('Ship the requested behavior')
  })
})

const ctx = (over: Partial<ExecutionContext> = {}): ExecutionContext => ({
  attempt_id: 'att-1', reservation_id: 'res-1', loop_id: 'lp', change: 'c',
  level: 'L3', runner: 'claude-code', admitted_at: '2026-07-18T00:00:00.000Z',
  reservation: { runs: 1, tokens: 2000, token_basis: 'risk-default' },
  ...over,
})

describe('createDefaultVerifierPort —— H7 host verifier 安全兜底（无真实核验能力时诚实回 inconclusive）', () => {
  it('H4：有 AutomationPolicy 时把 policy/version/goal hash 写入核验 subject', async () => {
    const result = await createDefaultVerifierPort().verify({
      context: ctx({ automation_policy: policy() }), workflowRunId: 'wfr-1',
      workflowBinding: { kind: 'default-transition', event: 'verify-pass' }, revisionSha: SHA, worktreePath: '/wt/x',
    })
    expect(result.automation_policy).toEqual({
      policy_id: 'lp', policy_version: policy().policy_version,
      goal_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('回 verdict=inconclusive（不冒充 pass）、issuer.kind=host-verifier 且 trusted:true（issuer 类型派生，非自报）', async () => {
    const verifier = createDefaultVerifierPort()
    const result = await verifier.verify({
      context: ctx(), workflowRunId: 'wfr-1',
      workflowBinding: { kind: 'default-transition', event: 'verify-pass' },
      revisionSha: SHA, worktreePath: '/wt/x',
    })
    expect(result.verdict).toBe('inconclusive')
    expect(result.issuer.kind).toBe('host-verifier')
    expect(result.issuer.trusted).toBe(true)
  })

  it('subject 字段忠实携带 input（workflow_run_id/attempt_id/change/revision.sha）', async () => {
    const verifier = createDefaultVerifierPort()
    const result = await verifier.verify({
      context: ctx({ attempt_id: 'att-9', change: 'my-change' }), workflowRunId: 'wfr-9',
      workflowBinding: { kind: 'default-transition', event: 'verify-pass' },
      revisionSha: SHA, worktreePath: '/wt/x',
    })
    expect(result.subject.workflow_run_id).toBe('wfr-9')
    expect(result.subject.attempt_id).toBe('att-9')
    expect(result.subject.change).toBe('my-change')
    expect(result.subject.revision).toEqual({ kind: 'named-branch-head', sha: SHA })
  })

  it('binding 原样透传调用方传入的 workflowBinding（不篡改坐标）', async () => {
    const verifier = createDefaultVerifierPort()
    const binding = { kind: 'runtime-verifier' as const, verifier: 'custom', version: '9' }
    const result = await verifier.verify({
      context: ctx(), workflowRunId: 'wfr-1', workflowBinding: binding, revisionSha: SHA, worktreePath: '/wt/x',
    })
    expect(result.binding).toEqual(binding)
  })

  it('产出结果本身满足 kernel VerificationResult 窄校验（schema_version/id/evaluated_at 齐全）', async () => {
    const verifier = createDefaultVerifierPort()
    const result = await verifier.verify({
      context: ctx(), workflowRunId: 'wfr-1',
      workflowBinding: { kind: 'default-transition', event: 'verify-pass' },
      revisionSha: SHA, worktreePath: '/wt/x',
    })
    expect(result.schema_version).toBe(1)
    expect(result.verification_id.length).toBeGreaterThan(0)
    expect(result.evaluated_at.length).toBeGreaterThan(0)
    expect(result.evidence).toEqual([]) // inconclusive 不强制 evidence
  })

  it('两次调用产生不同 verification_id（不可注入 newId 时用内建生成器，不撞号）', async () => {
    const verifier = createDefaultVerifierPort()
    const input = {
      context: ctx(), workflowRunId: 'wfr-1',
      workflowBinding: { kind: 'default-transition' as const, event: 'verify-pass' },
      revisionSha: SHA, worktreePath: '/wt/x',
    }
    const a = await verifier.verify(input)
    const b = await verifier.verify(input)
    expect(a.verification_id).not.toBe(b.verification_id)
  })

  it('可注入 newId/clock/verifierName/version（确定性测试）', async () => {
    const verifier = createDefaultVerifierPort({
      verifierName: 'test-verifier', version: '3.2.1',
      newId: (prefix) => `${prefix}-fixed`, clock: () => '2020-01-01T00:00:00.000Z',
    })
    const result = await verifier.verify({
      context: ctx(), workflowRunId: 'wfr-1',
      workflowBinding: { kind: 'default-transition', event: 'verify-pass' },
      revisionSha: SHA, worktreePath: '/wt/x',
    })
    expect(result.verification_id).toBe('ver-fixed')
    expect(result.evaluated_at).toBe('2020-01-01T00:00:00.000Z')
    expect(result.issuer).toEqual({ kind: 'host-verifier', verifier: 'test-verifier', version: '3.2.1', trusted: true })
  })

  it('默认端口产物与 DEFAULT_VERIFIER_ISSUER_IDENTITY 完整对齐，可通过 boundary（默认装配兼容）', async () => {
    const verifier = createDefaultVerifierPort({ newId: () => 'ver-default', clock: () => '2026-07-18T00:00:00.000Z' })
    const input: VerifierInput = {
      context: ctx(), workflowRunId: 'wfr-1',
      workflowBinding: { kind: 'default-transition', event: 'verify-pass' },
      revisionSha: SHA, worktreePath: '/wt/x', expectedIssuerIdentity: DEFAULT_VERIFIER_ISSUER_IDENTITY,
    }
    const raw = await verifier.verify(input)
    const out = enforceVerificationBoundary(raw, input)
    expect(out.verification_id).toBe('ver-default')
    expect(out.issuer).toEqual({ ...DEFAULT_VERIFIER_ISSUER_IDENTITY, trusted: true })
  })
})

// ── evaluateVerificationGate：scheduler settlement 决策的纯谓词（D3 消费点裁决的判定表）───────
const passResult = (over: Partial<VerificationResult> = {}): VerificationResult => ({
  schema_version: 1,
  verification_id: 'ver-1',
  subject: {
    workflow_run_id: 'wfr-1', attempt_id: 'att-1', change: 'c',
    revision: { kind: 'named-branch-head', sha: SHA },
  },
  binding: { kind: 'default-transition', event: 'verify-pass' },
  verdict: 'passed',
  evidence: [{ kind: 'command-result', command_id: 'test', exit_code: 0 }],
  issuer: { ...DEFAULT_VERIFIER_ISSUER_IDENTITY, trusted: true },
  evaluated_at: '2026-07-18T00:00:00.000Z',
  ...over,
})

/** enforceVerificationBoundary 的 VerifierInput（沙箱路径与 revisionSha 均本进程构造，可信）。 */
const boundaryInput = (over: Partial<VerifierInput> = {}): VerifierInput => ({
  context: ctx(), workflowRunId: 'wfr-1',
  workflowBinding: { kind: 'default-transition', event: 'verify-pass' },
  revisionSha: SHA, worktreePath: '/wt/x',
  // H7 issuer identity 信任锚：默认对齐 passResult() 的完整 host identity，让既有「合法
  // result → 原样放行」一类用例在新增的锚校验下继续有意义地通过（而非因锚缺席被 fail-closed 挡下）；
  // 专测锚不符的用例显式覆盖本字段。
  expectedIssuerIdentity: DEFAULT_VERIFIER_ISSUER_IDENTITY,
  ...over,
})

describe('enforceVerificationBoundary —— H7 复审阻断1 核心修复：VerifierPort 运行时输出边界', () => {
  it('H4：input 带 policy 而 result 缺 goal 归属 → sentinel fail-closed', () => {
    const out = enforceVerificationBoundary(passResult(), boundaryInput({ context: ctx({ automation_policy: policy() }) }))
    expect(out.verdict).toBe('inconclusive')
    expect(out.issuer.trusted).toBe(false)
  })

  it('H4：result 的 policy_version 张冠李戴 → sentinel fail-closed', () => {
    const expected = policy()
    const out = enforceVerificationBoundary({
      ...passResult(),
      automation_policy: { policy_id: expected.policy_id, policy_version: 'f'.repeat(64), goal_sha256: 'e'.repeat(64) },
    }, boundaryInput({ context: ctx({ automation_policy: expected }) }))
    expect(out.verdict).toBe('inconclusive')
  })

  it('合法 result → 原样放行（不替换）', () => {
    const legit = passResult()
    const out = enforceVerificationBoundary(legit, boundaryInput())
    expect(out).toEqual(legit)
  })

  it('sandbox 冒充 trusted:true（复审 PoC 原文构造）→ 替换成安全 sentinel，绝不放行伪造的 trusted:true', () => {
    const forged = {
      issuer: { kind: 'sandbox-report', trusted: true },
      verdict: 'passed',
      evidence: [],
      subject: { revision: { sha: SHA } },
    }
    const out = enforceVerificationBoundary(forged, boundaryInput())
    expect(out.issuer.trusted).toBe(false) // 绝不采信被拒绝对象里的 trusted:true
    expect(out.verdict).not.toBe('passed') // 绝不冒充 passed
    expect(validateVerificationResult(out).ok).toBe(true) // sentinel 自身必须合法（否则下游 ledger 写入仍会拒写，见阻断4）
  })

  it('passed 但零 evidence（schema 非法）→ 替换成安全 sentinel', () => {
    const forged = { ...passResult(), evidence: [] }
    const out = enforceVerificationBoundary(forged, boundaryInput())
    expect(out.verdict).toBe('inconclusive')
    expect(out.issuer.trusted).toBe(false)
    expect(validateVerificationResult(out).ok).toBe(true)
  })

  it('verdict 为闭集外垃圾字面量 → 替换成安全 sentinel（不崩溃、不放行）', () => {
    const forged = { ...passResult(), verdict: 'garbage' }
    const out = enforceVerificationBoundary(forged, boundaryInput())
    expect(out.verdict).toBe('inconclusive')
    expect(validateVerificationResult(out).ok).toBe(true)
  })

  it('repo-file evidence.revision_sha ≠ subject.revision.sha（阻断3 跨 revision 复用）→ 替换成安全 sentinel', () => {
    const forged = {
      ...passResult(),
      evidence: [{ kind: 'repo-file', path: 'a.ts', sha256: 'b'.repeat(64), revision_sha: 'c'.repeat(40) }],
    }
    const out = enforceVerificationBoundary(forged, boundaryInput())
    expect(out.verdict).not.toBe('passed')
    expect(validateVerificationResult(out).ok).toBe(true)
  })

  it('完全非对象（null/字符串）→ 替换成安全 sentinel，不抛异常', () => {
    expect(() => enforceVerificationBoundary(null, boundaryInput())).not.toThrow()
    const out = enforceVerificationBoundary('pass', boundaryInput())
    expect(out.verdict).toBe('inconclusive')
    expect(out.issuer.trusted).toBe(false)
  })

  it('替换出的 sentinel 是与 input 脱钩的递归冻结树，任意层级都不可突变', () => {
    const sourceBinding = { kind: 'default-transition', event: 'verify-pass' } as const
    const out = enforceVerificationBoundary(null, boundaryInput({ workflowBinding: sourceBinding }))
    expect(out.binding).not.toBe(sourceBinding)
    expect(Object.isFrozen(out)).toBe(true)
    expect(Object.isFrozen(out.subject)).toBe(true)
    expect(Object.isFrozen(out.subject.revision)).toBe(true)
    expect(Object.isFrozen(out.binding)).toBe(true)
    expect(Object.isFrozen(out.evidence)).toBe(true)
    expect(Object.isFrozen(out.issuer)).toBe(true)
    expect(() => { (out.subject as { change: string }).change = 'mutated' }).toThrow(TypeError)
    expect(() => { (out.evidence as unknown as unknown[]).push('mutated') }).toThrow(TypeError)
  })

  it('替换出的 sentinel 只采信调用方自己的 input（context/binding/revisionSha），绝不摘取被拒绝对象里的任何字段', () => {
    const forged = {
      issuer: { kind: 'sandbox-report', trusted: true },
      verdict: 'passed',
      evidence: [],
      subject: { workflow_run_id: 'evil-wfr', attempt_id: 'evil-att', change: 'evil-change', revision: { kind: 'named-branch-head', sha: 'd'.repeat(40) } },
      binding: { kind: 'runtime-verifier', verifier: 'evil', version: '0' },
    }
    const input = boundaryInput({ context: ctx({ attempt_id: 'real-att', change: 'real-change' }), workflowRunId: 'real-wfr' })
    const out = enforceVerificationBoundary(forged, input)
    expect(out.subject.workflow_run_id).toBe('real-wfr')
    expect(out.subject.attempt_id).toBe('real-att')
    expect(out.subject.change).toBe('real-change')
    expect(out.subject.revision.sha).toBe(SHA) // input.revisionSha，非伪造对象里的 'd'.repeat(40)
    expect(out.binding).toEqual({ kind: 'default-transition', event: 'verify-pass' }) // input.workflowBinding，非伪造的 runtime-verifier
  })

  describe('H7 复审 §6：subject 归属一致性——形状完全合法，但 subject 与本次调用 input 不符（verifier 张冠李戴/复用别的 change 的合法结果）同样判非法', () => {
    // 四个 mismatch 用例共用同一条「四字段全部对齐」的基线 input/result，逐条只破坏其中一个字段——
    // 贴近「host verifier 实现把 subject 绑错了」而非「整个对象都是垃圾」的现实场景（同上方三条
    // 单字段 override 用例的写法）。只查 subject 这四个字段，不查 binding：真 verifier 未来可能合法地
    // 把 binding 精化得比 input.workflowBinding 更细（例如给 workflow-transition 补上 input 构造时尚
    // 未知道的 guard_index/action_index），那不构成张冠李戴，本轮一致性校验不覆盖 binding。
    const alignedInput = boundaryInput({
      context: ctx({ attempt_id: 'att-42', change: 'change-42' }), workflowRunId: 'wfr-42', revisionSha: 'b'.repeat(40),
    })
    const alignedSubject = {
      workflow_run_id: 'wfr-42', attempt_id: 'att-42', change: 'change-42',
      revision: { kind: 'named-branch-head' as const, sha: 'b'.repeat(40) },
    }

    it('subject.workflow_run_id 与 input.workflowRunId 不符 → 替换成安全 sentinel', () => {
      const legit = passResult({ subject: { ...alignedSubject, workflow_run_id: 'wfr-OTHER' } })
      const out = enforceVerificationBoundary(legit, alignedInput)
      expect(out.verdict).toBe('inconclusive')
      expect(out.issuer.trusted).toBe(false)
      expect(out.verdict).not.toBe('passed')
      expect(validateVerificationResult(out).ok).toBe(true) // sentinel 自身仍必须合法
    })

    it('subject.attempt_id 与 input.context.attempt_id 不符 → 替换成安全 sentinel', () => {
      const legit = passResult({ subject: { ...alignedSubject, attempt_id: 'att-OTHER' } })
      const out = enforceVerificationBoundary(legit, alignedInput)
      expect(out.verdict).toBe('inconclusive')
      expect(out.issuer.trusted).toBe(false)
      expect(validateVerificationResult(out).ok).toBe(true)
    })

    it('subject.change 与 input.context.change 不符 → 替换成安全 sentinel', () => {
      const legit = passResult({ subject: { ...alignedSubject, change: 'change-OTHER' } })
      const out = enforceVerificationBoundary(legit, alignedInput)
      expect(out.verdict).toBe('inconclusive')
      expect(out.issuer.trusted).toBe(false)
      expect(validateVerificationResult(out).ok).toBe(true)
    })

    it('subject.revision.sha 与 input.revisionSha 不符 → 替换成安全 sentinel', () => {
      const legit = passResult({ subject: { ...alignedSubject, revision: { kind: 'named-branch-head', sha: 'c'.repeat(40) } } })
      const out = enforceVerificationBoundary(legit, alignedInput)
      expect(out.verdict).toBe('inconclusive')
      expect(out.issuer.trusted).toBe(false)
      expect(validateVerificationResult(out).ok).toBe(true)
    })

    it('subject 四字段（workflow_run_id/attempt_id/change/revision.sha）与本次 input 全部相符 → 原样放行（回归：不误伤 subject 归属一致的诚实 result）', () => {
      const legit = passResult({ subject: alignedSubject })
      const out = enforceVerificationBoundary(legit, alignedInput)
      expect(out).toEqual(legit)
    })
  })

  describe('H7-S2（返工 r2 阻断5 收口的另一半）：binding 完整性——subject 对齐、形状合法，但 binding 被整份换成别的坐标（verifier 张冠李戴 binding，而非只是合法精化 guard_index/action_index）同样判非法', () => {
    it('binding.kind 被整份替换（default-transition → runtime-verifier）→ 替换成安全 sentinel', () => {
      const legit = passResult({ binding: { kind: 'runtime-verifier', verifier: 'evil', version: '9' } })
      const out = enforceVerificationBoundary(legit, boundaryInput()) // boundaryInput 的 workflowBinding 是 default-transition
      expect(out.verdict).not.toBe('passed')
      expect(out.binding).toEqual(boundaryInput().workflowBinding) // sentinel 只采信 input 自己的 binding，不摘取伪造的 runtime-verifier
      expect(validateVerificationResult(out).ok).toBe(true)
    })

    it('workflow-transition binding 的 workflow_digest 被换成另一个 digest（同 kind，坐标不同）→ 替换成安全 sentinel', () => {
      const input = boundaryInput({ workflowBinding: { kind: 'workflow-transition', workflow_digest: 'digest-real', workflow: 'ship', step: 'verify', event: 'verify-pass' } })
      const legit = passResult({ binding: { kind: 'workflow-transition', workflow_digest: 'digest-EVIL', workflow: 'ship', step: 'verify', event: 'verify-pass' } })
      const out = enforceVerificationBoundary(legit, input)
      expect(out.verdict).not.toBe('passed')
      expect(validateVerificationResult(out).ok).toBe(true)
    })

    it('workflow-transition binding 的 step 被换成另一个 step（digest/workflow/event 均相符，只换 step）→ 替换成安全 sentinel', () => {
      const input = boundaryInput({ workflowBinding: { kind: 'workflow-transition', workflow_digest: 'd1', workflow: 'ship', step: 'verify', event: 'verify-pass' } })
      const legit = passResult({ binding: { kind: 'workflow-transition', workflow_digest: 'd1', workflow: 'ship', step: 'OTHER-STEP', event: 'verify-pass' } })
      const out = enforceVerificationBoundary(legit, input)
      expect(out.verdict).not.toBe('passed')
    })

    it('runtime-verifier binding 的 verifier/version 被换 → 替换成安全 sentinel', () => {
      const input = boundaryInput({ workflowBinding: { kind: 'runtime-verifier', verifier: 'real-verifier', version: '1' } })
      const legit = passResult({ binding: { kind: 'runtime-verifier', verifier: 'evil-verifier', version: '1' } })
      const out = enforceVerificationBoundary(legit, input)
      expect(out.verdict).not.toBe('passed')
    })

    it('回归：workflow-transition binding 合法补上 input 构造时尚未知道的 guard_index/action_index（其余字段相符）→ 原样放行（不误伤合法精化）', () => {
      const input = boundaryInput({ workflowBinding: { kind: 'workflow-transition', workflow_digest: 'd1', workflow: 'ship', step: 'verify', event: 'verify-pass' } })
      const legit = passResult({ binding: { kind: 'workflow-transition', workflow_digest: 'd1', workflow: 'ship', step: 'verify', event: 'verify-pass', guard_index: 2, action_index: 0 } })
      const out = enforceVerificationBoundary(legit, input)
      expect(out).toEqual(legit)
    })

    it('回归：binding 与 input.workflowBinding 逐字段一致（default-transition）→ 原样放行', () => {
      const legit = passResult({ binding: { kind: 'default-transition', event: 'verify-pass' } })
      const out = enforceVerificationBoundary(legit, boundaryInput())
      expect(out).toEqual(legit)
    })
  })

  describe('H7 issuer identity 信任锚——expectedIssuerIdentity 由装配层提供，绝非返回对象自报', () => {
    it('装配锚定 host verifier A@1 时，返回 B@1 或 A@999 均替换成安全 sentinel（同 kind 不等于同 identity）', () => {
      const input = {
        ...boundaryInput(),
        expectedIssuerIdentity: { kind: 'host-verifier', verifier: 'A', version: '1' },
      } as VerifierInput & { readonly expectedIssuerIdentity: { readonly kind: 'host-verifier'; readonly verifier: string; readonly version: string } }
      const mismatchedIssuers = [
        { kind: 'host-verifier', verifier: 'B', version: '1', trusted: true },
        { kind: 'host-verifier', verifier: 'A', version: '999', trusted: true },
      ] as const
      for (const issuer of mismatchedIssuers) {
        const out = enforceVerificationBoundary(passResult({ issuer }), input)
        expect(out.verdict).not.toBe('passed')
        expect(out.issuer.trusted).toBe(false)
      }
    })

    it('canonical.issuer.kind 与 expected identity 不符（verifier 签发 human-review，但装配层期望 host-verifier）→ 替换成安全 sentinel', () => {
      const legit = passResult({ issuer: { kind: 'human-review', actor_id: 'reviewer-1', trusted: true } })
      const out = enforceVerificationBoundary(legit, boundaryInput())
      expect(out.verdict).not.toBe('passed')
      expect(out.issuer.trusted).toBe(false)
      expect(validateVerificationResult(out).ok).toBe(true)
    })

    it('expectedIssuerIdentity 缺席（即使遗留 expectedIssuerKind 存在）→ 恒替换成安全 sentinel', () => {
      const legit = passResult() // issuer.kind='host-verifier'
      const input = boundaryInput()
      const { expectedIssuerIdentity: _drop, ...withoutAnchor } = input
      const out = enforceVerificationBoundary(legit, { ...withoutAnchor, expectedIssuerKind: 'host-verifier' } as VerifierInput)
      expect(out.verdict).not.toBe('passed')
      expect(validateVerificationResult(out).ok).toBe(true)
    })

    it('human-review 的 actor_id 与 expected identity 相符 → 原样放行', () => {
      const legit = passResult({ issuer: { kind: 'human-review', actor_id: 'reviewer-1', trusted: true } })
      const out = enforceVerificationBoundary(legit, boundaryInput({
        expectedIssuerIdentity: { kind: 'human-review', actor_id: 'reviewer-1' },
      }))
      expect(out).toEqual(legit)
    })

    it('human-review 的 actor_id 与 expected identity 不符 → 替换成安全 sentinel', () => {
      const legit = passResult({ issuer: { kind: 'human-review', actor_id: 'reviewer-B', trusted: true } })
      const out = enforceVerificationBoundary(legit, boundaryInput({
        expectedIssuerIdentity: { kind: 'human-review', actor_id: 'reviewer-A' },
      }))
      expect(out.verdict).toBe('inconclusive')
      expect(out.verification_id).toContain('verifier-boundary-rejected')
    })

    it('sandbox-report 的 runner 按 identity 比较：runner 不符拒绝，相符才保留 canonical', () => {
      const legit = passResult({ issuer: { kind: 'sandbox-report', runner: 'runner-B', trusted: false } })
      const expectedIssuerIdentity = { kind: 'sandbox-report', runner: 'runner-A' } as const
      const rejected = enforceVerificationBoundary(legit, boundaryInput({ expectedIssuerIdentity }))
      expect(rejected.verification_id).toContain('verifier-boundary-rejected')
      const accepted = enforceVerificationBoundary(legit, boundaryInput({
        expectedIssuerIdentity: { kind: 'sandbox-report', runner: 'runner-B' },
      }))
      expect(accepted).toEqual(legit)
    })

    it('sandbox 可控适配器改报 host-verifier，但装配层锚定 sandbox runner → 替换成安全 sentinel', () => {
      const forged = { issuer: { kind: 'host-verifier', verifier: 'evil', version: '0', trusted: true }, verdict: 'passed', evidence: [{ kind: 'command-result', command_id: 'x', exit_code: 0 }], subject: { workflow_run_id: 'wfr-1', attempt_id: 'att-1', change: 'c', revision: { kind: 'named-branch-head', sha: SHA } }, binding: { kind: 'default-transition', event: 'verify-pass' }, schema_version: 1, verification_id: 'v', evaluated_at: '2026-07-18T00:00:00.000Z' }
      const out = enforceVerificationBoundary(forged, boundaryInput({
        expectedIssuerIdentity: { kind: 'sandbox-report', runner: 'real-sandbox' },
      }))
      expect(out.verdict).not.toBe('passed')
      expect(out.issuer.kind).toBe('sandbox-report') // sentinel 降级，绝不采信伪造对象里的 host-verifier 自报
    })
  })

  describe('H7-S2 敌意读取：evidence 四拍循环 getter（r2 §1 原文 PoC——同一属性跨次读取返回不同值，企图让形状校验与跨字段一致性校验看见不同数组）', () => {
    /** 四拍：[] → [] → [一条 revision_sha 不符的 repo-file] → [] 循环。H7-S1 单次读取抽取后，本
     *  getter 全链路至多被访问一次，无论定格在哪一拍都不该被判 passed/authorized。 */
    const cyclingEvidenceForged = (idBase: string): { forged: VerificationResult; reads: () => number } => {
      let reads = 0
      const phases: unknown[] = [
        [],
        [],
        [{ kind: 'repo-file', path: 'a.ts', sha256: 'b'.repeat(64), revision_sha: 'c'.repeat(40) }],
        [],
      ]
      const forged = {
        schema_version: 1, verification_id: idBase,
        subject: { workflow_run_id: 'wfr-1', attempt_id: 'att-1', change: 'c', revision: { kind: 'named-branch-head', sha: SHA } },
        binding: { kind: 'default-transition', event: 'verify-pass' },
        verdict: 'passed',
        issuer: { kind: 'host-verifier', verifier: 'v', version: '1', trusted: true },
        evaluated_at: '2026-07-18T00:00:00.000Z',
        get evidence() { return phases[reads++ % phases.length] },
      } as unknown as VerificationResult
      return { forged, reads: () => reads }
    }

    it('enforceVerificationBoundary：evidence 只被读取一次，替换成安全 sentinel（不因某一拍恰好"看似合法"就放行伪造 passed）', () => {
      const { forged, reads } = cyclingEvidenceForged('ver-cycling-boundary')
      const out = enforceVerificationBoundary(forged, boundaryInput())
      expect(reads()).toBe(1)
      expect(out.verdict).not.toBe('passed')
      expect(validateVerificationResult(out).ok).toBe(true)
    })

    it('evaluateVerificationGate：同一循环 getter 绕过 boundary 直喂 gate → 仍非 authorized（第二道独立防线单独生效）', () => {
      const { forged } = cyclingEvidenceForged('ver-cycling-gate')
      const gate = evaluateVerificationGate({
        verification: forged, buildSha: SHA,
        expectedSubject: { workflow_run_id: 'wfr-1', attempt_id: 'att-1', change: 'c' },
        requireWorkflowBinding: false,
      })
      expect(gate.kind).not.toBe('authorized')
    })
  })
})

describe('evaluateVerificationGate —— settlement 判定表（D3 消费点：trusted+passed+subject 全符+SHA 符 才 authorized）', () => {
  /** H7-S2：默认基线——subject 与 passResult() 的默认 subject 对齐、requireWorkflowBinding=false
   *  （default workflow 语义，不加 custom 限制）。专测某一维度的用例只 override 该维度。 */
  const gateInput = (over: Partial<VerificationGateInput> = {}): VerificationGateInput => ({
    verification: passResult(),
    buildSha: SHA,
    expectedSubject: { workflow_run_id: 'wfr-1', attempt_id: 'att-1', change: 'c' },
    requireWorkflowBinding: false,
    ...over,
  })

  it('H4：gate 要求 policy 时，缺 goal 归属不得 authorized', () => {
    const gate = evaluateVerificationGate(gateInput({ expectedAutomationPolicy: policy() } as Partial<VerificationGateInput>))
    expect(gate).toEqual({ kind: 'paused', reason: 'verification-policy-mismatch' })
  })

  it('H4：policy_id/version/goal hash 全部匹配才 authorized', () => {
    const expected = policy()
    const goalSha = createHash('sha256').update(expected.goal).digest('hex')
    const gate = evaluateVerificationGate(gateInput({
      expectedAutomationPolicy: expected,
      verification: { ...passResult(), automation_policy: {
        policy_id: expected.policy_id, policy_version: expected.policy_version, goal_sha256: goalSha,
      } },
    } as Partial<VerificationGateInput>))
    expect(gate.kind).toBe('authorized')
  })

  it('host-verifier trusted passed + subject 全符 + SHA 相符 → authorized', () => {
    const gate = evaluateVerificationGate(gateInput())
    expect(gate.kind).toBe('authorized')
  })

  it('human-review trusted passed + SHA 相符 → authorized', () => {
    const gate = evaluateVerificationGate(gateInput({
      verification: passResult({ issuer: { kind: 'human-review', actor_id: 'u1', trusted: true } }),
    }))
    expect(gate.kind).toBe('authorized')
  })

  it('verification 缺席（undefined）→ paused，reason=verification-missing（fail-closed）', () => {
    const gate = evaluateVerificationGate(gateInput({ verification: undefined }))
    expect(gate).toEqual({ kind: 'paused', reason: 'verification-missing' })
  })

  it('sandbox-report 自报 passed（untrusted）→ paused，reason=verification-untrusted（不因 verdict=passed 授权）', () => {
    const gate = evaluateVerificationGate(gateInput({
      verification: passResult({ issuer: { kind: 'sandbox-report', runner: 'claude-code', trusted: false } }),
    }))
    expect(gate).toEqual({ kind: 'paused', reason: 'verification-untrusted' })
  })

  it('trusted 但 verdict=inconclusive → paused，reason=verification-inconclusive（不折成 pass）', () => {
    const gate = evaluateVerificationGate(gateInput({ verification: passResult({ verdict: 'inconclusive', evidence: [] }) }))
    expect(gate).toEqual({ kind: 'paused', reason: 'verification-inconclusive' })
  })

  it('trusted 且 verdict=failed → failure（同失败路，不折成 paused）', () => {
    const gate = evaluateVerificationGate(gateInput({ verification: passResult({ verdict: 'failed', evidence: [] }) }))
    expect(gate.kind).toBe('failure')
  })

  it('untrusted 且 verdict=failed → 仍归 untrusted（trusted 判定先于 verdict 判定，不因 failed 短路成 failure）', () => {
    const gate = evaluateVerificationGate(gateInput({
      verification: passResult({ verdict: 'failed', evidence: [], issuer: { kind: 'sandbox-report', runner: 'r', trusted: false } }),
    }))
    expect(gate).toEqual({ kind: 'paused', reason: 'verification-untrusted' })
  })

  it('trusted passed 但 subject SHA 与 merge candidate buildSha 不符 → paused，reason=verification-subject-mismatch（fail-closed，绝不 merge）', () => {
    const gate = evaluateVerificationGate(gateInput({ buildSha: 'b'.repeat(40) }))
    expect(gate).toEqual({ kind: 'paused', reason: 'verification-subject-mismatch' })
  })

  it('buildSha 缺席（noop）+ verification 也缺席 → paused/verification-missing（调用方按 noop 优先级另行短路，此谓词本身不知道 noop）', () => {
    const gate = evaluateVerificationGate(gateInput({ verification: undefined, buildSha: undefined }))
    expect(gate).toEqual({ kind: 'paused', reason: 'verification-missing' })
  })

  describe('H7-S2（r2 §3 收口）：expectedSubject 三字段比对——scheduler 绕过 lifecycle 直连时，一个"别的 change/attempt/workflow_run 的合法结果+相同 buildSha"必须被拦下，不能只比 revision SHA', () => {
    it('canonical.subject.workflow_run_id 与 expectedSubject.workflow_run_id 不符（attempt/change/SHA 均符）→ paused/verification-subject-mismatch', () => {
      const gate = evaluateVerificationGate(gateInput({ expectedSubject: { workflow_run_id: 'wfr-OTHER', attempt_id: 'att-1', change: 'c' } }))
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-subject-mismatch' })
    })

    it('canonical.subject.attempt_id 与 expectedSubject.attempt_id 不符（别的 attempt 的合法结果）→ paused/verification-subject-mismatch，绝不 authorized', () => {
      const gate = evaluateVerificationGate(gateInput({ expectedSubject: { workflow_run_id: 'wfr-1', attempt_id: 'att-OTHER', change: 'c' } }))
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-subject-mismatch' })
    })

    it('canonical.subject.change 与 expectedSubject.change 不符（别的 change 的合法结果 + 相同 buildSha——r2 §3 原文场景）→ paused/verification-subject-mismatch，绝不 authorized', () => {
      const gate = evaluateVerificationGate(gateInput({ expectedSubject: { workflow_run_id: 'wfr-1', attempt_id: 'att-1', change: 'OTHER-CHANGE' } }))
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-subject-mismatch' })
    })

    it('回归：expectedSubject 三字段与 canonical.subject 全部相符（+ SHA 符）→ authorized（不误伤归属一致的诚实调用）', () => {
      const gate = evaluateVerificationGate(gateInput())
      expect(gate.kind).toBe('authorized')
    })
  })

  describe('H7-S2（阻断5 custom fail-closed）：requireWorkflowBinding——custom workflow 的核验结果必须真落在 workflow-transition binding，否则即便 trusted+passed+subject+SHA 全符也不放行', () => {
    it('requireWorkflowBinding=true + canonical.binding.kind=default-transition（坐标未真正解析）→ paused，新 reason=verification-binding-unresolved', () => {
      const gate = evaluateVerificationGate(gateInput({ requireWorkflowBinding: true }))
      // passResult() 默认 binding 就是 { kind: 'default-transition', event: 'verify-pass' }
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-binding-unresolved' })
    })

    it('requireWorkflowBinding=true + canonical.binding.kind=workflow-transition（坐标已真正解析）→ authorized', () => {
      const gate = evaluateVerificationGate(gateInput({
        requireWorkflowBinding: true,
        verification: passResult({ binding: { kind: 'workflow-transition', workflow_digest: 'd1', workflow: 'ship', step: 'verify', event: 'verify-pass' } }),
      }))
      expect(gate.kind).toBe('authorized')
    })

    it('回归：requireWorkflowBinding=false（default workflow 语义）+ default-transition binding → authorized（不加此限制，行为不变）', () => {
      const gate = evaluateVerificationGate(gateInput({ requireWorkflowBinding: false }))
      expect(gate.kind).toBe('authorized')
    })

    it('requireWorkflowBinding 判定不越权掩盖更根本的诊断：untrusted + requireWorkflowBinding=true + default-transition → 仍是 verification-untrusted（trusted 判定优先级更高）', () => {
      const gate = evaluateVerificationGate(gateInput({
        requireWorkflowBinding: true,
        verification: passResult({ issuer: { kind: 'sandbox-report', runner: 'r', trusted: false } }),
      }))
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-untrusted' })
    })

    it('requireWorkflowBinding 判定不越权掩盖 subject-mismatch：subject 不符 + requireWorkflowBinding=true + default-transition → 仍是 verification-subject-mismatch（subject 判定先于 binding 判定）', () => {
      const gate = evaluateVerificationGate(gateInput({
        requireWorkflowBinding: true,
        expectedSubject: { workflow_run_id: 'wfr-1', attempt_id: 'att-1', change: 'OTHER-CHANGE' },
      }))
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-subject-mismatch' })
    })
  })

  describe('H7 复审阻断2 核心修复：gate 独立重校验完整 result——不再只信 issuer.trusted 布尔（第二道防线，绕过 enforceVerificationBoundary 直调）', () => {
    it('复审 §2 原文 PoC：sandbox-report 冒充 trusted:true + verdict passed + evidence 空 + SHA 相符 → 仍 paused/verification-untrusted，绝不 authorized', () => {
      const forged = {
        issuer: { kind: 'sandbox-report', trusted: true },
        verdict: 'passed',
        evidence: [],
        subject: { revision: { sha: SHA } },
      } as unknown as VerificationResult
      const gate = evaluateVerificationGate(gateInput({ verification: forged }))
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-untrusted' })
    })

    it('verdict=garbage（闭集外字面量）+ trusted true + SHA 相符 → paused/verification-untrusted，不越过 failed/inconclusive 分支误判 authorized', () => {
      const forged = { ...passResult(), verdict: 'garbage' } as unknown as VerificationResult
      const gate = evaluateVerificationGate(gateInput({ verification: forged }))
      expect(gate.kind).not.toBe('authorized')
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-untrusted' })
    })

    it('host-verifier trusted:true + verdict passed 但零 evidence（schema 非法：passed 裸判决）→ paused/verification-untrusted，不 authorized', () => {
      const forged = { ...passResult(), evidence: [] } as unknown as VerificationResult
      const gate = evaluateVerificationGate(gateInput({ verification: forged }))
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-untrusted' })
    })

    it('repo-file evidence.revision_sha ≠ subject.revision.sha（阻断3）即便 trusted+passed+buildSha 都相符 → paused/verification-untrusted，不 authorized', () => {
      const forged = {
        ...passResult(),
        evidence: [{ kind: 'repo-file', path: 'a.ts', sha256: 'b'.repeat(64), revision_sha: 'c'.repeat(40) }],
      } as unknown as VerificationResult
      const gate = evaluateVerificationGate(gateInput({ verification: forged }))
      expect(gate).toEqual({ kind: 'paused', reason: 'verification-untrusted' })
    })

    it('schema_version 错（非法 result 的另一种坏法）+ trusted true + SHA 相符 → paused，不 authorized', () => {
      const forged = { ...passResult(), schema_version: 2 } as unknown as VerificationResult
      const gate = evaluateVerificationGate(gateInput({ verification: forged }))
      expect(gate.kind).not.toBe('authorized')
    })
  })

  describe('H7-S2 敌意读取：evidence 四拍循环 getter 直喂 gate（绕过 boundary，第二道防线独立生效）', () => {
    it('循环 getter（[]→[]→[revision_sha 不符的 repo-file]→[] 循环）→ 非 authorized', () => {
      let reads = 0
      const phases: unknown[] = [
        [],
        [],
        [{ kind: 'repo-file', path: 'a.ts', sha256: 'b'.repeat(64), revision_sha: 'c'.repeat(40) }],
        [],
      ]
      const forged = {
        ...passResult(),
        get evidence() { return phases[reads++ % phases.length] },
      } as unknown as VerificationResult
      const gate = evaluateVerificationGate(gateInput({ verification: forged }))
      expect(gate.kind).not.toBe('authorized')
    })
  })
})
