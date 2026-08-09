import { createHash } from 'node:crypto'
import { appendFile, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  encodeSkillInvocationEventV1,
  readSkillInvocationEvidence as readPersistedSkillInvocationEvidence,
  SKILL_INVOCATION_LIMITS,
  skillInvocationProjectId,
  SkillInvocationEvidenceBindingError,
  SkillInvocationEvidenceCorruptError,
  SKILL_INVOCATION_LEDGER_FILE,
  type SkillInvocationEventV1,
} from './index.js'
import { appendSkillInvocationEvent } from './repository.js'
import { recordHostSkillInvocationInteraction } from './interaction-command.js'
import { recordNativeDocumentSkillConfirmation } from './document-confirmation.js'
import { emptyFields } from '../state/parse.js'
import { publishInitialRunRevision } from '../state/run-revision-store.js'
import { TaskPlanRevisionConflictError } from '../state/task-plan-store.js'
import { publishTaskPlanRevision } from '../task-plan/publication.js'
import type { TaskPlanRevisionV1 } from '../task-plan/index.js'

const roots: string[] = []
async function readSkillInvocationEvidence(changeDir: string) {
  const evidence = await readPersistedSkillInvocationEvidence(changeDir)
  const items = evidence.items.filter((item) => item.skill.version !== 'task-plan/v1')
  return { ...evidence, items, state: items.length === 0 ? 'empty' as const : 'ready' as const }
}
interface EvidenceFixture {
  readonly changeDir: string
  readonly started: (overrides?: Partial<SkillInvocationEventV1>) => SkillInvocationEventV1
}

