import { describe, expect, it } from 'vitest'
import {
  decodeSkillInvocationEventV1,
  projectSkillInvocationEvents,
  skillInvocationCompletedToHistoryEntry,
  type SkillInvocationEventV1,
  type SkillInvocationSubjectV1,
} from './index.js'

const subject: SkillInvocationSubjectV1 = {
  project_id: 'project-1',
  workflow_definition_id: 'default',
  workflow_run_id: 'run-1',
  step_id: 'build',
  step_visit: { run_id: 'run-1', transition_sequence: 3 },
  task_plan_revision_id: 'revision-1',
  work_item_id: 'work-item-1',
  attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' },
}

function event(
  type: SkillInvocationEventV1['type'],
  payload: SkillInvocationEventV1['payload'],
  sequence: number,
): SkillInvocationEventV1 {
  return {
    schema_version: 'skill-invocation-evidence/v1',
    event_id: `event-${sequence}`,
    invocation_id: 'invocation-1',
    sequence,
    type,
    subject,
    recorded_at: `2026-08-03T00:00:0${sequence}.000Z`,
    payload,
  } as SkillInvocationEventV1
}

const started = event('invocation-started', {
  skill: { id: 'task-planner', version: '1.0.1' },
  input: {
    schema_id: 'task-planner-input/v1',
    fields: [{
      name: 'requirements',
      classification: 'project-data',
      digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      validator: { id: 'input-schema', status: 'pass' },
    }],
  },
  adapter: { kind: 'native', proof_ref: 'opaque-native-proof' },
}, 1)

