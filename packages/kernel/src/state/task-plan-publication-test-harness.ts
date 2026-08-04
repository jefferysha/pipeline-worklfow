import { AsyncLocalStorage } from 'node:async_hooks'

type AfterImmutablePublishFault = () => void | Promise<void>

const publicationFault = new AsyncLocalStorage<AfterImmutablePublishFault>()

/** Internal test harness; intentionally absent from the @tenon/kernel package barrel. */
export function withTaskPlanPublicationFaultForTest<T>(
  fault: AfterImmutablePublishFault,
  publish: () => Promise<T>,
): Promise<T> {
  return publicationFault.run(fault, publish)
}

export async function runTaskPlanPublicationFaultForTest(): Promise<void> {
  await publicationFault.getStore()?.()
}
