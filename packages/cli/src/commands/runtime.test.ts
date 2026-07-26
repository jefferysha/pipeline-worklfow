import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import { cmdRuntime } from './runtime.js'

const activeRelease = `sha256-${'c'.repeat(64)}`
const previousRelease = `sha256-${'d'.repeat(64)}`

function fakeInstaller(): { installer: RuntimeInstaller; calls: string[] } {
  const calls: string[] = []
  const installer: RuntimeInstaller = {
    activate: async () => { throw new Error('not used') },
    inspect: async () => ({
      selection: {
        version: 1,
        revision: 7,
        activeRelease,
        previousRelease,
        updatedAt: '2026-07-24T00:00:00Z',
      },
      active: {
        version: 1,
        releaseId: activeRelease,
        payloadDigest: 'c'.repeat(64),
        createdAt: '2026-07-24T00:00:00Z',
        source: { host: 'codex', pluginVersion: '1.0.0' },
      },
      previous: {
        version: 1,
        releaseId: previousRelease,
        payloadDigest: 'd'.repeat(64),
        createdAt: '2026-07-23T00:00:00Z',
        source: { host: 'codex', pluginVersion: '0.9.0' },
      },
      activeValid: true,
      previousValid: true,
      lastAudit: null,
    }),
    rollback: async () => {
      calls.push('rollback')
      return {
        release: {
          version: 1,
          releaseId: previousRelease,
          payloadDigest: 'd'.repeat(64),
          createdAt: '2026-07-23T00:00:00Z',
          source: { host: 'codex', pluginVersion: '0.9.0' },
        },
        selection: {
          version: 1,
          revision: 8,
          activeRelease: previousRelease,
          previousRelease: activeRelease,
          updatedAt: '2026-07-24T00:00:00Z',
        },
        releaseRoot: `/runtime/releases/${previousRelease}`,
      }
    },
  }
  return { installer, calls }
}

const env = { homeDir: () => '/runtime-test-home' }

describe('tenon runtime', () => {
  test('status exposes active and previous verification state without mutating the runtime', async () => {
    const deps = makeDeps()
    const runtime = fakeInstaller()

    expect(await cmdRuntime(deps, 'status', { json: true }, env, runtime.installer)).toBe(0)
    expect(JSON.parse(deps.outLines.join(''))).toMatchObject({
      activeValid: true,
      previousValid: true,
      selection: { activeRelease, previousRelease, revision: 7 },
    })
    expect(runtime.calls).toEqual([])
  })

  test('repair accepts only the exact rollback capability', async () => {
    const deps = makeDeps()
    const runtime = fakeInstaller()

    expect(await cmdRuntime(deps, 'repair', {}, env, runtime.installer)).toBe(1)
    expect(runtime.calls).toEqual([])
    expect(deps.errLines.join('\n')).toContain('runtime repair --rollback')
  })

  test('repair --rollback selects a previous verified release through the runtime boundary', async () => {
    const deps = makeDeps()
    const runtime = fakeInstaller()

    expect(await cmdRuntime(deps, 'repair', { rollback: true, json: true }, env, runtime.installer)).toBe(0)
    expect(runtime.calls).toEqual(['rollback'])
    expect(JSON.parse(deps.outLines.join(''))).toMatchObject({
      ok: true,
      selection: { activeRelease: previousRelease, previousRelease: activeRelease, revision: 8 },
    })
  })
})
