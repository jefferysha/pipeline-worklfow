import { describe, expect, test } from 'vitest'
import { resolveRuntimePaths } from '../runtime/paths.js'
import type { RuntimeScopeSnapshot } from '../runtime/scope.js'
import type { TrustedExecutable } from './trusted-executable.js'
import { makeDoctorProbes } from './doctor-probes.js'

function probeScope(): RuntimeScopeSnapshot {
  const homeDir = '/tmp/tenon-doctor-probes'
  const env = { PATH: '/trusted/bin' }
  return { homeDir, env, paths: resolveRuntimePaths({ homeDir, env }) }
}

describe('doctor provenance adapter', () => {
  test('replays Bash then Node before the injected verifier spawn', async () => {
    const events: string[] = []
    const trusted = (name: 'bash' | 'node' | 'git' | 'codex' | 'claude') => ({
      executable: `/trusted/${name}`,
      requestedPath: `/trusted/${name}`,
      proof: { version: 1, platform: process.platform, requestedPath: `/trusted/${name}`, executable: { path: `/trusted/${name}`, dev: 1, ino: 1, mode: 0o755, uid: 0, size: 1 }, parents: [], sha256: 'a'.repeat(64) },
      verify: () => { events.push(`${name}-proof`); return true },
      assert: () => {},
    } satisfies TrustedExecutable)
    const probes = makeDoctorProbes(
      probeScope,
      '/trusted/root',
      {
        resolveTrustedCommand: (name) => trusted(name),
        run: async (file, args) => {
          events.push(`${file.slice('/trusted/'.length)}-spawn`)
          expect(args).toContain('--node')
          expect(args[args.indexOf('--node') + 1]).toBe('/trusted/node')
          return { code: 0, output: '' }
        },
      },
    )

    await expect(probes.runVerifySkills()).resolves.toEqual({ code: 0, output: '' })
    expect(events).toEqual(['bash-proof', 'node-proof', 'bash-spawn'])
  })

  test('Node drift fails closed without invoking the verifier', async () => {
    const events: string[] = []
    const trusted = (name: 'bash' | 'node' | 'git' | 'codex' | 'claude') => ({
      executable: `/trusted/${name}`,
      requestedPath: `/trusted/${name}`,
      proof: { version: 1, platform: process.platform, requestedPath: `/trusted/${name}`, executable: { path: `/trusted/${name}`, dev: 1, ino: 1, mode: 0o755, uid: 0, size: 1 }, parents: [], sha256: 'a'.repeat(64) },
      verify: () => { events.push(`${name}-proof`); return name !== 'node' },
      assert: () => {},
    } satisfies TrustedExecutable)
    const probes = makeDoctorProbes(
      probeScope,
      '/trusted/root',
      {
        resolveTrustedCommand: (name) => trusted(name),
        run: async () => {
          events.push('spawn')
          return { code: 0, output: '' }
        },
      },
    )

    await expect(probes.runVerifySkills()).resolves.toEqual({ code: 1, output: '可信 Bash/Node 身份已漂移' })
    expect(events).toEqual(['bash-proof', 'node-proof'])
  })
})
