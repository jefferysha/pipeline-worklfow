import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import { cmdRuntime } from './runtime.js'

const activeRelease = `sha256-${'c'.repeat(64)}`
const previousRelease = `sha256-${'d'.repeat(64)}`

function fakeInstaller(): { installer: RuntimeInstaller; calls: string[] } {
  const calls: string[] = []
  const installer: RuntimeInstaller = {
    withManagedTransaction: async () => { throw new Error('not used') },
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

const env = { homeDir: () => '/runtime-test-home', runtimeEnv: () => ({}) }

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

  test.each([
    ['status', { json: true }],
    ['repair', { rollback: true }],
  ] as const)('%s maps runtime scope resolution failures to the command error contract', async (sub, opts) => {
    const deps = makeDeps()
    const runtime = fakeInstaller()
    const brokenEnv = {
      homeDir: () => { throw new Error('home lookup failed') },
      runtimeEnv: () => ({}),
    }

    expect(await cmdRuntime(deps, sub, opts, brokenEnv, runtime.installer)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('home lookup failed')
  })

  test.each([
    ['status', { json: true }],
    ['repair', { rollback: true }],
  ] as const)('%s maps runtime environment provider failures to the command error contract', async (sub, opts) => {
    const deps = makeDeps()
    const runtime = fakeInstaller()
    const brokenEnv = {
      homeDir: () => '/runtime-test-home',
      runtimeEnv: () => { throw new Error('environment lookup failed') },
    }

    expect(await cmdRuntime(deps, sub, opts, brokenEnv, runtime.installer)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('environment lookup failed')
  })

  test('invalid and incomplete commands do not read runtime scope', async () => {
    const deps = makeDeps()
    const runtime = fakeInstaller()
    let reads = 0
    const countingEnv = {
      homeDir: () => { reads += 1; return '/unused' },
      runtimeEnv: () => { reads += 1; return {} },
    }

    expect(await cmdRuntime(deps, 'repair', {}, countingEnv, runtime.installer)).toBe(1)
    expect(await cmdRuntime(deps, 'unknown', {}, countingEnv, runtime.installer)).toBe(1)
    expect(reads).toBe(0)
  })
})
