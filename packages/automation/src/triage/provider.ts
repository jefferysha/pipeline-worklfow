/** H12 Wave 0 provider port. The core contract stays provider-neutral. */

export const PRODUCTION_TRIAGE_PROVIDER_KIND = 'codex' as const
export type ProductionTriageProviderKind = typeof PRODUCTION_TRIAGE_PROVIDER_KIND

/** Capability-limited projection: no source path, checkpoint, command, or resolved route values. */
export interface TriageProviderObservation {
  readonly observationId: string
  readonly observedAt: string
  readonly title: string
  readonly body: string
}

/** Providers may select this id; only the host owns and resolves the corresponding route. */
export interface TriageProviderRoute {
  readonly routeId: string
  readonly description: string
}

export interface TriageProviderRequest {
  readonly schemaVersion: 1
  readonly observations: readonly TriageProviderObservation[]
  readonly routes: readonly TriageProviderRoute[]
  /** Advisory to the provider and independently re-enforced by the host validator. */
  readonly maxHighCandidates: number
}

/**
 * `output` is deliberately unknown: compile-time claims from an adapter cannot bypass the
 * read-once kernel validator. Provenance is captured by the host adapter, outside model output.
 */
export interface TriageProviderInvocation<TKind extends string = string> {
  readonly output: unknown
  readonly provenance: {
    readonly kind: TKind
    readonly model: string
    readonly invocationId: string
  }
}

export interface TriageProvider<TKind extends string = string> {
  readonly kind: TKind
  classify(
    request: TriageProviderRequest,
    signal: AbortSignal,
  ): Promise<TriageProviderInvocation<TKind>>
}

/** The only production adapter kind in Wave 0. Tests may still use neutral fake kinds. */
export type ProductionTriageProvider = TriageProvider<ProductionTriageProviderKind>
