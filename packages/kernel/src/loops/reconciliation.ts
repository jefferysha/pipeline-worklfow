import { createHash } from 'node:crypto'
import type { DriftItem, DriftReport } from './drift.js'
import type { LoopEntry } from './types.js'

export const RECONCILIATION_PLAN_KIND = 'loop-reconciliation-plan' as const
export const RECONCILIATION_PLAN_SCHEMA_VERSION = 1 as const
export const RECONCILIATION_TARGET = 'LOOP.md' as const
export const MANAGED_LOOP_SECTION_OWNERSHIP = 'pipeline-loop-mirror-v1' as const

const SHA256_RE = /^[a-f0-9]{64}$/
const LOOP_ID_RE = /^[a-z][a-z0-9-]*$/
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const MANAGED_MARKER_RE = /^<!-- PIPELINE:LOOP-MIRROR-V1:(START|END) ([a-z][a-z0-9-]*) -->$/

export type ResourceEpoch =
  | { readonly kind: 'absent' }
  | { readonly kind: 'sha256'; readonly value: string }

export type ReconciliationScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'loop'; readonly loop_id: string }

export type ReconciliationOperation =
  | {
      readonly kind: 'ensure-managed-loop-section'
      readonly target: typeof RECONCILIATION_TARGET
      readonly loop_id: string
    }
  | {
      readonly kind: 'remove-managed-loop-section'
      readonly target: typeof RECONCILIATION_TARGET
      readonly loop_id: string
      readonly ownership: typeof MANAGED_LOOP_SECTION_OWNERSHIP
    }

export type ReconciliationBlockerReason =
  | 'historical-fact-immutable'
  | 'runtime-remediation-required'
  | 'ambiguous-authority'
  | 'unowned-document-section'
  | 'managed-section-corrupt'

export interface ReconciliationBlocker {
  readonly drift: DriftItem
  readonly reason: ReconciliationBlockerReason
  readonly next_step: string
}

export interface ReconciliationPlan {
  readonly kind: typeof RECONCILIATION_PLAN_KIND
  readonly schema_version: typeof RECONCILIATION_PLAN_SCHEMA_VERSION
  readonly plan_id: string
  readonly generated_at: string
  readonly scope: ReconciliationScope
  readonly observed: {
    readonly registry: { readonly path: '.pipeline/loops.yaml'; readonly epoch: ResourceEpoch }
    readonly loop_doc: { readonly path: typeof RECONCILIATION_TARGET; readonly epoch: ResourceEpoch }
    readonly run_log: {
      readonly path: '.superpowers/loops/progress.md'
      readonly epoch: ResourceEpoch
      readonly role: 'observation-only'
    }
  }
  readonly preconditions: {
    readonly registry_epoch: ResourceEpoch
    readonly loop_doc_epoch: ResourceEpoch
  }
  readonly operations: readonly ReconciliationOperation[]
  readonly blockers: readonly ReconciliationBlocker[]
  readonly expected_loop_doc_epoch: ResourceEpoch
  readonly drift_report: DriftReport
}

export type ReconciliationPlanPayload = Omit<ReconciliationPlan, 'plan_id'>

export interface BuildReconciliationPlanInput {
  readonly generated_at: string
  readonly scope: ReconciliationScope
  readonly loops: readonly LoopEntry[]
  readonly registry_epoch: ResourceEpoch
  readonly run_log_epoch: ResourceEpoch
  readonly loop_doc_bytes: Uint8Array | null
  readonly drift_report: DriftReport
}

export interface ApplyReconciliationOperationsInput {
  readonly loop_doc_bytes: Uint8Array | null
  readonly loops: readonly LoopEntry[]
  readonly operations: readonly ReconciliationOperation[]
}

