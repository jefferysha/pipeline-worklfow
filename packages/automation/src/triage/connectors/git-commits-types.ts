import type {
  ObservationPage,
  ObserveAction,
  SourceCheckpoint,
} from '@pipeline-lite/kernel'
import type { ExecFn } from '../../runner/exec.js'
import type { SourceConnector } from '../source.js'

export type GitCommitsAction = Extract<ObserveAction, { readonly kind: 'git-commits' }>

export interface GitCommitsSourceConfig {
  readonly repoRoot: string
  readonly ref: string
  readonly pathspec?: readonly string[]
}

export interface GitCommitsConnectorOptions {
  readonly sources: Readonly<Record<string, GitCommitsSourceConfig>>
  readonly maxItems?: number
  readonly exec?: ExecFn
}

export interface GitCommitBody {
  readonly sourceKey: string
  readonly sha: string
  readonly parents: readonly string[]
  readonly occurredAt: string
  readonly subject: string
  readonly changedPaths: readonly string[]
}

export interface GitCommitsCursor {
  readonly schemaVersion: 2
  readonly baseSha: string | null
  readonly snapshotTipSha: string
  readonly consumed: number
  readonly lastCommitSha: string
  readonly pageDigest: string
}

export type GitCommitsConnector = SourceConnector<
  GitCommitsAction,
  SourceCheckpoint,
  ObservationPage
>

export class GitCommandError extends Error {
  readonly name = 'GitCommandError'

  constructor(
    readonly args: readonly string[],
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(
      `git ${args.join(' ')} failed with exit code ${exitCode}: ` +
        `${stderr === '' ? '(no stderr)' : stderr}`,
    )
  }
}

export class CursorStaleError extends Error {
  readonly _tag = 'CursorStaleError'
  readonly name = 'CursorStaleError'
  readonly code = 'CURSOR_STALE' as const
  readonly observations = Object.freeze([]) as readonly []

  constructor(
    readonly sourceId: string,
    readonly lastCommitSha: string,
    readonly currentRefSha: string,
    readonly reason: string,
  ) {
    super(
      `git-commits cursor '${lastCommitSha}' is stale for source '${sourceId}' ` +
        `(current ref ${currentRefSha}): ${reason}`,
    )
  }
}
