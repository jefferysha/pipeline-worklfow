/** H12 Wave 0 triage contracts. This module is deliberately free of runtime/provider adapters. */

export const TRIAGE_SCHEMA_VERSION = 1 as const

export const OBSERVE_ACTION_KINDS = ['git-commits', 'loop-run-terminals'] as const
export type ObserveActionKind = (typeof OBSERVE_ACTION_KINDS)[number]

/**
 * A declarative request to a preconfigured source connector. Repository paths and executable
 * commands intentionally do not belong to this contract; they remain host-side connector config.
 */
export type ObserveAction =
  | {
      readonly schemaVersion: 1
      readonly kind: 'git-commits'
      readonly sourceId: string
    }
  | {
      readonly schemaVersion: 1
      readonly kind: 'loop-run-terminals'
      readonly sourceId: string
    }

/** An opaque connector cursor bound to one source and one action kind. */
export interface SourceCheckpoint {
  readonly schemaVersion: 1
  readonly sourceId: string
  readonly actionKind: ObserveActionKind
  readonly cursor: string
}

/** Provider-safe observation text. It contains no repository path or executable command field. */
export interface Observation {
  readonly schemaVersion: 1
  readonly observationId: string
  readonly sourceId: string
  readonly actionKind: ObserveActionKind
  readonly observedAt: string
  readonly title: string
  readonly body: string
}

export interface ObservationPage {
  readonly schemaVersion: 1
  readonly action: ObserveAction
  readonly observations: readonly Observation[]
  readonly nextCheckpoint: SourceCheckpoint
  readonly hasMore: boolean
}

/** Values resolved by the host when a route is selected. They are never accepted from a provider. */
export interface TriageRouteResolution {
  readonly workflowId: string
  readonly initialStep: string
}

/**
 * Host-owned route catalog entry. Providers may see only routeId + description and may return only
 * routeId; `resolved` is copied from this trusted catalog during canonicalization.
 */
export interface TriageRoute {
  readonly routeId: string
  readonly description: string
  readonly resolved: TriageRouteResolution
}

export interface ProviderVisibleTriageRoute {
  readonly routeId: string
  readonly description: string
}

export type ProviderTriageDecision =
  | {
      readonly observationId: string
      readonly classification: 'high'
      readonly rationale: string
      readonly routeId: string
    }
  | {
      readonly observationId: string
      readonly classification: 'watch'
      readonly rationale: string
    }
  | {
      readonly observationId: string
      readonly classification: 'noise'
      readonly rationale: string
    }

/** The entire untrusted semantic payload a provider is allowed to return. */
export interface ProviderTriageClassification {
  readonly schemaVersion: 1
  readonly decisions: readonly ProviderTriageDecision[]
}

/** Core provenance is provider-neutral. Automation constrains production adapters separately. */
export interface TriageProviderProvenance {
  readonly kind: string
  readonly model: string
  readonly invocationId: string
}

/** Host-generated identity used to create one change/workflow-run candidate idempotently. */
export interface TriageCandidateIdentity {
  readonly candidateId: string
  readonly creationKey: string
  readonly changeName: string
}

export interface TriageCandidate extends TriageCandidateIdentity {
  readonly route: TriageRoute
}

export type TriageDecision =
  | {
      readonly observationId: string
      readonly classification: 'high'
      readonly rationale: string
      readonly routeId: string
      readonly candidate: TriageCandidate
    }
  | {
      readonly observationId: string
      readonly classification: 'watch'
      readonly rationale: string
    }
  | {
      readonly observationId: string
      readonly classification: 'noise'
      readonly rationale: string
    }

export interface TriageResult {
  readonly schemaVersion: 1
  readonly page: ObservationPage
  readonly decisions: readonly TriageDecision[]
  readonly provider: TriageProviderProvenance
}

export interface TriageCandidateDerivationInput {
  readonly observation: Observation
  readonly route: TriageRoute
  readonly rationale: string
  readonly highIndex: number
}

export interface HostTriageCanonicalizationContext {
  readonly page: ObservationPage
  readonly routes: readonly TriageRoute[]
  /** Trusted host policy cap, not a provider suggestion. */
  readonly trustedHighCap: number
  /** Captured by the host adapter, outside the provider's semantic response body. */
  readonly provider: TriageProviderProvenance
  /** Host identity/idempotency policy; provider output has no candidate identity fields. */
  readonly deriveCandidate: (input: TriageCandidateDerivationInput) => TriageCandidateIdentity
}

export type TriageValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] }
