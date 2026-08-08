import { describe, expect, test } from 'vitest'
import type { ManagedReleaseJournalRecord } from '../runtime/installer.js'
import { createManagedHostStepRunner } from '../runtime/managed-host-reconciliation.js'
import type { ManagedHostPreparationContext } from './release-coordinator.js'
import type { SetupEnv } from './setupEnvironment.js'
import { runManagedHostCommand } from './managed-host-command.js'
import {
  desiredNativeHostPostcondition,
  observeNativeHost,
} from './managed-host-observation.js'

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
    '%s in-memory recovery runner uses the real native desired wiring without replaying mutation',
    async (state) => {
      const marketplaceRoot = '/host/tenon-marketplace'
      const host = {
        head: 'a'.repeat(40),
        remoteHead: 'b'.repeat(40),
        mutationExecutions: 0,
      }
      const env = {
        homeDir: () => '/home/managed-host-command-test',
        runtimeEnv: () => ({}),
        readText: (path: string) => path === `${marketplaceRoot}/.codex-plugin/plugin.json`
          ? JSON.stringify({ version: '1.0.1' })
          : undefined,
        runCommand: (cmd: string, args: string[]) => {
          const command = `${cmd} ${args.join(' ')}`
          if (command === 'codex plugin marketplace list --json') {
            return {
              code: 0,
              stdout: JSON.stringify({
                marketplaces: [{
                  name: 'tenon',
                  root: marketplaceRoot,
                  marketplaceSource: {
                    sourceType: 'git',
                    source: 'https://github.com/jefferysha/tenon.git',
                  },
                }],
              }),
              stderr: '',
            }
          }
          if (command === 'codex plugin list --json') {
            return {
              code: 0,
              stdout: JSON.stringify({
                installed: [{
                  pluginId: 'tenon@tenon',
                  version: '1.0.1',
                  source: { path: marketplaceRoot },
                }],
              }),
              stderr: '',
            }
          }
          if (command === `git -C ${marketplaceRoot} rev-parse HEAD`) {
            return { code: 0, stdout: `${host.head}\n`, stderr: '' }
          }
          if (command === `git -C ${marketplaceRoot} remote get-url origin`) {
            return {
              code: 0,
              stdout: 'https://github.com/jefferysha/tenon.git\n',
              stderr: '',
            }
          }
          if (command === 'git ls-remote https://github.com/jefferysha/tenon.git refs/heads/main') {
            return {
              code: 0,
              stdout: `${host.remoteHead}\trefs/heads/main\n`,
              stderr: '',
            }
          }
          if (command === 'codex plugin marketplace upgrade tenon --json') {
            host.mutationExecutions += 1
            host.head = host.remoteHead
            return { code: 0, stdout: 'unexpected replay', stderr: '' }
          }
          return { code: 1, stdout: '', stderr: `unexpected command: ${command}` }
        },
      } as SetupEnv

      const persistedDesired = desiredNativeHostPostcondition(
        env,
        'codex',
        'marketplace-refresh',
      ).serialized
      const before = observeNativeHost(env, 'codex')
      host.head = host.remoteHead
      const observedAfter = observeNativeHost(env, 'codex')
      const persisted: ManagedReleaseJournalRecord = {
        version: 1,
        transactionId: `real-native-wiring-${state}`,
        operation: 'update',
        source: 'codex',
        phase: 'preparing-host',
        startedAt: '2026-08-03T00:00:00Z',
        updatedAt: '2026-08-03T00:00:00Z',
        hostSteps: [{
          id: 'marketplace-refresh',
          state,
          before,
          desired: persistedDesired,
          replayPolicy: 'observe-before-replay-v1',
          ...(state === 'completed'
            ? {
                observedAfter,
                result: JSON.stringify({ code: 0, stdout: 'historic', stderr: '' }),
              }
            : {}),
        }],
      }

      // Keep this unit boundary focused on native desired-state wiring. The real journal writer,
      // reader, coordinator, and process restart are covered by release-store.integration.test.ts.
      let reloaded = JSON.parse(JSON.stringify(persisted)) as ManagedReleaseJournalRecord
      const runStep = createManagedHostStepRunner({
        journal: () => reloaded,
        commit: async (record) => { reloaded = record },
        now: () => '2026-08-03T00:00:01Z',
      })
      const result = await runManagedHostCommand(
        { transactionId: reloaded.transactionId, runStep },
        'marketplace-refresh',
        env,
        { cmd: 'codex', args: ['plugin', 'marketplace', 'upgrade', 'tenon', '--json'] },
      )

      expect(host.mutationExecutions).toBe(0)
      expect(reloaded.hostSteps?.[0]?.state).toBe('completed')
      expect(result.stdout).toBe(state === 'completed' ? 'historic' : '')
    },
  )

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
