import type { InteractionEventDraft, InteractionEventV1 } from './contract.js'

export type InteractionEventRecordDraft = Omit<InteractionEventDraft, 'sequence' | 'previousEventHash'>

/** Typed application seam.  The implementation is supplied by the state/fs adapter. */
export interface InteractionEventRecorder {
  /** Caller must already hold the canonical Change lock; the adapter never re-enters it. */
  readonly recordUnderLock: (changeDir: string, draft: InteractionEventRecordDraft) => Promise<InteractionEventV1>
}
