import type {
  BoardSnapshotV1,
  CapabilityResolutionV1,
  DevelopmentRequestV1,
  McpDescriptorV1,
  RepositoryContextSnapshotV1,
  SkillArtifactRefV1,
  SkillDescriptorV1,
  SkillResultEnvelopeV1,
  ValidationReportV1,
  WorkGraphV1,
} from '@tenon/kernel'

export const DEFAULT_SKILL_OUTPUT_MAX_BYTES = 256 * 1_024

export interface SkillExecutionBindingV1 {
  readonly work_item_id: string
  readonly skill_id: string
  readonly skill_version: string
  readonly mcp_ids: readonly string[]
  readonly mode: 'serial' | 'parallel'
}

export interface SkillExecutionObservationV1 {
  readonly output: unknown
  readonly raw_output_ref?: string
  readonly artifacts: readonly SkillArtifactRefV1[]
  readonly summary?: string
  readonly diagnostics: readonly string[]
}

export interface SkillExecutorPort {
  execute(input: {
    readonly run_id: string
    readonly work_item_id: string
    readonly skill_id: string
    readonly skill_version: string
    readonly mcp_ids: readonly string[]
    readonly input_artifacts: readonly SkillArtifactRefV1[]
    readonly signal: AbortSignal
  }): Promise<unknown>
}

export interface SkillValidationDecisionV1 {
  readonly contract_status: 'validated' | 'unknown' | 'invalid'
  readonly output_schema_id?: string
  readonly diagnostics: readonly string[]
  readonly report?: ValidationReportV1
}

export interface SkillResultValidatorPort {
  validate(input: {
    readonly binding: SkillExecutionBindingV1
    readonly observation: SkillExecutionObservationV1
  }): Promise<unknown>
}

export interface CapabilityExecutionHost {
  readonly clock: () => string
  readonly new_id: (prefix: string) => string
  readonly actor: string
  readonly worker_id: string
  readonly signal?: AbortSignal
}

export interface CapabilityExecutionSetupInput extends CapabilityExecutionHost {
  readonly request: DevelopmentRequestV1
  readonly context: RepositoryContextSnapshotV1
  readonly assessment: import('@tenon/kernel').CapabilityAssessmentV1
  readonly graph: WorkGraphV1
  readonly skills: readonly SkillDescriptorV1[]
  readonly mcps: readonly McpDescriptorV1[]
  readonly bindings: readonly SkillExecutionBindingV1[]
  readonly allowed_permissions?: readonly string[]
}

export interface CapabilityWorkExecutionInput extends CapabilityExecutionHost {
  readonly state: BoardSnapshotV1
  readonly bindings: readonly SkillExecutionBindingV1[]
  readonly skills: readonly SkillDescriptorV1[]
  readonly mcps: readonly McpDescriptorV1[]
  readonly executor: SkillExecutorPort
  readonly validator?: SkillResultValidatorPort
  readonly prior_results?: readonly {
    readonly work_item_id: string
    readonly result: SkillResultEnvelopeV1
  }[]
  readonly max_output_bytes?: number
  readonly allowed_permissions?: readonly string[]
}

export interface RunCapabilityOrchestrationInput extends CapabilityExecutionSetupInput {
  readonly executor: SkillExecutorPort
  readonly validator?: SkillResultValidatorPort
  readonly prior_results?: CapabilityWorkExecutionInput['prior_results']
  readonly max_output_bytes?: number
}

export type CapabilityExecutionFailureCode =
  | 'setup-invalid'
  | 'resolution-failed'
  | 'binding-invalid'
  | 'command-rejected'
  | 'dependency-result-missing'
  | 'execution-stalled'

export type CapabilityExecutionOutcome =
  | { readonly ok: true; readonly state: BoardSnapshotV1 }
  | {
      readonly ok: false
      readonly code: CapabilityExecutionFailureCode
      readonly state: BoardSnapshotV1
      readonly message: string
      readonly issues?: readonly string[]
    }

export interface PreparedRun {
  readonly binding: SkillExecutionBindingV1
  readonly run_id: string
  readonly result_id: string
  readonly input_artifacts: readonly SkillArtifactRefV1[]
}

export interface RunOutcome {
  readonly prepared: PreparedRun
  readonly result: SkillResultEnvelopeV1
  readonly report?: ValidationReportV1
  readonly blocking: boolean
}

export type RuntimeRecord = { readonly [key: string]: import('./jsonBoundary.js').JsonBoundaryValue }

export interface BindingValidation {
  readonly ok: boolean
  readonly issues: readonly string[]
}

export interface ExecutionPreparedContext {
  readonly state: BoardSnapshotV1
  readonly prepared: readonly PreparedRun[]
}

export type ExecutionResultCommand = {
  readonly state: BoardSnapshotV1
  readonly result: SkillResultEnvelopeV1
  readonly report?: ValidationReportV1
}

export type { CapabilityResolutionV1 }
