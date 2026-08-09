import { posix, win32 } from 'node:path'
import type { NativePipelineHost } from './plugin-host.js'
import type { TrustedExecutable } from './trusted-executable.js'

export interface HostCommandInvocation {
  readonly file: string
  readonly args: readonly string[]
  readonly cwd?: string
}

export interface NativeHostCommandBinding {
  /** Exact PATH object selected once for this setup/update lifecycle. */
  readonly executable: string
  /** Re-prove the frozen physical file immediately before every spawn. */
  readonly verify: () => boolean
  /** Build a shell-free native invocation or a strictly encoded Windows batch invocation. */
  invocation(args: readonly string[]): HostCommandInvocation | undefined
}

export interface NativeHostCommandEnvironment {
  resolveHostCommand(host: NativePipelineHost): NativeHostCommandBinding | undefined
  /** Security-sensitive lifecycle tools use only absolute PATH entries and are frozen once. */
  resolveTrustedCommand?(name: TrustedLifecycleCommand): string | undefined
  /** Production-only physical identity seam; legacy injected tests may omit it. */
  resolveTrustedCommandBinding?(name: TrustedLifecycleCommand): TrustedExecutable | undefined
  codexAuthStatus(
    codexExecutable?: string,
    commandBinding?: NativeHostCommandBinding,
  ): Promise<unknown>
  runCommand(
    cmd: string,
    args: string[],
    options?: { readonly cwd?: string; readonly timeoutMs?: number },
  ): { code: number; stdout: string; stderr: string }
  /** Cross-process lease shared with the public installer for every host-owned mutation step. */
  withHostMutationLock?<T>(host: NativePipelineHost, operation: () => Promise<T>): Promise<T>
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

export type TrustedLifecycleCommand = 'bash' | 'git' | 'node'

export interface FrozenTrustedLifecycleCommands {
  /** False only for legacy injected test/adapter environments without the resolver capability. */
  readonly enforced: boolean
  readonly bash?: string
  readonly git?: string
  readonly node?: string
  readonly bashBinding?: TrustedExecutable
  readonly gitBinding?: TrustedExecutable
  readonly nodeBinding?: TrustedExecutable
  readonly missing: readonly TrustedLifecycleCommand[]
}

export function freezeTrustedLifecycleCommands(
  env: NativeHostCommandEnvironment,
): FrozenTrustedLifecycleCommands {
  // Production exposes the physical resolver. Legacy injected adapters that only know how to
  // return a pathname are deliberately not upgraded into a false trust claim.
  if (env.resolveTrustedCommandBinding === undefined) return { enforced: false, missing: [] }
  const bashBinding = env.resolveTrustedCommandBinding?.('bash')
  const gitBinding = env.resolveTrustedCommandBinding?.('git')
  const nodeBinding = env.resolveTrustedCommandBinding?.('node')
  const bash = bashBinding?.executable
  const git = gitBinding?.executable
  const node = nodeBinding?.executable
  return {
    enforced: true,
    ...(bash === undefined ? {} : { bash }),
    ...(git === undefined ? {} : { git }),
    ...(node === undefined ? {} : { node }),
    ...(bashBinding === undefined ? {} : { bashBinding }),
    ...(gitBinding === undefined ? {} : { gitBinding }),
    ...(nodeBinding === undefined ? {} : { nodeBinding }),
    missing: [
      ...(bash === undefined ? ['bash' as const] : []),
      ...(git === undefined ? ['git' as const] : []),
      ...(node === undefined ? ['node' as const] : []),
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
  trustedExecutable?: TrustedExecutable,
  trustedCommandInterpreter?: TrustedExecutable,
): NativeHostCommandBinding | undefined {
  const pathApi = platform === 'win32' ? win32 : posix
  const boundExecutable = trustedExecutable?.executable ?? executable
  const cwd = pathApi.dirname(boundExecutable)
  const extension = pathApi.extname(boundExecutable).toLowerCase()
  if (platform !== 'win32' || (extension !== '.cmd' && extension !== '.bat')) {
    return {
      executable: boundExecutable,
      verify: trustedExecutable?.verify ?? (() => true),
      invocation: (args) => (trustedExecutable?.verify() ?? true)
        ? { file: boundExecutable, args: [...args], cwd }
        : undefined,
    }
  }
  if (WINDOWS_BATCH_PATH_UNSAFE.test(boundExecutable)) return undefined
  const systemRoot = runtimeEnv.SystemRoot && win32.isAbsolute(runtimeEnv.SystemRoot)
    ? runtimeEnv.SystemRoot
    : 'C:\\Windows'
  const commandInterpreter = runtimeEnv.ComSpec && win32.isAbsolute(runtimeEnv.ComSpec)
    ? runtimeEnv.ComSpec
    : win32.join(systemRoot, 'System32', 'cmd.exe')
  if (trustedExecutable !== undefined
    && (trustedCommandInterpreter === undefined
      || trustedCommandInterpreter.requestedPath !== commandInterpreter)) return undefined
  const boundCommandInterpreter = trustedCommandInterpreter?.executable ?? commandInterpreter
  return {
    executable: boundExecutable,
    verify: trustedExecutable?.verify ?? (() => true),
    invocation: (args) => {
      if (!(trustedExecutable?.verify() ?? true)
        || !(trustedCommandInterpreter?.verify() ?? true)) return undefined
      if (args.some((arg) => arg === '' || WINDOWS_BATCH_ARG_UNSAFE.test(arg))) return undefined
      const command = [`"${boundExecutable}"`, ...args].join(' ')
      return {
        file: boundCommandInterpreter,
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
    if ((command === 'bash' || command === 'git' || command === 'node') && frozenTrustedCommands.enforced) {
      const file = frozenTrustedCommands[command]
      const physical = command === 'bash'
        ? frozenTrustedCommands.bashBinding
        : command === 'git'
          ? frozenTrustedCommands.gitBinding
          : frozenTrustedCommands.nodeBinding
      return file === undefined || (physical !== undefined && !physical.verify())
        ? undefined
        : { file, args: [...args] }
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
    resolveTrustedCommandBinding: frozenTrustedCommands.enforced
      ? (name) => name === 'bash'
        ? frozenTrustedCommands.bashBinding
        : name === 'git'
          ? frozenTrustedCommands.gitBinding
          : frozenTrustedCommands.nodeBinding
      : env.resolveTrustedCommandBinding,
    codexAuthStatus: host === 'codex'
      ? () => binding.verify()
        ? env.codexAuthStatus(binding.executable, binding)
        : Promise.reject(new Error(`可信宿主可执行文件身份已漂移: ${binding.executable}`))
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
