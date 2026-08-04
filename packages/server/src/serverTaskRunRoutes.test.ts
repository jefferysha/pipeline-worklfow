import { describe, expect, it, vi } from 'vitest'
import type { TaskRunReadModelV1 } from '@tenon/kernel'
import { resolveTaskRunRoute, type TaskRunRouteDeps } from './serverTaskRunRoutes.js'

const model: TaskRunReadModelV1 = {
  schema_version: 'task-run/v1',
  plan: { plan_id: 'plan-1', revision_id: 'rev-1', revision_number: 1, fingerprint: 'sha256:plan' },
  run_revision: 0,
  state: 'pending',
  admission: { status: 'admitted', blockers: [] },
  waves: [{ index: 0, work_item_ids: ['wi-1'], parallelism: 1 }],
  parallelism: 1,
  items: [{
    work_item_id: 'wi-1', title: 'Build', state: 'ready', depends_on: [],
    resource_claims: [], latest_attempt: null,
  }],
  attempts: [], operations: [], blockers: [], invalidations: [], validator_verdicts: [], groups: [],
  allowed_operations: [],
}

function deps(overrides: Partial<TaskRunRouteDeps> = {}): TaskRunRouteDeps {
  return {
    workflowRootForRequest: vi.fn(() => ({ ok: true, anchor: {} as never })),
    readRun: vi.fn(async () => model),
    ...overrides,
  }
}

describe('resolveTaskRunRoute', () => {
  it('ignores unrelated endpoints and validates change before root lookup', async () => {
    expect(await resolveTaskRunRoute('/', '/api/snapshot', deps())).toBeNull()
    const d = deps()
    expect(await resolveTaskRunRoute(
      '/api/task-runs/..%2Fbad?root=/repo', '/api/task-runs/..%2Fbad', d,
    )).toMatchObject({ status: 400, body: { code: 'TASK_RUN_CHANGE_INVALID' } })
    expect(d.workflowRootForRequest).not.toHaveBeenCalled()
  })

  it('requires a registered trusted root', async () => {
    expect(await resolveTaskRunRoute('/api/task-runs/demo', '/api/task-runs/demo', deps()))
      .toMatchObject({ status: 400, body: { code: 'TASK_RUN_ROOT_REQUIRED' } })
    expect(await resolveTaskRunRoute('/api/task-runs/demo?root=/x', '/api/task-runs/demo', deps({
      workflowRootForRequest: () => ({ ok: false, code: 404, error: 'missing' }),
    }))).toMatchObject({ status: 404, body: { code: 'TASK_RUN_ROOT_NOT_REGISTERED' } })
    expect(await resolveTaskRunRoute('/api/task-runs/demo?root=/x', '/api/task-runs/demo', deps({
      workflowRootForRequest: () => ({ ok: false, code: 403, error: 'unsafe' }),
    }))).toMatchObject({ status: 403, body: { code: 'TASK_RUN_ROOT_FORBIDDEN' } })
  })

  it('returns the stable explainable DTO without filesystem paths', async () => {
    const result = await resolveTaskRunRoute(
      '/api/task-runs/demo?root=/repo', '/api/task-runs/demo', deps(),
    )
    expect(result).toEqual({ status: 200, body: model })
    expect(JSON.stringify(result)).not.toContain('/repo')
  })

  it('keeps missing, unsafe, and corrupt reads distinct', async () => {
    expect(await resolveTaskRunRoute('/api/task-runs/demo?root=/repo', '/api/task-runs/demo', deps({
      readRun: vi.fn(async () => null),
    }))).toMatchObject({ status: 404, body: { code: 'TASK_RUN_NOT_FOUND' } })
    expect(await resolveTaskRunRoute('/api/task-runs/demo?root=/repo', '/api/task-runs/demo', deps({
      readRun: vi.fn(async () => { throw Object.assign(new Error('/secret'), { status: 403 }) }),
    }))).toMatchObject({ status: 403, body: { code: 'TASK_RUN_PATH_FORBIDDEN' } })
    const corrupt = await resolveTaskRunRoute('/api/task-runs/demo?root=/repo', '/api/task-runs/demo', deps({
      readRun: vi.fn(async () => { throw new Error('/secret') }),
    }))
    expect(corrupt).toMatchObject({ status: 409, body: { code: 'TASK_RUN_CORRUPT' } })
    expect(JSON.stringify(corrupt)).not.toContain('/secret')
  })
})
