import { describe, expect, it } from 'vitest'
import type { ChangeSnapshot } from './types.js'
import { buildOrchestrationGraph } from './orchestrationGraph.js'

function changeFixture(): ChangeSnapshot {
  return {
    name: 'graph-demo',
    path: '/repo/openspec/changes/graph-demo',
    phase: 'build',
    phase_status: 'in_progress',
    track: 'frontend',
    preset: 'full',
    archived: 'false',
    updated_at: '2026-07-30T00:00:00Z',
    fields: {
      workflow: 'default',
      pre_verify_review_result: 'pass',
      agent_review_result: 'pending',
    },
    workflowPlanFingerprint: 'a'.repeat(64),
    workflowRules: {
      executionModel: 'step-graph',
      steps: ['open', 'build', 'verify'],
      transitions: {
        open: [{ event: 'open-complete', to: 'build' }],
        build: [{ event: 'build-complete', to: 'verify' }],
        verify: [],
      },
      gateByStep: { open: null, build: null, verify: 'review' },
      labelByStep: { open: 'Open', build: 'Build', verify: 'Verify' },
      outputsByStep: { open: ['proposal'], build: [], verify: ['verification-report'] },
    },
    workflowExecution: { readinessByTransition: {} },
    todo: {
      hasTaskSource: true,
      stages: [
        { id: 'open', label: 'Open', status: 'done', tasks: [{ text: 'Choose scope', completed: true }] },
        { id: 'build', label: 'Build', status: 'current', tasks: [{ text: 'Implement graph', completed: false }] },
        { id: 'verify', label: 'Verify', status: 'pending', tasks: [] },
      ],
    },
    documents: {
      governed: true,
      phase: 'build',
      ledgerPresent: true,
      pass: true,
      blockers: [],
      items: [{
        kind: 'proposal',
        status: 'recorded',
        requiredRead: true,
        paths: ['/private/repo/proposal.md'],
        producers: ['openspec-propose'],
        timeline: [],
      }],
    },
    terminalActivity: {
      sessionId: 'session-secret-value',
      heartbeatAt: '2026-07-30T00:00:00Z',
      expiresAt: '2026-07-30T00:01:00Z',
    },
  }
}

describe('buildOrchestrationGraph', () => {
  it('projects stable typed nodes and edges without leaking document paths or full session ids', () => {
    const graph = buildOrchestrationGraph({
      root: '/repo',
      change: changeFixture(),
      definition: {
        schema: 'workflow-definition-status/v1',
        workflow: 'default',
        status: 'changed',
        frozen_fingerprint: 'a'.repeat(64),
        current_fingerprint: 'b'.repeat(64),
      },
    })

    expect(graph.schema).toBe('tenon-orchestration-graph/v1')
    expect(graph.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining([
      'workflow', 'change', 'phase', 'task', 'document', 'review', 'session',
    ]))
    expect(graph.edges.map((edge) => edge.kind)).toEqual(expect.arrayContaining([
      'governs', 'contains', 'transitions', 'produces', 'reviews', 'executes',
    ]))
    expect(graph.nodes.find((node) => node.kind === 'workflow')).toMatchObject({
      status: 'changed',
      metadata: expect.arrayContaining([
        { key: 'frozen_fingerprint', value: 'aaaaaaaaaaaa' },
        { key: 'current_fingerprint', value: 'bbbbbbbbbbbb' },
      ]),
    })
    expect(JSON.stringify(graph)).not.toContain('/private/repo')
    expect(JSON.stringify(graph)).not.toContain('session-secret-value')
    expect(graph.nodes.map((node) => node.id)).toEqual([...graph.nodes.map((node) => node.id)].sort())
    expect(graph.edges.map((edge) => edge.id)).toEqual([...graph.edges.map((edge) => edge.id)].sort())
  })

  it('keeps a valid minimal workflow/change/phase graph when optional resources are absent', () => {
    const fixture = changeFixture()
    fixture.fields = { workflow: 'default' }
    fixture.todo = undefined
    fixture.documents = undefined
    fixture.terminalActivity = undefined
    const graph = buildOrchestrationGraph({
      root: '/repo',
      change: fixture,
      definition: {
        schema: 'workflow-definition-status/v1',
        workflow: 'default',
        status: 'unavailable',
        frozen_fingerprint: null,
        current_fingerprint: null,
      },
    })

    expect(graph.nodes.some((node) => node.kind === 'workflow')).toBe(true)
    expect(graph.nodes.some((node) => node.kind === 'change')).toBe(true)
    expect(graph.nodes.filter((node) => node.kind === 'phase')).toHaveLength(3)
    expect(graph.nodes.some((node) => ['task', 'document', 'review', 'session'].includes(node.kind))).toBe(false)
    expect(graph.coverage.deferred).toContain('agent')
  })

  it('canonicalizes kernel-accepted session timestamps at the graph contract boundary', () => {
    const fixture = changeFixture()
    fixture.terminalActivity = {
      ...fixture.terminalActivity!,
      heartbeatAt: 'Thu, 30 Jul 2026 00:00:00 GMT',
      expiresAt: '2026-07-30T00:01:00+00:00',
    }
    const graph = buildOrchestrationGraph({
      root: '/repo',
      change: fixture,
      definition: {
        schema: 'workflow-definition-status/v1',
        workflow: 'default',
        status: 'current',
        frozen_fingerprint: 'a'.repeat(64),
        current_fingerprint: 'a'.repeat(64),
      },
    })

    expect(graph.nodes.find((node) => node.kind === 'session')?.metadata).toEqual([
      { key: 'heartbeat_at', value: '2026-07-30T00:00:00.000Z' },
      { key: 'expires_at', value: '2026-07-30T00:01:00.000Z' },
    ])
  })

  it('keeps transition ids unique for distinct events with the same endpoints and falls back empty labels', () => {
    const fixture = changeFixture()
    fixture.workflowRules.steps = ['open', 'verify']
    fixture.workflowRules.labelByStep = { open: '', verify: 'Verify' }
    fixture.workflowRules.transitions = {
      open: [
        { event: 'accept', to: 'verify' },
        { event: 'skip', to: 'verify' },
      ],
      verify: [],
    }
    const graph = buildOrchestrationGraph({
      root: '/repo',
      change: fixture,
      definition: {
        schema: 'workflow-definition-status/v1',
        workflow: 'default',
        status: 'current',
        frozen_fingerprint: 'a'.repeat(64),
        current_fingerprint: 'a'.repeat(64),
      },
    })

    const transitions = graph.edges.filter((edge) => edge.kind === 'transitions')
    expect(transitions).toHaveLength(2)
    expect(new Set(transitions.map((edge) => edge.id))).toHaveLength(2)
    expect(graph.nodes.find((node) => node.id === 'phase:open')?.label).toBe('open')
  })
})
