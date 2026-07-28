import { spawn, type ChildProcess } from 'node:child_process'
import { posix, win32 } from 'node:path'
import { CODEX_AUTH_GUIDANCE } from '@tenon/kernel'
import {
  resolveCommandOnPath,
  type CommandExistsOptions,
} from './commands/commandExists.js'

export type CodexAuthUnavailableReason =
  | 'cli-missing'
  | 'timeout'
  | 'signal'
  | 'spawn-error'
  | 'status-error'

export type CodexAuthStatus =
  | { readonly state: 'authenticated' }
  | { readonly state: 'unauthenticated' }
  | { readonly state: 'unavailable'; readonly reason: CodexAuthUnavailableReason }

export type CodexAuthExecResult =
  | {
      readonly kind: 'exit'
      readonly code: number
      readonly unauthenticatedSignal?: true
      readonly stdout?: string
      readonly stderr?: string
    }
  | {
      readonly kind: 'unavailable'
      readonly reason: CodexAuthUnavailableReason
      readonly stdout?: string
      readonly stderr?: string
    }

export type CodexAuthExec = () => Promise<CodexAuthExecResult>

const CODEX_STATUS_SENTINEL_MAX_BYTES = 4_096
const CODEX_NOT_LOGGED_IN_SENTINEL = 'Not logged in'

export interface CodexStatusSpawnSpec {
  readonly file: string
  readonly args: readonly string[]
  readonly cwd?: string
}

export type CodexStatusSpawnPlan =
  | {
      readonly unavailableReason: 'cli-missing'
    }
  | {
      readonly status: CodexStatusSpawnSpec
    }

export type CodexPathResolver = (
  name: string,
  options: CommandExistsOptions,
) => string | undefined

/**
 * npm exposes command shims as `.cmd` files on Windows. Resolve the exact PATH object in-process,
 * then run that absolute shim from its own directory so neither cmd.exe nor the shim can fall back
 * to an attacker-controlled checkout working directory.
 */
