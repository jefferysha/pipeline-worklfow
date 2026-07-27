import { describe, expect, test } from 'vitest'
import type { CliDeps } from '../deps.js'
import type {
  ManagedReleaseJournalRecord,
  ManagedRuntimeTransaction,
  RuntimeInstaller,
} from '../runtime/installer.js'
import type { NativeRuntimeHost, RuntimeActivation } from '../runtime/types.js'
import { makeDeps } from '../test-support.js'
import {
  type ReleasedDashboardStarter,
} from './dashboard.js'
import { publishManagedRelease } from './release-coordinator.js'

function dashboardOwnership(
  releaseId = `sha256-${'a'.repeat(64)}`,
  transactionId?: string,
) {
  return {
    version: 1 as const,
    port: 18765,
    pid: 321,
    releaseId,
    stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
    ...(transactionId === undefined ? {} : { transactionId }),
  }
}

function readyDashboard(
  releaseId = `sha256-${'a'.repeat(64)}`,
  transactionId = 'transaction-1',
) {
  return {
    state: 'ready' as const,
    session: {
      ownership: dashboardOwnership(releaseId, transactionId),
      stop: async () => ({ state: 'stopped' as const }),
    },
  }
}

function activationFor(candidateRoot: string, host: NativeRuntimeHost | 'adapter'): RuntimeActivation {
  const suffix = candidateRoot.endsWith('two') ? 'b' : 'a'
  const releaseId = `sha256-${suffix.repeat(64)}`
  return {
    release: {
      version: 1,
      releaseId,
      payloadDigest: suffix.repeat(64),
      createdAt: '2026-07-26T00:00:00Z',
      source: { host, pluginVersion: '1.0.0' },
    },
    selection: {
      version: 1,
      revision: suffix === 'a' ? 1 : 2,
      activeRelease: releaseId,
      previousRelease: null,
      updatedAt: '2026-07-26T00:00:00Z',
    },
    releaseRoot: `/runtime/releases/${releaseId}`,
  }
}

function serializedInstaller(
  events: string[],
  activate: (
    candidateRoot: string,
    host: NativeRuntimeHost | 'adapter',
  ) => RuntimeActivation = activationFor,
  options: {
    readonly failJournalWritePhaseOnce?: ManagedReleaseJournalRecord['phase']
    readonly failCompletedHostStepWriteOnce?: boolean
    readonly recoverActivation?: () => ReturnType<ManagedRuntimeTransaction['recoverActivation']>
    readonly initialJournal?: ManagedReleaseJournalRecord
  } = {},
): RuntimeInstaller {
  let tail = Promise.resolve()
  let journal: ManagedReleaseJournalRecord | null = options.initialJournal ?? null
  let journalSequence = 0
  let failedJournalWrite = false
  return {
    withManagedTransaction: async <T>(
      _scope,
      operation: (transaction: ManagedRuntimeTransaction) => Promise<T>,
    ): Promise<T> => {
      const previous = tail
      let release!: () => void
      tail = new Promise<void>((resolve) => { release = resolve })
      await previous
      events.push('transaction:start')
      try {
        return await operation({
          checkpointActivation: async () => ({
            selection: {
              version: 1,
              revision: 0,
              activeRelease: null,
              previousRelease: null,
              updatedAt: '2026-07-25T00:00:00Z',
            },
            launchers: {
              tenon: { path: '/home/test/.local/bin/tenon', state: { kind: 'missing' } },
              hook: { path: '/home/test/.local/bin/tenon-hook', state: { kind: 'missing' } },
            },
          }),
          activate: async (candidateRoot, host) => {
            events.push(`activate:${candidateRoot}`)
            return activate(candidateRoot, host)
          },
          recoverActivation: async () => options.recoverActivation?.() ?? ({ state: 'not-started' as const }),
          revertActivation: async () => {
            events.push('revert')
          },
          proveActivation: async (activation) =>
            activation.selection.activeRelease === activation.release.releaseId,
          journal: {
            create: (operation, source, now) => ({
              version: 1,
              transactionId: `transaction-${++journalSequence}`,
              operation,
              source,
              phase: 'preparing-host',
              startedAt: now,
              updatedAt: now,
            }),
            read: async () => journal,
            write: async (record) => {
              const completedHostStep = record.hostSteps?.some((step) => step.state === 'completed') === true
              if (
                ((record.phase === options.failJournalWritePhaseOnce)
                  || (options.failCompletedHostStepWriteOnce === true && completedHostStep))
                && !failedJournalWrite
              ) {
                failedJournalWrite = true
                events.push(`journal:${record.phase}:failed`)
                throw new Error(`injected ${record.phase} journal failure`)
              }
              journal = record
              events.push(`journal:${record.phase}`)
            },
            clear: async (expectedTransactionId) => {
              if (journal?.transactionId !== expectedTransactionId) throw new Error('journal ownership changed')
              journal = null
              events.push('journal:cleared')
            },
          },
        })
      } finally {
        events.push('transaction:end')
        release()
      }
    },
    inspect: async () => {
      throw new Error('not used')
    },
    rollback: async () => {
      throw new Error('not used')
    },
  }
}

