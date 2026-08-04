import { describe, expect, it, vi } from 'vitest'
import type { TaskRunReadModelV1 } from '@tenon/kernel'
import {
  resolveTaskRunOperation,
  type TaskRunOperationRouteDeps,
} from './serverTaskRunOperations.js'

const model = { schema_version: 'task-run/v1', run_revision: 3, state: 'running' } as TaskRunReadModelV1

function deps(overrides: Partial<TaskRunOperationRouteDeps> = {}): TaskRunOperationRouteDeps {
  return {
    workflowRootForRequest: vi.fn(() => ({ ok: true, anchor: {} as never })),
    mutateRun: vi.fn(async () => model),
    clock: () => '2026-08-04T00:00:00.000Z',
    operationId: () => 'operation-1',
    ...overrides,
  }
}

const body = {
  root: '/repo',
  operation: 'cancel',
  work_item_id: 'wi-1',
  expected_run_revision: 2,
  expected_state: 'running',
}

describe('resolveTaskRunOperation', () => {
  it('ignores unrelated routes and validates a closed request body', async () => {
    expect(await resolveTaskRunOperation('/api/nope', body, deps())).toBeNull()
    const d = deps()
    expect(await resolveTaskRunOperation('/api/task-runs/demo/operations', {
      ...body, unexpected: true,
    }, d)).toMatchObject({ status: 400, body: { code: 'TASK_RUN_OPERATION_INVALID' } })
    expect(d.workflowRootForRequest).not.toHaveBeenCalled()
  })

  it('rejects malformed identities and stale registered roots before mutation', async () => {
    expect(await resolveTaskRunOperation('/api/task-runs/..%2Fbad/operations', body, deps()))
      .toMatchObject({ status: 400, body: { code: 'TASK_RUN_CHANGE_INVALID' } })
    expect(await resolveTaskRunOperation('/api/task-runs/demo/operations', body, deps({
      workflowRootForRequest: () => ({ ok: false, code: 404, error: 'missing' }),
    }))).toMatchObject({ status: 404, body: { code: 'TASK_RUN_ROOT_NOT_REGISTERED' } })
  })

  it('returns the updated stable DTO and passes the exact CAS fact', async () => {
    const d = deps()
    expect(await resolveTaskRunOperation('/api/task-runs/demo/operations', body, d))
      .toEqual({ status: 200, body: model })
    expect(d.mutateRun).toHaveBeenCalledWith(expect.anything(), 'demo', {
      operation_id: 'operation-1', operation: 'cancel', work_item_id: 'wi-1',
      expected_run_revision: 2, expected_state: 'running', recorded_at: '2026-08-04T00:00:00.000Z',
    })
  })

  it('maps disallowed or stale operations to stable conflicts without leaking causes', async () => {
    const conflict = await resolveTaskRunOperation('/api/task-runs/demo/operations', body, deps({
      mutateRun: vi.fn(async () => { throw Object.assign(new Error('/secret'), { code: 'TASK_RUN_OPERATION_CONFLICT' }) }),
    }))
    expect(conflict).toMatchObject({ status: 409, body: { code: 'TASK_RUN_OPERATION_CONFLICT' } })
    expect(JSON.stringify(conflict)).not.toContain('/secret')
  })
})
