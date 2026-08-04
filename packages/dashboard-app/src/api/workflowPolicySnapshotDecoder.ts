import type {
  WorkflowDecompositionPolicySnapshot,
  WorkflowInteractionPolicySnapshot,
  WorkflowPolicyAction,
  WorkflowPolicyRulesSnapshot,
} from '../types'
import { isRecord } from './transport'

const ACTIONS = [
  'suggest-decomposition', 'materialize-work-items', 'create-child-pipeline',
  'apply-recommended-default', 'enter-afk', 'write-filesystem', 'create-branch',
  'create-pull-request', 'merge-pull-request', 'call-external-api', 'publish-external',
  'operate-production', 'incur-cost', 'access-credentials', 'perform-irreversible-action',
] as const satisfies readonly WorkflowPolicyAction[]
const AUTO = ['independent-work-items', 'cross-component-boundary', 'context-budget-risk'] as const
const ASK = ['ambiguous-requirements', 'hard-boundary', 'missing-authorization', 'limit-exceeded'] as const

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function member<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T)
}

function uniqueMembers<T extends string>(value: unknown, allowed: readonly T[]): value is T[] {
  return Array.isArray(value)
    && value.length === new Set(value).size
    && value.every((entry) => member(entry, allowed))
}

function decodeDecomposition(value: unknown): WorkflowDecompositionPolicySnapshot | null {
  if (!isRecord(value) || !exactKeys(value, [
    'version', 'mode', 'target', 'strategy', 'max_items', 'max_depth', 'auto_when', 'ask_when',
  ]) || value.version !== 'v1'
    || !member(value.mode, ['off', 'suggest', 'auto-safe', 'require-review'] as const)
    || !member(value.target, ['work-items', 'child-pipelines'] as const)
    || !member(value.strategy, ['balanced', 'breadth-first', 'depth-first'] as const)
    || !Number.isInteger(value.max_items) || (value.max_items as number) < 1 || (value.max_items as number) > 32
    || !Number.isInteger(value.max_depth) || (value.max_depth as number) < 0 || (value.max_depth as number) > 4
    || !uniqueMembers(value.auto_when, AUTO)
    || !uniqueMembers(value.ask_when, ASK)) return null
  return {
    version: 'v1', mode: value.mode, target: value.target, strategy: value.strategy,
    max_items: value.max_items as number, max_depth: value.max_depth as number,
    auto_when: [...value.auto_when], ask_when: [...value.ask_when],
  }
}

function decodeInteraction(value: unknown): WorkflowInteractionPolicySnapshot | null {
  return isRecord(value)
    && exactKeys(value, ['version', 'mode'])
    && value.version === 'v1'
    && member(value.mode, ['interactive', 'recommended-defaults', 'afk'] as const)
    ? { version: 'v1', mode: value.mode }
    : null
}

function decodeActions(value: unknown): WorkflowPolicyAction[] | null {
  return uniqueMembers(value, ACTIONS) ? [...value] : null
}

export function decodeWorkflowPolicyRules(value: unknown): WorkflowPolicyRulesSnapshot | null {
  if (!isRecord(value) || !exactKeys(value, ['schema', 'configured', 'frozen', 'effective', 'drift'])
    || value.schema !== 'workflow-policy/v1'
    || !isRecord(value.configured)
    || !isRecord(value.frozen)
    || !isRecord(value.effective)
    || !isRecord(value.drift)) return null

  let configured: WorkflowPolicyRulesSnapshot['configured']
  if (value.configured.status === 'available') {
    const decomposition = decodeDecomposition(value.configured.decomposition)
    const interaction = decodeInteraction(value.configured.interaction)
    if (!exactKeys(value.configured, [
      'status', 'workflowFingerprint', 'decomposition', 'interaction',
    ]) || typeof value.configured.workflowFingerprint !== 'string'
      || !/^[0-9a-f]{64}$/.test(value.configured.workflowFingerprint)
      || decomposition === null || interaction === null) return null
    configured = {
      status: 'available', workflowFingerprint: value.configured.workflowFingerprint,
      decomposition, interaction,
    }
  } else if ((value.configured.status === 'missing'
    || value.configured.status === 'invalid'
    || value.configured.status === 'unavailable')
    && exactKeys(value.configured, ['status'])) {
    configured = { status: value.configured.status }
  } else return null

  const frozenDecomposition = decodeDecomposition(value.frozen.decomposition)
  const frozenInteraction = decodeInteraction(value.frozen.interaction)
  const ceiling = value.frozen.workflowCeiling
  if (!exactKeys(value.frozen, [
    'workflowFingerprint', 'decomposition', 'interaction', 'workflowCeiling',
  ]) || typeof value.frozen.workflowFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.frozen.workflowFingerprint)
    || frozenDecomposition === null || frozenInteraction === null
    || !isRecord(ceiling) || !exactKeys(ceiling, ['status', 'grants']) || ceiling.status !== 'valid') return null
  const ceilingGrants = decodeActions(ceiling.grants)
  if (ceilingGrants === null) return null

  let effective: WorkflowPolicyRulesSnapshot['effective']
  if (value.effective.status === 'unavailable') {
    if (!exactKeys(value.effective, ['status', 'reason'])
      || value.effective.reason !== 'authority-input-unavailable') return null
    effective = { status: 'unavailable', reason: 'authority-input-unavailable' }
  } else if (value.effective.status === 'available') {
    const grants = decodeActions(value.effective.grants)
    if (!exactKeys(value.effective, ['status', 'grants', 'denials'])
      || grants === null || !Array.isArray(value.effective.denials)) return null
    const denials: Extract<WorkflowPolicyRulesSnapshot['effective'], { status: 'available' }>['denials'] = []
    for (const denial of value.effective.denials) {
      if (!isRecord(denial)
        || !Object.keys(denial).every((key) => ['action', 'layer', 'code', 'remediation'].includes(key))
        || !member(denial.action, ACTIONS)
        || (denial.layer !== undefined && !member(denial.layer, ['platform', 'skill', 'project', 'workflow', 'run'] as const))
        || typeof denial.code !== 'string' || denial.code === ''
        || typeof denial.remediation !== 'string' || denial.remediation === '') return null
      denials.push({
        action: denial.action,
        ...(denial.layer === undefined ? {} : { layer: denial.layer }),
        code: denial.code,
        remediation: denial.remediation,
      })
    }
    effective = { status: 'available', grants, denials }
  } else return null

  const drift = value.drift
  if (!exactKeys(drift, ['status', 'fingerprintChanged', 'policyChanged'])
    || !member(drift.status, ['current', 'changed', 'missing', 'invalid', 'unavailable'] as const)
    || (drift.fingerprintChanged !== null && typeof drift.fingerprintChanged !== 'boolean')
    || (drift.policyChanged !== null && typeof drift.policyChanged !== 'boolean')) return null
  return {
    schema: 'workflow-policy/v1',
    configured,
    frozen: {
      workflowFingerprint: value.frozen.workflowFingerprint,
      decomposition: frozenDecomposition,
      interaction: frozenInteraction,
      workflowCeiling: { status: 'valid', grants: ceilingGrants },
    },
    effective,
    drift: {
      status: drift.status,
      fingerprintChanged: drift.fingerprintChanged,
      policyChanged: drift.policyChanged,
    },
  }
}