export function codexStatusSpawnPlan(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  resolveCommand: CodexPathResolver = resolveCommandOnPath,
): CodexStatusSpawnPlan {
  if (platform === 'win32') {
    const codexPath = resolveCommand('codex', {
      pathValue: env.PATH ?? '',
      pathExt: env.PATHEXT,
      platform,
      requireAbsolutePathEntries: true,
    })
    if (codexPath === undefined) {
      return { unavailableReason: 'cli-missing' }
    }
    const cwd = win32.dirname(codexPath)
    const extension = win32.extname(codexPath).toLowerCase()
    if (extension !== '.cmd' && extension !== '.bat') {
      return {
        status: {
          file: codexPath,
          args: ['login', 'status'],
          cwd,
        },
      }
    }
    // cmd.exe expands these characters even inside otherwise quoted batch command strings. A
    // missing result is safer than executing a different object from an unusual but legal path.
    if (/[%!^&|<>()"\r\n]/u.test(codexPath)) {
      return { unavailableReason: 'cli-missing' }
    }
    const systemRoot = env.SystemRoot && win32.isAbsolute(env.SystemRoot)
      ? env.SystemRoot
      : 'C:\\Windows'
    const commandInterpreter = env.ComSpec && win32.isAbsolute(env.ComSpec)
      ? env.ComSpec
      : win32.join(systemRoot, 'System32', 'cmd.exe')
    return {
      status: {
        file: commandInterpreter,
        args: ['/d', '/s', '/c', `""${codexPath}" login status"`],
        cwd,
      },
    }
  }
  const codexPath = resolveCommand('codex', {
    pathValue: env.PATH ?? '',
    platform,
    requireAbsolutePathEntries: true,
  })
  if (codexPath === undefined) return { unavailableReason: 'cli-missing' }
  return {
    status: {
      file: codexPath,
      args: ['login', 'status'],
      cwd: posix.dirname(codexPath),
    },
  }
}

export function classifyCodexAuthResult(result: CodexAuthExecResult): CodexAuthStatus {
  if (result.kind === 'unavailable') return { state: 'unavailable', reason: result.reason }
  if (result.code === 0) return { state: 'authenticated' }
  if (result.code === 1 && result.unauthenticatedSignal === true) {
    return { state: 'unauthenticated' }
  }
  return { state: 'unavailable', reason: 'status-error' }
}

/**
 * The returned value deliberately excludes host stdout/stderr. Codex owns those strings and may
 * change or localize them; Tenon needs only availability plus the documented exit contract.
 */
export async function probeCodexAuth(exec: CodexAuthExec = REAL_CODEX_AUTH_EXEC): Promise<CodexAuthStatus> {
  try {
    return classifyCodexAuthResult(await exec())
  } catch {
    return { state: 'unavailable', reason: 'spawn-error' }
  }
}

export interface CodexAuthRunnerOptions {
  readonly platform?: NodeJS.Platform
  readonly env?: NodeJS.ProcessEnv
  readonly plan?: CodexStatusSpawnPlan
  readonly timeoutMs?: number
  readonly terminationGraceMs?: number
  readonly spawnProcess?: typeof spawn
  readonly processKill?: typeof process.kill
}

export function createCodexAuthExec(options: CodexAuthRunnerOptions = {}): CodexAuthExec {
  return () => new Promise((resolve) => {
    const platform = options.platform ?? process.platform
    const env = options.env ?? process.env
    const plan = options.plan ?? codexStatusSpawnPlan(platform, env)
    if ('unavailableReason' in plan) {
      resolve({ kind: 'unavailable', reason: plan.unavailableReason })
      return
    }
    const spawnProcess = options.spawnProcess ?? spawn
    const processKill = options.processKill ?? process.kill
    const detached = platform !== 'win32'
    let settled = false
    let timedOut = false
    let child: ChildProcess | undefined
    let childDetached = false
    let discardCapturedOutput = (): void => {}
    let terminationKiller: ChildProcess | undefined
    let terminationProofTimer: ReturnType<typeof setTimeout> | undefined
    let terminationFinalTimer: ReturnType<typeof setTimeout> | undefined

    const directKill = (target: ChildProcess): void => {
      try {
        target.kill('SIGKILL')
      } catch {
        // The close event or bounded final timer settles the unavailable result.
      }
    }

    const finish = (result: CodexAuthExecResult): void => {
      if (settled) return
      settled = true
      discardCapturedOutput()
      clearTimeout(timeoutTimer)
      if (terminationProofTimer !== undefined) clearTimeout(terminationProofTimer)
      if (terminationFinalTimer !== undefined) clearTimeout(terminationFinalTimer)
      if (terminationKiller !== undefined) {
        const killer = terminationKiller
        terminationKiller = undefined
        directKill(killer)
      }
      resolve(result)
    }

    const terminateCurrentProcessTree = (): void => {
      const target = child
      if (target === undefined) return
      const pid = target.pid
      if (platform === 'win32' && pid !== undefined && Number.isSafeInteger(pid) && pid > 0) {
        try {
          const systemRoot = env.SystemRoot && win32.isAbsolute(env.SystemRoot)
            ? env.SystemRoot
            : 'C:\\Windows'
          const systemDirectory = win32.join(systemRoot, 'System32')
          const killer = spawnProcess(win32.join(systemDirectory, 'taskkill.exe'), ['/pid', String(pid), '/t', '/f'], {
            cwd: systemDirectory,
            stdio: ['ignore', 'ignore', 'ignore'],
            windowsHide: true,
          })
          terminationKiller = killer
          let fellBack = false
          const fallback = (): void => {
            if (fellBack) return
            fellBack = true
            directKill(target)
          }
          const releaseKiller = (): void => {
            if (terminationKiller === killer) terminationKiller = undefined
          }
          killer.once('error', () => {
            releaseKiller()
            fallback()
          })
          killer.once('close', (code) => {
            releaseKiller()
            if (code !== 0) fallback()
          })
          return
        } catch {
          // Fall through to direct termination when taskkill itself cannot be started.
        }
      }
      if (childDetached && pid !== undefined && Number.isSafeInteger(pid) && pid > 0) {
        try {
          processKill(-pid, 'SIGKILL')
          return
        } catch {
          // The child may have closed between the timeout and signal; direct kill is the safe fallback.
        }
      }
      directKill(target)
    }

    const onTimeout = (): void => {
      if (settled) return
      timedOut = true
      discardCapturedOutput()
      terminateCurrentProcessTree()
      // Sending a signal is not exit proof. Prefer the child's close event, but remain bounded if an
      // OS wrapper fails to report it.
      const graceMs = options.terminationGraceMs ?? 1_000
      terminationProofTimer = setTimeout(() => {
        if (settled) return
        if (terminationKiller !== undefined) {
          const killer = terminationKiller
          terminationKiller = undefined
          directKill(killer)
        }
        if (child !== undefined) directKill(child)
        terminationFinalTimer = setTimeout(
          () => finish({ kind: 'unavailable', reason: 'timeout' }),
          graceMs,
        )
      }, graceMs)
    }
    const timeoutTimer = setTimeout(onTimeout, options.timeoutMs ?? 5_000)

    const startStatus = (): void => {
      if (settled || timedOut) return
      let statusChild: ChildProcess
      try {
        statusChild = spawnProcess(plan.status.file, [...plan.status.args], {
          cwd: plan.status.cwd,
          env,
          detached,
          shell: false,
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
        })
      } catch {
        finish({ kind: 'unavailable', reason: 'spawn-error' })
        return
      }
      child = statusChild
      childDetached = detached
      let statusStderr = ''
      let statusStderrBytes = 0
      let statusStderrOverflow = false
      discardCapturedOutput = () => {
        statusStderr = ''
      }
      statusChild.stderr?.on('data', (chunk: Buffer | string) => {
        if (settled || timedOut || statusStderrOverflow) return
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        if (statusStderrBytes + bytes.length > CODEX_STATUS_SENTINEL_MAX_BYTES) {
          statusStderrOverflow = true
          statusStderr = ''
          return
        }
        statusStderrBytes += bytes.length
        statusStderr += bytes.toString('utf8')
      })
      statusChild.once('error', (error: NodeJS.ErrnoException) => {
        if (timedOut) return
        finish({
          kind: 'unavailable',
          reason: error.code === 'ENOENT' ? 'cli-missing' : 'spawn-error',
        })
      })
      statusChild.once('close', (code, signal) => {
        if (timedOut) {
          finish({ kind: 'unavailable', reason: 'timeout' })
          return
        }
        if (signal !== null) {
          finish({ kind: 'unavailable', reason: 'signal' })
          return
        }
        if (typeof code !== 'number') {
          finish({ kind: 'unavailable', reason: 'spawn-error' })
          return
        }
        const unauthenticatedSignal = code === 1
          && !statusStderrOverflow
          && statusStderr.trim() === CODEX_NOT_LOGGED_IN_SENTINEL
        // The captured host output is never part of a returned value. Drop the last reference as
        // soon as the fixed sentinel comparison is complete instead of waiting for later GC.
        discardCapturedOutput()
        if (statusStderrOverflow) {
          finish({ kind: 'unavailable', reason: 'status-error' })
          return
        }
        finish(unauthenticatedSignal
          ? { kind: 'exit', code, unauthenticatedSignal: true }
          : { kind: 'exit', code })
      })
    }

    startStatus()
  })
}

export const REAL_CODEX_AUTH_EXEC: CodexAuthExec = createCodexAuthExec()

export function renderCodexAuthLines(
  status: CodexAuthStatus,
): readonly string[] {
  if (status.state === 'authenticated') {
    return [
      '[Codex 认证] 已登录；ChatGPT 订阅登录或 API Key 登录均受支持。',
      `  ${CODEX_AUTH_GUIDANCE.verify}`,
    ]
  }
  return [
    `[Codex 认证] ${status.state === 'unauthenticated' ? '尚未登录' : '暂时无法确认登录状态'}。`,
    ...(status.state === 'unavailable' ? [`  ${CODEX_AUTH_GUIDANCE.cli}`] : []),
    `  ${CODEX_AUTH_GUIDANCE.chatgpt}`,
    `  ${CODEX_AUTH_GUIDANCE.device}`,
    `  ${CODEX_AUTH_GUIDANCE.apiKey}`,
    `  ${CODEX_AUTH_GUIDANCE.verify}`,
    '  Tenon 只检查状态，不会自动登录、读取 auth.json 或记录任何凭证。',
  ]
}

export function renderDeferredCodexAuthLine(context: string): string {
  return `[Codex 认证] ${context}；运行 \`codex login status\` 检查，或运行 \`tenon doctor\` 查看完整登录引导。`
}

export interface CodexAuthOutput {
  out(line: string): void
}

export function printCodexAuthGuidance(
  io: CodexAuthOutput,
  status: CodexAuthStatus,
): void {
  for (const line of renderCodexAuthLines(status)) io.out(line)
}
