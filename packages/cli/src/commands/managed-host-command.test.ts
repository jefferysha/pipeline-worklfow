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

describe('managed host desired identity recovery', () => {
  test.each(['started', 'completed'] as const)(
    '%s WAL checkpoints an equivalent domain identity without replaying mutation',
    async (state) => {
      let executions = 0
      let journal: ManagedReleaseJournalRecord = {
        version: 1,
        transactionId: 'equivalent-native-desired-test',
        operation: 'update',
        source: 'codex',
        phase: 'preparing-host',
        startedAt: '2026-08-03T00:00:00Z',
        updatedAt: '2026-08-03T00:00:00Z',
        hostSteps: [{
          id: 'marketplace-refresh',
          state,
          before: 'before',
          desired: 'desired-with-previous-observation-head',
          replayPolicy: 'observe-before-replay-v1',
          ...(state === 'completed'
            ? { observedAfter: 'desired-observation', result: 'historic-result' }
            : {}),
        }],
      }
      const runStep = createManagedHostStepRunner({
        journal: () => journal,
        commit: async (record) => { journal = record },
        now: () => '2026-08-03T00:00:01Z',
      })

      const result = await runStep('marketplace-refresh', {
        desired: 'desired-with-current-observation-head',
        isEquivalentDesired: (persisted) =>
          persisted === 'desired-with-previous-observation-head',
        observe: () => 'desired-observation',
        isDesired: (observed) => observed === 'desired-observation',
        execute: () => {
          executions += 1
          return 'unexpected-replay'
        },
      })

      expect(executions).toBe(0)
      expect(result).toBe(state === 'completed' ? 'historic-result' : '')
      expect(journal.hostSteps?.[0]?.state).toBe('completed')
    },
  )

  test('generic recovery remains byte-exact when no domain comparator is supplied', async () => {
    const journal: ManagedReleaseJournalRecord = {
      version: 1,
      transactionId: 'generic-desired-test',
      operation: 'update',
      source: 'codex',
      phase: 'preparing-host',
      startedAt: '2026-08-03T00:00:00Z',
      updatedAt: '2026-08-03T00:00:00Z',
      hostSteps: [{
        id: 'marketplace-refresh',
        state: 'started',
        before: 'before',
        desired: 'persisted-desired',
        replayPolicy: 'observe-before-replay-v1',
      }],
    }
    let executions = 0
    const runStep = createManagedHostStepRunner({
      journal: () => journal,
      commit: async () => undefined,
      now: () => '2026-08-03T00:00:01Z',
    })

    await expect(runStep('marketplace-refresh', {
      desired: 'current-desired',
      observe: () => 'desired-observation',
      isDesired: () => true,
      execute: () => {
        executions += 1
        return 'unexpected-replay'
      },
    })).rejects.toThrow(/当前 desired 与 WAL 不一致/)
    expect(executions).toBe(0)
  })
})
