export const AUTOMATION_POLICY_TEMPLATE_VERSION = 1 as const

export const AUTOMATION_POLICY_TEMPLATE_IDS = [
  'pr-babysitter',
  'daily-triage',
  'ci-sweeper',
  'post-merge-cleanup',
  'dependency-sweeper',
  'changelog-drafter',
  'issue-triage',
] as const

export type AutomationPolicyTemplateVersion = typeof AUTOMATION_POLICY_TEMPLATE_VERSION
export type AutomationPolicyTemplateId = (typeof AUTOMATION_POLICY_TEMPLATE_IDS)[number]
export type AutomationPolicyRisk = 'low' | 'medium' | 'high'
export type AutomationPolicyTrigger =
  | { readonly kind: 'schedule' }
  | { readonly kind: 'event' }
  | { readonly kind: 'manual' }

export interface AutomationPolicyTemplateV1 {
  readonly version: 1
  readonly id: AutomationPolicyTemplateId
  readonly goal: string
  readonly trigger: readonly AutomationPolicyTrigger[]
  readonly risk: AutomationPolicyRisk
  readonly recommendedWorkflow: 'default'
  readonly recommendedSkills: readonly string[]
}

export type AutomationPolicyTemplate = AutomationPolicyTemplateV1

export interface AutomationPolicyTemplateOverrideV1 {
  readonly goal?: string
  readonly trigger?: readonly AutomationPolicyTrigger[]
  readonly risk?: AutomationPolicyRisk
  readonly recommendedWorkflow?: 'default'
  readonly recommendedSkills?: readonly string[]
}

export type AutomationPolicyTemplateOverride = AutomationPolicyTemplateOverrideV1

const SOURCE_TEMPLATES = [
  {
    version: 1,
    id: 'pr-babysitter',
    goal: 'Shepherd PRs through review, CI, rebase, and merge',
    trigger: [{ kind: 'schedule' }],
    risk: 'medium',
    recommendedWorkflow: 'default',
    recommendedSkills: ['pr-review-triage', 'minimal-fix', 'rebase-and-clean'],
  },
  {
    version: 1,
    id: 'daily-triage',
    goal: 'Prioritized morning scan of CI, issues, commits, and chat',
    trigger: [{ kind: 'schedule' }],
    risk: 'low',
    recommendedWorkflow: 'default',
    recommendedSkills: ['loop-triage', 'minimal-fix'],
  },
  {
    version: 1,
    id: 'ci-sweeper',
    goal: 'React to failing CI with minimal fixes and escalation',
    trigger: [{ kind: 'schedule' }, { kind: 'event' }],
    risk: 'medium',
    recommendedWorkflow: 'default',
    recommendedSkills: ['ci-triage', 'minimal-fix'],
  },
  {
    version: 1,
    id: 'post-merge-cleanup',
    goal: 'Follow-up tech debt and cleanup after merges to main',
    trigger: [{ kind: 'schedule' }, { kind: 'event' }],
    risk: 'low',
    recommendedWorkflow: 'default',
    recommendedSkills: ['post-merge-scan', 'minimal-fix'],
  },
  {
    version: 1,
    id: 'dependency-sweeper',
    goal: 'Discover, safely apply, and verify dependency + vulnerability updates with human gates on risky changes',
    trigger: [{ kind: 'schedule' }, { kind: 'event' }, { kind: 'manual' }],
    risk: 'medium',
    recommendedWorkflow: 'default',
    recommendedSkills: ['dependency-triage', 'minimal-fix', 'loop-verifier'],
  },
  {
    version: 1,
    id: 'changelog-drafter',
    goal: 'Scan merged PRs and commits, draft categorized high-quality release notes or CHANGELOG entries for human review',
    trigger: [{ kind: 'schedule' }, { kind: 'event' }, { kind: 'manual' }],
    risk: 'low',
    recommendedWorkflow: 'default',
    recommendedSkills: ['changelog-scan', 'draft-release-notes', 'loop-verifier'],
  },
  {
    version: 1,
    id: 'issue-triage',
    goal: 'Discover, deduplicate, prioritize and label incoming issues/discussions so the team always has a clean actionable queue. Excellent low-risk companion to Daily Triage.',
    trigger: [{ kind: 'schedule' }, { kind: 'event' }],
    risk: 'low',
    recommendedWorkflow: 'default',
    recommendedSkills: ['issue-triage', 'loop-verifier'],
  },
] as const satisfies readonly AutomationPolicyTemplate[]

const TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  'version',
  'id',
  'goal',
  'trigger',
  'risk',
  'recommendedWorkflow',
  'recommendedSkills',
])
const OVERRIDE_KEYS: ReadonlySet<string> = new Set([
  'goal',
  'trigger',
  'risk',
  'recommendedWorkflow',
  'recommendedSkills',
])
const TEMPLATE_ID_SET: ReadonlySet<string> = new Set(AUTOMATION_POLICY_TEMPLATE_IDS)
const TRIGGER_KEYS: ReadonlySet<string> = new Set(['kind'])
const TRIGGER_KINDS: ReadonlySet<string> = new Set(['schedule', 'event', 'manual'])
const NO_KEYS: ReadonlySet<string> = new Set()

function asRecord(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error(`AutomationPolicyTemplate: ${path} must be an object`)
  }
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`AutomationPolicyTemplate: ${path} must use Object.prototype or a null prototype`)
  }
  return input as Record<string, unknown>
}

function ownDataValue(object: object, key: PropertyKey, path: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new Error(`AutomationPolicyTemplate: ${path} must be an own data property`)
  }
  return descriptor.value
}

function snapshotRecord(
  input: unknown,
  allowed: ReadonlySet<string>,
  required: ReadonlySet<string>,
  path: string,
): ReadonlyMap<string, unknown> {
  const record = asRecord(input, path)
  const snapshot = new Map<string, unknown>()
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new Error(`AutomationPolicyTemplate: ${path} has unknown key '${String(key)}'`)
    }
    snapshot.set(key, ownDataValue(record, key, `${path}.${key}`))
  }
  for (const key of required) {
    if (!snapshot.has(key)) {
      throw new Error(`AutomationPolicyTemplate: ${path}.${key} must be an own data property`)
    }
  }
  return snapshot
}

function snapshotArray(input: unknown, path: string): unknown[] {
  if (!Array.isArray(input)) {
    throw new Error(`AutomationPolicyTemplate: ${path} must be an array`)
  }
  if (Object.getPrototypeOf(input) !== Array.prototype) {
    throw new Error(`AutomationPolicyTemplate: ${path} must use Array.prototype`)
  }
  const keys = Reflect.ownKeys(input)
  const length = ownDataValue(input, 'length', `${path}.length`)
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) {
    throw new Error(`AutomationPolicyTemplate: ${path}.length must be a non-negative integer`)
  }
  for (const key of keys) {
    if (key === 'length') continue
    if (typeof key !== 'string') {
      throw new Error(`AutomationPolicyTemplate: ${path} has unknown key '${String(key)}'`)
    }
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) {
      throw new Error(`AutomationPolicyTemplate: ${path} has unknown key '${key}'`)
    }
  }
  const snapshot = new Array<unknown>(length)
  for (let index = 0; index < length; index += 1) {
    snapshot[index] = ownDataValue(input, String(index), `${path}[${index}]`)
  }
  return snapshot
}

function assertTemplateId(id: unknown): asserts id is AutomationPolicyTemplateId {
  if (typeof id !== 'string' || !TEMPLATE_ID_SET.has(id)) {
    throw new Error(
      `AutomationPolicyTemplate: unknown id '${String(id)}' (known: ${AUTOMATION_POLICY_TEMPLATE_IDS.join(', ')})`,
    )
  }
}

function validateTrigger(input: unknown): AutomationPolicyTrigger[] {
  const items = snapshotArray(input, 'trigger')
  if (items.length === 0) {
    throw new Error('AutomationPolicyTemplate: trigger must not be empty')
  }
  return items.map((item, index) => {
    const path = `trigger[${index}]`
    const record = snapshotRecord(item, TRIGGER_KEYS, TRIGGER_KEYS, path)
    const kind = record.get('kind')
    if (typeof kind !== 'string' || !TRIGGER_KINDS.has(kind)) {
      throw new Error(
        `AutomationPolicyTemplate: ${path}.kind '${String(kind)}' is not schedule, event, or manual`,
      )
    }
    return { kind } as AutomationPolicyTrigger
  })
}

