/** Versioned automation policy snapshot and its single typed constraint evaluator (GOAL H4-H8). */
import { sha256Hex } from '../sha256.js'
import type { BudgetExceedAction } from './ledger-types.js'
import type { LoopEntry } from './types.js'

export interface ConstraintPolicy {
  readonly schema_version: 1
  readonly admission: { readonly require_active: true }
  readonly write: { readonly allowlist: readonly string[]; readonly denylist: readonly string[] }
  readonly transition: { readonly require_active: true; readonly human_gates: readonly string[] }
  readonly merge: {
    readonly require_active: true
    readonly allowlist: readonly string[]
    readonly denylist: readonly string[]
  }
}

export interface AutomationPolicySnapshot {
  readonly schema_version: 1
  readonly policy_id: string
  readonly policy_version: string
  readonly loop_id: string
  readonly goal: string
  readonly constraints: ConstraintPolicy
  readonly budget: {
    readonly max_runs_per_day: number
    readonly max_in_flight: number
    readonly max_tokens_per_day?: number
    readonly tokens_per_run?: number
    readonly on_exceed: BudgetExceedAction
  }
  readonly kill_policy: {
    readonly required_status: 'active'
    readonly on_inactive: 'skip-run'
    readonly recheck: readonly ['schedule', 'pre-claim', 'transition', 'settlement']
  }
  readonly verifier_binding: {
    readonly kind: 'runtime-verifier'
    readonly verifier: 'pipeline-git-integrity'
    readonly version: '1'
  }
  readonly skill_bundle_id: string
  readonly captured_at: string
}

export type ConstraintOperation = 'admission' | 'write' | 'transition' | 'merge'

export interface ConstraintEvaluationInput {
  readonly operation: ConstraintOperation
  readonly active: boolean
  readonly paths?: readonly string[]
  readonly humanGateSatisfied?: boolean
  /** Planned destination; human gates only apply when this destination is named. */
  readonly transitionTarget?: string
  readonly matches: (path: string, pattern: string) => boolean
}

export type ConstraintDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly reason: 'loop-inactive' | 'path-denied' | 'path-outside-allowlist' | 'human-gate-required'
      readonly paths?: readonly string[]
    }

export type ConstraintPathExplanation =
  | {
      readonly path: string
      readonly verdict: 'allowed'
      readonly reason: 'allowlist'
      readonly matched_pattern: string
    }
  | {
      readonly path: string
      readonly verdict: 'blocked'
      readonly reason: 'path-denied'
      readonly matched_pattern: string
    }
  | {
      readonly path: string
      readonly verdict: 'blocked'
      readonly reason: 'path-outside-allowlist'
      readonly matched_pattern: null
    }

const EXCEED_ACTIONS = new Set<BudgetExceedAction>(['skip-run', 'pause-loop', 'halt-round'])
const LEGACY_EXCEED_ACTIONS: Readonly<Record<string, BudgetExceedAction>> = {
  skip: 'skip-run', pause: 'pause-loop', halt: 'halt-round',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function closed(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}: unknown key '${key}'`)
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key}: missing`)
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${path}: expected non-empty string`)
  return value
}

function numberAt(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${path}: expected non-negative safe integer`)
  return value as number
}

function stringsAt(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error(`${path}: expected string[]`)
  return [...value]
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}

const policyPayload = (loop: LoopEntry): Omit<AutomationPolicySnapshot, 'policy_version' | 'captured_at'> => {
  const onExceed = EXCEED_ACTIONS.has(loop.budget.on_exceed as BudgetExceedAction)
    ? loop.budget.on_exceed as BudgetExceedAction
    : LEGACY_EXCEED_ACTIONS[loop.budget.on_exceed]
  if (onExceed === undefined) {
    throw new Error(`AutomationPolicy: budget.on_exceed '${loop.budget.on_exceed}' is not a typed action`)
  }
  if (loop.skill_bundle_id === undefined || loop.skill_bundle_id === null || loop.skill_bundle_id === '') {
    throw new Error(`AutomationPolicy: loop '${loop.id}' has no skill_bundle_id`)
  }
  return {
    schema_version: 1,
    policy_id: loop.id,
    loop_id: loop.id,
    goal: loop.goal,
    constraints: compileConstraintPolicy(loop),
    budget: {
      max_runs_per_day: loop.budget.max_runs_per_day,
      max_in_flight: loop.budget.max_in_flight,
      ...(loop.budget.max_tokens_per_day === undefined ? {} : { max_tokens_per_day: loop.budget.max_tokens_per_day }),
      ...(loop.budget.tokens_per_run === undefined ? {} : { tokens_per_run: loop.budget.tokens_per_run }),
      on_exceed: onExceed,
    },
    kill_policy: {
      required_status: 'active',
      on_inactive: 'skip-run',
      recheck: ['schedule', 'pre-claim', 'transition', 'settlement'],
    },
    verifier_binding: { kind: 'runtime-verifier', verifier: 'pipeline-git-integrity', version: '1' },
    skill_bundle_id: loop.skill_bundle_id,
  }
}

