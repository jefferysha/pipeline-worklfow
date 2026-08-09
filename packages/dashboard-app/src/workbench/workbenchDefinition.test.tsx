import { describe, expect, it } from 'vitest'
import {
  cloneWorkflowDef,
  governedWorkflow,
  type WbWorkflowDef,
} from './workbenchDefinition'

describe('workbench Review contracts', () => {
  it('creates a finite governed Workflow with one explicit Verify lane scope', () => {
    const workflow = governedWorkflow('release-train')
    const verify = workflow.steps.find((step) => step.id === 'verify')

    expect(workflow.reviewBudget).toEqual({ version: 'v1', max_attempts: 2 })
    expect(verify?.reviewLanes).toEqual(['standards', 'spec', 'e2e'])
    expect(verify?.skills).toContainEqual({
      id: 'verification-before-completion',
      kind: 'review',
      review_lane: 'e2e',
    })
  })

  it('clones Review policy, lanes, and third-party Skill classification without aliasing', () => {
    const source: WbWorkflowDef = {
      name: 'source',
      reviewBudget: { version: 'v1', max_attempts: 4 },
      steps: [{
        id: 'verify',
        label: 'Verify',
        gate: 'review',
        reviewLanes: ['standards', 'e2e'],
        skills: [{ id: 'acme-quality-gate', kind: 'review', review_lane: 'standards' }],
        inputs: [],
        outputs: [],
        guards: [],
        transitions: [],
      }],
    }

    const cloned = cloneWorkflowDef(source, 'cloned')
    expect(cloned).toEqual({ ...source, name: 'cloned' })
    expect(cloned.reviewBudget).not.toBe(source.reviewBudget)
    expect(cloned.steps[0]?.reviewLanes).not.toBe(source.steps[0]?.reviewLanes)
    expect(cloned.steps[0]?.skills[0]).not.toBe(source.steps[0]?.skills[0])
  })
})
