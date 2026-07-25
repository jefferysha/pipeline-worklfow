import { sha256Hex } from '../sha256.js'
import type { ReconciliationPlanPayload, ResourceEpoch } from './reconciliation-types.js'

export function resourceEpoch(bytes: Uint8Array | null): ResourceEpoch {
  return bytes === null
    ? { kind: 'absent' }
    : { kind: 'sha256', value: sha256Hex(bytes) }
}

export function copyResourceEpoch(epoch: ResourceEpoch): ResourceEpoch {
  return epoch.kind === 'absent' ? { kind: 'absent' } : { kind: 'sha256', value: epoch.value }
}

export function canonicalReconciliationJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalReconciliationJson).join(',')}]`
  const record = Object.fromEntries(Object.entries(value))
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalReconciliationJson(record[key])}`).join(',')}}`
}

export function reconciliationPayloadDigest(payload: unknown): string {
  return sha256Hex(canonicalReconciliationJson(payload))
}

export function reconciliationPlanId(payload: ReconciliationPlanPayload): string {
  return reconciliationPayloadDigest(payload)
}
