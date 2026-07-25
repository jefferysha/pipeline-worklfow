export class SyncError extends Error {
  override readonly name = 'SyncError'
  readonly _tag = 'SyncError'
  readonly preservedWorktreePath: string
  readonly baseAdvanced: boolean

  constructor(
    message: string,
    preservedWorktreePath: string,
    opts?: { baseAdvanced?: boolean },
  ) {
    super(message)
    this.preservedWorktreePath = preservedWorktreePath
    this.baseAdvanced = opts?.baseAdvanced === true
  }
}

export interface MergeBackReceipt {
  readonly landed: true
  readonly hostSynced: boolean
  readonly mergedCommit: string
  readonly baseBefore: string
  readonly branchTip: string
  readonly hostSyncError?: string
  readonly landedJournalError?: string
}

export interface MergeIntentDraft {
  readonly baseRef: string
  readonly baseBefore: string
  readonly branchRef: string
  readonly branchTip: string
  readonly mergedCommit: string
}

export class MergeJournalError extends Error {
  override readonly name = 'MergeJournalError'
  readonly _tag = 'MergeJournalError'
  readonly landed = false
}

export function safeMergeJournalMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Continue to the stable string fallback.
  }
  try {
    return String(error)
  } catch {
    return 'unknown merge journal error'
  }
}
