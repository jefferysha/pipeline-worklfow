import { describe, expect, test } from 'vitest'
import { chmodSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  bindNativeHostCommand,
  freezeTrustedLifecycleCommands,
  nativeHostCommandBinding,
  type NativeHostCommandEnvironment,
} from './native-host-command-binding.js'
import { freezeTrustedExecutable } from './trusted-executable.js'

describe('native lifecycle command binding', () => {
  test('freezes host, bash, and git to absolute executable objects before later PATH drift', () => {
    const calls: Array<readonly [string, readonly string[]]> = []
    let prefix = '/trusted/one'
    const env: NativeHostCommandEnvironment = {
      resolveHostCommand: () => nativeHostCommandBinding(`${prefix}/codex`, 'darwin', {}),
      resolveTrustedCommand: (name) => `${prefix}/${name}`,
      resolveTrustedCommandBinding: (name) => {
        const executable = `${prefix}/${name}`
        return {
          executable,
          requestedPath: executable,
          verify: () => true,
          assert: () => {},
        }
      },
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
      resolveTrustedCommandBinding: () => undefined,
      codexAuthStatus: async () => ({ state: 'authenticated' }),
      runCommand: () => {
        executions += 1
        return { code: 0, stdout: '', stderr: '' }
      },
    }

    expect(freezeTrustedLifecycleCommands(env).missing).toEqual(['bash', 'git', 'node'])
    expect(executions).toBe(0)
  })

  test.skipIf(process.platform === 'win32')(
    'fails closed before spawn when a frozen PATH symlink or physical inode is replaced',
    () => {
    const root = join(homedir(), `.tenon-trusted-executable-${randomUUID()}`)
    const original = join(root, 'codex-original')
    const attacker = join(root, 'codex-attacker')
    const selected = join(root, 'codex')
    const calls: string[] = []
    mkdirSync(root, { recursive: true, mode: 0o700 })
    try {
      writeFileSync(original, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
      writeFileSync(attacker, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
      symlinkSync(original, selected)
      const trusted = freezeTrustedExecutable(selected)
      expect(trusted).toBeDefined()
      const binding = nativeHostCommandBinding(trusted!.executable, 'darwin', {}, trusted)
      expect(binding).toBeDefined()
      const env: NativeHostCommandEnvironment = {
        resolveHostCommand: () => binding,
        codexAuthStatus: async () => ({ state: 'authenticated' }),
        runCommand: (file) => {
          calls.push(file)
          return { code: 0, stdout: '', stderr: '' }
        },
      }
      const bound = bindNativeHostCommand(env, 'codex', binding!)

      unlinkSync(selected)
      symlinkSync(attacker, selected)
      expect(bound.runCommand('codex', ['plugin', 'list']).code).toBe(1)
      expect(calls).toEqual([])

      unlinkSync(selected)
      symlinkSync(original, selected)
      rmSync(original)
      writeFileSync(original, '#!/bin/sh\nexit 9\n', { mode: 0o755 })
      chmodSync(original, 0o755)
      expect(bound.runCommand('codex', ['plugin', 'list']).code).toBe(1)
      expect(calls).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    },
  )

  test.skipIf(process.platform === 'win32')(
    'rejects writable executables and detects a same-inode content rewrite',
    () => {
    const root = join(homedir(), `.tenon-trusted-rewrite-${randomUUID()}`)
    const executable = join(root, 'node')
    mkdirSync(root, { recursive: true, mode: 0o700 })
    try {
      writeFileSync(executable, '#!/bin/sh\nexit 0\n')
      chmodSync(executable, 0o777)
      expect(freezeTrustedExecutable(executable, 'linux')).toBeUndefined()

      chmodSync(executable, 0o755)
      const trusted = freezeTrustedExecutable(executable)
      expect(trusted).toBeDefined()
      const inode = lstatSync(executable).ino
      writeFileSync(executable, '#!/bin/sh\nprintf same-inode-rewrite\nexit 97\n')
      chmodSync(executable, 0o755)

      expect(lstatSync(executable).ino).toBe(inode)
      expect(trusted!.verify()).toBe(false)
      expect(() => trusted!.assert()).toThrow('身份已漂移')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    },
  )

  test('does not promote a pathname-only resolver into a physical trust claim', () => {
    const env: NativeHostCommandEnvironment = {
      resolveHostCommand: () => nativeHostCommandBinding('/trusted/codex', 'darwin', {}),
      resolveTrustedCommand: (name) => `/trusted/${name}`,
      codexAuthStatus: async () => ({ state: 'authenticated' }),
      runCommand: () => ({ code: 0, stdout: '', stderr: '' }),
    }
    expect(freezeTrustedLifecycleCommands(env)).toEqual({ enforced: false, missing: [] })
  })

  test('freezes and re-verifies the Windows batch interpreter together with the host shim', () => {
    let hostExact = true
    let interpreterExact = true
    const trusted = (executable: string, verify: () => boolean) => ({
      executable,
      requestedPath: executable,
      verify,
      assert: () => {
        if (!verify()) throw new Error('drift')
      },
    })
    const binding = nativeHostCommandBinding(
      'C:\\trusted\\codex.cmd',
      'win32',
      { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
      trusted('C:\\trusted\\codex.cmd', () => hostExact),
      trusted('C:\\Windows\\System32\\cmd.exe', () => interpreterExact),
    )
    expect(binding?.invocation(['plugin', 'list'])?.file)
      .toBe('C:\\Windows\\System32\\cmd.exe')
    interpreterExact = false
    expect(binding?.invocation(['plugin', 'list'])).toBeUndefined()
    interpreterExact = true
    hostExact = false
    expect(binding?.invocation(['plugin', 'list'])).toBeUndefined()
  })

  test('tracks complete parent path identity and uses platform ownership semantics', () => {
    const root = join(homedir(), `.tenon-trusted-parent-${randomUUID()}`)
    const bin = join(root, 'bin')
    const executable = join(bin, 'node')
    mkdirSync(bin, { recursive: true, mode: 0o700 })
    try {
      writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o777 })
      chmodSync(executable, 0o777)
      expect(freezeTrustedExecutable(executable)).toBeUndefined()
      const windowsIdentity = freezeTrustedExecutable(executable, 'win32')
      expect(windowsIdentity).toBeDefined()
      chmodSync(bin, 0o711)
      expect(windowsIdentity?.verify()).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test.runIf(process.platform === 'win32')(
    'binds a real Windows batch shim and the physical ComSpec executable',
    () => {
      const commandInterpreter = process.env.ComSpec
      expect(commandInterpreter).toBeTruthy()
      const root = join(homedir(), `.tenon-windows-trust-${randomUUID()}`)
      const shim = join(root, 'codex.cmd')
      mkdirSync(root, { recursive: true })
      try {
        writeFileSync(shim, '@echo off\r\nexit /b 0\r\n')
        const trustedShim = freezeTrustedExecutable(shim, 'win32')
        const trustedInterpreter = freezeTrustedExecutable(commandInterpreter!, 'win32')
        expect(trustedShim).toBeDefined()
        expect(trustedInterpreter).toBeDefined()
        const binding = nativeHostCommandBinding(
          trustedShim!.executable,
          'win32',
          { ComSpec: commandInterpreter },
          trustedShim,
          trustedInterpreter,
        )
        expect(binding?.invocation(['plugin', 'list'])?.file)
          .toBe(trustedInterpreter?.executable)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
