export interface DocumentProducerInvocationAnchor {
  readonly confirmationInvocationId: string
  readonly evidenceScope: string
  readonly stepVisit: { readonly runId: string; readonly transitionSequence: number }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Parse the canonical producer anchor without importing Skill runtime services. */
export function parseDocumentProducerInvocation(
  value: unknown,
  recordIndex: number,
  error: (message: string) => Error,
): DocumentProducerInvocationAnchor | undefined {
  if (value === undefined) return undefined
  const item = object(value)
  const stepVisit = object(item?.stepVisit)
  const confirmationInvocationId = item?.confirmationInvocationId
  const evidenceScope = item?.evidenceScope
  const runId = stepVisit?.runId
  const transitionSequence = stepVisit?.transitionSequence
  if (item === undefined || Object.keys(item).length !== 3
    || stepVisit === undefined || Object.keys(stepVisit).length !== 2
    || typeof confirmationInvocationId !== 'string' || !/^invocation-[a-f0-9]{64}$/u.test(confirmationInvocationId)
    || typeof evidenceScope !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(evidenceScope)
    || typeof runId !== 'string' || runId === ''
    || !Number.isSafeInteger(transitionSequence) || (transitionSequence as number) < 0) {
    throw error(`document ledger records[${recordIndex}].producerInvocation 非法`)
  }
  return {
    confirmationInvocationId,
    evidenceScope,
    stepVisit: { runId, transitionSequence: transitionSequence as number },
  }
}
