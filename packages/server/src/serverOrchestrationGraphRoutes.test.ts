import { describe, expect, it } from 'vitest'
import type { ChangeSnapshot } from './types.js'
import { resolveOrchestrationGraphRoute } from './serverOrchestrationGraphRoutes.js'

const change = {
  name: 'demo',
  phase: 'build',
  fields: {},
  workflowPlanFingerprint: 'a'.repeat(64),
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
      readDefinition: async () => ({
        schema: 'workflow-definition-status/v1' as const,
        workflow: 'default',
        status: 'unavailable' as const,
        frozen_fingerprint: null,
        current_fingerprint: null,
      }),
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
    )).toEqual({ status: 404, body: { ok: false, error: 'unknown root' } })
  })

  it('returns a graph for a real change and a bounded error when it is missing', async () => {
    const definition = {
      schema: 'workflow-definition-status/v1' as const,
      workflow: 'default',
      status: 'unavailable' as const,
      frozen_fingerprint: null,
      current_fingerprint: null,
    }
    const base = {
      workflowRootForRequest: () => ({ ok: true as const, anchor: { path: '/repo' } as never }),
      readChange: async () => change,
      readDefinition: async () => definition,
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
    const missing = await resolveOrchestrationGraphRoute(
      '/api/orchestration-graph?root=%2Frepo&change=demo',
      '/api/orchestration-graph',
      { ...base, readChange: async () => null },
    )
    expect(missing).toEqual({
      status: 400,
      body: { ok: false, error: '找不到该 change（无 canonical/legacy 状态）' },
    })
  })
})
