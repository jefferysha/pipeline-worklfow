import { mkdirSync, renameSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  publishTaskPlanRevision,
  readTaskPlanForChange,
  type TaskPlanReadModelV1,
  type TaskPlanRevisionV1,
} from '@tenon/kernel'
import {
  readAnchoredTaskPlan,
  resolveTaskPlanRoute,
  type TaskPlanRouteDeps,
} from './serverTaskPlanRoutes.js'
import { captureChangePathAnchor } from './contextBundlePreviewSupport.js'
import { captureWorkflowRootAnchor, closeWorkflowRootAnchor } from './workflows.js'

function legacyReadModel(): TaskPlanReadModelV1 {
  return {
    schema_version: 'task-plan-read/v1',
    source: 'legacy',
    schedulable: false,
    groups: [],
    items: [],
    completeness: { state: 'unknown', reason: 'legacy-semantics-unproven' },
    projection: { state: 'legacy' },
  }
}

function deps(overrides: Partial<TaskPlanRouteDeps> = {}): TaskPlanRouteDeps {
  return {
    workflowRootForRequest: vi.fn(() => ({
      ok: true,
      anchor: { path: '/repo', realPath: '/repo' } as never,
    })),
    readPlan: vi.fn(async () => legacyReadModel()),
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
    )).toEqual({
      status: 400,
      body: {
        ok: false,
        code: 'TASK_PLAN_CHANGE_INVALID',
        error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）',
      },
    })
    expect(d.workflowRootForRequest).not.toHaveBeenCalled()
  })

  it('distinguishes required, unregistered, and forbidden roots', async () => {
    const missing = deps()
    expect.soft(await resolveTaskPlanRoute(
      '/api/task-plans/demo',
      '/api/task-plans/demo',
      missing,
    )).toEqual({
      status: 400,
      body: { ok: false, code: 'TASK_PLAN_ROOT_REQUIRED', error: '缺少 root' },
    })
    expect(missing.workflowRootForRequest).not.toHaveBeenCalled()

    const unregistered = deps({ workflowRootForRequest: () => ({ ok: false, code: 404, error: 'no' }) })
    expect.soft(await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/other',
      '/api/task-plans/demo',
      unregistered,
    )).toEqual({
      status: 404,
      body: { ok: false, code: 'TASK_PLAN_ROOT_NOT_REGISTERED', error: 'root 未注册' },
    })

    const unsafe = deps({ workflowRootForRequest: () => ({ ok: false, code: 403, error: 'unsafe' }) })
    expect.soft(await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/unsafe',
      '/api/task-plans/demo',
      unsafe,
    )).toEqual({
      status: 403,
      body: { ok: false, code: 'TASK_PLAN_ROOT_FORBIDDEN', error: 'root 不可信' },
    })
  })

  it('returns the stable read model without local paths', async () => {
    const coverage = {
      complete: true,
      requirements: [{ id: 'req-1', work_item_ids: ['wi-1'] }],
      acceptance_criteria: [{ id: 'acc-1', work_item_ids: ['wi-1'] }],
      uncovered_requirement_ids: [],
      uncovered_acceptance_ids: [],
    }
    const dependencies = { edges: [], cyclic_work_item_ids: [] }
    const resources = { conflicts: [], serialized: [] }
    const model: TaskPlanReadModelV1 = {
      schema_version: 'task-plan-read/v1',
      source: 'canonical',
      schedulable: true,
      plan_id: 'plan-1',
      revision_id: 'rev-1',
      revision_number: 1,
      revision_status: 'frozen',
      validation: {
        valid: true,
        freezable: true,
        truncated: false,
        issues: [],
        coverage,
        dependencies,
        resources,
      },
      completeness: { state: 'complete' },
      requirements: [{ id: 'req-1', title: 'Readable requirement' }],
      acceptance_criteria: [{ id: 'acc-1', title: 'Readable acceptance' }],
      groups: [{ id: 'group-1', title: 'Build', parent_id: null, work_item_ids: ['wi-1'] }],
      items: [{
        id: 'wi-1',
        identity_quality: 'canonical',
        title: 'Implement read model',
        group_id: 'group-1',
        requirement_refs: ['req-1'],
        acceptance_refs: ['acc-1'],
        depends_on: [],
        resource_claims: [],
        expected_outputs: [],
        validators: [],
      }],
      coverage,
      dependencies,
      resources,
      projection: { state: 'current' },
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
    expect.soft(await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/repo', '/api/task-plans/demo', missing,
    )).toEqual({
      status: 404,
      body: { ok: false, code: 'TASK_PLAN_NOT_FOUND', error: 'TaskPlan 不存在' },
    })

    const unsafe = deps({ readPlan: vi.fn(async () => { throw Object.assign(new Error('/private/path'), { status: 403 }) }) })
    expect.soft(await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/repo', '/api/task-plans/demo', unsafe,
    )).toEqual({
      status: 403,
      body: {
        ok: false,
        code: 'TASK_PLAN_PATH_FORBIDDEN',
        error: 'canonical TaskPlan 路径不可信',
      },
    })

    const corrupt = deps({ readPlan: vi.fn(async () => { throw new Error('/private/corrupt') }) })
    const result = await resolveTaskPlanRoute(
      '/api/task-plans/demo?root=/repo', '/api/task-plans/demo', corrupt,
    )
    expect.soft(result).toEqual({
      status: 409,
      body: { ok: false, code: 'TASK_PLAN_CORRUPT', error: 'canonical TaskPlan 损坏' },
    })
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

  it('revalidates the root for a cross-module missing-change error without relying on instanceof', async () => {
    const { parent, root, replacement } = await rootFixture()
    const anchor = captureWorkflowRootAnchor(root)
    try {
      await expect(readAnchoredTaskPlan(anchor, 'demo', {
        captureChange: () => {
          renameSync(root, replacement)
          throw Object.assign(new Error('cross-module missing Change'), { status: 400 })
        },
      })).rejects.toMatchObject({ status: 403 })
    } finally {
      closeWorkflowRootAnchor(anchor)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('rejects a missing result produced during a full registered-root ABA', async () => {
    const { parent, root, replacement } = await rootFixture()
    const attackRoot = join(parent, 'attack-root')
    await mkdir(attackRoot)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      await expect(readAnchoredTaskPlan(anchor, 'missing', {
        captureChange: () => {
          renameSync(root, replacement)
          renameSync(attackRoot, root)
          renameSync(root, attackRoot)
          renameSync(replacement, root)
          throw Object.assign(new Error('missing during full root ABA'), { status: 400 })
        },
      })).rejects.toMatchObject({ status: 403 })
    } finally {
      closeWorkflowRootAnchor(anchor)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('rejects a missing result produced during a full changes-directory ABA', async () => {
    const { parent, root } = await rootFixture()
    const changes = join(root, 'openspec', 'changes')
    const displacedChanges = join(root, 'openspec', 'displaced-changes')
    const attackChanges = join(root, 'openspec', 'attack-changes')
    await mkdir(attackChanges)
    const anchor = captureWorkflowRootAnchor(root)
    try {
      await expect(readAnchoredTaskPlan(anchor, 'missing', {
        captureChange: (current, change) => {
          renameSync(changes, displacedChanges)
          renameSync(attackChanges, changes)
          try {
            return captureChangePathAnchor(current, change)
          } finally {
            renameSync(changes, attackChanges)
            renameSync(displacedChanges, changes)
          }
        },
      })).rejects.toMatchObject({ status: 403 })
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

  it('keeps reads bound to the captured Change across a full registered-root ABA', async () => {
    const { parent, root, replacement } = await rootFixture()
    const attackRoot = join(parent, 'attack-root')
    const attackChange = join(attackRoot, 'openspec', 'changes', 'demo')
    const revision: TaskPlanRevisionV1 = {
      schema_version: 'task-plan/v1',
      plan_id: 'plan-aba',
      revision_id: 'revision-aba',
      revision_number: 1,
      status: 'frozen',
      created_at: '2026-08-03T00:00:00.000Z',
      requirements: [],
      acceptance_criteria: [],
      groups: [],
      work_items: [],
    }
    await mkdir(attackChange, { recursive: true })
    await publishTaskPlanRevision(attackChange, revision, { expected_current_revision_id: null })
    const anchor = captureWorkflowRootAnchor(root)
    try {
      await expect(readAnchoredTaskPlan(anchor, 'demo', {
        readPlan: async (changeDir) => {
          await rename(root, replacement)
          await rename(attackRoot, root)
          try {
            return await readTaskPlanForChange(changeDir)
          } finally {
            await rename(root, attackRoot)
            await rename(replacement, root)
          }
        },
      })).rejects.toMatchObject({ status: 403 })
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
