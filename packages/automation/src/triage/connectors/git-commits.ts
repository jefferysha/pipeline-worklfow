import { createHash } from 'node:crypto'
import type {
  Observation,
  ObservationPage,
  SourceCheckpoint,
} from '@pipeline-lite/kernel'
import { nodeExec, type ExecResult } from '../../runner/exec.js'
import {
  CursorStaleError,
  GitCommandError,
  type GitCommitBody,
  type GitCommitsAction,
  type GitCommitsConnector,
  type GitCommitsConnectorOptions,
  type GitCommitsCursor,
  type GitCommitsSourceConfig,
} from './git-commits-types.js'

export {
  CursorStaleError,
  GitCommandError,
  type GitCommitBody,
  type GitCommitsAction,
  type GitCommitsConnector,
  type GitCommitsConnectorOptions,
  type GitCommitsCursor,
  type GitCommitsSourceConfig,
} from './git-commits-types.js'

interface HostSource {
  readonly repoRoot: string
  readonly ref: string
  readonly pathspec: readonly string[]
}

const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const SAFE_SOURCE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

const sha256 = (canonical: readonly unknown[]): string =>
  createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')

const cursorDigest = (
  sourceId: string,
  cursor: Omit<GitCommitsCursor, 'pageDigest'>,
): string => sha256([
  2,
  'git-commits-cursor',
  sourceId,
  cursor.baseSha,
  cursor.snapshotTipSha,
  cursor.consumed,
  cursor.lastCommitSha,
])

const withoutOneTrailingLf = (value: string): string =>
  value.endsWith('\n') ? value.slice(0, -1) : value

const canonicalShaFrom = (stdout: string, context: string): string => {
  const sha = withoutOneTrailingLf(stdout)
  if (!SHA_RE.test(sha)) {
    throw new Error(`${context}: expected one canonical Git object id, got ${JSON.stringify(stdout)}`)
  }
  return sha
}

const assertPositiveLimit = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

const snapshotSources = (
  sources: Readonly<Record<string, GitCommitsSourceConfig>>,
): ReadonlyMap<string, HostSource> => {
  const snapshot = new Map<string, HostSource>()
  for (const [sourceId, source] of Object.entries(sources)) {
    if (!SAFE_SOURCE_ID_RE.test(sourceId)) {
      throw new TypeError(`sourceId '${sourceId}' must be an opaque safe id`)
    }
    if (source.repoRoot === '' || source.repoRoot.includes('\0')) {
      throw new TypeError(`source '${sourceId}' repoRoot must be a non-empty NUL-free path`)
    }
    if (source.ref === '' || source.ref.includes('\0')) {
      throw new TypeError(`source '${sourceId}' ref must be a non-empty NUL-free revision`)
    }
    const pathspec = Object.freeze([...(source.pathspec ?? [])])
    if (pathspec.some((value) => value.includes('\0'))) {
      throw new TypeError(`source '${sourceId}' pathspec must not contain NUL`)
    }
    snapshot.set(sourceId, Object.freeze({
      repoRoot: source.repoRoot,
      ref: source.ref,
      pathspec,
    }))
  }
  return snapshot
}

const bodyFor = (observation: GitCommitBody): string => JSON.stringify(observation)

const staleCursor = (
  sourceId: string,
  currentRefSha: string,
  lastCommitSha: string,
  reason: string,
): never => {
  throw new CursorStaleError(sourceId, lastCommitSha, currentRefSha, reason)
}

