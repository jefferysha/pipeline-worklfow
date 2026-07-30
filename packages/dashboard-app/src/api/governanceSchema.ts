import type {
  WbActionConfig,
  WbArtifactConfig,
  WbDocumentContract,
  WbFieldRef,
  WbGuardConfig,
  WbSkillEntry,
  WbSkillRef,
  WbStepDef,
  WbTrackPredicate,
  WbTransition,
  WbWorkflowDef,
} from './governanceTypes'

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function decodeArray<T>(value: unknown, decode: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const entries: T[] = []
  for (const entry of value) {
    const decoded = decode(entry)
    if (decoded === null) return null
    entries.push(decoded)
  }
  return entries
}

function decodeSkillSource(value: unknown): WbSkillEntry['source'] | null {
  return value === 'local-plugin'
    || value === 'external-marketplace'
    || value === 'builtin'
    || value === 'user'
    ? value
    : null
}

function decodeSkillTier(value: unknown): WbSkillEntry['tier'] | null {
  return value === 'mandatory'
    || value === 'recommended'
    || value === 'conditional'
    || value === 'optional'
    ? value
    : null
}

function decodeSkillEntry(value: unknown): WbSkillEntry | null {
  const item = record(value)
  if (!item || typeof item.name !== 'string' || typeof item.installed !== 'boolean') return null
  const source = decodeSkillSource(item.source)
  if (source === null) return null
  if (!optionalString(item.description) || !optionalString(item.installCmd) || !optionalString(item.version)) return null
  if (item.available !== undefined && typeof item.available !== 'boolean') return null
  const tier = item.tier === undefined ? undefined : decodeSkillTier(item.tier)
  if (tier === null) return null
  return {
    name: item.name,
    installed: item.installed,
    source,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(tier === undefined ? {} : { tier }),
    ...(item.available === undefined ? {} : { available: item.available }),
    ...(item.installCmd === undefined ? {} : { installCmd: item.installCmd }),
    ...(item.version === undefined ? {} : { version: item.version }),
  }
}

export function decodeSkillsRegistry(value: unknown): WbSkillEntry[] | null {
  const body = record(value)
  return body ? decodeArray(body.skills, decodeSkillEntry) : null
}

function decodeField(value: unknown): WbFieldRef | null {
  const item = record(value)
  if (!item || typeof item.field !== 'string') return null
  if (item.type !== 'string' && item.type !== 'file_path' && item.type !== 'boolean') return null
  return { field: item.field, type: item.type }
}

