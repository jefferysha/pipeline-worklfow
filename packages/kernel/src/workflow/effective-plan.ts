import { DEFAULT_WORKFLOW_SOURCE } from './default-workflow.generated.js'
import { sha256Hex } from '../sha256.js'
import type { DocumentProfileId } from '../types.js'
import type { CoverageProfile, TrackDefinition } from '../tracks/types.js'
import { builtinWorkflow } from './builtin-workflows.js'
import { compileDefaultWorkflow, compileWorkflow } from './compile.js'
import { documentGovernancePolicy, type DocumentGovernancePolicy } from './document-contract.js'
import { loadWorkflow } from './loadWorkflow.js'
import type { WorkflowIR } from './ir.js'
import { parseWorkflow } from './parse.js'
import type { WorkflowDef } from './types.js'
import { validateWorkflow } from './validate.js'

export interface EffectiveWorkflowPlan {
  readonly id: string
  /** Transition/check execution capability; consumers never infer this from the workflow id. */
  readonly executionModel: 'phase-manifest' | 'step-graph'
  readonly workflow: WorkflowIR
  readonly documentPolicy?: DocumentGovernancePolicy
  readonly skillPolicy: 'manifest-overlay' | 'step-declared'
  readonly reviewSteps: readonly string[]
  /** Stable identity of workflow-owned behavior; Track overlay is intentionally a runtime overlay. */
  readonly workflowFingerprint: string
  readonly capabilities: {
    readonly execution: {
      readonly model: EffectiveWorkflowPlan['executionModel']
    }
    readonly skills: {
      readonly source: EffectiveWorkflowPlan['skillPolicy']
      readonly steps: readonly {
        readonly stepId: string
        readonly requiredSkillIds: readonly string[]
        readonly declared: readonly {
          readonly id: string
          readonly dependsOn: readonly string[]
        }[]
      }[]
      readonly trackOverlay: {
        readonly matrix: boolean
        readonly profile: string
      }
    }
    readonly documents: {
      readonly governed: boolean
      readonly profile?: DocumentProfileId
      readonly policy?: DocumentGovernancePolicy
    }
    readonly review: {
      readonly steps: readonly string[]
    }
    readonly automation: {
      readonly eligible: boolean
      readonly autoEnqueueOnSpecComplete: boolean
    }
    readonly track: {
      readonly id: string | null
      readonly coverageProfile: CoverageProfile
      readonly routingEnabled: boolean
    }
  }
  readonly projection: {
    readonly steps: readonly { readonly id: string; readonly label: string }[]
    readonly stepLabelSource: 'localized-builtin' | 'workflow-defined'
  }
}

/**
 * Immutable, data-only execution snapshot bound to one WorkflowRun.
 *
 * A fingerprint alone detects drift but cannot keep an in-flight run executable after a plugin
 * upgrade. Persisting the compiled IR lets old runs continue with their original semantics while
 * newly initialized runs adopt the new workflow definition.
 */
export interface WorkflowPlanSnapshot {
  readonly version: 1
  readonly workflowId: string
  readonly executionModel: EffectiveWorkflowPlan['executionModel']
  readonly workflow: WorkflowIR
  readonly workflowFingerprint: string
}

export interface PersistedDocumentGovernanceBinding {
  readonly documentProfile?: DocumentProfileId
  readonly documentGovernanceFingerprint?: string
  readonly workflowPlanFingerprint?: string
}

export class DocumentGovernanceBindingError extends Error {
  readonly _tag = 'DocumentGovernanceBindingError'
}

function profileFor(policy: DocumentGovernancePolicy | undefined): DocumentProfileId | undefined {
  if (policy?.id === 'openspec-v1') return 'legacy-full'
  if (policy?.id === 'document-v1') return 'document-v1'
  return undefined
}

