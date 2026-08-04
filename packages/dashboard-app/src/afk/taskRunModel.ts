import type { TaskRunDto, TaskRunOperation } from '../api/taskRunClient'

export interface TaskRunPresentation {
  readonly state: TaskRunDto['state']
  readonly itemById: ReadonlyMap<string, TaskRunDto['items'][number]>
  readonly orderedWaves: readonly TaskRunDto['waves'][number][]
  readonly operations: ReadonlyArray<{ operation: TaskRunOperation; itemTitle?: string }>
}

export function taskRunPresentation(run: TaskRunDto): TaskRunPresentation {
  const itemById = new Map(run.items.map((item) => [item.work_item_id, item]))
  return {
    state: run.state,
    itemById,
    orderedWaves: [...run.waves].sort((left, right) => left.index - right.index),
    operations: run.allowed_operations.map((operation) => ({
      operation,
      ...(operation.work_item_id === undefined
        ? {}
        : { itemTitle: itemById.get(operation.work_item_id)?.title ?? operation.work_item_id }),
    })),
  }
}
