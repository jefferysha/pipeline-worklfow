import type { EffectiveWorkflowPlan, PipelineState } from '@tenon/kernel'
import type { CliDeps } from '../deps.js'

const REVIEW_CANDIDATE = /^(?:sha256:|workspace:sha256:)[0-9a-f]{64}$|^git:[0-9a-f]{40}(?:[0-9a-f]{24})?$/

function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value.join(',')
  return null
}

/** Resolve the candidate from a frozen step input; arbitrary review workflows fall back to the
 * current content-addressed workspace only when they declare no candidate-shaped input. */
export async function frozenReviewCandidate(
  deps: CliDeps,
  change: string,
  state: PipelineState,
  plan: EffectiveWorkflowPlan,
  scope: string,
): Promise<string> {
  const step = plan.workflow.steps.find((entry) => entry.id === scope)
  if (step === undefined) throw new Error(`当前 Review step '${scope}' 不在 frozen workflow 中`)
  const declared = [...new Set(step.inputs.flatMap((input) => {
    const value = scalar(Reflect.get(state.fields, input.field))
    return value !== null && REVIEW_CANDIDATE.test(value) ? [value] : []
  }))]
  if (declared.length > 1) throw new Error(`Review step '${scope}' 存在多个 candidate-shaped frozen input`)
  if (declared[0] !== undefined) return declared[0]
  if (deps.workspaceFingerprint === undefined) {
    throw new Error(`Review step '${scope}' 未声明 candidate input，且缺少 workspace fingerprint capability`)
  }
  const current = (await deps.workspaceFingerprint(change)).trim()
  if (!REVIEW_CANDIDATE.test(current)) throw new Error('workspace fingerprint capability 返回非法 candidate')
  return current
}
