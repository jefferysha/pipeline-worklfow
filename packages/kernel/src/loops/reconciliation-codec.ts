import type { ReconciliationBlockerReason, ReconciliationPlan, ReconciliationPlanPayload } from './reconciliation-types.js'
import { MANAGED_LOOP_SECTION_OWNERSHIP, RECONCILIATION_PLAN_KIND, RECONCILIATION_PLAN_SCHEMA_VERSION, RECONCILIATION_TARGET } from './reconciliation-types.js'
import { canonicalReconciliationJson, reconciliationPayloadDigest } from './reconciliation-hash.js'

const SHA256_RE = /^[a-f0-9]{64}$/
const LOOP_ID_RE = /^[a-z][a-z0-9-]*$/
export type ReconciliationPlanCodecResult =
  | { readonly ok: true; readonly plan: ReconciliationPlan }
  | { readonly ok: false; readonly errors: readonly string[] }

export class ReconciliationPlanCodecError extends Error {
  readonly errors: readonly string[]
  constructor(errors: readonly string[]) {
    super(`invalid ReconciliationPlan: ${errors.join('; ')}`)
    this.name = 'ReconciliationPlanCodecError'
    this.errors = [...errors]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactObject(
  value: unknown,
  path: string,
  keys: readonly string[],
  errors: string[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return null
  }
  const allowed = new Set(keys)
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key}: missing`)
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unknown key`)
  }
  return value
}

function literal(value: unknown, expected: string | number | boolean, path: string, errors: string[]): void {
  if (value !== expected) errors.push(`${path}: expected ${JSON.stringify(expected)}`)
}

function stringValue(value: unknown, path: string, errors: string[], pattern?: RegExp): void {
  if (typeof value !== 'string') {
    errors.push(`${path}: expected string`)
    return
  }
  if (value.length === 0) errors.push(`${path}: must not be empty`)
  if (pattern !== undefined && !pattern.test(value)) errors.push(`${path}: invalid format`)
}

function strictArray(value: unknown, path: string, errors: string[]): unknown[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`)
    return null
  }
  for (let i = 0; i < value.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(value, i)) errors.push(`${path}[${i}]: sparse array entry`)
  }
  return value
}

function validateEpoch(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected ResourceEpoch object`)
    return
  }
  if (value.kind === 'absent') {
    exactObject(value, path, ['kind'], errors)
    return
  }
  if (value.kind === 'sha256') {
    const epoch = exactObject(value, path, ['kind', 'value'], errors)
    if (epoch !== null) stringValue(epoch.value, `${path}.value`, errors, SHA256_RE)
    return
  }
  exactObject(value, path, ['kind'], errors)
  errors.push(`${path}.kind: expected "absent" or "sha256"`)
}

function validateScope(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected ReconciliationScope object`)
    return
  }
  if (value.kind === 'all') {
    exactObject(value, path, ['kind'], errors)
    return
  }
  if (value.kind === 'loop') {
    const scope = exactObject(value, path, ['kind', 'loop_id'], errors)
    if (scope !== null) stringValue(scope.loop_id, `${path}.loop_id`, errors, LOOP_ID_RE)
    return
  }
  exactObject(value, path, ['kind'], errors)
  errors.push(`${path}.kind: expected "all" or "loop"`)
}

const DRIFT_DIMENSIONS = new Set([
  'mirror-missing', 'mirror-orphan', 'runlog-orphan-id', 'never-run',
  'cadence-idle', 'change-prefix', 'status-drift',
])
const BLOCKER_REASONS = new Set<string>([
  'historical-fact-immutable', 'runtime-remediation-required', 'ambiguous-authority',
  'unowned-document-section', 'managed-section-corrupt',
])

function validateDriftItem(value: unknown, path: string, errors: string[]): void {
  const item = exactObject(value, path, ['loop', 'dimension', 'severity', 'detail', 'suggestion'], errors)
  if (item === null) return
  if (item.loop !== '*') stringValue(item.loop, `${path}.loop`, errors, LOOP_ID_RE)
  if (typeof item.dimension !== 'string' || !DRIFT_DIMENSIONS.has(item.dimension)) {
    errors.push(`${path}.dimension: unknown drift dimension`)
  }
  if (item.severity !== 'warn' && item.severity !== 'info') {
    errors.push(`${path}.severity: expected "warn" or "info"`)
  }
  stringValue(item.detail, `${path}.detail`, errors)
  stringValue(item.suggestion, `${path}.suggestion`, errors)
}

function validateOperation(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected operation object`)
    return
  }
  if (value.kind === 'ensure-managed-loop-section') {
    const operation = exactObject(value, path, ['kind', 'target', 'loop_id'], errors)
    if (operation === null) return
    literal(operation.target, RECONCILIATION_TARGET, `${path}.target`, errors)
    stringValue(operation.loop_id, `${path}.loop_id`, errors, LOOP_ID_RE)
    return
  }
  if (value.kind === 'remove-managed-loop-section') {
    const operation = exactObject(value, path, ['kind', 'target', 'loop_id', 'ownership'], errors)
    if (operation === null) return
    literal(operation.target, RECONCILIATION_TARGET, `${path}.target`, errors)
    stringValue(operation.loop_id, `${path}.loop_id`, errors, LOOP_ID_RE)
    literal(operation.ownership, MANAGED_LOOP_SECTION_OWNERSHIP, `${path}.ownership`, errors)
    return
  }
  exactObject(value, path, ['kind'], errors)
  errors.push(`${path}.kind: unknown operation kind`)
}

