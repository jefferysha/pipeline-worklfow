import {
  DEFAULT_WORKFLOW_DECOMPOSITION_POLICY,
  WORKFLOW_DECOMPOSITION_ASK_CONDITIONS,
  WORKFLOW_DECOMPOSITION_AUTO_CONDITIONS,
  compileWorkflowDecompositionPolicy,
  evaluateWorkflowAction,
  type WorkflowAction,
  type WorkflowActionClassification,
  type WorkflowActionEvaluation,
  type WorkflowAuthorityBinding,
  type WorkflowHardConfirmation,
  type WorkflowPermissionDenial,
  type WorkflowPermissionLayers,
} from './policy.js'
import type {
  WorkflowDecompositionAskCondition,
  WorkflowDecompositionAutoCondition,
  WorkflowDecompositionPolicyV1,
  WorkflowInteractionMode,
} from './types.js'

export interface WorkflowDecompositionCandidate {
  readonly item_count: number
  readonly resulting_depth: number
  readonly matched_auto_when: readonly WorkflowDecompositionAutoCondition[]
  readonly triggered_ask_when: readonly WorkflowDecompositionAskCondition[]
  readonly candidate_fingerprint: string
  readonly classification: WorkflowActionClassification
}

export type WorkflowDecompositionReviewReceipt =
  | ({
      readonly status: 'approved'
      readonly event_id: string
      readonly action: WorkflowAction
      readonly candidate_fingerprint: string
    } & WorkflowAuthorityBinding)
  | { readonly status: 'missing' | 'stale' | 'identity-mismatch' }

export interface EvaluateWorkflowDecompositionMaterializationInput {
  readonly policy: WorkflowDecompositionPolicyV1
  readonly interactionMode: WorkflowInteractionMode
  readonly authority?: WorkflowAuthorityBinding
  readonly layers: Omit<WorkflowPermissionLayers, 'workflow'>
  readonly candidate: WorkflowDecompositionCandidate
  readonly hardConfirmation?: WorkflowHardConfirmation
  readonly review?: {
    readonly event_id: string
    readonly receipt?: WorkflowDecompositionReviewReceipt
  }
}

interface ExtraDenial {
  readonly denial: WorkflowPermissionDenial
  readonly hard: boolean
}

const ACTION_CLASSIFICATIONS = [
  'routine-reversible', 'safety-sensitive', 'cost', 'production', 'external-side-effect',
  'publication', 'credentials', 'irreversible', 'missing-authorization',
] as const satisfies readonly WorkflowActionClassification[]

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function closedUniqueList<T extends string>(value: unknown, allowed: readonly T[]): value is readonly T[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === 'string' && allowed.includes(item as T))
    && new Set(value).size === value.length
}

function materializationAction(policy: WorkflowDecompositionPolicyV1): WorkflowAction {
  return policy.target === 'child-pipelines' ? 'create-child-pipeline' : 'materialize-work-items'
}

function samePolicy(left: WorkflowDecompositionPolicyV1, right: WorkflowDecompositionPolicyV1): boolean {
  return left.version === right.version
    && left.mode === right.mode
    && left.target === right.target
    && left.strategy === right.strategy
    && left.max_items === right.max_items
    && left.max_depth === right.max_depth
    && left.auto_when.length === right.auto_when.length
    && left.auto_when.every((condition, index) => right.auto_when[index] === condition)
    && left.ask_when.length === right.ask_when.length
    && left.ask_when.every((condition, index) => right.ask_when[index] === condition)
}

function add(
  denials: ExtraDenial[],
  code: string,
  remediation: WorkflowPermissionDenial['remediation'],
  hard = false,
): void {
  denials.push({ denial: { code, remediation }, hard })
}

function withExtraDenials(
  base: WorkflowActionEvaluation,
  extra: readonly ExtraDenial[],
): WorkflowActionEvaluation {
  if (extra.length === 0) return base
  const hard = base.status === 'hard-blocked' || extra.some((entry) => entry.hard)
  const status = hard ? 'hard-blocked' : base.status === 'allowed' ? 'denied' : base.status
  return {
    ...base,
    allowed: false,
    status,
    denials: [...base.denials, ...extra.map((entry) => entry.denial)],
  }
}

function exactReviewReceipt(
  input: EvaluateWorkflowDecompositionMaterializationInput,
  action: WorkflowAction,
): boolean {
  const authority = input.authority
  const review = input.review
  const receipt = review?.receipt
  return receipt?.status === 'approved'
    && nonEmpty(review?.event_id)
    && nonEmpty(authority?.authority_id)
    && nonEmpty(authority.workflow_run_id)
    && digest(authority.workflow_fingerprint)
    && receipt.event_id === review?.event_id
    && receipt.authority_id === authority.authority_id
    && receipt.action === action
    && receipt.workflow_run_id === authority.workflow_run_id
    && receipt.workflow_fingerprint === authority.workflow_fingerprint
    && receipt.candidate_fingerprint === input.candidate.candidate_fingerprint
}

