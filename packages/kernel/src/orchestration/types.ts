import type { ResourceClaimV1, TaskPlanRevisionV1 } from '../task-plan/types.js'

export const DEVELOPMENT_REQUEST_SCHEMA = 'development-request/v1' as const
export const REPOSITORY_CONTEXT_SCHEMA = 'repository-context/v1' as const
export const CAPABILITY_ASSESSMENT_SCHEMA = 'capability-assessment/v1' as const
export const WORK_GRAPH_SCHEMA = 'work-graph/v1' as const
export const SKILL_DESCRIPTOR_SCHEMA = 'skill-descriptor/v1' as const
export const MCP_DESCRIPTOR_SCHEMA = 'mcp-descriptor/v1' as const
export const CAPABILITY_RESOLUTION_SCHEMA = 'capability-resolution/v1' as const
export const SKILL_RUN_SCHEMA = 'skill-run/v1' as const
export const SKILL_RESULT_SCHEMA = 'skill-result/v1' as const
export const VALIDATION_REPORT_SCHEMA = 'validation-report/v1' as const
export const GATE_EVALUATION_SCHEMA = 'gate-evaluation/v1' as const
export const BOARD_COMMAND_SCHEMA = 'board-command/v1' as const
export const BOARD_SNAPSHOT_SCHEMA = 'board-snapshot/v1' as const

export type OrchestrationSource = 'user' | 'rule' | 'model' | 'system'
export type AssessmentStatus = 'complete' | 'needs-input' | 'uncertain'
export type SelectionExecution = 'serial' | 'parallel'

/** 用户对自定义 Skill 的声明。依赖和执行方式是用户意图，运行时只负责校验和编排。 */
export interface SkillSelectionV1 {
  readonly id: string
  readonly mode: SelectionExecution
  readonly depends_on: readonly string[]
}

export interface McpSelectionV1 {
  readonly id: string
  readonly required: boolean
}

export interface DevelopmentRequestV1 {
  readonly schema_version: typeof DEVELOPMENT_REQUEST_SCHEMA
  readonly request_id: string
  readonly project_id: string
  readonly change_id: string
  readonly intent: string
  readonly created_at: string
  readonly auto_select: boolean
  readonly user_skills: readonly SkillSelectionV1[]
  readonly user_mcps: readonly McpSelectionV1[]
}

/** 仓库信息是适配器提供的只读快照，Kernel 不读取文件系统，也不把路径当成状态。 */
export interface RepositoryContextSnapshotV1 {
  readonly schema_version: typeof REPOSITORY_CONTEXT_SCHEMA
  readonly project_id: string
  readonly repository_ref: string
  readonly revision: string
  readonly branch: string
  readonly base_branch: string
  readonly dirty: boolean
  readonly observed_at: string
  readonly source: OrchestrationSource
}

export interface AssessmentQuestionV1 {
  readonly id: string
  readonly prompt: string
  readonly required: boolean
}

/** 场景识别不输出闭集 scene enum，而输出能力需求、约束、风险和需要补问的问题。 */
export interface CapabilityAssessmentV1 {
  readonly schema_version: typeof CAPABILITY_ASSESSMENT_SCHEMA
  readonly assessment_id: string
  readonly request_id: string
  readonly status: AssessmentStatus
  readonly source: OrchestrationSource
  readonly confidence: number
  readonly capability_requirements: readonly string[]
  readonly mcp_requirements: readonly string[]
  readonly constraints: readonly string[]
  readonly risks: readonly string[]
  readonly questions: readonly AssessmentQuestionV1[]
  readonly signals: Readonly<Record<string, string>>
  readonly assessed_at: string
}

export interface WorkGraphExecutionGroupV1 {
  readonly id: string
  readonly mode: SelectionExecution
  readonly work_item_ids: readonly string[]
}

/** WorkGraph 只携带一个冻结 TaskPlanRevision，避免再造一套任务真相源。 */
export interface WorkGraphV1 {
  readonly schema_version: typeof WORK_GRAPH_SCHEMA
  readonly graph_id: string
  readonly change_id: string
  readonly task_plan: TaskPlanRevisionV1
  readonly execution_groups: readonly WorkGraphExecutionGroupV1[]
  readonly generated_at: string
  readonly source: OrchestrationSource
}

