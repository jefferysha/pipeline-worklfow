import {
  builtinWorkflow,
  compileWorkflow,
  evaluateSpecMigrationEvidence,
  loadWorkflow,
  readinessByTransition,
  resolveBoundEffectiveWorkflowPlan,
  type EffectiveWorkflowPlan,
  type PipelineState,
  type PipelineTodoStageDefinition,
  type WorkflowPlanSnapshot,
} from '@tenon/kernel'
import type {
  LegacyWorkflowRulesSnapshot,
  WorkflowExecutionSnapshot,
  WorkflowRulesSnapshot,
} from './types.js'
import { projectFileExists } from './projectCapabilities.js'

export interface WorkflowSnapshotCapabilityDeps {
  readonly fileExists?: (root: string, repoRelativePath: string) => boolean
  readonly gitHeadSha?: (cwd: string) => Promise<string>
  readonly workspaceFingerprint?: (cwd: string, changeName: string) => Promise<string>
}

export function resolveSnapshotEffectivePlan(
  root: string,
  workflowName: string,
  binding: {
    readonly documentProfile?: 'legacy-full' | 'document-v1'
    readonly documentGovernanceFingerprint?: string
    readonly workflowPlanFingerprint?: string
    readonly workflowPlanSnapshot?: WorkflowPlanSnapshot
  },
): EffectiveWorkflowPlan {
  const plan = resolveBoundEffectiveWorkflowPlan(workflowName, binding, (name) => {
    const definition = builtinWorkflow(name) ?? loadWorkflow(root, name)
    return definition === null ? null : compileWorkflow(definition)
  }, undefined, binding.workflowPlanSnapshot)
  if (plan === null) throw new Error(`workflow '${workflowName}' 未找到`)
  return plan
}

export function snapshotTodoStages(
  plan: EffectiveWorkflowPlan | undefined,
  phase: string,
): readonly PipelineTodoStageDefinition[] {
  if (plan) {
    return plan.workflow.steps.map((step) => ({
      id: step.id,
      label: step.label || step.id,
      transitions: step.transitions.map((transition) => transition.to),
    }))
  }
  return phase === '' ? [] : [{ id: phase, label: phase }]
}

export function snapshotWorkflowRules(plan: EffectiveWorkflowPlan): WorkflowRulesSnapshot {
  return {
    executionModel: plan.capabilities.execution.model,
    steps: plan.workflow.steps.map((step) => step.id),
    transitions: Object.fromEntries(plan.workflow.steps.map((step) => [
      step.id,
      step.transitions.map((transition) => ({ event: transition.event, to: transition.to })),
    ])),
    gateByStep: Object.fromEntries(plan.workflow.steps.map((step) => [step.id, step.gate])),
    labelByStep: Object.fromEntries(
      plan.workflow.steps.map((step) => [step.id, step.label || step.id]),
    ),
    outputsByStep: Object.fromEntries(plan.workflow.steps.map((step) => [
      step.id,
      step.outputs.map((output) => output.field),
    ])),
  }
}

export function legacySnapshotWorkflowRules(plan: EffectiveWorkflowPlan): LegacyWorkflowRulesSnapshot {
  const current = snapshotWorkflowRules(plan)
  return {
    steps: current.steps,
    transitions: current.transitions,
    gateByStep: current.gateByStep,
    labelByStep: current.labelByStep,
    outputsByStep: current.outputsByStep,
    nonemptyOutputByStep: Object.fromEntries(plan.workflow.steps.map((step) => [
      step.id,
      step.guards.some((guard) => guard.type === 'output-present'),
    ])),
  }
}

export async function snapshotWorkflowExecution(
  plan: EffectiveWorkflowPlan,
  state: PipelineState,
  root: string,
  changeDir: string,
  changeName: string,
  deps: WorkflowSnapshotCapabilityDeps,
): Promise<WorkflowExecutionSnapshot> {
  const fileExists = deps.fileExists ?? projectFileExists
  const gitHeadSha = deps.gitHeadSha
  const workspaceFingerprint = deps.workspaceFingerprint
  return {
    readinessByTransition: await readinessByTransition(plan, state, {
      changeDirAbs: changeDir,
      fileExists: (path) => fileExists(root, path),
      gitHeadSha: gitHeadSha === undefined ? undefined : () => gitHeadSha(root),
      workspaceFingerprint: workspaceFingerprint === undefined
        ? undefined
        : () => workspaceFingerprint(root, changeName),
      specMigrationStatus: () => evaluateSpecMigrationEvidence(root, changeDir, changeName),
    }),
  }
}
