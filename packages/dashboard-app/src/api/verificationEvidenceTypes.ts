export type VerificationEvidenceLocale = 'zh-CN' | 'en'
export type VerificationEvidenceKind = 'command' | 'browser' | 'review' | 'other'
export type VerificationEvidenceStatus = 'passed' | 'failed' | 'skipped'

export interface VerificationEvidenceDraftEntry {
  kind: VerificationEvidenceKind
  title: string
  status: VerificationEvidenceStatus
  command?: string
  result?: string
  skipReason?: string
}

export interface VerificationEvidenceComposeInput {
  root: string
  locale: VerificationEvidenceLocale
  entries: VerificationEvidenceDraftEntry[]
}

export interface VerificationEvidenceComposeResponse {
  markdown: string
  entryCount: number
}

export interface VerificationEvidenceFieldError {
  code: string
  path: string
}