export type DescriptorAvailability = 'available' | 'unavailable' | 'unknown'

export interface SkillDescriptorV1 {
  readonly schema_version: typeof SKILL_DESCRIPTOR_SCHEMA
  readonly id: string
  readonly version: string
  readonly capabilities: readonly string[]
  readonly availability: DescriptorAvailability
  readonly supports_parallel: boolean
  readonly resource_claims: readonly ResourceClaimV1[]
  readonly input_schema_id?: string
  readonly output_schema_id?: string
  readonly permissions: readonly string[]
}

export interface McpDescriptorV1 {
  readonly schema_version: typeof MCP_DESCRIPTOR_SCHEMA
  readonly id: string
  readonly version: string
  readonly capabilities: readonly string[]
  readonly availability: DescriptorAvailability
  readonly permissions: readonly string[]
}

export interface SelectedSkillV1 {
  readonly id: string
  readonly version: string
  readonly source: 'user' | 'auto'
  readonly mode: SelectionExecution
  readonly depends_on: readonly string[]
}

export interface SelectedMcpV1 {
  readonly id: string
  readonly version: string
  readonly source: 'user' | 'auto'
  readonly required: boolean
}

export interface CapabilityResolutionV1 {
  readonly schema_version: typeof CAPABILITY_RESOLUTION_SCHEMA
  readonly resolution_id: string
  readonly assessment_id: string
  readonly status: 'resolved' | 'needs-input' | 'blocked'
  readonly required_capabilities: readonly string[]
  readonly selected_skills: readonly SelectedSkillV1[]
  readonly selected_mcps: readonly SelectedMcpV1[]
  readonly unresolved_capabilities: readonly string[]
  readonly blockers: readonly string[]
  readonly decisions: readonly {
    readonly capability: string
    readonly selected_id?: string
    readonly source: 'user' | 'auto' | 'unresolved'
    readonly rationale: string
  }[]
  readonly resolved_at: string
}

export type SkillRunStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled'

export interface SkillRunV1 {
  readonly schema_version: typeof SKILL_RUN_SCHEMA
  readonly run_id: string
  readonly work_item_id: string
  readonly skill_id: string
  readonly skill_version: string
  readonly attempt: number
  readonly status: SkillRunStatus
  readonly requested_at: string
  readonly claimed_at?: string
  readonly started_at?: string
  readonly finished_at?: string
  readonly result_id?: string
  readonly error_code?: string
}

export interface SkillArtifactRefV1 {
  readonly kind: 'file' | 'document' | 'artifact' | 'value' | 'unknown'
  readonly ref: string
  readonly digest?: string
  readonly label?: string
}

export type SkillResultStatus = 'completed' | 'failed' | 'incomplete' | 'corrupt'
export type SkillContractStatus = 'validated' | 'unknown' | 'invalid'

/** 异构 Skill 统一用 envelope；raw_output 保持 opaque，不能被 Kernel 猜测成完成。 */
export interface SkillResultEnvelopeV1 {
  readonly schema_version: typeof SKILL_RESULT_SCHEMA
  readonly result_id: string
  readonly run_id: string
  readonly status: SkillResultStatus
  readonly contract_status: SkillContractStatus
  readonly output_schema_id?: string
  readonly summary?: string
  readonly artifacts: readonly SkillArtifactRefV1[]
  readonly diagnostics: readonly string[]
  readonly raw_output?: unknown
  readonly produced_at: string
}

export interface ValidationCheckV1 {
  readonly id: string
  readonly status: 'pass' | 'fail' | 'unknown'
  readonly validator: string
  readonly evidence_refs: readonly string[]
  readonly message?: string
}

export interface ValidationReportV1 {
  readonly schema_version: typeof VALIDATION_REPORT_SCHEMA
  readonly report_id: string
  readonly work_item_id: string
  readonly status: 'pass' | 'fail' | 'incomplete'
  readonly checks: readonly ValidationCheckV1[]
  readonly produced_at: string
}

export type OrchestrationGateKind = 'input' | 'review' | 'verification' | 'release'
export type OrchestrationGateStatus = 'pending' | 'passed' | 'rejected' | 'waived'

