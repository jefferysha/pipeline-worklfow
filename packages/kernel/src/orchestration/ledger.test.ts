import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createAggregateV2,
  createOrchestrationLedger,
  type BoardCommandV2,
  type DevelopmentRequestV2,
} from './index.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function request(projectId = 'project-1', changeId = 'change-1'): DevelopmentRequestV2 {
  return {
    schema_version: 'development-request/v2', record_id: 'request:req-1', project_id: projectId,
    change_id: changeId, revision: 0, correlation_id: 'corr-1', actor: { kind: 'user', id: 'u-1' },
    created_at: '2026-09-01T00:00:00.000Z', request_id: 'req-1', intent: 'build a feature',
    interaction_policy: 'recommended-defaults', requested_effects: ['read'], constraints: [],
    user_skills: [], user_mcps: [], auto_select: true,
  }
}

function accept(expectedRevision = 0, commandId = `cmd-${expectedRevision + 1}`): BoardCommandV2 {
  return {
    schema_version: 'board-command/v2', command_id: commandId, idempotency_key: `idem-${commandId}`,
    expected_revision: expectedRevision, actor: { kind: 'user', id: 'u-1' },
    issued_at: `2026-09-01T00:00:0${expectedRevision}.000Z`, correlation_id: 'corr-1', change_id: 'change-1',
    type: 'accept-request', request: request(),
  }
}

function cancel(expectedRevision: number, commandId = `cancel-${expectedRevision + 1}`): BoardCommandV2 {
  return {
    schema_version: 'board-command/v2', command_id: commandId, idempotency_key: `idem-${commandId}`,
    expected_revision: expectedRevision, actor: { kind: 'user', id: 'u-1' },
    issued_at: `2026-09-01T00:00:0${expectedRevision}.000Z`, correlation_id: 'corr-1', change_id: 'change-1',
    type: 'cancel-change', reason: 'user requested stop',
  }
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tenon-orchestration-ledger-'))
  roots.push(root)
  return root
}

