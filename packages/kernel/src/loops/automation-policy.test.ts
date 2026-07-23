import { describe, expect, it } from 'vitest'
import { compileAutomationPolicySnapshot, evaluateConstraintPolicy, validateAutomationPolicySnapshot } from './automation-policy.js'
import type { LoopEntry } from './types.js'

const loop = (overrides: Partial<LoopEntry> = {}): LoopEntry => ({
  id: 'loop-a', name: 'Loop A', kind: 'executor', goal: 'Keep the build green', cadence: 'manual',
  risk: 'medium', runner: 'codex', change_prefix: 'loop-a-', phases: ['build'], human_gates: ['review'],
  state: 'legacy-active', design_doc: 'docs/loop-a.md', status: 'active',
  budget: { max_runs_per_day: 3, max_in_flight: 1, max_tokens_per_day: 1000, tokens_per_run: 200, on_exceed: 'pause-loop' },
  kill_criteria: ['three repeated failures'], autonomy_level: 'L3', allowlist: ['src/**'], denylist: ['src/secrets/**'],
  skill_bundle_id: 'backend', ...overrides,
})

describe('AutomationPolicySnapshot · H4/H5/H6/H8', () => {
  it('compiles a closed, versioned snapshot from one loop and freezes goal/constraints/budget/kill/verifier/skills', () => {
    const policy = compileAutomationPolicySnapshot(loop(), { capturedAt: '2026-07-19T00:00:00Z' })
    expect(policy).toMatchObject({
      schema_version: 1,
      policy_id: 'loop-a',
      loop_id: 'loop-a',
      goal: 'Keep the build green',
      constraints: {
        schema_version: 1,
        admission: { require_active: true },
        write: { allowlist: ['src/**'], denylist: ['src/secrets/**'] },
        transition: { require_active: true, human_gates: ['review'] },
        merge: { require_active: true, allowlist: ['src/**'], denylist: ['src/secrets/**'] },
      },
      budget: { max_runs_per_day: 3, max_in_flight: 1, max_tokens_per_day: 1000, tokens_per_run: 200, on_exceed: 'pause-loop' },
      kill_policy: { required_status: 'active', on_inactive: 'skip-run', recheck: ['schedule', 'pre-claim', 'transition', 'settlement'] },
      verifier_binding: { kind: 'runtime-verifier', verifier: 'pipeline-git-integrity', version: '1' },
      skill_bundle_id: 'backend',
    })
    expect(policy.policy_version).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.constraints.write.allowlist)).toBe(true)
  })

  it('policy_version is content-derived: capture time does not change it, goal/constraints do', () => {
    const a = compileAutomationPolicySnapshot(loop(), { capturedAt: '2026-07-19T00:00:00Z' })
    const b = compileAutomationPolicySnapshot(loop(), { capturedAt: '2026-07-20T00:00:00Z' })
    const c = compileAutomationPolicySnapshot(loop({ goal: 'Different goal' }), { capturedAt: '2026-07-19T00:00:00Z' })
    expect(a.policy_version).toBe(b.policy_version)
    expect(c.policy_version).not.toBe(a.policy_version)
  })

  it('unknown on_exceed fails loud instead of silently becoming skip-run', () => {
    expect(() => compileAutomationPolicySnapshot(loop({ budget: { ...loop().budget, on_exceed: 'ignore' } }), {
      capturedAt: '2026-07-19T00:00:00Z',
    })).toThrow(/on_exceed/)
  })

  it('validates persisted snapshots as a closed schema and rejects a forged content version', () => {
    const policy = compileAutomationPolicySnapshot(loop(), { capturedAt: '2026-07-19T00:00:00Z' })
    expect(validateAutomationPolicySnapshot(JSON.parse(JSON.stringify(policy)))).toEqual(policy)
    expect(() => validateAutomationPolicySnapshot({ ...policy, goal: 'forged after versioning' })).toThrow(/policy_version/)
    expect(() => validateAutomationPolicySnapshot({ ...policy, extra: true })).toThrow(/unknown key/)
  })

  it('one typed constraint evaluator governs admission/write/transition/merge decisions', () => {
    const constraints = compileAutomationPolicySnapshot(loop(), { capturedAt: '2026-07-19T00:00:00Z' }).constraints
    const matches = (path: string, glob: string): boolean => glob === 'src/**'
      ? path.startsWith('src/')
      : glob === 'src/secrets/**' && path.startsWith('src/secrets/')

    expect(evaluateConstraintPolicy(constraints, { operation: 'admission', active: false, matches })).toEqual({
      allowed: false, reason: 'loop-inactive',
    })
    expect(evaluateConstraintPolicy(constraints, { operation: 'write', active: true, paths: ['docs/a.md'], matches })).toMatchObject({
      allowed: false, reason: 'path-outside-allowlist', paths: ['docs/a.md'],
    })
    expect(evaluateConstraintPolicy(constraints, { operation: 'write', active: true, paths: ['src/secrets/key'], matches })).toMatchObject({
      allowed: false, reason: 'path-denied', paths: ['src/secrets/key'],
    })
    expect(evaluateConstraintPolicy(constraints, { operation: 'transition', active: true, humanGateSatisfied: false, matches })).toEqual({
      allowed: false, reason: 'human-gate-required',
    })
    expect(evaluateConstraintPolicy(constraints, { operation: 'merge', active: true, paths: ['src/app.ts'], humanGateSatisfied: true, matches })).toEqual({ allowed: true })
  })
})
