import type { BoardSnapshotV1 } from './types.js'
import type { BoardSnapshotV2, OrchestrationAggregateV2 } from './v2-types.js'
import { createAggregateV2 } from './v2-evolve.js'

export interface V2CompatibilityView { readonly status: 'available' | 'degraded' | 'unsupported'; readonly snapshot?: BoardSnapshotV2; readonly blockers: readonly string[]; readonly source_schema: string }

/** Explicit legacy adapter. It never invents v2 identities, leases or evidence. */
export function projectBoardSnapshotV1ToV2(input: BoardSnapshotV1): V2CompatibilityView {
  const blockers: string[] = ['legacy-v1-source-no-v2-causal-chain']
  const aggregate: OrchestrationAggregateV2 = createAggregateV2(input.request.project_id, input.change_id, input.request.request_id, input.updated_at)
  const snapshot: BoardSnapshotV2 = { ...aggregate, revision: input.revision, status: input.status, blockers: [...blockers, ...(input.status === 'blocked' ? ['legacy-blocked-state'] : [])], next_actions: [], updated_at: input.updated_at }
  return { status: 'degraded', snapshot, blockers: snapshot.blockers, source_schema: input.schema_version }
}

export function unavailableV2Compatibility(sourceSchema: string, reason: string): V2CompatibilityView { return { status: 'unsupported', blockers: [reason], source_schema: sourceSchema } }
