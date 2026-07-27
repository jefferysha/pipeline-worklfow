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
import { restorePreviousReleasedDashboard } from './dashboard-restore.js'
import { publishManagedRelease } from './release-coordinator.js'

function dashboardOwnership(
  releaseId = `sha256-${'a'.repeat(64)}`,
  transactionId?: string,
  port = 18_765,
) {
  return {
    version: 1 as const,
    port,
    pid: 321,
    releaseId,
    stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
    ...(transactionId === undefined ? {} : { transactionId }),
  }
}

function readyDashboard(
  releaseId = `sha256-${'a'.repeat(64)}`,
  transactionId = 'transaction-1',
  port = 18_765,
) {
  return {
    state: 'ready' as const,
    session: {
      ownership: dashboardOwnership(releaseId, transactionId, port),
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
    readonly checkpointSelection?: RuntimeActivation['selection']
  } = {},
): RuntimeInstaller {
  let tail = Promise.resolve()
  let journal: ManagedReleaseJournalRecord | null = options.initialJournal ?? null
  let journalSequence = 0
  let failedJournalWrite = false
  let currentActivation = options.initialJournal?.activation
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
            selection: options.checkpointSelection ?? {
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
            currentActivation = activate(candidateRoot, host)
            return currentActivation
          },
          recoverActivation: async () => {
            const recovered = options.recoverActivation?.()
              ?? (currentActivation === undefined
                ? { state: 'not-started' as const }
                : { state: 'activated' as const, activation: currentActivation })
            if (recovered.state === 'activated') currentActivation = recovered.activation
            return recovered
          },
          revertActivation: async () => {
            if (currentActivation !== undefined) events.push('revert')
            currentActivation = undefined
          },
          proveActivation: async (activation) =>
            currentActivation?.release.releaseId === activation.release.releaseId
            && currentActivation.selection.revision === activation.selection.revision,
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
  test('previous Dashboard restore rejects a ready session with mismatched ownership', async () => {
    const activation = activationFor('/candidate/one', 'codex')
    const previousRelease = `sha256-${'f'.repeat(64)}`
    let stops = 0
    const outcome = await restorePreviousReleasedDashboard(
      makeDeps(),
      {
        ...activation,
        selection: { ...activation.selection, previousRelease },
      },
      {
        inspect: async () => null,
        adopt: async () => null,
        start: async (_deps, _payloadRoot, opts) => ({
          state: 'ready',
          session: {
            ownership: dashboardOwnership(
              activation.release.releaseId,
              undefined,
              opts.port,
            ),
            stop: async () => {
              stops += 1
              return { state: 'stopped' as const }
            },
          },
        }),
      },
      43_210,
      'transaction-restore',
    )

    expect(outcome).toMatchObject({
      state: 'indeterminate',
      detail: expect.stringContaining('mismatched ownership'),
    })
    expect(stops).toBe(0)
  })

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
          opts.port,
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
        return readyDashboard(undefined, opts.transactionId, opts.port)
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
            ownership: dashboardOwnership(undefined, opts.transactionId, opts.port),
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
      'journal:candidate-resolved',
      'journal:activating-runtime',
      'activate:/candidate/one',
      'journal:runtime-activated',
      'journal:starting-dashboard',
      'dashboard:candidate:ready',
      'journal:dashboard-ready',
      'evidence:commit',
      'journal:stopping-candidate',
      'dashboard:candidate:stop',
      'journal:reverting-activation',
      'revert',
      'journal:restoring-previous',
      'journal:previous-restored',
      'journal:cleared',
      'transaction:end',
    ])
  })

  test('ready evidence failure stops the candidate before reverting and restoring the previous Dashboard', async () => {
    const events: string[] = []
    const startedPorts: Array<number | undefined> = []
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
    }, {
      checkpointSelection: {
        version: 1,
        revision: 0,
        activeRelease: previousRelease,
        previousRelease: null,
        updatedAt: '2026-07-26T00:00:00Z',
      },
    })
    let running: ReturnType<typeof dashboardOwnership> | null = null
    const starter: ReleasedDashboardStarter = {
      inspect: async () => running,
      adopt: async () => null,
      start: async (_deps, payloadRoot, opts) => {
        startedPorts.push(opts.port)
        if (payloadRoot.includes(previousRelease)) {
          events.push('dashboard:previous:ready')
          running = dashboardOwnership(previousRelease, opts.transactionId, opts.port)
          return {
            state: 'ready',
            session: {
              ownership: running,
              stop: async () => ({ state: 'stopped' as const }),
            },
          }
        }
        events.push('dashboard:candidate:ready')
        running = dashboardOwnership(undefined, opts.transactionId, opts.port)
        return {
          state: 'ready',
          session: {
            ownership: running,
            stop: async () => {
              events.push('dashboard:candidate:stop')
              running = null
              return { state: 'stopped' as const }
            },
          },
        }
      },
    }

    const outcome = await publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      dashboardPort: 43_210,
      commitReadyEvidence: () => {
        events.push('evidence:commit')
        throw new Error('receipt storage unavailable')
      },
    }, installer, starter)

    expect(outcome).toMatchObject({ ok: false, state: 'restored' })
    expect(startedPorts).toEqual([43_210, 43_210])
    expect(events).toEqual([
      'transaction:start',
      'journal:preparing-host',
      'journal:candidate-resolved',
      'journal:candidate-resolved',
      'journal:activating-runtime',
      'activate:/candidate/one',
      'journal:runtime-activated',
      'journal:starting-dashboard',
      'dashboard:candidate:ready',
      'journal:dashboard-ready',
      'evidence:commit',
      'journal:stopping-candidate',
      'dashboard:candidate:stop',
      'journal:reverting-activation',
      'revert',
      'journal:restoring-previous',
      'dashboard:previous:ready',
      'journal:previous-restored',
      'journal:cleared',
      'transaction:end',
    ])
  })

  test.each([
    'restoring-previous',
    'previous-restored',
  ] as const)(
    'compensation resumes after a crash before %s without duplicate revert or Dashboard restore',
    async (failedPhase) => {
      const events: string[] = []
      const previousRelease = `sha256-${'f'.repeat(64)}`
      const installer = serializedInstaller(events, (candidateRoot, host) => {
        const activation = activationFor(candidateRoot, host)
        return {
          ...activation,
          selection: { ...activation.selection, previousRelease },
        }
      }, {
        checkpointSelection: {
          version: 1,
          revision: 0,
          activeRelease: previousRelease,
          previousRelease: null,
          updatedAt: '2026-07-26T00:00:00Z',
        },
        failJournalWritePhaseOnce: failedPhase,
      })
      let running: ReturnType<typeof dashboardOwnership> | null = null
      const starter: ReleasedDashboardStarter = {
        inspect: async () => running,
        adopt: async (_deps, identity) => {
          if (running === null || JSON.stringify(running) !== JSON.stringify(identity)) return null
          return {
            ownership: running,
            stop: async () => {
              events.push(`dashboard:stop:${identity.releaseId}`)
              running = null
              return { state: 'stopped' as const }
            },
          }
        },
        start: async (_deps, payloadRoot, opts) => {
          const releaseId = payloadRoot.includes(previousRelease)
            ? previousRelease
            : `sha256-${'a'.repeat(64)}`
          events.push(`dashboard:start:${releaseId}`)
          running = dashboardOwnership(releaseId, opts.transactionId, opts.port)
          return {
            state: 'ready',
            session: {
              ownership: running,
              stop: async () => {
                events.push(`dashboard:stop:${releaseId}`)
                running = null
                return { state: 'stopped' as const }
              },
            },
          }
        },
      }
      const publish = () => publishManagedRelease(
        makeDeps(),
        {
          ...request('/candidate/one'),
          commitReadyEvidence: () => {
            throw new Error('injected evidence failure')
          },
        },
        installer,
        starter,
      )

      expect(await publish()).toMatchObject({ ok: false, state: 'indeterminate' })
      expect(await publish()).toMatchObject({ ok: false, state: 'restored' })
      expect(events.filter((event) => event === 'revert')).toHaveLength(1)
      expect(events.filter((event) => event === `dashboard:start:${previousRelease}`)).toHaveLength(1)
      expect(events.filter((event) => event === `dashboard:stop:sha256-${'a'.repeat(64)}`))
        .toHaveLength(1)
      expect(running).toMatchObject({
        releaseId: previousRelease,
        transactionId: expect.stringMatching(/:restore$/),
      })
    },
  )

  test('an unverifiable candidate listener keeps stopping-candidate WAL and sends no signal', async () => {
    const events: string[] = []
    const activation = activationFor('/candidate/one', 'codex')
    const previousRelease = `sha256-${'f'.repeat(64)}`
    const transactionId = 'transaction-unverifiable'
    const installer = serializedInstaller(events, activationFor, {
      initialJournal: {
        version: 1,
        transactionId,
        operation: 'setup',
        source: 'codex',
        phase: 'stopping-candidate',
        startedAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-26T00:00:00Z',
        dashboardPort: 18_765,
        candidateRoot: '/candidate/one',
        activation: {
          ...activation,
          selection: { ...activation.selection, previousRelease },
        },
        activationCheckpoint: {
          selection: {
            version: 1,
            revision: 0,
            activeRelease: previousRelease,
            previousRelease: null,
            updatedAt: '2026-07-25T00:00:00Z',
          },
          launchers: {
            tenon: { path: '/home/test/.local/bin/tenon', state: { kind: 'missing' } },
            hook: { path: '/home/test/.local/bin/tenon-hook', state: { kind: 'missing' } },
          },
        },
        dashboardBeforeAbsent: true,
        dashboard: {
          ...dashboardOwnership(undefined, transactionId),
          owner: 'transaction',
        },
        compensationReason: 'injected evidence failure',
      },
    })
    let signals = 0

    const outcome = await publishManagedRelease(
      makeDeps(),
      request('/candidate/one'),
      installer,
      {
        inspect: async () => {
          throw new Error('listener is alive but health is unverifiable')
        },
        adopt: async () => {
          signals += 1
          return null
        },
        start: async () => readyDashboard(),
      },
    )

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(outcome.detail).toContain('health is unverifiable')
    expect(signals).toBe(0)
    expect(events).not.toContain('revert')
    expect(events).not.toContain('journal:reverting-activation')
  })

  test('fresh retry precisely stops a restored previous Dashboard before starting the candidate again', async () => {
    const events: string[] = []
    const previousRelease = `sha256-${'f'.repeat(64)}`
    const installer = serializedInstaller(events, (candidateRoot, host) => {
      const activation = activationFor(candidateRoot, host)
      return {
        ...activation,
        selection: { ...activation.selection, previousRelease },
      }
    }, {
      checkpointSelection: {
        version: 1,
        revision: 0,
        activeRelease: previousRelease,
        previousRelease: null,
        updatedAt: '2026-07-26T00:00:00Z',
      },
    })
    let running: ReturnType<typeof dashboardOwnership> | null = null
    const starter: ReleasedDashboardStarter = {
      inspect: async () => running,
      adopt: async (_deps, identity) => {
        if (running === null || JSON.stringify(identity) !== JSON.stringify(running)) return null
        return {
          ownership: running,
          stop: async () => {
            events.push(`dashboard:stop:${identity.releaseId}`)
            running = null
            return { state: 'stopped' as const }
          },
        }
      },
      start: async (_deps, payloadRoot, opts) => {
        const releaseId = payloadRoot.includes(previousRelease)
          ? previousRelease
          : `sha256-${'a'.repeat(64)}`
        events.push(`dashboard:start:${releaseId}`)
        running = dashboardOwnership(releaseId, opts.transactionId, opts.port)
        return {
          state: 'ready',
          session: {
            ownership: running,
            stop: async () => {
              events.push(`dashboard:stop:${releaseId}`)
              running = null
              return { state: 'stopped' as const }
            },
          },
        }
      },
    }
    let failEvidence = true
    const publish = () => publishManagedRelease(makeDeps(), {
      ...request('/candidate/one'),
      commitReadyEvidence: () => {
        if (failEvidence) {
          failEvidence = false
          throw new Error('injected first evidence failure')
        }
      },
    }, installer, starter)

    expect(await publish()).toMatchObject({ ok: false, state: 'restored' })
    expect(running?.releaseId).toBe(previousRelease)
    expect(running?.transactionId).toMatch(/:restore$/)

    expect(await publish()).toMatchObject({ ok: true, state: 'ready' })
    expect(running?.releaseId).toBe(`sha256-${'a'.repeat(64)}`)
    expect(events.filter((event) => event === `dashboard:stop:${previousRelease}`)).toHaveLength(1)
    expect(events.filter((event) => event === `dashboard:start:sha256-${'a'.repeat(64)}`))
      .toHaveLength(2)
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

  test('activated legacy WAL cannot infer missing pre-activation Dashboard evidence or port from retry state', async () => {
    const events: string[] = []
    const activation = activationFor('/candidate/one', 'codex')
    const installer = serializedInstaller(events, activationFor, {
      initialJournal: {
        version: 1,
        transactionId: 'transaction-legacy-activated',
        operation: 'setup',
        source: 'codex',
        phase: 'runtime-activated',
        startedAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-26T00:00:00Z',
        candidateRoot: '/candidate/one',
        activation,
      },
    })
    let inspections = 0

    const outcome = await publishManagedRelease(
      makeDeps(),
      { ...request('/candidate/one'), dashboardPort: 43_210 },
      installer,
      {
        inspect: async () => {
          inspections += 1
          return null
        },
        adopt: async () => null,
        start: async () => readyDashboard(undefined, 'transaction-legacy-activated', 43_210),
      },
    )

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(outcome.detail).toContain('pre-activation')
    expect(inspections).toBe(0)
    expect(events).not.toContain('journal:dashboard-ready')
  })

  test.each([
    {
      recoveryState: 'not-started',
      recover: () => ({ state: 'not-started' as const }),
    },
    {
      recoveryState: 'activated',
      recover: () => ({
        state: 'activated' as const,
        activation: activationFor('/candidate/one', 'codex'),
      }),
    },
  ])(
    'activating legacy WAL fails closed before $recoveryState recovery can supplement missing pre-activation proof',
    async ({ recover }) => {
      const events: string[] = []
      let recoveryCalls = 0
      let inspections = 0
      let adoptions = 0
      let starts = 0
      let stops = 0
      const installer = serializedInstaller(events, activationFor, {
        initialJournal: {
          version: 1,
          transactionId: 'transaction-legacy-activating',
          operation: 'setup',
          source: 'codex',
          phase: 'activating-runtime',
          startedAt: '2026-07-26T00:00:00Z',
          updatedAt: '2026-07-26T00:00:00Z',
          dashboardPort: 43_210,
          candidateRoot: '/candidate/one',
          activationCheckpoint: {
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
          },
        },
        recoverActivation: async () => {
          recoveryCalls += 1
          return recover()
        },
      })

      const outcome = await publishManagedRelease(
        makeDeps(),
        { ...request('/candidate/one'), dashboardPort: 43_210 },
        installer,
        {
          inspect: async () => {
            inspections += 1
            return null
          },
          adopt: async () => {
            adoptions += 1
            return {
              ownership: dashboardOwnership(),
              stop: async () => {
                stops += 1
                return { state: 'stopped' as const }
              },
            }
          },
          start: async () => {
            starts += 1
            return readyDashboard()
          },
        },
      )

      expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
      expect(outcome.detail).toContain('pre-activation')
      expect(recoveryCalls).toBe(0)
      expect(inspections).toBe(0)
      expect(adoptions).toBe(0)
      expect(starts).toBe(0)
      expect(stops).toBe(0)
      expect(events).not.toContain('activate:/candidate/one')
    },
  )

  test('activating legacy WAL cannot infer a missing pre-activation Dashboard port from the retry request', async () => {
    const events: string[] = []
    let recoveryCalls = 0
    let inspections = 0
    const installer = serializedInstaller(events, activationFor, {
      initialJournal: {
        version: 1,
        transactionId: 'transaction-legacy-activating-port',
        operation: 'setup',
        source: 'codex',
        phase: 'activating-runtime',
        startedAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-26T00:00:00Z',
        candidateRoot: '/candidate/one',
        activationCheckpoint: {
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
        },
      },
      recoverActivation: async () => {
        recoveryCalls += 1
        return { state: 'not-started' as const }
      },
    })

    const outcome = await publishManagedRelease(
      makeDeps(),
      { ...request('/candidate/one'), dashboardPort: 43_210 },
      installer,
      {
        inspect: async () => {
          inspections += 1
          return null
        },
        adopt: async () => null,
        start: async () => readyDashboard(),
      },
    )

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(outcome.detail).toContain('pre-activation Dashboard port')
    expect(recoveryCalls).toBe(0)
    expect(inspections).toBe(0)
    expect(events).not.toContain('activate:/candidate/one')
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
    ['普通 Dashboard', undefined, false],
    ['探针之间出现的其他 transaction Dashboard', 'transaction-other', true],
  ])('%s 即使 release/state scope 相同也不会被 release transaction 收养或停止', async (
    _label,
    transactionId,
    appearsAfterFirstProbe,
  ) => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const ownership = dashboardOwnership(undefined, transactionId)
    let probes = 0
    const starter: ReleasedDashboardStarter = {
      inspect: async () => {
        probes += 1
        return appearsAfterFirstProbe && probes === 1 ? null : ownership
      },
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

  test('same-release repeat setup proves the existing Dashboard as preexisting without adopt or restart', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    let running: ReturnType<typeof dashboardOwnership> | null = null
    const starter: ReleasedDashboardStarter = {
      inspect: async () => running,
      adopt: async () => {
        events.push('dashboard:adopt')
        return null
      },
      start: async (_deps, _payloadRoot, opts) => {
        events.push('dashboard:start')
        running = dashboardOwnership(undefined, opts.transactionId, opts.port)
        return {
          state: 'ready',
          session: {
            ownership: running,
            stop: async () => {
              events.push('dashboard:stop')
              running = null
              return { state: 'stopped' as const }
            },
          },
        }
      },
    }

    expect(await publishManagedRelease(
      makeDeps(),
      request('/candidate/one'),
      installer,
      starter,
    )).toMatchObject({ ok: true })
    const firstIdentity = running

    expect(await publishManagedRelease(
      makeDeps(),
      request('/candidate/one'),
      installer,
      starter,
    )).toMatchObject({ ok: true })
    expect(running).toEqual(firstIdentity)
    expect(events.filter((event) => event === 'dashboard:start')).toHaveLength(1)
    expect(events).not.toContain('dashboard:adopt')
    expect(events).not.toContain('dashboard:stop')
  })

  test('managed Dashboard inspect and start use the request-scoped port', async () => {
    const events: string[] = []
    const ports: Array<number | undefined> = []
    const installer = serializedInstaller(events)
    const starter: ReleasedDashboardStarter = {
      inspect: async (_deps, opts) => {
        ports.push(opts.port)
        return null
      },
      adopt: async () => null,
      start: async (_deps, _payloadRoot, opts) => {
        ports.push(opts.port)
        return readyDashboard(undefined, opts.transactionId, opts.port)
      },
    }
    const requestWithPort = {
      ...request('/candidate/one'),
      dashboardPort: 43_210,
    }

    expect(await publishManagedRelease(
      makeDeps(),
      requestWithPort,
      installer,
      starter,
    )).toMatchObject({ ok: true })
    expect(ports).toEqual([43_210, 43_210, 43_210])
  })

  test('a started Dashboard on a port other than the frozen request port is indeterminate', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    let stops = 0
    const outcome = await publishManagedRelease(
      makeDeps(),
      { ...request('/candidate/one'), dashboardPort: 43_210 },
      installer,
      {
        inspect: async () => null,
        adopt: async () => null,
        start: async (_deps, _payloadRoot, opts) => ({
          state: 'ready',
          session: {
            ownership: dashboardOwnership(undefined, opts.transactionId, 18_765),
            stop: async () => {
              stops += 1
              return { state: 'stopped' as const }
            },
          },
        }),
      },
    )

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(events).toContain('journal:starting-dashboard')
    expect(events).not.toContain('journal:dashboard-ready')
    expect(events).not.toContain('revert')
    expect(stops).toBe(0)
  })

  test('recovery re-proves a durable preexisting Dashboard without adopting it', async () => {
    const events: string[] = []
    const activation = activationFor('/candidate/one', 'codex')
    const ownership = dashboardOwnership(activation.release.releaseId, 'transaction-before')
    const installer = serializedInstaller(events, activationFor, {
      initialJournal: {
        version: 1,
        transactionId: 'transaction-2',
        operation: 'setup',
        source: 'codex',
        phase: 'dashboard-ready',
        startedAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-26T00:00:00Z',
        dashboardPort: 18_765,
        candidateRoot: '/candidate/one',
        activation,
        dashboardBefore: ownership,
        dashboard: { ...ownership, owner: 'preexisting' },
      },
    })
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

    expect(await publishManagedRelease(
      makeDeps(),
      request('/candidate/one'),
      installer,
      starter,
    )).toMatchObject({ ok: true })
    expect(events).not.toContain('dashboard:adopt')
    expect(events).not.toContain('dashboard:start')
  })

  test('dashboard-ready recovery rejects an adopted session whose ownership differs from the WAL', async () => {
    const events: string[] = []
    const activation = activationFor('/candidate/one', 'codex')
    const ownership = dashboardOwnership(
      activation.release.releaseId,
      'transaction-2',
    )
    const installer = serializedInstaller(events, activationFor, {
      initialJournal: {
        version: 1,
        transactionId: 'transaction-2',
        operation: 'setup',
        source: 'codex',
        phase: 'dashboard-ready',
        startedAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-26T00:00:00Z',
        dashboardPort: 18_765,
        candidateRoot: '/candidate/one',
        activation,
        dashboardBeforeAbsent: true,
        dashboard: { ...ownership, owner: 'transaction' },
      },
    })

    const outcome = await publishManagedRelease(
      makeDeps(),
      request('/candidate/one'),
      installer,
      {
        inspect: async () => ownership,
        adopt: async () => ({
          ownership: { ...ownership, pid: ownership.pid + 1 },
          stop: async () => ({ state: 'stopped' as const }),
        }),
        start: async () => readyDashboard(),
      },
    )

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(events).not.toContain('journal:cleared')
    expect(events).not.toContain('revert')
  })

  test('starting-dashboard recovery rejects a mismatched session returned for the inspected identity', async () => {
    const events: string[] = []
    const activation = activationFor('/candidate/one', 'codex')
    const ownership = dashboardOwnership(
      activation.release.releaseId,
      'transaction-2',
    )
    const installer = serializedInstaller(events, activationFor, {
      initialJournal: {
        version: 1,
        transactionId: 'transaction-2',
        operation: 'setup',
        source: 'codex',
        phase: 'starting-dashboard',
        startedAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-26T00:00:00Z',
        dashboardPort: 18_765,
        candidateRoot: '/candidate/one',
        activation,
        dashboardBeforeAbsent: true,
      },
    })

    const outcome = await publishManagedRelease(
      makeDeps(),
      request('/candidate/one'),
      installer,
      {
        inspect: async () => ownership,
        adopt: async () => ({
          ownership: { ...ownership, stateScopeId: `sha256-v1-${'2'.repeat(64)}` },
          stop: async () => ({ state: 'stopped' as const }),
        }),
        start: async () => readyDashboard(),
      },
    )

    expect(outcome).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(events).not.toContain('journal:dashboard-ready')
    expect(events).not.toContain('revert')
  })

  test('failed evidence compensation never stops or restores a preexisting Dashboard', async () => {
    const events: string[] = []
    const activeRelease = `sha256-${'a'.repeat(64)}`
    const installer = serializedInstaller(events, activationFor, {
      checkpointSelection: {
        version: 1,
        revision: 1,
        activeRelease,
        previousRelease: null,
        updatedAt: '2026-07-26T00:00:00Z',
      },
    })
    const ownership = dashboardOwnership(undefined, 'transaction-before')
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

    expect(await publishManagedRelease(
      makeDeps(),
      {
        ...request('/candidate/one'),
        commitReadyEvidence: () => {
          throw new Error('injected evidence failure')
        },
      },
      installer,
      starter,
    )).toMatchObject({ ok: false, state: 'restored' })
    expect(events).not.toContain('revert')
    expect(events).not.toContain('dashboard:adopt')
    expect(events).not.toContain('dashboard:start')
  })

  test('same-release evidence failure does not revert selection or restore a historical previous Dashboard', async () => {
    const events: string[] = []
    const activeRelease = `sha256-${'a'.repeat(64)}`
    const previousRelease = `sha256-${'f'.repeat(64)}`
    const selection = {
      version: 1 as const,
      revision: 7,
      activeRelease,
      previousRelease,
      updatedAt: '2026-07-26T00:00:00Z',
    }
    const installer = serializedInstaller(events, (candidateRoot, host) => ({
      ...activationFor(candidateRoot, host),
      selection,
    }), { checkpointSelection: selection })
    const starter: ReleasedDashboardStarter = {
      inspect: async () => null,
      adopt: async () => null,
      start: async (_deps, payloadRoot, opts) => {
        events.push(payloadRoot.includes(previousRelease)
          ? 'dashboard:previous:start'
          : 'dashboard:candidate:start')
        return {
          state: 'ready',
          session: {
            ownership: dashboardOwnership(activeRelease, opts.transactionId, opts.port),
            stop: async () => {
              events.push('dashboard:candidate:stop')
              return { state: 'stopped' as const }
            },
          },
        }
      },
    }

    expect(await publishManagedRelease(
      makeDeps(),
      {
        ...request('/candidate/one'),
        commitReadyEvidence: () => {
          throw new Error('injected evidence failure')
        },
      },
      installer,
      starter,
    )).toMatchObject({ ok: false, state: 'restored' })
    expect(events).not.toContain('revert')
    expect(events).not.toContain('dashboard:previous:start')
  })

  test('changed-release evidence failure preserves aligned activation and journal for a preexisting Dashboard retry', async () => {
    const events: string[] = []
    const previousActive = `sha256-${'a'.repeat(64)}`
    const candidateActive = `sha256-${'b'.repeat(64)}`
    const installer = serializedInstaller(events, activationFor, {
      checkpointSelection: {
        version: 1,
        revision: 4,
        activeRelease: previousActive,
        previousRelease: null,
        updatedAt: '2026-07-26T00:00:00Z',
      },
    })
    const ownership = dashboardOwnership(candidateActive, 'transaction-before')
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

    expect(await publishManagedRelease(
      makeDeps(),
      {
        ...request('/candidate/two'),
        commitReadyEvidence: () => {
          throw new Error('injected evidence failure')
        },
      },
      installer,
      starter,
    )).toMatchObject({ ok: false, state: 'indeterminate' })
    expect(events).not.toContain('revert')
    expect(events).not.toContain('journal:cleared')
    expect(events).not.toContain('dashboard:adopt')
    expect(events).not.toContain('dashboard:start')
  })

  test('starting-dashboard recovery uses the frozen port even if the retry environment changes', async () => {
    const events: string[] = []
    const activation = activationFor('/candidate/one', 'codex')
    const inspectedPorts: Array<number | undefined> = []
    const installer = serializedInstaller(events, activationFor, {
      initialJournal: {
        version: 1,
        transactionId: 'transaction-2',
        operation: 'setup',
        source: 'codex',
        phase: 'starting-dashboard',
        startedAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-26T00:00:00Z',
        dashboardPort: 43_210,
        candidateRoot: '/candidate/one',
        activation,
        dashboardBeforeAbsent: true,
      },
    })
    const starter: ReleasedDashboardStarter = {
      inspect: async (_deps, opts) => {
        inspectedPorts.push(opts.port)
        return null
      },
      adopt: async () => null,
      start: async (_deps, _payloadRoot, opts) => {
        inspectedPorts.push(opts.port)
        return readyDashboard(activation.release.releaseId, opts.transactionId, opts.port)
      },
    }

    expect(await publishManagedRelease(
      makeDeps(),
      { ...request('/candidate/one'), dashboardPort: 43_211 },
      installer,
      starter,
    )).toMatchObject({ ok: true })
    expect(inspectedPorts).toEqual([43_210, 43_210])
  })
})
