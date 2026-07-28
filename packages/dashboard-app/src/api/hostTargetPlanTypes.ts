export const HOST_PLAN_SCHEMA_VERSION = 'host-target-plan/v1' as const

export type HostId =
  | 'codex'
  | 'claude'
  | 'cursor'
  | 'gemini'
  | 'copilot'
  | 'pi'
  | 'devin'
  | 'zed'
  | 'aider'
  | 'continue'
  | 'cline'
  | 'amp'
export type HostOperation = 'setup' | 'update'
export type HostTargetKind = 'native' | 'adapter'
export type HostTargetScope = 'user' | 'project'
export type HostCapability =
  | 'native-marketplace'
  | 'project-adapter'
  | 'managed-runtime'
  | 'bundled-skills'
  | 'automatic-update'

export interface HostTarget {
  id: HostId
  kind: HostTargetKind
  cli_flag: `--${HostId}`
  target_scope: HostTargetScope
  supported_operations: ['setup', 'update']
  capabilities: HostCapability[]
}

export interface HostTargetCatalog {
  schema_version: typeof HOST_PLAN_SCHEMA_VERSION
  targets: HostTarget[]
}

export interface HostPlanCommand {
  executable: string
  args: string[]
  display: string
}

export interface HostPlanStep {
  id: string
  label: string
  command: HostPlanCommand | null
}

export interface HostTargetPlan {
  schema_version: typeof HOST_PLAN_SCHEMA_VERSION
  side_effects: 'none'
  host: HostTarget
  operation: HostOperation
  command: HostPlanCommand
  steps: HostPlanStep[]
  notices: string[]
}