const cursorFrom = (
  checkpoint: SourceCheckpoint | null,
  sourceId: string,
  currentRefSha: string,
): GitCommitsCursor | null => {
  if (checkpoint === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(checkpoint.cursor)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return staleCursor(sourceId, currentRefSha, '<invalid>', `checkpoint cursor is not JSON: ${reason}`)
  }
  const candidate = parsed as Partial<GitCommitsCursor> | null
  const claimedSha = typeof candidate?.lastCommitSha === 'string'
    ? candidate.lastCommitSha
    : '<invalid>'
  if (
    checkpoint.schemaVersion !== 1
    || checkpoint.sourceId !== sourceId
    || checkpoint.actionKind !== 'git-commits'
  ) {
    return staleCursor(sourceId, currentRefSha, claimedSha, 'checkpoint is not bound to this source and action')
  }
  const keys = typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
    ? Object.keys(candidate)
    : []
  if (
    typeof candidate !== 'object'
    || candidate === null
    || Array.isArray(candidate)
    || keys.length !== 6
    || !keys.includes('schemaVersion')
    || !keys.includes('baseSha')
    || !keys.includes('snapshotTipSha')
    || !keys.includes('consumed')
    || !keys.includes('lastCommitSha')
    || !keys.includes('pageDigest')
    || candidate.schemaVersion !== 2
    || !(candidate.baseSha === null || (typeof candidate.baseSha === 'string' && SHA_RE.test(candidate.baseSha)))
    || typeof candidate.snapshotTipSha !== 'string'
    || !SHA_RE.test(candidate.snapshotTipSha)
    || !Number.isSafeInteger(candidate.consumed)
    || (candidate.consumed ?? -1) < 0
    || typeof candidate.lastCommitSha !== 'string'
    || !SHA_RE.test(candidate.lastCommitSha)
    || typeof candidate.pageDigest !== 'string'
    || !/^[0-9a-f]{64}$/.test(candidate.pageDigest)
  ) {
    return staleCursor(sourceId, currentRefSha, claimedSha, 'checkpoint cursor has an invalid shape')
  }
  const cursor = candidate as GitCommitsCursor
  const expectedDigest = cursorDigest(sourceId, {
    schemaVersion: 2,
    baseSha: cursor.baseSha,
    snapshotTipSha: cursor.snapshotTipSha,
    consumed: cursor.consumed,
    lastCommitSha: cursor.lastCommitSha,
  })
  if (cursor.pageDigest !== expectedDigest) {
    return staleCursor(sourceId, currentRefSha, claimedSha, 'checkpoint cursor digest mismatch')
  }
  return cursor
}

