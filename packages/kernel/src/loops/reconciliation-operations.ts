import type { DriftItem, DriftReport } from './drift.js'
import type { LoopEntry } from './types.js'
import type { ApplyReconciliationOperationsInput, ApplyReconciliationOperationsResult, BuildReconciliationPlanInput, ReconciliationBlocker, ReconciliationOperation, ReconciliationPlan, ReconciliationPlanPayload, ReconciliationScope, ResourceEpoch } from './reconciliation-types.js'
import { MANAGED_LOOP_SECTION_OWNERSHIP, RECONCILIATION_PLAN_KIND, RECONCILIATION_PLAN_SCHEMA_VERSION, RECONCILIATION_TARGET } from './reconciliation-types.js'
import { copyResourceEpoch, reconciliationPlanId, resourceEpoch } from './reconciliation-hash.js'

const LOOP_ID_RE = /^[a-z][a-z0-9-]*$/
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const MANAGED_MARKER_RE = /^<!-- PIPELINE:LOOP-MIRROR-V1:(START|END) ([a-z][a-z0-9-]*) -->$/

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  return left.every((value, index) => value === right[index])
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.byteLength }
  return out
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
    `### \`${loop.id}\` — Pipeline 管理的 Loop 镜像`,
    '',
    '> 真相源：`.pipeline/loops.yaml`。请修改登记表，不要直接编辑这个受管段落。',
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
      const kind = marker[1]
      const loopId = marker[2]
      if (kind === undefined || loopId === undefined) {
        return { ok: false, detail: `malformed managed marker at byte ${lineStart}` }
      }
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
      const range = scan.sections.get(operation.loop_id)
      if (range !== undefined) continue
      const next = appendSection(current, renderManagedLoopSection(loop))
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
  const registryEpoch = copyResourceEpoch(input.registry_epoch)
  const runLogEpoch = copyResourceEpoch(input.run_log_epoch)
  const payload: ReconciliationPlanPayload = {
    kind: RECONCILIATION_PLAN_KIND,
    schema_version: RECONCILIATION_PLAN_SCHEMA_VERSION,
    generated_at: input.generated_at,
    scope: input.scope.kind === 'all' ? { kind: 'all' } : { kind: 'loop', loop_id: input.scope.loop_id },
    observed: {
      registry: { path: '.pipeline/loops.yaml', epoch: registryEpoch },
      loop_doc: { path: RECONCILIATION_TARGET, epoch: copyResourceEpoch(loopDocEpoch) },
      run_log: {
        path: '.superpowers/loops/progress.md',
        epoch: runLogEpoch,
        role: 'observation-only',
      },
    },
    preconditions: {
      registry_epoch: copyResourceEpoch(registryEpoch),
      loop_doc_epoch: copyResourceEpoch(loopDocEpoch),
    },
    operations,
    blockers,
    expected_loop_doc_epoch: copyResourceEpoch(expectedLoopDocEpoch),
    drift_report: driftReport,
  }
  return { ...payload, plan_id: reconciliationPlanId(payload) }
}
