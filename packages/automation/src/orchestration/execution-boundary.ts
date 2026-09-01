import {
  decodeSkillResultEnvelopeV1,
  decodeValidationReportV1,
  type ValidationReportV1,
  type SkillResultEnvelopeV1,
} from '@tenon/kernel'
import { JsonBoundaryError, snapshotJsonBoundary } from './jsonBoundary.js'
import {
  DEFAULT_SKILL_OUTPUT_MAX_BYTES,
  type CapabilityExecutionHost,
  type PreparedRun,
  type RuntimeRecord,
  type SkillExecutionObservationV1,
  type SkillValidationDecisionV1,
} from './execution-types.js'

const DECISION_MAX_BYTES = 64 * 1_024
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u

function isRecord(value: import('./jsonBoundary.js').JsonBoundaryValue | undefined): value is RuntimeRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: RuntimeRecord, allowed: readonly string[]): boolean {
  const accepted = new Set(allowed)
  return Object.keys(value).every((key) => accepted.has(key))
}

function safeId(value: import('./jsonBoundary.js').JsonBoundaryValue | undefined): value is string {
  return typeof value === 'string' && SAFE_ID.test(value)
}

function safeRef(value: import('./jsonBoundary.js').JsonBoundaryValue | undefined): value is string {
  return typeof value === 'string' && SAFE_REF.test(value) && !value.includes('..')
}

export function normalizeExecutionObservation(raw: unknown, maxBytes = DEFAULT_SKILL_OUTPUT_MAX_BYTES):
  | { readonly ok: true; readonly observation: SkillExecutionObservationV1 }
  | { readonly ok: false; readonly issue: string } {
  let snapshot
  try {
    snapshot = snapshotJsonBoundary(raw, { maxBytes, maxDepth: 40, maxNodes: 8_192 })
  } catch (error) {
    return { ok: false, issue: error instanceof JsonBoundaryError ? error.code : 'observation-invalid' }
  }
  const record = isRecord(snapshot.value) ? snapshot.value : undefined
  if (
    record === undefined
    || !hasOnlyKeys(record, ['output', 'raw_output_ref', 'artifacts', 'summary', 'diagnostics'])
  ) return { ok: false, issue: 'observation-shape-invalid' }
  const decoded = decodeSkillResultEnvelopeV1({
    schema_version: 'skill-result/v1',
    result_id: 'observation-boundary',
    run_id: 'run-boundary',
    status: 'completed',
    contract_status: 'unknown',
    ...(record.summary === undefined ? {} : { summary: record.summary }),
    artifacts: record.artifacts,
    diagnostics: record.diagnostics,
    produced_at: '2026-01-01T00:00:00.000Z',
  })
  if (!decoded.ok) return { ok: false, issue: 'observation-artifacts-invalid' }
  if (!Object.prototype.hasOwnProperty.call(record, 'output')) return { ok: false, issue: 'observation-output-missing' }
  if (record.raw_output_ref !== undefined && !safeRef(record.raw_output_ref)) return { ok: false, issue: 'raw-output-ref-invalid' }
  return {
    ok: true,
    observation: {
      output: record.output,
      ...(record.raw_output_ref === undefined ? {} : { raw_output_ref: record.raw_output_ref }),
      artifacts: decoded.value.artifacts,
      ...(decoded.value.summary === undefined ? {} : { summary: decoded.value.summary }),
      diagnostics: decoded.value.diagnostics,
    },
  }
}

export function normalizeValidationDecision(
  raw: unknown,
  workItemId: string,
): { readonly ok: true; readonly decision: SkillValidationDecisionV1 } | { readonly ok: false; readonly issue: string } {
  let snapshot
  try {
    snapshot = snapshotJsonBoundary(raw, { maxBytes: DECISION_MAX_BYTES, maxDepth: 24, maxNodes: 2_048 })
  } catch (error) {
    return { ok: false, issue: error instanceof JsonBoundaryError ? error.code : 'validator-output-invalid' }
  }
  const record = isRecord(snapshot.value) ? snapshot.value : undefined
  if (
    record === undefined
    || !hasOnlyKeys(record, ['contract_status', 'output_schema_id', 'diagnostics', 'report'])
  ) return { ok: false, issue: 'validator-output-shape-invalid' }
  const status = record.contract_status
  if (status !== 'validated' && status !== 'unknown' && status !== 'invalid') return { ok: false, issue: 'validator-contract-status-invalid' }
  if (!Array.isArray(record.diagnostics) || record.diagnostics.some((value) => typeof value !== 'string')) {
    return { ok: false, issue: 'validator-diagnostics-invalid' }
  }
  if (record.output_schema_id !== undefined && !safeId(record.output_schema_id)) return { ok: false, issue: 'validator-schema-id-invalid' }
  let report: ValidationReportV1 | undefined
  if (record.report !== undefined) {
    const decoded = decodeValidationReportV1(record.report)
    if (!decoded.ok) return { ok: false, issue: 'validator-report-invalid' }
    if (decoded.value.work_item_id !== workItemId) return { ok: false, issue: 'validator-report-binding-mismatch' }
    report = decoded.value
  }
  if (status === 'validated' && report === undefined) return { ok: false, issue: 'validator-report-missing' }
  return {
    ok: true,
    decision: {
      contract_status: status,
      ...(record.output_schema_id === undefined ? {} : { output_schema_id: record.output_schema_id }),
      diagnostics: Object.freeze([...record.diagnostics]),
      ...(report === undefined ? {} : { report }),
    },
  }
}

export function resultFor(
  prepared: PreparedRun,
  observation: SkillExecutionObservationV1 | undefined,
  decision: SkillValidationDecisionV1,
  host: CapabilityExecutionHost,
  errorIssue?: string,
): SkillResultEnvelopeV1 {
  const rawRef = observation?.raw_output_ref
  const artifacts = [...(observation?.artifacts ?? [])]
  if (rawRef !== undefined && !artifacts.some((artifact) => artifact.ref === rawRef)) {
    artifacts.push({ kind: 'unknown', ref: rawRef, label: 'opaque skill output' })
  }
  const diagnostics = [
    ...(observation?.diagnostics ?? []),
    ...decision.diagnostics,
    ...(errorIssue === undefined ? [] : [errorIssue]),
  ]
  const status: SkillResultEnvelopeV1['status'] = errorIssue === undefined
    ? 'completed'
    : errorIssue === 'executor-failed' || errorIssue === 'execution-aborted' ? 'failed' : 'corrupt'
  return {
    schema_version: 'skill-result/v1',
    result_id: prepared.result_id,
    run_id: prepared.run_id,
    status,
    contract_status: errorIssue === undefined ? decision.contract_status : 'invalid',
    ...(decision.output_schema_id === undefined ? {} : { output_schema_id: decision.output_schema_id }),
    ...(observation?.summary === undefined ? {} : { summary: observation.summary }),
    artifacts: Object.freeze(artifacts),
    diagnostics: Object.freeze(diagnostics),
    produced_at: host.clock(),
  }
}
