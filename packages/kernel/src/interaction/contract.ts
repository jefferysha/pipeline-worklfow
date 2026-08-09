/**
 * Privacy-minimised, versioned interaction observability contract.
 *
 * This module intentionally contains no filesystem, process or protocol imports.  The JSONL
 * projection is an adapter concern; this file is the stable domain vocabulary consumed by CLI,
 * server and future automation surfaces.
 */
export const INTERACTION_EVENT_SCHEMA = 'tenon-interaction-event/v1' as const
export const INTERACTION_SCORECARD_SCHEMA = 'tenon-interaction-scorecard/v1' as const
export const INTERACTION_PROJECTION_FILE = '.pipeline-interactions.jsonl' as const
export const INTERACTION_PROJECTION_WRITE_FAILED = 'interaction-projection-write-failed' as const
export const INTERACTION_MAX_CODE_LENGTH = 128 as const

export const INTERACTION_ACTORS = ['human', 'agent', 'automation', 'system'] as const
export type InteractionActor = typeof INTERACTION_ACTORS[number]

export const INTERACTION_SURFACES = ['plugin-chat', 'cli', 'api-sse', 'dashboard'] as const
export type InteractionSurface = typeof INTERACTION_SURFACES[number]

export const INTERACTION_EXECUTION_MODES = ['interactive', 'afk'] as const
export type InteractionExecutionMode = typeof INTERACTION_EXECUTION_MODES[number]

export const INTERACTION_WORKFLOW_MODES = ['default', 'custom'] as const
export type InteractionWorkflowMode = typeof INTERACTION_WORKFLOW_MODES[number]

export const INTERACTION_TRACK_KINDS = ['built-in', 'free', 'custom'] as const
export type InteractionTrackKind = typeof INTERACTION_TRACK_KINDS[number]

export const INTERACTION_PIPELINE_STAGES = [
  'open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive', 'custom',
] as const
export type InteractionPipelineStage = typeof INTERACTION_PIPELINE_STAGES[number]

export const INTERACTION_CONTROL_STAGES = [
  'assessment', 'admission', 'execution', 'verification', 'correction', 'revalidation', 'exact-resume',
] as const
export type InteractionControlStage = typeof INTERACTION_CONTROL_STAGES[number]

export const INTERACTION_EVENTS = [
  'review.requested',
  'review.prompt-suppressed',
  'review.acknowledged',
  'review.effect-applied',
  'resume.validated',
  'operation.failed',
] as const
export type InteractionEventName = typeof INTERACTION_EVENTS[number]

export const INTERACTION_RESULTS = ['success', 'suppressed', 'rejected', 'failure'] as const
export type InteractionResult = typeof INTERACTION_RESULTS[number]

export const INTERACTION_REASON_CODES = [
  'review.required', 'review.same-state-repeat', 'decision.accepted', 'decision.state-stale',
  'effect.applied', 'effect.failed', 'resume.valid', 'resume.state-mismatch',
  'projection.sequence-gap', 'projection.hash-mismatch', 'projection.malformed-order',
] as const
export type InteractionReasonCode = string

export const INTERACTION_TRIGGER_CODES = [
  'review.exit-requested', 'review.acknowledge', 'transition.approved', 'session.activate',
] as const
export type InteractionTriggerCode = string

export const INTERACTION_EFFECT_CODES = [
  'review-gate.pending', 'review-gate.approved', 'review-gate.rejected', 'transition.applied', 'resume.bound',
] as const
export type InteractionEffectCode = string

export const INTERACTION_OUTCOME_CODES = [
  'review.requested', 'review.prompt-suppressed', 'review.acknowledged',
  'review.effect-applied', 'resume.valid', 'resume.state-mismatch', 'operation.failed',
] as const
export type InteractionOutcomeCode = string

export const INTERACTION_DIAGNOSTICS = [
  'sequence-gap',
  'hash-chain-mismatch',
  'malformed-order',
  'state-discontinuity',
  'accepted-stale-decision',
  'same-state-repeated-prompt',
  'invalid-resume',
  'incomplete-success-journey',
  'projection-unavailable',
  'event-schema-invalid',
] as const
export type InteractionDiagnosticCode = typeof INTERACTION_DIAGNOSTICS[number]

const HASH_RE = /^(?:sha256:)?[0-9a-f]{64}$/
const EXTENSION_CODE_RE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

export interface InteractionStepVisit {
  readonly runId: string
  readonly transitionSequence: number
  readonly step?: string
}

