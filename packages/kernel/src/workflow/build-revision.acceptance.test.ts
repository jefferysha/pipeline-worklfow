import { describe, expect, it } from 'vitest'
import { emptyFields } from '../state/parse.js'
import type { PipelineState } from '../types.js'
import { allFields } from './test-support.js'
import { checkDefaultEventPreconditions } from '../flow/default-event-policy.js'
import {
  assessBuildRevisionTrust,
  createBuildRevisionToken,
  makeBuildRevisionBlocker,
  safeRevisionHash,
} from './build-revision.js'
import { ACTION_HANDLERS } from './action-handlers.js'
import { evaluateGuards } from './guard-handlers.js'
import { compileWorkflow } from './compile.js'
import { effectiveWorkflowPlanFromIr } from './effective-plan.js'
import { readinessByTransition } from './transition-readiness.js'
import { mergeLifecycleGuards, semanticRevisionLifecyclePolicy } from './governed-lifecycle-policy.js'
import type { WorkflowDef } from './types.js'

const identity = {
  repository: '/repo.git',
  worktree: '/repo\\0/repo.git/worktrees/change',
} as const
const revision = 'a'.repeat(40)
const token = createBuildRevisionToken('git', revision, identity)

function trustedAssessment(
  override: Partial<Parameters<typeof assessBuildRevisionTrust>[0]> = {},
) {
  return (request: Parameters<NonNullable<import('./ir.js').GuardInput['assessBuildRevision']>>[0]) =>
    assessBuildRevisionTrust({
      ...request,
      observe: async () => ({ kind: 'git' as const, revision, identity }),
      provenance: async () => ({
        currentStep: request.expectedStep ?? 'verify',
        stateHash: request.stateHash,
        stateBuildSha: token.value,
        recordTo: request.expectedStep ?? 'verify',
        buildShaEffects: [token.value],
      }),
      ...override,
    })
}