function validateBlocker(value: unknown, path: string, errors: string[]): void {
  const blocker = exactObject(value, path, ['drift', 'reason', 'next_step'], errors)
  if (blocker === null) return
  validateDriftItem(blocker.drift, `${path}.drift`, errors)
  if (typeof blocker.reason !== 'string' || !BLOCKER_REASONS.has(blocker.reason)) {
    errors.push(`${path}.reason: unknown blocker reason`)
  }
  stringValue(blocker.next_step, `${path}.next_step`, errors)
}

function validateDriftReport(value: unknown, path: string, errors: string[]): void {
  const report = exactObject(value, path, ['version', 'generated_at', 'clean', 'checked', 'items'], errors)
  if (report === null) return
  literal(report.version, 1, `${path}.version`, errors)
  stringValue(report.generated_at, `${path}.generated_at`, errors)
  if (typeof report.clean !== 'boolean') errors.push(`${path}.clean: expected boolean`)
  const checked = strictArray(report.checked, `${path}.checked`, errors)
  if (checked !== null) {
    const seen = new Set<string>()
    for (let i = 0; i < checked.length; i++) {
      const checkedId = checked[i]
      stringValue(checkedId, `${path}.checked[${i}]`, errors, LOOP_ID_RE)
      if (typeof checkedId === 'string') {
        if (seen.has(checkedId)) errors.push(`${path}.checked[${i}]: duplicate loop id`)
        seen.add(checkedId)
      }
    }
  }
  const items = strictArray(report.items, `${path}.items`, errors)
  if (items !== null) {
    for (let i = 0; i < items.length; i++) validateDriftItem(items[i], `${path}.items[${i}]`, errors)
    if (typeof report.clean === 'boolean') {
      const computedClean = items.every((item) => isRecord(item) && item.severity !== 'warn')
      if (computedClean !== report.clean) errors.push(`${path}.clean: does not match item severities`)
    }
  }
}

function epochEquals(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right) || left.kind !== right.kind) return false
  return left.kind === 'absent' || (left.kind === 'sha256' && left.value === right.value)
}