function canonicalRequirement(requirement: {
  readonly kind: string
  readonly producerCandidates: readonly string[]
}): { readonly kind: string; readonly producerCandidates: readonly string[] } {
  return {
    kind: requirement.kind,
    producerCandidates: [...new Set(requirement.producerCandidates)].sort(),
  }
}

/** Stable content identity for the complete policy enforced by ledger admission and reads. */
export function documentGovernanceFingerprint(policy: DocumentGovernancePolicy): string {
  const canonical = {
    id: policy.id,
    steps: [...policy.steps],
    outputsByStep: Object.fromEntries(policy.steps.map((step) => [
      step,
      [...(policy.outputsByStep[step] ?? [])]
        .map(canonicalRequirement)
        .sort((left, right) => left.kind.localeCompare(right.kind)),
    ])),
    mutableByStep: Object.fromEntries(policy.steps.map((step) => [
      step,
      [...(policy.mutableByStep[step] ?? [])]
        .map(canonicalRequirement)
        .sort((left, right) => left.kind.localeCompare(right.kind)),
    ])),
    readsByStep: Object.fromEntries(policy.steps.map((step) => [
      step,
      [...new Set(policy.readsByStep[step] ?? [])].sort(),
    ])),
  }
  return sha256Hex(JSON.stringify(canonical))
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function assertValid(definition: WorkflowDef, origin: 'custom' | 'default'): void {
  const errors = validateWorkflow(definition, { origin })
  if (errors.length > 0) throw new Error(`effective workflow 无效：\n${errors.map((error) => `  - ${error}`).join('\n')}`)
}

function planFromIr(
  id: string,
  executionModel: EffectiveWorkflowPlan['executionModel'],
  workflow: WorkflowIR,
  track?: TrackDefinition,
): EffectiveWorkflowPlan {
  const documentPolicy = documentGovernancePolicy(id, workflow)
  const skillPolicy = executionModel === 'phase-manifest' ? 'manifest-overlay' : 'step-declared'
  const reviewSteps = workflow.steps.filter((step) => step.gate === 'review').map((step) => step.id)
  const projectionSteps = workflow.steps.map((step) => ({ id: step.id, label: step.label }))
  const stepLabelSource = executionModel === 'phase-manifest' ? 'localized-builtin' : 'workflow-defined'
  const workflowFingerprint = sha256Hex(JSON.stringify({
    schema: 'effective-workflow-plan-v1',
    id,
    executionModel,
    workflow,
    documentPolicy: documentPolicy === undefined
      ? null
      : {
          id: documentPolicy.id,
          fingerprint: documentGovernanceFingerprint(documentPolicy),
        },
    skillPolicy,
    reviewSteps,
    projectionSteps,
  }))
  const trackPolicy = track?.policyProfile
  const documentProfile = profileFor(documentPolicy)
  return freeze({
    id,
    executionModel,
    workflow,
    ...(documentPolicy === undefined ? {} : { documentPolicy }),
    skillPolicy,
    reviewSteps,
    workflowFingerprint,
    capabilities: {
      execution: { model: executionModel },
      skills: {
        source: skillPolicy,
        steps: workflow.steps.map((step) => ({
          stepId: step.id,
          requiredSkillIds: step.skills.map((skill) => skill.id),
          declared: step.skills.map((skill) => ({
            id: skill.id,
            dependsOn: skill.depends_on ?? [],
          })),
        })),
        trackOverlay: {
          matrix: trackPolicy?.skills.matrix ?? false,
          profile: trackPolicy?.skills.profile ?? '_all',
        },
      },
      documents: {
        governed: documentPolicy !== undefined,
        ...(documentProfile === undefined ? {} : { profile: documentProfile }),
        ...(documentPolicy === undefined ? {} : { policy: documentPolicy }),
      },
      review: { steps: reviewSteps },
      automation: {
        eligible: trackPolicy?.automationEligible ?? false,
        autoEnqueueOnSpecComplete: trackPolicy?.autoEnqueueOnSpecComplete ?? false,
      },
      track: {
        id: track?.id ?? null,
        coverageProfile: trackPolicy?.coverageProfile ?? 'none',
        routingEnabled: trackPolicy?.routing.enabled ?? false,
      },
    },
    projection: {
      steps: projectionSteps,
      stepLabelSource,
    },
  })
}

export function workflowPlanSnapshot(plan: EffectiveWorkflowPlan): WorkflowPlanSnapshot {
  return freeze({
    version: 1,
    workflowId: plan.id,
    executionModel: plan.executionModel,
    workflow: structuredClone(plan.workflow),
    workflowFingerprint: plan.workflowFingerprint,
  })
}

export function effectiveWorkflowPlanFromSnapshot(
  snapshot: WorkflowPlanSnapshot,
  track?: TrackDefinition,
): EffectiveWorkflowPlan {
  if (snapshot.version !== 1
    || snapshot.workflowId === ''
    || (snapshot.executionModel !== 'phase-manifest' && snapshot.executionModel !== 'step-graph')
    || !/^[0-9a-f]{64}$/.test(snapshot.workflowFingerprint)) {
    throw new DocumentGovernanceBindingError('workflow plan snapshot 形状非法')
  }
  const plan = planFromIr(
    snapshot.workflowId,
    snapshot.executionModel,
    structuredClone(snapshot.workflow),
    track,
  )
  if (plan.workflowFingerprint !== snapshot.workflowFingerprint) {
    throw new DocumentGovernanceBindingError('workflow plan snapshot 内容与 fingerprint 不一致')
  }
  return plan
}

/** Compile a built-in or project Workflow into the single runtime capability model. */
export function compileEffectiveWorkflowPlan(
  id: string,
  provided?: WorkflowDef,
  track?: TrackDefinition,
): EffectiveWorkflowPlan {
  if (id === 'default') {
    const definition = provided ?? parseWorkflow(DEFAULT_WORKFLOW_SOURCE)
    assertValid(definition, 'default')
    return planFromIr(id, 'phase-manifest', compileDefaultWorkflow(definition), track)
  }
  const definition = provided ?? builtinWorkflow(id)
  if (!definition) throw new Error(`workflow '${id}' 未找到`)
  assertValid(definition, 'custom')
  return planFromIr(id, 'step-graph', compileWorkflow(definition), track)
}

/** Project-aware compatibility loader. Identity branching is contained here, never in adapters. */
export function loadEffectiveWorkflowPlan(
  repoRoot: string,
  id: string,
  track?: TrackDefinition,
): EffectiveWorkflowPlan {
  const definition = id === 'default' ? undefined : loadWorkflow(repoRoot, id) ?? undefined
  return compileEffectiveWorkflowPlan(id, definition, track)
}

/** Adapter for callers that already loaded and compiled a project definition under a lock. */
export function effectiveWorkflowPlanFromIr(
  id: string,
  workflow: WorkflowIR,
  track?: TrackDefinition,
): EffectiveWorkflowPlan {
  return planFromIr(id, 'step-graph', workflow, track)
}

/** Central compatibility resolver; consumers branch on plan capabilities, never on the identity. */
export function resolveEffectiveWorkflowPlan(
  id: string,
  loadCompiled: (name: string) => WorkflowIR | null,
  track?: TrackDefinition,
): EffectiveWorkflowPlan | null {
  if (id === 'default') return compileEffectiveWorkflowPlan(id, undefined, track)
  const workflow = loadCompiled(id)
  return workflow === null ? null : effectiveWorkflowPlanFromIr(id, workflow, track)
}

export function effectiveWorkflowPlanBinding(
  plan: EffectiveWorkflowPlan,
): PersistedDocumentGovernanceBinding {
  const policy = plan.documentPolicy
  const profile = profileFor(policy)
  return {
    ...(profile === undefined ? {} : { documentProfile: profile }),
    ...(policy === undefined
      ? {}
      : { documentGovernanceFingerprint: documentGovernanceFingerprint(policy) }),
    workflowPlanFingerprint: plan.workflowFingerprint,
  }
}

/**
 * Resolve the mutable workflow definition under the immutable document-governance identity bound
 * when the run was created. Runs predating this binding remain readable; once a profile exists it
 * can never be removed or changed, and current writers also pin the exact canonical policy hash.
 */
export function resolveBoundEffectiveWorkflowPlan(
  id: string,
  binding: PersistedDocumentGovernanceBinding,
  loadCompiled: (name: string) => WorkflowIR | null,
  track?: TrackDefinition,
  snapshot?: WorkflowPlanSnapshot,
): EffectiveWorkflowPlan | null {
  let plan: EffectiveWorkflowPlan | null
  if (snapshot !== undefined) {
    if (snapshot.workflowId !== id) {
      throw new DocumentGovernanceBindingError(
        `workflow plan snapshot identity 不一致：已绑定 '${snapshot.workflowId}'，当前 '${id}'`,
      )
    }
    plan = effectiveWorkflowPlanFromSnapshot(snapshot, track)
  } else {
    plan = resolveEffectiveWorkflowPlan(id, loadCompiled, track)
  }
  const boundProfile = binding.documentProfile
  const boundFingerprint = binding.documentGovernanceFingerprint
  const boundWorkflowFingerprint = binding.workflowPlanFingerprint
  if (boundProfile === undefined) {
    if (boundFingerprint !== undefined) {
      throw new DocumentGovernanceBindingError(
        `workflow '${id}' document governance binding 损坏：fingerprint 缺少 profile`,
      )
    }
    if (boundWorkflowFingerprint !== undefined && plan === null) {
      throw new DocumentGovernanceBindingError(
        `workflow '${id}' 已绑定 workflow plan fingerprint，定义缺失时拒绝运行`,
      )
    }
    if (
      boundWorkflowFingerprint !== undefined
      && plan !== null
      && plan.workflowFingerprint !== boundWorkflowFingerprint
    ) {
      throw new DocumentGovernanceBindingError(
        `workflow '${id}' workflow plan fingerprint 与初始化绑定不一致`,
      )
    }
    return plan
  }
  if (plan === null) {
    throw new DocumentGovernanceBindingError(
      `workflow '${id}' 已绑定 document governance profile '${boundProfile}'，定义缺失时拒绝运行`,
    )
  }
  const effectiveProfile = profileFor(plan.documentPolicy)
  if (effectiveProfile === undefined) {
    throw new DocumentGovernanceBindingError(
      `workflow '${id}' 已绑定 document governance profile '${boundProfile}'，不可降级为自由模式`,
    )
  }
  if (effectiveProfile !== boundProfile) {
    throw new DocumentGovernanceBindingError(
      `workflow '${id}' document governance profile 不可变：已绑定 '${boundProfile}'，当前 '${effectiveProfile}'`,
    )
  }
  const effectivePolicy = plan.documentPolicy
  if (effectivePolicy === undefined) {
    throw new DocumentGovernanceBindingError(
      `workflow '${id}' 已绑定 document governance profile '${boundProfile}'，当前 policy 缺失`,
    )
  }
  if (
    boundFingerprint !== undefined
    && documentGovernanceFingerprint(effectivePolicy) !== boundFingerprint
  ) {
    throw new DocumentGovernanceBindingError(
      `workflow '${id}' document governance fingerprint 与初始化绑定不一致`,
    )
  }
  if (
    boundWorkflowFingerprint !== undefined
    && plan.workflowFingerprint !== boundWorkflowFingerprint
  ) {
    throw new DocumentGovernanceBindingError(
      `workflow '${id}' workflow plan fingerprint 与初始化绑定不一致`,
    )
  }
  return plan
}
