import type { BoardSnapshotV2, OrchestrationAggregateV2 } from './v2-types.js'

/** Read-only projection boundary; no second state machine is created here. */
export function projectBoardSnapshotV2(aggregate: OrchestrationAggregateV2): BoardSnapshotV2 {
  return aggregate
}

export interface BoardProgressProjectionV2 {
  readonly status: BoardSnapshotV2['status']
  readonly revision: number
  readonly completed_items: number
  readonly total_items: number
  readonly blockers: readonly string[]
  readonly next_actions: readonly string[]
}
export function projectProgressV2(snapshot: BoardSnapshotV2): BoardProgressProjectionV2 {
  return { status: snapshot.status, revision: snapshot.revision, completed_items: snapshot.work_items.filter((item) => item.status === 'completed').length, total_items: snapshot.work_items.length, blockers: snapshot.blockers, next_actions: snapshot.next_actions }
}
