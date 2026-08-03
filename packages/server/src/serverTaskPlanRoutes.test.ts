import { describe, expect, it, vi } from 'vitest'
import {
  resolveTaskPlanRoute,
  type TaskPlanRouteDeps,
} from './serverTaskPlanRoutes.js'

function deps(overrides: Partial<TaskPlanRouteDeps> = {}): TaskPlanRouteDeps {
  return {
    workflowRootForRequest: vi.fn(() => ({
      ok: true,
      anchor: { path: '/repo', realPath: '/repo' } as never,
    })),
    readPlan: vi.fn(async () => ({ schema: 'task-plan-read/v1', source: 'canonical' })),
    ...overrides,
  }
}

describe('resolveTaskPlanRoute', () => {
  it('ignores unrelated endpoints', async () => {
    expect(await resolveTaskPlanRoute('/', '/api/snapshot', deps())).toBeNull()
  })

  it('validates the decoded change before resolving the registered root', async () => {
    const d = deps()
    expect(await resolveTaskPlanRoute(
      '/api/task-plans/..%2Fbad?root=/repo',
      '/api/task-plans/..%2Fbad',
      d,
    )).toEqual({ status: 400, body: { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' } })
    expect(d.workflowRootForRequest).not.toHaveBeenCalled()
  })

  it('requires an explicit registered root', async () => {
    const missing = deps()
    expect(await resolveTaskPlanRoute(
      '/api/task-plans/demo',
      '/api/task-plans/demo',
      missing,
    )).toEqual({ status: 400, body: { ok: false, error: '缺少 root' } })
    expect(missing.workflowRootForRequest).not.toHaveBeenCalled()

    const unregistered = deps({ workflowRootForRequest: () => ({ ok: false, code: 404, error: 'no' }) })
    expect(await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/other',
      '/api/task-plans/demo',
      unregistered,
    )).toEqual({ status: 404, body: { ok: false, error: 'root 未注册' } })
  })

  it('returns the stable read model without local paths', async () => {
    const model = {
      schema_version: 'task-plan-read/v1',
      source: 'canonical',
      revision_id: 'rev-1',
      requirements: [{ id: 'req-1', title: 'Readable requirement' }],
      acceptance_criteria: [{ id: 'acc-1', title: 'Readable acceptance' }],
      groups: [],
      work_items: [],
    }
    const d = deps({ readPlan: vi.fn(async () => model) })
    const result = await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/repo',
      '/api/task-plans/demo',
      d,
    )
    expect(result).toEqual({ status: 200, body: model })
    expect(result).toMatchObject({ body: {
      requirements: [{ id: 'req-1', title: 'Readable requirement' }],
      acceptance_criteria: [{ id: 'acc-1', title: 'Readable acceptance' }],
    } })
    expect(JSON.stringify(result)).not.toContain('/repo')
  })

  it('keeps missing, unsafe, and corrupt state distinct with bounded errors', async () => {
    const missing = deps({ readPlan: vi.fn(async () => null) })
    expect(await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/repo', '/api/task-plans/demo', missing,
    )).toEqual({ status: 404, body: { ok: false, error: 'TaskPlan 不存在' } })

    const unsafe = deps({ readPlan: vi.fn(async () => { throw Object.assign(new Error('/private/path'), { status: 403 }) }) })
    expect(await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/repo', '/api/task-plans/demo', unsafe,
    )).toEqual({ status: 403, body: { ok: false, error: 'canonical TaskPlan 路径不可信' } })

    const corrupt = deps({ readPlan: vi.fn(async () => { throw new Error('/private/corrupt') }) })
    const result = await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/repo', '/api/task-plans/demo', corrupt,
    )
    expect(result).toEqual({ status: 409, body: { ok: false, error: 'canonical TaskPlan 损坏' } })
    expect(JSON.stringify(result)).not.toContain('/private')
  })
})
