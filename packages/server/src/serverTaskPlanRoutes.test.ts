import { mkdirSync, renameSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  readAnchoredTaskPlan,
  resolveTaskPlanRoute,
  type TaskPlanRouteDeps,
} from './serverTaskPlanRoutes.js'
import { captureChangePathAnchor } from './contextBundlePreviewSupport.js'
import { captureWorkflowRootAnchor, closeWorkflowRootAnchor } from './workflows.js'

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

describe('readAnchoredTaskPlan', () => {
  async function rootFixture(): Promise<{ parent: string; root: string; replacement: string }> {
    const parent = await mkdtemp(join(tmpdir(), 'tenon-task-plan-root-anchor-'))
    const root = join(parent, 'root')
    const replacement = join(parent, 'displaced-root')
    await mkdir(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
    return { parent, root, replacement }
  }

  it('returns missing only while the registered root remains trusted', async () => {
    const { parent, root } = await rootFixture()
    const anchor = captureWorkflowRootAnchor(root)
    try {
      await expect(readAnchoredTaskPlan(anchor, 'missing')).resolves.toBeNull()
    } finally {
      closeWorkflowRootAnchor(anchor)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('rejects a registered-root replacement introduced while capturing the Change', async () => {
    const { parent, root, replacement } = await rootFixture()
    const anchor = captureWorkflowRootAnchor(root)
    const readPlan = vi.fn(async () => ({ private_payload: 'replacement-secret' }))
    try {
      await expect(readAnchoredTaskPlan(anchor, 'demo', {
        captureChange: (current, change) => {
          renameSync(root, replacement)
          mkdirSync(join(root, 'openspec', 'changes', change), { recursive: true })
          return captureChangePathAnchor(current, change)
        },
        readPlan,
      })).rejects.toMatchObject({ status: 403 })
      expect(readPlan).not.toHaveBeenCalled()
    } finally {
      closeWorkflowRootAnchor(anchor)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('rejects and does not return replacement content when the root changes during the read', async () => {
    const { parent, root, replacement } = await rootFixture()
    const anchor = captureWorkflowRootAnchor(root)
    try {
      let caught: unknown
      try {
        await readAnchoredTaskPlan(anchor, 'demo', {
          readPlan: async () => {
            await rename(root, replacement)
            await mkdir(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
            return { private_payload: 'replacement-secret' }
          },
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toMatchObject({ status: 403 })
      expect(String(caught)).not.toContain('replacement-secret')
    } finally {
      closeWorkflowRootAnchor(anchor)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('prioritizes the root trust failure when a replaced-path read also throws', async () => {
    const { parent, root, replacement } = await rootFixture()
    const anchor = captureWorkflowRootAnchor(root)
    try {
      let caught: unknown
      try {
        await readAnchoredTaskPlan(anchor, 'demo', {
          readPlan: async () => {
            await rename(root, replacement)
            await mkdir(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
            throw new Error('replacement-secret-read-error')
          },
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toMatchObject({ status: 403 })
      expect(String(caught)).not.toContain('replacement-secret-read-error')
    } finally {
      closeWorkflowRootAnchor(anchor)
      await rm(parent, { recursive: true, force: true })
    }
  })
})
