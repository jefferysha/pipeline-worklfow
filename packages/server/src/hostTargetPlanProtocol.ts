const HOST_IDS = [
  'codex', 'claude', 'cursor', 'gemini', 'copilot', 'pi',
  'devin', 'zed', 'aider', 'continue', 'cline', 'amp',
] as const

const CAPABILITIES = [
  'native-marketplace',
  'project-adapter',
  'managed-runtime',
  'bundled-skills',
  'automatic-update',
] as const

const STEP_IDS = [
  'marketplace-register',
  'plugin-install',
  'plugin-inventory',
  'marketplace-refresh',
  'plugin-update',
  'package-assets',
  'adapter-deploy',
  'managed-runtime',
  'codex-auth-status',
  'bundled-skills',
  'runtime-readiness',
] as const

const NOTICE_IDS = [
  'host-plan.notice.read-only-generation',
  'host-plan.notice.manual-command-has-effects',
  'host-plan.notice.codex-auth-guidance',
  'host-plan.notice.project-placeholder',
] as const

export type HostId = (typeof HOST_IDS)[number]
export type HostOperation = 'setup' | 'update'
type HostCapability = (typeof CAPABILITIES)[number]
type HostPlanStepId = (typeof STEP_IDS)[number]

export interface HostTargetDto {
  readonly id: HostId
  readonly kind: 'native' | 'adapter'
  readonly cli_flag: `--${HostId}`
  readonly target_scope: 'user' | 'project'
  readonly supported_operations: readonly ['setup', 'update']
  readonly capabilities: readonly HostCapability[]
}

export interface HostTargetCatalogDto {
  readonly schema_version: 'host-target-plan/v1'
  readonly targets: readonly HostTargetDto[]
}

export interface HostPlanCommandDto {
  readonly executable: string
  readonly args: readonly string[]
  readonly display: string
}

export interface HostTargetPlanStepDto {
  readonly id: string
  readonly label: string
  readonly command: HostPlanCommandDto | null
}

export interface HostTargetPlanDto {
  readonly schema_version: 'host-target-plan/v1'
  readonly side_effects: 'none'
  readonly host: HostTargetDto
  readonly operation: HostOperation
  readonly command: HostPlanCommandDto
  readonly steps: readonly HostTargetPlanStepDto[]
  readonly notices: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function isHostId(value: unknown): value is HostId {
  return typeof value === 'string' && (HOST_IDS as readonly string[]).includes(value)
}

function isCapability(value: unknown): value is HostCapability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function decodeCommand(value: unknown): HostPlanCommandDto | null {
  if (!isRecord(value) || !hasExactKeys(value, ['executable', 'args', 'display'])) return null
  if (!isNonemptyString(value.executable) || !isNonemptyString(value.display)) return null
  if (
    !Array.isArray(value.args)
    || !value.args.every((arg) => typeof arg === 'string')
    || value.display !== [value.executable, ...value.args].join(' ')
  ) return null
  return { executable: value.executable, args: value.args, display: value.display }
}

function planCommand(executable: string, args: readonly string[]): HostPlanCommandDto {
  return { executable, args, display: [executable, ...args].join(' ') }
}

function nativeCommandTruth(
  host: 'codex' | 'claude',
  operation: HostOperation,
): readonly HostPlanCommandDto[] {
  if (host === 'codex') {
    return operation === 'setup'
      ? [
          planCommand('codex', ['plugin', 'marketplace', 'add', 'jefferysha/tenon', '--ref', 'main']),
          planCommand('codex', ['plugin', 'add', 'tenon@tenon', '--json']),
          planCommand('codex', ['plugin', 'list', '--json']),
        ]
      : [
          planCommand('codex', ['plugin', 'marketplace', 'upgrade', 'tenon', '--json']),
          planCommand('codex', ['plugin', 'add', 'tenon@tenon', '--json']),
          planCommand('codex', ['plugin', 'list', '--json']),
        ]
  }
  return operation === 'setup'
    ? [
        planCommand('claude', ['plugin', 'marketplace', 'add', 'jefferysha/tenon']),
        planCommand('claude', ['plugin', 'install', 'tenon@tenon']),
        planCommand('claude', ['plugin', 'list', '--json']),
      ]
    : [
        planCommand('claude', ['plugin', 'marketplace', 'update', 'tenon']),
        planCommand('claude', ['plugin', 'update', 'tenon@tenon']),
        planCommand('claude', ['plugin', 'list', '--json']),
      ]
}

function commandsEqual(
  actual: HostPlanCommandDto | null,
  expected: HostPlanCommandDto | null,
): boolean {
  if (actual === null || expected === null) return actual === expected
  return actual.executable === expected.executable
    && arraysEqual(actual.args, expected.args)
    && actual.display === expected.display
}

function decodeTarget(value: unknown): HostTargetDto | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'id',
      'kind',
      'cli_flag',
      'target_scope',
      'supported_operations',
      'capabilities',
    ])
    || !isHostId(value.id)
  ) return null
  const native = value.id === 'codex' || value.id === 'claude'
  if (value.kind !== (native ? 'native' : 'adapter')) return null
  if (value.target_scope !== (native ? 'user' : 'project')) return null
  if (value.cli_flag !== `--${value.id}`) return null
  if (
    !Array.isArray(value.supported_operations)
    || value.supported_operations.length !== 2
    || value.supported_operations[0] !== 'setup'
    || value.supported_operations[1] !== 'update'
  ) return null
  if (
    !Array.isArray(value.capabilities)
    || !value.capabilities.every(isCapability)
    || new Set(value.capabilities).size !== value.capabilities.length
  ) return null
  const expectedCapabilities = native
    ? ['native-marketplace', 'managed-runtime', 'bundled-skills', 'automatic-update']
    : ['project-adapter', 'managed-runtime', 'bundled-skills']
  if (!arraysEqual(value.capabilities, expectedCapabilities)) return null
  return {
    id: value.id,
    kind: native ? 'native' : 'adapter',
    cli_flag: `--${value.id}`,
    target_scope: native ? 'user' : 'project',
    supported_operations: ['setup', 'update'],
    capabilities: value.capabilities,
  }
}

