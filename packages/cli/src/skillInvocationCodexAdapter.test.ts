import { describe, expect, it, vi } from 'vitest'
import {
  codexSkillInvocationAdapterProof,
  CodexSkillInvocationProofError,
} from './skillInvocationCodexAdapter.js'

const receipt = {
  version: 1 as const,
  changeName: 'demo',
  skillId: 'tenon-build',
  skillPath: '/trusted/skills/tenon-build/SKILL.md',
  transcriptPath: '/private/session.jsonl',
  sessionId: 'session-private',
  turnId: 'turn-private',
  toolUseId: 'call-private',
  recordedAt: '2026-08-03T00:00:00.000Z',
}

describe('codexSkillInvocationAdapterProof', () => {
  it('mints only after the existing exact transcript verifier passes and redacts host identities', async () => {
    const verify = vi.fn(async () => true)
    const proof = await codexSkillInvocationAdapterProof({
      receipt,
      trustRoots: {} as never,
      repoRoot: '/repo',
    }, verify)
    expect(proof).toMatchObject({ kind: 'codex', proof_ref: expect.stringMatching(/^codex-proof-[0-9a-f]{64}$/u) })
    expect(JSON.stringify(proof)).not.toContain('session-private')
    expect(JSON.stringify(proof)).not.toContain('turn-private')
    expect(JSON.stringify(proof)).not.toContain('/private')
  })

  it('fails closed when transcript verification is incomplete', async () => {
    await expect(codexSkillInvocationAdapterProof({
      receipt,
      trustRoots: {} as never,
      repoRoot: '/repo',
    }, vi.fn(async () => false))).rejects.toBeInstanceOf(CodexSkillInvocationProofError)
  })
})
