import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createLifecycle } = vi.hoisted(() => ({
  createLifecycle: vi.fn(() => ({
    start: vi.fn(async () => []),
    finish: vi.fn(async () => {}),
  })),
}))

vi.mock('../skillInvocationAfkLifecycle.js', async () => ({
  createAfkSkillInvocationLifecycle: createLifecycle,
}))

import { createStateStore } from '@tenon/kernel'
import { createAutomation } from './sdk.js'

describe('Automation SDK InteractionPolicy receipt wiring', () => {
  beforeEach(() => createLifecycle.mockClear())

  it('passes the injected verified-receipt port into the production AFK lifecycle', () => {
    const port = { verifiedReceiptsFor: vi.fn(async () => []) }
    createAutomation({
      repoRoot: '/tmp/tenon-sdk-interaction-wiring',
      store: createStateStore(),
      clock: () => '2026-08-04T00:00:00.000Z',
      interactionReceipts: port,
    })
    expect(createLifecycle).toHaveBeenCalledOnce()
    expect(createLifecycle.mock.calls[0]?.[1]).toBe(port)
  })
})
