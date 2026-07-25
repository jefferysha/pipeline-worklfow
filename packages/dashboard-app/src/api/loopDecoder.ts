import type {
  WbLoopGraduation,
  WbLoopLedgerSnapshot,
  WbLoopRow,
  WbLoopsSnapshot,
} from './automationTypes'
import { isRecord, nullableString, optionalString, stringArray } from './transport'

function nullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function optionalNullableNumber(value: unknown): value is number | null | undefined {
  return value === undefined || nullableNumber(value)
}

function optionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean'
}

function decodeLedger(value: unknown): WbLoopLedgerSnapshot | null {
  if (!isRecord(value)
    || (value.health !== 'ok' && value.health !== 'degraded' && value.health !== 'missing')
    || !optionalNullableNumber(value.rejected_records)
    || !optionalBoolean(value.admission_enforced)
    || !optionalBoolean(value.inflight_enforced)
    || !optionalNullableNumber(value.runs_today)
    || !optionalNullableNumber(value.in_flight)
    || !optionalNullableNumber(value.activated_in_flight)
    || !optionalNullableNumber(value.settled_tokens_actual)
    || !optionalNullableNumber(value.settled_tokens_estimated)
    || !optionalNullableNumber(value.reserved_tokens)
    || !optionalNullableNumber(value.remaining_tokens)
    || (value.last_finished_at !== undefined && !nullableString(value.last_finished_at))) return null
  const lastResult = value.last_result
  if (lastResult !== undefined
    && lastResult !== null
    && lastResult !== 'merged'
    && lastResult !== 'paused'
    && lastResult !== 'conflict'
    && lastResult !== 'failed'
    && lastResult !== 'retry-queued'
    && lastResult !== 'skipped') return null
  return {
    health: value.health,
    rejected_records: typeof value.rejected_records === 'number' ? value.rejected_records : 0,
    admission_enforced: value.admission_enforced === true,
    inflight_enforced: value.inflight_enforced === true,
    runs_today: typeof value.runs_today === 'number' ? value.runs_today : 0,
    in_flight: typeof value.in_flight === 'number' ? value.in_flight : 0,
    activated_in_flight: typeof value.activated_in_flight === 'number' ? value.activated_in_flight : 0,
    settled_tokens_actual: typeof value.settled_tokens_actual === 'number' ? value.settled_tokens_actual : 0,
    settled_tokens_estimated: typeof value.settled_tokens_estimated === 'number' ? value.settled_tokens_estimated : 0,
    reserved_tokens: typeof value.reserved_tokens === 'number' ? value.reserved_tokens : 0,
    remaining_tokens: nullableNumber(value.remaining_tokens) ? value.remaining_tokens : null,
    last_result: lastResult === undefined ? null : lastResult,
    last_finished_at: value.last_finished_at === undefined ? null : value.last_finished_at,
  }
}

function decodeGraduation(value: unknown): WbLoopGraduation | null {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || !['L1', 'L2', 'L3'].includes(String(value.current))
    || !['L1', 'L2', 'L3'].includes(String(value.recommended))
    || typeof value.enforcement !== 'string'
    || typeof value.canGraduate !== 'boolean'
    || !stringArray(value.blockers)
    || !nullableString(value.demotionReason)
    || !stringArray(value.demotionSignals)
    || typeof value.readinessScore !== 'number'
    || typeof value.readinessBand !== 'string'
    || typeof value.driftCount !== 'number'
    || !['ok', 'warn', 'tripped'].includes(String(value.breaker))
    || typeof value.failStreak !== 'number'
    || typeof value.runs !== 'number') return null
  const current = value.current
  const recommended = value.recommended
  const breaker = value.breaker
  if ((current !== 'L1' && current !== 'L2' && current !== 'L3')
    || (recommended !== 'L1' && recommended !== 'L2' && recommended !== 'L3')
    || (breaker !== 'ok' && breaker !== 'warn' && breaker !== 'tripped')) return null
  return {
    id: value.id,
    current,
    recommended,
    enforcement: value.enforcement,
    canGraduate: value.canGraduate,
    blockers: value.blockers,
    demotionReason: value.demotionReason,
    demotionSignals: value.demotionSignals,
    readinessScore: value.readinessScore,
    readinessBand: value.readinessBand,
    driftCount: value.driftCount,
    breaker,
    failStreak: value.failStreak,
    runs: value.runs,
  }
}

