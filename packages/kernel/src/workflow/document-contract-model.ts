export const DOCUMENT_CONTRACT_PHASES = [
  'open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive',
] as const

export type DocumentContractPhase = (typeof DOCUMENT_CONTRACT_PHASES)[number]

export const DOCUMENT_KINDS = [
  'proposal',
  'openspec-design',
  'tasks',
  'superpower-design',
  'adr',
  'delta-spec',
  'superpower-plan',
  'plan',
  'verification-report',
  'applied-spec',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export type OpenSpecContract = 'required'

export interface DocumentOutputRequirement {
  readonly kind: DocumentKind
  readonly producerCandidates: readonly string[]
}

export interface DocumentGovernancePolicy {
  readonly id: 'openspec-v1' | 'document-v1'
  readonly steps: readonly string[]
  readonly outputsByStep: Readonly<Record<string, readonly DocumentOutputRequirement[]>>
  readonly mutableByStep: Readonly<Record<string, readonly DocumentOutputRequirement[]>>
  readonly readsByStep: Readonly<Record<string, readonly DocumentKind[]>>
}

function includes<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value)
}

export function isDocumentContractPhase(value: string): value is DocumentContractPhase {
  return includes(DOCUMENT_CONTRACT_PHASES, value)
}

export function isDocumentKind(value: string): value is DocumentKind {
  return includes(DOCUMENT_KINDS, value)
}
