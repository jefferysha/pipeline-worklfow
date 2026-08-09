import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { emptyFields } from '../state/parse.js'
import { compileWorkflow } from './compile.js'
import { effectiveWorkflowPlanFromIr } from './effective-plan.js'
import { governedLifecyclePolicy } from './governed-lifecycle-policy.js'
import { readinessByTransition } from './transition-readiness.js'
import type { WorkflowDef } from './types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function governedWorkflow(): WorkflowDef {
  return {
    name: 'governed',
    openspecContract: 'required',
    steps: [
      {
        id: 'spec', label: 'Spec', gate: null, skills: [], inputs: [], outputs: [], guards: [],
        transitions: [{ event: 'start-build', to: 'build' }],
      },
      {
        id: 'build', label: 'Build', gate: null, skills: [], inputs: [],
        outputs: [{ field: 'build_sha', type: 'string' }], guards: [],
        transitions: [
          { event: 'complete', to: 'verify' },
          { event: 'revise', to: 'spec' },
        ],
      },
      {
        id: 'verify', label: 'Verify', gate: 'review', skills: [],
        inputs: [{ field: 'build_sha', type: 'string' }], outputs: [], guards: [],
        transitions: [
          { event: 'accept', to: 'ship' },
          // Governed rollback is inherited even when a custom YAML omits the action.
          { event: 'reject', to: 'build' },
        ],
      },
      {
        id: 'ship', label: 'Ship', gate: null, skills: [], inputs: [], outputs: [], guards: [],
        transitions: [],
      },
    ],
  }
}

describe('governed custom lifecycle 单一政策', () => {
  test('spec/build 回环都重置旧 pre-Verify pass', () => {
    expect(governedLifecyclePolicy(true, 'spec', 'build')?.actions)
      .toEqual([{ type: 'reset-pre-verify-review' }])
    expect(governedLifecyclePolicy(true, 'build', 'spec')?.actions)
      .toEqual([{ type: 'reset-pre-verify-review' }])
  })

  test('readiness 与真实 transition 同样合并 pre-Verify gate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-governed-readiness-'))
    roots.push(root)
    const fields = emptyFields()
    Object.assign(fields, {
      phase: 'build',
      track: 'backend',
      build_mode: 'direct',
      isolation: 'in-place',
      direct_override: 'true',
      pre_verify_review_result: 'pending',
    })
    const plan = effectiveWorkflowPlanFromIr(
      'governed',
      compileWorkflow(governedWorkflow()),
    )

    expect((await readinessByTransition(plan, {
      fields,
      opaqueTail: '',
    }, { changeDirAbs: root })).build?.complete).toEqual({
      ready: false,
      blockers: [{
        kind: 'guard-failed',
        guardType: 'field-equals',
        field: 'pre_verify_review_result',
        actual: 'pending',
        expected: ['pass'],
      }],
    })
  })

  test('governed custom rollback 未声明 action 仍不注入 revision guard', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-governed-rollback-readiness-'))
    roots.push(root)
    const fields = emptyFields()
    Object.assign(fields, {
      phase: 'verify',
      track: 'backend',
      isolation: 'in-place',
      build_sha: 'malformed-legacy-value',
      review_gate_phase: 'verify',
      review_gate_status: 'approved',
      review_gate_event: 'reject',
    })
    const plan = effectiveWorkflowPlanFromIr(
      'governed',
      compileWorkflow(governedWorkflow()),
    )

    const readiness = await readinessByTransition(plan, {
      fields,
      opaqueTail: '',
    }, { changeDirAbs: root })

    expect(readiness.verify?.reject).toEqual({ ready: true, blockers: [] })
    expect(readiness.verify?.accept?.ready).toBe(false)
    expect(readiness.verify?.accept?.blockers).toContainEqual(
      expect.objectContaining({ code: 'verify-build-revision-untrusted' }),
    )
  })
})