function nonemptyString(input: unknown, path: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error(`AutomationPolicyTemplate: ${path} must be a non-empty string`)
  }
  return input
}

function validateRisk(input: unknown): AutomationPolicyRisk {
  if (input !== 'low' && input !== 'medium' && input !== 'high') {
    throw new Error(`AutomationPolicyTemplate: risk '${String(input)}' is not low, medium, or high`)
  }
  return input
}

function validateRecommendedSkills(input: unknown): string[] {
  return snapshotArray(input, 'recommendedSkills').map((skill, index) =>
    nonemptyString(skill, `recommendedSkills[${index}]`),
  )
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

function cloneTemplate(template: AutomationPolicyTemplate): AutomationPolicyTemplate {
  return deepFreeze({
    ...template,
    trigger: template.trigger.map((item) => ({ ...item })),
    recommendedSkills: [...template.recommendedSkills],
  })
}

function assertVersion(version: unknown): asserts version is AutomationPolicyTemplateVersion {
  if (version !== AUTOMATION_POLICY_TEMPLATE_VERSION) {
    throw new Error(
      `AutomationPolicyTemplate: unknown version ${String(version)} (supported: ${AUTOMATION_POLICY_TEMPLATE_VERSION})`,
    )
  }
}

export function listAutomationPolicyTemplates(
  version: unknown = AUTOMATION_POLICY_TEMPLATE_VERSION,
): readonly AutomationPolicyTemplate[] {
  assertVersion(version)
  return deepFreeze(SOURCE_TEMPLATES.map(cloneTemplate))
}

export function getAutomationPolicyTemplate(
  id: string,
  version: unknown = AUTOMATION_POLICY_TEMPLATE_VERSION,
): AutomationPolicyTemplate {
  assertVersion(version)
  const template = SOURCE_TEMPLATES.find((candidate) => candidate.id === id)
  if (template === undefined) {
    throw new Error(
      `AutomationPolicyTemplate: unknown id '${id}' (known: ${AUTOMATION_POLICY_TEMPLATE_IDS.join(', ')})`,
    )
  }
  return cloneTemplate(template)
}

export function validateAutomationPolicyTemplate(input: unknown): AutomationPolicyTemplate {
  const record = snapshotRecord(input, TEMPLATE_KEYS, TEMPLATE_KEYS, 'template')
  const version = record.get('version')
  assertVersion(version)
  const id = record.get('id')
  assertTemplateId(id)
  const goal = nonemptyString(record.get('goal'), 'goal')
  const trigger = validateTrigger(record.get('trigger'))
  const risk = validateRisk(record.get('risk'))
  const recommendedWorkflow = record.get('recommendedWorkflow')
  if (recommendedWorkflow !== 'default') {
    throw new Error(
      `AutomationPolicyTemplate: recommendedWorkflow '${String(recommendedWorkflow)}' is not default`,
    )
  }
  const recommendedSkills = validateRecommendedSkills(record.get('recommendedSkills'))
  return cloneTemplate({
    version: AUTOMATION_POLICY_TEMPLATE_VERSION,
    id,
    goal,
    trigger,
    risk,
    recommendedWorkflow: 'default',
    recommendedSkills,
  })
}

export function compileAutomationPolicyTemplate(
  id: string,
  override: unknown = {},
  version: unknown = AUTOMATION_POLICY_TEMPLATE_VERSION,
): AutomationPolicyTemplate {
  const base = getAutomationPolicyTemplate(id, version)
  const record = snapshotRecord(override, OVERRIDE_KEYS, NO_KEYS, 'override')
  const owns = (key: keyof AutomationPolicyTemplateOverride): boolean => record.has(key)

  return validateAutomationPolicyTemplate({
    version: base.version,
    id: base.id,
    goal: owns('goal') ? record.get('goal') : base.goal,
    trigger: owns('trigger') ? record.get('trigger') : base.trigger,
    risk: owns('risk') ? record.get('risk') : base.risk,
    recommendedWorkflow: owns('recommendedWorkflow')
      ? record.get('recommendedWorkflow')
      : base.recommendedWorkflow,
    recommendedSkills: owns('recommendedSkills') ? record.get('recommendedSkills') : base.recommendedSkills,
  })
}
