import { describe, expect, test } from 'vitest'
import type { CliDeps } from '../deps.js'
import type {
  ManagedRuntimeTransaction,
  RuntimeInstaller,
} from '../runtime/installer.js'
import type { NativeRuntimeHost, RuntimeActivation } from '../runtime/types.js'
import { makeDeps } from '../test-support.js'
import {
  type ReleasedDashboardStarter,
} from './dashboard.js'
import { publishManagedRelease } from './release-coordinator.js'

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

function serializedInstaller(events: string[]): RuntimeInstaller {
  let tail = Promise.resolve()
  return {
    withManagedTransaction: async <T>(
      _homeDir: string,
      operation: (transaction: ManagedRuntimeTransaction) => Promise<T>,
    ): Promise<T> => {
      const previous = tail
      let release!: () => void
      tail = new Promise<void>((resolve) => { release = resolve })
      await previous
      events.push('transaction:start')
      try {
        return await operation({
          activate: async (candidateRoot, host) => {
            events.push(`activate:${candidateRoot}`)
            return activationFor(candidateRoot, host)
          },
          revertActivation: async () => {
            events.push('revert')
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
    candidateRoot,
    source: 'codex' as const,
    homeDir: '/home/test',
    openBrowser: false,
  }
}

describe('managed release coordinator', () => {
  test('serializes activation, launcher ownership, Dashboard readiness, and compensation as one transaction', async () => {
    const events: string[] = []
    let releaseFirstDashboard!: () => void
    const firstDashboard = new Promise<void>((resolve) => { releaseFirstDashboard = resolve })
    const starter: ReleasedDashboardStarter = {
      start: async (_deps, payloadRoot) => {
        events.push(`dashboard:${payloadRoot.includes('a'.repeat(64)) ? 'one' : 'two'}:start`)
        if (payloadRoot.includes('a'.repeat(64))) await firstDashboard
        events.push(`dashboard:${payloadRoot.includes('a'.repeat(64)) ? 'one' : 'two'}:ready`)
        return { state: 'ready' }
      },
    }
    const installer = serializedInstaller(events)

    const first = publishManagedRelease(makeDeps(), request('/candidate/one'), installer, starter)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = publishManagedRelease(makeDeps(), request('/candidate/two'), installer, starter)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(events).toEqual([
      'transaction:start',
      'activate:/candidate/one',
      'dashboard:one:start',
    ])

    releaseFirstDashboard()
    expect((await Promise.all([first, second])).every((outcome) => outcome.ok)).toBe(true)
    expect(events).toEqual([
      'transaction:start',
      'activate:/candidate/one',
      'dashboard:one:start',
      'dashboard:one:ready',
      'transaction:end',
      'transaction:start',
      'activate:/candidate/two',
      'dashboard:two:start',
      'dashboard:two:ready',
      'transaction:end',
    ])
  })

  test('does not compensate selection or launch a previous Dashboard when candidate termination is unconfirmed', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const starter: ReleasedDashboardStarter = {
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
      'activate:/candidate/one',
      'transaction:end',
    ])
  })

  test('treats an unexpected Dashboard starter rejection as indeterminate instead of guessing compensation safety', async () => {
    const events: string[] = []
    const installer = serializedInstaller(events)
    const starter: ReleasedDashboardStarter = {
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
})
