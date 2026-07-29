import { describe, expect, it } from 'vitest'
import { decodeWorkflowDefinition } from './governanceSchema'
const step = {
  id: 'open',
  label: 'Open',
  gate: null,
  skills: [],
  inputs: [],
  outputs: [],
  guards: [],
  transitions: [],
}

describe('decodeWorkflowDefinition', () => {
  it('accepts each supported document contract mode independently', () => {
    expect(decodeWorkflowDefinition({
      name: 'openspec',
      openspecContract: 'required',
      steps: [step],
    })?.name).toBe('openspec')
    expect(decodeWorkflowDefinition({
      name: 'document-v1',
      documentContract: { version: 'v1', slots: [], reads: [] },
      steps: [step],
    })?.name).toBe('document-v1')
  })

  it('rejects a malformed 200 definition that enables both mutually exclusive contracts', () => {
    expect(decodeWorkflowDefinition({
      name: 'conflicted',
      openspecContract: 'required',
      documentContract: { version: 'v1', slots: [], reads: [] },
      steps: [step],
    })).toBeNull()
  })

  it('accepts every canonical default-workflow guard and action used by the kernel', () => {
    const decoded = decodeWorkflowDefinition({
      name: 'default',
      openspecContract: 'required',
      steps: [{
        ...step,
        transitions: [{
          event: 'verify-fail',
          to: 'build',
          actions: [{ type: 'reset-pre-verify-review' }],
        }, {
          event: 'ship-complete',
          to: 'archive',
          guards: [{ type: 'spec-migration-applied' }],
        }],
      }],
    })

    expect(decoded?.steps[0]?.transitions).toEqual([
      {
        event: 'verify-fail',
        to: 'build',
        actions: [{ type: 'reset-pre-verify-review' }],
      },
      {
        event: 'ship-complete',
        to: 'archive',
        guards: [{ type: 'spec-migration-applied' }],
      },
    ])
  })
})
