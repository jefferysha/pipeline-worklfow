import { DEFAULT_EVENT_POLICY } from '../flow/default-event-policy.js'
import type { ActionConfig, CompiledGuardConfig, StepIR, StepTransitionIR } from './ir.js'

export interface GovernedLifecyclePolicy {
  readonly guards: readonly CompiledGuardConfig[]
  readonly actions: readonly ActionConfig[]
}

/**
 * The lifecycle policy that applies to one compiled edge.
 *
 * A custom workflow can express the same lifecycle in four places: the source step,
 * the selected edge, the document-governed fixed policy and the field-semantic policy.
 * Consumers must use this fully merged view rather than rebuilding a partial list of
 * guards themselves.  In particular, a rollback edge is identified from its effective
 * actions and removes only the revision guard that would otherwise make recovery
 * impossible.
 */
export interface EffectiveLifecyclePolicy extends GovernedLifecyclePolicy {
  readonly rollback: boolean
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
  const merged: ActionConfig[] = []
  for (const action of [...declared, ...(required ?? [])]) {
    if (!merged.some((candidate) => JSON.stringify(candidate) === JSON.stringify(action))) {
      merged.push(action)
    }
  }
  return merged
}

function isRevisionGuard(guard: CompiledGuardConfig): boolean {
  return guard.type === 'build-head-unchanged' && guard.field === 'build_sha'
}

/**
 * Merge all lifecycle declarations for a single compiled edge.
 *
 * The returned guard order is declaration order (source step, edge, fixed policy,
 * semantic policy) and structurally equivalent entries are evaluated once.  A rollback
 * is determined exclusively by the resulting action list; no step or event id is
 * special-cased.  Only the revision guard is removed on rollback.  Other guards remain
 * in their original order so custom permissions, evidence and policy checks retain
 * their historical behaviour.
 */
export function effectiveLifecyclePolicy(
  governed: boolean,
  from: StepIR,
  edge: StepTransitionIR,
  to: StepIR | undefined,
): EffectiveLifecyclePolicy {
  const fixed = governedLifecyclePolicy(governed, from.id, edge.to)
  const semantic = semanticRevisionLifecyclePolicy(from, edge, to, fixed?.actions)
  const actions = mergeLifecycleActions(
    mergeLifecycleActions(edge.actions, fixed?.actions),
    semantic?.actions,
  )
  const rollback = actions.some((action) => action.type === 'mark-verification-failed')
  const declared = mergeLifecycleGuards(from.guards, edge.guards)
  const withFixed = mergeLifecycleGuards(declared, fixed?.guards)
  const merged = mergeLifecycleGuards(withFixed, semantic?.guards)
  const guards = rollback ? merged.filter((guard) => !isRevisionGuard(guard)) : merged
  return { guards, actions, rollback }
}

export { isRevisionGuard }

/**
 * Infer the revision lifecycle for an arbitrary custom graph from field semantics.  Fixed
 * phase names remain supported by governedLifecyclePolicy above, while this function covers
 * historical/frozen plans whose step ids are intentionally different.
 */
export function semanticRevisionLifecyclePolicy(
  from: StepIR,
  edge: StepTransitionIR,
  to: StepIR | undefined,
  inheritedActions: readonly ActionConfig[] = [],
): GovernedLifecyclePolicy | undefined {
  const outputsBuildSha = from.outputs.some((output) => output.field === 'build_sha')
  const currentStepInputsBuildSha = from.inputs.some((input) => input.field === 'build_sha')
  const targetStepInputsBuildSha = to?.inputs.some((input) => input.field === 'build_sha') ?? false
  const rollback = [...edge.actions, ...inheritedActions]
    .some((action) => action.type === 'mark-verification-failed')
  // Capture belongs to the Build -> Verify-like entry edge: the source step must declare the
  // output and the target must declare the input.  A trust guard belongs to the Verify-like
  // source step itself and therefore applies to every non-rollback exit from that step.  Keeping
  // these predicates separate prevents the first Verify edge from requiring a token before the
  // capture action has run.
  const actions: ActionConfig[] = outputsBuildSha && targetStepInputsBuildSha
    ? [{ type: 'freeze-build-sha' }]
    : []
  const guards: CompiledGuardConfig[] = currentStepInputsBuildSha && !rollback
    ? [{ type: 'build-head-unchanged', field: 'build_sha' }]
    : []
  if (actions.length === 0 && guards.length === 0) return undefined
  return { actions, guards }
}