function request(candidateRoot: string) {
  return {
    operation: 'setup' as const,
    source: 'codex' as const,
    runtime: { homeDir: '/home/test', env: {} },
    openBrowser: false,
    prepareCandidate: () => ({ candidateRoot }),
  }
}

describe('managed release coordinator', () => {
  test('serializes activation, launcher ownership, Dashboard readiness, and compensation as one transaction', async () => {
    const events: string[] = []
    let releaseFirstDashboard!: () => void
    const firstDashboard = new Promise<void>((resolve) => { releaseFirstDashboard = resolve })
    const starter: ReleasedDashboardStarter = {
      inspect: async () => null,
      adopt: async () => null,
      start: async (_deps, payloadRoot, opts) => {
        events.push(`dashboard:${payloadRoot.includes('a'.repeat(64)) ? 'one' : 'two'}:start`)
        if (payloadRoot.includes('a'.repeat(64))) await firstDashboard
        events.push(`dashboard:${payloadRoot.includes('a'.repeat(64)) ? 'one' : 'two'}:ready`)
        return readyDashboard(
          payloadRoot.includes('a'.repeat(64))
            ? `sha256-${'a'.repeat(64)}`
            : `sha256-${'b'.repeat(64)}`,
          opts.transactionId,
        )
      },
    }
    const installer = serializedInstaller(events)

    const first = publishManagedRelease(makeDeps(), request('/candidate/one'), installer, starter)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = publishManagedRelease(makeDeps(), request('/candidate/two'), installer, starter)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(events).toEqual([
      'transaction:start',
      'journal:preparing-host',
      'journal:candidate-resolved',
      'journal:activating-runtime',
      'activate:/candidate/one',
      'journal:runtime-activated',
      'journal:starting-dashboard',
      'dashboard:one:start',
    ])

    releaseFirstDashboard()
    expect((await Promise.all([first, second])).every((outcome) => outcome.ok)).toBe(true)
    expect(events).toEqual([
      'transaction:start',
      'journal:preparing-host',
      'journal:candidate-resolved',
      'journal:activating-runtime',
      'activate:/candidate/one',
      'journal:runtime-activated',
      'journal:starting-dashboard',
      'dashboard:one:start',
      'dashboard:one:ready',
      'journal:dashboard-ready',
      'journal:evidence-committed',
      'journal:cleared',
      'transaction:end',
      'transaction:start',
      'journal:preparing-host',
      'journal:candidate-resolved',
      'journal:activating-runtime',
      'activate:/candidate/two',
      'journal:runtime-activated',
      'journal:starting-dashboard',
      'dashboard:two:start',
      'dashboard:two:ready',
      'journal:dashboard-ready',
      'journal:evidence-committed',
      'journal:cleared',
      'transaction:end',
    ])
  })

  test('does not compensate selection or launch a previous Dashboard when candidate termination is unconfirmed', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const starter: ReleasedDashboardStarter = {
      inspect: async () => null,
      adopt: async () => null,
      start: async () => ({
        state: 'indeterminate',
        detail: 'candidate process did not exit',
      }),
    }

    const outcome = await publishManagedRelease(
      makeDeps() as CliDeps,
      request('/candidate/one'),
      installer,
      starter,
    )

    expect(outcome).toMatchObject({
      ok: false,
      state: 'indeterminate',
    })
    expect(outcome.detail).toContain('candidate process did not exit')
    expect(events).toEqual([
      'transaction:start',
      'journal:preparing-host',
      'journal:candidate-resolved',
      'journal:activating-runtime',
      'activate:/candidate/one',
      'journal:runtime-activated',
      'journal:starting-dashboard',
      'transaction:end',
    ])
  })

  test('treats an unexpected Dashboard starter rejection as indeterminate instead of guessing compensation safety', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const starter: ReleasedDashboardStarter = {
      inspect: async () => null,
      adopt: async () => null,
      start: async () => {
        throw new Error('unexpected adapter rejection')
      },
    }

    const outcome = await publishManagedRelease(
      makeDeps(),
      request('/candidate/one'),
      installer,
      starter,
    )

    expect(outcome).toMatchObject({
      ok: false,
      state: 'indeterminate',
    })
    expect(events).not.toContain('revert')
  })

  test('commits external evidence only after Dashboard readiness', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const starter: ReleasedDashboardStarter = {
      inspect: async () => null,
      adopt: async () => null,
      start: async (_deps, _payloadRoot, opts) => {
        events.push('dashboard:ready')
        return readyDashboard(undefined, opts.transactionId)
      },
    }
    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      commitReadyEvidence: () => { events.push('evidence:commit') },
    }, installer, starter)
    expect(outcome.ok).toBe(true)
    expect(events.indexOf('evidence:commit')).toBeGreaterThan(events.indexOf('dashboard:ready'))
  })

  test('ready evidence failure stops the candidate before reverting when no previous Dashboard exists', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const starter: ReleasedDashboardStarter = {
      inspect: async () => null,
      adopt: async () => null,
      start: async (_deps, _payloadRoot, opts) => {
        events.push('dashboard:candidate:ready')
        return {
          state: 'ready',
          session: {
            ownership: dashboardOwnership(undefined, opts.transactionId),
            stop: async () => {
              events.push('dashboard:candidate:stop')
              return { state: 'stopped' as const }
            },
          },
        }
      },
    }

    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      commitReadyEvidence: () => {
        events.push('evidence:commit')
        throw new Error('receipt storage unavailable')
      },
    }, installer, starter)

    expect(outcome).toMatchObject({ ok: false, state: 'restored' })
    expect(events).toEqual([
      'transaction:start',
      'journal:preparing-host',
      'journal:candidate-resolved',
      'journal:activating-runtime',
      'activate:/candidate/one',
      'journal:runtime-activated',
      'journal:starting-dashboard',
      'dashboard:candidate:ready',
      'journal:dashboard-ready',
      'evidence:commit',
      'dashboard:candidate:stop',
      'revert',
      'journal:cleared',
      'transaction:end',
    ])
  })

  test('ready evidence failure stops the candidate before reverting and restoring the previous Dashboard', async () => {
    const events: string[] = []
    const previousRelease = `sha256-${'f'.repeat(64)}`
    const installer = serializedInstaller(events, (candidateRoot, host) => {
      const activation = activationFor(candidateRoot, host)
      return {
        ...activation,
        selection: {
          ...activation.selection,
          previousRelease,
        },
      }
    })
    const starter: ReleasedDashboardStarter = {
      inspect: async () => null,
      adopt: async () => null,
      start: async (_deps, payloadRoot, opts) => {
        if (payloadRoot.includes(previousRelease)) {
          events.push('dashboard:previous:ready')
          return {
            state: 'ready',
            session: {
              ownership: dashboardOwnership(previousRelease, opts.transactionId),
              stop: async () => ({ state: 'stopped' as const }),
            },
          }
        }
        events.push('dashboard:candidate:ready')
        return {
          state: 'ready',
          session: {
            ownership: dashboardOwnership(undefined, opts.transactionId),
            stop: async () => {
              events.push('dashboard:candidate:stop')
              return { state: 'stopped' as const }
            },
          },
        }
      },
    }

    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      commitReadyEvidence: () => {
        events.push('evidence:commit')
        throw new Error('receipt storage unavailable')
      },
    }, installer, starter)

    expect(outcome).toMatchObject({ ok: false, state: 'restored' })
    expect(events).toEqual([
      'transaction:start',
      'journal:preparing-host',
      'journal:candidate-resolved',
      'journal:activating-runtime',
      'activate:/candidate/one',
      'journal:runtime-activated',
      'journal:starting-dashboard',
      'dashboard:candidate:ready',
      'journal:dashboard-ready',
      'evidence:commit',
      'dashboard:candidate:stop',
      'revert',
      'journal:cleared',
      'dashboard:previous:ready',
      'transaction:end',
    ])
  })

  test('Dashboard readiness failure never commits external evidence', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      commitReadyEvidence: () => { events.push('evidence:commit') },
    }, installer, {
      inspect: async () => null,
      adopt: async () => null,
      start: async () => ({ state: 'failed', detail: 'not ready' }),
    })
    expect(outcome).toMatchObject({ ok: false, state: 'restored' })
    expect(events).not.toContain('evidence:commit')
  })

  test('prepares the host candidate only after entering the cross-process transaction', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      prepareCandidate: () => {
        events.push('host:prepare')
        return { candidateRoot: '/candidate/one' }
      },
    }, installer, undefined)

    expect(outcome.ok).toBe(true)
    expect(events.indexOf('host:prepare')).toBeGreaterThan(events.indexOf('transaction:start'))
    expect(events.indexOf('host:prepare')).toBeLessThan(events.indexOf('activate:/candidate/one'))
  })

  test('recovers an activated journal without repeating host mutation or runtime activation', async () => {
    const events: string[] = []
    let firstEvidence = true
    const installer = serializedInstaller(events)
    const first = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      prepareCandidate: () => {
        events.push('host:prepare')
        return { candidateRoot: '/candidate/one', evidence: 'inventory-v1' }
      },
      commitReadyEvidence: () => {
        if (firstEvidence) {
          firstEvidence = false
          throw new Error('injected receipt failure')
        }
      },
    }, installer, {
      inspect: async () => null,
      adopt: async () => null,
      start: async () => ({
        state: 'indeterminate',
        detail: 'injected process ownership loss',
      }),
    })
    expect(first).toMatchObject({ ok: false, state: 'indeterminate' })

    const prepareCount = events.filter((event) => event === 'host:prepare').length
    const activationCount = events.filter((event) => event === 'activate:/candidate/one').length
    const recovered = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      prepareCandidate: () => {
        events.push('host:prepare')
        return { candidateRoot: '/candidate/one', evidence: 'inventory-v2' }
      },
    }, installer, undefined)

    expect(recovered.ok).toBe(true)
    expect(events.filter((event) => event === 'host:prepare')).toHaveLength(prepareCount)
    expect(events.filter((event) => event === 'activate:/candidate/one')).toHaveLength(activationCount)
  })

  test('recovers the activation checkpoint when the process loses the runtime-activated journal commit', async () => {
    const events: string[] = []
    let activated: RuntimeActivation | undefined
    const installer = serializedInstaller(
      events,
      (candidateRoot, host) => {
        activated = activationFor(candidateRoot, host)
        return activated
      },
      {
        failJournalWritePhaseOnce: 'runtime-activated',
        recoverActivation: async () => {
          if (activated === undefined) return { state: 'not-started' as const }
          return { state: 'activated' as const, activation: activated }
        },
      },
    )
    const first = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      prepareCandidate: () => {
        events.push('host:prepare')
        return { candidateRoot: '/candidate/one' }
      },
    }, installer, undefined)
    expect(first).toMatchObject({ ok: false, state: 'indeterminate' })

    const second = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      prepareCandidate: () => {
        events.push('host:prepare')
        return { candidateRoot: '/candidate/one' }
      },
    }, installer, undefined)
    expect(second.ok).toBe(true)
    expect(events.filter((event) => event === 'host:prepare')).toHaveLength(1)
    expect(events.filter((event) => event === 'activate:/candidate/one')).toHaveLength(1)
    expect(events).toContain('journal:runtime-activated:failed')
  })

  test('candidate journal commit 丢失时重放 host preparation 不重复已完成的宿主命令', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events, activationFor, {
      failJournalWritePhaseOnce: 'candidate-resolved',
    })
    let hostObservation = 'inventory-before'
    const managedRequest = {
      ...request('/candidate/one'),
      prepareCandidate: async (hostTransaction: {
        runStep(id: string, step: {
          desired: string
          observe(): Promise<string>
          isDesired(observation: string): boolean
          execute(): Promise<string>
        }): Promise<string>
      }) => {
        const inventory = await hostTransaction.runStep('plugin-install', {
          desired: 'inventory-v1',
          observe: async () => hostObservation,
          isDesired: (value: string) => value === 'inventory-v1',
          execute: async () => {
            events.push('host:plugin-install')
            hostObservation = 'inventory-v1'
            return 'diagnostic-output'
          },
        })
        return { candidateRoot: '/candidate/one', evidence: hostObservation }
      },
    }

    expect(await publishManagedRelease(makeDeps(), managedRequest, installer, undefined))
      .toMatchObject({ ok: false })
    expect(await publishManagedRelease(makeDeps(), managedRequest, installer, undefined))
      .toMatchObject({ ok: true })
    expect(events.filter((event) => event === 'host:plugin-install')).toHaveLength(1)
    expect(events).toContain('journal:candidate-resolved:failed')
  })

  test('host command 已达到 desired 但 completed 写失败时只补 checkpoint，不重放命令', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events, activationFor, {
      failCompletedHostStepWriteOnce: true,
    })
    let observed = 'inventory-before'
    let executions = 0
    const requestWithMutation = {
      ...request('/candidate/one'),
      prepareCandidate: async (host: {
        runStep(id: string, step: {
          desired: string
          observe(): Promise<string>
          isDesired(observation: string): boolean
          execute(): Promise<string>
        }): Promise<string>
      }) => {
        await host.runStep('plugin-install', {
          desired: 'inventory-desired',
          observe: async () => observed,
          isDesired: (value: string) => value === 'inventory-desired',
          execute: async () => {
            executions += 1
            observed = 'inventory-desired'
            return 'stdout is diagnostic only'
          },
        })
        return { candidateRoot: '/candidate/one', evidence: observed }
      },
    }

    expect(await publishManagedRelease(makeDeps(), requestWithMutation, installer, undefined))
      .toMatchObject({ ok: false })
    expect(await publishManagedRelease(makeDeps(), requestWithMutation, installer, undefined))
      .toMatchObject({ ok: true })
    expect(executions).toBe(1)
  })

  test('completed host checkpoint 恢复时重新观察权威 inventory，第三状态 fail closed', async () => {
    const events: string[] = []
    const initialJournal: ManagedReleaseJournalRecord = {
      version: 1,
      transactionId: 'transaction-completed-drift',
      operation: 'setup',
      source: 'codex',
      phase: 'preparing-host',
      startedAt: '2026-07-26T00:00:00Z',
      updatedAt: '2026-07-26T00:00:00Z',
      hostSteps: [{
        id: 'plugin-install',
        state: 'completed',
        before: 'inventory-before',
        desired: 'inventory-desired',
        replayPolicy: 'observe-before-replay-v1',
        observedAfter: 'inventory-desired',
        result: 'diagnostic-only',
      }],
    }
    const installer = serializedInstaller(events, activationFor, { initialJournal })
    let executions = 0
    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      prepareCandidate: async (host) => {
        await host.runStep('plugin-install', {
          desired: 'inventory-desired',
          observe: async () => 'inventory-concurrent',
          isDesired: (value: string) => value === 'inventory-desired',
          execute: async () => {
            executions += 1
            return 'unexpected'
          },
        })
        return { candidateRoot: '/candidate/one' }
      },
    }, installer, undefined)

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(executions).toBe(0)
    expect(events).not.toContain('activate:/candidate/one')
  })

  test.each([
    ['第三状态', {
      before: 'inventory-before',
      desired: 'inventory-desired',
      replayPolicy: 'observe-before-replay-v1' as const,
    }, 'inventory-concurrent'],
    ['旧 pending WAL', {}, 'inventory-before'],
  ])('%s fail closed 且不执行 host mutation', async (_label, fields, observed) => {
    const events: string[] = []
    const initialJournal: ManagedReleaseJournalRecord = {
      version: 1,
      transactionId: 'transaction-pending',
      operation: 'setup',
      source: 'codex',
      phase: 'preparing-host',
      startedAt: '2026-07-26T00:00:00Z',
      updatedAt: '2026-07-26T00:00:00Z',
      hostSteps: [{ id: 'plugin-install', state: 'started', ...fields }],
    }
    const installer = serializedInstaller(events, activationFor, { initialJournal })
    let executions = 0
    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      prepareCandidate: async (host) => {
        await host.runStep('plugin-install', {
          desired: 'inventory-desired',
          observe: async () => observed,
          isDesired: (value: string) => value === 'inventory-desired',
          execute: async () => {
            executions += 1
            return 'unexpected'
          },
        })
        return { candidateRoot: '/candidate/one' }
      },
    }, installer, undefined)

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(executions).toBe(0)
  })

  test('pending WAL 当前 observation 精确等于 before 时只允许执行一次并证明 desired', async () => {
    const events: string[] = []
    const initialJournal: ManagedReleaseJournalRecord = {
      version: 1,
      transactionId: 'transaction-pending',
      operation: 'setup',
      source: 'codex',
      phase: 'preparing-host',
      startedAt: '2026-07-26T00:00:00Z',
      updatedAt: '2026-07-26T00:00:00Z',
      hostSteps: [{
        id: 'plugin-install',
        state: 'started',
        before: 'inventory-before',
        desired: 'inventory-desired',
        replayPolicy: 'observe-before-replay-v1',
      }],
    }
    const installer = serializedInstaller(events, activationFor, { initialJournal })
    let observed = 'inventory-before'
    let executions = 0
    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      prepareCandidate: async (host) => {
        await host.runStep('plugin-install', {
          desired: 'inventory-desired',
          observe: async () => observed,
          isDesired: (value: string) => value === 'inventory-desired',
          execute: async () => {
            executions += 1
            observed = 'inventory-desired'
            return 'diagnostic'
          },
        })
        return { candidateRoot: '/candidate/one' }
      },
    }, installer, undefined)

    expect(outcome).toMatchObject({ ok: true })
    expect(executions).toBe(1)
  })

  test('ready evidence 用 transaction id 幂等重放，commit 后 journal 写失败不会重复外部效果', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events, activationFor, {
      failJournalWritePhaseOnce: 'evidence-committed',
    })
    const effects = new Set<string>()
    const managedRequest = {
      ...request('/candidate/one'),
      commitReadyEvidence: (
        _activation: RuntimeActivation,
        _candidate: { candidateRoot: string },
        transactionId: string,
      ) => {
        if (!effects.has(transactionId)) {
          effects.add(transactionId)
          events.push(`evidence:effect:${transactionId}`)
        }
      },
    }

    expect(await publishManagedRelease(makeDeps(), managedRequest, installer, undefined))
      .toMatchObject({ ok: false, state: 'indeterminate' })
    expect(await publishManagedRelease(makeDeps(), managedRequest, installer, undefined))
      .toMatchObject({ ok: true })
    expect([...effects]).toEqual(['transaction-1'])
    expect(events.filter((event) => event.startsWith('evidence:effect:'))).toHaveLength(1)
  })

  test('Dashboard ready journal 丢失后恢复会收养真实服务并在后续补偿中精确停止', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events, activationFor, {
      failJournalWritePhaseOnce: 'dashboard-ready',
    })
    const releaseId = `sha256-${'a'.repeat(64)}`
    let dashboardTransactionId: string | undefined
    const ownership = {
      version: 1 as const,
      port: 18765,
      pid: 4242,
      releaseId,
      stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
      get transactionId() { return dashboardTransactionId },
    }
    let running = false
    const actualSession = {
      ownership,
      stop: async () => {
        running = false
        events.push('dashboard:actual:stop')
        return { state: 'stopped' as const }
      },
    }
    const starter: ReleasedDashboardStarter = {
      inspect: async () => running ? ownership : null,
      adopt: async (_deps, expected) =>
        running && expected.pid === ownership.pid ? actualSession : null,
      start: async (_deps, _payloadRoot, opts) => {
        if (running) {
          events.push('dashboard:probe:reuse')
          return {
            state: 'ready',
            session: {
              ownership,
              stop: async () => {
                events.push('dashboard:probe:stop')
                return { state: 'stopped' as const }
              },
            },
          }
        }
        dashboardTransactionId = opts.transactionId
        running = true
        events.push('dashboard:actual:start')
        return { state: 'ready', session: actualSession }
      },
    }
    const managedRequest = {
      ...request('/candidate/one'),
      commitReadyEvidence: () => {
        throw new Error('receipt unavailable')
      },
    }

    expect(await publishManagedRelease(makeDeps(), managedRequest, installer, starter))
      .toMatchObject({ ok: false, state: 'indeterminate' })
    expect(running).toBe(true)
    expect(await publishManagedRelease(makeDeps(), managedRequest, installer, starter))
      .toMatchObject({ ok: false, state: 'restored' })
    expect(running).toBe(false)
    expect(events).toContain('dashboard:actual:stop')
    expect(events).not.toContain('dashboard:probe:reuse')
  })

  test.each([
    ['普通 Dashboard', undefined],
    ['其他 transaction Dashboard', 'transaction-other'],
  ])('%s 即使 release/state scope 相同也不会被 release transaction 收养或停止', async (
    _label,
    transactionId,
  ) => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const ownership = dashboardOwnership(undefined, transactionId)
    const starter: ReleasedDashboardStarter = {
      inspect: async () => ownership,
      adopt: async () => {
        events.push('dashboard:adopt')
        return null
      },
      start: async () => {
        events.push('dashboard:start')
        return readyDashboard()
      },
    }

    const outcome = await publishManagedRelease(
      makeDeps(),
      request('/candidate/one'),
      installer,
      starter,
    )

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(events).not.toContain('dashboard:adopt')
    expect(events).not.toContain('dashboard:start')
    expect(events).not.toContain('revert')
  })
})
