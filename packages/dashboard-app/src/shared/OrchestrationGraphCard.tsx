import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronRight, RefreshCw, Search, X } from 'lucide-react'
import {
  fetchOrchestrationGraph,
  ORCHESTRATION_NODE_KINDS,
  type OrchestrationGraph,
  type OrchestrationNode,
  type OrchestrationNodeKind,
} from '../api/orchestrationGraphClient'
import { ApiError } from '../api/transport'
import { useT } from '../i18n'

interface OrchestrationGraphCardProps {
  readonly root: string
  readonly change: string
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly graph: OrchestrationGraph }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error' }

const layerByKind: Record<OrchestrationNodeKind, number> = {
  workflow: 0,
  change: 1,
  phase: 2,
  task: 3,
  document: 3,
  review: 3,
  session: 3,
}

const toneByKind: Record<OrchestrationNodeKind, string> = {
  workflow: 'border-blue-b bg-blue-t',
  change: 'border-green-b bg-green-t',
  phase: 'border-border-2 bg-card',
  task: 'border-green-b bg-green-t',
  document: 'border-amb-b bg-amb-t',
  review: 'border-red-b bg-red-t',
  session: 'border-blue-b bg-blue-t',
}

function compareNodes(a: OrchestrationNode, b: OrchestrationNode): number {
  const layer = layerByKind[a.kind] - layerByKind[b.kind]
  if (layer !== 0) return layer
  if (a.kind === 'phase' && b.kind === 'phase') {
    const aOrder = Number(a.metadata.find((item) => item.key === 'order')?.value ?? Number.MAX_SAFE_INTEGER)
    const bOrder = Number(b.metadata.find((item) => item.key === 'order')?.value ?? Number.MAX_SAFE_INTEGER)
    if (aOrder !== bOrder) return aOrder - bOrder
  }
  return a.id.localeCompare(b.id)
}

function layout(nodes: readonly OrchestrationNode[]): {
  readonly positions: Map<string, { x: number; y: number }>
  readonly height: number
  readonly width: number
} {
  const columns = new Map<number, OrchestrationNode[]>()
  for (const node of nodes) {
    const layer = layerByKind[node.kind]
    columns.set(layer, [...(columns.get(layer) ?? []), node])
  }
  const positions = new Map<string, { x: number; y: number }>()
  let maxRows = 1
  for (const [column, items] of columns) {
    const sorted = [...items].sort(compareNodes)
    const spread = column === 3 ? Math.min(3, sorted.length) : 1
    maxRows = Math.max(maxRows, Math.ceil(sorted.length / spread))
    sorted.forEach((node, index) => positions.set(node.id, {
      x: 12 + (column + (column === 3 ? index % spread : 0)) * 168,
      y: 14 + Math.floor(index / spread) * 72,
    }))
  }
  const resourceCount = columns.get(3)?.length ?? 0
  const width = resourceCount === 0 ? 680 : 680 + (Math.min(3, resourceCount) - 1) * 168
  return { positions, height: Math.max(94, 28 + maxRows * 72), width }
}

