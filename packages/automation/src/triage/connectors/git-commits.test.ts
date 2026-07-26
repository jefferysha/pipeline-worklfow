import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validateObservationPage, type Observation, type SourceCheckpoint } from '@tenon/kernel'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExecFn } from '../../runner/exec.js'
import { nodeExec } from '../../runner/exec.js'
import {
  createGitCommitsConnector,
  CursorStaleError,
  GitCommandError,
} from './git-commits.js'

const SOURCE_ID = 'repo-main'
const REF = 'refs/heads/main'

interface CommitOptions {
  readonly subject: string
  readonly occurredAt: string
  readonly files: Readonly<Record<string, string>>
}

interface GitCommitBody {
  readonly sourceKey: string
  readonly sha: string
  readonly parents: readonly string[]
  readonly occurredAt: string
  readonly subject: string
  readonly changedPaths: readonly string[]
}

interface GitCommitsCursor {
  readonly schemaVersion: 2
  readonly baseSha: string | null
  readonly snapshotTipSha: string
  readonly consumed: number
  readonly lastCommitSha: string
  readonly pageDigest: string
}

const sha256 = (canonical: readonly unknown[]): string =>
  createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')

const bodyOf = (observation: Observation): GitCommitBody =>
  JSON.parse(observation.body) as GitCommitBody

const cursorOf = (checkpoint: SourceCheckpoint): GitCommitsCursor =>
  JSON.parse(checkpoint.cursor) as GitCommitsCursor

const shaOf = (observation: Observation): string => bodyOf(observation).sha

