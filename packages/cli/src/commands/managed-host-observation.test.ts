import { describe, expect, test } from 'vitest'
import { ManagedRuntimeIndeterminateError } from '../runtime/installer.js'
import type { SetupEnv } from './setupEnvironment.js'
import {
  desiredNativeHostPostcondition,
  observeNativeHost,
} from './managed-host-observation.js'

function observationEnv(state: {
  head: string
  remoteHead: string
  pluginVersion: string
  marketplaceRoot?: string
  marketplaceSource?: string
  marketplaceSourceType?: string
  pluginRoot?: string
  marketplacePresent?: boolean
  marketplaceRemote?: string
}): SetupEnv {
  const initialRoot = '/host/tenon-marketplace'
  return {
    readText: (path) => path === `${state.marketplaceRoot ?? initialRoot}/.codex-plugin/plugin.json`
      ? JSON.stringify({ version: '1.0.1' })
      : undefined,
    runCommand: (cmd, args) => {
      const root = state.marketplaceRoot ?? initialRoot
      const text = `${cmd} ${args.join(' ')}`
      if (text === 'codex plugin marketplace list --json') {
        return {
          code: 0,
          stdout: JSON.stringify({
            marketplaces: state.marketplacePresent === false ? [] : [{
              name: 'tenon',
              root,
              marketplaceSource: {
                sourceType: state.marketplaceSourceType ?? 'git',
                source: state.marketplaceSource ?? 'https://github.com/jefferysha/tenon.git',
              },
            }],
          }),
          stderr: '',
        }
      }
      if (text === 'codex plugin list --json') {
        return {
          code: 0,
          stdout: JSON.stringify({
            installed: [{
              pluginId: 'tenon@tenon',
              version: state.pluginVersion,
              source: { path: state.pluginRoot ?? root },
            }],
          }),
          stderr: '',
        }
      }
      if (text === `git -C ${root} rev-parse HEAD`) {
        return { code: 0, stdout: `${state.head}\n`, stderr: '' }
      }
      if (text === `git -C ${root} remote get-url origin`) {
        return {
          code: 0,
          stdout: `${state.marketplaceRemote ?? 'https://github.com/jefferysha/tenon.git'}\n`,
          stderr: '',
        }
      }
      if (text === 'git ls-remote https://github.com/jefferysha/tenon.git refs/heads/main') {
        return { code: 0, stdout: `${state.remoteHead}\trefs/heads/main\n`, stderr: '' }
      }
      return { code: 1, stdout: '', stderr: `unexpected command: ${text}` }
    },
  } as SetupEnv
}

