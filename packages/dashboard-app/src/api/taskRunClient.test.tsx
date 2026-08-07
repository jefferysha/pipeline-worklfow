import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTaskRun, postTaskRunOperation, type TaskRunDto } from './taskRunClient'

const dto: TaskRunDto = {
  schema_version: 'task-run/v1',
  plan: { plan_id: 'plan-1', revision_id: 'revision-1', revision_number: 1, fingerprint: 'sha256:plan' },
  run_revision: 2,
  state: 'running',
  admission: { status: 'admitted', blockers: [] },
  waves: [{ index: 0, work_item_ids: ['wi-1'], parallelism: 1 }],
  parallelism: 1,
  serialized_resource_conflicts: [],
  items: [{ work_item_id: 'wi-1', title: 'Build', state: 'running', depends_on: [], resource_claims: [], latest_attempt: null }],
  attempts: [], operations: [], blockers: [], invalidations: [], validator_verdicts: [], groups: [],
  allowed_operations: [{ operation: 'cancel', work_item_id: 'wi-1', expected_run_revision: 2, expected_state: 'running' }],
}

beforeEach(() => {
  window.__TENON_DASHBOARD_TOKEN__ = 'token'
  vi.restoreAllMocks()
})

describe('task run client', () => {
  it('decodes the stable DTO and degrades unknown states explicitly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...dto,
      state: 'future-state',
      items: [{ ...dto.items[0], state: 'future-item-state' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const result = await fetchTaskRun('/repo', 'demo')
    expect(result.state).toBe('unknown')
    expect(result.items[0]?.state).toBe('unknown')
    expect(fetch).toHaveBeenCalledWith(
      '/api/task-runs/demo?root=%2Frepo',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('posts only the exact server-authorized CAS operation with token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(dto), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
    const operation = dto.allowed_operations[0]!
    await postTaskRunOperation('/repo', 'demo', operation)
    expect(fetch).toHaveBeenCalledWith('/api/task-runs/demo/operations', {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: '/repo', ...operation }),
    })
  })

  it('rejects malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...dto, waves: 'bad' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(fetchTaskRun('/repo', 'demo')).rejects.toThrow('Task Run response is invalid')
  })
})
