import { createHash } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendSkillInvocationEvent,
  readSkillInvocationEvidence,
  SkillInvocationEvidenceBindingError,
  SkillInvocationEvidenceCorruptError,
  SKILL_INVOCATION_LEDGER_FILE,
  type SkillInvocationBindingContextV1,
  type SkillInvocationEventV1,
} from './index.js'

const roots: string[] = []
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tenon-invocation-evidence-'))
  roots.push(root)
  const changeDir = join(root, 'openspec', 'changes', 'demo')
  await mkdir(changeDir, { recursive: true })
  return changeDir
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

const context: SkillInvocationBindingContextV1 = {
  project_id: 'project-1',
  workflow_definition_id: 'default',
  workflow_run_id: 'run-1',
  step_id: 'build',
  transition_sequence: 3,
  task_plan_revision_id: 'revision-1',
  work_item_ids: ['work-item-1'],
  attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' },
}

function started(overrides: Partial<SkillInvocationEventV1> = {}): SkillInvocationEventV1 {
  return {
    schema_version: 'skill-invocation-evidence/v1',
    event_id: 'event-1',
    invocation_id: 'invocation-1',
    sequence: 1,
    type: 'invocation-started',
    subject: {
      project_id: 'project-1',
      workflow_definition_id: 'default',
      workflow_run_id: 'run-1',
      step_id: 'build',
      step_visit: { run_id: 'run-1', transition_sequence: 3 },
      task_plan_revision_id: 'revision-1',
      work_item_id: 'work-item-1',
      attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' },
    },
    recorded_at: '2026-08-03T00:00:01.000Z',
    payload: {
      skill: { id: 'task-planner', version: '1' },
      input: { schema_id: 'input/v1', fields: [] },
      adapter: { kind: 'afk', proof_ref: 'trusted-attempt-proof' },
    },
    ...overrides,
  } as SkillInvocationEventV1
}

