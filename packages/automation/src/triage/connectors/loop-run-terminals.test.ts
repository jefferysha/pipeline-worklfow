import { appendFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createLoopLedgerStore,
  ledgerFilePath,
  validateObservationPage,
  type ChangeLoopBindingRecord,
  type RunRecord,
} from '@tenon/kernel'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createLoopRunTerminalsConnector,
  LoopRunTerminalsSourceError,
} from './loop-run-terminals.js'

const action = {
  schemaVersion: 1,
  kind: 'loop-run-terminals',
  sourceId: 'loop-ledger',
} as const

const runRecord = (
  suffix: string,
  result: RunRecord['result'],
  overrides: Partial<RunRecord> = {},
): RunRecord => ({
  schema_version: 1,
  record_id: `ledger-record-${suffix}`,
  recorded_at: `2026-07-19T08:0${suffix.length}:00.000Z`,
  kind: 'run',
  run_record_id: `run-${suffix}`,
  attempt_id: `attempt-${suffix}`,
  loop_id: 'loop-a',
  change: `change-${suffix}`,
  level: 'L1',
  runner: 'codex',
  admitted_at: '2026-07-19T08:00:00.000Z',
  finished_at: `2026-07-19T08:1${suffix.length}:00.000Z`,
  result,
  reason: result === 'merged' ? 'completed' : 'infrastructure-error',
  usage_record_ids: [],
  accounting: { reserved_tokens: 0, charged_tokens: 0, charge_source: 'none' },
  ...overrides,
})

let repoRoot: string

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'loop-run-terminals-'))
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

