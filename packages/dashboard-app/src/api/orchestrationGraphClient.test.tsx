import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './transport'
import { decodeOrchestrationGraph, fetchOrchestrationGraph } from './orchestrationGraphClient'

const graph = {
  schema: 'tenon-orchestration-graph/v1',
  scope: { root: '/repo', change: 'demo' },
  coverage: { implemented: ['workflow'], deferred: ['agent'] },
  nodes: [
    { id: 'workflow:default', kind: 'workflow', label: 'default', status: 'current', metadata: [] },
    { id: 'change:demo', kind: 'change', label: 'demo', status: 'build', metadata: [] },
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
    { ...graph, edges: [{ ...graph.edges[0], target: 'missing' }] },
    { ...graph, edges: [{ ...graph.edges[0], kind: 'depends' }] },
  ])('rejects unknown fields, ids, kinds, and dangling edges %#', (candidate) => {
    expect(decodeOrchestrationGraph(candidate)).toBeNull()
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
})