function validateReconciliationPlan(value: unknown): string[] {
  const errors: string[] = []
  const plan = exactObject(value, '$', [
    'kind', 'schema_version', 'plan_id', 'generated_at', 'scope', 'observed',
    'preconditions', 'operations', 'blockers', 'expected_loop_doc_epoch', 'drift_report',
  ], errors)
  if (plan === null) return errors

  literal(plan.kind, RECONCILIATION_PLAN_KIND, '$.kind', errors)
  literal(plan.schema_version, RECONCILIATION_PLAN_SCHEMA_VERSION, '$.schema_version', errors)
  stringValue(plan.plan_id, '$.plan_id', errors, SHA256_RE)
  stringValue(plan.generated_at, '$.generated_at', errors)
  validateScope(plan.scope, '$.scope', errors)

  const observed = exactObject(plan.observed, '$.observed', ['registry', 'loop_doc', 'run_log'], errors)
  if (observed !== null) {
    const registry = exactObject(observed.registry, '$.observed.registry', ['path', 'epoch'], errors)
    if (registry !== null) {
      literal(registry.path, '.pipeline/loops.yaml', '$.observed.registry.path', errors)
      validateEpoch(registry.epoch, '$.observed.registry.epoch', errors)
    }
    const loopDoc = exactObject(observed.loop_doc, '$.observed.loop_doc', ['path', 'epoch'], errors)
    if (loopDoc !== null) {
      literal(loopDoc.path, RECONCILIATION_TARGET, '$.observed.loop_doc.path', errors)
      validateEpoch(loopDoc.epoch, '$.observed.loop_doc.epoch', errors)
    }
    const runLog = exactObject(observed.run_log, '$.observed.run_log', ['path', 'epoch', 'role'], errors)
    if (runLog !== null) {
      literal(runLog.path, '.superpowers/loops/progress.md', '$.observed.run_log.path', errors)
      validateEpoch(runLog.epoch, '$.observed.run_log.epoch', errors)
      literal(runLog.role, 'observation-only', '$.observed.run_log.role', errors)
    }
  }

  const preconditions = exactObject(
    plan.preconditions,
    '$.preconditions',
    ['registry_epoch', 'loop_doc_epoch'],
    errors,
  )
  if (preconditions !== null) {
    validateEpoch(preconditions.registry_epoch, '$.preconditions.registry_epoch', errors)
    validateEpoch(preconditions.loop_doc_epoch, '$.preconditions.loop_doc_epoch', errors)
    if (observed !== null && isRecord(observed.registry) &&
        !epochEquals(preconditions.registry_epoch, observed.registry.epoch)) {
      errors.push('$.preconditions.registry_epoch: does not match observed registry epoch')
    }
    if (observed !== null && isRecord(observed.loop_doc) &&
        !epochEquals(preconditions.loop_doc_epoch, observed.loop_doc.epoch)) {
      errors.push('$.preconditions.loop_doc_epoch: does not match observed LOOP.md epoch')
    }
  }

  const operations = strictArray(plan.operations, '$.operations', errors)
  if (operations !== null) {
    const seen = new Set<string>()
    const operationByLoop = new Map<string, string>()
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i]
      validateOperation(operation, `$.operations[${i}]`, errors)
      if (isRecord(operation) && typeof operation.kind === 'string' && typeof operation.loop_id === 'string') {
        const key = `${operation.kind}:${operation.loop_id}`
        if (seen.has(key)) errors.push(`$.operations[${i}]: duplicate operation`)
        seen.add(key)
        const previousKind = operationByLoop.get(operation.loop_id)
        if (previousKind !== undefined && previousKind !== operation.kind) {
          errors.push(`$.operations[${i}]: contradictory operations for ${operation.loop_id}`)
        }
        operationByLoop.set(operation.loop_id, operation.kind)
        if (isRecord(plan.scope) && plan.scope.kind === 'loop' && operation.loop_id !== plan.scope.loop_id) {
          errors.push(`$.operations[${i}].loop_id: outside plan scope`)
        }
      }
    }
  }
  const blockers = strictArray(plan.blockers, '$.blockers', errors)
  if (blockers !== null) {
    for (let i = 0; i < blockers.length; i++) validateBlocker(blockers[i], `$.blockers[${i}]`, errors)
  }
  validateEpoch(plan.expected_loop_doc_epoch, '$.expected_loop_doc_epoch', errors)
  validateDriftReport(plan.drift_report, '$.drift_report', errors)

  if (errors.length === 0) {
    const { plan_id: planId, ...payload } = plan
    const expected = reconciliationPayloadDigest(payload)
    if (planId !== expected) errors.push('$.plan_id: does not match canonical payload sha256')
  }
  return errors
}

function isValidatedReconciliationPlan(
  value: unknown,
  errors: readonly string[],
): value is ReconciliationPlan {
  return errors.length === 0
}

export function decodeReconciliationPlan(input: string | Uint8Array): ReconciliationPlanCodecResult {
  let text: string
  try {
    text = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input)
  } catch {
    return { ok: false, errors: ['$: plan bytes are not valid UTF-8'] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    return { ok: false, errors: [`$: invalid JSON: ${error instanceof Error ? error.message : String(error)}`] }
  }
  const errors = validateReconciliationPlan(parsed)
  return isValidatedReconciliationPlan(parsed, errors)
    ? { ok: true, plan: parsed }
    : { ok: false, errors }
}

export function encodeReconciliationPlan(plan: ReconciliationPlan): string {
  const errors = validateReconciliationPlan(plan)
  if (errors.length > 0) throw new ReconciliationPlanCodecError(errors)
  return canonicalReconciliationJson(plan)
}
