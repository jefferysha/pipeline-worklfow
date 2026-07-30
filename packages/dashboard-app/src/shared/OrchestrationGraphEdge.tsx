import type { OrchestrationEdge } from '../api/orchestrationGraphClient'
import { edgeLabel, type Translate } from './orchestrationGraphPresentation'

interface OrchestrationGraphEdgeProps {
  readonly edge: OrchestrationEdge
  readonly source: { readonly x: number; readonly y: number }
  readonly target: { readonly x: number; readonly y: number }
  readonly t: Translate
}

export function OrchestrationGraphEdge({
  edge,
  source,
  target,
  t,
}: OrchestrationGraphEdgeProps): JSX.Element {
  const selfTransition = edge.source === edge.target
  return (
    <g data-edge-id={edge.id}>
      {selfTransition ? (
        <path
          d={`M ${source.x + 138} ${source.y + 13} C ${source.x + 178} ${source.y + 10}, ${source.x + 178} ${source.y + 50}, ${source.x + 138} ${source.y + 40}`}
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="1.75"
          markerEnd="url(#orchestration-arrowhead)"
          data-self-loop="true"
        />
      ) : (
        <line
          x1={source.x + 138}
          y1={source.y + 23}
          x2={target.x}
          y2={target.y + 23}
          stroke="var(--text-3)"
          strokeWidth="1.75"
          markerEnd="url(#orchestration-arrowhead)"
        />
      )}
      {edge.kind === 'transitions' && (
        <text
          x={selfTransition ? source.x + 168 : (source.x + 138 + target.x) / 2}
          y={selfTransition ? source.y + 7 : (source.y + target.y + 46) / 2 - 4}
          fill="var(--text-2)"
          fontSize="9"
          textAnchor="middle"
        >
          {edgeLabel(edge, t)}
        </text>
      )}
    </g>
  )
}
