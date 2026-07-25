import { describe, expect, it } from 'vitest'
import {
  compileEffectiveWorkflowPlan,
  documentGovernanceFingerprint,
  DocumentGovernanceBindingError,
  effectiveWorkflowPlanBinding,
  resolveBoundEffectiveWorkflowPlan,
  workflowPlanSnapshot,
} from './effective-plan.js'
import { builtinTrack } from '../tracks/builtins.js'

describe('compileEffectiveWorkflowPlan', () => {
  it('compiles default through the shared immutable plan surface', () => {
    const plan = compileEffectiveWorkflowPlan('default', undefined, builtinTrack('backend'))
    expect(plan.executionModel).toBe('phase-manifest')
    expect(plan.projection.steps.map((step) => step.id)).toEqual([
      'open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive',
    ])
    expect(plan.documentPolicy?.id).toBe('openspec-v1')
    expect(plan.skillPolicy).toBe('manifest-overlay')
    expect(plan.capabilities).toMatchObject({
      execution: { model: 'phase-manifest' },
      skills: {
        source: 'manifest-overlay',
        trackOverlay: { matrix: true, profile: 'backend' },
      },
      documents: { profile: 'legacy-full', governed: true },
      review: { steps: ['explore', 'spec', 'verify'] },
      automation: { eligible: true, autoEnqueueOnSpecComplete: false },
      track: { id: 'backend', coverageProfile: 'backend' },
    })
    const documentPolicy = plan.documentPolicy
    if (documentPolicy === undefined) throw new Error('expected default document policy')
    expect(effectiveWorkflowPlanBinding(plan)).toEqual({
      documentProfile: 'legacy-full',
      documentGovernanceFingerprint: documentGovernanceFingerprint(documentPolicy),
      workflowPlanFingerprint: plan.workflowFingerprint,
    })
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.capabilities.skills.steps)).toBe(true)
    expect(Object.isFrozen(plan.workflow.steps)).toBe(true)
  })

  it('free is an explicit neutral overlay and never removes workflow-owned policy', () => {
    const plan = compileEffectiveWorkflowPlan('default', undefined, builtinTrack('free'))

    expect(plan.projection.steps).toHaveLength(7)
    expect(plan.documentPolicy?.id).toBe('openspec-v1')
    expect(plan.capabilities.track).toEqual({
      id: 'free',
      coverageProfile: 'none',
      routingEnabled: false,
    })
    expect(plan.capabilities.skills.trackOverlay).toEqual({ matrix: false, profile: 'free' })
    expect(plan.capabilities.automation).toEqual({
      eligible: false,
      autoEnqueueOnSpecComplete: false,
    })
  })

  it('keeps a three-step declarative contract three steps wide', () => {
    const plan = compileEffectiveWorkflowPlan('compact', {
      name: 'compact',
      documentContract: {
        version: 'v1',
        slots: [{ kind: 'proposal', ownerStep: 'shape', producers: ['writer'] }],
        reads: [{ step: 'implement', kinds: ['proposal'] }],
      },
      steps: [
        {
          id: 'shape', label: 'Shape', gate: null, skills: [{ id: 'writer' }],
          inputs: [], outputs: [], guards: [], transitions: [{ event: 'go', to: 'implement' }],
        },
        {
          id: 'implement', label: 'Implement', gate: null, skills: [],
          inputs: [], outputs: [], guards: [], transitions: [{ event: 'prove', to: 'verify' }],
        },
        {
          id: 'verify', label: 'Verify', gate: 'review', skills: [],
          inputs: [], outputs: [], guards: [], transitions: [],
        },
      ],
    })
    expect(plan.executionModel).toBe('step-graph')
    expect(plan.projection.steps.map((step) => step.id)).toEqual(['shape', 'implement', 'verify'])
    expect(plan.documentPolicy?.id).toBe('document-v1')
  })

  it('bound document governance cannot be removed or replaced by a mutable workflow definition', () => {
    const original = compileEffectiveWorkflowPlan('compact', {
      name: 'compact',
      documentContract: {
        version: 'v1',
        slots: [{ kind: 'proposal', ownerStep: 'shape', producers: ['writer'] }],
        reads: [{ step: 'implement', kinds: ['proposal'] }],
      },
      steps: [
        {
          id: 'shape', label: 'Shape', gate: null, skills: [{ id: 'writer' }],
          inputs: [], outputs: [], guards: [], transitions: [{ event: 'go', to: 'implement' }],
        },
        {
          id: 'implement', label: 'Implement', gate: null, skills: [],
          inputs: [], outputs: [], guards: [], transitions: [],
        },
      ],
    })
    const policy = original.documentPolicy
    if (!policy) throw new Error('expected governed plan')
    const binding = {
      documentProfile: 'document-v1' as const,
      documentGovernanceFingerprint: documentGovernanceFingerprint(policy),
    }

    expect(() => resolveBoundEffectiveWorkflowPlan('compact', binding, () => null))
      .toThrow(DocumentGovernanceBindingError)

    const ungoverned = compileEffectiveWorkflowPlan('compact', {
      name: 'compact',
      steps: original.workflow.steps,
    })
    expect(() => resolveBoundEffectiveWorkflowPlan('compact', binding, () => ungoverned.workflow))
      .toThrow(/document governance.*不可降级/)

    const changed = compileEffectiveWorkflowPlan('compact', {
      name: 'compact',
      documentContract: {
        version: 'v1',
        slots: [{ kind: 'tasks', ownerStep: 'shape', producers: ['writer'] }],
        reads: [{ step: 'implement', kinds: ['tasks'] }],
      },
      steps: original.workflow.steps,
    })
    expect(() => resolveBoundEffectiveWorkflowPlan('compact', binding, () => changed.workflow))
      .toThrow(/fingerprint/)
  })

  it('a bound workflow plan rejects graph, skill, or review drift even when documents are unchanged', () => {
    const definition = {
      name: 'compact',
      documentContract: {
        version: 'v1' as const,
        slots: [{ kind: 'proposal', ownerStep: 'shape', producers: ['writer'] }],
        reads: [],
      },
      steps: [
        {
          id: 'shape', label: 'Shape', gate: null, skills: [{ id: 'writer' }],
          inputs: [], outputs: [], guards: [], transitions: [{ event: 'go', to: 'done' }],
        },
        {
          id: 'done', label: 'Done', gate: null, skills: [],
          inputs: [], outputs: [], guards: [], transitions: [],
        },
      ],
    }
    const original = compileEffectiveWorkflowPlan('compact', definition)
    const binding = effectiveWorkflowPlanBinding(original)
    const drifted = compileEffectiveWorkflowPlan('compact', {
      ...definition,
      steps: definition.steps.map((step) => step.id === 'shape'
        ? { ...step, gate: 'review' as const, skills: [{ id: 'writer' }, { id: 'other-writer' }] }
        : step),
    })

    expect(drifted.documentPolicy).toEqual(original.documentPolicy)
    expect(() => resolveBoundEffectiveWorkflowPlan(
      'compact',
      binding,
      () => drifted.workflow,
    )).toThrow(/workflow plan fingerprint/)

    const pinned = resolveBoundEffectiveWorkflowPlan(
      'compact',
      binding,
      () => drifted.workflow,
      undefined,
      workflowPlanSnapshot(original),
    )
    expect(pinned?.workflowFingerprint).toBe(original.workflowFingerprint)
    expect(pinned?.capabilities.review.steps).toEqual([])
  })

  it('profile-only old runs retain compatibility but still cannot downgrade to ungoverned', () => {
    const governed = compileEffectiveWorkflowPlan('compact', {
      name: 'compact',
      documentContract: {
        version: 'v1',
        slots: [{ kind: 'proposal', ownerStep: 'shape', producers: ['writer'] }],
        reads: [],
      },
      steps: [{
        id: 'shape', label: 'Shape', gate: null, skills: [{ id: 'writer' }],
        inputs: [], outputs: [], guards: [], transitions: [],
      }],
    })
    expect(resolveBoundEffectiveWorkflowPlan(
      'compact',
      { documentProfile: 'document-v1' },
      () => governed.workflow,
    )?.documentPolicy?.id).toBe('document-v1')
    expect(() => resolveBoundEffectiveWorkflowPlan(
      'compact',
      { documentProfile: 'document-v1' },
      () => compileEffectiveWorkflowPlan('compact', { name: 'compact', steps: governed.workflow.steps }).workflow,
    )).toThrow(/不可降级/)
  })
})