export function OrchestrationGraphCard({ root, change }: OrchestrationGraphCardProps): JSX.Element {
  const { t } = useT()
  const requestId = useRef(0)
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>())
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [query, setQuery] = useState('')
  const [kinds, setKinds] = useState<Set<OrchestrationNodeKind>>(
    new Set(['workflow', 'change', 'phase']),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const id = ++requestId.current
    const controller = new AbortController()
    setState({ kind: 'loading' })
    setSelectedId(null)
    fetchOrchestrationGraph(root, change, controller.signal)
      .then((graph) => {
        if (requestId.current === id && !controller.signal.aborted) setState({ kind: 'ready', graph })
      })
      .catch((error: unknown) => {
        if (requestId.current !== id || controller.signal.aborted) return
        setState(error instanceof ApiError && error.status === 404
          ? { kind: 'unavailable' }
          : { kind: 'error' })
      })
    return () => controller.abort()
  }, [attempt, change, root])

  const graph = state.kind === 'ready' ? state.graph : null
  const visibleNodes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return (graph?.nodes ?? [])
      .filter((node) => kinds.size === 0 || kinds.has(node.kind))
      .filter((node) => needle === '' || node.label.toLocaleLowerCase().includes(needle))
      .sort(compareNodes)
  }, [graph, kinds, query])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const visibleEdges = (graph?.edges ?? []).filter((edge) =>
    visibleIds.has(edge.source) && visibleIds.has(edge.target))
  const selected = visibleIds.has(selectedId ?? '')
    ? graph?.nodes.find((node) => node.id === selectedId) ?? null
    : null
  const graphLayout = useMemo(() => layout(visibleNodes), [visibleNodes])

  function statusLabel(status: string | null): string {
    if (status === null) return ''
    const known = [
      'current', 'changed', 'missing', 'invalid', 'unavailable', 'done', 'pending',
      'active', 'pass', 'fail', 'in_progress',
      'recorded', 'unread', 'stale',
    ]
    return known.includes(status) ? t(`detail.orchestration_graph.status_${status}`) : status
  }

  function toggleKind(kind: OrchestrationNodeKind): void {
    setKinds((current) => {
      if (current.size === 0) return new Set([kind])
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  function onNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, node: OrchestrationNode): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setSelectedId(null)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setSelectedId(node.id)
      return
    }
    const current = visibleNodes.findIndex((item) => item.id === node.id)
    let target = current
    if (event.key === 'ArrowRight') target = Math.min(visibleNodes.length - 1, current + 1)
    else if (event.key === 'ArrowLeft') target = Math.max(0, current - 1)
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = visibleNodes.length - 1
    else return
    event.preventDefault()
    nodeRefs.current.get(visibleNodes[target]?.id ?? '')?.focus()
  }

  return (
    <section
      className="border-b border-border py-[13px] last:border-b-0"
      aria-label={t('detail.orchestration_graph.region')}
      data-testid="orchestration-graph"
      data-settled={state.kind === 'loading' ? 'false' : 'true'}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="m-0 text-[12.5px] font-bold text-text">{t('detail.orchestration_graph.heading')}</h3>
          <p className="mt-0.5 mb-0 text-[11px] text-text-3">{t('detail.orchestration_graph.read_only')}</p>
        </div>
        {graph !== null && (
          <span className="text-[11px] tabular-nums text-text-3">
            {t('detail.orchestration_graph.count', { nodes: visibleNodes.length, edges: visibleEdges.length })}
          </span>
        )}
      </div>

      {state.kind === 'loading' && (
        <div className="flex items-center gap-2 text-xs text-text-3" role="status">
          <RefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t('detail.orchestration_graph.loading')}
        </div>
      )}
      {state.kind === 'unavailable' && (
        <p className="m-0 rounded-lg border border-border bg-fill px-3 py-2.5 text-xs text-text-3">
          {t('detail.orchestration_graph.unavailable')}
        </p>
      )}
      {state.kind === 'error' && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-b bg-red-t px-3 py-2.5" role="alert">
          <span className="text-xs text-red-d">{t('detail.orchestration_graph.error')}</span>
          <button
            type="button"
            className="rounded-md border border-red-b bg-card px-2.5 py-1 text-xs font-semibold text-red-d outline-none hover:bg-red-t focus-visible:shadow-[0_0_0_3px_var(--ring-blue)]"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t('detail.orchestration_graph.retry')}
          </button>
        </div>
      )}

      {graph !== null && (
        <>
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5" aria-label={t('detail.orchestration_graph.filters')}>
            <button
              type="button"
              aria-pressed={kinds.size === 0}
              className={`rounded-full border px-2 py-1 text-[11px] font-semibold outline-none focus-visible:shadow-[0_0_0_3px_var(--ring-blue)] ${
                kinds.size === 0
                  ? 'border-blue-b bg-blue-t text-blue-d'
                  : 'border-border bg-card text-text-3 hover:bg-fill'
              }`}
              onClick={() => setKinds(new Set())}
            >
              {t('detail.orchestration_graph.kind_all')}
            </button>
            {ORCHESTRATION_NODE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={kinds.size === 0 || kinds.has(kind)}
                className={`rounded-full border px-2 py-1 text-[11px] font-semibold outline-none focus-visible:shadow-[0_0_0_3px_var(--ring-blue)] ${
                  kinds.size === 0 || kinds.has(kind)
                    ? 'border-blue-b bg-blue-t text-blue-d'
                    : 'border-border bg-card text-text-3 hover:bg-fill'
                }`}
                onClick={() => toggleKind(kind)}
              >
                {t(`detail.orchestration_graph.kind_${kind}`)}
              </button>
            ))}
            <label className="ml-auto flex min-w-[190px] flex-1 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 focus-within:shadow-[0_0_0_3px_var(--ring-blue)]">
              <Search className="size-3.5 text-text-3" aria-hidden="true" />
              <span className="sr-only">{t('detail.orchestration_graph.search_label')}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('detail.orchestration_graph.search_placeholder')}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-text outline-none placeholder:text-text-3"
              />
            </label>
          </div>

          {graph.nodes.length === 0 ? (
            <p className="m-0 rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-text-3">
              {t('detail.orchestration_graph.empty')}
            </p>
          ) : visibleNodes.length === 0 ? (
            <p className="m-0 rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-text-3">
              {t('detail.orchestration_graph.filtered_empty')}
            </p>
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-xl border border-border bg-fill/30" aria-label={t('detail.orchestration_graph.canvas')}>
              <div className="relative" style={{ height: graphLayout.height, minWidth: graphLayout.width }}>
                <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
                  {visibleEdges.map((edge) => {
                    const source = graphLayout.positions.get(edge.source)
                    const target = graphLayout.positions.get(edge.target)
                    if (source === undefined || target === undefined) return null
                    return (
                      <line
                        key={edge.id}
                        x1={source.x + 138}
                        y1={source.y + 23}
                        x2={target.x}
                        y2={target.y + 23}
                        stroke="var(--border-2)"
                        strokeWidth="1.5"
                      />
                    )
                  })}
                </svg>
                {visibleNodes.map((node) => {
                  const position = graphLayout.positions.get(node.id)
                  if (position === undefined) return null
                  return (
                    <button
                      key={node.id}
                      ref={(element) => {
                        if (element === null) nodeRefs.current.delete(node.id)
                        else nodeRefs.current.set(node.id, element)
                      }}
                      type="button"
                      aria-pressed={selectedId === node.id}
                      aria-label={`${node.label} · ${t(`detail.orchestration_graph.kind_${node.kind}`)}${node.status === null ? '' : ` · ${statusLabel(node.status)}`}`}
                      className={`absolute w-[140px] rounded-lg border px-2.5 py-2 text-left outline-none transition-shadow hover:shadow-sm focus-visible:shadow-[0_0_0_3px_var(--ring-blue)] motion-reduce:transition-none ${toneByKind[node.kind]} ${
                        selectedId === node.id ? 'shadow-[0_0_0_2px_var(--blue)]' : ''
                      }`}
                      style={{ left: position.x, top: position.y }}
                      onClick={() => setSelectedId(node.id)}
                      onKeyDown={(event) => onNodeKeyDown(event, node)}
                    >
                      <span className="block truncate text-[11.5px] font-semibold text-text">{node.label}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-text-3">
                        {t(`detail.orchestration_graph.kind_${node.kind}`)}
                        {node.status === null ? '' : ` · ${statusLabel(node.status)}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {selected !== null && (
            <div className="mt-2.5 rounded-lg border border-blue-b bg-blue-t px-3 py-2.5" data-testid="orchestration-selection">
              <div className="flex items-baseline justify-between gap-3">
                <strong className="text-xs text-text">{selected.label}</strong>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-blue-d">{t(`detail.orchestration_graph.kind_${selected.kind}`)}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-text-3 outline-none hover:bg-card focus-visible:shadow-[0_0_0_3px_var(--ring-blue)]"
                    aria-label={t('detail.orchestration_graph.clear_selection')}
                    onClick={() => setSelectedId(null)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {selected.status !== null && <p className="mt-1 mb-0 text-xs text-text-2">{statusLabel(selected.status)}</p>}
              {selected.metadata.length > 0 && (
                <dl className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                  {selected.metadata.map((item) => (
                    <div key={item.key} className="contents">
                      <dt className="text-text-3">{item.key}</dt>
                      <dd className="m-0 truncate font-mono text-text-2">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          <details className="group mt-2.5 rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-text-2 outline-none focus-visible:shadow-[0_0_0_3px_var(--ring-blue)] [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              {t('detail.orchestration_graph.accessible_list')}
            </summary>
            <div className="grid gap-3 border-t border-border px-3 py-2.5 text-xs md:grid-cols-2">
              <div>
                <h4 className="m-0 text-[11px] font-bold text-text-3">{t('detail.orchestration_graph.nodes')}</h4>
                <ul className="mt-1.5 mb-0 space-y-1 pl-4 text-text-2">
                  {visibleNodes.map((node) => (
                    <li key={node.id}>{node.label} · {t(`detail.orchestration_graph.kind_${node.kind}`)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="m-0 text-[11px] font-bold text-text-3">{t('detail.orchestration_graph.edges')}</h4>
                <ul className="mt-1.5 mb-0 space-y-1 pl-4 text-text-2">
                  {visibleEdges.map((edge) => (
                    <li key={edge.id}>{t(`detail.orchestration_graph.edge_${edge.kind}`)}: {edge.source} → {edge.target}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>

          {graph.coverage.deferred.length > 0 && (
            <p className="mt-2 mb-0 text-[11px] leading-[1.5] text-text-3">
              {t('detail.orchestration_graph.deferred', { items: graph.coverage.deferred.join(' · ') })}
            </p>
          )}
        </>
      )}
    </section>
  )
}
