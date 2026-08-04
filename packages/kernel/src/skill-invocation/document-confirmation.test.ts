import { createHash } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyFields } from '../state/parse.js'
import { publishInitialRunRevision } from '../state/run-revision-store.js'
import {
  currentDocumentSkillConfirmation,
  readDocumentSkillConfirmations,
  recordNativeDocumentSkillConfirmation,
} from './document-confirmation.js'
import { readSkillInvocationEvidence } from './repository.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(
  sequence = 0,
  transitionHead?: string,
  initialKind: 'init' | 'migration' = 'init',
) {
  const root = await mkdtemp(join(tmpdir(), 'tenon-document-confirmation-'))
  roots.push(root)
  const changeDir = join(root, 'openspec', 'changes', 'demo')
  await mkdir(changeDir, { recursive: true })
  const fields = emptyFields()
  fields.phase = 'spec'
  fields.workflow = 'default'
  await publishInitialRunRevision(changeDir, {
    fields,
    runMetadata: { runId: 'run-1', transitionSequence: sequence, transitionHead },
    opaqueTail: '',
  }, '2026-08-04T00:00:00.000Z', initialKind)
  return changeDir
}

describe('host-neutral document Skill confirmation', () => {
  it('binds a native Skill PostToolUse from the exact initial StepVisit', async () => {
    const changeDir = await fixture()
    await appendFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-08-04T00:00:00.000Z', kind: 'init' }),
      JSON.stringify({ ts: '2026-08-04T00:01:00.000Z', kind: 'tool', raw: 'Skill: openspec-propose' }),
      '',
    ].join('\n'))

    await expect(recordNativeDocumentSkillConfirmation(
      changeDir, 'openspec-propose', 'spec', {
        sessionId: 'session-1', toolUseId: 'skill-tool-1', observedAt: '2026-08-04T00:01:00.000Z',
      },
    )).resolves.toBe(true)
    await expect(readDocumentSkillConfirmations(changeDir)).resolves.toEqual([
      expect.objectContaining({
        schema_version: 'document-skill-confirmation/v1',
        invocation_id: expect.stringMatching(/^invocation-/),
        producer: 'openspec-propose',
        evidence_scope: 'spec',
        step_visit: { run_id: 'run-1', transition_sequence: 0 },
        adapter: expect.objectContaining({
          kind: 'native', host_session_ref: expect.stringMatching(/^sha256:/),
          tool_use_ref: expect.stringMatching(/^sha256:/),
        }),
      }),
    ])
  })

  it('anchors a migrated historical Change to immutable revision zero without inventing init history', async () => {
    const changeDir = await fixture(0, undefined, 'migration')
    await appendFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-07-01T00:00:00.000Z', kind: 'transition', to: 'spec' }),
      JSON.stringify({ ts: '2026-08-04T00:01:00.000Z', kind: 'tool', raw: 'Skill: openspec-propose' }),
      '',
    ].join('\n'))

    await expect(recordNativeDocumentSkillConfirmation(
      changeDir, 'openspec-propose', 'spec', {
        sessionId: 'session-1', toolUseId: 'skill-tool-1', observedAt: '2026-08-04T00:01:00.000Z',
      },
    )).resolves.toBe(true)
    await expect(currentDocumentSkillConfirmation(
      changeDir, 'openspec-propose', 'spec', '2026-08-04T00:02:00.000Z',
    )).resolves.toMatchObject({
      evidence_scope: 'spec',
      step_visit: { run_id: 'run-1', transition_sequence: 0 },
      adapter: expect.objectContaining({ kind: 'native' }),
    })
  })

  it('replays the same native host receipt idempotently without making interaction binding ambiguous', async () => {
    const changeDir = await fixture()
    await appendFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-08-04T00:00:00.000Z', kind: 'init' }),
      JSON.stringify({ ts: '2026-08-04T00:01:00.000Z', kind: 'tool', raw: 'Skill: openspec-propose' }),
      '',
    ].join('\n'))
    const receipt = {
      sessionId: 'session-1', toolUseId: 'skill-tool-1', observedAt: '2026-08-04T00:01:00.000Z',
    }

    await expect(recordNativeDocumentSkillConfirmation(
      changeDir, 'openspec-propose', 'spec', receipt,
    )).resolves.toBe(true)
    await expect(recordNativeDocumentSkillConfirmation(
      changeDir, 'openspec-propose', 'spec', receipt,
    )).resolves.toBe(true)
    await expect(readDocumentSkillConfirmations(changeDir)).resolves.toHaveLength(1)
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toMatchObject({
      state: 'ready', items: [expect.objectContaining({ status: 'incomplete' })],
    })
  })

  it('does not reverse-mint a confirmation from stale native history', async () => {
    const changeDir = await fixture(2, 'transition-current')
    await appendFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-08-04T00:00:00.000Z', kind: 'transition', to: 'spec', transitionRecordId: 'transition-old' }),
      JSON.stringify({ ts: '2026-08-04T00:01:00.000Z', kind: 'tool', raw: 'Skill: openspec-propose' }),
      JSON.stringify({ ts: '2026-08-04T00:02:00.000Z', kind: 'transition', to: 'spec', transitionRecordId: 'transition-current' }),
      '',
    ].join('\n'))

    await expect(recordNativeDocumentSkillConfirmation(
      changeDir, 'openspec-propose', 'spec', {
        sessionId: 'session-1', toolUseId: 'skill-tool-1', observedAt: '2026-08-04T00:01:00.000Z',
      },
    )).resolves.toBe(false)
    await expect(readDocumentSkillConfirmations(changeDir)).resolves.toEqual([])
  })

  it('rejects unanchored or cross-visit text even when it follows a phase-shaped row', async () => {
    const changeDir = await fixture(3, 'transition-current')
    await appendFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-08-04T00:02:00.000Z', kind: 'transition', to: 'spec', transitionRecordId: 'transition-other' }),
      JSON.stringify({ ts: '2026-08-04T00:03:00.000Z', kind: 'tool', raw: 'Skill: openspec-propose' }),
      '',
    ].join('\n'))

    await expect(recordNativeDocumentSkillConfirmation(
      changeDir, 'openspec-propose', 'spec', {
        sessionId: 'session-1', toolUseId: 'skill-tool-1', observedAt: '2026-08-04T00:03:00.000Z',
      },
    )).resolves.toBe(false)
    await expect(readDocumentSkillConfirmations(changeDir)).resolves.toEqual([])
  })

  it('rejects a confirmation whose persisted invocation id redirects an otherwise valid proof', async () => {
    const changeDir = await fixture()
    const confirmedAt = '2026-08-04T00:01:00.000Z'
    const receiptDigest = createHash('sha256')
      .update('demo').update('\0').update('openspec-propose').update('\0').update(confirmedAt)
      .update('\0').update('run-1').update('\0').update('0').digest('hex')
    await appendFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-08-04T00:00:00.000Z', kind: 'init' }),
      JSON.stringify({ ts: confirmedAt, kind: 'tool', raw: 'CodexSkillRead: openspec-propose' }),
      JSON.stringify({ ts: confirmedAt, kind: 'tool', raw: 'CodexSkillReadBinding: openspec-propose run-1 0' }),
      '',
    ].join('\n'))
    await appendFile(join(changeDir, '.pipeline-skill-confirmations.jsonl'), `${JSON.stringify({
      schema_version: 'document-skill-confirmation/v1',
      invocation_id: `invocation-${'f'.repeat(64)}`,
      producer: 'openspec-propose', confirmed_at: confirmedAt, evidence_scope: 'spec',
      step_visit: { run_id: 'run-1', transition_sequence: 0 },
      adapter: { kind: 'codex', proof_ref: `codex-transcript-${receiptDigest}` },
    })}\n`)

    await expect(currentDocumentSkillConfirmation(
      changeDir, 'openspec-propose', 'spec', confirmedAt,
    )).resolves.toBeUndefined()
  })
})
