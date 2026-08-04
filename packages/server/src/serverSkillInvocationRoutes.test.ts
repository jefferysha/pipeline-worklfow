import { describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rename, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SkillInvocationListReadModelV1 } from '@tenon/kernel'
import {
  readAnchoredSkillInvocationEvidence,
  resolveSkillInvocationRoute,
  type SkillInvocationRouteDeps,
} from './serverSkillInvocationRoutes.js'
import { ContextBundlePathError } from './contextBundlePreviewSupport.js'
import { captureWorkflowRootAnchor, closeWorkflowRootAnchor } from './workflows.js'

const evidence: SkillInvocationListReadModelV1 = {
  schema_version: 'skill-invocation-list/v1',
  state: 'ready',
  items: [{
    schema_version: 'skill-invocation-read/v1',
    invocation_id: 'invocation-1',
    status: 'completed',
    skill: { id: 'task-planner', version: '1' },
    subject: {
      workflow_definition_id: 'default', workflow_run_id: 'run-1', step_id: 'build',
      step_visit: { run_id: 'run-1', transition_sequence: 3 },
      task_plan_revision_id: 'revision-1', work_item_id: 'work-item-1',
    },
    started_at: '2026-08-03T00:00:00.000Z',
    finished_at: '2026-08-03T00:00:01.000Z',
    input: { schema_id: 'input/v1', fields: [] },
    output: { schema_id: 'output/v1', fields: [] },
    questions: [], decisions: [], artifacts: [],
  }],
}

function deps(overrides: Partial<SkillInvocationRouteDeps> = {}): SkillInvocationRouteDeps {
  return {
    workflowRootForRequest: vi.fn(() => ({ ok: true, anchor: { path: '/repo' } as never })),
    readEvidence: vi.fn(async () => evidence),
    ...overrides,
  }
}

describe('resolveSkillInvocationRoute', () => {
  it('returns privacy-safe evidence and supports exact run/work-item filters', async () => {
    const result = await resolveSkillInvocationRoute(
      '/api/skill-invocations/demo?root=/repo&run_id=run-1&work_item_id=work-item-1',
      '/api/skill-invocations/demo',
      deps(),
    )
    expect(result).toEqual({ status: 200, body: evidence })
    expect(JSON.stringify(result)).not.toContain('project_id')
    expect(JSON.stringify(result)).not.toContain('digest')
    expect(JSON.stringify(result)).not.toContain('session')
  })

  it('distinguishes invalid input, unregistered roots, and corrupt evidence', async () => {
    expect(await resolveSkillInvocationRoute(
      '/api/skill-invocations/..%2Fbad?root=/repo', '/api/skill-invocations/..%2Fbad', deps(),
    )).toMatchObject({ status: 400, body: { code: 'SKILL_INVOCATION_CHANGE_INVALID' } })
    expect(await resolveSkillInvocationRoute(
      '/api/skill-invocations/demo?root=/missing', '/api/skill-invocations/demo',
      deps({ workflowRootForRequest: () => ({ ok: false, code: 404, error: 'missing' }) }),
    )).toMatchObject({ status: 404, body: { code: 'SKILL_INVOCATION_ROOT_NOT_REGISTERED' } })
    expect(await resolveSkillInvocationRoute(
      '/api/skill-invocations/demo?root=/repo', '/api/skill-invocations/demo',
      deps({ readEvidence: vi.fn(async () => { throw new Error('/private/transcript') }) }),
    )).toEqual({
      status: 409,
      body: { ok: false, code: 'SKILL_INVOCATION_CORRUPT', error: 'Skill invocation evidence is corrupt' },
    })
  })

  it('reads through a registered root anchor and rejects a Change path swap before returning data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-invocation-route-'))
    const outside = await mkdtemp(join(tmpdir(), 'tenon-invocation-outside-'))
    const changeDir = join(root, 'openspec', 'changes', 'demo')
    const parked = join(root, 'openspec', 'changes', 'demo-parked')
    await mkdir(changeDir, { recursive: true })
    const anchor = captureWorkflowRootAnchor(root)
    try {
      await expect(readAnchoredSkillInvocationEvidence(anchor, 'demo')).resolves.toEqual({
        schema_version: 'skill-invocation-list/v1', state: 'empty', items: [],
      })
      await expect(readAnchoredSkillInvocationEvidence(anchor, 'demo', {
        readEvidence: async () => {
          await rename(changeDir, parked)
          await symlink(outside, changeDir)
          return evidence
        },
      })).rejects.toMatchObject({ status: 403 })
    } finally {
      closeWorkflowRootAnchor(anchor)
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('preserves forbidden path failures while mapping only missing Changes to 404', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-invocation-route-status-'))
    await mkdir(join(root, 'openspec', 'changes'), { recursive: true })
    const anchor = captureWorkflowRootAnchor(root)
    try {
      await expect(readAnchoredSkillInvocationEvidence(anchor, 'missing')).rejects.toMatchObject({ status: 404 })
      await expect(readAnchoredSkillInvocationEvidence(anchor, 'demo', {
        captureChange: () => {
          throw new ContextBundlePathError(403, 'unsafe Change path')
        },
      })).rejects.toMatchObject({ status: 403, message: 'unsafe Change path' })
      await expect(readAnchoredSkillInvocationEvidence(anchor, 'demo', {
        captureChange: () => {
          throw Object.assign(new Error('missing Change'), { code: 'ENOENT' })
        },
      })).rejects.toMatchObject({ status: 404 })
    } finally {
      closeWorkflowRootAnchor(anchor)
      await rm(root, { recursive: true, force: true })
    }
  })
})