export interface GateEvaluationV1 {
  readonly schema_version: typeof GATE_EVALUATION_SCHEMA
  readonly gate_id: string
  readonly change_id: string
  readonly kind: OrchestrationGateKind
  readonly status: OrchestrationGateStatus
  readonly actor: string
  readonly rationale?: string
  readonly evaluated_at: string
}

export type ChangeStatusV1 =
  | 'draft' | 'contextualizing' | 'assessing' | 'planning' | 'planned' | 'ready'
  | 'executing' | 'reviewing' | 'verifying' | 'completed'
  | 'waiting-input' | 'blocked' | 'paused' | 'failed' | 'cancelled'

export type WorkItemStatusV1 = 'pending' | 'ready' | 'queued' | 'running' | 'reviewing' | 'verifying' | 'completed' | 'blocked' | 'failed' | 'cancelled'

export interface WorkItemRuntimeV1 {
  readonly work_item_id: string
  readonly status: WorkItemStatusV1
  readonly attempt: number
  readonly active_run_id?: string
  readonly blocked_reason?: string
}

export type BoardCommandV1 =
  | BoardCommandBaseV1 & { readonly type: 'record-assessment'; readonly assessment: CapabilityAssessmentV1; readonly context: RepositoryContextSnapshotV1 }
  | BoardCommandBaseV1 & { readonly type: 'attach-work-graph'; readonly graph: WorkGraphV1 }
  | BoardCommandBaseV1 & { readonly type: 'resolve-capabilities'; readonly resolution: CapabilityResolutionV1 }
  | BoardCommandBaseV1 & { readonly type: 'start' }
  | BoardCommandBaseV1 & { readonly type: 'claim-work-item'; readonly work_item_id: string; readonly worker_id: string }
  | BoardCommandBaseV1 & { readonly type: 'begin-skill-run'; readonly work_item_id: string; readonly run_id: string; readonly skill_id: string; readonly skill_version: string; readonly now: string }
  | BoardCommandBaseV1 & { readonly type: 'complete-skill-run'; readonly run_id: string; readonly result: SkillResultEnvelopeV1 }
  | BoardCommandBaseV1 & { readonly type: 'record-validation'; readonly report: ValidationReportV1 }
  | BoardCommandBaseV1 & { readonly type: 'evaluate-gate'; readonly gate: GateEvaluationV1 }
  | BoardCommandBaseV1 & { readonly type: 'pause'; readonly reason: string }
  | BoardCommandBaseV1 & { readonly type: 'resume' }
  | BoardCommandBaseV1 & { readonly type: 'retry-work-item'; readonly work_item_id: string }
  | BoardCommandBaseV1 & { readonly type: 'cancel'; readonly reason: string }

export interface BoardCommandBaseV1 {
  readonly schema_version: typeof BOARD_COMMAND_SCHEMA
  readonly command_id: string
  readonly change_id: string
  readonly expected_revision: number
  readonly actor: string
  readonly issued_at: string
}

export interface BoardSnapshotV1 {
  readonly schema_version: typeof BOARD_SNAPSHOT_SCHEMA
  readonly change_id: string
  readonly revision: number
  readonly status: ChangeStatusV1
  readonly request: DevelopmentRequestV1
  readonly context?: RepositoryContextSnapshotV1
  readonly assessment?: CapabilityAssessmentV1
  readonly graph?: WorkGraphV1
  readonly resolution?: CapabilityResolutionV1
  readonly work_items: readonly WorkItemRuntimeV1[]
  readonly runs: readonly SkillRunV1[]
  readonly validations: readonly ValidationReportV1[]
  readonly gates: readonly GateEvaluationV1[]
  readonly resume_status?: Exclude<ChangeStatusV1, 'paused'>
  readonly updated_at: string
}

export interface OrchestrationResult<T> {
  readonly ok: true
  readonly state: T
}

export interface OrchestrationFailure {
  readonly ok: false
  readonly code: 'revision-conflict' | 'invalid-transition' | 'not-found' | 'contract-invalid' | 'blocked'
  readonly message: string
}

export type ApplyCommandResult = OrchestrationResult<BoardSnapshotV1> | OrchestrationFailure