describe('managed native-host observation', () => {
  test('native desired identity tolerates only incidental marketplace HEAD drift', () => {
    const state = {
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.0',
    }
    const env = observationEnv(state)
    const persisted = desiredNativeHostPostcondition(env, 'codex', 'marketplace-refresh')

    state.head = state.remoteHead
    const current = desiredNativeHostPostcondition(env, 'codex', 'marketplace-refresh')
    expect(current.isEquivalentDesired(persisted.serialized)).toBe(true)

    const original = JSON.parse(persisted.serialized) as Record<string, unknown>
    const marketplace = original.marketplace as Record<string, unknown>
    const changed = (value: Record<string, unknown>) => JSON.stringify(value)
    expect(current.isEquivalentDesired(changed({ ...original, head: 'c'.repeat(40) }))).toBe(false)
    expect(current.isEquivalentDesired(changed({
      ...original,
      marketplace: { ...marketplace, root: '/host/other-marketplace' },
    }))).toBe(false)
    expect(current.isEquivalentDesired(changed({
      ...original,
      marketplace: { ...marketplace, source: 'https://github.com/example/fork.git' },
    }))).toBe(false)
    expect(current.isEquivalentDesired(changed({
      ...original,
      marketplace: { ...marketplace, sourceType: 'local' },
    }))).toBe(false)
    expect(current.isEquivalentDesired(changed({
      ...original,
      marketplace: { ...marketplace, head: 'not-a-git-head' },
    }))).toBe(false)
    expect(current.isEquivalentDesired(changed({
      ...original,
      marketplace: { ...marketplace, head: 'A'.repeat(40) },
    }))).toBe(false)
    expect(current.isEquivalentDesired(changed({ ...original, unexpected: true }))).toBe(false)
    expect(current.isEquivalentDesired('{not-json')).toBe(false)
  })

  test('plugin desired identity preserves plugin root and version while tolerating marketplace HEAD drift', () => {
    const state = {
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.0',
      pluginRoot: '/plugins/tenon/1.0.0',
    }
    const env = observationEnv(state)
    const persisted = desiredNativeHostPostcondition(env, 'codex', 'plugin-install')

    state.head = state.remoteHead
    const current = desiredNativeHostPostcondition(env, 'codex', 'plugin-install')
    expect(current.isEquivalentDesired(persisted.serialized)).toBe(true)

    const original = JSON.parse(persisted.serialized) as Record<string, unknown>
    expect(current.isEquivalentDesired(JSON.stringify({
      ...original,
      pluginRoot: '/plugins/tenon/other',
    }))).toBe(false)
    expect(current.isEquivalentDesired(JSON.stringify({
      ...original,
      pluginVersion: '9.9.9',
    }))).toBe(false)
  })

  test('marketplace refresh desired state is the remote revision, not command stdout', () => {
    const state = {
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.0',
    }
    const env = observationEnv(state)
    const desired = desiredNativeHostPostcondition(env, 'codex', 'marketplace-refresh')

    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)
    state.head = state.remoteHead
    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(true)
  })

  test('plugin mutation proves the target manifest version against a fresh inventory', () => {
    const state = {
      head: 'a'.repeat(40),
      remoteHead: 'a'.repeat(40),
      pluginVersion: '1.0.0',
    }
    const env = observationEnv(state)
    const desired = desiredNativeHostPostcondition(env, 'codex', 'plugin-install')

    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)
    state.pluginVersion = '1.0.1'
    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(true)
  })

  test('marketplace desired state rejects lookalike sources and changed roots', () => {
    const state = {
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.1',
    }
    const env = observationEnv(state)
    const registerDesired = desiredNativeHostPostcondition(env, 'codex', 'marketplace-register')
    expect(registerDesired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)
    state.head = state.remoteHead
    expect(registerDesired.isDesired(observeNativeHost(env, 'codex'))).toBe(true)

    state.marketplaceSource = 'https://github.com/jefferysha/tenon-fork.git'
    expect(registerDesired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)

    state.marketplaceSource = 'https://github.com/jefferysha/tenon.git'
    const refreshDesired = desiredNativeHostPostcondition(env, 'codex', 'marketplace-refresh')
    state.head = state.remoteHead
    state.marketplaceRoot = '/host/other-tenon-marketplace'
    expect(refreshDesired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)
  })

  test('empty inventory registration rejects a local lookalike and requires the canonical remote', () => {
    const state = {
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.1',
      marketplacePresent: false,
    }
    const env = observationEnv(state)
    const desired = desiredNativeHostPostcondition(env, 'codex', 'marketplace-register')

    state.marketplacePresent = true
    state.marketplaceRoot = '/tmp/untrusted-local-tenon'
    state.marketplaceSource = 'jefferysha/tenon'
    state.marketplaceSourceType = 'local'
    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)

    state.marketplaceSourceType = 'git'
    state.marketplaceRemote = 'https://github.com/jefferysha/tenon-fork.git'
    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)

    state.marketplaceRemote = 'https://github.com/jefferysha/tenon.git'
    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)
    state.head = state.remoteHead
    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(true)
  })

  test('local refresh and plugin desired state preserve the observed source and roots', () => {
    const state = {
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.0',
      marketplaceSourceType: 'local',
      marketplaceSource: '/source/tenon',
      pluginRoot: '/plugins/tenon/1.0.0',
    }
    const env = observationEnv(state)
    const refreshDesired = desiredNativeHostPostcondition(env, 'codex', 'marketplace-refresh')
    expect(refreshDesired.isDesired(observeNativeHost(env, 'codex'))).toBe(true)
    state.marketplaceSource = '/source/other'
    expect(refreshDesired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)

    state.marketplaceSource = '/source/tenon'
    const pluginDesired = desiredNativeHostPostcondition(env, 'codex', 'plugin-install')
    state.pluginVersion = '1.0.1'
    expect(pluginDesired.isDesired(observeNativeHost(env, 'codex'))).toBe(true)
    state.pluginRoot = '/plugins/tenon/other-root'
    expect(pluginDesired.isDesired(observeNativeHost(env, 'codex'))).toBe(false)
  })

  test('local marketplace without a readable Git HEAD keeps its explicit target sentinel', () => {
    const state = {
      head: 'unavailable',
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.0',
      marketplaceSourceType: 'local',
      marketplaceSource: '/source/tenon',
      pluginRoot: '/plugins/tenon/1.0.0',
    }
    const env = observationEnv(state)
    const desired = desiredNativeHostPostcondition(env, 'codex', 'marketplace-refresh')

    expect(JSON.parse(desired.serialized)).toMatchObject({
      head: 'local-marketplace',
      marketplace: { head: null },
    })
    expect(desired.isDesired(observeNativeHost(env, 'codex'))).toBe(true)
    expect(desired.isEquivalentDesired(desired.serialized)).toBe(true)
  })

  test('malformed host inventory fails closed before any mutation can be checkpointed', () => {
    const env = {
      runCommand: () => ({ code: 0, stdout: 'not-json', stderr: '' }),
    } as unknown as SetupEnv
    expect(() => observeNativeHost(env, 'codex')).toThrow(ManagedRuntimeIndeterminateError)
  })

  test('duplicate tenon marketplace or plugin identities are indeterminate', () => {
    const env = observationEnv({
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.1',
    })
    const base = env.runCommand
    env.runCommand = (cmd, args) => {
      const result = base(cmd, args)
      if (cmd === 'codex' && args.join(' ') === 'plugin marketplace list --json') {
        const parsed = JSON.parse(result.stdout) as { marketplaces: unknown[] }
        parsed.marketplaces.push(parsed.marketplaces[0])
        return { ...result, stdout: JSON.stringify(parsed) }
      }
      return result
    }
    expect(() => observeNativeHost(env, 'codex')).toThrow(/marketplace identity.*重复/)

    const pluginEnv = observationEnv({
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.1',
    })
    const pluginBase = pluginEnv.runCommand
    pluginEnv.runCommand = (cmd, args) => {
      const result = pluginBase(cmd, args)
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        const parsed = JSON.parse(result.stdout) as { installed: unknown[] }
        parsed.installed.push(parsed.installed[0])
        return { ...result, stdout: JSON.stringify(parsed) }
      }
      return result
    }
    expect(() => observeNativeHost(pluginEnv, 'codex')).toThrow(/plugin identity.*重复/)
  })

  test('disabled tenon plugin is not accepted as authoritative desired inventory', () => {
    const env = observationEnv({
      head: 'a'.repeat(40),
      remoteHead: 'b'.repeat(40),
      pluginVersion: '1.0.1',
    })
    const base = env.runCommand
    env.runCommand = (cmd, args) => {
      const result = base(cmd, args)
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        const parsed = JSON.parse(result.stdout) as {
          installed: Array<Record<string, unknown>>
        }
        parsed.installed[0] = { ...parsed.installed[0], enabled: false }
        return { ...result, stdout: JSON.stringify(parsed) }
      }
      return result
    }
    expect(() => observeNativeHost(env, 'codex')).toThrow(/plugin identity 未启用/)
  })
})
