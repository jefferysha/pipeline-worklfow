/**
 * Source observation port (H12 Wave 0).
 *
 * The port is generic so this leaf module does not require a new kernel/automation barrel edge.
 * Production composition binds it to kernel ObserveAction, SourceCheckpoint, and ObservationPage.
 * Connector filesystem roots, credentials, and executable commands belong in the implementation's
 * constructor/configuration; they are intentionally absent from the per-call request.
 */

export interface SourceConnectorRequest<TAction, TCheckpoint> {
  readonly action: TAction
  /** null means the first page; all later calls use the connector-issued checkpoint. */
  readonly checkpoint: TCheckpoint | null
  readonly limit: number
  readonly signal: AbortSignal
}

export interface SourceConnector<
  TAction extends { readonly kind: string } = { readonly kind: string },
  TCheckpoint = unknown,
  TPage = unknown,
> {
  /** Must equal the action kind accepted by this connector. */
  readonly kind: TAction['kind']
  observe(request: SourceConnectorRequest<TAction, TCheckpoint>): Promise<TPage>
}
