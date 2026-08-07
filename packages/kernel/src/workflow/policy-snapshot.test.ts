import { describe, expect, it } from 'vitest'
import { builtinTrack } from '../tracks/builtins.js'
import {
  compileEffectiveWorkflowPlan,
  DocumentGovernanceBindingError,
  effectiveWorkflowPlanFromSnapshot,
  workflowPlanSnapshot,
} from './effective-plan.js'

describe('workflow policy snapshot v3', () => {
  it('writes explicit normalized frozen policies and restores them', () => {
    const plan = compileEffectiveWorkflowPlan('default')
    const snapshot = workflowPlanSnapshot(plan)

    expect(snapshot.version).toBe(3)
    if (snapshot.version !== 3) throw new Error('expected v3 snapshot')
    expect(snapshot.decomposition).toEqual(plan.workflow.decomposition)
    expect(snapshot.interaction).toEqual(plan.workflow.interaction)
    expect(effectiveWorkflowPlanFromSnapshot(snapshot).workflow.decomposition).toEqual(snapshot.decomposition)
  })

  it('changes the workflow fingerprint for policy changes but not Track overlay changes', () => {
    const base = compileEffectiveWorkflowPlan('policy-fingerprint', {
      name: 'policy-fingerprint',
      steps: [{
        id: 'one', label: 'One', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [],
      }],
    })
    const changed = compileEffectiveWorkflowPlan('policy-fingerprint', {
      name: 'policy-fingerprint',
      interaction: { version: 'v1', mode: 'recommended-defaults' },
      steps: [{
        id: 'one', label: 'One', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [],
      }],
    })
    const trackChanged = compileEffectiveWorkflowPlan('policy-fingerprint', {
      name: 'policy-fingerprint',
      steps: [{
        id: 'one', label: 'One', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [],
      }],
    }, builtinTrack('backend'))

    expect(changed.workflowFingerprint).not.toBe(base.workflowFingerprint)
    expect(trackChanged.workflowFingerprint).toBe(base.workflowFingerprint)
  })

  it('rejects V3 policy tampering even when only the redundant frozen policy field changes', () => {
    const snapshot = workflowPlanSnapshot(compileEffectiveWorkflowPlan('default'))
    if (snapshot.version !== 3) throw new Error('expected v3 snapshot')

    expect(() => effectiveWorkflowPlanFromSnapshot({
      ...snapshot,
      interaction: { version: 'v1', mode: 'afk' },
    })).toThrow(DocumentGovernanceBindingError)
  })

  it('validates historical V2 with its old hash before projecting safe defaults without rehashing', () => {
    const current = compileEffectiveWorkflowPlan('default')
    const { decomposition: _decomposition, interaction: _interaction, ...legacyWorkflow } = current.workflow
    const restored = effectiveWorkflowPlanFromSnapshot({
      version: 2,
      workflowId: 'default',
      executionModel: 'phase-manifest',
      workflow: legacyWorkflow,
      documentPolicy: current.documentPolicy ?? null,
      workflowFingerprint: 'e0a5f815ec73ffe72c082ed7ca4b2f92ede3623d6d2ccdbe8bde97ceb678e35f',
    })

    expect(restored.workflowFingerprint)
      .toBe('e0a5f815ec73ffe72c082ed7ca4b2f92ede3623d6d2ccdbe8bde97ceb678e35f')
    expect(restored.workflow.decomposition.mode).toBe('off')
    expect(restored.workflow.interaction.mode).toBe('interactive')

    const persistedAgain = workflowPlanSnapshot(restored)
    expect(persistedAgain.version).toBe(2)
    const restoredAgain = effectiveWorkflowPlanFromSnapshot(persistedAgain)
    expect(restoredAgain.workflowFingerprint).toBe(restored.workflowFingerprint)
    expect(restoredAgain.workflow.decomposition.mode).toBe('off')
  })
})
