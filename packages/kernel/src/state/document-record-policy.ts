import type {
  DocumentGovernancePolicy,
  DocumentKind,
} from '../workflow/document-contract.js'
import { readValidatedTransitionHead } from './run-revision-store.js'

interface SpecAdrCompatibilityInput {
  readonly policy?: DocumentGovernancePolicy
  readonly phase: string
  readonly kind: DocumentKind
}

export function skillsEquivalent(left: string, right: string): boolean {
  const aliases = (id: string): readonly string[] => {
    const values = new Set<string>([id])
    if (id.startsWith('tenon:')) values.add(id.slice('tenon:'.length))
    if (id.startsWith('superpowers:')) values.add(id.slice('superpowers:'.length))
    if (id === 'opsx:propose') values.add('openspec-propose')
    if (id === 'openspec-propose') values.add('opsx:propose')
    if (id === 'opsx:apply') values.add('openspec-apply-change')
    if (id === 'openspec-apply-change') values.add('opsx:apply')
    return [...values]
  }
  const leftAliases = new Set(aliases(left))
  return aliases(right).some((candidate) => leftAliases.has(candidate))
}

export async function currentSpecVisitEnteredViaRequirementsChanged(
  changeDir: string,
): Promise<boolean> {
  const validated = await readValidatedTransitionHead(changeDir)
  if (validated === undefined) return false
  const current = validated.current
  const metadata = current?.state.runMetadata
  if (current.state.fields.phase !== 'spec'
    || metadata === undefined
    || metadata.transitionSequence < 1
    || metadata.transitionHead === undefined) {
    return false
  }

  const record = validated.record
  return record.id === metadata.transitionHead
    && record.sequence === metadata.transitionSequence
    && record.runId === metadata.runId
    && record.event === 'requirements-changed'
    && (record.from === 'build' || record.from === 'verify')
    && record.to === 'spec'
}

export function requiresRequirementsChangedForSpecAdr(input: SpecAdrCompatibilityInput): boolean {
  return input.policy?.id !== 'document-v1'
    && input.phase === 'spec'
    && input.kind === 'adr'
}
