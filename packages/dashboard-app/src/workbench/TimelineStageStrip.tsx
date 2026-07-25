import { useState } from 'react'
import { GripVertical, Plus } from 'lucide-react'
import type { BoardLane } from './OrchestrationBoard'

export function TimelineStageStrip({
  workflowName,
  lanes,
  selectedId,
  readonly,
  onSelect,
  onAddStage,
  onStageReorder,
}: {
  workflowName: string
  lanes: BoardLane[]
  selectedId: string
  readonly: boolean
  onSelect: (id: string) => void
  onAddStage?: () => void
  onStageReorder?: (fromId: string, toId: string, after: boolean) => void
}): JSX.Element {
  const [draggingStage, setDraggingStage] = useState<string | null>(null)
  return (
    <section aria-label={`${workflowName} 阶段`} className="overflow-x-auto rounded-2xl border border-border bg-card px-3 py-3 shadow-sm">
      <div data-testid="wb-stages" className="flex min-w-max items-center">
        {lanes.map((lane, index) => {
          const isSelected = lane.id === selectedId
          return (
            <div
              key={lane.id}
              className="relative flex flex-none items-center"
              data-testid={`wb-step-${lane.id}`}
              data-state={isSelected ? 'current' : 'idle'}
              aria-current={isSelected ? 'step' : undefined}
              onClick={() => onSelect(lane.id)}
              draggable={!readonly && Boolean(onStageReorder)}
              onDragStart={(event) => {
                if (!onStageReorder) return
                setDraggingStage(lane.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', lane.id)
              }}
              onDragOver={(event) => {
                if (draggingStage && draggingStage !== lane.id) event.preventDefault()
              }}
              onDrop={(event) => {
                if (!draggingStage || draggingStage === lane.id || !onStageReorder) return
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                onStageReorder(draggingStage, lane.id, event.clientX > rect.left + rect.width / 2)
                setDraggingStage(null)
              }}
              onDragEnd={() => setDraggingStage(null)}
            >
              <button
                type="button"
                aria-current={isSelected ? 'step' : undefined}
                aria-label={`选择阶段 ${lane.name}`}
                aria-pressed={isSelected}
                className="group relative z-10 flex min-h-12 w-max min-w-[112px] items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-[background-color,box-shadow,transform] duration-200 hover:bg-fill active:scale-[.98] aria-[current=step]:bg-accent-t aria-[current=step]:shadow-[inset_0_0_0_1px_var(--accent)] motion-reduce:transition-none"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(lane.id)
                }}
              >
                {!readonly && onStageReorder && <GripVertical data-testid={`wb-lane-grip-${lane.id}`} className="h-4 w-4 flex-none cursor-grab text-text-3" aria-hidden="true" />}
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full border border-border-2 bg-card font-mono text-xs font-semibold text-text-3 group-aria-[current=step]:border-(--accent) group-aria-[current=step]:bg-(--accent) group-aria-[current=step]:text-white">{index + 1}</span>
                <span className="whitespace-nowrap text-sm font-semibold text-text group-aria-[current=step]:text-accent-d">{lane.name}</span>
                {lane.running && <span className="size-1.5 flex-none animate-pulse rounded-full bg-green motion-reduce:animate-none" data-testid={`wb-flow-gloss-${lane.id}`} aria-hidden="true" />}
              </button>
              {index < lanes.length - 1 && (
                <div className="relative flex h-12 w-9 flex-none items-center justify-center" aria-hidden="true">
                  <span className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 ${isSelected || lanes[index + 1]?.id === selectedId ? 'bg-(--accent)' : 'bg-border-2'}`} />
                </div>
              )}
            </div>
          )
        })}
        {!readonly && onAddStage && (
          <div className="relative min-w-0 px-1">
            <button type="button" aria-label="+ 添加阶段" data-testid="wb-add-stage-open" className="relative z-10 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-2 bg-card px-3 text-sm font-semibold text-accent-d hover:border-(--accent) hover:bg-accent-t/30" onClick={onAddStage}>
              <Plus className="h-4 w-4" aria-hidden="true" /> 添加阶段
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
