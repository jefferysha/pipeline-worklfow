import { isRecord } from './transport'
import type {
  VerificationEvidenceComposeResponse,
  VerificationEvidenceFieldError,
} from './verificationEvidenceTypes'

export function decodeVerificationEvidenceComposeResponse(
  value: unknown,
): VerificationEvidenceComposeResponse | null {
  if (
    !isRecord(value)
    || value.ok !== true
    || typeof value.markdown !== 'string'
    || !Number.isInteger(value.entryCount)
    || (value.entryCount as number) < 1
    || (value.entryCount as number) > 12
  ) return null
  return { markdown: value.markdown, entryCount: value.entryCount as number }
}

export function decodeVerificationEvidenceValidationError(
  value: unknown,
): { details: VerificationEvidenceFieldError[]; overflow: boolean } | null {
  if (
    !isRecord(value)
    || value.ok !== false
    || value.code !== 'verification_evidence_invalid'
    || !Array.isArray(value.details)
    || typeof value.overflow !== 'boolean'
  ) return null
  const details: VerificationEvidenceFieldError[] = []
  for (const detail of value.details) {
    if (!isRecord(detail) || typeof detail.code !== 'string' || typeof detail.path !== 'string') return null
    details.push({ code: detail.code, path: detail.path })
  }
  return details.length > 0 ? { details, overflow: value.overflow } : null
}