describe('issue #42 kernel acceptance seams', () => {
  it('capture action requires a canonical token and leaves fields untouched', async () => {
    const fields = allFields({ isolation: 'branch', build_sha: 'legacy' })
    const out = await ACTION_HANDLERS['freeze-build-sha']({ type: 'freeze-build-sha' }, {
      fields,
      clock: () => '2026-08-10T00:00:00Z',
      captureBuildRevision: async () => token.value,
    })
    expect(out).toEqual({ patch: { build_sha: token.value }, signals: [] })
    expect(fields.build_sha).toBe('legacy')
  })

  it.each([
    ['missing capability', undefined, 'capability-unavailable'],
    ['legacy SHA', async () => revision, 'malformed'],
    ['wrong token kind', async () => createBuildRevisionToken('workspace', 'workspace:sha256:' + 'b'.repeat(64), identity).value, 'malformed'],
    ['surrounding whitespace', async () => ` ${token.value}\n`, 'malformed'],
  ] as const)('capture failure %s is typed and does not write a patch', async (_label, capture, reason) => {
    const fields = allFields({ isolation: 'branch', build_sha: 'before' })
    const input = {
      fields,
      clock: () => '2026-08-10T00:00:00Z',
      ...(capture === undefined ? {} : { captureBuildRevision: capture }),
    }
    await expect(ACTION_HANDLERS['freeze-build-sha']({ type: 'freeze-build-sha' }, input))
      .rejects.toMatchObject({ blocker: makeBuildRevisionBlocker(reason) })
    expect(fields.build_sha).toBe('before')
  })

  it('build-head guard maps every untrusted assessment to a stable blocker, never skipped', async () => {
    const guard = { type: 'build-head-unchanged', field: 'build_sha' } as const
    const cases: readonly [string, unknown, string][] = [
      ['missing', undefined, 'missing'],
      ['null', null, 'null'],
      ['ambiguous', [token.value], 'ambiguous'],
      ['legacy', revision, 'malformed'],
      ['malformed', 'build:v1:git:bad', 'malformed'],
      ['39-char git SHA', 'a'.repeat(39), 'malformed'],
      ['41-char git SHA', 'a'.repeat(41), 'malformed'],
      ['63-char git SHA', 'a'.repeat(63), 'malformed'],
      ['65-char git SHA', 'a'.repeat(65), 'malformed'],
    ]
    for (const [_label, buildSha, reason] of cases) {
      const fields = allFields({ isolation: 'branch', build_sha: buildSha as never })
      const evaluations = await evaluateGuards([guard], {
        fields,
        track: 'backend',
        currentStep: 'verify',
        assessBuildRevision: trustedAssessment(),
      })
      expect(evaluations[0]?.decision).toMatchObject({
        kind: 'failed',
        blocker: { code: 'verify-build-revision-untrusted', reason },
      })
    }
  })

  it.each([
    ['capability unavailable', undefined, 'capability-unavailable'],
    ['evaluator exception', async () => { throw new Error('/private/project') }, 'evaluation-error'],
  ] as const)('guard %s is fail-closed and privacy-safe', async (_label, assessor, reason) => {
    const fields = allFields({ isolation: 'branch', build_sha: token.value })
    const evaluations = await evaluateGuards([{ type: 'build-head-unchanged', field: 'build_sha' }], {
      fields,
      track: 'backend',
      currentStep: 'verify',
      ...(assessor === undefined ? {} : {
        assessBuildRevision: async () => assessor(),
      }),
    })
    expect(evaluations[0]?.decision).toMatchObject({
      kind: 'failed',
      blocker: { code: 'verify-build-revision-untrusted', reason },
    })
    expect(JSON.stringify(evaluations)).not.toContain('/private/project')
  })

  it.each([
    ['revision-stale', async () => ({ kind: 'git' as const, revision: 'b'.repeat(40), identity })],
    ['project-mismatch', async () => ({ kind: 'git' as const, revision, identity: { ...identity, repository: '/other.git' } })],
    ['worktree-mismatch', async () => ({ kind: 'git' as const, revision, identity: { ...identity, worktree: '/other\\0/worktree' } })],
  ] as const)('assessment rejects %s with stable reason', async (reason, observe) => {
    const result = await assessBuildRevisionTrust({
      buildSha: token.value,
      isolation: 'branch',
      expectedStep: 'verify',
      stateHash: safeRevisionHash({ phase: 'verify' }),
      observe,
      provenance: async () => ({
        currentStep: 'verify',
        stateBuildSha: token.value,
        recordTo: 'verify',
        buildShaEffects: [token.value],
      }),
    })
    expect(result).toMatchObject({ trusted: false, blocker: { reason } })
  })

  it('semantic lifecycle captures only on Build entry, guards Verify exits, and leaves rollback open', () => {
    const workflow: WorkflowDef = {
      name: 'arbitrary-build',
      steps: [
        {
          id: 'implement-anything', label: 'Implement', gate: null, skills: [],
          inputs: [], outputs: [{ field: 'build_sha', type: 'string' }], guards: [],
          transitions: [{ event: 'ready-for-review', to: 'review-anything', actions: [{ type: 'freeze-build-sha' }] }],
        },
        {
          id: 'review-anything', label: 'Review', gate: 'review', skills: [],
          inputs: [{ field: 'build_sha', type: 'string' }], outputs: [],
          guards: [{ type: 'build-head-unchanged', field: 'build_sha' }], transitions: [],
        },
      ],
    }
    const ir = compileWorkflow(workflow)
    const from = ir.steps[0]!
    const to = ir.steps[1]!
    const entryPolicy = semanticRevisionLifecyclePolicy(from, from.transitions[0]!, to)
    expect(entryPolicy).toEqual({
      actions: [{ type: 'freeze-build-sha' }],
      guards: [],
    })

    const verify = { ...to, transitions: [
      { event: 'accept', to: 'ship-anything', actions: [] },
      { event: 'reject', to: 'implement-anything', actions: [{ type: 'mark-verification-failed' as const }] },
    ] }
    const ship = { id: 'ship-anything', label: 'Ship', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }
    const successPolicy = semanticRevisionLifecyclePolicy(verify, verify.transitions[0]!, ship)
    expect(successPolicy).toEqual({ actions: [], guards: [{ type: 'build-head-unchanged', field: 'build_sha' }] })
    const rollbackPolicy = semanticRevisionLifecyclePolicy(verify, verify.transitions[1]!, from)
    expect(rollbackPolicy).toBeUndefined()

    const explicit = mergeLifecycleGuards(
      [{ type: 'build-head-unchanged', field: 'build_sha' }],
      successPolicy?.guards,
    )
    expect(explicit).toEqual([{ type: 'build-head-unchanged', field: 'build_sha' }])
  })

  it('readiness repeats a valid assessment idempotently and does not mutate state', async () => {
    const workflow: WorkflowDef = {
      name: 'readiness-anything',
      steps: [
        {
          id: 'review-anything', label: 'Review', gate: null, skills: [],
          inputs: [{ field: 'build_sha', type: 'string' }], outputs: [], guards: [],
          transitions: [{ event: 'accept', to: 'ship-anything' }],
        },
        { id: 'ship-anything', label: 'Ship', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }
    const plan = effectiveWorkflowPlanFromIr('readiness-anything', compileWorkflow(workflow))
    const fields = { ...emptyFields(), phase: 'review-anything', track: 'backend', isolation: 'branch', build_sha: token.value }
    const state: PipelineState = { fields: fields as PipelineState['fields'], opaqueTail: '' }
    const before = structuredClone(state)
    const context = { changeDirAbs: '/tmp/issue-42-readiness', assessBuildRevision: trustedAssessment() }
    const first = await readinessByTransition(plan, state, context)
    const second = await readinessByTransition(plan, state, context)
    expect(first).toEqual(second)
    expect(first['review-anything']?.accept).toEqual({ ready: true, blockers: [] })
    expect(state).toEqual(before)
  })

  it.each([
    ['built-in backend', 'backend', 'default'],
    ['built-in backend', 'backend', 'custom'],
    ['free track', 'free', 'default'],
    ['free track', 'free', 'custom'],
    ['arbitrary custom track', 'custom-id', 'default'],
    ['arbitrary custom track', 'custom-id', 'custom'],
  ] as const)('revision trust guard is not bypassed by %s in %s workflow', async (_label, track, path) => {
    let calls = 0
    const blocker = makeBuildRevisionBlocker('revision-stale')
    const assessor: NonNullable<import('./ir.js').GuardInput['assessBuildRevision']> = async () => {
      calls += 1
      return { trusted: false, blocker }
    }
    const fields = allFields({
      phase: 'verify', track, isolation: 'branch', build_sha: token.value,
      verification_report: 'docs/v.md', branch_status: 'handled',
      agent_review_result: 'pass', codex_review_result: 'pass',
    })
    const result = path === 'default'
      ? await checkDefaultEventPreconditions('verify-pass', {
          fields: fields as PipelineState['fields'], opaqueTail: '',
        }, { fileExists: () => true, assessBuildRevision: assessor })
      : await evaluateGuards([{ type: 'build-head-unchanged', field: 'build_sha' }], {
          fields,
          track,
          currentStep: 'review-anything',
          assessBuildRevision: assessor,
        })
    if (path === 'default') {
      expect(result).toEqual([
        'ERROR: verify-pass revision trust blocked (code=verify-build-revision-untrusted reason=revision-stale)',
        '  修复：return-to-build-and-capture-current-revision',
      ])
    } else {
      expect(result[0]?.decision).toMatchObject({
        kind: 'failed',
        blocker: { code: 'verify-build-revision-untrusted', reason: 'revision-stale' },
      })
    }
    expect(calls).toBe(1)
  })
})
