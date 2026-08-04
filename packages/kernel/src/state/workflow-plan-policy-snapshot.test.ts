import { describe, expect, it } from 'vitest'
import { compileEffectiveWorkflowPlan, workflowPlanSnapshot } from '../workflow/effective-plan.js'
import { parseWorkflowPlanSnapshot, workflowPlanSnapshotContent } from './workflow-plan-snapshot.js'

describe('workflow plan policy snapshot codec', () => {
  it('parses a V3 sidecar and preserves the frozen policies', () => {
    const snapshot = workflowPlanSnapshot(compileEffectiveWorkflowPlan('default'))
    const envelope = parseWorkflowPlanSnapshot(workflowPlanSnapshotContent('run-1', snapshot))

    expect(envelope.plan.version).toBe(3)
    if (envelope.plan.version !== 3) throw new Error('expected v3')
    expect(envelope.plan.decomposition.mode).toBe('off')
    expect(envelope.plan.interaction.mode).toBe('interactive')
  })

  it('rejects unknown V3 sidecar fields', () => {
    const snapshot = workflowPlanSnapshot(compileEffectiveWorkflowPlan('default'))
    expect(() => parseWorkflowPlanSnapshot(JSON.stringify({
      version: 1,
      run_id: 'run-1',
      plan: { ...snapshot, surprise: true },
    }))).toThrow(/形状非法/)
  })
})
