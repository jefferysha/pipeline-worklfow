import { describe, expect, test } from 'vitest'
import {
  bindNativeHostCommand,
  freezeTrustedLifecycleCommands,
  nativeHostCommandBinding,
  type NativeHostCommandEnvironment,
} from './native-host-command-binding.js'

describe('native lifecycle command binding', () => {
  test('freezes host, bash, and git to absolute executable objects before later PATH drift', () => {
    const calls: Array<readonly [string, readonly string[]]> = []
    let prefix = '/trusted/one'
    const env: NativeHostCommandEnvironment = {
      resolveHostCommand: () => nativeHostCommandBinding(`${prefix}/codex`, 'darwin', {}),
      resolveTrustedCommand: (name) => `${prefix}/${name}`,
      codexAuthStatus: async () => ({ state: 'authenticated' }),
      runCommand: (file, args) => {
        calls.push([file, args])
        return { code: 0, stdout: '', stderr: '' }
      },
    }
    const host = env.resolveHostCommand('codex')!
    const trusted = freezeTrustedLifecycleCommands(env)
    const bound = bindNativeHostCommand(env, 'codex', host, trusted)
    prefix = '/malicious/two'

    bound.runCommand('codex', ['plugin', 'list'])
    bound.runCommand('git', ['status'])
    bound.runCommand('bash', ['verify.sh'])

    expect(calls).toEqual([
      ['/trusted/one/codex', ['plugin', 'list']],
      ['/trusted/one/git', ['status']],
      ['/trusted/one/bash', ['verify.sh']],
    ])
    expect(bound.resolveTrustedCommand?.('git')).toBe('/trusted/one/git')
  })

  test('reports every missing trusted lifecycle tool without executing anything', () => {
    let executions = 0
    const env: NativeHostCommandEnvironment = {
      resolveHostCommand: () => nativeHostCommandBinding('/trusted/codex', 'darwin', {}),
      resolveTrustedCommand: () => undefined,
      codexAuthStatus: async () => ({ state: 'authenticated' }),
      runCommand: () => {
        executions += 1
        return { code: 0, stdout: '', stderr: '' }
      },
    }

    expect(freezeTrustedLifecycleCommands(env).missing).toEqual(['bash', 'git'])
    expect(executions).toBe(0)
  })
})
