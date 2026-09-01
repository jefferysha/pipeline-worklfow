import { createHash } from 'node:crypto'
import {
  decodeCapabilityAssessmentV1,
  type CapabilityAssessmentV1,
  type DevelopmentRequestV1,
  type RepositoryContextSnapshotV1,
} from '@tenon/kernel'
import {
  JsonBoundaryError,
  snapshotJsonBoundary,
  type JsonBoundaryValue,
} from './jsonBoundary.js'

export const CAPABILITY_PROPOSAL_REQUEST_SCHEMA = 'capability-proposal-request/v1' as const
export const CAPABILITY_PROPOSAL_EVIDENCE_SCHEMA = 'capability-proposal-evidence/v1' as const
export const DEFAULT_CAPABILITY_PROPOSAL_MAX_BYTES = 256 * 1_024

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u

export interface CapabilityProposalRequestV1 {
  readonly schema_version: typeof CAPABILITY_PROPOSAL_REQUEST_SCHEMA
  readonly request_id: string
  readonly project_id: string
  readonly change_id: string
  readonly intent: string
  readonly context: RepositoryContextSnapshotV1
  readonly user_constraints: readonly string[]
}

export interface CapabilityProposalProvenanceV1 {
  readonly provider: string
  readonly model: string
  readonly invocation_id: string
}

export interface CapabilityProposalInvocationV1 {
  readonly output: unknown
  readonly provenance: CapabilityProposalProvenanceV1
}

export interface CapabilityProposalEvidenceV1 {
  readonly schema_version: typeof CAPABILITY_PROPOSAL_EVIDENCE_SCHEMA
  readonly proposal_id: string
  readonly request_id: string
  readonly context_revision: string
  readonly provenance: CapabilityProposalProvenanceV1
  readonly output_ref: string
  readonly output_digest: `sha256:${string}`
  readonly output_bytes: number
  readonly media_type: 'application/json'
}

export interface CapabilityProposalProvider {
  readonly kind: string
  propose(request: CapabilityProposalRequestV1, signal: AbortSignal): Promise<unknown>
}

export type CapabilityProposalFailureCode =
  | 'request-binding-invalid'
  | 'provider-failed'
  | 'provider-aborted'
  | 'invocation-invalid'
  | 'provider-provenance-mismatch'
  | 'proposal-too-large'
  | 'proposal-invalid'
  | 'proposal-binding-mismatch'
  | 'evidence-invalid'

export type CapabilityProposalOutcome =
  | {
      readonly ok: true
      readonly assessment: CapabilityAssessmentV1
      readonly evidence: CapabilityProposalEvidenceV1
    }
  | {
      readonly ok: false
      readonly code: CapabilityProposalFailureCode
      readonly issues: readonly string[]
      readonly cause?: unknown
    }

export interface CapabilityProposalHostContext {
  readonly proposal_id: string
  readonly assessment_id: string
  readonly assessed_at: string
  readonly output_ref: string
  readonly expected_provider: string
  readonly max_output_bytes?: number
}

function failure(
  code: CapabilityProposalFailureCode,
  issues: readonly string[],
  cause?: unknown,
): CapabilityProposalOutcome {
  return { ok: false, code, issues: Object.freeze([...issues]), ...(cause === undefined ? {} : { cause }) }
}

function record(value: JsonBoundaryValue | undefined): { readonly [key: string]: JsonBoundaryValue } | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as { readonly [key: string]: JsonBoundaryValue }
    : undefined
}

function exactKeys(value: { readonly [key: string]: JsonBoundaryValue }, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function nonEmpty(value: JsonBoundaryValue | undefined, pattern = SAFE_ID): value is string {
  return typeof value === 'string' && pattern.test(value)
}

function validTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
}

export function createCapabilityProposalRequest(
  request: DevelopmentRequestV1,
  context: RepositoryContextSnapshotV1,
  userConstraints: readonly string[] = [],
): CapabilityProposalRequestV1 {
  if (request.project_id !== context.project_id) {
    throw new TypeError('request and repository context must belong to the same project')
  }
  return Object.freeze({
    schema_version: CAPABILITY_PROPOSAL_REQUEST_SCHEMA,
    request_id: request.request_id,
    project_id: request.project_id,
    change_id: request.change_id,
    intent: request.intent,
    context: Object.freeze({ ...context }),
    user_constraints: Object.freeze([...userConstraints]),
  })
}

