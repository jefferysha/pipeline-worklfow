import { describe, expect, test } from 'vitest'
import type { ManagedReleaseJournalRecord } from '../runtime/installer.js'
import { createManagedHostStepRunner } from '../runtime/managed-host-reconciliation.js'
import type { ManagedHostPreparationContext } from './release-coordinator.js'
import type { SetupEnv } from './setupEnvironment.js'
import { runManagedHostCommand } from './managed-host-command.js'

function harness(initial?: ManagedReleaseJournalRecord): {
  readonly transaction: ManagedHostPreparationContext
  readonly env: SetupEnv
  readonly executions: () => number
  readonly journal: () => ManagedReleaseJournalRecord
} {
  let observation = initial?.hostSteps?.[0]?.state === 'completed' ? 'desired' : 'before'
  let executions = 0
  let journal: ManagedReleaseJournalRecord = initial ?? {
    version: 1,
    transactionId: 'host-command-result-test',
    operation: 'setup',
    source: 'codex',
    phase: 'preparing-host',
    startedAt: '2026-07-27T00:00:00Z',
    updatedAt: '2026-07-27T00:00:00Z',
  }
  const runStep = createManagedHostStepRunner({
    journal: () => journal,
    commit: async (record) => { journal = record },
    now: () => '2026-07-27T00:00:01Z',
  })
  const env = {
    runCommand: () => {
      executions += 1
      observation = 'desired'
      return { code: 1, stdout: 'already installed', stderr: 'non-zero diagnostic' }
    },
    managedHostReconciliation: () => ({
      desired: 'desired',
      observe: () => observation,
      isDesired: (value: string) => value === 'desired',
    }),
  } as unknown as SetupEnv
  return {
    transaction: { transactionId: journal.transactionId, runStep },
    env,
    executions: () => executions,
    journal: () => journal,
  }
}

describe('managed host command result is diagnostic after desired-state proof', () => {
  test('first execution returns control-flow success after observation proves desired', async () => {
    const h = harness()

    const result = await runManagedHostCommand(
      h.transaction,
      'plugin-install',
      h.env,
      { cmd: 'codex', args: ['plugin', 'add', 'tenon@tenon'] },
    )

    expect(result).toEqual({
      code: 0,
      stdout: 'already installed',
      stderr: 'non-zero diagnostic',
    })
    expect(h.executions()).toBe(1)
    expect(h.journal().hostSteps?.[0]?.result)
      .toContain('"code":1')
  })

  test('completed recovery returns success without replaying the historic non-zero command', async () => {
    const h = harness({
      version: 1,
      transactionId: 'host-command-result-test',
      operation: 'setup',
      source: 'codex',
      phase: 'preparing-host',
      startedAt: '2026-07-27T00:00:00Z',
      updatedAt: '2026-07-27T00:00:00Z',
      hostSteps: [{
        id: 'plugin-install',
        state: 'completed',
        before: 'before',
        desired: 'desired',
        replayPolicy: 'observe-before-replay-v1',
        observedAfter: 'desired',
        result: JSON.stringify({
          code: 1,
          stdout: 'already installed',
          stderr: 'non-zero diagnostic',
        }),
      }],
    })

    const result = await runManagedHostCommand(
      h.transaction,
      'plugin-install',
      h.env,
      { cmd: 'codex', args: ['plugin', 'add', 'tenon@tenon'] },
    )

    expect(result).toEqual({
      code: 0,
      stdout: 'already installed',
      stderr: 'non-zero diagnostic',
    })
    expect(h.executions()).toBe(0)
  })
})