async function fixture(): Promise<EvidenceFixture> {
  const root = await mkdtemp(join(tmpdir(), 'tenon-invocation-evidence-'))
  roots.push(root)
  const changeDir = join(root, 'openspec', 'changes', 'demo')
  await mkdir(changeDir, { recursive: true })
  const fields = emptyFields()
  fields.workflow = 'default'
  fields.phase = 'build'
  await publishInitialRunRevision(changeDir, {
    fields,
    runMetadata: { runId: 'run-1', transitionSequence: 0, transitionHead: undefined },
    opaqueTail: '',
  }, '2026-08-03T00:00:00.000Z')
  const plan: TaskPlanRevisionV1 = {
    schema_version: 'task-plan/v1', plan_id: 'plan-1', revision_id: 'revision-1', revision_number: 1,
    status: 'frozen', created_at: '2026-08-03T00:00:00.000Z',
    requirements: [{ id: 'req-1', title: 'Evidence' }],
    acceptance_criteria: [{ id: 'acc-1', title: 'Bound' }],
    groups: [{ id: 'group-1', title: 'Build', parent_id: null, work_item_ids: ['work-item-1'] }],
    work_items: [{
      id: 'work-item-1', title: 'Implement evidence', group_id: 'group-1',
      requirement_refs: ['req-1'], acceptance_refs: ['acc-1'], depends_on: [], resource_claims: [],
      expected_outputs: [], validators: [],
    }],
  }
  await publishTaskPlanRevision(changeDir, plan, { expected_current_revision_id: null })
  const subject = {
    project_id: await skillInvocationProjectId(root),
    workflow_definition_id: 'default', workflow_run_id: 'run-1', step_id: 'build',
    step_visit: { run_id: 'run-1', transition_sequence: 0 },
    task_plan_revision_id: 'revision-1', work_item_id: 'work-item-1',
    attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' },
  }
  return { changeDir, started: (overrides = {}) => started(subject, overrides) }
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

function started(
  subject: SkillInvocationEventV1['subject'],
  overrides: Partial<SkillInvocationEventV1> = {},
): SkillInvocationEventV1 {
  return {
    schema_version: 'skill-invocation-evidence/v1',
    event_id: 'event-1',
    invocation_id: 'invocation-1',
    sequence: 1,
    type: 'invocation-started',
    subject,
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
  it('reads through a directory-fd-style alias only when bound to its verified identity', async () => {
    const { changeDir } = await fixture()
    const alias = `${changeDir}-alias`
    await symlink(changeDir, alias, 'dir')
    const identity = await lstat(changeDir)
    await expect(readPersistedSkillInvocationEvidence(alias))
      .rejects.toBeInstanceOf(SkillInvocationEvidenceCorruptError)
    await expect(readPersistedSkillInvocationEvidence(alias, {
      anchoredDirectoryIdentity: { dev: identity.dev, ino: identity.ino },
    })).resolves.toMatchObject({
      state: 'ready',
      items: [expect.objectContaining({ skill: { id: 'task-planner', version: 'task-plan/v1' } })],
    })
  })

  it('records the native Task Planner publication through the production lifecycle', async () => {
    const { changeDir } = await fixture()
    await expect(readPersistedSkillInvocationEvidence(changeDir)).resolves.toMatchObject({
      state: 'ready',
      items: [expect.objectContaining({
        status: 'completed',
        skill: { id: 'task-planner', version: 'task-plan/v1' },
      })],
    })
  })

  it('records a failed native Task Planner invocation when state CAS rejects after begin', async () => {
    const { changeDir } = await fixture()
    const revision: TaskPlanRevisionV1 = {
      schema_version: 'task-plan/v1', plan_id: 'plan-1', revision_id: 'revision-2', revision_number: 2,
      status: 'frozen', created_at: '2026-08-03T00:00:01.000Z',
      requirements: [{ id: 'req-1', title: 'Evidence' }],
      acceptance_criteria: [{ id: 'acc-1', title: 'Bound' }],
      groups: [{ id: 'group-1', title: 'Build', parent_id: null, work_item_ids: ['work-item-1'] }],
      work_items: [{
        id: 'work-item-1', title: 'Implement evidence', group_id: 'group-1',
        requirement_refs: ['req-1'], acceptance_refs: ['acc-1'], depends_on: [], resource_claims: [],
        expected_outputs: [], validators: [],
      }],
    }
    await expect(publishTaskPlanRevision(changeDir, revision, {
      expected_current_revision_id: 'wrong-current-revision',
    })).rejects.toBeInstanceOf(TaskPlanRevisionConflictError)

    const evidence = await readPersistedSkillInvocationEvidence(changeDir)
    const taskPlannerItems = evidence.items.filter((item) => item.skill.version === 'task-plan/v1')
    expect(taskPlannerItems).toHaveLength(2)
    expect(taskPlannerItems[0]).toMatchObject({ status: 'failed' })
    expect(taskPlannerItems[0]).not.toMatchObject({ status: 'completed' })
    expect(taskPlannerItems[1]).toMatchObject({ status: 'completed' })
  })

  it('serializes exact replays and exposes incomplete honestly', async () => {
    const { changeDir, started } = await fixture()
    const options = { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }
    await expect(appendSkillInvocationEvent(changeDir, started(), options)).resolves.toEqual({ appended: true })
    await expect(appendSkillInvocationEvent(changeDir, started(), options)).resolves.toEqual({ appended: false })
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toMatchObject({
      state: 'ready',
      items: [{ invocation_id: 'invocation-1', status: 'incomplete' }],
    })
  })

  it('serializes concurrent replays into one durable fact', async () => {
    const { changeDir, started } = await fixture()
    const options = { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }
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
    const { changeDir, started } = await fixture()
    const invalid = started({
      subject: { ...started().subject, work_item_id: 'other-item' },
    })
    await expect(appendSkillInvocationEvent(changeDir, invalid, {
      attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' },
    }))
      .rejects.toBeInstanceOf(SkillInvocationEvidenceBindingError)
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toEqual({
      schema_version: 'skill-invocation-list/v1', state: 'empty', items: [],
    })
  })

  it('requires an exact frozen policy verdict for recommended defaults', async () => {
    const { changeDir, started } = await fixture()
    const options = { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }
    await appendSkillInvocationEvent(changeDir, started(), options)
    await appendSkillInvocationEvent(changeDir, {
      ...started(),
      event_id: 'event-2',
      sequence: 2,
      type: 'question-recorded',
      recorded_at: '2026-08-03T00:02:00.000Z',
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
      verify_recommended_default: async ({ decision, question, started: invocationStarted, subject, events }) =>
        decision.policy?.version === '2'
        && question.key === 'build.mode'
        && invocationStarted.payload.skill.id === 'task-planner'
        && subject.workflow_run_id === 'run-1'
        && events.length === 2,
    })).resolves.toEqual({ appended: true })
  })

  it('treats a malformed line as corrupt and refuses further writes', async () => {
    const { changeDir, started } = await fixture()
    await appendFile(join(changeDir, SKILL_INVOCATION_LEDGER_FILE), '{bad json\n', 'utf8')
    await expect(readSkillInvocationEvidence(changeDir)).rejects.toBeInstanceOf(SkillInvocationEvidenceCorruptError)
    await expect(appendSkillInvocationEvent(changeDir, started(), {
      attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' },
    }))
      .rejects.toBeInstanceOf(SkillInvocationEvidenceCorruptError)
  })

  it('requires a trusted completion verdict and exact ownership recovery', async () => {
    const completedFixture = await fixture()
    const { changeDir: completedDir, started } = completedFixture
    const options = { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }
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
      verify_completed_adapter: async ({ completion, started: invocationStarted, events }) =>
        completion.payload.adapter.proof_ref === 'trusted-completion-proof'
        && invocationStarted.payload.skill.id === 'task-planner'
        && events.length === 1,
    })).resolves.toEqual({ appended: true })

    const interruptedFixture = await fixture()
    const interruptedDir = interruptedFixture.changeDir
    const interruptedStarted = interruptedFixture.started
    await appendSkillInvocationEvent(interruptedDir, interruptedStarted(), options)
    const interrupted: SkillInvocationEventV1 = {
      ...interruptedStarted(),
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

  it('rejects a trusted completion verdict while a shown hard gate remains unanswered', async () => {
    const { changeDir, started } = await fixture()
    const options = { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }
    await appendSkillInvocationEvent(changeDir, started(), options)
    await appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-2', sequence: 2, type: 'question-recorded',
      recorded_at: '2026-08-03T00:00:02.000Z',
      payload: {
        question_id: 'question-1', key: 'release.confirm', schema_id: 'release-confirm/v1',
        option_ids: ['approve'], requiredness: 'hard-gate', shown: true,
      },
    }, options)
    await expect(appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-3', sequence: 3, type: 'invocation-completed',
      recorded_at: '2026-08-03T00:00:03.000Z',
      payload: {
        output: { schema_id: 'output/v1', fields: [] },
        adapter: { kind: 'afk', proof_ref: 'trusted-completion-proof' },
      },
    }, { ...options, verify_completed_adapter: async () => true }))
      .rejects.toThrow(/hard-gate.*user answer/u)
  })

  it('records a host question and privacy-safe answer against the unique current incomplete invocation', async () => {
    const { changeDir } = await fixture()
    await appendFile(join(changeDir, '.pipeline-history.jsonl'), [
      JSON.stringify({ ts: '2026-08-03T00:00:00.000Z', kind: 'init' }),
      JSON.stringify({ ts: '2026-08-03T00:01:00.000Z', kind: 'tool', raw: 'Skill: tenon-build' }),
      '',
    ].join('\n'))
    await expect(recordNativeDocumentSkillConfirmation(changeDir, 'tenon-build', 'build', {
      sessionId: 'session-1', toolUseId: 'skill-tool-1', observedAt: '2026-08-03T00:01:00.000Z',
    })).resolves.toBe(true)
    await recordHostSkillInvocationInteraction(changeDir, {
      schema_version: 'host-skill-interaction-receipt/v1',
      receipt_id: 'tool-1',
      recorded_at: '2026-08-03T00:02:00.000Z',
      binding: { host_session_id: 'session-1' },
      questions: [{
        question: {
          question_id: 'ignored-by-command', key: 'host.release', schema_id: 'host-question/v1',
          option_ids: [], requiredness: 'hard-gate', shown: true,
        },
        decision: {
          selected_option_ids: [],
          free_text: { classification: 'user-provided', digest: `sha256:${'f'.repeat(64)}` },
        },
      }],
    })
    const raw = await readFile(join(changeDir, SKILL_INVOCATION_LEDGER_FILE), 'utf8')
    expect(raw).not.toContain('private approval')
    await expect(readSkillInvocationEvidence(changeDir)).resolves.toMatchObject({
      items: [{
        questions: [{ shown: true, requiredness: 'hard-gate' }],
        decisions: [{ mode: 'user-answer', free_text_classification: 'user-provided' }],
      }],
    })
  })

  it('keeps an uncommitted artifact intent orphaned and rejects digest drift', async () => {
    const { changeDir, started } = await fixture()
    const options = { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }
    await appendSkillInvocationEvent(changeDir, started(), options)
    await appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-2', sequence: 2, type: 'invocation-completed',
      recorded_at: '2026-08-03T00:00:02.000Z',
      payload: {
        output: { schema_id: 'output/v1', fields: [{
          name: 'plan', classification: 'project-data',
          digest: `sha256:${'b'.repeat(64)}`, validator: { id: 'output-schema', status: 'pass' },
        }] },
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

  it('requires a trusted verifier for non-intrinsic artifact validator verdicts', async () => {
    const { changeDir, started } = await fixture()
    const options = { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }
    await appendSkillInvocationEvent(changeDir, started(), options)
    await appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-2', sequence: 2, type: 'invocation-completed',
      recorded_at: '2026-08-03T00:00:02.000Z',
      payload: {
        output: { schema_id: 'output/v1', fields: [{
          name: 'plan', classification: 'project-data',
          digest: `sha256:${'b'.repeat(64)}`, validator: { id: 'output-schema', status: 'pass' },
        }] },
        adapter: { kind: 'afk', proof_ref: 'trusted-completion-proof' },
      },
    }, { ...options, verify_completed_adapter: async () => true })
    const artifact = Buffer.from('trusted artifact\n')
    const digest = `sha256:${createHash('sha256').update(artifact).digest('hex')}`
    const repoRoot = join(changeDir, '..', '..', '..')
    await mkdir(join(repoRoot, 'artifacts'), { recursive: true })
    await writeFile(join(repoRoot, 'artifacts', 'trusted.json'), artifact)
    await appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-3', sequence: 3, type: 'artifact-binding-intent',
      recorded_at: '2026-08-03T00:00:03.000Z',
      payload: {
        binding_id: 'binding-1', output_id: 'plan',
        artifact: { kind: 'file', ref: 'artifacts/trusted.json', digest },
        validator_ids: ['digest', 'policy'],
      },
    }, options)
    const bound: SkillInvocationEventV1 = {
      ...started(), event_id: 'event-4', sequence: 4, type: 'artifact-bound',
      recorded_at: '2026-08-03T00:00:04.000Z',
      payload: {
        binding_id: 'binding-1', artifact_digest: digest,
        validators: [{ id: 'digest', status: 'pass' }, { id: 'policy', status: 'pass' }],
      },
    }
    await expect(appendSkillInvocationEvent(changeDir, bound, options)).rejects.toThrow(/current artifact/u)
    await expect(appendSkillInvocationEvent(changeDir, bound, {
      ...options,
      verify_artifact: async (intent, binding) =>
        intent.validator_ids.includes('policy')
        && binding.validators.some((validator) => validator.id === 'policy' && validator.status === 'pass'),
    })).resolves.toEqual({ appended: true })
  })

  it('fails closed when another invocation is syntactically valid but violates aggregate invariants', async () => {
    const { changeDir, started } = await fixture()
    const poisoned = { ...started(), event_id: 'poison-2', invocation_id: 'poisoned', sequence: 2 }
    await appendFile(join(changeDir, SKILL_INVOCATION_LEDGER_FILE), `${JSON.stringify(poisoned)}\n`, 'utf8')
    await expect(appendSkillInvocationEvent(changeDir, {
      ...started(), event_id: 'event-clean', invocation_id: 'clean',
    }, { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }))
      .rejects.toBeInstanceOf(SkillInvocationEvidenceCorruptError)
  })

  it('checks the resulting global event and invocation budgets before append', async () => {
    const eventFixture = await fixture()
    const eventLines: string[] = []
    for (let invocation = 0; invocation < SKILL_INVOCATION_LIMITS.maxInvocations; invocation += 1) {
      const base = eventFixture.started({
        event_id: `budget-event-${invocation}-1`, invocation_id: `budget-invocation-${invocation}`,
      })
      eventLines.push(encodeSkillInvocationEventV1(base))
      for (let question = 0; question < 7; question += 1) {
        eventLines.push(encodeSkillInvocationEventV1({
          ...base,
          event_id: `budget-event-${invocation}-${question + 2}`,
          sequence: question + 2,
          type: 'question-recorded',
          payload: {
            question_id: `budget-question-${question}`, key: `budget.question.${question}`,
            schema_id: 'question/v1', option_ids: [], requiredness: 'routine', shown: false,
          },
        }))
      }
    }
    expect(eventLines).toHaveLength(SKILL_INVOCATION_LIMITS.maxEvents)
    await writeFile(join(eventFixture.changeDir, SKILL_INVOCATION_LEDGER_FILE), `${eventLines.join('\n')}\n`, 'utf8')
    await expect(appendSkillInvocationEvent(eventFixture.changeDir, {
      ...eventFixture.started(),
      event_id: 'budget-event-0-9', invocation_id: 'budget-invocation-0', sequence: 9,
      type: 'question-recorded',
      payload: {
        question_id: 'budget-question-8', key: 'budget.question.8', schema_id: 'question/v1',
        option_ids: [], requiredness: 'routine', shown: false,
      },
    }, { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }))
      .rejects.toThrow(/event budget/u)

    const invocationFixture = await fixture()
    const invocationLines = Array.from({ length: SKILL_INVOCATION_LIMITS.maxInvocations }, (_, index) =>
      encodeSkillInvocationEventV1(invocationFixture.started({
        event_id: `invocation-event-${index}`, invocation_id: `invocation-budget-${index}`,
      })))
    await writeFile(join(invocationFixture.changeDir, SKILL_INVOCATION_LEDGER_FILE), `${invocationLines.join('\n')}\n`, 'utf8')
    await expect(appendSkillInvocationEvent(invocationFixture.changeDir, invocationFixture.started({
      event_id: 'invocation-overflow-event', invocation_id: 'invocation-overflow',
    }), { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }))
      .rejects.toThrow(/invocation budget/u)
  })

  it('checks the resulting ledger byte budget before append', async () => {
    const { changeDir, started } = await fixture()
    const largeFields = Array.from({ length: SKILL_INVOCATION_LIMITS.maxFields }, (_, index) => ({
      name: `field-${String(index).padStart(3, '0')}-${'x'.repeat(175)}`,
      classification: 'project-data' as const,
      digest: `sha256:${'a'.repeat(64)}`,
      validator: { id: `validator-${'y'.repeat(170)}`, status: 'pass' as const },
    }))
    const lineFor = (index: number): string => encodeSkillInvocationEventV1(started({
      event_id: `byte-event-${String(index).padStart(4, '0')}`,
      invocation_id: `byte-invocation-${String(index).padStart(4, '0')}`,
      payload: {
        skill: { id: 'task-planner', version: '1' },
        input: { schema_id: 'large-input/v1', fields: largeFields },
        adapter: { kind: 'afk', proof_ref: 'trusted-attempt-proof' },
      },
    }))
    const candidate = lineFor(9999)
    const lines: string[] = []
    let bytes = 0
    for (let index = 0; index < SKILL_INVOCATION_LIMITS.maxInvocations; index += 1) {
      const line = lineFor(index)
      const lineBytes = Buffer.byteLength(`${line}\n`)
      if (bytes + lineBytes > SKILL_INVOCATION_LIMITS.maxLedgerBytes) break
      lines.push(line)
      bytes += lineBytes
    }
    expect(lines.length).toBeGreaterThan(0)
    expect(bytes + Buffer.byteLength(`${candidate}\n`)).toBeGreaterThan(SKILL_INVOCATION_LIMITS.maxLedgerBytes)
    await writeFile(join(changeDir, SKILL_INVOCATION_LEDGER_FILE), `${lines.join('\n')}\n`, 'utf8')
    await expect(appendSkillInvocationEvent(changeDir, started({
      event_id: 'byte-event-9999', invocation_id: 'byte-invocation-9999',
      payload: {
        skill: { id: 'task-planner', version: '1' },
        input: { schema_id: 'large-input/v1', fields: largeFields },
        adapter: { kind: 'afk', proof_ref: 'trusted-attempt-proof' },
      },
    }), { attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' } }))
      .rejects.toThrow(/byte budget/u)
  })
})
