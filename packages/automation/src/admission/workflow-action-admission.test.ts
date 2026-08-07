import { describe, expect, it } from 'vitest'
import { compileEffectiveWorkflowPlan, workflowPlanSnapshot } from '@tenon/kernel'
import {
  evaluateAfkWorkflowAdmission,
  evaluateBoundWorkflowDecompositionMaterialization,
} from './workflow-action-admission.js'

const valid = { status: 'valid', grants: ['enter-afk'] } as const

describe('evaluateAfkWorkflowAdmission', () => {
  it('allows AFK entry only when all five named layers grant the exact action', () => {
    expect(evaluateAfkWorkflowAdmission({
      interactionMode: 'afk',
      layers: { platform: valid, skill: valid, project: valid, workflow: valid, run: valid },
    })).toMatchObject({ allowed: true, status: 'allowed', denials: [] })
  })

  it('preserves the structured contributing layer when exact Run authority is missing', () => {
    const result = evaluateAfkWorkflowAdmission({
      interactionMode: 'afk',
      layers: {
        platform: valid,
        skill: valid,
        project: valid,
        workflow: valid,
        run: { status: 'missing', grants: [] },
      },
    })

    expect(result).toMatchObject({ allowed: false, status: 'hard-blocked' })
    expect(result.denials).toContainEqual(expect.objectContaining({ layer: 'run', code: 'run-missing' }))
  })

  it('does not infer AFK permission from an interactive Workflow', () => {
    const result = evaluateAfkWorkflowAdmission({
      interactionMode: 'interactive',
      layers: {
        platform: valid,
        skill: valid,
        project: valid,
        workflow: { status: 'valid', grants: [] },
        run: valid,
      },
    })

    expect(result).toMatchObject({ allowed: false, status: 'denied' })
    expect(result.denials).toContainEqual(expect.objectContaining({ layer: 'workflow', code: 'workflow-denied' }))
  })
})

describe('evaluateBoundWorkflowDecompositionMaterialization', () => {
  const plan = compileEffectiveWorkflowPlan('automation-decomposition', {
    name: 'automation-decomposition',
    decomposition: {
      version: 'v1', mode: 'auto-safe', target: 'work-items', strategy: 'balanced',
      max_items: 4, max_depth: 2, auto_when: ['independent-work-items'], ask_when: [],
    },
    steps: [{
      id: 'run', label: 'Run', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [],
    }],
  })
  const run = {
    id: 'run-1',
    workflowId: plan.id,
    workflowPlanFingerprint: plan.workflowFingerprint,
    workflowPlanSnapshot: workflowPlanSnapshot(plan),
  } as Parameters<typeof evaluateBoundWorkflowDecompositionMaterialization>[0]['run']
  const grant = { status: 'valid', grants: ['materialize-work-items'] } as const
  const base = {
    run,
    authority: {
      authority_id: 'authority-1',
      workflow_run_id: 'run-1',
      workflow_fingerprint: plan.workflowFingerprint,
    },
    layers: { platform: grant, skill: grant, project: grant, run: grant },
    candidate: {
      item_count: 2,
      resulting_depth: 1,
      matched_auto_when: ['independent-work-items'],
      triggered_ask_when: [],
      candidate_fingerprint: 'c'.repeat(64),
      classification: 'routine-reversible',
    },
  } as const

  it('consumes the frozen WorkflowRun policy at the production admission boundary', () => {
    expect(evaluateBoundWorkflowDecompositionMaterialization(base)).toMatchObject({
      action: 'materialize-work-items', allowed: true, status: 'allowed',
    })
  })

  it('fails closed when authority targets another frozen workflow fingerprint', () => {
    const result = evaluateBoundWorkflowDecompositionMaterialization({
      ...base,
      authority: { ...base.authority, workflow_fingerprint: 'b'.repeat(64) },
    })
    expect(result).toMatchObject({ allowed: false, status: 'stale' })
    expect(result.denials).toContainEqual(expect.objectContaining({
      layer: 'run', code: 'run-fingerprint-mismatch',
    }))
  })
})
