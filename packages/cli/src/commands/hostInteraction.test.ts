import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdInternalHostInteraction, decodeHostInteractionPostToolUse } from './hostInteraction.js'

describe('host interaction evidence decoder', () => {
  it('turns an actual structured answer into privacy-minimized question and decision facts', () => {
    const receipt = decodeHostInteractionPostToolUse(JSON.stringify({
      tool_name: 'request_user_input',
      session_id: 'session-1', turn_id: 'turn-1', tool_use_id: 'tool-1',
      tool_input: { questions: [{
        header: 'Release', question: 'Ship this build?',
        options: [{ label: 'Approve', description: 'Ship it' }, { label: 'Reject', description: 'Stop' }],
      }] },
      tool_response: { answers: { Release: 'Approve' } },
    }), '2026-08-04T00:00:00.000Z')
    expect(receipt.questions).toEqual([expect.objectContaining({
      question: expect.objectContaining({
        requiredness: 'hard-gate', shown: true,
        option_ids: [expect.stringMatching(/^option-/u), expect.stringMatching(/^option-/u)],
      }),
      decision: { selected_option_ids: [receipt.questions[0]!.question.option_ids[0]] },
    })])
    expect(JSON.stringify(receipt)).not.toContain('Ship this build?')
    expect(JSON.stringify(receipt)).not.toContain('Approve')
  })

  it('rejects an empty answer and stores free text only transiently for keyed hashing', () => {
    expect(() => decodeHostInteractionPostToolUse(JSON.stringify({
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ header: 'Scope', question: 'What scope?' }] },
      tool_response: { answers: { Scope: '' } },
    }), '2026-08-04T00:00:00.000Z')).toThrow(/non-empty answer/u)

    const receipt = decodeHostInteractionPostToolUse(JSON.stringify({
      tool_name: 'AskUserQuestion',
      session_id: 'session-high-entropy-1', turn_id: 'turn-high-entropy-1', tool_use_id: 'tool-high-entropy-1',
      tool_input: { questions: [{ header: 'Scope', question: 'What scope?' }] },
      tool_response: { answers: { Scope: 'private answer' } },
    }), '2026-08-04T00:00:00.000Z')
    expect(receipt.questions[0]!.decision).toEqual({
      selected_option_ids: [],
      free_text: { classification: 'user-provided', digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u) },
    })
    expect(JSON.stringify(receipt)).not.toContain('private answer')
  })

  it('rejects a symlink before reading a host interaction payload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-host-interaction-'))
    try {
      const target = join(root, 'payload.json')
      const link = join(root, 'payload-link.json')
      await writeFile(target, '{}', { mode: 0o600 })
      await symlink(target, link)
      const deps = makeDeps({ cwd: root })

      await expect(cmdInternalHostInteraction(deps, 'example-change', link)).resolves.toBe(1)
      expect(deps.errLines).toEqual([
        expect.stringMatching(/^internal-host-interaction: .*symbolic link/u),
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
