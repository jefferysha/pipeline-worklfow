export type TaskScheduleBlockerCode =
  | 'TASK_PLAN_NOT_FROZEN'
  | 'WORK_ITEM_DUPLICATE'
  | 'DEPENDENCY_UNKNOWN'
  | 'DEPENDENCY_CYCLE'
  | 'RESOURCE_CLAIM_AMBIGUOUS'

export interface TaskScheduleBlocker {
  readonly code: TaskScheduleBlockerCode
  readonly work_item_ids: readonly string[]
  readonly detail: string
  readonly remediation: 'FREEZE_VALID_PLAN' | 'FIX_PLAN_IDENTITIES' | 'FIX_DEPENDENCIES'
}

export interface TaskScheduleWave {
  readonly index: number
  readonly work_item_ids: readonly string[]
  readonly parallelism: number
}

export interface TaskScheduleCompilation {
  readonly valid: boolean
  readonly waves: readonly TaskScheduleWave[]
  readonly blockers: readonly TaskScheduleBlocker[]
  readonly serialized_resource_conflicts: readonly {
    readonly resource: string
    readonly before_work_item_id: string
    readonly after_work_item_id: string
  }[]
}