/** Camel-case domain event.  Its wire representation is the closed snake_case object below. */
export interface InteractionEventV1 {
  readonly schema: typeof INTERACTION_EVENT_SCHEMA
  readonly eventId: string
  readonly sequence: number
  readonly previousEventHash: string | null
  readonly journeyId: string
  readonly occurredAt: string
  readonly change: string
  readonly runId: string
  readonly workflow: string
  readonly workflowHash: string
  readonly originStepVisit: InteractionStepVisit
  readonly stepVisit: InteractionStepVisit
  readonly stateBeforeHash: string
  readonly stateAfterHash: string
  readonly actor: InteractionActor
  readonly surface: InteractionSurface
  readonly executionMode: InteractionExecutionMode
  readonly workflowMode: InteractionWorkflowMode
  readonly track: string
  readonly trackKind: InteractionTrackKind
  readonly pipelineStage: InteractionPipelineStage
  readonly controlStage: InteractionControlStage
  readonly event: InteractionEventName
  readonly reasonCode: InteractionReasonCode
  readonly triggerCode: InteractionTriggerCode
  readonly effectCode: InteractionEffectCode
  readonly result: InteractionResult
  readonly outcomeCode: InteractionOutcomeCode
  readonly durationMs: number
}

export interface InteractionEventV1Wire {
  readonly schema: typeof INTERACTION_EVENT_SCHEMA
  readonly event_id: string
  readonly sequence: number
  readonly previous_event_hash: string | null
  readonly journey_id: string
  readonly occurred_at: string
  readonly change: string
  readonly run_id: string
  readonly workflow: string
  readonly workflow_hash: string
  readonly origin_step_visit: {
    readonly run_id: string
    readonly transition_sequence: number
    readonly step?: string
  }
  readonly step_visit: {
    readonly run_id: string
    readonly transition_sequence: number
    readonly step?: string
  }
  readonly state_before_hash: string
  readonly state_after_hash: string
  readonly actor: InteractionActor
  readonly surface: InteractionSurface
  readonly execution_mode: InteractionExecutionMode
  readonly workflow_mode: InteractionWorkflowMode
  readonly track: string
  readonly track_kind: InteractionTrackKind
  readonly pipeline_stage: InteractionPipelineStage
  readonly control_stage: InteractionControlStage
  readonly event: InteractionEventName
  readonly reason_code: string
  readonly trigger_code: string
  readonly effect_code: string
  readonly result: InteractionResult
  readonly outcome_code: string
  readonly duration_ms: number
}

export interface InteractionEventDraft extends Omit<InteractionEventV1,
  'schema' | 'eventId' | 'journeyId'> {
  readonly eventId?: string
  readonly journeyId?: string
}

export interface InteractionDiagnostic {
  readonly code: InteractionDiagnosticCode
  readonly journeyId?: string
  readonly sequence?: number
}

export interface InteractionJourneyReplay {
  readonly journeyId: string
  readonly requestCount: number
  readonly deliveredRequests: number
  readonly suppressedRequests: number
  readonly started: boolean
  readonly acknowledged: boolean
  readonly effectApplied: boolean
  readonly validResume: boolean
  readonly failed: boolean
  readonly staleRejected: boolean
  readonly firstRequestAt?: string
  readonly validResumeAt?: string
  readonly requestStateAfter?: string
  readonly effectStateAfter?: string
  readonly diagnostics: readonly InteractionDiagnostic[]
}

export interface InteractionReplayResult {
  readonly events: readonly InteractionEventV1[]
  readonly journeys: readonly InteractionJourneyReplay[]
  readonly diagnostics: readonly InteractionDiagnostic[]
  readonly eventCompleteness: number
  readonly acceptedStaleDecisions: number
  readonly sameStateRepeatedPrompts: number
  readonly invalidResumes: number
  readonly unclassifiedCodes: readonly string[]
}

export interface InteractionFixtureExpected {
  readonly valid: boolean
  readonly diagnostics: readonly InteractionDiagnosticCode[]
}

export interface InteractionFixtureManifestEntry {
  readonly id: string
  readonly mode: 'measurement' | 'negative-control'
  readonly file: string
  readonly expected: InteractionFixtureExpected
}

export interface InteractionFixtureManifest {
  readonly schema: typeof INTERACTION_EVENT_SCHEMA
  readonly dimensions: {
    readonly executionMode: readonly InteractionExecutionMode[]
    readonly workflowMode: readonly InteractionWorkflowMode[]
    readonly trackKind: readonly InteractionTrackKind[]
    readonly pipelineStage: readonly InteractionPipelineStage[]
    readonly controlStage: readonly InteractionControlStage[]
    readonly surface: readonly InteractionSurface[]
  }
  readonly fixtures: readonly InteractionFixtureManifestEntry[]
}

export interface InteractionScorecardFixture {
  readonly id: string
  readonly mode: 'measurement' | 'negative-control'
  readonly valid: boolean
  readonly diagnostics: readonly InteractionDiagnosticCode[]
  readonly eventCompleteness: number
}