function decodeLoopRow(value: unknown): WbLoopRow | null {
  if (!isRecord(value)
    || typeof value.root !== 'string'
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || (value.autonomy_level !== 'L1' && value.autonomy_level !== 'L2' && value.autonomy_level !== 'L3')
    || typeof value.status !== 'string') return null
  const legacyMinimal = value.cadence === undefined
    && value.goal === undefined
    && value.design_doc === undefined
    && value.budget_decl === undefined
    && value.readiness === undefined
    && value.budget === undefined
  if (legacyMinimal) {
    return {
      root: value.root,
      id: value.id,
      name: value.name,
      autonomy_level: value.autonomy_level,
      status: value.status,
      cadence: '',
      goal: '',
      design_doc: '',
      change_prefix: null,
      risk: 'low',
      runner: '',
      human_gates: [],
      kill_criteria: [],
      allowlist: [],
      denylist: [],
      budget_decl: { max_runs_per_day: 0, max_in_flight: 0, on_exceed: '' },
      readiness: { score: Number.NaN, band: 'unknown' },
      budget: { breaker: 'unknown', runsToday: Number.NaN, spentToday: Number.NaN, remaining: null },
      matched_changes: [],
      phases: [],
      draft: false,
    }
  }
  if (typeof value.cadence !== 'string'
    || typeof value.goal !== 'string'
    || typeof value.design_doc !== 'string'
    || !nullableString(value.change_prefix)
    || (value.risk !== 'low' && value.risk !== 'medium' && value.risk !== 'high')
    || typeof value.runner !== 'string'
    || !stringArray(value.human_gates)
    || !stringArray(value.kill_criteria)
    || !stringArray(value.allowlist)
    || !stringArray(value.denylist)
    || !isRecord(value.budget_decl)
    || typeof value.budget_decl.max_runs_per_day !== 'number'
    || typeof value.budget_decl.max_in_flight !== 'number'
    || typeof value.budget_decl.on_exceed !== 'string'
    || !optionalNullableNumber(value.budget_decl.max_tokens_per_day)
    || !optionalNullableNumber(value.budget_decl.tokens_per_run)
    || (value.readiness !== undefined
      && (!isRecord(value.readiness)
        || !nullableNumber(value.readiness.score)
        || typeof value.readiness.band !== 'string'))
    || (value.budget !== undefined
      && (!isRecord(value.budget)
        || typeof value.budget.breaker !== 'string'
        || typeof value.budget.runsToday !== 'number'
        || typeof value.budget.spentToday !== 'number'
        || !nullableNumber(value.budget.remaining)
        || (value.budget.hasBudget !== undefined && typeof value.budget.hasBudget !== 'boolean')
        || (value.budget.maxTokensPerDay !== undefined && !nullableNumber(value.budget.maxTokensPerDay))))
    || !stringArray(value.matched_changes)
    || !stringArray(value.phases)
    || (value.draft !== undefined && typeof value.draft !== 'boolean')
    || !optionalString(value.template_id)
    || (value.template_version !== undefined && value.template_version !== 1)
    || !optionalString(value.workflow_id)
    || (value.skill_bundle_id !== undefined && !nullableString(value.skill_bundle_id))) return null
  let ledger: WbLoopLedgerSnapshot | undefined
  if (value.ledger !== undefined) {
    const decoded = decodeLedger(value.ledger)
    if (!decoded) return null
    ledger = decoded
  }
  let graduation: WbLoopGraduation | null | undefined
  if (value.graduation === null) graduation = null
  else if (value.graduation !== undefined) {
    const decoded = decodeGraduation(value.graduation)
    if (!decoded) return null
    graduation = decoded
  }
  const decoded: WbLoopRow = {
    root: value.root,
    id: value.id,
    name: value.name,
    autonomy_level: value.autonomy_level,
    status: value.status,
    cadence: value.cadence,
    goal: value.goal,
    design_doc: value.design_doc,
    change_prefix: value.change_prefix,
    risk: value.risk,
    runner: value.runner,
    human_gates: value.human_gates,
    kill_criteria: value.kill_criteria,
    allowlist: value.allowlist,
    denylist: value.denylist,
    budget_decl: {
      max_runs_per_day: value.budget_decl.max_runs_per_day,
      max_in_flight: value.budget_decl.max_in_flight,
      on_exceed: value.budget_decl.on_exceed,
      ...(value.budget_decl.max_tokens_per_day === undefined
        ? {}
        : { max_tokens_per_day: value.budget_decl.max_tokens_per_day }),
      ...(value.budget_decl.tokens_per_run === undefined ? {} : { tokens_per_run: value.budget_decl.tokens_per_run }),
    },
    readiness: isRecord(value.readiness)
      ? {
          score: typeof value.readiness.score === 'number' ? value.readiness.score : Number.NaN,
          band: typeof value.readiness.band === 'string' ? value.readiness.band : 'unknown',
        }
      : { score: Number.NaN, band: 'unknown' },
    budget: isRecord(value.budget)
      ? {
          breaker: typeof value.budget.breaker === 'string' ? value.budget.breaker : 'unknown',
          runsToday: typeof value.budget.runsToday === 'number' ? value.budget.runsToday : Number.NaN,
          spentToday: typeof value.budget.spentToday === 'number' ? value.budget.spentToday : Number.NaN,
          remaining: nullableNumber(value.budget.remaining) ? value.budget.remaining : null,
          ...(typeof value.budget.hasBudget === 'boolean' ? { hasBudget: value.budget.hasBudget } : {}),
          ...(value.budget.maxTokensPerDay === undefined
            ? {}
            : { maxTokensPerDay: nullableNumber(value.budget.maxTokensPerDay) ? value.budget.maxTokensPerDay : null }),
        }
      : { breaker: 'unknown', runsToday: Number.NaN, spentToday: Number.NaN, remaining: null },
    matched_changes: value.matched_changes,
    phases: value.phases,
    draft: value.draft === true,
    ...(value.template_id === undefined ? {} : { template_id: value.template_id }),
    ...(value.template_version === undefined ? {} : { template_version: value.template_version }),
    ...(value.workflow_id === undefined ? {} : { workflow_id: value.workflow_id }),
    ...(value.skill_bundle_id === undefined ? {} : { skill_bundle_id: value.skill_bundle_id }),
    ...(ledger === undefined ? {} : { ledger }),
    ...(graduation === undefined ? {} : { graduation }),
  }
  // Older dashboard servers omitted these derived summaries. Preserve that absence at runtime so
  // existing views render their established "unknown" state, while current responses remain fully
  // typed and validated. The public current-server contract stays required.
  if (value.readiness === undefined) Reflect.deleteProperty(decoded, 'readiness')
  if (value.budget === undefined) Reflect.deleteProperty(decoded, 'budget')
  return decoded
}

export function decodeLoopsSnapshot(value: unknown): WbLoopsSnapshot | null {
  if (!isRecord(value) || typeof value.generated_at !== 'string' || !Array.isArray(value.rows)) return null
  const rows: WbLoopRow[] = []
  for (const row of value.rows) {
    const decoded = decodeLoopRow(row)
    if (!decoded) return null
    rows.push(decoded)
  }
  return { generated_at: value.generated_at, rows }
}