export function normalizeCapabilityProposal(
  request: DevelopmentRequestV1,
  context: RepositoryContextSnapshotV1,
  invocation: unknown,
  host: CapabilityProposalHostContext,
): CapabilityProposalOutcome {
  if (request.project_id !== context.project_id) {
    return failure('request-binding-invalid', ['context.project_id'])
  }
  if (
    !nonEmpty(host.proposal_id)
    || !nonEmpty(host.assessment_id)
    || !nonEmpty(host.expected_provider)
    || !nonEmpty(host.output_ref, SAFE_REF)
    || host.output_ref.includes('..')
    || !validTimestamp(host.assessed_at)
  ) return failure('evidence-invalid', ['host-evidence'])

  const maxBytes = host.max_output_bytes ?? DEFAULT_CAPABILITY_PROPOSAL_MAX_BYTES
  let invocationSnapshot
  try {
    invocationSnapshot = snapshotJsonBoundary(invocation, {
      maxBytes: maxBytes + 8_192,
      maxDepth: 40,
      maxNodes: 8_192,
    })
  } catch (error) {
    if (error instanceof JsonBoundaryError && error.code === 'json-byte-budget-exceeded') {
      return failure('proposal-too-large', [error.path], error)
    }
    return failure('invocation-invalid', [error instanceof JsonBoundaryError ? error.path : '$'], error)
  }
  const envelope = record(invocationSnapshot.value)
  if (envelope === undefined || !exactKeys(envelope, ['output', 'provenance'])) {
    return failure('invocation-invalid', ['$'])
  }
  const provenance = record(envelope.provenance)
  if (provenance === undefined || !exactKeys(provenance, ['provider', 'model', 'invocation_id'])) {
    return failure('invocation-invalid', ['$.provenance'])
  }
  if (
    !nonEmpty(provenance.provider)
    || !nonEmpty(provenance.model)
    || !nonEmpty(provenance.invocation_id)
  ) return failure('invocation-invalid', ['$.provenance'])
  if (provenance.provider !== host.expected_provider) {
    return failure('provider-provenance-mismatch', ['$.provenance.provider'])
  }

  let outputSnapshot
  try {
    outputSnapshot = snapshotJsonBoundary(envelope.output, { maxBytes })
  } catch (error) {
    if (error instanceof JsonBoundaryError && error.code === 'json-byte-budget-exceeded') {
      return failure('proposal-too-large', [error.path], error)
    }
    return failure('proposal-invalid', [error instanceof JsonBoundaryError ? error.path : '$.output'], error)
  }
  const decoded = decodeCapabilityAssessmentV1(outputSnapshot.value)
  if (!decoded.ok) {
    return failure('proposal-invalid', decoded.errors.map((error) => error.path))
  }
  if (decoded.value.request_id !== request.request_id) {
    return failure('proposal-binding-mismatch', ['$.output.request_id'])
  }
  if (decoded.value.source !== 'model') {
    return failure('proposal-invalid', ['$.output.source'])
  }

  const canonicalProvenance = Object.freeze({
    provider: provenance.provider,
    model: provenance.model,
    invocation_id: provenance.invocation_id,
  })
  const assessment: CapabilityAssessmentV1 = Object.freeze({
    ...decoded.value,
    assessment_id: host.assessment_id,
    request_id: request.request_id,
    source: 'model',
    assessed_at: host.assessed_at,
  })
  const outputDigest = createHash('sha256').update(outputSnapshot.json, 'utf8').digest('hex')
  const evidence: CapabilityProposalEvidenceV1 = Object.freeze({
    schema_version: CAPABILITY_PROPOSAL_EVIDENCE_SCHEMA,
    proposal_id: host.proposal_id,
    request_id: request.request_id,
    context_revision: context.revision,
    provenance: canonicalProvenance,
    output_ref: host.output_ref,
    output_digest: `sha256:${outputDigest}`,
    output_bytes: outputSnapshot.bytes,
    media_type: 'application/json',
  })
  return { ok: true, assessment, evidence }
}

export interface RequestCapabilityAssessmentInput {
  readonly request: DevelopmentRequestV1
  readonly context: RepositoryContextSnapshotV1
  readonly provider: CapabilityProposalProvider
  readonly host: Omit<CapabilityProposalHostContext, 'expected_provider'>
  readonly user_constraints?: readonly string[]
  readonly signal: AbortSignal
}

export async function requestCapabilityAssessment(
  input: RequestCapabilityAssessmentInput,
): Promise<CapabilityProposalOutcome> {
  let proposalRequest: CapabilityProposalRequestV1
  try {
    proposalRequest = createCapabilityProposalRequest(
      input.request,
      input.context,
      input.user_constraints,
    )
  } catch (error) {
    return failure('request-binding-invalid', ['context.project_id'], error)
  }
  if (input.signal.aborted) return failure('provider-aborted', ['$'], input.signal.reason)
  let providerKind: string
  try {
    providerKind = input.provider.kind
  } catch (error) {
    return failure('provider-failed', ['provider.kind'], error)
  }
  if (!nonEmpty(providerKind)) return failure('provider-failed', ['provider.kind'])
  let invocation: unknown
  try {
    invocation = await input.provider.propose(proposalRequest, input.signal)
  } catch (error) {
    return failure(input.signal.aborted ? 'provider-aborted' : 'provider-failed', ['$'], error)
  }
  if (input.signal.aborted) return failure('provider-aborted', ['$'], input.signal.reason)
  return normalizeCapabilityProposal(input.request, input.context, invocation, {
    ...input.host,
    expected_provider: providerKind,
  })
}
