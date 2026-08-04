import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeSkillInvocationList, fetchSkillInvocations } from './skillInvocationClient'

const response = {
  schema_version: 'skill-invocation-list/v1', state: 'ready', items: [{
    schema_version: 'skill-invocation-read/v1', invocation_id: 'inv-1', status: 'incomplete',
    skill: { id: 'planner', version: '1' },
    subject: {
      workflow_definition_id: 'default', workflow_run_id: 'run-1', step_id: 'build',
      step_visit: { run_id: 'run-1', transition_sequence: 3 },
      task_plan_revision_id: 'plan-1', work_item_id: 'item-1',
    },
    started_at: '2026-08-03T00:00:00Z', input: { schema_id: 'input/v1', fields: [] },
    questions: [], decisions: [], artifacts: [],
  }],
}

afterEach(() => vi.unstubAllGlobals())

describe('skillInvocationClient', () => {
  it('decodes the bounded privacy-safe projection and rejects future statuses', () => {
    expect(decodeSkillInvocationList(response)).toMatchObject({ items: [{ status: 'incomplete' }] })
    expect(decodeSkillInvocationList({
      ...response,
      items: [{ ...response.items[0], status: 'future-success' }],
    })).toBeNull()
  })

  it('rejects partial WorkItem bindings and unknown nested policy fields', () => {
    expect(decodeSkillInvocationList({
      ...response,
      items: [{
        ...response.items[0],
        subject: { ...response.items[0].subject, task_plan_revision_id: undefined },
      }],
    })).toBeNull()
    expect(decodeSkillInvocationList({
      ...response,
      items: [{
        ...response.items[0],
        questions: [{
          id: 'question-1', key: 'mode', schema_id: 'question/v1', option_ids: ['direct'],
          requiredness: 'routine', shown: false,
        }],
        decisions: [{
          id: 'decision-1', question_id: 'question-1', mode: 'recommended-default',
          selected_option_ids: ['direct'],
          policy: { id: 'interaction', version: '1', rule_id: 'build-mode', future: true },
          rationale_code: 'safe-default',
        }],
      }],
    })).toBeNull()
  })

  it('fetches the scoped read endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchSkillInvocations('/repo with space', 'demo')).resolves.toMatchObject({ state: 'ready' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/skill-invocations/demo?root=%2Frepo%20with%20space',
      { signal: undefined },
    )
  })

  it('keeps the browser acceptance fixture synchronized with the closed public DTO', async () => {
    const fixturePath = existsSync('packages/dashboard-app/test-fixtures/skill-invocations-ready.json')
      ? 'packages/dashboard-app/test-fixtures/skill-invocations-ready.json'
      : 'test-fixtures/skill-invocations-ready.json'
    const fixture = JSON.parse(await readFile(
      resolve(process.cwd(), fixturePath),
      'utf8',
    ))
    expect(decodeSkillInvocationList(fixture)).toMatchObject({
      state: 'ready',
      items: [
        { status: 'completed' },
        { status: 'incomplete' },
        { status: 'failed' },
        { status: 'interrupted' },
      ],
    })
    expect(JSON.stringify(fixture)).not.toMatch(/project_id|proof_ref|digest|session|raw_prompt|raw_output/u)
  })
})