describe('loop-run-terminals source connector', () => {
  it('observes a failed terminal from the real ledger and skips a merged terminal', async () => {
    const ledger = createLoopLedgerStore()
    await ledger.append(repoRoot, runRecord('failed', 'failed'))
    await ledger.append(repoRoot, runRecord('merged', 'merged'))

    const page = await createLoopRunTerminalsConnector({ repoRoot }).observe({
      action,
      checkpoint: null,
      limit: 10,
      signal: new AbortController().signal,
    })

    expect(validateObservationPage(page)).toMatchObject({ ok: true })
    expect(page.observations).toEqual([
      expect.objectContaining({
        observationId: 'loop-run-terminal:445133a4bd68f93cce33433b71c0b59278da171ee7eb7f3db8e399e5ae5329cc',
        sourceId: 'loop-ledger',
        actionKind: 'loop-run-terminals',
        observedAt: '2026-07-19T08:16:00.000Z',
        title: 'Loop run failed: change-failed',
      }),
    ])
    expect(page.observations[0]?.body).toContain('"result":"failed"')
    expect(page.observations[0]?.body).toContain('"loopId":"loop-a"')
    expect(JSON.parse(page.observations[0]?.body ?? '{}').sourceKey).toBe('ledger-record-failed')
    expect(page.nextCheckpoint.cursor).toBe(
      '{"schemaVersion":1,"lastRunRecordId":"ledger-record-failed","pageDigest":"f502e78ec6579cb13fdad3bb33aac4aae179b0724bae748200ffee5fb3bb5cd2"}',
    )
    expect(page.hasMore).toBe(false)
  })

  it('maps failed, conflict, and retry-queued in append order while skipping other run results', async () => {
    const ledger = createLoopLedgerStore()
    await ledger.append(repoRoot, runRecord('paused', 'paused'))
    await ledger.append(repoRoot, runRecord('conflict', 'conflict'))
    await ledger.append(repoRoot, runRecord('merged', 'merged'))
    await ledger.append(repoRoot, runRecord('retry', 'retry-queued'))
    await ledger.append(repoRoot, runRecord('skipped', 'skipped'))
    await ledger.append(repoRoot, runRecord('failed', 'failed'))

    const page = await createLoopRunTerminalsConnector({ repoRoot }).observe({
      action,
      checkpoint: null,
      limit: 10,
      signal: new AbortController().signal,
    })

    expect(page.observations.map((observation) => JSON.parse(observation.body).result)).toEqual([
      'conflict',
      'retry-queued',
      'failed',
    ])
  })

  it('resumes exactly after lastRunRecordId so maxItems pages do not lose or repeat records', async () => {
    const ledger = createLoopLedgerStore()
    await ledger.append(repoRoot, runRecord('first', 'failed'))
    await ledger.append(repoRoot, runRecord('merged', 'merged'))
    await ledger.append(repoRoot, runRecord('conflict', 'conflict'))
    await ledger.append(repoRoot, runRecord('retry', 'retry-queued'))
    const connector = createLoopRunTerminalsConnector({ repoRoot })
    const signal = new AbortController().signal

    const first = await connector.observe({ action, checkpoint: null, limit: 1, signal })
    await ledger.append(repoRoot, runRecord('late', 'failed'))
    const second = await connector.observe({ action, checkpoint: first.nextCheckpoint, limit: 1, signal })
    const third = await connector.observe({ action, checkpoint: second.nextCheckpoint, limit: 1, signal })
    const fourth = await connector.observe({ action, checkpoint: third.nextCheckpoint, limit: 1, signal })

    const changes = [first, second, third, fourth].flatMap((page) =>
      page.observations.map((observation) => JSON.parse(observation.body).change),
    )
    expect(changes).toEqual(['change-first', 'change-conflict', 'change-retry', 'change-late'])
    expect([first.hasMore, second.hasMore, third.hasMore, fourth.hasMore]).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  it('caps each page at host maxItems even when the request limit is larger', async () => {
    const ledger = createLoopLedgerStore()
    await ledger.append(repoRoot, runRecord('one', 'failed'))
    await ledger.append(repoRoot, runRecord('two', 'conflict'))
    await ledger.append(repoRoot, runRecord('three', 'retry-queued'))
    const connector = createLoopRunTerminalsConnector({ repoRoot, maxItems: 2 })
    const signal = new AbortController().signal

    const first = await connector.observe({ action, checkpoint: null, limit: 99, signal })
    const second = await connector.observe({
      action,
      checkpoint: first.nextCheckpoint,
      limit: 99,
      signal,
    })

    expect(first.observations.map((item) => JSON.parse(item.body).sourceKey)).toEqual([
      'ledger-record-one',
      'ledger-record-two',
    ])
    expect(first.hasMore).toBe(true)
    expect(second.observations.map((item) => JSON.parse(item.body).sourceKey)).toEqual([
      'ledger-record-three',
    ])
    expect(second.hasMore).toBe(false)
  })

  it('fails closed with a typed error when lastRunRecordId is absent from the ledger', async () => {
    await createLoopLedgerStore().append(repoRoot, runRecord('present', 'failed'))
    const missingCheckpoint = {
      schemaVersion: 1,
      sourceId: action.sourceId,
      actionKind: action.kind,
      cursor: JSON.stringify({
        schemaVersion: 1,
        lastRunRecordId: 'ledger-record-not-present',
        pageDigest: '0'.repeat(64),
      }),
    } as const

    const observed = createLoopRunTerminalsConnector({ repoRoot }).observe({
      action,
      checkpoint: missingCheckpoint,
      limit: 10,
      signal: new AbortController().signal,
    })

    await expect(observed).rejects.toBeInstanceOf(LoopRunTerminalsSourceError)
    await expect(observed).rejects.toMatchObject({
      _tag: 'LoopRunTerminalsSourceError',
      reason: 'checkpoint-not-found',
      observations: [],
    })
  })

  it('fails closed when a checkpoint is not bound to the requested source', async () => {
    const ledger = createLoopLedgerStore()
    await ledger.append(repoRoot, runRecord('bound', 'failed'))
    const connector = createLoopRunTerminalsConnector({ repoRoot })
    const signal = new AbortController().signal
    const first = await connector.observe({ action, checkpoint: null, limit: 10, signal })

    const observed = connector.observe({
      action: { ...action, sourceId: 'another-ledger' },
      checkpoint: first.nextCheckpoint,
      limit: 10,
      signal,
    })

    await expect(observed).rejects.toMatchObject({
      _tag: 'LoopRunTerminalsSourceError',
      reason: 'checkpoint-invalid',
      observations: [],
    })
  })

  it('normalizes a malformed checkpoint cursor to the typed fail-closed error', async () => {
    const observed = createLoopRunTerminalsConnector({ repoRoot }).observe({
      action,
      checkpoint: {
        schemaVersion: 1,
        sourceId: action.sourceId,
        actionKind: action.kind,
        cursor: '{not json',
      },
      limit: 10,
      signal: new AbortController().signal,
    })

    await expect(observed).rejects.toMatchObject({
      _tag: 'LoopRunTerminalsSourceError',
      reason: 'checkpoint-invalid',
      observations: [],
    })
  })

  it('fails closed with a typed error when the real ledger read rejects a malformed line', async () => {
    await createLoopLedgerStore().append(repoRoot, runRecord('valid', 'failed'))
    await appendFile(ledgerFilePath(repoRoot), '{not valid json\n', 'utf8')

    const observed = createLoopRunTerminalsConnector({ repoRoot }).observe({
      action,
      checkpoint: null,
      limit: 10,
      signal: new AbortController().signal,
    })

    await expect(observed).rejects.toMatchObject({
      _tag: 'LoopRunTerminalsSourceError',
      reason: 'ledger-degraded',
      observations: [],
    })
  })

  it('fails closed with a typed error when typed ledger records repeat record_id', async () => {
    const ledger = createLoopLedgerStore()
    await ledger.append(repoRoot, runRecord('duplicate', 'failed'))
    await ledger.append(repoRoot, {
      schema_version: 1,
      record_id: 'ledger-record-duplicate',
      recorded_at: '2026-07-19T08:30:00.000Z',
      kind: 'change-loop-binding',
      change: 'change-other',
      loop_id: 'loop-other',
      source: 'explicit',
    } satisfies ChangeLoopBindingRecord)

    const observed = createLoopRunTerminalsConnector({ repoRoot }).observe({
      action,
      checkpoint: null,
      limit: 10,
      signal: new AbortController().signal,
    })

    await expect(observed).rejects.toMatchObject({
      _tag: 'LoopRunTerminalsSourceError',
      reason: 'duplicate-record-id',
      observations: [],
    })
  })
})
