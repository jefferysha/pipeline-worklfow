import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, test } from 'vitest'
import { vi } from 'vitest'
import {
  classifyCodexAuthResult,
  codexStatusSpawnPlan,
  createCodexAuthExec,
  probeCodexAuth,
  renderDeferredCodexAuthLine,
  renderCodexAuthLines,
  type CodexAuthExec,
} from './codexAuth.js'

describe('Codex host authentication contract', () => {
  test('exit 0 is authenticated; exit 1 requires the exact unauthenticated signal; other exits are unavailable', () => {
    expect(classifyCodexAuthResult({ kind: 'exit', code: 0 })).toEqual({ state: 'authenticated' })
    expect(classifyCodexAuthResult({
      kind: 'exit',
      code: 1,
      unauthenticatedSignal: true,
    })).toEqual({ state: 'unauthenticated' })
    expect(classifyCodexAuthResult({ kind: 'exit', code: 1 })).toEqual({
      state: 'unavailable',
      reason: 'status-error',
    })
    expect(classifyCodexAuthResult({ kind: 'exit', code: 2 })).toEqual({
      state: 'unavailable',
      reason: 'status-error',
    })
  })

  test.each([
    ['Not logged in\n', { state: 'unauthenticated' }],
    ['Error checking login status: malformed auth store\n', {
      state: 'unavailable',
      reason: 'status-error',
    }],
    ['warning\nNot logged in\n', {
      state: 'unavailable',
      reason: 'status-error',
    }],
    [`${'x'.repeat(4_097)}Not logged in\n`, {
      state: 'unavailable',
      reason: 'status-error',
    }],
  ] as const)('runner classifies exit 1 stderr conservatively: %s', async (stderr, expected) => {
    const exec = createCodexAuthExec({
      plan: {
        status: {
          file: process.execPath,
          args: ['-e', `process.stderr.write(${JSON.stringify(stderr)});process.exit(1)`],
        },
      },
    })
    await expect(probeCodexAuth(exec)).resolves.toEqual(expected)
  })

  test('stderr above the sentinel bound is unavailable even when the command exits 0', async () => {
    const exec = createCodexAuthExec({
      plan: {
        status: {
          file: process.execPath,
          args: ['-e', `process.stderr.write(${JSON.stringify('x'.repeat(4_097))});process.exit(0)`],
        },
      },
    })
    await expect(probeCodexAuth(exec)).resolves.toEqual({
      state: 'unavailable',
      reason: 'status-error',
    })
  })

  test.each([
    'cli-missing',
    'timeout',
    'signal',
    'spawn-error',
  ] as const)('runner failure %s is unavailable without host output', async (reason) => {
    const exec: CodexAuthExec = async () => ({
      kind: 'unavailable',
      reason,
      stdout: 'OPENAI_API_KEY=sk-must-not-leak',
      stderr: 'token secret-must-not-leak',
    })
    const status = await probeCodexAuth(exec)
    expect(status).toEqual({ state: 'unavailable', reason })
    expect(JSON.stringify(status)).not.toContain('must-not-leak')
  })

  test('unexpected runner throws converge to unavailable without exposing the exception', async () => {
    const status = await probeCodexAuth(async () => {
      throw new Error('sk-exception-must-not-leak')
    })
    expect(status).toEqual({ state: 'unavailable', reason: 'spawn-error' })
    expect(JSON.stringify(status)).not.toContain('must-not-leak')
  })

  test('unauthenticated full guidance covers ChatGPT, headless, API-key stdin login, billing and verification', () => {
    const text = renderCodexAuthLines({ state: 'unauthenticated' }).join('\n')
    expect(text).toContain('ChatGPT')
    expect(text).toContain('如果你的方案包含 Codex')
    expect(text).toContain('codex login')
    expect(text).toContain('codex login --device-auth')
    expect(text).toContain('https://platform.openai.com/api-keys')
    expect(text).toContain('printenv OPENAI_API_KEY | codex login --with-api-key')
    expect(text).toContain('按用量计费')
    expect(text).toContain('codex login status')
  })

  test('authenticated output is concise and does not require OPENAI_API_KEY', () => {
    const text = renderCodexAuthLines({ state: 'authenticated' }).join('\n')
    expect(text).toContain('已登录')
    expect(text).toContain('codex login status')
    expect(text).not.toContain('OPENAI_API_KEY')
    expect(text).not.toContain('api-keys')
  })

  test('unavailable output adds CLI install/update recovery and never embeds a runtime reason payload', () => {
    const text = renderCodexAuthLines({
      state: 'unavailable',
      reason: 'cli-missing',
    }).join('\n')
    expect(text).toContain('npm install -g @openai/codex')
    expect(text).toContain('codex --version')
    expect(text).toContain('codex login status')
    expect(text).not.toContain('cli-missing')
  })

  test('deferred noninteractive paths reuse one pure short renderer without a login tutorial', () => {
    const text = renderDeferredCodexAuthLine('后台更新未检查登录状态')
    expect(text).toContain('codex login status')
    expect(text).toContain('tenon doctor')
    expect(text).not.toContain('platform.openai.com')
  })

  test('Windows binds status execution to one PATH-only absolute shim and a trusted working directory', () => {
    expect(codexStatusSpawnPlan(
      'win32',
      { ComSpec: 'C:\\Windows\\System32\\cmd.exe', PATH: 'C:\\trusted-bin' },
      () => 'C:\\trusted-bin\\codex.cmd',
    )).toEqual({
      status: {
        file: 'C:\\Windows\\System32\\cmd.exe',
        args: ['/d', '/s', '/c', '""C:\\trusted-bin\\codex.cmd" login status"'],
        cwd: 'C:\\trusted-bin',
      },
    })
  })

  test('Windows rejects batch paths with command-expansion characters', () => {
    expect(codexStatusSpawnPlan(
      'win32',
      { ComSpec: 'C:\\Windows\\System32\\cmd.exe', PATH: 'C:\\trusted-bin' },
      () => 'C:\\trusted-bin\\%TEMP%\\codex.cmd',
    )).toEqual({ unavailableReason: 'cli-missing' })
  })

  test('a missing PATH does not inherit the parent process search path', () => {
    expect(codexStatusSpawnPlan('darwin', {})).toEqual({ unavailableReason: 'cli-missing' })
    expect(codexStatusSpawnPlan('win32', {})).toEqual({ unavailableReason: 'cli-missing' })
  })

  test('POSIX skips empty and relative PATH entries and binds status to the trusted absolute executable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tenon-codex-auth-path-'))
    const trustedBin = join(root, 'trusted-bin')
    mkdirSync(trustedBin)
    writeFileSync(join(root, 'codex'), '#!/bin/sh\nexit 97\n')
    writeFileSync(join(trustedBin, 'codex'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(root, 'codex'), 0o755)
    chmodSync(join(trustedBin, 'codex'), 0o755)
    try {
      const plan = codexStatusSpawnPlan('darwin', {
        PATH: `:relative-bin:${trustedBin}`,
      })
      expect(plan).toEqual({
        status: {
          file: join(trustedBin, 'codex'),
          args: ['login', 'status'],
          cwd: trustedBin,
        },
      })
      const target = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter
        pid: number
      }
      target.stderr = new EventEmitter()
      target.pid = 123
      const spawnProcess = vi.fn(() => target) as unknown as typeof import('node:child_process').spawn
      const pending = probeCodexAuth(createCodexAuthExec({
        platform: 'darwin',
        plan,
        spawnProcess,
      }))
      target.emit('close', 0, null)
      await expect(pending).resolves.toEqual({ state: 'authenticated' })
      expect(spawnProcess).toHaveBeenCalledWith(
        join(trustedBin, 'codex'),
        ['login', 'status'],
        expect.objectContaining({
          cwd: trustedBin,
          shell: false,
        }),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('Windows never searches an attacker-controlled cwd for the Codex shim', async () => {
    const target = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter
      pid: number
    }
    target.stderr = new EventEmitter()
    target.pid = 123
    const spawnProcess = vi.fn(() => target) as unknown as typeof import('node:child_process').spawn
    const plan = codexStatusSpawnPlan(
      'win32',
      {
        ComSpec: 'C:\\Windows\\System32\\cmd.exe',
        PATH: 'C:\\trusted-bin',
      },
      () => 'C:\\trusted-bin\\codex.cmd',
    )
    const pending = probeCodexAuth(createCodexAuthExec({
      platform: 'win32',
      plan,
      spawnProcess,
    }))
    target.emit('close', 0, null)
    await expect(pending).resolves.toEqual({ state: 'authenticated' })
    expect(spawnProcess).toHaveBeenCalledTimes(1)
    expect(spawnProcess).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', '""C:\\trusted-bin\\codex.cmd" login status"'],
      expect.objectContaining({
        cwd: 'C:\\trusted-bin',
        shell: false,
      }),
    )
  })

  test('POSIX timeout kills the owned process group and waits long enough to prevent a descendant write', {
    skip: process.platform === 'win32',
  }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'tenon-codex-auth-timeout-'))
    const descendantWrite = join(root, 'descendant-survived')
    const descendantScript = [
      "const {writeFileSync}=require('node:fs')",
      `setTimeout(()=>writeFileSync(${JSON.stringify(descendantWrite)},'alive'),700)`,
      'setInterval(()=>{},1000)',
    ].join(';')
    const parentScript = [
      "const {spawn}=require('node:child_process')",
      `spawn(process.execPath,['-e',${JSON.stringify(descendantScript)}],{stdio:'ignore'})`,
      'setInterval(()=>{},1000)',
    ].join(';')
    try {
      const exec = createCodexAuthExec({
        plan: { status: { file: process.execPath, args: ['-e', parentScript] } },
        timeoutMs: 150,
        terminationGraceMs: 1_000,
      })
      await expect(probeCodexAuth(exec)).resolves.toEqual({ state: 'unavailable', reason: 'timeout' })
      await delay(900)
      expect(existsSync(descendantWrite)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('Windows taskkill nonzero falls back to direct kill and resolves only after target close', async () => {
    const target = new EventEmitter() as EventEmitter & {
      pid: number
      kill: ReturnType<typeof vi.fn>
    }
    target.pid = 123
    target.kill = vi.fn(() => true)
    const killer = new EventEmitter()
    const spawnProcess = vi.fn((file: string) =>
      file.endsWith('\\taskkill.exe') ? killer : target) as unknown as typeof import('node:child_process').spawn
    const exec = createCodexAuthExec({
      platform: 'win32',
      plan: { status: { file: 'cmd.exe', args: ['/d', '/s', '/c', 'codex login status'] } },
      spawnProcess,
      timeoutMs: 10,
      terminationGraceMs: 100,
    })

    const pending = probeCodexAuth(exec)
    await delay(30)
    killer.emit('close', 5, null)
    expect(target.kill).toHaveBeenCalledWith('SIGKILL')
    let resolved = false
    void pending.then(() => { resolved = true })
    await delay(10)
    expect(resolved).toBe(false)
    target.emit('close', null, 'SIGKILL')
    await expect(pending).resolves.toEqual({ state: 'unavailable', reason: 'timeout' })
  })

  test('Windows timeout kills a taskkill process that never closes before bounded fallback', async () => {
    const target = new EventEmitter() as EventEmitter & {
      pid: number
      kill: ReturnType<typeof vi.fn>
    }
    target.pid = 123
    target.kill = vi.fn(() => true)
    const killer = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>
    }
    killer.kill = vi.fn(() => true)
    const spawnProcess = vi.fn((file: string) =>
      file.endsWith('\\taskkill.exe') ? killer : target) as unknown as typeof import('node:child_process').spawn
    const exec = createCodexAuthExec({
      platform: 'win32',
      plan: { status: { file: 'cmd.exe', args: ['/d', '/s', '/c', 'codex login status'] } },
      spawnProcess,
      timeoutMs: 10,
      terminationGraceMs: 50,
    })

    let resolved = false
    const pending = probeCodexAuth(exec)
    void pending.then(() => { resolved = true })
    await delay(75)
    expect(killer.kill).toHaveBeenCalledWith('SIGKILL')
    expect(target.kill).toHaveBeenCalledWith('SIGKILL')
    expect(resolved).toBe(false)
    target.emit('close', null, 'SIGKILL')
    await expect(pending).resolves.toEqual({ state: 'unavailable', reason: 'timeout' })
  })

  test('timeout kill error does not bypass the bounded close-proof grace periods', async () => {
    const target = new EventEmitter() as EventEmitter & {
      pid: number
      kill: ReturnType<typeof vi.fn>
    }
    target.pid = 123
    target.kill = vi.fn(() => false)
    const killer = new EventEmitter()
    const spawnProcess = vi.fn((file: string) =>
      file.endsWith('\\taskkill.exe') ? killer : target) as unknown as typeof import('node:child_process').spawn
    const exec = createCodexAuthExec({
      platform: 'win32',
      plan: { status: { file: 'cmd.exe', args: ['/d', '/s', '/c', 'codex login status'] } },
      spawnProcess,
      timeoutMs: 10,
      terminationGraceMs: 50,
    })

    let resolved = false
    const pending = probeCodexAuth(exec)
    void pending.then(() => { resolved = true })
    await delay(20)
    killer.emit('close', 5, null)
    target.emit('error', Object.assign(new Error('kill EPERM'), { code: 'EPERM' }))
    await delay(20)
    expect(resolved).toBe(false)
    await expect(pending).resolves.toEqual({ state: 'unavailable', reason: 'timeout' })
    expect(target.kill).toHaveBeenCalled()
  })
})
