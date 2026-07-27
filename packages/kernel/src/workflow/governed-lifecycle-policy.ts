import { DEFAULT_EVENT_POLICY } from '../flow/default-event-policy.js'
import type { ActionConfig, CompiledGuardConfig } from './ir.js'

export interface GovernedLifecyclePolicy {
  readonly guards: readonly CompiledGuardConfig[]
  readonly actions: readonly ActionConfig[]
}

/** Canonical lifecycle invariants inherited by document-governed custom workflows. */
export function governedLifecyclePolicy(
  governed: boolean,
  from: string,
  to: string,
): GovernedLifecyclePolicy | undefined {
  if (!governed) return undefined
  if (from === 'spec' && to === 'build') return DEFAULT_EVENT_POLICY['spec-complete']
  if (from === 'build' && to === 'spec') return DEFAULT_EVENT_POLICY['requirements-changed']
  if (from === 'build' && to === 'verify') return DEFAULT_EVENT_POLICY['build-complete']
  if (from === 'verify' && to === 'ship') return DEFAULT_EVENT_POLICY['verify-pass']
  if (from === 'verify' && to === 'build') return DEFAULT_EVENT_POLICY['verify-fail']
  if (from === 'ship' && to === 'archive') return DEFAULT_EVENT_POLICY['ship-complete']
  return undefined
}

export function mergeLifecycleGuards(
  declared: readonly CompiledGuardConfig[],
  required: readonly CompiledGuardConfig[] | undefined,
): readonly CompiledGuardConfig[] {
  if (!required || required.length === 0) return declared
  const merged = [...declared]
  for (const candidate of required) {
    if (!merged.some((guard) => JSON.stringify(guard) === JSON.stringify(candidate))) {
      merged.push(candidate)
    }
  }
  return merged
}

export function mergeLifecycleActions(
  declared: readonly ActionConfig[],
  required: readonly ActionConfig[] | undefined,
): readonly ActionConfig[] {
  if (!required || required.length === 0) return declared
  return [...declared, ...required.filter(
    (candidate) => !declared.some((action) => action.type === candidate.type),
  )]
}
