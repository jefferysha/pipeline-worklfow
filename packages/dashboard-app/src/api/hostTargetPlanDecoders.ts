import { isRecord, stringArray } from './transport'
import {
  HOST_PLAN_SCHEMA_VERSION,
  type HostCapability,
  type HostId,
  type HostOperation,
  type HostPlanCommand,
  type HostPlanStep,
  type HostTarget,
  type HostTargetCatalog,
  type HostTargetPlan,
} from './hostTargetPlanTypes'

const HOST_IDS = [
  'codex', 'claude', 'cursor', 'gemini', 'copilot', 'pi',
  'devin', 'zed', 'aider', 'continue', 'cline', 'amp',
] as const satisfies readonly HostId[]

const NATIVE_CAPABILITIES = [
  'native-marketplace',
  'managed-runtime',
  'bundled-skills',
  'automatic-update',
] as const satisfies readonly HostCapability[]

const ADAPTER_CAPABILITIES = [
  'project-adapter',
  'managed-runtime',
  'bundled-skills',
] as const satisfies readonly HostCapability[]

const SETUP_ONLY_PRODUCT_STEP_IDS = [
  'bundled-skills',
  'runtime-readiness',
] as const

const BASE_NOTICES = [
  'host-plan.notice.read-only-generation',
  'host-plan.notice.manual-command-has-effects',
] as const

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function isHostId(value: unknown): value is HostId {
  return typeof value === 'string' && (HOST_IDS as readonly string[]).includes(value)
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

function commandMatches(
  command: HostPlanCommand | null,
  executable: string,
  args: readonly string[],
): boolean {
  return command !== null
    && command.executable === executable
    && arraysEqual(command.args, args)
    && command.display === [executable, ...args].join(' ')
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
    || !isHostId(value.id)
    || !Array.isArray(value.supported_operations)
    || value.supported_operations.length !== 2
    || value.supported_operations[0] !== 'setup'
    || value.supported_operations[1] !== 'update'
    || !stringArray(value.capabilities)) return null

  const native = value.id === 'codex' || value.id === 'claude'
  const expectedCapabilities = native ? NATIVE_CAPABILITIES : ADAPTER_CAPABILITIES
  if (value.kind !== (native ? 'native' : 'adapter')
    || value.cli_flag !== `--${value.id}`
    || value.target_scope !== (native ? 'user' : 'project')
    || !arraysEqual(value.capabilities, expectedCapabilities)) return null

  return {
    id: value.id,
    kind: native ? 'native' : 'adapter',
    cli_flag: `--${value.id}`,
    target_scope: native ? 'user' : 'project',
    supported_operations: ['setup', 'update'],
    capabilities: [...expectedCapabilities],
  }
}

export function decodeHostTargetCatalog(value: unknown): HostTargetCatalog | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['schema_version', 'targets'])
    || value.schema_version !== HOST_PLAN_SCHEMA_VERSION
    || !Array.isArray(value.targets)) return null
  if (value.targets.length === 0) {
    return { schema_version: HOST_PLAN_SCHEMA_VERSION, targets: [] }
  }
  if (value.targets.length !== HOST_IDS.length) return null

  const targets: HostTarget[] = []
  for (let index = 0; index < HOST_IDS.length; index += 1) {
    const decoded = decodeTarget(value.targets[index])
    if (!decoded || decoded.id !== HOST_IDS[index]) return null
    targets.push(decoded)
  }
  return { schema_version: HOST_PLAN_SCHEMA_VERSION, targets }
}

function decodeStep(value: unknown): HostPlanStep | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ['id', 'label', 'command'])
    || typeof value.id !== 'string'
    || value.id === ''
    || value.label !== `host-plan.step.${value.id}`) return null
  const command = value.command === null ? null : decodeCommand(value.command)
  if (value.command !== null && !command) return null
  return { id: value.id, label: value.label, command }
}

function isOperation(value: unknown): value is HostOperation {
  return value === 'setup' || value === 'update'
}

interface ExpectedStep {
  readonly id: string
  readonly executable?: string
  readonly args?: readonly string[]
}

