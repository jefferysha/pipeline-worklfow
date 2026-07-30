export const RUN_STATE_SCHEMA_VERSION = 1 as const

export interface PreVerifyReviewAnchor {
  readonly schemaVersion: 1; readonly revision: number; readonly revisionId: string; readonly payloadDigest: string
}

export class RunStateCorruptError extends Error {
  readonly _tag = 'RunStateCorruptError'
}

export class UnsupportedRunStateVersionError extends Error {
  readonly _tag = 'UnsupportedRunStateVersionError'

  constructor(
    readonly foundVersion: number,
    readonly supportedVersion = RUN_STATE_SCHEMA_VERSION,
  ) {
    super(`canonical schemaVersion ${foundVersion} 高于当前支持版本 ${supportedVersion}`)
    this.name = 'UnsupportedRunStateVersionError'
  }
}

export function ownRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return Object.fromEntries(Object.entries(value))
}