describe('SkillInvocation evidence contract', () => {
  it('strictly decodes the closed v1 event envelope', () => {
    expect(decodeSkillInvocationEventV1(JSON.stringify(started))).toEqual({ ok: true, value: started })
    expect(decodeSkillInvocationEventV1({ ...started, raw_prompt: 'secret' })).toEqual({
      ok: false,
      code: 'unknown-field',
      path: '$.raw_prompt',
    })
  })

  it('projects actual questions and recommended defaults without private proof material', () => {
    const events: SkillInvocationEventV1[] = [
      started,
      event('question-recorded', {
        question_id: 'question-1',
        key: 'build.mode',
        schema_id: 'build-mode-question/v1',
        option_ids: ['direct', 'subagent'],
        requiredness: 'routine',
        shown: false,
      }, 2),
      event('decision-recorded', {
        decision_id: 'decision-1',
        question_id: 'question-1',
        mode: 'recommended-default',
        selected_option_ids: ['direct'],
        policy: { id: 'interaction-defaults', version: '3', rule_id: 'build-mode' },
        rationale_code: 'overlapping-files',
      }, 3),
      event('invocation-completed', {
        output: {
          schema_id: 'task-planner-output/v1',
          fields: [{
            name: 'revision_id',
            classification: 'identifier',
            digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            validator: { id: 'output-schema', status: 'pass' },
          }],
        },
        adapter: { kind: 'native', proof_ref: 'private-runtime-proof' },
      }, 4),
    ]
    const projection = projectSkillInvocationEvents(events)
    expect(projection).toMatchObject({
      status: 'completed',
      skill: { id: 'task-planner', version: '1.0.1' },
      questions: [{ key: 'build.mode', requiredness: 'routine', shown: false }],
      decisions: [{ mode: 'recommended-default', selected_option_ids: ['direct'], rationale_code: 'overlapping-files' }],
      input: { fields: [{ name: 'requirements', classification: 'project-data', validator: { status: 'pass' } }] },
      output: { fields: [{ name: 'revision_id', classification: 'identifier', validator: { status: 'pass' } }] },
    })
    expect(JSON.stringify(projection)).not.toContain('sha256:')
    expect(JSON.stringify(projection)).not.toContain('proof')
    expect(JSON.stringify(projection)).not.toContain('session')
  })

  it('rejects hard-gate defaults, duplicate terminals, and artifact commits before completion', () => {
    const hardQuestion = event('question-recorded', {
      question_id: 'question-1',
      key: 'release.confirm',
      schema_id: 'release-confirm/v1',
      option_ids: ['approve', 'reject'],
      requiredness: 'hard-gate',
      shown: false,
    }, 2)
    const defaultDecision = event('decision-recorded', {
      decision_id: 'decision-1',
      question_id: 'question-1',
      mode: 'recommended-default',
      selected_option_ids: ['approve'],
      policy: { id: 'policy', version: '1', rule_id: 'release' },
      rationale_code: 'routine',
    }, 3)
    expect(() => projectSkillInvocationEvents([started, hardQuestion, defaultDecision])).toThrow(/hard-gate/u)

    const completed = event('invocation-completed', {
      output: { schema_id: 'output/v1', fields: [] },
      adapter: { kind: 'native', proof_ref: 'proof-1' },
    }, 2)
    const failed = event('invocation-failed', { code: 'later-failure' }, 3)
    expect(() => projectSkillInvocationEvents([started, completed, failed])).toThrow(/terminal/u)

    const intent = event('artifact-binding-intent', {
      binding_id: 'binding-1',
      output_id: 'plan',
      artifact: {
        kind: 'file',
        ref: 'artifacts/plan.json',
        digest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      },
      validator_ids: ['file-exists'],
    }, 2)
    expect(() => projectSkillInvocationEvents([started, intent])).toThrow(/completed/u)
  })

  it('rejects adapter drift and emits only a one-way, privacy-safe history projection', () => {
    const completed = event('invocation-completed', {
      output: { schema_id: 'output/v1', fields: [] },
      adapter: { kind: 'codex', proof_ref: 'private-transcript-proof' },
    }, 2) as Extract<SkillInvocationEventV1, { type: 'invocation-completed' }>
    expect(() => projectSkillInvocationEvents([started, completed])).toThrow(/adapter/u)

    const compatible = skillInvocationCompletedToHistoryEntry(
      { ...completed, payload: { ...completed.payload, adapter: { kind: 'native', proof_ref: 'private-runtime-proof' } } },
      { id: 'task-planner', version: '1.0.1' },
    )
    expect(compatible).toEqual({
      ts: completed.recorded_at,
      kind: 'tool',
      raw: 'SkillInvocationCompleted: task-planner@1.0.1 invocation=invocation-1',
    })
    expect(JSON.stringify(compatible)).not.toContain('proof')
    expect(JSON.stringify(compatible)).not.toContain('session')
  })

  it('rejects empty user answers and enforces the per-invocation question budget', () => {
    const question = event('question-recorded', {
      question_id: 'question-1', key: 'scope', schema_id: 'scope/v1',
      option_ids: ['confirm'], requiredness: 'advisory', shown: true,
    }, 2)
    const emptyAnswer = event('decision-recorded', {
      decision_id: 'decision-1', question_id: 'question-1', mode: 'user-answer',
      selected_option_ids: [],
    }, 3)
    expect(() => projectSkillInvocationEvents([started, question, emptyAnswer])).toThrow(/non-empty|answer/u)

    const questions = Array.from({ length: 129 }, (_, index) => event('question-recorded', {
      question_id: `question-${index}`, key: `question.${index}`, schema_id: 'question/v1',
      option_ids: [], requiredness: 'routine', shown: false,
    }, index + 2))
    expect(() => projectSkillInvocationEvents([started, ...questions])).toThrow(/question.*budget/u)
  })

  it('binds artifacts only to unique declared outputs with passing validator verdicts', () => {
    const completed = event('invocation-completed', {
      output: { schema_id: 'output/v1', fields: [{
        name: 'plan', classification: 'project-data',
        digest: `sha256:${'b'.repeat(64)}`, validator: { id: 'output-schema', status: 'pass' },
      }] },
      adapter: { kind: 'native', proof_ref: 'proof-1' },
    }, 2)
    const missingOutput = event('artifact-binding-intent', {
      binding_id: 'binding-1', output_id: 'missing',
      artifact: { kind: 'file', ref: 'artifacts/plan.json', digest: `sha256:${'c'.repeat(64)}` },
      validator_ids: ['digest'],
    }, 3)
    expect(() => projectSkillInvocationEvents([started, completed, missingOutput])).toThrow(/declared output/u)

    const intent: Extract<SkillInvocationEventV1, { type: 'artifact-binding-intent' }> = {
      ...missingOutput,
      type: 'artifact-binding-intent',
      payload: { ...missingOutput.payload, output_id: 'plan' },
    } as Extract<SkillInvocationEventV1, { type: 'artifact-binding-intent' }>
    const duplicateOutput = event('artifact-binding-intent', {
      ...intent.payload, binding_id: 'binding-2',
    }, 4)
    expect(() => projectSkillInvocationEvents([started, completed, intent, duplicateOutput])).toThrow(/output.*unique/u)

    const failedBinding = event('artifact-bound', {
      binding_id: 'binding-1', artifact_digest: intent.payload.artifact.digest,
      validators: [{ id: 'digest', status: 'fail', code: 'digest-mismatch' }],
    }, 4)
    expect(() => projectSkillInvocationEvents([started, completed, intent, failedBinding])).toThrow(/validator.*pass/u)
  })

  it('rejects unsafe artifact references before they can enter the public projection', () => {
    const unsafe = event('artifact-binding-intent', {
      binding_id: 'binding-1', output_id: 'plan',
      artifact: { kind: 'file', ref: '/Users/private/plan.json', digest: `sha256:${'c'.repeat(64)}` },
      validator_ids: ['digest'],
    }, 2)
    expect(decodeSkillInvocationEventV1(unsafe)).toMatchObject({ ok: false, path: '$.payload.artifact.ref' })
  })

  it('enforces the per-invocation artifact budget on the resulting aggregate', () => {
    const fields = Array.from({ length: 129 }, (_, index) => ({
      name: `output-${index}`, classification: 'project-data' as const,
      digest: `sha256:${'b'.repeat(64)}`, validator: { id: 'output-schema', status: 'pass' as const },
    }))
    const completed = event('invocation-completed', {
      output: { schema_id: 'output/v1', fields },
      adapter: { kind: 'native', proof_ref: 'proof-1' },
    }, 2)
    const intents = fields.map((field, index) => event('artifact-binding-intent', {
      binding_id: `binding-${index}`, output_id: field.name,
      artifact: {
        kind: 'file', ref: `artifacts/output-${index}.json`, digest: `sha256:${'c'.repeat(64)}`,
      },
      validator_ids: ['digest'],
    }, index + 3))
    expect(() => projectSkillInvocationEvents([started, completed, ...intents])).toThrow(/artifact budget/u)
  })
})
