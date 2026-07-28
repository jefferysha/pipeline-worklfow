import type { CliDeps } from '../deps.js'
import {
  TENON_HOSTS,
  hostFlag,
  isNativePipelineHost,
  nativeInstallPlan,
  nativeUpdatePlan,
  type HostCommandPlanItem,
  type PipelineHost,
} from './plugin-host.js'

export const HOST_TARGET_PLAN_SCHEMA_VERSION = 'host-target-plan/v1' as const

export type HostTargetOperation = 'setup' | 'update'
export type HostTargetCapability =
  | 'native-marketplace'
  | 'project-adapter'
  | 'managed-runtime'
  | 'bundled-skills'
  | 'automatic-update'

export interface HostTarget {
  readonly id: PipelineHost
  readonly kind: 'native' | 'adapter'
  readonly cli_flag: `--${PipelineHost}`
  readonly target_scope: 'user' | 'project'
  readonly supported_operations: readonly ['setup', 'update']
  readonly capabilities: readonly HostTargetCapability[]
}

export interface HostTargetCatalog {
  readonly schema_version: typeof HOST_TARGET_PLAN_SCHEMA_VERSION
  readonly targets: readonly HostTarget[]
}

export interface HostPlanCommand {
  readonly executable: string
  readonly args: readonly string[]
  readonly display: string
}

export interface HostTargetPlanStep {
  readonly id: string
  readonly label: string
  readonly command: HostPlanCommand | null
}

export interface HostTargetPlan {
  readonly schema_version: typeof HOST_TARGET_PLAN_SCHEMA_VERSION
  readonly side_effects: 'none'
  readonly host: HostTarget
  readonly operation: HostTargetOperation
  readonly command: HostPlanCommand
  readonly steps: readonly HostTargetPlanStep[]
  readonly notices: readonly string[]
}

export interface HostTargetPlanOpts {
  readonly host?: string
  readonly operation?: string
  readonly json?: boolean
}

const PRODUCT_STEPS = [
  { id: 'managed-runtime', label: 'host-plan.step.managed-runtime', command: null },
  { id: 'bundled-skills', label: 'host-plan.step.bundled-skills', command: null },
  { id: 'runtime-readiness', label: 'host-plan.step.runtime-readiness', command: null },
] as const satisfies readonly HostTargetPlanStep[]

const NATIVE_STEP_IDS: Readonly<Record<HostTargetOperation, readonly string[]>> = {
  setup: ['marketplace-register', 'plugin-install', 'plugin-inventory'],
  update: ['marketplace-refresh', 'plugin-update', 'plugin-inventory'],
}

function command(executable: string, args: readonly string[]): HostPlanCommand {
  return {
    executable,
    args: [...args],
    display: [executable, ...args].join(' '),
  }
}

function targetFor(host: PipelineHost): HostTarget {
  if (isNativePipelineHost(host)) {
    return {
      id: host,
      kind: 'native',
      cli_flag: hostFlag(host),
      target_scope: 'user',
      supported_operations: ['setup', 'update'],
      capabilities: [
        'native-marketplace',
        'managed-runtime',
        'bundled-skills',
        'automatic-update',
      ],
    }
  }
  return {
    id: host,
    kind: 'adapter',
    cli_flag: hostFlag(host),
    target_scope: 'project',
    supported_operations: ['setup', 'update'],
    capabilities: ['project-adapter', 'managed-runtime', 'bundled-skills'],
  }
}

export function createHostTargetCatalog(): HostTargetCatalog {
  return {
    schema_version: HOST_TARGET_PLAN_SCHEMA_VERSION,
    targets: TENON_HOSTS.map(targetFor),
  }
}

function nativeSteps(
  operation: HostTargetOperation,
  plan: readonly HostCommandPlanItem[],
): readonly HostTargetPlanStep[] {
  const ids = NATIVE_STEP_IDS[operation]
  return [
    ...plan.map((item, index) => {
      const id = ids[index] ?? `host-command-${index + 1}`
      return {
        id,
        label: `host-plan.step.${id}`,
        command: command(item.cmd, item.args),
      }
    }),
    ...PRODUCT_STEPS,
  ]
}

function adapterSteps(
  operation: HostTargetOperation,
  manualCommand: HostPlanCommand,
): readonly HostTargetPlanStep[] {
  const deploymentSteps: readonly HostTargetPlanStep[] = [
    { id: 'package-assets', label: 'host-plan.step.package-assets', command: null },
    PRODUCT_STEPS[0],
    { id: 'adapter-deploy', label: 'host-plan.step.adapter-deploy', command: manualCommand },
  ]
  return operation === 'setup'
    ? [...deploymentSteps, ...PRODUCT_STEPS.slice(1)]
    : deploymentSteps
}

export function createHostTargetPlan(
  host: PipelineHost,
  operation: HostTargetOperation,
): HostTargetPlan {
  const target = targetFor(host)
  const args = isNativePipelineHost(host)
    ? [operation, hostFlag(host)]
    : [operation, hostFlag(host), '--target', '<project>']
  const manualCommand = command('tenon', args)
  const steps = isNativePipelineHost(host)
    ? nativeSteps(
        operation,
        operation === 'setup' ? nativeInstallPlan(host) : nativeUpdatePlan(host),
      )
    : adapterSteps(operation, manualCommand)
  return {
    schema_version: HOST_TARGET_PLAN_SCHEMA_VERSION,
    side_effects: 'none',
    host: target,
    operation,
    command: manualCommand,
    steps,
    notices: [
      'host-plan.notice.read-only-generation',
      'host-plan.notice.manual-command-has-effects',
      ...(isNativePipelineHost(host) ? [] : ['host-plan.notice.project-placeholder']),
    ],
  }
}

function isPipelineHost(value: string): value is PipelineHost {
  return (TENON_HOSTS as readonly string[]).includes(value)
}

function isHostTargetOperation(value: string): value is HostTargetOperation {
  return value === 'setup' || value === 'update'
}

/** Render a deterministic DTO only; this command never enters setup/update or reads process state. */
export function cmdHostTargetPlan(
  deps: Pick<CliDeps, 'io'>,
  opts: HostTargetPlanOpts,
): number {
  if (opts.json !== true) {
    deps.io.err('ERROR: host-target-plan 是机器可读只读契约，必须指定 --json。')
    return 1
  }
  if (opts.host === undefined && opts.operation === undefined) {
    deps.io.out(JSON.stringify(createHostTargetCatalog()))
    return 0
  }
  if (opts.host === undefined || opts.operation === undefined) {
    deps.io.err('ERROR: 单目标计划必须同时指定 --host 与 --operation。')
    return 1
  }
  if (!isPipelineHost(opts.host)) {
    deps.io.err(`ERROR: 未知宿主: ${opts.host}；仅支持 ${TENON_HOSTS.join(', ')}。`)
    return 1
  }
  if (!isHostTargetOperation(opts.operation)) {
    deps.io.err(`ERROR: 未知操作: ${opts.operation}；仅支持 setup, update。`)
    return 1
  }
  deps.io.out(JSON.stringify(createHostTargetPlan(opts.host, opts.operation)))
  return 0
}