/** Build a connector whose repository roots, refs, and pathspecs are fixed by the host. */
export function createGitCommitsConnector(
  options: GitCommitsConnectorOptions,
): GitCommitsConnector {
  const exec = options.exec ?? nodeExec
  const maxItems = options.maxItems ?? 100
  assertPositiveLimit(maxItems, 'maxItems')
  const sources = snapshotSources(options.sources)

  const executeGit = async (
    source: HostSource,
    args: string[],
    signal: AbortSignal,
  ): Promise<ExecResult> => {
    signal.throwIfAborted()
    const result = await exec('git', args, {
      cwd: source.repoRoot,
      env: { LC_ALL: 'C', LANG: 'C' },
    })
    signal.throwIfAborted()
    return result
  }

  const runGit = async (
    source: HostSource,
    args: string[],
    signal: AbortSignal,
  ): Promise<ExecResult> => {
    const result = await executeGit(source, args, signal)
    if (result.exitCode !== 0) {
      throw new GitCommandError(args, result.exitCode, result.stderr)
    }
    return result
  }

  const readObservation = async (
    sourceId: string,
    source: HostSource,
    sha: string,
    signal: AbortSignal,
  ): Promise<Observation> => {
    const metadata = await runGit(source, [
      'show',
      '--no-patch',
      '--format=%H%x00%P%x00%cI%x00%s',
      '--end-of-options',
      sha,
    ], signal)
    const fields = withoutOneTrailingLf(metadata.stdout).split('\0')
    if (fields.length !== 4) {
      throw new Error(`git show ${sha}: malformed metadata record`)
    }
    const [reportedSha, parentText, gitOccurredAt, subject] = fields as [string, string, string, string]
    if (reportedSha !== sha) {
      throw new Error(`git show ${sha}: returned mismatched canonical sha ${JSON.stringify(reportedSha)}`)
    }
    const occurredAtDate = new Date(gitOccurredAt)
    if (Number.isNaN(occurredAtDate.valueOf())) {
      throw new Error(`git show ${sha}: returned invalid commit timestamp ${JSON.stringify(gitOccurredAt)}`)
    }
    const occurredAt = occurredAtDate.toISOString()
    const parents = parentText === '' ? [] : parentText.split(' ')

    const changed = await runGit(source, [
      'diff-tree',
      '--root',
      '-m',
      '--no-commit-id',
      '--name-only',
      '-r',
      '-z',
      sha,
      '--',
      ...source.pathspec,
    ], signal)
    const changedPaths = [...new Set(changed.stdout.split('\0').filter((path) => path !== ''))]
    const sourceKey = sha
    const observationId = `git-commit:${sha256([1, 'git-commits', sourceId, sourceKey])}`
    const body = bodyFor({ sourceKey, sha, parents, occurredAt, subject, changedPaths })

    return Object.freeze({
      schemaVersion: 1,
      observationId,
      sourceId,
      actionKind: 'git-commits',
      observedAt: occurredAt,
      title: subject.trim() === '' ? `Commit ${sha.slice(0, 12)}` : subject,
      body,
    })
  }

  return {
    kind: 'git-commits',
    async observe(request): Promise<ObservationPage> {
      const sourceId = request.action.sourceId
      const limit = request.limit
      if (request.action.schemaVersion !== 1 || request.action.kind !== 'git-commits') {
        throw new TypeError('git-commits connector received an incompatible action')
      }
      assertPositiveLimit(limit, 'limit')
      const source = sources.get(sourceId)
      if (source === undefined) {
        throw new Error(`unknown git-commits sourceId '${sourceId}'`)
      }

      const resolved = await runGit(source, [
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${source.ref}^{commit}`,
      ], request.signal)
      const tipSha = canonicalShaFrom(resolved.stdout, `git rev-parse ${source.ref}`)
      const previousCursor = cursorFrom(request.checkpoint, sourceId, tipSha)

      const assertCanonicalCommit = async (sha: string): Promise<void> => {
        const args = ['rev-parse', '--verify', '--end-of-options', `${sha}^{commit}`]
        const resolution = await executeGit(source, args, request.signal)
        if (resolution.exitCode !== 0) {
          throw new CursorStaleError(
            sourceId,
            previousCursor?.lastCommitSha ?? sha,
            tipSha,
            resolution.stderr || `checkpoint object cannot be resolved (exit ${resolution.exitCode})`,
          )
        }
        const canonical = canonicalShaFrom(resolution.stdout, `git rev-parse ${sha}`)
        if (canonical !== sha) {
          throw new CursorStaleError(
            sourceId,
            previousCursor?.lastCommitSha ?? sha,
            tipSha,
            `checkpoint object is not canonical (resolved ${canonical})`,
          )
        }
      }
      const assertAncestor = async (ancestorSha: string, descendantSha: string): Promise<void> => {
        const args = ['merge-base', '--is-ancestor', ancestorSha, descendantSha]
        const result = await executeGit(source, args, request.signal)
        if (result.exitCode === 1) {
          throw new CursorStaleError(
            sourceId,
            previousCursor?.lastCommitSha ?? ancestorSha,
            tipSha,
            `checkpoint snapshot ${ancestorSha} is not an ancestor of ${descendantSha} (the ref may have been force-pushed)`,
          )
        }
        if (result.exitCode !== 0) throw new GitCommandError(args, result.exitCode, result.stderr)
      }

      let baseSha: string | null
      let snapshotTipSha: string
      let consumed: number
      if (previousCursor === null) {
        baseSha = null
        snapshotTipSha = tipSha
        consumed = 0
      } else {
        for (const sha of new Set([
          previousCursor.snapshotTipSha,
          previousCursor.lastCommitSha,
          ...(previousCursor.baseSha === null ? [] : [previousCursor.baseSha]),
        ])) await assertCanonicalCommit(sha)
        await assertAncestor(previousCursor.snapshotTipSha, tipSha)
        if (previousCursor.baseSha !== null && previousCursor.baseSha !== previousCursor.snapshotTipSha) {
          await assertAncestor(previousCursor.baseSha, previousCursor.snapshotTipSha)
        }
        const completed = previousCursor.consumed === 0
          && previousCursor.baseSha === previousCursor.snapshotTipSha
          && previousCursor.lastCommitSha === previousCursor.snapshotTipSha
        if (completed) {
          baseSha = previousCursor.snapshotTipSha
          snapshotTipSha = tipSha
          consumed = 0
        } else {
          baseSha = previousCursor.baseSha
          snapshotTipSha = previousCursor.snapshotTipSha
          consumed = previousCursor.consumed
        }
      }

      const revisionArgs = baseSha === null
        ? [snapshotTipSha]
        // A..B is the stable set newly reachable from frozen snapshot B but not from base A.
        // The offset below, not a moving single-SHA cursor, records pagination through a merge DAG.
        : [`${baseSha}..${snapshotTipSha}`]
      const listed = await runGit(source, [
        'rev-list',
        '--topo-order',
        '--reverse',
        // Path-limited history simplification may hide a merge that introduced the watched
        // branch. A checkpoint would then advance past that merge forever, so retain full DAG.
        '--full-history',
        ...revisionArgs,
        '--',
        ...source.pathspec,
      ], request.signal)
      const allShas = listed.stdout
        .split('\n')
        .filter((sha) => sha !== '')
        .map((sha) => canonicalShaFrom(`${sha}\n`, 'git rev-list'))
      if (consumed > allShas.length) {
        throw new CursorStaleError(
          sourceId,
          previousCursor?.lastCommitSha ?? snapshotTipSha,
          tipSha,
          `checkpoint consumed offset ${consumed} exceeds frozen snapshot length ${allShas.length}`,
        )
      }
      if (previousCursor !== null && consumed > 0 && allShas[consumed - 1] !== previousCursor.lastCommitSha) {
        throw new CursorStaleError(
          sourceId,
          previousCursor.lastCommitSha,
          tipSha,
          'checkpoint last commit does not match the frozen snapshot offset',
        )
      }
      const pageLimit = Math.min(limit, maxItems)
      const pageShas = allShas.slice(consumed, consumed + pageLimit)
      const observations: Observation[] = []
      for (const sha of pageShas) {
        observations.push(await readObservation(
          sourceId,
          source,
          sha,
          request.signal,
        ))
      }

      const nextConsumed = consumed + pageShas.length
      const snapshotHasMore = nextConsumed < allShas.length
      const hasMore = snapshotHasMore || snapshotTipSha !== tipSha
      const cursorWithoutDigest: Omit<GitCommitsCursor, 'pageDigest'> = snapshotHasMore
        ? {
            schemaVersion: 2,
            baseSha,
            snapshotTipSha,
            consumed: nextConsumed,
            lastCommitSha: pageShas.at(-1) ?? previousCursor?.lastCommitSha ?? snapshotTipSha,
          }
        : {
            schemaVersion: 2,
            baseSha: snapshotTipSha,
            snapshotTipSha,
            consumed: 0,
            lastCommitSha: snapshotTipSha,
          }
      const cursor: GitCommitsCursor = {
        ...cursorWithoutDigest,
        pageDigest: cursorDigest(sourceId, cursorWithoutDigest),
      }
      const nextCheckpoint = Object.freeze({
        schemaVersion: 1,
        sourceId,
        actionKind: 'git-commits',
        cursor: JSON.stringify(cursor),
      } as const)

      return Object.freeze({
        schemaVersion: 1,
        action: Object.freeze({
          schemaVersion: 1,
          kind: 'git-commits',
          sourceId,
        }),
        observations: Object.freeze(observations),
        nextCheckpoint,
        hasMore,
      })
    },
  }
}