/** Compile the constraint slice independently so admission can enforce status before bundle wiring exists. */
export function compileConstraintPolicy(loop: LoopEntry): ConstraintPolicy {
  return deepFreeze({
    schema_version: 1,
    admission: { require_active: true },
    write: { allowlist: [...loop.allowlist], denylist: [...loop.denylist] },
    transition: { require_active: true, human_gates: [...loop.human_gates] },
    merge: { require_active: true, allowlist: [...loop.allowlist], denylist: [...loop.denylist] },
  })
}

/** Compile one immutable policy whose version is the SHA-256 of all enforcement-relevant content. */
export function compileAutomationPolicySnapshot(
  loop: LoopEntry,
  options: { readonly capturedAt: string },
): AutomationPolicySnapshot {
  const payload = policyPayload(loop)
  const policy_version = sha256Hex(JSON.stringify(payload))
  return deepFreeze({ ...payload, policy_version, captured_at: options.capturedAt })
}

/** Validate an untrusted persisted snapshot, recompute its content version, and return a frozen copy. */
export function validateAutomationPolicySnapshot(input: unknown): AutomationPolicySnapshot {
  if (!isRecord(input)) throw new Error('AutomationPolicy: expected object')
  closed(input, [
    'schema_version', 'policy_id', 'policy_version', 'loop_id', 'goal', 'constraints', 'budget',
    'kill_policy', 'verifier_binding', 'skill_bundle_id', 'captured_at',
  ], 'AutomationPolicy')
  if (input.schema_version !== 1) throw new Error('AutomationPolicy.schema_version: expected 1')

  if (!isRecord(input.constraints)) throw new Error('AutomationPolicy.constraints: expected object')
  closed(input.constraints, ['schema_version', 'admission', 'write', 'transition', 'merge'], 'AutomationPolicy.constraints')
  if (input.constraints.schema_version !== 1) throw new Error('AutomationPolicy.constraints.schema_version: expected 1')
  const admission = input.constraints.admission
  const write = input.constraints.write
  const transition = input.constraints.transition
  const merge = input.constraints.merge
  if (!isRecord(admission) || !isRecord(write) || !isRecord(transition) || !isRecord(merge)) {
    throw new Error('AutomationPolicy.constraints: invalid operation policy')
  }
  closed(admission, ['require_active'], 'AutomationPolicy.constraints.admission')
  closed(write, ['allowlist', 'denylist'], 'AutomationPolicy.constraints.write')
  closed(transition, ['require_active', 'human_gates'], 'AutomationPolicy.constraints.transition')
  closed(merge, ['require_active', 'allowlist', 'denylist'], 'AutomationPolicy.constraints.merge')
  if (admission.require_active !== true || transition.require_active !== true || merge.require_active !== true) {
    throw new Error('AutomationPolicy.constraints: require_active must be true')
  }

  if (!isRecord(input.budget)) throw new Error('AutomationPolicy.budget: expected object')
  const budgetKeys = ['max_runs_per_day', 'max_in_flight', 'on_exceed']
  const budgetOptional = ['max_tokens_per_day', 'tokens_per_run']
  for (const key of Object.keys(input.budget)) {
    if (![...budgetKeys, ...budgetOptional].includes(key)) throw new Error(`AutomationPolicy.budget: unknown key '${key}'`)
  }
  for (const key of budgetKeys) if (!Object.hasOwn(input.budget, key)) throw new Error(`AutomationPolicy.budget.${key}: missing`)
  const onExceed = input.budget.on_exceed
  if (typeof onExceed !== 'string' || !EXCEED_ACTIONS.has(onExceed as BudgetExceedAction)) {
    throw new Error('AutomationPolicy.budget.on_exceed: invalid typed action')
  }

  if (!isRecord(input.kill_policy)) throw new Error('AutomationPolicy.kill_policy: expected object')
  closed(input.kill_policy, ['required_status', 'on_inactive', 'recheck'], 'AutomationPolicy.kill_policy')
  if (input.kill_policy.required_status !== 'active' || input.kill_policy.on_inactive !== 'skip-run'
    || JSON.stringify(input.kill_policy.recheck) !== JSON.stringify(['schedule', 'pre-claim', 'transition', 'settlement'])) {
    throw new Error('AutomationPolicy.kill_policy: invalid')
  }
  if (!isRecord(input.verifier_binding)) throw new Error('AutomationPolicy.verifier_binding: expected object')
  closed(input.verifier_binding, ['kind', 'verifier', 'version'], 'AutomationPolicy.verifier_binding')
  if (input.verifier_binding.kind !== 'runtime-verifier' || input.verifier_binding.verifier !== 'pipeline-git-integrity'
    || input.verifier_binding.version !== '1') throw new Error('AutomationPolicy.verifier_binding: invalid')

  const payload: Omit<AutomationPolicySnapshot, 'policy_version' | 'captured_at'> = {
    schema_version: 1,
    policy_id: stringAt(input.policy_id, 'AutomationPolicy.policy_id'),
    loop_id: stringAt(input.loop_id, 'AutomationPolicy.loop_id'),
    goal: stringAt(input.goal, 'AutomationPolicy.goal'),
    constraints: {
      schema_version: 1,
      admission: { require_active: true },
      write: {
        allowlist: stringsAt(write.allowlist, 'AutomationPolicy.constraints.write.allowlist'),
        denylist: stringsAt(write.denylist, 'AutomationPolicy.constraints.write.denylist'),
      },
      transition: {
        require_active: true,
        human_gates: stringsAt(transition.human_gates, 'AutomationPolicy.constraints.transition.human_gates'),
      },
      merge: {
        require_active: true,
        allowlist: stringsAt(merge.allowlist, 'AutomationPolicy.constraints.merge.allowlist'),
        denylist: stringsAt(merge.denylist, 'AutomationPolicy.constraints.merge.denylist'),
      },
    },
    budget: {
      max_runs_per_day: numberAt(input.budget.max_runs_per_day, 'AutomationPolicy.budget.max_runs_per_day'),
      max_in_flight: numberAt(input.budget.max_in_flight, 'AutomationPolicy.budget.max_in_flight'),
      ...(input.budget.max_tokens_per_day === undefined ? {} : {
        max_tokens_per_day: numberAt(input.budget.max_tokens_per_day, 'AutomationPolicy.budget.max_tokens_per_day'),
      }),
      ...(input.budget.tokens_per_run === undefined ? {} : {
        tokens_per_run: numberAt(input.budget.tokens_per_run, 'AutomationPolicy.budget.tokens_per_run'),
      }),
      on_exceed: onExceed as BudgetExceedAction,
    },
    kill_policy: {
      required_status: 'active', on_inactive: 'skip-run',
      recheck: ['schedule', 'pre-claim', 'transition', 'settlement'],
    },
    verifier_binding: { kind: 'runtime-verifier', verifier: 'pipeline-git-integrity', version: '1' },
    skill_bundle_id: stringAt(input.skill_bundle_id, 'AutomationPolicy.skill_bundle_id'),
  }
  const expectedVersion = sha256Hex(JSON.stringify(payload))
  if (input.policy_version !== expectedVersion) throw new Error('AutomationPolicy.policy_version: content digest mismatch')
  const capturedAt = stringAt(input.captured_at, 'AutomationPolicy.captured_at')
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('AutomationPolicy.captured_at: invalid timestamp')
  return deepFreeze({ ...payload, policy_version: expectedVersion, captured_at: capturedAt })
}