export function evaluateWorkflowDecompositionMaterialization(
  input: EvaluateWorkflowDecompositionMaterializationInput,
): WorkflowActionEvaluation {
  const extra: ExtraDenial[] = []
  let policy: WorkflowDecompositionPolicyV1
  try {
    policy = compileWorkflowDecompositionPolicy(input.policy)
    if (!samePolicy(policy, input.policy)) throw new Error('policy shape mismatch')
  } catch {
    policy = structuredClone(DEFAULT_WORKFLOW_DECOMPOSITION_POLICY)
    add(extra, 'decomposition-policy-malformed', 'repair-authority-binding', true)
  }
  const action = materializationAction(policy)
  const candidate = input.candidate
  const candidateValid = Number.isInteger(candidate?.item_count) && candidate.item_count >= 1
    && Number.isInteger(candidate.resulting_depth) && candidate.resulting_depth >= 0
    && digest(candidate.candidate_fingerprint)
    && closedUniqueList(candidate.matched_auto_when, WORKFLOW_DECOMPOSITION_AUTO_CONDITIONS)
    && closedUniqueList(candidate.triggered_ask_when, WORKFLOW_DECOMPOSITION_ASK_CONDITIONS)
    && ACTION_CLASSIFICATIONS.includes(candidate.classification)
  if (!candidateValid) add(extra, 'decomposition-candidate-malformed', 'revise-decomposition-candidate', true)

  const hardAsk = candidateValid && candidate.triggered_ask_when.includes('hard-boundary')
  const classification = hardAsk && candidate.classification === 'routine-reversible'
    ? 'safety-sensitive'
    : candidate.classification
  const dynamic = input.layers as Partial<WorkflowPermissionLayers>
  const workflowGrant = policy.mode === 'auto-safe' || policy.mode === 'require-review' ? [action] : []
  const base = evaluateWorkflowAction({
    action,
    classification,
    interactionMode: input.interactionMode,
    authority: input.authority,
    hardConfirmation: input.hardConfirmation,
    layers: {
      platform: dynamic.platform as WorkflowPermissionLayers['platform'],
      skill: dynamic.skill as WorkflowPermissionLayers['skill'],
      project: dynamic.project as WorkflowPermissionLayers['project'],
      workflow: { status: 'valid', grants: workflowGrant },
      run: dynamic.run as WorkflowPermissionLayers['run'],
    },
  })

  if (policy.mode === 'off') add(extra, 'decomposition-disabled', 'select-decomposition-mode')
  if (policy.mode === 'suggest') add(extra, 'decomposition-suggest-only', 'select-decomposition-mode')
  if (candidateValid && candidate.item_count > policy.max_items) {
    add(extra, 'decomposition-max-items-exceeded', 'revise-decomposition-candidate', true)
  }
  if (candidateValid && candidate.resulting_depth > policy.max_depth) {
    add(extra, 'decomposition-max-depth-exceeded', 'revise-decomposition-candidate', true)
  }
  if (candidateValid && (candidate.classification === 'missing-authorization'
    || candidate.triggered_ask_when.includes('missing-authorization'))) {
    add(extra, 'decomposition-missing-authorization', 'repair-authority-binding', true)
  }

  if (policy.mode === 'auto-safe' && candidateValid) {
    if (!candidate.matched_auto_when.some((condition) => policy.auto_when.includes(condition))) {
      add(extra, 'decomposition-auto-condition-unmatched', 'revise-decomposition-candidate')
    }
    if (candidate.triggered_ask_when.some((condition) => policy.ask_when.includes(condition))) {
      add(extra, 'decomposition-ask-condition-triggered', 'request-decomposition-review')
    }
    if (hardAsk) add(extra, 'decomposition-hard-boundary', 'request-hard-confirmation', true)
    if (candidate.classification !== 'routine-reversible') {
      add(extra, 'decomposition-auto-safe-reversible-only', 'request-hard-confirmation', true)
    }
  }

  if (policy.mode === 'require-review') {
    const receipt = input.review?.receipt
    if (receipt === undefined || receipt.status !== 'approved') {
      add(extra, 'decomposition-review-receipt-required', 'request-decomposition-review', true)
    } else if (!exactReviewReceipt(input, action)) {
      add(extra, 'decomposition-review-receipt-mismatch', 'request-decomposition-review', true)
    }
  }
  return withExtraDenials(base, extra)
}
