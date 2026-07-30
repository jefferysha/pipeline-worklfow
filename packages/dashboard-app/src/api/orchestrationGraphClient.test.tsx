import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './transport'
import {
  decodeOrchestrationGraph,
  fetchOrchestrationGraph,
  MAX_ORCHESTRATION_NODES,
  OrchestrationGraphApiError,
} from './orchestrationGraphClient'

const graph = {
  schema: 'tenon-orchestration-graph/v1',
  scope: { root: '/repo', change: 'demo' },
  coverage: { implemented: ['workflow'], deferred: ['agent'] },
  nodes: [
    { id: 'workflow:default', kind: 'workflow', label: 'default', status: 'current', metadata: [] },
    { id: 'change:demo', kind: 'change', label: 'demo', status: 'in_progress', metadata: [] },
  ],
  edges: [{
    id: 'governs:workflow:default:change:demo',
    kind: 'governs',
    source: 'workflow:default',
    target: 'change:demo',
    label: 'governs',
  }],
}

afterEach(() => vi.unstubAllGlobals())

describe('decodeOrchestrationGraph', () => {
  it('accepts a valid closed graph', () => {
    expect(decodeOrchestrationGraph(graph)).toEqual(graph)
  })

  it.each([
    { ...graph, extra: true },
    { ...graph, nodes: [...graph.nodes, graph.nodes[0]] },
    { ...graph, nodes: [{ ...graph.nodes[0], kind: 'future' }] },
    { ...graph, nodes: [{ ...graph.nodes[0], status: 'future-status' }] },
    { ...graph, coverage: { ...graph.coverage, implemented: ['workflow', 'future'] } },
    { ...graph, coverage: { ...graph.coverage, implemented: ['workflow', 'workflow'] } },
    { ...graph, coverage: { implemented: ['workflow'], deferred: ['workflow'] } },
    {
      ...graph,
      nodes: [{ ...graph.nodes[0], metadata: [{ key: 'future_key', value: 'future' }] }],
    },
    {
      ...graph,
      nodes: [{
        ...graph.nodes[0],
        metadata: [
          { key: 'execution_model', value: 'step-graph' },
          { key: 'execution_model', value: 'step-graph' },
        ],
      }],
    },
    {
      ...graph,
      nodes: [{
        ...graph.nodes[0],
        metadata: [{ key: 'execution_model', value: 'future-model' }],
      }],
    },
    {
      ...graph,
      nodes: [graph.nodes[0], {
        ...graph.nodes[1],
        metadata: [{ key: 'preset', value: 'unsafe\npreset' }],
      }],
    },
    {
      ...graph,
      nodes: [graph.nodes[0], {
        ...graph.nodes[1],
        metadata: [{ key: 'preset', value: 'unsafe\u0085preset' }],
      }],
    },
    {
      ...graph,
      nodes: [...graph.nodes, {
        id: 'phase:build',
        kind: 'phase',
        label: 'Build',
        status: 'current',
        metadata: [{ key: 'phase_id', value: 'build' }, { key: 'order', value: 'NaN' }],
      }],
    },
    {
      ...graph,
      nodes: [...graph.nodes, {
        id: 'phase:build',
        kind: 'phase',
        label: 'Build',
        status: 'current',
        metadata: [{ key: 'phase_id', value: 'build' }, { key: 'gate', value: 'future' }],
      }],
    },
    {
      ...graph,
      nodes: [...graph.nodes, {
        id: 'document:tasks',
        kind: 'document',
        label: 'tasks',
        status: 'recorded',
        metadata: [{ key: 'required_read', value: 'yes' }],
      }],
    },
    {
      ...graph,
      nodes: [...graph.nodes, {
        id: 'review:future',
        kind: 'review',
        label: 'future',
        status: 'pending',
        metadata: [{ key: 'field', value: 'future_review_result' }],
      }],
    },
    {
      ...graph,
      nodes: [...graph.nodes, {
        id: 'session:active',
        kind: 'session',
        label: 'Session abc',
        status: 'active',
        metadata: [{ key: 'heartbeat_at', value: 'yesterday' }],
      }],
    },
    {
      ...graph,
      nodes: [...graph.nodes, {
        id: 'session:active',
        kind: 'session',
        label: 'Session abc',
        status: 'active',
        metadata: [{ key: 'heartbeat_at', value: '2026-02-30T00:00:00Z' }],
      }],
    },
    { ...graph, edges: [{ ...graph.edges[0], target: 'missing' }] },
    { ...graph, edges: [{ ...graph.edges[0], kind: 'depends' }] },
  ])('rejects unknown, duplicate, overlapping, or dangling contract values %#', (candidate) => {
    expect(decodeOrchestrationGraph(candidate)).toBeNull()
  })

  it('accepts every graph status emitted by legal review state', () => {
    expect(decodeOrchestrationGraph({
      ...graph,
      nodes: [{ ...graph.nodes[0], status: 'handled' }, graph.nodes[1]],
    })?.nodes[0]?.status).toBe('handled')
  })

  it('rejects arrays and labels beyond the browser rendering budget', () => {
    const nodes = Array.from({ length: MAX_ORCHESTRATION_NODES + 1 }, (_, index) => ({
      id: `change:${index}`,
      kind: 'change',
      label: `Change ${index}`,
      status: 'pending',
      metadata: [],
    }))
    expect(decodeOrchestrationGraph({ ...graph, nodes, edges: [] })).toBeNull()
    expect(decodeOrchestrationGraph({
      ...graph,
      nodes: [{ ...graph.nodes[0], label: 'x'.repeat(1025) }, graph.nodes[1]],
    })).toBeNull()
  })

  it('accepts safe custom phase and track identifiers while closing fixed metadata domains', () => {
    const candidate = {
      ...graph,
      nodes: [{
        id: 'change:demo',
        kind: 'change',
        label: 'demo',
        status: 'in_progress',
        metadata: [
          { key: 'phase', value: 'security_review' },
          { key: 'track', value: 'platform-ops' },
          { key: 'preset', value: 'security audit/v2' },
        ],
      }],
      edges: [],
    }
    expect(decodeOrchestrationGraph(candidate)).toEqual(candidate)
  })
})