function nativeCommandSteps(host: 'codex' | 'claude', operation: HostOperation): readonly ExpectedStep[] {
  if (host === 'codex' && operation === 'setup') {
    return [
      {
        id: 'marketplace-register',
        executable: 'codex',
        args: ['plugin', 'marketplace', 'add', 'jefferysha/tenon', '--ref', 'main'],
      },
      { id: 'plugin-install', executable: 'codex', args: ['plugin', 'add', 'tenon@tenon', '--json'] },
      { id: 'plugin-inventory', executable: 'codex', args: ['plugin', 'list', '--json'] },
    ]
  }
  if (host === 'codex') {
    return [
      {
        id: 'marketplace-refresh',
        executable: 'codex',
        args: ['plugin', 'marketplace', 'upgrade', 'tenon', '--json'],
      },
      { id: 'plugin-update', executable: 'codex', args: ['plugin', 'add', 'tenon@tenon', '--json'] },
      { id: 'plugin-inventory', executable: 'codex', args: ['plugin', 'list', '--json'] },
    ]
  }
  if (operation === 'setup') {
    return [
      {
        id: 'marketplace-register',
        executable: 'claude',
        args: ['plugin', 'marketplace', 'add', 'jefferysha/tenon'],
      },
      { id: 'plugin-install', executable: 'claude', args: ['plugin', 'install', 'tenon@tenon'] },
      { id: 'plugin-inventory', executable: 'claude', args: ['plugin', 'list', '--json'] },
    ]
  }
  return [
    {
      id: 'marketplace-refresh',
      executable: 'claude',
      args: ['plugin', 'marketplace', 'update', 'tenon'],
    },
    { id: 'plugin-update', executable: 'claude', args: ['plugin', 'update', 'tenon@tenon'] },
    { id: 'plugin-inventory', executable: 'claude', args: ['plugin', 'list', '--json'] },
  ]
}

function expectedSteps(host: HostTarget, operation: HostOperation, command: HostPlanCommand): readonly ExpectedStep[] {
  const operationSteps = host.kind === 'native'
    ? host.id === 'codex' || host.id === 'claude'
      ? nativeCommandSteps(host.id, operation)
      : []
    : [
        { id: 'package-assets' },
        { id: 'managed-runtime' },
        { id: 'adapter-deploy', executable: command.executable, args: command.args },
        ...(operation === 'setup'
          ? [{ id: 'bundled-skills' }, { id: 'runtime-readiness' }]
          : []),
      ]
  return host.kind === 'native'
    ? [
        ...operationSteps,
        { id: 'managed-runtime' },
        ...(operation === 'setup' ? SETUP_ONLY_PRODUCT_STEP_IDS.map((id) => ({ id })) : []),
      ]
    : operationSteps
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
    || !stringArray(value.notices)) return null

  const command = decodeCommand(value.command)
  const host = decodeTarget(value.host)
  if (!command || !host) return null
  const expectedArgs = host.kind === 'native'
    ? [value.operation, host.cli_flag]
    : [value.operation, host.cli_flag, '--target', '<project>']
  if (!commandMatches(command, 'tenon', expectedArgs)) return null

  const decodedSteps: HostPlanStep[] = []
  for (const step of value.steps) {
    const decoded = decodeStep(step)
    if (!decoded) return null
    decodedSteps.push(decoded)
  }
  const requiredSteps = expectedSteps(host, value.operation, command)
  if (decodedSteps.length !== requiredSteps.length) return null
  for (let index = 0; index < requiredSteps.length; index += 1) {
    const step = decodedSteps[index]
    const expected = requiredSteps[index]
    if (!step || !expected || step.id !== expected.id) return null
    if (expected.executable === undefined || expected.args === undefined) {
      if (step.command !== null) return null
    } else if (!commandMatches(step.command, expected.executable, expected.args)) {
      return null
    }
  }

  const expectedNotices = host.kind === 'native'
    ? BASE_NOTICES
    : [...BASE_NOTICES, 'host-plan.notice.project-placeholder']
  if (!arraysEqual(value.notices, expectedNotices)) return null
  return {
    schema_version: HOST_PLAN_SCHEMA_VERSION,
    side_effects: 'none',
    host,
    operation: value.operation,
    command,
    steps: decodedSteps,
    notices: [...expectedNotices],
  }
}