export type ApplyReconciliationOperationsResult =
  | {
      readonly ok: true
      readonly bytes: Uint8Array
      readonly changed: boolean
      readonly epoch: ResourceEpoch
    }
  | {
      readonly ok: false
      readonly reason: 'invalid-operation' | 'managed-section-corrupt'
      readonly detail: string
    }

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  for (let i = 0; i < left.byteLength; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

export function resourceEpoch(bytes: Uint8Array | null): ResourceEpoch {
  if (bytes === null) return { kind: 'absent' }
  return { kind: 'sha256', value: createHash('sha256').update(bytes).digest('hex') }
}

function copyEpoch(epoch: ResourceEpoch): ResourceEpoch {
  return epoch.kind === 'absent' ? { kind: 'absent' } : { kind: 'sha256', value: epoch.value }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON does not support non-finite numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
  }
  throw new TypeError(`canonical JSON does not support ${typeof value}`)
}

export function reconciliationPlanId(payload: ReconciliationPlanPayload): string {
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

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
const BLOCKER_REASONS = new Set<ReconciliationBlockerReason>([
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
  if (typeof blocker.reason !== 'string' || !BLOCKER_REASONS.has(blocker.reason as ReconciliationBlockerReason)) {
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
    const expected = reconciliationPlanId(payload as unknown as ReconciliationPlanPayload)
    if (planId !== expected) errors.push('$.plan_id: does not match canonical payload sha256')
  }
  return errors
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
  return errors.length === 0
    ? { ok: true, plan: parsed as ReconciliationPlan }
    : { ok: false, errors }
}

export function encodeReconciliationPlan(plan: ReconciliationPlan): string {
  const errors = validateReconciliationPlan(plan)
  if (errors.length > 0) throw new ReconciliationPlanCodecError(errors)
  return canonicalJson(plan)
}

export function managedLoopSectionMarkers(loopId: string): { readonly start: string; readonly end: string } {
  return {
    start: `<!-- PIPELINE:LOOP-MIRROR-V1:START ${loopId} -->`,
    end: `<!-- PIPELINE:LOOP-MIRROR-V1:END ${loopId} -->`,
  }
}

function renderManagedLoopSection(loop: LoopEntry): Uint8Array {
  const markers = managedLoopSectionMarkers(loop.id)
  return encoder.encode([
    markers.start,
    `### \`${loop.id}\` — pipeline-managed loop mirror`,
    '',
    '> Source of truth: `.pipeline/loops.yaml`. Edit the registry, not this managed section.',
    markers.end,
    '',
  ].join('\n'))
}

function appendSection(current: Uint8Array, section: Uint8Array): Uint8Array {
  if (current.byteLength === 0) return section
  const endsLf = current[current.byteLength - 1] === 0x0a
  const endsBlankLine = endsLf && current.byteLength >= 2 && current[current.byteLength - 2] === 0x0a
  const separator = encoder.encode(endsBlankLine ? '' : endsLf ? '\n' : '\n\n')
  return concatBytes(current, separator, section)
}

interface ManagedSectionRange {
  readonly start: number
  readonly end: number
}

type ManagedSectionScan =
  | { readonly ok: true; readonly sections: ReadonlyMap<string, ManagedSectionRange> }
  | { readonly ok: false; readonly detail: string }

function scanManagedSections(bytes: Uint8Array): ManagedSectionScan {
  const sections = new Map<string, ManagedSectionRange>()
  let open: { loop_id: string; start: number } | null = null
  let lineStart = 0
  while (lineStart < bytes.byteLength) {
    let lineEnd = lineStart
    while (lineEnd < bytes.byteLength && bytes[lineEnd] !== 0x0a) lineEnd++
    const nextLine = lineEnd < bytes.byteLength ? lineEnd + 1 : lineEnd
    const contentEnd = lineEnd > lineStart && bytes[lineEnd - 1] === 0x0d ? lineEnd - 1 : lineEnd
    const line = decoder.decode(bytes.subarray(lineStart, contentEnd))
    const marker = line.match(MANAGED_MARKER_RE)
    if (marker === null && line.includes('<!-- PIPELINE:LOOP-MIRROR-V1:')) {
      return { ok: false, detail: `malformed managed marker at byte ${lineStart}` }
    }
    if (marker !== null) {
      const kind = marker[1]!
      const loopId = marker[2]!
      if (kind === 'START') {
        if (open !== null) {
          return { ok: false, detail: `nested managed sections ${open.loop_id} and ${loopId}` }
        }
        open = { loop_id: loopId, start: lineStart }
      } else {
        if (open === null) return { ok: false, detail: `managed END marker for ${loopId} has no START` }
        if (open.loop_id !== loopId) {
          return { ok: false, detail: `managed marker ids do not match: ${open.loop_id} and ${loopId}` }
        }
        if (sections.has(loopId)) {
          return { ok: false, detail: `duplicate managed section for ${loopId}` }
        }
        sections.set(loopId, { start: open.start, end: nextLine })
        open = null
      }
    }
    lineStart = nextLine
  }
  if (open !== null) return { ok: false, detail: `managed START marker for ${open.loop_id} has no END` }
  return { ok: true, sections }
}

export function applyReconciliationOperations(
  input: ApplyReconciliationOperationsInput,
): ApplyReconciliationOperationsResult {
  const before: Uint8Array = input.loop_doc_bytes === null ? new Uint8Array() : new Uint8Array(input.loop_doc_bytes)
  let current: Uint8Array = before
  let changed = false
  const initialScan = scanManagedSections(current)
  if (!initialScan.ok) {
    return { ok: false, reason: 'managed-section-corrupt', detail: initialScan.detail }
  }

  for (const operation of input.operations) {
    if (operation.target !== RECONCILIATION_TARGET || !LOOP_ID_RE.test(operation.loop_id)) {
      return { ok: false, reason: 'invalid-operation', detail: 'operation target or loop_id is invalid' }
    }
    if (operation.kind === 'ensure-managed-loop-section') {
      const loop = input.loops.find((entry) => entry.id === operation.loop_id)
      if (loop === undefined) {
        return { ok: false, reason: 'invalid-operation', detail: `unknown loop ${operation.loop_id}` }
      }
      const scan = scanManagedSections(current)
      if (!scan.ok) return { ok: false, reason: 'managed-section-corrupt', detail: scan.detail }
      const section = renderManagedLoopSection(loop)
      const range = scan.sections.get(operation.loop_id)
      const next = range === undefined
        ? appendSection(current, section)
        : concatBytes(current.subarray(0, range.start), section, current.subarray(range.end))
      if (!bytesEqual(current, next)) changed = true
      current = next
      continue
    }
    if (operation.kind === 'remove-managed-loop-section') {
      if (operation.ownership !== MANAGED_LOOP_SECTION_OWNERSHIP) {
        return { ok: false, reason: 'invalid-operation', detail: 'remove operation ownership is invalid' }
      }
      const scan = scanManagedSections(current)
      if (!scan.ok) return { ok: false, reason: 'managed-section-corrupt', detail: scan.detail }
      const range = scan.sections.get(operation.loop_id)
      if (range !== undefined) {
        current = concatBytes(current.subarray(0, range.start), current.subarray(range.end))
        changed = true
      }
      continue
    }
    return { ok: false, reason: 'invalid-operation', detail: 'unknown operation kind' }
  }

  const epoch = input.loop_doc_bytes === null && !changed ? { kind: 'absent' as const } : resourceEpoch(current)
  return {
    ok: true,
    bytes: current,
    changed: changed && (!bytesEqual(before, current) || input.loop_doc_bytes === null),
    epoch,
  }
}

function inScope(item: DriftItem, scope: ReconciliationScope): boolean {
  return scope.kind === 'all' || item.loop === '*' || item.loop === scope.loop_id
}

function nonDocumentBlocker(item: DriftItem): ReconciliationBlocker | null {
  switch (item.dimension) {
    case 'runlog-orphan-id':
      return {
        drift: { ...item },
        reason: 'historical-fact-immutable',
        next_step: 'Keep the run log immutable; register the loop or correct future run attribution.',
      }
    case 'never-run':
    case 'cadence-idle':
    case 'status-drift':
      return {
        drift: { ...item },
        reason: 'runtime-remediation-required',
        next_step: 'Inspect scheduling and runtime state; reconciliation does not start, stop, or replay runs.',
      }
    case 'change-prefix':
      return {
        drift: { ...item },
        reason: 'ambiguous-authority',
        next_step: 'Decide whether the registry declaration or future change attribution should be corrected.',
      }
    case 'mirror-missing':
    case 'mirror-orphan':
      return null
  }
}

export function buildReconciliationPlan(input: BuildReconciliationPlanInput): ReconciliationPlan {
  const operations: ReconciliationOperation[] = []
  const blockers: ReconciliationBlocker[] = []
  const managed = scanManagedSections(input.loop_doc_bytes ?? new Uint8Array())
  for (const item of input.drift_report.items) {
    if (!inScope(item, input.scope)) continue
    if (item.dimension === 'mirror-missing') {
      if (!managed.ok) {
        blockers.push({
          drift: { ...item },
          reason: 'managed-section-corrupt',
          next_step: `Repair LOOP.md ownership markers before applying changes: ${managed.detail}`,
        })
        continue
      }
      const loops = item.loop === '*'
        ? input.loops.filter((entry) => input.scope.kind === 'all' || entry.id === input.scope.loop_id)
        : input.loops.filter((entry) => entry.id === item.loop)
      for (const loop of loops) {
        operations.push({ kind: 'ensure-managed-loop-section', target: RECONCILIATION_TARGET, loop_id: loop.id })
      }
      continue
    }
    if (item.dimension === 'mirror-orphan') {
      if (managed.ok && managed.sections.has(item.loop)) {
        operations.push({
          kind: 'remove-managed-loop-section',
          target: RECONCILIATION_TARGET,
          loop_id: item.loop,
          ownership: MANAGED_LOOP_SECTION_OWNERSHIP,
        })
      } else {
        blockers.push({
          drift: { ...item },
          reason: managed.ok ? 'unowned-document-section' : 'managed-section-corrupt',
          next_step: managed.ok
            ? 'Preserve the handwritten section; remove or reconcile it manually.'
            : `Repair LOOP.md ownership markers before applying changes: ${managed.detail}`,
        })
      }
      continue
    }
    const blocker = nonDocumentBlocker(item)
    if (blocker !== null) blockers.push(blocker)
  }

  const loopDocEpoch = resourceEpoch(input.loop_doc_bytes)
  let expectedLoopDocEpoch = loopDocEpoch
  if (operations.length > 0) {
    const transformed = applyReconciliationOperations({
      loop_doc_bytes: input.loop_doc_bytes,
      loops: input.loops,
      operations,
    })
    if (!transformed.ok) throw new TypeError(transformed.detail)
    expectedLoopDocEpoch = transformed.epoch
  }
  const scopedItems = input.drift_report.items.filter((item) => inScope(item, input.scope))
  const driftReport: DriftReport = {
    version: 1,
    generated_at: input.drift_report.generated_at,
    clean: scopedItems.every((item) => item.severity !== 'warn'),
    checked: input.scope.kind === 'all' ? [...input.drift_report.checked] : [input.scope.loop_id],
    items: scopedItems.map((item) => ({ ...item })),
  }
  const registryEpoch = copyEpoch(input.registry_epoch)
  const runLogEpoch = copyEpoch(input.run_log_epoch)
  const payload: ReconciliationPlanPayload = {
    kind: RECONCILIATION_PLAN_KIND,
    schema_version: RECONCILIATION_PLAN_SCHEMA_VERSION,
    generated_at: input.generated_at,
    scope: input.scope.kind === 'all' ? { kind: 'all' } : { kind: 'loop', loop_id: input.scope.loop_id },
    observed: {
      registry: { path: '.pipeline/loops.yaml', epoch: registryEpoch },
      loop_doc: { path: RECONCILIATION_TARGET, epoch: copyEpoch(loopDocEpoch) },
      run_log: {
        path: '.superpowers/loops/progress.md',
        epoch: runLogEpoch,
        role: 'observation-only',
      },
    },
    preconditions: {
      registry_epoch: copyEpoch(registryEpoch),
      loop_doc_epoch: copyEpoch(loopDocEpoch),
    },
    operations,
    blockers,
    expected_loop_doc_epoch: copyEpoch(expectedLoopDocEpoch),
    drift_report: driftReport,
  }
  return { ...payload, plan_id: reconciliationPlanId(payload) }
}
