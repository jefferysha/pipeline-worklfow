import type { ManagedHostPreparationContext } from './release-coordinator.js'
import type { HostCommandPlanItem } from './plugin-host.js'
import type { SetupEnv } from './setupEnvironment.js'
import { ManagedRuntimeIndeterminateError } from '../runtime/installer.js'
import {
  desiredNativeHostPostcondition,
  observeNativeHost,
} from './managed-host-observation.js'
import type { NativePipelineHost } from './plugin-host.js'

export interface ManagedHostCommandResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

function decodeResult(raw: string, stepId: string): ManagedHostCommandResult {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error(`host step '${stepId}' 的持久化命令结果不是 JSON`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`host step '${stepId}' 的持久化命令结果不是对象`)
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'code,stderr,stdout'
    || !Number.isSafeInteger(record.code)
    || typeof record.stdout !== 'string'
    || typeof record.stderr !== 'string') {
    throw new Error(`host step '${stepId}' 的持久化命令结果结构非法`)
  }
  return {
    code: record.code as number,
    stdout: record.stdout,
    stderr: record.stderr,
  }
}

/**
 * Host CLIs remain the only writers of their marketplace/cache. Each retry-safe command is wrapped
 * by the managed WAL and its complete result is persisted, so recovery resumes at the next logical
 * command instead of replaying the entire host mutation sequence.
 */
export async function runManagedHostCommand(
  transaction: ManagedHostPreparationContext,
  stepId: string,
  env: SetupEnv,
  command: HostCommandPlanItem,
): Promise<ManagedHostCommandResult> {
  if (stepId.startsWith('inventory-')) {
    return env.runCommand(command.cmd, [...command.args])
  }
  if (command.cmd !== 'codex' && command.cmd !== 'claude') {
    throw new ManagedRuntimeIndeterminateError(`host step '${stepId}' 缺少可观察的原生宿主`)
  }
  const host = command.cmd as NativePipelineHost
  const injected = env.managedHostReconciliation?.(host, stepId, command)
  const desired = injected === undefined
    ? desiredNativeHostPostcondition(env, host, stepId)
    : {
        serialized: injected.desired,
        isDesired: injected.isDesired,
        isEquivalentDesired: injected.isEquivalentDesired,
      }
  const raw = await transaction.runStep(stepId, {
    desired: desired.serialized,
    isEquivalentDesired: desired.isEquivalentDesired,
    observe: injected?.observe ?? (() => observeNativeHost(env, host)),
    isDesired: desired.isDesired,
    execute: () => JSON.stringify(env.runCommand(command.cmd, [...command.args])),
  })
  // The fresh host observation is the commit fact. A host CLI may report non-zero after reaching
  // the desired state (for example an idempotent "already installed" diagnostic); retaining that
  // raw result in the WAL is useful for audit, but it must not permanently fail first-run or
  // completed-recovery control flow after the postcondition has been proved.
  if (raw === '') return { code: 0, stdout: '', stderr: '' }
  const diagnostic = decodeResult(raw, stepId)
  return { ...diagnostic, code: 0 }
}
