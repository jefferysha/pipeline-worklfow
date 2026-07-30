import type { ChangeSnapshot } from './types.js'
import type { WorkflowDefinitionStatusResponse } from './workflowDefinitionStatus.js'

export const ORCHESTRATION_NODE_KINDS = [
  'workflow', 'change', 'phase', 'task', 'document', 'review', 'session',
] as const
export const ORCHESTRATION_EDGE_KINDS = [
  'governs', 'contains', 'transitions', 'produces', 'reviews', 'executes',
] as const

export type OrchestrationNodeKind = (typeof ORCHESTRATION_NODE_KINDS)[number]
export type OrchestrationEdgeKind = (typeof ORCHESTRATION_EDGE_KINDS)[number]

export interface OrchestrationMetadata {
  readonly key: string
  readonly value: string
}

export interface OrchestrationNode {
  readonly id: string
  readonly kind: OrchestrationNodeKind
  readonly label: string
  readonly status: string | null
  readonly metadata: readonly OrchestrationMetadata[]
}

export interface OrchestrationEdge {
  readonly id: string
  readonly kind: OrchestrationEdgeKind
  readonly source: string
  readonly target: string
  readonly label: string
}

export interface OrchestrationGraph {
  readonly schema: 'tenon-orchestration-graph/v1'
  readonly scope: { readonly root: string; readonly change: string }
  readonly coverage: {
    readonly implemented: readonly string[]
    readonly deferred: readonly string[]
  }
  readonly nodes: readonly OrchestrationNode[]
  readonly edges: readonly OrchestrationEdge[]
}

export interface BuildOrchestrationGraphInput {
  readonly root: string
  readonly change: ChangeSnapshot
  readonly definition: WorkflowDefinitionStatusResponse
}

function valueOf(change: ChangeSnapshot, key: string): string {
  const value = change.fields[key as keyof typeof change.fields]
  return Array.isArray(value) ? value.join(',') : value ?? ''
}

function short(value: string | null): string {
  return value === null ? '' : value.slice(0, 12)
}

function canonicalTimestamp(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value
}

function edge(
  kind: OrchestrationEdgeKind,
  source: string,
  target: string,
  label: string,
  discriminator?: string,
): OrchestrationEdge {
  const suffix = discriminator === undefined ? '' : `:${encodeURIComponent(discriminator)}`
  return { id: `${kind}:${source}:${target}${suffix}`, kind, source, target, label }
}

export function buildOrchestrationGraph(input: BuildOrchestrationGraphInput): OrchestrationGraph {
  const { change, definition } = input
  const workflowId = `workflow:${definition.workflow}`
  const changeId = `change:${change.name}`
  const nodes: OrchestrationNode[] = [{
    id: workflowId,
    kind: 'workflow',
    label: definition.workflow,
    status: definition.status,
    metadata: [
      { key: 'execution_model', value: change.workflowRules.executionModel },
      { key: 'frozen_fingerprint', value: short(definition.frozen_fingerprint) },
      { key: 'current_fingerprint', value: short(definition.current_fingerprint) },
    ].filter((item) => item.value !== ''),
  }, {
    id: changeId,
    kind: 'change',
    label: change.name,
    status: change.phase_status || 'pending',
    metadata: [
      { key: 'phase', value: change.phase },
      { key: 'track', value: change.track || 'unknown' },
      { key: 'preset', value: change.preset || 'unknown' },
    ],
  }]
  const edges: OrchestrationEdge[] = [edge('governs', workflowId, changeId, 'governs')]
  const phaseIds = new Set<string>()

  change.workflowRules.steps.forEach((step, index) => {
    const id = `phase:${step}`
    phaseIds.add(id)
    const projected = change.todo?.stages.find((stage) => stage.id === step)?.status
    const status = projected ?? (step === change.phase ? 'current' : 'pending')
    nodes.push({
      id,
      kind: 'phase',
      label: change.workflowRules.labelByStep[step] || step,
      status,
      metadata: [
        { key: 'phase_id', value: step },
        { key: 'order', value: String(index + 1) },
        { key: 'gate', value: change.workflowRules.gateByStep[step] ?? 'none' },
      ],
    })
    edges.push(edge('contains', changeId, id, 'contains phase'))
  })

  for (const [from, transitions] of Object.entries(change.workflowRules.transitions)) {
    const source = `phase:${from}`
    if (!phaseIds.has(source)) continue
    for (const transition of transitions) {
      const target = `phase:${transition.to}`
      if (phaseIds.has(target)) {
        edges.push(edge('transitions', source, target, transition.event, transition.event))
      }
    }
  }

  for (const stage of change.todo?.stages ?? []) {
    const phaseId = `phase:${stage.id}`
    if (!phaseIds.has(phaseId)) continue
    stage.tasks.forEach((task, index) => {
      const id = `task:${stage.id}:${index}`
      nodes.push({
        id,
        kind: 'task',
        label: task.text,
        status: task.completed ? 'done' : 'pending',
        metadata: [{ key: 'phase', value: stage.id }],
      })
      edges.push(edge('contains', phaseId, id, 'contains task'))
    })
  }

  for (const item of change.documents?.items ?? []) {
    const id = `document:${item.kind}`
    nodes.push({
      id,
      kind: 'document',
      label: item.kind,
      status: item.status,
      metadata: [
        { key: 'required_read', value: String(item.requiredRead) },
        { key: 'producer_count', value: String(item.producers.length) },
      ],
    })
    const producer = change.workflowRules.steps.find((step) =>
      (change.workflowRules.outputsByStep[step] ?? []).includes(item.kind))
    const source = producer === undefined ? changeId : `phase:${producer}`
    edges.push(edge('produces', source, id, 'produces document'))
  }

  const reviewFields = [
    'pre_verify_review_result',
    'agent_review_result',
    'codex_review_result',
  ] as const
  for (const field of reviewFields) {
    const status = valueOf(change, field)
    if (status === '') continue
    const id = `review:${field}`
    nodes.push({
      id,
      kind: 'review',
      label: field,
      status,
      metadata: [{ key: 'field', value: field }],
    })
    const target = phaseIds.has('phase:verify') ? 'phase:verify' : changeId
    edges.push(edge('reviews', id, target, 'reviews'))
  }

  if (change.terminalActivity !== undefined) {
    const id = 'session:active'
    nodes.push({
      id,
      kind: 'session',
      label: `Session ${change.terminalActivity.sessionId.slice(0, 8)}`,
      status: 'active',
      metadata: [
        { key: 'heartbeat_at', value: canonicalTimestamp(change.terminalActivity.heartbeatAt) },
        { key: 'expires_at', value: canonicalTimestamp(change.terminalActivity.expiresAt) },
      ],
    })
    edges.push(edge('executes', id, changeId, 'executes'))
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id))
  edges.sort((a, b) => a.id.localeCompare(b.id))
  return {
    schema: 'tenon-orchestration-graph/v1',
    scope: { root: input.root, change: change.name },
    coverage: {
      implemented: ['workflow', 'change', 'phase', 'task', 'document', 'review', 'active-session'],
      deferred: [
        'agent',
        'historical-session-turn',
        'acceptance-criteria',
        'task-dependencies',
        'write-orchestration',
        'live-refresh',
      ],
    },
    nodes,
    edges,
  }
}
