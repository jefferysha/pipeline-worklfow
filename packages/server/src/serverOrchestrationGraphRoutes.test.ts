import { describe, expect, it, vi } from 'vitest'
import type { ChangeSnapshot } from './types.js'
import { ContextBundlePathError } from './contextBundlePreviewSupport.js'
import { resolveOrchestrationGraphRoute } from './serverOrchestrationGraphRoutes.js'
import { WorkflowPathError, WorkflowReadError } from './workflows.js'

const change = {
  name: 'demo',
  phase: 'build',
  fields: {},
  workflowPlanFingerprint: 'a'.repeat(64),
  workflowDefinition: {
    schema: 'workflow-definition-status/v1',
    workflow: 'default',
    status: 'unavailable',
    frozen_fingerprint: null,
    current_fingerprint: null,
  },
  workflowRules: {
    executionModel: 'phase-manifest',
    steps: ['build'],
    transitions: { build: [] },
    gateByStep: { build: null },
    labelByStep: { build: 'Build' },
    outputsByStep: { build: [] },
  },
  workflowExecution: { readinessByTransition: {} },
} as ChangeSnapshot

describe('resolveOrchestrationGraphRoute', () => {
  it('returns null for other routes and rejects unsafe scopes', async () => {
    const deps = {
      workflowRootForRequest: () => ({ ok: true as const, anchor: { path: '/repo' } as never }),
      readChange: async () => change,
    }
    expect(await resolveOrchestrationGraphRoute('/', '/api/other', deps)).toBeNull()
    expect(await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=..%2Fescape',
      '/api/orchestration-graph',
      deps,
    )).toMatchObject({ status: 400 })
    expect(await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Foutside&change=demo',
      '/api/orchestration-graph',
      { ...deps, workflowRootForRequest: () => ({ ok: false as const, code: 404 as const, error: 'unknown root' }) },
    )).toEqual({
      status: 404,
      body: { ok: false, code: 'ORCHESTRATION_ROOT_NOT_REGISTERED', error: 'root 未注册' },
    })
    expect(await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Fprivate%2Fsecret&change=demo',
      '/api/orchestration-graph',
      {
        ...deps,
        workflowRootForRequest: () => ({
          ok: false as const,
          code: 403 as const,
          error: '/private/secret realpath changed token=leak',
        }),
      },
    )).toEqual({
      status: 403,
      body: { ok: false, code: 'ORCHESTRATION_ROOT_FORBIDDEN', error: 'root 不可信' },
    })
    const resolver = vi.fn(deps.workflowRootForRequest)
    expect(await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?change=demo',
      '/api/orchestration-graph',
      { ...deps, workflowRootForRequest: resolver },
    )).toEqual({
      status: 400,
      body: { ok: false, code: 'ORCHESTRATION_ROOT_REQUIRED', error: '缺少 root 参数' },
    })
    expect(resolver).not.toHaveBeenCalled()
  })

  it('returns a graph for a real change and a bounded error when it is missing', async () => {
    const readChange = vi.fn(async () => change)
    const base = {
      workflowRootForRequest: () => ({ ok: true as const, anchor: { path: '/repo' } as never }),
      readChange,
    }
    const result = await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=demo',
      '/api/orchestration-graph',
      base,
    )
    expect(result).toMatchObject({
      status: 200,
      body: { schema: 'tenon-orchestration-graph/v1', scope: { root: '/repo', change: 'demo' } },
    })
    expect(readChange).toHaveBeenCalledTimes(1)
    const missing = await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=demo',
      '/api/orchestration-graph',
      { ...base, readChange: async () => null },
    )
    expect(missing).toEqual({
      status: 404,
      body: {
        ok: false,
        code: 'ORCHESTRATION_CHANGE_NOT_FOUND',
        error: '找不到该 change（无 canonical/legacy 状态）',
      },
    })
  })

  it('returns a stable bounded code for unreadable canonical state', async () => {
    const result = await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=demo',
      '/api/orchestration-graph',
      {
        workflowRootForRequest: () => ({ ok: true as const, anchor: { path: '/repo' } as never }),
        readChange: async () => { throw new Error('/private/repo/secret') },
      },
    )
    expect(result).toEqual({
      status: 500,
      body: { ok: false, code: 'ORCHESTRATION_CHANGE_UNREADABLE', error: '编排图读取失败' },
    })
    expect(JSON.stringify(result)).not.toContain('/private/repo')
  })

  it('preserves path-anchor violations as a bounded forbidden scope error', async () => {
    const result = await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=demo',
      '/api/orchestration-graph',
      {
        workflowRootForRequest: () => ({ ok: true as const, anchor: { path: '/repo' } as never }),
        readChange: async () => {
          throw new ContextBundlePathError(403, '/private/repo/change escaped')
        },
      },
    )
    expect(result).toEqual({
      status: 403,
      body: { ok: false, code: 'ORCHESTRATION_CHANGE_FORBIDDEN', error: 'Change 路径不可信' },
    })
    expect(JSON.stringify(result)).not.toContain('/private/repo')
  })

  it('preserves definition path violations as a distinct bounded forbidden error', async () => {
    const result = await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=demo',
      '/api/orchestration-graph',
      {
        workflowRootForRequest: () => ({ ok: true as const, anchor: { path: '/repo' } as never }),
        readChange: async () => { throw new WorkflowPathError('/private/repo/workflow escaped') },
      },
    )
    expect(result).toEqual({
      status: 403,
      body: {
        ok: false,
        code: 'ORCHESTRATION_DEFINITION_FORBIDDEN',
        error: 'Workflow 定义路径不可信',
      },
    })
    expect(JSON.stringify(result)).not.toContain('/private/repo')
  })

  it('preserves definition I/O failures from the single Change snapshot read', async () => {
    const result = await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=demo',
      '/api/orchestration-graph',
      {
        workflowRootForRequest: () => ({ ok: true as const, anchor: { path: '/repo' } as never }),
        readChange: async () => { throw new WorkflowReadError('/private/repo/workflow EIO') },
      },
    )
    expect(result).toEqual({
      status: 500,
      body: {
        ok: false,
        code: 'ORCHESTRATION_DEFINITION_UNREADABLE',
        error: '编排图读取失败',
      },
    })
    expect(JSON.stringify(result)).not.toContain('/private/repo')
  })

  it('maps graph capacity failures to a stable 413 contract', async () => {
    const oversized = {
      ...structuredClone(change),
      todo: {
      hasTaskSource: true,
      stages: [{
        id: 'build',
        label: 'Build',
        status: 'current',
        tasks: Array.from({ length: 600 }, (_, index) => ({
          text: `Task ${index}`,
          completed: false,
        })),
      }],
      },
    } as ChangeSnapshot
    const result = await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=demo',
      '/api/orchestration-graph',
      {
        workflowRootForRequest: () => ({ ok: true as const, anchor: { path: '/repo' } as never }),
        readChange: async () => oversized,
      },
    )
    expect(result).toEqual({
      status: 413,
      body: {
        ok: false,
        code: 'ORCHESTRATION_GRAPH_LIMIT_EXCEEDED',
        error: '编排图超过安全上限',
      },
    })
  })
})