describe('OrchestrationLedger v2', () => {
  it('appends with CAS and replays duplicate commands without another write', async () => {
    const dir = await tempRoot()
    const ledger = createOrchestrationLedger()
    await ledger.initialize(dir, { project_id: 'project-1', change_id: 'change-1', correlation_id: 'corr-1' })

    const first = await ledger.append(dir, accept())
    expect(first.kind).toBe('committed')
    if (first.kind !== 'committed') return
    const replay = await ledger.append(dir, accept())
    expect(replay.kind).toBe('replayed')
    expect(replay.event.event_id).toBe(first.event.event_id)
    expect((await ledger.readEvents(dir)).map((event) => event.revision)).toEqual([1])

    const stale = await ledger.append(dir, accept(0, 'cmd-stale'))
    expect(stale.kind).toBe('rejected')
    if (stale.kind === 'rejected') expect(stale.rejection.code).toBe('revision-conflict')
    expect((await ledger.readSnapshot(dir))?.revision).toBe(1)
  })

  it('rejects same command or idempotency key with a different payload and performs zero writes', async () => {
    const dir = await tempRoot()
    const ledger = createOrchestrationLedger()
    await ledger.initialize(dir, { project_id: 'project-1', change_id: 'change-1', correlation_id: 'corr-1' })
    expect((await ledger.append(dir, accept())).kind).toBe('committed')
    const conflicting = { ...accept(), request: { ...request(), intent: 'different intent' } }
    const result = await ledger.append(dir, conflicting)
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') expect(result.rejection.code).toBe('idempotency-conflict')
    expect((await ledger.readEvents(dir)).length).toBe(1)
    const otherCommandSameKey = { ...accept(1, 'cmd-2'), idempotency_key: 'idem-cmd-1' }
    const keyConflict = await ledger.append(dir, otherCommandSameKey)
    expect(keyConflict.kind).toBe('rejected')
    if (keyConflict.kind === 'rejected') expect(keyConflict.rejection.code).toBe('idempotency-conflict')
  })

  it('serializes concurrent appenders into one CAS winner', async () => {
    const dir = await tempRoot()
    const ledger = createOrchestrationLedger()
    await ledger.initialize(dir, { project_id: 'project-1', change_id: 'change-1', correlation_id: 'corr-1' })
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => ledger.append(dir, accept(0, `concurrent-${index}`))))
    expect(results.filter((result) => result.kind === 'committed')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'rejected' && result.rejection.code === 'revision-conflict')).toHaveLength(7)
    expect((await ledger.readEvents(dir)).map((event) => event.revision)).toEqual([1])
  })

  it('replays the original committed snapshot and produces a deterministic recovery report', async () => {
    const dir = await tempRoot()
    const ledger = createOrchestrationLedger()
    await ledger.initialize(dir, { project_id: 'project-1', change_id: 'change-1', correlation_id: 'corr-1' })
    const first = await ledger.append(dir, accept())
    expect(first.kind).toBe('committed')
    const second = await ledger.append(dir, cancel(1))
    expect(second.kind).toBe('committed')
    const replay = await ledger.append(dir, accept())
    expect(replay.kind).toBe('replayed')
    if (replay.kind === 'replayed') expect(replay.snapshot.revision).toBe(1)
    const one = await ledger.recover(dir, '2026-09-01T00:00:00.000Z')
    const two = await ledger.recover(dir, '2026-09-01T00:00:00.000Z')
    expect(two.report).toEqual(one.report)
  })

  it('recovers the last valid snapshot and ignores an event orphaned by a crash', async () => {
    const dir = await tempRoot()
    const ledger = createOrchestrationLedger()
    await ledger.initialize(dir, { project_id: 'project-1', change_id: 'change-1', correlation_id: 'corr-1' })
    const first = await ledger.append(dir, accept())
    expect(first.kind).toBe('committed')
    if (first.kind !== 'committed') return
    const eventName = (await readdir(path.join(dir, '.orchestration-v2', 'events')))[0]!
    const persisted = await readFile(path.join(dir, '.orchestration-v2', 'events', eventName), 'utf8')
    const orphanEnvelope = JSON.parse(persisted) as { payload: Record<string, unknown> }
    orphanEnvelope.payload = { ...orphanEnvelope.payload, event_id: 'event:orphan', revision: 2, command_id: 'cmd-orphan' }
    const orphan = JSON.stringify(orphanEnvelope)
    await writeFile(path.join(dir, '.orchestration-v2', 'events', '000000000002-event-orphan.json'), orphan)
    const recovered = await ledger.recover(dir)
    expect(recovered.snapshot?.revision).toBe(1)
    expect(recovered.report.last_valid_revision).toBe(1)
    expect(recovered.report.orphan_event_revisions).toEqual([2])
  })

  it('fails closed on corrupt current data and reports the deterministic boundary', async () => {
    const dir = await tempRoot()
    const ledger = createOrchestrationLedger()
    await ledger.initialize(dir, { project_id: 'project-1', change_id: 'change-1', correlation_id: 'corr-1' })
    await ledger.append(dir, accept())
    await writeFile(path.join(dir, '.orchestration-v2', 'current.json'), '{not-json')
    const recovered = await ledger.recover(dir)
    expect(recovered.snapshot?.revision).toBe(1)
    expect(recovered.report.recovered_from).toBe('immutable')
    expect(recovered.report.corrupt_boundary?.kind).toBe('current-snapshot')
    expect((await ledger.readSnapshot(dir))?.revision).toBe(1)
  })

  it('rejects symlinked and traversal paths before reading any record', async () => {
    const dir = await tempRoot()
    const ledger = createOrchestrationLedger()
    await ledger.initialize(dir, { project_id: 'project-1', change_id: 'change-1', correlation_id: 'corr-1' })
    const events = path.join(dir, '.orchestration-v2', 'events')
    const names = await readdir(events)
    expect(names.length).toBe(0)
    await expect(ledger.readEvent(dir, '../escape')).rejects.toThrow(/path|identity|安全/i)
    if (process.platform !== 'win32') {
      await writeFile(path.join(dir, 'outside.json'), JSON.stringify(createAggregateV2('project-1', 'change-1', 'corr-1')))
      const target = path.join(events, '000000000001-event-link.json')
      const outside = path.join(dir, 'outside.json')
      const fs = await import('node:fs/promises')
      await fs.symlink(outside, target)
      await expect(ledger.readEvents(dir)).rejects.toThrow(/symlink|regular|安全/i)
    }
  })
})
