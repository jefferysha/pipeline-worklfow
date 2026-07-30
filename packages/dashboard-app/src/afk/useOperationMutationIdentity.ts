import { useRef, useState } from 'react'

export type OperationMutationKind = 'init' | 'run' | 'sync' | 'triage'
export type OperationSurfaceKeys = Record<OperationMutationKind, string>

export interface OperationMutationIdentity {
  token: symbol
  kind: OperationMutationKind
  requestKey: string
  surfaceKey: string
}

export function operationFactsKey(
  operation: OperationMutationKind,
  facts: Record<string, unknown>,
): string {
  return JSON.stringify({ operation, ...facts })
}

export function useOperationMutationIdentity(surfaceKeys: OperationSurfaceKeys): {
  busy: OperationMutationKind | null
  begin: (kind: OperationMutationKind, request: Record<string, unknown>) => OperationMutationIdentity
  invalidate: () => void
  abandon: () => void
  isCurrent: (operation: OperationMutationIdentity) => boolean
  finish: (operation: OperationMutationIdentity) => void
} {
  const [busy, setBusy] = useState<OperationMutationKind | null>(null)
  const activeRef = useRef<OperationMutationIdentity | null>(null)
  const surfaceRef = useRef(surfaceKeys)
  surfaceRef.current = surfaceKeys

  function isLatest(operation: OperationMutationIdentity): boolean {
    const active = activeRef.current
    return active?.token === operation.token
      && active.kind === operation.kind
      && active.requestKey === operation.requestKey
      && active.surfaceKey === operation.surfaceKey
  }

  return {
    busy,
    begin(kind, request) {
      const operation = {
        token: Symbol(`operation:${kind}`),
        kind,
        requestKey: operationFactsKey(kind, request),
        surfaceKey: surfaceRef.current[kind],
      }
      activeRef.current = operation
      setBusy(kind)
      return operation
    },
    invalidate() {
      activeRef.current = null
      setBusy(null)
    },
    abandon() {
      activeRef.current = null
    },
    isCurrent(operation) {
      return isLatest(operation) && surfaceRef.current[operation.kind] === operation.surfaceKey
    },
    finish(operation) {
      if (!isLatest(operation) || surfaceRef.current[operation.kind] !== operation.surfaceKey) return
      activeRef.current = null
      setBusy(null)
    },
  }
}
