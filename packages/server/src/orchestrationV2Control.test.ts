import { describe, expect, it, vi } from 'vitest'
import { createOrchestrationV2Control, OrchestrationV2ControlError, type OrchestrationV2ControlDeps } from './orchestrationV2Control.js'
import type { BoardSnapshotV2, OrchestrationLedger } from '@tenon/kernel'

const snapshot = { revision: 0, change_id: 'change-1' } as BoardSnapshotV2

function deps(): OrchestrationV2ControlDeps {
  return {
    ledger: {
      initialize: vi.fn(async () => snapshot),
      readSnapshot: vi.fn(async () => snapshot),
      readEvent: vi.fn(async () => undefined),
      readEvents: vi.fn(async () => []),
      append: vi.fn(async () => ({ kind: 'replayed', event: {} as never, snapshot, replayed: true })),
      recover: vi.fn(async () => ({ snapshot, events: [], report: {} as never })),
    } as OrchestrationLedger,
    workflowRootForRequest: () => ({ ok: true, anchor: { path: '/repo' } as never }),
  }
}

describe('OrchestrationV2Control', () => {
  it('centralizes trusted change directory resolution and delegates ledger access', async () => {
    const injected = deps()
    const control = createOrchestrationV2Control(injected)
    expect(control.resolveChangeDirectory('/repo', 'change-1')).toBe('/repo/openspec/changes/change-1')
    await expect(control.readSnapshot('/repo', 'change-1')).resolves.toBe(snapshot)
    expect(injected.ledger.readSnapshot).toHaveBeenCalledWith('/repo/openspec/changes/change-1')
  })

  it('fails closed for missing, unregistered and traversal roots', () => {
    const control = createOrchestrationV2Control(deps())
    expect(() => control.resolveChangeDirectory('', 'change-1')).toThrowError(OrchestrationV2ControlError)
    expect(() => control.resolveChangeDirectory('/repo', '../secret')).toThrowError(OrchestrationV2ControlError)
    const forbidden = createOrchestrationV2Control({ ...deps(), workflowRootForRequest: () => ({ ok: false, code: 403, error: 'forbidden' }) })
    expect(() => forbidden.resolveChangeDirectory('/secret', 'change-1')).toThrowError(/root 不可信/)
  })
})
