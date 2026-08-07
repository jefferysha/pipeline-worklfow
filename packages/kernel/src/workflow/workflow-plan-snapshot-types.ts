import type { DocumentGovernancePolicy } from './document-contract.js'
import type { WorkflowIR } from './ir.js'
import type {
  WorkflowDecompositionPolicyV1,
  WorkflowInteractionPolicyV1,
} from './types.js'

export type LegacyWorkflowIR = Omit<WorkflowIR, 'decomposition' | 'interaction'>

interface WorkflowPlanSnapshotBase {
  readonly workflowId: string
  readonly executionModel: 'phase-manifest' | 'step-graph'
  readonly workflowFingerprint: string
}

export interface WorkflowPlanSnapshotV1 extends WorkflowPlanSnapshotBase {
  readonly version: 1
  readonly workflow: LegacyWorkflowIR
}

export interface WorkflowPlanSnapshotV2 extends WorkflowPlanSnapshotBase {
  readonly version: 2
  readonly workflow: LegacyWorkflowIR
  readonly documentPolicy: DocumentGovernancePolicy | null
}

export interface WorkflowPlanSnapshotV3 extends WorkflowPlanSnapshotBase {
  readonly version: 3
  readonly workflow: WorkflowIR
  readonly documentPolicy: DocumentGovernancePolicy | null
  readonly decomposition: WorkflowDecompositionPolicyV1
  readonly interaction: WorkflowInteractionPolicyV1
}

export type WorkflowPlanSnapshot = WorkflowPlanSnapshotV1 | WorkflowPlanSnapshotV2 | WorkflowPlanSnapshotV3
