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

const guards = [
  ['tasks-at-least', { type: 'tasks-at-least', n: 1 }],
  ['nonempty-output', { type: 'nonempty-output' }],
  ['field-nonempty', { type: 'field-nonempty', field: 'plan' }],
  ['file-exists', { type: 'file-exists', path: { kind: 'field', field: 'plan' } }],
  ['field-equals', { type: 'field-equals', field: 'verify_result', value: 'pass' }],
  ['field-in', { type: 'field-in', field: 'phase_status', values: ['ready'] }],
  ['full-direct-override', { type: 'full-direct-override' }],
  ['build-head-unchanged', { type: 'build-head-unchanged', field: 'build_sha' }],
  ['spec-migration-applied', { type: 'spec-migration-applied' }],
] as const

function decodeWithGuard(guard: unknown) {
  return decodeWorkflowDefinition({
    name: 'guard-contract',
    steps: [{ ...step, guards: [guard] }],
  })
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

  it.each(guards)('%s rejects an illegal top-level data key instead of silently normalizing it', (_name, guard) => {
    expect(decodeWithGuard({ ...guard, illegal: 'must-not-disappear' })).toBeNull()
  })

  it('rejects action variants with extra keys instead of silently normalizing them', () => {
    expect(decodeWorkflowDefinition({
      name: 'action-contract',
      steps: [{
        ...step,
        transitions: [{
          event: 'done',
          to: 'open',
          actions: [{ type: 'archive-run', illegal: 'must-not-disappear' }],
        }],
      }],
    })).toBeNull()
  })

  it('requires tasks-at-least n to match the kernel non-negative integer contract', () => {
    expect(decodeWithGuard({ type: 'tasks-at-least', n: -1 })).toBeNull()
    expect(decodeWithGuard({ type: 'tasks-at-least', n: 1.5 })).toBeNull()
    expect(decodeWithGuard({ type: 'tasks-at-least', n: 0 })?.steps[0]?.guards[0]).toEqual({
      type: 'tasks-at-least',
      n: 0,
    })
  })

  it.each(guards)('%s requires an exact nested when predicate', (_name, guard) => {
    expect(decodeWithGuard({
      ...guard,
      when: { kind: 'track-in', values: ['backend'], illegal: 'must-not-disappear' },
    })).toBeNull()
  })

  it('rejects the concrete nonempty-output+n corruption and an over-broad file-exists path', () => {
    expect(decodeWithGuard({ type: 'nonempty-output', n: 2 })).toBeNull()
    expect(decodeWithGuard({
      type: 'file-exists',
      path: { kind: 'field', field: 'plan', illegal: 'must-not-disappear' },
    })).toBeNull()
  })

  it.each(guards)('%s still accepts its exact canonical key set with an exact when predicate', (_name, guard) => {
    expect(decodeWithGuard({
      ...guard,
      when: { kind: 'track-not-in', values: ['pm'] },
    })?.steps[0]?.guards[0]).toEqual({
      ...guard,
      when: { kind: 'track-not-in', values: ['pm'] },
    })
  })
})
