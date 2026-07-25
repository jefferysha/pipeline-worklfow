export interface WbLoopBudgetDecl {
  max_runs_per_day: number
  max_in_flight: number
  on_exceed: string
  max_tokens_per_day?: number | null
  tokens_per_run?: number | null
}

export interface WbLoopLedgerSnapshot {
  health: 'ok' | 'degraded' | 'missing'
  rejected_records: number
  admission_enforced: boolean
  inflight_enforced: boolean
  runs_today: number
  in_flight: number
  activated_in_flight: number
  settled_tokens_actual: number
  settled_tokens_estimated: number
  reserved_tokens: number
  remaining_tokens: number | null
  last_result: 'merged' | 'paused' | 'conflict' | 'failed' | 'retry-queued' | 'skipped' | null
  last_finished_at: string | null
}

export interface WbLoopGraduation {
  id: string
  current: 'L1' | 'L2' | 'L3'
  recommended: 'L1' | 'L2' | 'L3'
  enforcement: string
  canGraduate: boolean
  blockers: string[]
  demotionReason: string | null
  demotionSignals: string[]
  readinessScore: number
  readinessBand: string
  driftCount: number
  breaker: 'ok' | 'warn' | 'tripped'
  failStreak: number
  runs: number
}

export interface WbLoopRow {
  root: string
  id: string
  name: string
  autonomy_level: 'L1' | 'L2' | 'L3'
  status: string
  cadence: string
  goal: string
  design_doc: string
  change_prefix: string | null
  risk: 'low' | 'medium' | 'high'
  runner: string
  human_gates: string[]
  kill_criteria: string[]
  allowlist: string[]
  denylist: string[]
  budget_decl: WbLoopBudgetDecl
  readiness: { score: number; band: string }
  budget: {
    breaker: string
    runsToday: number
    spentToday: number
    remaining: number | null
    hasBudget?: boolean
    maxTokensPerDay?: number | null
  }
  matched_changes: string[]
  phases: string[]
  draft: boolean
  template_id?: string
  template_version?: 1
  workflow_id?: string
  skill_bundle_id?: string | null
  ledger?: WbLoopLedgerSnapshot
  graduation?: WbLoopGraduation | null
}

export interface WbLoopsSnapshot {
  generated_at: string
  rows: WbLoopRow[]
}

export interface WbAutomationSettings {
  enabled?: boolean
  max_parallel: number
  max_retries: number
  default_opt_in: boolean
  image: string
}

export interface AutomationStarterTemplate {
  version: 1
  id: string
  goal: string
  trigger: Array<{ kind: 'schedule' | 'event' | 'manual' }>
  risk: 'low' | 'medium' | 'high'
  recommendedWorkflow: 'default'
  recommendedSkills: string[]
}

export interface OperationResponse {
  ok: boolean
  exit_code: number
  command: string[]
  result: unknown | null
  stdout: string
  stderr: string
}

export type WbCadenceLoopState =
  | 'inactive'
  | 'continuous'
  | 'waiting'
  | 'in-flight'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked'

export interface WbCadenceLoopStatus {
  root: string
  loop_id: string
  cadence: string
  runner: string
  state: WbCadenceLoopState
  last_finished_at: string | null
  due_at: string | null
  attempted_at?: string
  exit_code?: number
  error?: string
}

export interface WbCadenceStatus {
  enabled: true
  poll_interval_ms: number
  generated_at: string
  running: boolean
  loops: WbCadenceLoopStatus[]
  errors: string[]
}

export interface WbDockerImages {
  available: boolean
  images: string[]
}

export interface WbCredLight {
  set: boolean
  source?: 'host-env' | 'secrets-file' | 'default-home'
}

export interface WbAfkReadiness {
  docker: { available: boolean }
  image: { configured: string; present: boolean; build_hint: string }
  credentials: {
    'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: WbCredLight }
    codex: { OPENAI_API_KEY: WbCredLight; CODEX_HOME: WbCredLight }
  }
}

export interface WbSecretLight {
  set: boolean
  masked?: string
}

export type WbSecretsKeys = Record<'CLAUDE_CODE_OAUTH_TOKEN' | 'OPENAI_API_KEY', WbSecretLight>
