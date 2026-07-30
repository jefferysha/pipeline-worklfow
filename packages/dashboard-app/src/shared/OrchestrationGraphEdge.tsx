import type { OrchestrationEdge } from '../api/orchestrationGraphClient'
import { edgeLabel, type Translate } from './orchestrationGraphPresentation'

interface OrchestrationGraphEdgeProps {
  readonly edge: OrchestrationEdge
  readonly source: { readonly x: number; readonly y: number }
  readonly target: { readonly x: number; readonly y: number }
  readonly transitionLane: number
  readonly showLabel: boolean
  readonly t: Translate
}

export function transitionLanes(
  edges: readonly OrchestrationEdge[],
): ReadonlyMap<string, number> {
  const groups = new Map<string, OrchestrationEdge[]>()
  for (const edge of edges) {
    if (edge.kind !== 'transitions') continue
    const endpoints = edge.source === edge.target
      ? [edge.source, edge.target]
      : [edge.source, edge.target].sort()
    const key = `${endpoints[0]}\u0000${endpoints[1]}`
    groups.set(key, [...(groups.get(key) ?? []), edge])
  }
  const lanes = new Map<string, number>()
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id))
    const selfLoop = sorted[0]?.source === sorted[0]?.target
    sorted.forEach((edge, index) => {
      lanes.set(edge.id, selfLoop ? index : index - (sorted.length - 1) / 2)
    })
  }
  return lanes
}

export function OrchestrationGraphEdge({
  edge,
  source,
  target,
  transitionLane,
  showLabel,
  t,
}: OrchestrationGraphEdgeProps): JSX.Element {
  const selfTransition = edge.source === edge.target
  const transition = edge.kind === 'transitions'
  const sourceX = source.x + 138
  const sourceY = source.y + 23
  const targetX = target.x
  const targetY = target.y + 23
  const transitionMidX = (sourceX + targetX) / 2 + transitionLane * 36
  const transitionMidY = (sourceY + targetY) / 2 + transitionLane * 18
  const selfLoopReach = 28 + transitionLane * 18
  const selfLoopOffset = transitionLane * 12
  return (
    <g data-edge-id={edge.id}>
      {selfTransition ? (
        <path
          d={`M ${source.x + 138} ${source.y + 13 + selfLoopOffset} C ${source.x + 138 + selfLoopReach} ${source.y + 10 + selfLoopOffset}, ${source.x + 138 + selfLoopReach} ${source.y + 50 + selfLoopOffset}, ${source.x + 138} ${source.y + 40 + selfLoopOffset}`}
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="1.75"
          markerEnd="url(#orchestration-arrowhead)"
          data-self-loop="true"
        />
      ) : transition ? (
        <path
          d={`M ${sourceX} ${sourceY} C ${transitionMidX} ${sourceY}, ${transitionMidX} ${targetY}, ${targetX} ${targetY}`}
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="1.75"
          markerEnd="url(#orchestration-arrowhead)"
          data-transition-route="true"
          data-transition-lane={transitionLane}
        />
      ) : (
        <line
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
          stroke="var(--text-3)"
          strokeWidth="1.75"
          markerEnd="url(#orchestration-arrowhead)"
        />
      )}
      {edge.kind === 'transitions' && showLabel && (
        <text
          x={selfTransition ? source.x + 138 + selfLoopReach : transitionMidX}
          y={selfTransition ? source.y + 7 + selfLoopOffset : transitionMidY - 4}
          fill="var(--text-2)"
          fontSize="9"
          paintOrder="stroke"
          stroke="var(--card)"
          strokeWidth="3"
          textAnchor={selfTransition ? 'end' : 'middle'}
        >
          {edgeLabel(edge, t)}
        </text>
      )}
    </g>
  )
}