describe('SkillInvocationEvidence repository', () => {
  it('serializes exact replays and exposes incomplete honestly', async () => {
    const changeDir = await fixture()
    const options = { binding: async () => context }
    await expect(appendSkillInvocationEvent(changeDir, started(), options)).resolves.toEqual({ appended: true })
    await expect(appendSkillInvocationEvent(changeDir, started(), options)).resolves.toEqual({ appended: false })
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toMatchObject({
      state: 'ready',
      items: [{ invocation_id: 'invocation-1', status: 'incomplete' }],
    })
  })

  it('serializes concurrent replays into one durable fact', async () => {
    const changeDir = await fixture()
    const options = { binding: async () => context }
    const results = await Promise.all([
      appendSkillInvocationEvent(changeDir, started(), options),
      appendSkillInvocationEvent(changeDir, started(), options),
    ])
    expect(results).toEqual(expect.arrayContaining([{ appended: true }, { appended: false }]))
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toMatchObject({
      state: 'ready', items: [{ status: 'incomplete' }],
    })
  })

  it('fails closed before append when any canonical subject identity mismatches', async () => {
    const changeDir = await fixture()
    const invalid = started({
      subject: { ...started().subject, work_item_id: 'other-item' },
    })
    await expect(appendSkillInvocationEvent(changeDir, invalid, { binding: async () => context }))
      .rejects.toBeInstanceOf(SkillInvocationEvidenceBindingError)
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toEqual({
      schema_version: 'skill-invocation-list/v1', state: 'empty', items: [],
    })
  })

  it('requires an exact frozen policy verdict for recommended defaults', async () => {
    const changeDir = await fixture()
    const options = { binding: async () => context }
    await appendSkillInvocationEvent(changeDir, started(), options)
    await appendSkillInvocationEvent(changeDir, {
      ...started(),
      event_id: 'event-2',
      sequence: 2,
      type: 'question-recorded',
      recorded_at: '2026-08-03T00:00:02.000Z',
      payload: {
        question_id: 'question-1', key: 'build.mode', schema_id: 'question/v1',
        option_ids: ['direct'], requiredness: 'routine', shown: false,
      },
    }, options)
    const decision: SkillInvocationEventV1 = {
      ...started(),
      event_id: 'event-3',
      sequence: 3,
      type: 'decision-recorded',
      recorded_at: '2026-08-03T00:00:03.000Z',
      payload: {
        decision_id: 'decision-1', question_id: 'question-1', mode: 'recommended-default',
        selected_option_ids: ['direct'],
        policy: { id: 'policy-1', version: '2', rule_id: 'build-mode' },
        rationale_code: 'overlapping-files',
      },
    }
    await expect(appendSkillInvocationEvent(changeDir, decision, options))
      .rejects.toBeInstanceOf(SkillInvocationEvidenceBindingError)
    await expect(appendSkillInvocationEvent(changeDir, decision, {
      ...options,
      verify_recommended_default: async (payload) => payload.policy?.version === '2',
    })).resolves.toEqual({ appended: true })
  })

  it('treats a malformed line as corrupt and refuses further writes', async () => {
    const changeDir = await fixture()
    await appendFile(join(changeDir, SKILL_INVOCATION_LEDGER_FILE), '{bad json\n', 'utf8')
    await expect(readSkillInvocationEvidence(changeDir)).rejects.toBeInstanceOf(SkillInvocationEvidenceCorruptError)
    await expect(appendSkillInvocationEvent(changeDir, started(), { binding: async () => context }))
      .rejects.toBeInstanceOf(SkillInvocationEvidenceCorruptError)
  })

  it('requires a trusted completion verdict and exact ownership recovery', async () => {
    const completedDir = await fixture()
    const options = { binding: async () => context }
    await appendSkillInvocationEvent(completedDir, started(), options)
    const completed: SkillInvocationEventV1 = {
      ...started(),
      event_id: 'event-2',
      sequence: 2,
      type: 'invocation-completed',
      recorded_at: '2026-08-03T00:00:02.000Z',
      payload: {
        output: { schema_id: 'output/v1', fields: [] },
        adapter: { kind: 'afk', proof_ref: 'trusted-completion-proof' },
      },
    }
    await expect(appendSkillInvocationEvent(completedDir, completed, options))
      .rejects.toThrow(/trusted adapter/u)
    await expect(appendSkillInvocationEvent(completedDir, completed, {
      ...options,
      verify_completed_adapter: async (event) => event.payload.adapter.proof_ref === 'trusted-completion-proof',
    })).resolves.toEqual({ appended: true })

    const interruptedDir = await fixture()
    await appendSkillInvocationEvent(interruptedDir, started(), options)
    const interrupted: SkillInvocationEventV1 = {
      ...started(),
      event_id: 'event-2',
      sequence: 2,
      type: 'invocation-interrupted',
      recorded_at: '2026-08-03T00:00:02.000Z',
      payload: { code: 'worker-exited', recovery: { owner_id: 'owner-2', proof_ref: 'lease-2' } },
    }
    await expect(appendSkillInvocationEvent(interruptedDir, interrupted, options))
      .rejects.toThrow(/ownership recovery/u)
    await expect(appendSkillInvocationEvent(interruptedDir, interrupted, {
      ...options,
      verify_interruption_recovery: async (event) => event.payload.recovery.proof_ref === 'lease-2',
    })).resolves.toEqual({ appended: true })
  })

  it('keeps an uncommitted artifact intent orphaned and rejects digest drift', async () => {
    const changeDir = await fixture()
    const options = { binding: async () => context }
    await appendSkillInvocationEvent(changeDir, started(), options)
    await appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-2', sequence: 2, type: 'invocation-completed',
      recorded_at: '2026-08-03T00:00:02.000Z',
      payload: {
        output: { schema_id: 'output/v1', fields: [] },
        adapter: { kind: 'afk', proof_ref: 'trusted-completion-proof' },
      },
    }, { ...options, verify_completed_adapter: async () => true })
    const initial = Buffer.from('initial artifact\n')
    const digest = `sha256:${createHash('sha256').update(initial).digest('hex')}`
    const repoRoot = join(changeDir, '..', '..', '..')
    await mkdir(join(repoRoot, 'artifacts'), { recursive: true })
    await writeFile(join(repoRoot, 'artifacts', 'plan.json'), initial)
    await appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-3', sequence: 3, type: 'artifact-binding-intent',
      recorded_at: '2026-08-03T00:00:03.000Z',
      payload: {
        binding_id: 'binding-1', output_id: 'plan',
        artifact: { kind: 'file', ref: 'artifacts/plan.json', digest },
        validator_ids: ['digest'],
      },
    }, options)
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toMatchObject({
      items: [{ artifacts: [{ binding_id: 'binding-1', state: 'intent' }] }],
    })
    await writeFile(join(repoRoot, 'artifacts', 'plan.json'), 'drifted artifact\n')
    await expect(appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-4', sequence: 4, type: 'artifact-bound',
      recorded_at: '2026-08-03T00:00:04.000Z',
      payload: {
        binding_id: 'binding-1', artifact_digest: digest,
        validators: [{ id: 'digest', status: 'pass' }],
      },
    }, options)).rejects.toThrow(/current artifact/u)
  })
})