export function decodeHostTargetCatalog(value: unknown): HostTargetCatalogDto | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['schema_version', 'targets'])
    || value.schema_version !== 'host-target-plan/v1'
    || !Array.isArray(value.targets)
    || value.targets.length !== HOST_IDS.length
  ) return null
  const targets: HostTargetDto[] = []
  for (let index = 0; index < value.targets.length; index += 1) {
    const item = value.targets[index]
    const target = decodeTarget(item)
    if (target === null || target.id !== HOST_IDS[index]) return null
    targets.push(target)
  }
  return { schema_version: 'host-target-plan/v1', targets }
}

function decodePlanStep(value: unknown): HostTargetPlanStepDto | null {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'label', 'command'])) return null
  if (
    typeof value.id !== 'string'
    || !(STEP_IDS as readonly string[]).includes(value.id)
    || value.label !== `host-plan.step.${value.id}`
  ) return null
  const command = value.command === null ? null : decodeCommand(value.command)
  if (value.command !== null && command === null) return null
  return { id: value.id, label: value.label, command }
}

export function decodeHostTargetPlan(
  value: unknown,
  expectedHost: HostId,
  expectedOperation: HostOperation,
): HostTargetPlanDto | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'schema_version',
      'side_effects',
      'host',
      'operation',
      'command',
      'steps',
      'notices',
    ])
    || value.schema_version !== 'host-target-plan/v1'
    || value.side_effects !== 'none'
    || value.operation !== expectedOperation
    || !Array.isArray(value.steps)
    || !Array.isArray(value.notices)
    || !value.notices.every(isNonemptyString)
  ) return null
  const host = decodeTarget(value.host)
  const command = decodeCommand(value.command)
  if (host === null || host.id !== expectedHost || command === null) return null
  const native = host.kind === 'native'
  const expectedCommandArgs = native
    ? [expectedOperation, `--${expectedHost}`]
    : [expectedOperation, `--${expectedHost}`, '--target', '<project>']
  if (
    command.executable !== 'tenon'
    || !arraysEqual(command.args, expectedCommandArgs)
    || command.display !== ['tenon', ...expectedCommandArgs].join(' ')
  ) return null
  const steps: HostTargetPlanStepDto[] = []
  for (const item of value.steps) {
    const step = decodePlanStep(item)
    if (step === null) return null
    steps.push(step)
  }
  const expectedStepIds: readonly HostPlanStepId[] = native
    ? [
        ...(expectedOperation === 'setup'
          ? ['marketplace-register', 'plugin-install', 'plugin-inventory'] as const
          : ['marketplace-refresh', 'plugin-update', 'plugin-inventory'] as const),
        'managed-runtime',
        ...(expectedHost === 'codex' ? ['codex-auth-status'] as const : []),
        ...(expectedOperation === 'setup'
          ? ['bundled-skills', 'runtime-readiness'] as const
          : []),
      ]
    : expectedOperation === 'setup'
      ? ['package-assets', 'managed-runtime', 'adapter-deploy', 'bundled-skills', 'runtime-readiness']
      : ['package-assets', 'managed-runtime', 'adapter-deploy']
  if (!arraysEqual(steps.map((step) => step.id), expectedStepIds)) return null
  let expectedStepCommands: readonly (HostPlanCommandDto | null)[]
  if (native) {
    if (expectedHost !== 'codex' && expectedHost !== 'claude') return null
    expectedStepCommands = [
      ...nativeCommandTruth(expectedHost, expectedOperation),
      null,
      ...(expectedHost === 'codex' ? [planCommand('codex', ['login', 'status'])] : []),
      ...(expectedOperation === 'setup' ? [null, null] : []),
    ]
  } else {
    expectedStepCommands = expectedOperation === 'setup'
      ? [null, null, command, null, null]
      : [null, null, command]
  }
  for (let index = 0; index < steps.length; index += 1) {
    if (!commandsEqual(steps[index]?.command ?? null, expectedStepCommands[index] ?? null)) return null
  }
  const expectedNotices = expectedHost === 'codex'
    ? NOTICE_IDS.slice(0, 3)
    : native
      ? NOTICE_IDS.slice(0, 2)
      : [...NOTICE_IDS.slice(0, 2), NOTICE_IDS[3]]
  if (!arraysEqual(value.notices, expectedNotices)) return null
  return {
    schema_version: 'host-target-plan/v1',
    side_effects: 'none',
    host,
    operation: expectedOperation,
    command,
    steps,
    notices: value.notices,
  }
}
