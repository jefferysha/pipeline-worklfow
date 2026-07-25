import type {
  AutonomyLevel,
  BudgetStatus,
  GraduationVerdict,
  LoopBudget,
  LoopRisk,
  ReadinessScore,
  RunResult,
} from '@pipeline-lite/kernel'

export interface LoopRow {
  root: string
  id: string
  name: string
  autonomy_level: AutonomyLevel
  status: string
  cadence: string
  goal: string
  design_doc: string
  change_prefix: string | null
  risk: LoopRisk
  runner: string
  human_gates: string[]
  kill_criteria: string[]
  allowlist: string[]
  denylist: string[]
  budget_decl: LoopBudget
  readiness: ReadinessScore
  budget: BudgetStatus
  matched_changes: string[]
  phases: string[]
  draft: boolean
  template_id?: string
  template_version?: 1
  workflow_id?: string
  skill_bundle_id: string | null
  ledger: LedgerSnapshot
  graduation: GraduationVerdict | null
}

export interface LedgerSnapshot {
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
  last_result: RunResult | null
  last_finished_at: string | null
}

export interface LoopsSnapshot {
  generated_at: string
  rows: LoopRow[]
}

export interface LoopsSnapshotDeps {
  registry: () => string[]
  now: () => Date
}
