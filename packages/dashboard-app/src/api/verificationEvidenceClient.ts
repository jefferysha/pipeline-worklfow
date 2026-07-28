import {
  decodeVerificationEvidenceComposeResponse,
  decodeVerificationEvidenceValidationError,
} from './verificationEvidenceDecoders'
import type {
  VerificationEvidenceComposeInput,
  VerificationEvidenceComposeResponse,
  VerificationEvidenceFieldError,
} from './verificationEvidenceTypes'
import { ApiError, getToken, isRecord, readJson, wrapNetwork } from './transport'

export class VerificationEvidenceApiError extends ApiError {
  constructor(
    status: number,
    public readonly details: VerificationEvidenceFieldError[],
    public readonly overflow: boolean,
  ) {
    super('verification evidence input is invalid', status)
    this.name = 'VerificationEvidenceApiError'
  }
}

export async function postVerificationEvidenceCompose(
  input: VerificationEvidenceComposeInput,
): Promise<VerificationEvidenceComposeResponse> {
  let response: Response
  try {
    response = await fetch('/api/verification-evidence/compose', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
  } catch (error) {
    wrapNetwork(error)
  }

  let body: unknown
  try {
    body = await readJson(response)
  } catch {
    throw new ApiError(
      response.ok ? 'verification evidence response is invalid' : `verification evidence request failed (${response.status})`,
      response.status,
    )
  }

  if (!response.ok) {
    const validation = decodeVerificationEvidenceValidationError(body)
    if (validation) {
      throw new VerificationEvidenceApiError(response.status, validation.details, validation.overflow)
    }
    const message = isRecord(body) && typeof body.error === 'string'
      ? body.error
      : `verification evidence request failed (${response.status})`
    throw new ApiError(message, response.status)
  }

  const decoded = decodeVerificationEvidenceComposeResponse(body)
  if (!decoded) throw new ApiError('verification evidence response is invalid', response.status)
  return decoded
}
