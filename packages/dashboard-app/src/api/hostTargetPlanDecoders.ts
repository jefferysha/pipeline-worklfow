import { isRecord, stringArray } from './transport'
import {
  HOST_PLAN_SCHEMA_VERSION,
  type HostCapability,
  type HostOperation,
  type HostPlanCommand,
  type HostPlanStep,
  type HostTarget,
  type HostTargetCatalog,
  type HostTargetPlan,
} from './hostTargetPlanTypes'

const HOST_IDS = new Set([
  'codex', 'claude', 'cursor', 'gemini', 'copilot', 'pi',
  'devin', 'zed', 'aider', 'continue', 'cline', 'amp',
])

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function isCapability(value: string): value is HostCapability {
  return value === 'native-marketplace'
    || value === 'project-adapter'
    || value === 'managed-runtime'
    || value === 'bundled-skills'
    || value === 'automatic-update'
}

function decodeCommand(value: unknown): HostPlanCommand | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['executable', 'args', 'display'])
    || typeof value.executable !== 'string'
    || value.executable === ''
    || !stringArray(value.args)
    || typeof value.display !== 'string'
    || value.display !== [value.executable, ...value.args].join(' ')) return null
  return { executable: value.executable, args: value.args, display: value.display }
}

function decodeTarget(value: unknown): HostTarget | null {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      'id',
      'kind',
      'cli_flag',
      'target_scope',
      'supported_operations',
      'capabilities',
    ])
    || typeof value.id !== 'string'
    || !HOST_IDS.has(value.id)
    || (value.kind !== 'native' && value.kind !== 'adapter')
    || typeof value.cli_flag !== 'string'
    || value.cli_flag !== `--${value.id}`
    || (value.target_scope !== 'user' && value.target_scope !== 'project')
    || !Array.isArray(value.supported_operations)
    || value.supported_operations.length !== 2
    || value.supported_operations[0] !== 'setup'
    || value.supported_operations[1] !== 'update'
    || !stringArray(value.capabilities)
    || !value.capabilities.every(isCapability)
    || new Set(value.capabilities).size !== value.capabilities.length) return null
  const native = value.id === 'codex' || value.id === 'claude'
  if (value.kind !== (native ? 'native' : 'adapter')
    || value.target_scope !== (native ? 'user' : 'project')) return null
  return {
    id: value.id,
    kind: value.kind,
    cli_flag: value.cli_flag,
    target_scope: value.target_scope,
    supported_operations: ['setup', 'update'],
    capabilities: value.capabilities,
  }
}

export function decodeHostTargetCatalog(value: unknown): HostTargetCatalog | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema_version', 'targets'])
    || value.schema_version !== HOST_PLAN_SCHEMA_VERSION
    || !Array.isArray(value.targets)) return null
  const targets: HostTarget[] = []
  for (const target of value.targets) {
    const decoded = decodeTarget(target)
    if (!decoded) return null
    targets.push(decoded)
  }
  return { schema_version: HOST_PLAN_SCHEMA_VERSION, targets }
}

function decodeStep(value: unknown): HostPlanStep | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['id', 'label', 'command'])
    || typeof value.id !== 'string'
    || value.id === ''
    || typeof value.label !== 'string'
    || value.label !== `host-plan.step.${value.id}`) return null
  const command = value.command === null ? null : decodeCommand(value.command)
  if (value.command !== null && !command) return null
  return { id: value.id, label: value.label, command }
}

function isOperation(value: unknown): value is HostOperation {
  return value === 'setup' || value === 'update'
}

export function decodeHostTargetPlan(value: unknown): HostTargetPlan | null {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      'schema_version',
      'side_effects',
      'host',
      'operation',
      'command',
      'steps',
      'notices',
    ])
    || value.schema_version !== HOST_PLAN_SCHEMA_VERSION
    || value.side_effects !== 'none'
    || !isOperation(value.operation)
    || !Array.isArray(value.steps)
    || !stringArray(value.notices)
    || !value.notices.every((notice) => notice.startsWith('host-plan.notice.'))
    || new Set(value.notices).size !== value.notices.length) return null
  const command = decodeCommand(value.command)
  const host = decodeTarget(value.host)
  if (!command || !host) return null
  const steps: HostPlanStep[] = []
  for (const step of value.steps) {
    const decoded = decodeStep(step)
    if (!decoded) return null
    steps.push(decoded)
  }
  return {
    schema_version: HOST_PLAN_SCHEMA_VERSION,
    side_effects: 'none',
    host,
    operation: value.operation,
    command,
    steps,
    notices: value.notices,
  }
}
