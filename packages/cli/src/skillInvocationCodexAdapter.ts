import { createHash } from 'node:crypto'
import type { SkillInvocationAdapterProofV1 } from '@tenon/kernel'
import type { CodexSkillReceipt } from './codexSkillReceipt.js'
import type { CodexSkillTrustRoots } from './codexSkillTrust.js'
import { transcriptConfirmsReceipt } from './codexTranscriptEvidence.js'

export class CodexSkillInvocationProofError extends Error {
  override readonly name = 'CodexSkillInvocationProofError'
}

export interface CodexSkillInvocationAdapterInput {
  readonly receipt: CodexSkillReceipt
  readonly trustRoots: CodexSkillTrustRoots
  readonly repoRoot: string
  readonly homeDir?: string
  readonly configuredCodexHome?: string
  readonly notBefore?: string
}

type ReceiptVerifier = typeof transcriptConfirmsReceipt

/** Reuse the exact transcript verifier; the public proof keeps only a bounded opaque reference. */
export async function codexSkillInvocationAdapterProof(
  input: CodexSkillInvocationAdapterInput,
  verify: ReceiptVerifier = transcriptConfirmsReceipt,
): Promise<SkillInvocationAdapterProofV1> {
  const confirmed = await verify(
    input.receipt,
    input.trustRoots,
    input.repoRoot,
    input.homeDir,
    input.configuredCodexHome,
    input.notBefore,
  )
  if (!confirmed) throw new CodexSkillInvocationProofError('Codex transcript did not prove the exact completed Skill invocation')
  const proofRef = createHash('sha256')
    .update(input.receipt.skillId)
    .update('\0')
    .update(input.receipt.turnId)
    .update('\0')
    .update(input.receipt.toolUseId)
    .digest('hex')
  return { kind: 'codex', proof_ref: `codex-proof-${proofRef}` }
}