describe('fetchOrchestrationGraph', () => {
  it('encodes scope and forwards AbortSignal', async () => {
    const signal = new AbortController().signal
    const scopedGraph = { ...graph, scope: { root: '/repo & one', change: 'demo/a' } }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(scopedGraph)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchOrchestrationGraph('/repo & one', 'demo/a', signal)).resolves.toEqual(scopedGraph)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orchestration-graph?root=%2Frepo+%26+one&change=demo%2Fa',
      { headers: { Accept: 'application/json' }, signal },
    )
  })

  it('preserves 404 and fails closed on malformed 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    await expect(fetchOrchestrationGraph('/repo', 'demo')).rejects.toMatchObject({ status: 404 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    await expect(fetchOrchestrationGraph('/repo', 'demo')).rejects.toBeInstanceOf(ApiError)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...graph,
      scope: { root: '/other', change: 'demo' },
    }))))
    await expect(fetchOrchestrationGraph('/repo', 'demo')).rejects.toThrow(/scope/)
  })

  it('preserves stable graph error codes so scope failures are not old-server unavailability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: 'ORCHESTRATION_ROOT_NOT_REGISTERED',
      error: 'unknown root',
    }), { status: 404 })))

    await expect(fetchOrchestrationGraph('/repo', 'demo')).rejects.toEqual(expect.objectContaining({
      name: 'OrchestrationGraphApiError',
      status: 404,
      code: 'ORCHESTRATION_ROOT_NOT_REGISTERED',
    }))
    await expect(fetchOrchestrationGraph('/repo', 'demo')).rejects.toBeInstanceOf(OrchestrationGraphApiError)
  })

  it('accepts stable Change and definition scope codes without exposing server text as data', async () => {
    for (const code of ['ORCHESTRATION_CHANGE_FORBIDDEN', 'ORCHESTRATION_DEFINITION_FORBIDDEN']) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        ok: false,
        code,
        error: 'path trust check failed',
      }), { status: 403 })))
      await expect(fetchOrchestrationGraph('/repo', 'demo')).rejects.toMatchObject({
        name: 'OrchestrationGraphApiError',
        status: 403,
        code,
      })
    }
  })
})