function decodeSkill(value: unknown): WbSkillRef | null {
  const item = record(value)
  if (!item || typeof item.id !== 'string' || (item.depends_on !== undefined && !strings(item.depends_on))) return null
  return {
    id: item.id,
    ...(item.depends_on === undefined ? {} : { depends_on: item.depends_on }),
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return keys.length === sortedExpected.length
    && keys.every((key, index) => key === sortedExpected[index])
}

function decodePredicate(value: unknown): WbTrackPredicate | null {
  const item = record(value)
  if (!item
    || !exactKeys(item, ['kind', 'values'])
    || (item.kind !== 'track-in' && item.kind !== 'track-not-in')
    || !strings(item.values)) return null
  return { kind: item.kind, values: item.values }
}

function withWhen(
  guard: WbGuardConfig,
  when: WbTrackPredicate | undefined,
): WbGuardConfig {
  return when === undefined ? guard : { ...guard, when }
}

const GUARD_DATA_KEYS = {
  'tasks-at-least': ['n'],
  'nonempty-output': [],
  'field-nonempty': ['field'],
  'file-exists': ['path'],
  'field-equals': ['field', 'value'],
  'field-in': ['field', 'values'],
  'full-direct-override': [],
  'build-head-unchanged': ['field'],
  'spec-migration-applied': [],
} as const satisfies Record<WbGuardConfig['type'], readonly string[]>

function isGuardType(value: string): value is WbGuardConfig['type'] {
  return Object.prototype.hasOwnProperty.call(GUARD_DATA_KEYS, value)
}

function decodeGuard(value: unknown): WbGuardConfig | null {
  const item = record(value)
  if (!item || typeof item.type !== 'string' || !isGuardType(item.type)) return null
  const expectedKeys = [
    'type',
    ...GUARD_DATA_KEYS[item.type],
    ...(item.when === undefined ? [] : ['when']),
  ]
  if (!exactKeys(item, expectedKeys)) return null
  const when = item.when === undefined ? undefined : decodePredicate(item.when)
  if (when === null) return null
  switch (item.type) {
    case 'tasks-at-least':
      return typeof item.n === 'number' && Number.isFinite(item.n)
        ? withWhen({ type: 'tasks-at-least', n: item.n }, when)
        : null
    case 'nonempty-output':
      return withWhen({ type: 'nonempty-output' }, when)
    case 'full-direct-override':
      return withWhen({ type: 'full-direct-override' }, when)
    case 'field-nonempty':
      return typeof item.field === 'string' ? withWhen({ type: 'field-nonempty', field: item.field }, when) : null
    case 'file-exists': {
      const path = record(item.path)
      return path !== null
        && exactKeys(path, ['kind', 'field'])
        && path.kind === 'field'
        && typeof path.field === 'string'
        ? withWhen({ type: 'file-exists', path: { kind: 'field', field: path.field } }, when)
        : null
    }
    case 'field-equals':
      return typeof item.field === 'string' && typeof item.value === 'string'
        ? withWhen({ type: 'field-equals', field: item.field, value: item.value }, when)
        : null
    case 'field-in': {
      if (typeof item.field !== 'string' || !strings(item.values)) return null
      const [first, ...rest] = item.values
      return first === undefined
        ? null
        : withWhen({ type: 'field-in', field: item.field, values: [first, ...rest] }, when)
    }
    case 'build-head-unchanged':
      return item.field === 'build_sha'
        ? withWhen({ type: 'build-head-unchanged', field: 'build_sha' }, when)
        : null
    case 'spec-migration-applied':
      return withWhen({ type: 'spec-migration-applied' }, when)
    default:
      return null
  }
}

function decodeAction(value: unknown): WbActionConfig | null {
  const item = record(value)
  if (!item) return null
  switch (item.type) {
    case 'freeze-build-sha': return { type: 'freeze-build-sha' }
    case 'mark-verification-passed': return { type: 'mark-verification-passed' }
    case 'mark-verification-failed': return { type: 'mark-verification-failed' }
    case 'reset-pre-verify-review': return { type: 'reset-pre-verify-review' }
    case 'archive-run': return { type: 'archive-run' }
    default: return null
  }
}

function decodeTransition(value: unknown): WbTransition | null {
  const item = record(value)
  if (!item || typeof item.event !== 'string' || typeof item.to !== 'string') return null
  const guards = item.guards === undefined ? undefined : decodeArray(item.guards, decodeGuard)
  const actions = item.actions === undefined ? undefined : decodeArray(item.actions, decodeAction)
  if (guards === null || actions === null) return null
  return {
    event: item.event,
    to: item.to,
    ...(guards === undefined ? {} : { guards }),
    ...(actions === undefined ? {} : { actions }),
  }
}

function decodeArtifact(value: unknown): WbArtifactConfig | null {
  const item = record(value)
  if (!item || typeof item.field !== 'string' || item.type !== 'file_path') return null
  if (item.producerPolicy !== 'effective-step-skills' && item.producerPolicy !== 'effective-phase-skills') return null
  const requiredWhen = item.requiredWhen === undefined ? undefined : decodePredicate(item.requiredWhen)
  if (requiredWhen === null) return null
  return {
    field: item.field,
    type: 'file_path',
    producerPolicy: item.producerPolicy,
    ...(requiredWhen === undefined ? {} : { requiredWhen }),
  }
}

function decodeDocumentSlot(value: unknown): WbDocumentContract['slots'][number] | null {
  const item = record(value)
  return item && typeof item.kind === 'string' && typeof item.ownerStep === 'string' && strings(item.producers)
    ? { kind: item.kind, ownerStep: item.ownerStep, producers: item.producers }
    : null
}

function decodeDocumentRead(value: unknown): WbDocumentContract['reads'][number] | null {
  const item = record(value)
  return item && typeof item.step === 'string' && strings(item.kinds)
    ? { step: item.step, kinds: item.kinds }
    : null
}

function decodeDocumentContract(value: unknown): WbDocumentContract | null {
  const item = record(value)
  if (!item || item.version !== 'v1') return null
  const slots = decodeArray(item.slots, decodeDocumentSlot)
  const reads = decodeArray(item.reads, decodeDocumentRead)
  return slots === null || reads === null ? null : { version: 'v1', slots, reads }
}

function decodeStep(value: unknown): WbStepDef | null {
  const step = record(value)
  if (!step || typeof step.id !== 'string' || typeof step.label !== 'string') return null
  if (step.gate !== null && step.gate !== 'review' && step.gate !== 'confirm') return null
  if (!optionalString(step.prompt)) return null
  const skills = decodeArray(step.skills, decodeSkill)
  const inputs = decodeArray(step.inputs, decodeField)
  const outputs = decodeArray(step.outputs, decodeField)
  const artifacts = step.artifacts === undefined ? undefined : decodeArray(step.artifacts, decodeArtifact)
  const guards = decodeArray(step.guards, decodeGuard)
  const transitions = decodeArray(step.transitions, decodeTransition)
  if (skills === null || inputs === null || outputs === null || artifacts === null || guards === null || transitions === null) return null
  return {
    id: step.id,
    label: step.label,
    gate: step.gate,
    ...(step.prompt === undefined ? {} : { prompt: step.prompt }),
    skills,
    inputs,
    outputs,
    ...(artifacts === undefined ? {} : { artifacts }),
    guards,
    transitions,
  }
}

export function decodeWorkflowDefinition(value: unknown): WbWorkflowDef | null {
  const body = record(value)
  if (!body || typeof body.name !== 'string') return null
  if (body.openspecContract !== undefined && body.openspecContract !== 'required') return null
  if (body.openspecContract !== undefined && body.documentContract !== undefined) return null
  const documentContract = body.documentContract === undefined ? undefined : decodeDocumentContract(body.documentContract)
  const steps = decodeArray(body.steps, decodeStep)
  if (documentContract === null || steps === null) return null
  return {
    name: body.name,
    ...(body.openspecContract === undefined ? {} : { openspecContract: body.openspecContract }),
    ...(documentContract === undefined ? {} : { documentContract }),
    steps,
  }
}
