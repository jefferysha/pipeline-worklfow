export type WorkflowDefinitionStatus = 'current' | 'changed' | 'missing' | 'invalid' | 'unavailable'

export type WorkflowDefinitionCurrent =
  | { readonly kind: 'current'; readonly fingerprint: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' }

export interface WorkflowDefinitionStatusResponse {
  readonly schema: 'workflow-definition-status/v1'
  readonly workflow: string
  readonly status: WorkflowDefinitionStatus
  readonly frozen_fingerprint: string | null
  readonly current_fingerprint: string | null
}

export function projectWorkflowDefinitionStatus(
  workflow: string,
  frozenFingerprint: string | null,
  current: WorkflowDefinitionCurrent,
): WorkflowDefinitionStatusResponse {
  if (frozenFingerprint === null) {
    return {
      schema: 'workflow-definition-status/v1',
      workflow,
      status: 'unavailable',
      frozen_fingerprint: null,
      current_fingerprint: null,
    }
  }
  if (current.kind !== 'current') {
    return {
      schema: 'workflow-definition-status/v1',
      workflow,
      status: current.kind,
      frozen_fingerprint: frozenFingerprint,
      current_fingerprint: null,
    }
  }
  return {
    schema: 'workflow-definition-status/v1',
    workflow,
    status: current.fingerprint === frozenFingerprint ? 'current' : 'changed',
    frozen_fingerprint: frozenFingerprint,
    current_fingerprint: current.fingerprint,
  }
}