describe('git-commits source connector', () => {
  let repoRoot: string

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'pipeline-git-commits-'))
    await git(['init', '--initial-branch=main'])
    await git(['config', 'user.name', 'Pipeline Test'])
    await git(['config', 'user.email', 'pipeline-test@example.invalid'])
  })

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
  })

  const git = async (
    args: string[],
    options: { readonly env?: Record<string, string> } = {},
  ): Promise<string> => {
    const result = await nodeExec('git', args, { cwd: repoRoot, env: options.env })
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(' ')} failed (${result.exitCode}): ${result.stderr}`)
    }
    return result.stdout
  }

  const commit = async ({ subject, occurredAt, files }: CommitOptions): Promise<string> => {
    for (const [relativePath, contents] of Object.entries(files)) {
      await mkdir(dirname(join(repoRoot, relativePath)), { recursive: true })
      await writeFile(join(repoRoot, relativePath), contents)
    }
    await git(['add', '--', ...Object.keys(files)])
    await git(['commit', '-m', subject], {
      env: { GIT_AUTHOR_DATE: occurredAt, GIT_COMMITTER_DATE: occurredAt },
    })
    return (await git(['rev-parse', 'HEAD'])).trim()
  }

  const connector = (
    source: { readonly ref?: string; readonly pathspec?: readonly string[] } = {},
    exec: ExecFn = nodeExec,
    maxItems = 100,
  ) => createGitCommitsConnector({
    exec,
    maxItems,
    sources: {
      [SOURCE_ID]: { repoRoot, ref: REF, ...source },
    },
  })

  const observe = (
    sourceConnector = connector(),
    checkpoint: Parameters<typeof sourceConnector.observe>[0]['checkpoint'] = null,
    limit = 100,
  ) => sourceConnector.observe({
    action: { schemaVersion: 1, kind: 'git-commits', sourceId: SOURCE_ID },
    checkpoint,
    limit,
    signal: new AbortController().signal,
  })

  it('reads canonical commit facts in stable oldest-first order without interpreting a special subject', async () => {
    const firstSha = await commit({
      subject: 'root: seed',
      occurredAt: '2026-07-19T01:02:03+08:00',
      files: { 'src/first file.txt': 'first\n' },
    })
    const specialSubject = 'fix: keep %x00 | "quotes" ; $(touch SHOULD_NOT_EXIST) `echo nope`'
    const secondSha = await commit({
      subject: specialSubject,
      occurredAt: '2026-07-19T02:03:04+08:00',
      files: {
        'src/first file.txt': 'second\n',
        'src/second.txt': 'added\n',
      },
    })

    const page = await observe()

    expect(validateObservationPage(page)).toMatchObject({ ok: true })
    expect(page.observations.map((item) => ({
      observationId: item.observationId,
      ...bodyOf(item),
    }))).toEqual([
      {
        observationId: `git-commit:${sha256([1, 'git-commits', SOURCE_ID, firstSha])}`,
        sourceKey: firstSha,
        sha: firstSha,
        parents: [],
        occurredAt: '2026-07-18T17:02:03.000Z',
        subject: 'root: seed',
        changedPaths: ['src/first file.txt'],
      },
      {
        observationId: `git-commit:${sha256([1, 'git-commits', SOURCE_ID, secondSha])}`,
        sourceKey: secondSha,
        sha: secondSha,
        parents: [firstSha],
        occurredAt: '2026-07-18T18:03:04.000Z',
        subject: specialSubject,
        changedPaths: ['src/first file.txt', 'src/second.txt'],
      },
    ])
    expect(cursorOf(page.nextCheckpoint)).toMatchObject({
      schemaVersion: 2,
      lastCommitSha: secondSha,
      pageDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('paginates to the smaller limit and resumes strictly after the completed page checkpoint', async () => {
    const shas: string[] = []
    for (let index = 0; index < 4; index += 1) {
      shas.push(await commit({
        subject: `commit ${index + 1}`,
        occurredAt: `2026-07-19T0${index + 1}:00:00Z`,
        files: { 'history.txt': `${index + 1}\n` },
      }))
    }
    const sourceConnector = connector({}, nodeExec, 2)

    const first = await observe(sourceConnector, null, 99)
    expect(first.observations.map(shaOf)).toEqual(shas.slice(0, 2))
    expect(first.hasMore).toBe(true)
    expect(cursorOf(first.nextCheckpoint)).toMatchObject({
      lastCommitSha: shas[1],
    })

    const second = await observe(sourceConnector, first.nextCheckpoint, 99)
    expect(second.observations.map(shaOf)).toEqual(shas.slice(2))
    expect(second.hasMore).toBe(false)
    expect(cursorOf(second.nextCheckpoint)).toMatchObject({
      lastCommitSha: shas[3],
    })

    const fifthSha = await commit({
      subject: 'commit 5',
      occurredAt: '2026-07-19T05:00:00Z',
      files: { 'history.txt': '5\n' },
    })
    const resumed = await observe(sourceConnector, second.nextCheckpoint, 99)
    expect(resumed.observations.map(shaOf)).toEqual([fifthSha])
    expect(cursorOf(resumed.nextCheckpoint).lastCommitSha).toBe(fifthSha)
  })

  it('checkpoint 后合并一条从 checkpoint 之前分叉的支线 → 支线提交与 merge commit 都不会永久漏掉', async () => {
    await commit({
      subject: 'shared root',
      occurredAt: '2026-07-19T01:00:00Z',
      files: { 'shared.txt': 'root\n' },
    })
    await git(['branch', 'feature'])
    const checkpointSha = await commit({
      subject: 'main checkpoint',
      occurredAt: '2026-07-19T02:00:00Z',
      files: { 'main.txt': 'main\n' },
    })
    const sourceConnector = connector()
    const checkpointPage = await observe(sourceConnector)
    expect(cursorOf(checkpointPage.nextCheckpoint).lastCommitSha).toBe(checkpointSha)

    await git(['switch', 'feature'])
    const branchSha = await commit({
      subject: 'branch work predating checkpoint ancestry',
      occurredAt: '2026-07-19T03:00:00Z',
      files: { 'feature.txt': 'feature\n' },
    })
    await git(['switch', 'main'])
    await git(['merge', '--no-ff', 'feature', '-m', 'merge feature'], {
      env: {
        GIT_AUTHOR_DATE: '2026-07-19T04:00:00Z',
        GIT_COMMITTER_DATE: '2026-07-19T04:00:00Z',
      },
    })
    const mergeSha = (await git(['rev-parse', 'HEAD'])).trim()

    const oneAtATime = connector({}, nodeExec, 1)
    const resumed = await observe(oneAtATime, checkpointPage.nextCheckpoint)
    expect(resumed.observations.map(shaOf)).toEqual([branchSha])
    expect(resumed.hasMore).toBe(true)

    const finalPage = await observe(oneAtATime, resumed.nextCheckpoint)
    expect(finalPage.observations.map(shaOf)).toEqual([mergeSha])
    expect(finalPage.hasMore).toBe(false)

    const exhausted = await observe(oneAtATime, finalPage.nextCheckpoint)
    expect(exhausted.observations).toEqual([])
    expect(exhausted.hasMore).toBe(false)
  })

  it('pathspec 续跑使用完整历史：旧分叉修改目标路径后 merge，支线与 merge commit 都可见', async () => {
    await commit({
      subject: 'path root',
      occurredAt: '2026-07-19T01:00:00Z',
      files: { 'watched.txt': 'root\n' },
    })
    await git(['branch', 'feature-path'])
    const checkpointSha = await commit({
      subject: 'main advances outside pathspec',
      occurredAt: '2026-07-19T02:00:00Z',
      files: { 'outside.txt': 'main\n' },
    })
    const sourceConnector = connector({ pathspec: ['watched.txt'] })
    const checkpointPage = await observe(sourceConnector)
    expect(cursorOf(checkpointPage.nextCheckpoint).lastCommitSha).toBe(checkpointSha)

    await git(['switch', 'feature-path'])
    const branchSha = await commit({
      subject: 'feature changes watched path',
      occurredAt: '2026-07-19T03:00:00Z',
      files: { 'watched.txt': 'feature\n' },
    })
    await git(['switch', 'main'])
    await git(['merge', '--no-ff', 'feature-path', '-m', 'merge watched feature'], {
      env: {
        GIT_AUTHOR_DATE: '2026-07-19T04:00:00Z',
        GIT_COMMITTER_DATE: '2026-07-19T04:00:00Z',
      },
    })
    const mergeSha = (await git(['rev-parse', 'HEAD'])).trim()

    const resumed = await observe(sourceConnector, checkpointPage.nextCheckpoint)

    expect(resumed.observations.map(shaOf)).toEqual([branchSha, mergeSha])
    expect(resumed.observations.map((item) => bodyOf(item).changedPaths)).toEqual([
      ['watched.txt'],
      ['watched.txt'],
    ])
  })

  it('rejects a force-pushed non-ancestor checkpoint with a typed stale error and zero observations', async () => {
    await commit({
      subject: 'old root',
      occurredAt: '2026-07-19T01:00:00Z',
      files: { 'tracked.txt': 'old\n' },
    })
    const sourceConnector = connector()
    const beforeRewrite = await observe(sourceConnector)
    const staleSha = cursorOf(beforeRewrite.nextCheckpoint).lastCommitSha

    const treeSha = (await git(['write-tree'])).trim()
    const rewrittenSha = (await git(['commit-tree', treeSha, '-m', 'rewritten root'], {
      env: {
        GIT_AUTHOR_DATE: '2026-07-19T02:00:00Z',
        GIT_COMMITTER_DATE: '2026-07-19T02:00:00Z',
      },
    })).trim()
    await git(['update-ref', REF, rewrittenSha, staleSha])

    let thrown: unknown
    try {
      await observe(sourceConnector, beforeRewrite.nextCheckpoint)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(CursorStaleError)
    expect(thrown).toMatchObject({
      code: 'CURSOR_STALE',
      sourceId: SOURCE_ID,
      lastCommitSha: staleSha,
      currentRefSha: rewrittenSha,
      observations: [],
    })
  })

  it('keeps cwd host-owned and passes an option-shaped pathspec only after Git --', async () => {
    await commit({
      subject: 'outside only',
      occurredAt: '2026-07-19T01:00:00Z',
      files: { 'outside.txt': 'outside\n' },
    })
    const matchingSha = await commit({
      subject: 'literal option-shaped path',
      occurredAt: '2026-07-19T02:00:00Z',
      files: { '--all': 'literal path\n' },
    })
    await commit({
      subject: 'outside again',
      occurredAt: '2026-07-19T03:00:00Z',
      files: { 'outside.txt': 'changed outside\n' },
    })

    const calls: Array<{ file: string; args: readonly string[]; cwd: string | undefined }> = []
    const recordingExec: ExecFn = async (file, args, options) => {
      calls.push({ file, args: [...args], cwd: options?.cwd })
      return nodeExec(file, args, options)
    }
    const sourceConnector = connector({ pathspec: ['--all'] }, recordingExec)
    const actionWithInjectedCwd = {
      schemaVersion: 1,
      kind: 'git-commits',
      sourceId: SOURCE_ID,
      cwd: join(repoRoot, 'attacker-controlled'),
    } as const
    const page = await sourceConnector.observe({
      action: actionWithInjectedCwd,
      checkpoint: null,
      limit: 100,
      signal: new AbortController().signal,
    })

    expect(validateObservationPage(page)).toMatchObject({ ok: true })
    expect(page.observations.map((observation) => {
      const { sha, changedPaths } = bodyOf(observation)
      return { sha, changedPaths }
    })).toEqual([
      { sha: matchingSha, changedPaths: ['--all'] },
    ])
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(({ file, cwd }) => file === 'git' && cwd === repoRoot)).toBe(true)
    for (const { args } of calls.filter(({ args }) => args.includes('--all'))) {
      expect(args.indexOf('--all')).toBeGreaterThan(args.indexOf('--'))
    }
  })

  it('fails loudly for an unknown ref without swallowing Git stderr', async () => {
    const sourceConnector = connector({ ref: 'refs/heads/does-not-exist' })

    let thrown: unknown
    try {
      await observe(sourceConnector)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(GitCommandError)
    const commandError = thrown as GitCommandError
    expect(commandError.exitCode).not.toBe(0)
    expect(commandError.stderr.length).toBeGreaterThan(0)
    expect(commandError.message).toContain(commandError.stderr)
    expect(commandError.args).toEqual([
      'rev-parse',
      '--verify',
      '--end-of-options',
      'refs/heads/does-not-exist^{commit}',
    ])
  })

  it('does not issue a partial page checkpoint when commit materialization fails', async () => {
    await commit({
      subject: 'first succeeds',
      occurredAt: '2026-07-19T01:00:00Z',
      files: { 'first.txt': 'first\n' },
    })
    const failingSha = await commit({
      subject: 'second fails to materialize',
      occurredAt: '2026-07-19T02:00:00Z',
      files: { 'second.txt': 'second\n' },
    })
    const failingExec: ExecFn = async (file, args, options) => {
      if (file === 'git' && args[0] === 'show' && args.at(-1) === failingSha) {
        return { stdout: '', stderr: 'fatal: injected metadata failure\n', exitCode: 23 }
      }
      return nodeExec(file, args, options)
    }

    const observed = observe(connector({}, failingExec))
    await expect(observed).rejects.toMatchObject({
      name: 'GitCommandError',
      exitCode: 23,
      stderr: 'fatal: injected metadata failure\n',
    })

    const completeRetry = await observe(connector())
    expect(completeRetry.observations.map(shaOf)).toHaveLength(2)
    expect(cursorOf(completeRetry.nextCheckpoint).lastCommitSha).toBe(failingSha)
  })
})
