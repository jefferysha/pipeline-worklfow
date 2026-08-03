import { describe, expect, it } from 'vitest'
import {
  projectWorkflowDefinitionStatus,
  type WorkflowDefinitionCurrent,
} from './workflowDefinitionStatus.js'

const FROZEN = 'a'.repeat(64)
const CURRENT = 'b'.repeat(64)

describe('projectWorkflowDefinitionStatus', () => {
  it.each([
    [{ kind: 'current', fingerprint: FROZEN } satisfies WorkflowDefinitionCurrent, 'current', FROZEN],
    [{ kind: 'current', fingerprint: CURRENT } satisfies WorkflowDefinitionCurrent, 'changed', CURRENT],
    [{ kind: 'missing' } satisfies WorkflowDefinitionCurrent, 'missing', null],
    [{ kind: 'invalid' } satisfies WorkflowDefinitionCurrent, 'invalid', null],
  ] as const)('projects a frozen plan with %j', (current, status, fingerprint) => {
    expect(projectWorkflowDefinitionStatus('custom', FROZEN, current)).toEqual({
      schema: 'workflow-definition-status/v1',
      workflow: 'custom',
      status,
      frozen_fingerprint: FROZEN,
      current_fingerprint: fingerprint,
    })
  })

  it('projects old changes without a frozen plan as unavailable', () => {
    expect(projectWorkflowDefinitionStatus('default', null, { kind: 'invalid' })).toEqual({
      schema: 'workflow-definition-status/v1',
      workflow: 'default',
      status: 'unavailable',
      frozen_fingerprint: null,
      current_fingerprint: null,
    })
  })
})
