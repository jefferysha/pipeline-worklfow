import { ApiError, isRecord, readJson, wrapNetwork } from './transport'

export const ORCHESTRATION_NODE_KINDS = [
  'workflow', 'change', 'phase', 'task', 'document', 'review', 'session',
] as const
export const ORCHESTRATION_EDGE_KINDS = [
  'governs', 'contains', 'transitions', 'produces', 'reviews', 'executes',
] as const

export type OrchestrationNodeKind = (typeof ORCHESTRATION_NODE_KINDS)[number]
export type OrchestrationEdgeKind = (typeof ORCHESTRATION_EDGE_KINDS)[number]

export interface OrchestrationNode {
  readonly id: string
  readonly kind: OrchestrationNodeKind
  readonly label: string
  readonly status: string | null
  readonly metadata: readonly { readonly key: string; readonly value: string }[]
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

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length
    && actual.every((key, index) => key === [...keys].sort()[index])
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '')
}

function nodeKind(value: unknown): value is OrchestrationNodeKind {
  return typeof value === 'string'
    && ORCHESTRATION_NODE_KINDS.some((candidate) => candidate === value)
}

function edgeKind(value: unknown): value is OrchestrationEdgeKind {
  return typeof value === 'string'
    && ORCHESTRATION_EDGE_KINDS.some((candidate) => candidate === value)
}

export function decodeOrchestrationGraph(value: unknown): OrchestrationGraph | null {
  if (!isRecord(value)
    || !exactKeys(value, ['schema', 'scope', 'coverage', 'nodes', 'edges'])
    || value.schema !== 'tenon-orchestration-graph/v1'
    || !isRecord(value.scope)
    || !exactKeys(value.scope, ['root', 'change'])
    || typeof value.scope.root !== 'string'
    || typeof value.scope.change !== 'string'
    || value.scope.change === ''
    || !isRecord(value.coverage)
    || !exactKeys(value.coverage, ['implemented', 'deferred'])
    || !stringArray(value.coverage.implemented)
    || !stringArray(value.coverage.deferred)
    || !Array.isArray(value.nodes)
    || !Array.isArray(value.edges)
  ) return null

  const nodes: OrchestrationNode[] = []
  const ids = new Set<string>()
  for (const raw of value.nodes) {
    if (!isRecord(raw)
      || !exactKeys(raw, ['id', 'kind', 'label', 'status', 'metadata'])
      || typeof raw.id !== 'string'
      || raw.id === ''
      || ids.has(raw.id)
      || !nodeKind(raw.kind)
      || typeof raw.label !== 'string'
      || raw.label === ''
      || !(raw.status === null || typeof raw.status === 'string')
      || !Array.isArray(raw.metadata)
    ) return null
    const metadata: Array<{ key: string; value: string }> = []
    for (const item of raw.metadata) {
      if (!isRecord(item)
        || !exactKeys(item, ['key', 'value'])
        || typeof item.key !== 'string'
        || item.key === ''
        || typeof item.value !== 'string'
      ) return null
      metadata.push({ key: item.key, value: item.value })
    }
    ids.add(raw.id)
    nodes.push({
      id: raw.id,
      kind: raw.kind,
      label: raw.label,
      status: raw.status,
      metadata,
    })
  }

  const edges: OrchestrationEdge[] = []
  const edgeIds = new Set<string>()
  for (const raw of value.edges) {
    if (!isRecord(raw)
      || !exactKeys(raw, ['id', 'kind', 'source', 'target', 'label'])
      || typeof raw.id !== 'string'
      || raw.id === ''
      || edgeIds.has(raw.id)
      || !edgeKind(raw.kind)
      || typeof raw.source !== 'string'
      || !ids.has(raw.source)
      || typeof raw.target !== 'string'
      || !ids.has(raw.target)
      || typeof raw.label !== 'string'
      || raw.label === ''
    ) return null
    edgeIds.add(raw.id)
    edges.push({
      id: raw.id,
      kind: raw.kind,
      source: raw.source,
      target: raw.target,
      label: raw.label,
    })
  }

  return {
    schema: value.schema,
    scope: { root: value.scope.root, change: value.scope.change },
    coverage: {
      implemented: value.coverage.implemented,
      deferred: value.coverage.deferred,
    },
    nodes,
    edges,
  }
}

export async function fetchOrchestrationGraph(
  root: string,
  change: string,
  signal?: AbortSignal,
): Promise<OrchestrationGraph> {
  const params = new URLSearchParams({ root, change })
  let response: Response
  try {
    response = await fetch(`/api/orchestration-graph?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) throw new ApiError(`编排图获取失败（${response.status}）`, response.status)
  const decoded = decodeOrchestrationGraph(await readJson(response))
  if (decoded === null) throw new ApiError('编排图响应形状无效', response.status)
  if (decoded.scope.root !== root || decoded.scope.change !== change) {
    throw new ApiError('编排图响应 scope 与请求不一致', response.status)
  }
  return decoded
}
