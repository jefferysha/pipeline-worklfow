import type { TrackDefinition } from '../tracks/types.js'
import type { DocumentGovernancePolicy } from './document-contract.js'
import { documentGovernancePolicy } from './document-contract.js'
import type {
  EffectiveWorkflowPlan,
} from './effective-plan.js'
import type {
  LegacyWorkflowIR,
  WorkflowPlanSnapshotV1,
  WorkflowPlanSnapshotV2,
  WorkflowPlanSnapshotV3,
} from './workflow-plan-snapshot-types.js'
import type { WorkflowIR } from './ir.js'
import { preTenonV1DocumentPolicy } from './migrations/pre-tenon-v1-document-policy.js'
import {
  compileWorkflowDecompositionPolicy,
  compileWorkflowInteractionPolicy,
} from './policy.js'
import { sha256Hex } from '../sha256.js'

type Fail = (message: string) => never
type PlanBuilder = (
  workflow: WorkflowIR,
  documentPolicy: DocumentGovernancePolicy | null,
  workflowFingerprint: string,
  track?: TrackDefinition,
) => EffectiveWorkflowPlan

function historicalWorkflowFingerprint(
  workflowId: string,
  executionModel: EffectiveWorkflowPlan['executionModel'],
  workflow: LegacyWorkflowIR,
  documentPolicy: DocumentGovernancePolicy | undefined,
  documentFingerprint: (policy: DocumentGovernancePolicy) => string,
): string {
  const skillPolicy = executionModel === 'phase-manifest' ? 'manifest-overlay' : 'step-declared'
  const reviewSteps = workflow.steps.filter((step) => step.gate === 'review').map((step) => step.id)
  const projectionSteps = workflow.steps.map((step) => ({ id: step.id, label: step.label }))
  return sha256Hex(JSON.stringify({
    schema: 'effective-workflow-plan-v1',
    id: workflowId,
    executionModel,
    workflow,
    documentPolicy: documentPolicy === undefined
      ? null
      : { id: documentPolicy.id, fingerprint: documentFingerprint(documentPolicy) },
    skillPolicy,
    reviewSteps,
    projectionSteps,
  }))
}

export function restoreLegacyWorkflowPlan(
  snapshot: WorkflowPlanSnapshotV1 | WorkflowPlanSnapshotV2,
  track: TrackDefinition | undefined,
  documentFingerprint: (policy: DocumentGovernancePolicy) => string,
  build: PlanBuilder,
  fail: Fail,
): EffectiveWorkflowPlan {
  const legacyWorkflow = structuredClone(snapshot.workflow)
  if (Object.hasOwn(legacyWorkflow, 'decomposition') || Object.hasOwn(legacyWorkflow, 'interaction')) {
    return fail('legacy workflow plan snapshot 不得携带 V3 policy 字段')
  }
  const workflow: WorkflowIR = {
    ...legacyWorkflow,
    decomposition: compileWorkflowDecompositionPolicy(undefined),
    interaction: compileWorkflowInteractionPolicy(undefined),
  }
  let documentPolicy = snapshot.version === 2
    ? structuredClone(snapshot.documentPolicy) ?? undefined
    : documentGovernancePolicy(snapshot.workflowId, workflow)
  let historical = historicalWorkflowFingerprint(
    snapshot.workflowId,
    snapshot.executionModel,
    legacyWorkflow,
    documentPolicy,
    documentFingerprint,
  )
  if (historical !== snapshot.workflowFingerprint && snapshot.version === 1) {
    const preTenonPolicy = preTenonV1DocumentPolicy(snapshot.workflowId, snapshot.workflowFingerprint)
    if (preTenonPolicy !== undefined) {
      documentPolicy = preTenonPolicy
      historical = historicalWorkflowFingerprint(
        snapshot.workflowId,
        snapshot.executionModel,
        legacyWorkflow,
        documentPolicy,
        documentFingerprint,
      )
    }
  }
  if (historical !== snapshot.workflowFingerprint) {
    return fail(
      `workflow plan snapshot 内容与 fingerprint 不一致`
      + `（expected=${snapshot.workflowFingerprint}, historical=${historical}）`,
    )
  }
  return build(workflow, documentPolicy ?? null, snapshot.workflowFingerprint, track)
}

function exactPolicyShape(value: unknown, normalized: object, keys: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length
    && keys.every((key) => Object.hasOwn(value, key))
    && JSON.stringify(normalized) === JSON.stringify(Object.fromEntries(
      keys.map((key) => [key, Reflect.get(value, key)]),
    ))
}

export function validateV3WorkflowPolicies(snapshot: WorkflowPlanSnapshotV3, fail: Fail): void {
  let decomposition
  let interaction
  let workflowDecomposition
  let workflowInteraction
  try {
    decomposition = compileWorkflowDecompositionPolicy(snapshot.decomposition)
    interaction = compileWorkflowInteractionPolicy(snapshot.interaction)
    workflowDecomposition = compileWorkflowDecompositionPolicy(snapshot.workflow.decomposition)
    workflowInteraction = compileWorkflowInteractionPolicy(snapshot.workflow.interaction)
  } catch (error) {
    return fail(`workflow plan snapshot frozen policy 无效：${error instanceof Error ? error.message : String(error)}`)
  }
  const decompositionKeys = [
    'version', 'mode', 'target', 'strategy', 'max_items', 'max_depth', 'auto_when', 'ask_when',
  ]
  if (!exactPolicyShape(snapshot.decomposition, decomposition, decompositionKeys)
    || !exactPolicyShape(snapshot.interaction, interaction, ['version', 'mode'])
    || !exactPolicyShape(snapshot.workflow.decomposition, workflowDecomposition, decompositionKeys)
    || !exactPolicyShape(snapshot.workflow.interaction, workflowInteraction, ['version', 'mode'])
    || JSON.stringify(decomposition) !== JSON.stringify(workflowDecomposition)
    || JSON.stringify(interaction) !== JSON.stringify(workflowInteraction)) {
    fail('workflow plan snapshot frozen policy 形状或绑定非法')
  }
}