export interface InteractionScorecardV1 {
  readonly schema: typeof INTERACTION_SCORECARD_SCHEMA
  readonly fixtures: readonly InteractionScorecardFixture[]
  readonly metrics: {
    readonly governedCompletionRate: number | null
    readonly humanInterruptionsPerVerifiedCompletion: number | null
    readonly medianTimeToValidResumeMs: number | null
  }
  readonly eventCompleteness: number
  readonly acceptedStaleDecisions: number
  readonly sameStateRepeatedPrompts: number
  readonly invalidResumes: number
  readonly diagnostics: Readonly<Record<InteractionDiagnosticCode, number>>
  readonly unclassifiedCodes: readonly string[]
}

export function isInteractionExtensionCode(value: string): boolean {
  return value.length <= INTERACTION_MAX_CODE_LENGTH && EXTENSION_CODE_RE.test(value)
}

export function isInteractionHash(value: string): boolean {
  return HASH_RE.test(value)
}

export function normalizedInteractionHash(value: string): string {
  return value.startsWith('sha256:') ? value.slice('sha256:'.length) : value
}

export function stableInteractionStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableInteractionStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableInteractionStringify(record[key])}`).join(',')}}`
}

export function interactionEventBody(event: InteractionEventV1Wire): Omit<InteractionEventV1Wire, 'event_id'> {
  const { event_id: _eventId, ...body } = event
  return body
}

export function interactionEventId(event: Omit<InteractionEventV1Wire, 'event_id'>): string {
  return `sha256:${sha256Hex(stableInteractionStringify(event))}`
}

export function interactionJourneyId(input: {
  readonly change: string
  readonly runId: string
  readonly originStepVisit: InteractionStepVisit
  readonly reviewEvent: string
  readonly requestedAt: string
}): string {
  return `sha256:${sha256Hex(stableInteractionStringify(input))}`
}

export function interactionLineHash(raw: string): string {
  return `sha256:${sha256Hex(raw)}`
}

// Small synchronous SHA-256 implementation keeps the interaction domain independent from Node's
// fs/crypto APIs.  It is deliberately local rather than exposing a general-purpose crypto layer;
// all callers hash canonical UTF-8 strings only.
function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const words = new Uint32Array(64)
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const bitLength = bytes.length * 8
  const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const high = Math.floor(bitLength / 0x100000000)
  const low = bitLength >>> 0
  padded[padded.length - 8] = high >>> 24
  padded[padded.length - 7] = high >>> 16
  padded[padded.length - 6] = high >>> 8
  padded[padded.length - 5] = high
  padded[padded.length - 4] = low >>> 24
  padded[padded.length - 3] = low >>> 16
  padded[padded.length - 2] = low >>> 8
  padded[padded.length - 1] = low
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const at = offset + index * 4
      words[index] = ((padded[at] ?? 0) << 24) | ((padded[at + 1] ?? 0) << 16)
        | ((padded[at + 2] ?? 0) << 8) | (padded[at + 3] ?? 0)
    }
    for (let index = 16; index < 64; index += 1) {
      const value = words[index - 15] ?? 0
      const sigma0 = rotr(value, 7) ^ rotr(value, 18) ^ (value >>> 3)
      const prior = words[index - 2] ?? 0
      const sigma1 = rotr(prior, 17) ^ rotr(prior, 19) ^ (prior >>> 10)
      words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0
    }
    let a = state[0] ?? 0
    let b = state[1] ?? 0
    let c = state[2] ?? 0
    let d = state[3] ?? 0
    let e = state[4] ?? 0
    let f = state[5] ?? 0
    let g = state[6] ?? 0
    let h = state[7] ?? 0
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temp1 = (h + sum1 + choose + (constants[index] ?? 0) + (words[index] ?? 0)) >>> 0
      const sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    state[0] = ((state[0] ?? 0) + a) >>> 0
    state[1] = ((state[1] ?? 0) + b) >>> 0
    state[2] = ((state[2] ?? 0) + c) >>> 0
    state[3] = ((state[3] ?? 0) + d) >>> 0
    state[4] = ((state[4] ?? 0) + e) >>> 0
    state[5] = ((state[5] ?? 0) + f) >>> 0
    state[6] = ((state[6] ?? 0) + g) >>> 0
    state[7] = ((state[7] ?? 0) + h) >>> 0
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, '0')).join('')
}

export function expectedInteractionResult(event: InteractionEventName): readonly InteractionResult[] {
  switch (event) {
    case 'review.requested': return ['success']
    case 'review.prompt-suppressed': return ['suppressed']
    case 'review.acknowledged': return ['success', 'rejected']
    case 'review.effect-applied': return ['success', 'failure']
    case 'resume.validated': return ['success', 'rejected']
    case 'operation.failed': return ['failure']
  }
}
