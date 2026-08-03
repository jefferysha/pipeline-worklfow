import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronRight, RefreshCw, Search, X } from 'lucide-react'
import {
  fetchOrchestrationGraph,
  OrchestrationGraphApiError,
  ORCHESTRATION_NODE_KINDS,
  type OrchestrationGraph,
  type OrchestrationNode,
  type OrchestrationNodeKind,
} from '../api/orchestrationGraphClient'
import { ApiError } from '../api/transport'
import { useT } from '../i18n'
import {
  compareNodes,
  deferredLabel,
  edgeLabel,
  graphLayout,
  metadataLabel,
  metadataValue,
  nodeLabel,
  statusLabel,
  toneByKind,
  toggledKinds,
  usesBuiltinPhaseLabels,
} from './orchestrationGraphPresentation'
import { OrchestrationGraphEdge, transitionLanes } from './OrchestrationGraphEdge'
import { OrchestrationGraphAccessibleList } from './OrchestrationGraphAccessibleList'

interface OrchestrationGraphCardProps { readonly root: string; readonly change: string }

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly graph: OrchestrationGraph }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error' }

const MAX_CANVAS_NODES = 21
const CORE_NODE_KINDS = new Set<OrchestrationNodeKind>(['workflow', 'change', 'phase'])

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
        const oldServer404 = error instanceof ApiError
          && error.status === 404
          && (!(error instanceof OrchestrationGraphApiError) || error.code === undefined)
        setState(oldServer404
          ? { kind: 'unavailable' }
          : { kind: 'error' })
      })
    return () => controller.abort()
  }, [attempt, change, root])

  const graph = state.kind === 'ready' ? state.graph : null
  const localizeBuiltinPhaseIds = usesBuiltinPhaseLabels(graph)
  const renderNodeLabel = (node: OrchestrationNode): string =>
    nodeLabel(node, t, localizeBuiltinPhaseIds)
  const visibleNodes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return (graph?.nodes ?? [])
      .filter((node) => kinds.size === 0 || kinds.has(node.kind))
      .filter((node) => needle === '' || renderNodeLabel(node).toLocaleLowerCase().includes(needle))
      .sort(compareNodes)
  }, [graph, kinds, localizeBuiltinPhaseIds, query, t])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => (graph?.edges ?? []).filter((edge) =>
      visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [graph, visibleIds],
  )
  const canvasNodes = useMemo(() => {
    if (visibleNodes.length <= MAX_CANVAS_NODES) return visibleNodes
    const core = visibleNodes.filter((node) => CORE_NODE_KINDS.has(node.kind)).slice(0, MAX_CANVAS_NODES)
    const resources = visibleNodes.filter((node) => !CORE_NODE_KINDS.has(node.kind))
    return [...core, ...resources.slice(0, MAX_CANVAS_NODES - core.length)]
  }, [visibleNodes])
  const canvasIds = useMemo(() => new Set(canvasNodes.map((node) => node.id)), [canvasNodes])
  const canvasEdges = useMemo(
    () => visibleEdges.filter((edge) => canvasIds.has(edge.source) && canvasIds.has(edge.target)),
    [canvasIds, visibleEdges],
  )
  const transitionLaneById = useMemo(() => transitionLanes(canvasEdges), [canvasEdges])
  const selected = visibleIds.has(selectedId ?? '')
    ? graph?.nodes.find((node) => node.id === selectedId) ?? null
    : null
  const selectedEdges = selected === null ? [] : (graph?.edges ?? [])
    .filter((edge) => edge.source === selected.id || edge.target === selected.id)
  const layout = useMemo(() => graphLayout(canvasNodes), [canvasNodes])
  const nodeById = useMemo(
    () => new Map((graph?.nodes ?? []).map((node) => [node.id, node])),
    [graph],
  )
  const edgeKinds = [...new Set(canvasEdges.map((edge) => edge.kind))]
  const displayMetadataValue = (key: string, value: string): string => {
    if (key === 'phase' || key === 'phase_id') {
      const phase = nodeById.get(`phase:${value}`)
      if (phase !== undefined) return renderNodeLabel(phase)
    }
    return metadataValue(key, value, t)
  }
  function toggleKind(kind: OrchestrationNodeKind): void {
    setKinds((current) => toggledKinds(current, kind))
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
    const current = canvasNodes.findIndex((item) => item.id === node.id)
    let target = current
    if (event.key === 'ArrowRight') target = Math.min(canvasNodes.length - 1, current + 1)
    else if (event.key === 'ArrowLeft') target = Math.max(0, current - 1)
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = canvasNodes.length - 1
    else return
    event.preventDefault()
    nodeRefs.current.get(canvasNodes[target]?.id ?? '')?.focus()
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
        <p className="m-0 rounded-lg border border-border bg-fill px-3 py-2.5 text-xs text-text-3" role="status">
          {t('detail.orchestration_graph.unavailable')}
        </p>
      )}
      {state.kind === 'error' && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-b bg-red-t px-3 py-2.5" role="alert">
          <span className="text-xs text-red-d">{t('detail.orchestration_graph.error')}</span>
          <button
            type="button"
            className="rounded-md border border-red-b bg-card px-2.5 py-1 text-xs font-semibold text-red-d outline-none hover:bg-red-t focus-visible:ring-2 focus-visible:ring-(--accent)"
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
              className={`rounded-full border px-2 py-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-(--accent) ${
                kinds.size === 0
                  ? 'border-blue-b bg-blue-t text-blue-d'
                  : 'border-border bg-card text-text-3 hover:bg-fill'
              }`}
              onClick={() => setKinds(new Set())}
            >
              <span aria-hidden="true">{kinds.size === 0 ? '✓ ' : ''}</span>
              {t('detail.orchestration_graph.kind_all')}
            </button>
            {ORCHESTRATION_NODE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={kinds.size === 0 || kinds.has(kind)}
                className={`rounded-full border px-2 py-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-(--accent) ${
                  kinds.size === 0 || kinds.has(kind)
                    ? 'border-blue-b bg-blue-t text-blue-d'
                    : 'border-border bg-card text-text-3 hover:bg-fill'
                }`}
                onClick={() => toggleKind(kind)}
              >
                <span aria-hidden="true">{kinds.size === 0 || kinds.has(kind) ? '✓ ' : ''}</span>
                {t(`detail.orchestration_graph.kind_${kind}`)}
              </button>
            ))}
            <label className="ml-auto flex min-w-[190px] flex-1 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 focus-within:ring-2 focus-within:ring-(--accent)">
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
            <p className="m-0 rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-text-3" role="status">
              {t('detail.orchestration_graph.empty')}
            </p>
          ) : visibleNodes.length === 0 ? (
            <p className="m-0 rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-text-3" role="status">
              {t('detail.orchestration_graph.filtered_empty')}
            </p>
          ) : (
            <>
              <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-text-2" aria-label={t('detail.orchestration_graph.edge_legend')}>
                {edgeKinds.map((kind) => (
                  <span key={kind}><span aria-hidden="true">—›</span> {t(`detail.orchestration_graph.edge_${kind}`)}</span>
                ))}
              </div>
              {canvasNodes.length < visibleNodes.length && (
                <p className="mb-2 rounded-lg border border-blue-b bg-blue-t px-3 py-2 text-[11px] leading-relaxed text-blue-d" data-testid="orchestration-canvas-limited">
                  {t('detail.orchestration_graph.canvas_limited', { shown: canvasNodes.length, total: visibleNodes.length })}
                </p>
              )}
              <div className="max-h-[520px] overflow-auto rounded-xl border border-border bg-fill/30" aria-label={t('detail.orchestration_graph.canvas')} data-testid="orchestration-canvas">
              <div className="relative" style={{ height: layout.height, minWidth: layout.width }}>
                <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
                  <defs>
                    <marker id="orchestration-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-3)" />
                    </marker>
                  </defs>
                  {canvasEdges.map((edge) => {
                    const source = layout.positions.get(edge.source)
                    const target = layout.positions.get(edge.target)
                    if (source === undefined || target === undefined) return null
                    return (
                      <OrchestrationGraphEdge
                        key={edge.id}
                        edge={edge}
                        source={source}
                        target={target}
                        transitionLane={transitionLaneById.get(edge.id) ?? 0}
                        showLabel={selectedId !== null
                          && (edge.source === selectedId || edge.target === selectedId)}
                        t={t}
                      />
                    )
                  })}
                </svg>
                {canvasNodes.map((node) => {
                  const position = layout.positions.get(node.id)
                  if (position === undefined) return null
                  const label = renderNodeLabel(node)
                  return (
                    <button
                      key={node.id}
                      ref={(element) => {
                        if (element === null) nodeRefs.current.delete(node.id)
                        else nodeRefs.current.set(node.id, element)
                      }}
                      type="button"
                      aria-pressed={selectedId === node.id}
                      aria-label={`${label} · ${t(`detail.orchestration_graph.kind_${node.kind}`)}${node.status === null ? '' : ` · ${statusLabel(node.status, t)}`}`}
                      className={`absolute w-[140px] rounded-lg border px-2.5 py-2 text-left outline-none transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-card aria-pressed:border-(--accent) aria-pressed:ring-2 aria-pressed:ring-(--accent) aria-pressed:ring-offset-2 aria-pressed:ring-offset-card motion-reduce:transition-none ${toneByKind[node.kind]}`}
                      style={{ left: position.x, top: position.y }}
                      onClick={() => setSelectedId(node.id)}
                      onKeyDown={(event) => onNodeKeyDown(event, node)}
                    >
                      {selectedId === node.id && <span className="absolute top-1 right-1 text-accent-d" aria-hidden="true">✓</span>}
                      <span className="block truncate pr-3 text-[11.5px] font-semibold text-text">{label}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-text-3">
                        {t(`detail.orchestration_graph.kind_${node.kind}`)}
                        {node.status === null ? '' : ` · ${statusLabel(node.status, t)}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            </>
          )}

          {selected !== null && (
            <div className="mt-2.5 rounded-lg border border-blue-b bg-blue-t px-3 py-2.5" data-testid="orchestration-selection">
              <div className="flex items-baseline justify-between gap-3">
                <strong className="text-xs text-text">{renderNodeLabel(selected)}</strong>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-blue-d">{t(`detail.orchestration_graph.kind_${selected.kind}`)}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-text-3 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-(--accent)"
                    aria-label={t('detail.orchestration_graph.clear_selection')}
                    onClick={() => setSelectedId(null)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {selected.status !== null && <p className="mt-1 mb-0 text-xs text-text-2">{statusLabel(selected.status, t)}</p>}
              {selected.metadata.length > 0 && (
                <dl className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                  {selected.metadata.map((item) => (
                    <div key={item.key} className="contents">
                      <dt className="text-text-3">{metadataLabel(item.key, t)}</dt>
                      <dd className="m-0 truncate text-text-2">{displayMetadataValue(item.key, item.value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {selectedEdges.length > 0 && (
                <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                  {(['incoming', 'outgoing'] as const).map((direction) => {
                    const edges = selectedEdges.filter((edge) =>
                      direction === 'incoming' ? edge.target === selected.id : edge.source === selected.id)
                    return (
                      <div key={direction}>
                        <h4 className="m-0 font-semibold text-text-3">{t(`detail.orchestration_graph.${direction}`)}</h4>
                        {edges.length === 0 ? (
                          <p className="mt-1 mb-0 text-text-3">{t('detail.orchestration_graph.no_edges')}</p>
                        ) : (
                          <ul className="mt-1 mb-0 space-y-1 pl-4 text-text-2">
                            {edges.map((edge) => {
                              const peer = nodeById.get(direction === 'incoming' ? edge.source : edge.target)
                              return <li key={edge.id}>{edgeLabel(edge, t)} · {peer === undefined ? '?' : renderNodeLabel(peer)}</li>
                            })}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <details className="group mt-2.5 rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-text-2 outline-none focus-visible:ring-2 focus-visible:ring-(--accent) [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              {t('detail.orchestration_graph.accessible_list')}
            </summary>
            <OrchestrationGraphAccessibleList
              nodes={visibleNodes}
              visibleEdges={visibleEdges}
              adjacencyEdges={graph.edges}
              allNodes={nodeById}
              localizeBuiltinPhaseIds={localizeBuiltinPhaseIds}
              displayMetadataValue={displayMetadataValue}
              t={t}
            />
          </details>

          {graph.coverage.deferred.length > 0 && (
            <p className="mt-2 mb-0 text-[11px] leading-[1.5] text-text-3">
              {t('detail.orchestration_graph.deferred', {
                items: graph.coverage.deferred.map((item) => deferredLabel(item, t)).join(' · '),
              })}
            </p>
          )}
        </>
      )}
    </section>
  )
}