/** Explain every path without changing the aggregate gate's global deny-first behavior. */
export function explainConstraintPaths(
  policy: ConstraintPolicy,
  operation: 'write' | 'merge',
  paths: readonly string[],
  matches: (path: string, pattern: string) => boolean,
): readonly ConstraintPathExplanation[] {
  const { allowlist, denylist } = policy[operation]
  return paths.map((path) => {
    const deniedBy = denylist.find((pattern) => matches(path, pattern))
    if (deniedBy !== undefined) {
      return { path, verdict: 'blocked', reason: 'path-denied', matched_pattern: deniedBy }
    }
    const allowedBy = allowlist.find((pattern) => matches(path, pattern))
    return allowedBy === undefined
      ? { path, verdict: 'blocked', reason: 'path-outside-allowlist', matched_pattern: null }
      : { path, verdict: 'allowed', reason: 'allowlist', matched_pattern: allowedBy }
  })
}

function pathDecision(policy: ConstraintPolicy, operation: 'write' | 'merge', input: ConstraintEvaluationInput): ConstraintDecision {
  const explanations = explainConstraintPaths(policy, operation, input.paths ?? [], input.matches)
  const denied = explanations
    .filter((item) => item.reason === 'path-denied')
    .map((item) => item.path)
  if (denied.length > 0) return { allowed: false, reason: 'path-denied', paths: denied }
  const outside = explanations
    .filter((item) => item.reason === 'path-outside-allowlist')
    .map((item) => item.path)
  if (outside.length > 0) return { allowed: false, reason: 'path-outside-allowlist', paths: outside }
  return { allowed: true }
}

/** The shared decision table used by admission, write authorization, transition, and merge. */
export function evaluateConstraintPolicy(
  policy: ConstraintPolicy,
  input: ConstraintEvaluationInput,
): ConstraintDecision {
  if (!input.active) return { allowed: false, reason: 'loop-inactive' }
  if (input.operation === 'admission') return { allowed: true }
  if (input.operation === 'transition') {
    const humanGateApplies = input.transitionTarget === undefined
      ? policy.transition.human_gates.length > 0
      : policy.transition.human_gates.includes(input.transitionTarget)
    return humanGateApplies && input.humanGateSatisfied !== true
      ? { allowed: false, reason: 'human-gate-required' }
      : { allowed: true }
  }
  return input.operation === 'write'
    ? pathDecision(policy, 'write', input)
    : pathDecision(policy, 'merge', input)
}
