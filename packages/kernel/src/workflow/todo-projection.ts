/**
 * Pipeline Todo projection.
 *
 * OpenSpec `tasks.md` remains the editable source of truth. This module only projects its checkbox
 * rows onto the workflow's ordered stages, so a native Todo or dashboard can keep the seven pipeline
 * phases visible without inventing generic work items. It is intentionally pure and accepts custom
 * workflow stage definitions as data.
 */
import { DEFAULT_WORKFLOW_STEPS } from './default-workflow.generated.js'

export type PipelineTodoStageStatus = 'done' | 'current' | 'pending'

export interface PipelineTodoStageDefinition {
  readonly id: string
  readonly label: string
}

export interface PipelineTodoItem {
  readonly text: string
  readonly completed: boolean
}

export interface PipelineTodoStage extends PipelineTodoStageDefinition {
  readonly status: PipelineTodoStageStatus
  readonly tasks: readonly PipelineTodoItem[]
}

export interface PipelineTodoProjection {
  /** false means tasks.md was absent/unreadable; the phase skeleton is still truthful. */
  readonly hasTaskSource: boolean
  readonly stages: readonly PipelineTodoStage[]
}

export const DEFAULT_WORKFLOW_TODO_STAGES: readonly PipelineTodoStageDefinition[] = DEFAULT_WORKFLOW_STEPS.map(
  (step) => ({ id: step.id, label: step.label }),
)

function normalized(value: string): string {
  return value
    .trim()
    .replace(/^\d+\s*[.)、:：-]\s*/, '')
    .replace(/^phase\s+/i, '')
    .toLocaleLowerCase()
}

function stageForHeading(heading: string, stages: readonly PipelineTodoStageDefinition[]): string | undefined {
  const candidate = normalized(heading)
  for (const stage of stages) {
    const id = normalized(stage.id)
    const label = normalized(stage.label)
    if (candidate === id || candidate === label) return stage.id
    if (candidate.startsWith(`${id} `) || candidate.endsWith(` ${id}`)) return stage.id
    if (candidate.startsWith(`${label} `) || candidate.endsWith(` ${label}`)) return stage.id
  }
  return undefined
}

function parseTasks(
  markdown: string | undefined,
  currentStage: string,
  stages: readonly PipelineTodoStageDefinition[],
): ReadonlyMap<string, readonly PipelineTodoItem[]> {
  const byStage = new Map<string, PipelineTodoItem[]>()
  if (markdown === undefined) return byStage
  let target = stages.some((stage) => stage.id === currentStage) ? currentStage : stages[0]?.id
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      target = stageForHeading(heading[1] ?? '', stages) ?? target
      continue
    }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line)
    if (!task || target === undefined) continue
    const text = (task[2] ?? '').trim()
    if (text === '') continue
    const items = byStage.get(target) ?? []
    items.push({ text, completed: (task[1] ?? '').toLowerCase() === 'x' })
    byStage.set(target, items)
  }
  return byStage
}

/**
 * Project a tasks.md text onto ordered workflow stages. Checklist rows below an unrecognised heading
 * stay on the current phase rather than disappearing; recognised `## Open`/`## 立项` style headings
 * select their matching stage. Earlier phases are complete because the state machine reached a later
 * phase, not because every historical checkbox happened to be manually toggled.
 */
export function projectPipelineTodo(input: {
  readonly phase: string
  readonly tasksMarkdown: string | undefined
  readonly stages?: readonly PipelineTodoStageDefinition[]
}): PipelineTodoProjection {
  const declared = input.stages ?? DEFAULT_WORKFLOW_TODO_STAGES
  const stages = declared.filter((stage, index) =>
    stage.id !== '' && stage.label !== '' && declared.findIndex((other) => other.id === stage.id) === index,
  )
  const currentIndex = stages.findIndex((stage) => stage.id === input.phase)
  const tasks = parseTasks(input.tasksMarkdown, input.phase, stages)
  return {
    hasTaskSource: input.tasksMarkdown !== undefined,
    stages: stages.map((stage, index) => ({
      ...stage,
      status: currentIndex === -1 ? 'pending' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending',
      tasks: tasks.get(stage.id) ?? [],
    })),
  }
}
