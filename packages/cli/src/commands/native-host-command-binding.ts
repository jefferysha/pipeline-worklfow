import { posix, win32 } from 'node:path'
import type { NativePipelineHost } from './plugin-host.js'

export interface HostCommandInvocation {
  readonly file: string
  readonly args: readonly string[]
  readonly cwd?: string
}

export interface NativeHostCommandBinding {
  /** Exact PATH object selected once for this setup/update lifecycle. */
  readonly executable: string
  /** Build a shell-free native invocation or a strictly encoded Windows batch invocation. */
  invocation(args: readonly string[]): HostCommandInvocation | undefined
}

export interface NativeHostCommandEnvironment {
  resolveHostCommand(host: NativePipelineHost): NativeHostCommandBinding | undefined
  /** Security-sensitive lifecycle tools use only absolute PATH entries and are frozen once. */
  resolveTrustedCommand?(name: TrustedLifecycleCommand): string | undefined
  codexAuthStatus(codexExecutable?: string): Promise<unknown>
  runCommand(
    cmd: string,
    args: string[],
    options?: { readonly cwd?: string; readonly timeoutMs?: number },
  ): { code: number; stdout: string; stderr: string }
  managedHostReconciliation?(
    host: NativePipelineHost,
    stepId: string,
    command: { readonly cmd: string; readonly args: readonly string[] },
  ): {
    readonly desired: string
    isEquivalentDesired?(persistedDesired: string): boolean
    observe(): string
    isDesired(observation: string): boolean
    isCompletedCompatible?(observation: string): boolean
  }
}

export type TrustedLifecycleCommand = 'bash' | 'git'

export interface FrozenTrustedLifecycleCommands {
  /** False only for legacy injected test/adapter environments without the resolver capability. */
  readonly enforced: boolean
  readonly bash?: string
  readonly git?: string
  readonly missing: readonly TrustedLifecycleCommand[]
}

export function freezeTrustedLifecycleCommands(
  env: NativeHostCommandEnvironment,
): FrozenTrustedLifecycleCommands {
  if (env.resolveTrustedCommand === undefined) return { enforced: false, missing: [] }
  const bash = env.resolveTrustedCommand('bash')
  const git = env.resolveTrustedCommand('git')
  return {
    enforced: true,
    ...(bash === undefined ? {} : { bash }),
    ...(git === undefined ? {} : { git }),
    missing: [
      ...(bash === undefined ? ['bash' as const] : []),
      ...(git === undefined ? ['git' as const] : []),
    ],
  }
}

const WINDOWS_BATCH_PATH_UNSAFE = /[%!^&|<>()"\r\n]/u
const WINDOWS_BATCH_ARG_UNSAFE = /[%!^&|<>()"\r\n\s]/u

/**
 * Convert one already-resolved host executable into a reusable process plan. npm's Windows shims
 * are batch files, so they require cmd.exe; unsafe paths/arguments are rejected instead of being
 * interpolated into a command string.
 */
export function nativeHostCommandBinding(
  executable: string,
  platform: NodeJS.Platform = process.platform,
  runtimeEnv: NodeJS.ProcessEnv = process.env,
): NativeHostCommandBinding | undefined {
  const pathApi = platform === 'win32' ? win32 : posix
  const cwd = pathApi.dirname(executable)
  const extension = pathApi.extname(executable).toLowerCase()
  if (platform !== 'win32' || (extension !== '.cmd' && extension !== '.bat')) {
    return {
      executable,
      invocation: (args) => ({ file: executable, args: [...args], cwd }),
    }
  }
  if (WINDOWS_BATCH_PATH_UNSAFE.test(executable)) return undefined
  const systemRoot = runtimeEnv.SystemRoot && win32.isAbsolute(runtimeEnv.SystemRoot)
    ? runtimeEnv.SystemRoot
    : 'C:\\Windows'
  const commandInterpreter = runtimeEnv.ComSpec && win32.isAbsolute(runtimeEnv.ComSpec)
    ? runtimeEnv.ComSpec
    : win32.join(systemRoot, 'System32', 'cmd.exe')
  return {
    executable,
    invocation: (args) => {
      if (args.some((arg) => arg === '' || WINDOWS_BATCH_ARG_UNSAFE.test(arg))) return undefined
      const command = [`"${executable}"`, ...args].join(' ')
      return {
        file: commandInterpreter,
        args: ['/d', '/s', '/c', `"${command}"`],
        cwd,
      }
    },
  }
}

/**
 * Bind every host-owned read/mutation and the Codex auth probe to one resolved executable object.
 * Nested inventory observation and conflict cleanup are covered because they use the wrapped env.
 */
export function bindNativeHostCommand<T extends NativeHostCommandEnvironment>(
  env: T,
  host: NativePipelineHost,
  binding: NativeHostCommandBinding,
  frozenTrustedCommands: FrozenTrustedLifecycleCommands = freezeTrustedLifecycleCommands(env),
): T {
  const invocation = (command: string, args: readonly string[]): HostCommandInvocation | undefined => {
    if (command === host) return binding.invocation(args)
    if ((command === 'bash' || command === 'git') && frozenTrustedCommands.enforced) {
      const file = frozenTrustedCommands[command]
      return file === undefined ? undefined : { file, args: [...args] }
    }
    return { file: command, args: [...args] }
  }
  const reconcile = env.managedHostReconciliation
  return {
    ...env,
    resolveHostCommand: (candidate) => candidate === host
      ? binding
      : env.resolveHostCommand(candidate),
    resolveTrustedCommand: frozenTrustedCommands.enforced
      ? (name) => frozenTrustedCommands[name]
      : env.resolveTrustedCommand,
    codexAuthStatus: host === 'codex'
      ? () => env.codexAuthStatus(binding.executable)
      : env.codexAuthStatus,
    runCommand: (command, args, options) => {
      const plan = invocation(command, args)
      if (plan === undefined) {
        return { code: 1, stdout: '', stderr: '宿主命令参数无法安全表示；未执行。' }
      }
      return env.runCommand(plan.file, [...plan.args], {
        ...options,
        ...(plan.cwd === undefined ? {} : { cwd: plan.cwd }),
      })
    },
    ...(reconcile === undefined
      ? {}
      : {
          managedHostReconciliation: (
            candidateHost: NativePipelineHost,
            stepId: string,
            command: { readonly cmd: string; readonly args: readonly string[] },
          ) => {
            const plan = invocation(command.cmd, command.args)
            if (plan === undefined) throw new Error('宿主命令参数无法安全表示；未执行。')
            return reconcile(candidateHost, stepId, { cmd: plan.file, args: plan.args })
          },
        }),
  }
}
