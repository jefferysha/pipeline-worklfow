import { access, mkdtemp, mkdir, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TaskRunJournalCorruptError,
  TaskRunRevisionConflictError,
  appendTaskRunAttempt,
  appendTaskRunOperation,
  appendTaskRunValidatorVerdict,
  readTaskRunJournal,
} from './journal.js'

async function changeDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tenon-task-run-journal-'))
  const change = join(root, 'change')
  await mkdir(change)
  return change
}

describe('task run journal', () => {
  it('keeps an empty read side-effect free', async () => {
    const change = await changeDir()
    await expect(readTaskRunJournal(change, 'revision-1')).resolves.toEqual({
      run_revision: 0, attempts: [], operations: [], validator_verdicts: [],
    })
    await expect(access(join(change, '.pipeline'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reads through the server-owned directory fd path without trusting ordinary symlinks', async () => {
    const change = await changeDir()
    const handle = await open(change, 'r')
    try {
      const prefix = process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd'
      await expect(readTaskRunJournal(`${prefix}/${handle.fd}`, 'revision-1')).resolves.toEqual({
        run_revision: 0, attempts: [], operations: [], validator_verdicts: [],
      })
    } finally {
      await handle.close()
    }
  })

  it('appends attempt and operation facts without rewriting history', async () => {
    const change = await changeDir()
    await appendTaskRunAttempt(change, 'revision-1', 0, {
      attempt_id: 'item-1',
      work_item_id: 'item',
      attempt_number: 1,
      status: 'failed',
      recorded_at: '2026-08-04T00:00:00.000Z',
      input_digests: {},
    })
    await appendTaskRunOperation(change, 'revision-1', {
      operation_id: 'operation-1',
      operation: 'retry',
      work_item_id: 'item',
      expected_run_revision: 1,
      expected_state: 'failed',
      recorded_at: '2026-08-04T00:00:01.000Z',
    })

    const journal = await readTaskRunJournal(change, 'revision-1')
    expect(journal.run_revision).toBe(2)
    expect(journal.attempts).toHaveLength(1)
    expect(journal.operations).toHaveLength(1)
  })

  it('accepts an append-only running-to-terminal transition for one attempt identity', async () => {
    const change = await changeDir()
    const running = {
      attempt_id: 'item-1', work_item_id: 'item', attempt_number: 1,
      status: 'running' as const, recorded_at: '2026-08-04T00:00:00.000Z', input_digests: {},
    }
    await appendTaskRunAttempt(change, 'revision-1', 0, running)
    await appendTaskRunAttempt(change, 'revision-1', 1, {
      ...running, status: 'succeeded', recorded_at: '2026-08-04T00:00:01.000Z', output_digest: 'sha256:item',
    })

    const journal = await readTaskRunJournal(change, 'revision-1')
    expect(journal.attempts).toMatchObject([
      { attempt_id: 'item-1', status: 'running', journal_sequence: 1 },
      { attempt_id: 'item-1', status: 'succeeded', journal_sequence: 2 },
    ])
  })

  it('rejects an invalid terminal transition before writing it', async () => {
    const change = await changeDir()
    const failed = {
      attempt_id: 'item-1', work_item_id: 'item', attempt_number: 1,
      status: 'failed' as const, recorded_at: '2026-08-04T00:00:00.000Z', input_digests: {},
    }
    await appendTaskRunAttempt(change, 'revision-1', 0, failed)
    await expect(appendTaskRunAttempt(change, 'revision-1', 1, {
      ...failed, status: 'succeeded', recorded_at: '2026-08-04T00:00:01.000Z',
    })).rejects.toBeInstanceOf(TaskRunJournalCorruptError)
    await expect(readTaskRunJournal(change, 'revision-1')).resolves.toMatchObject({
      run_revision: 1, attempts: [{ status: 'failed' }],
    })
  })

  it('keeps validator history append-only while projecting the latest verdict per identity', async () => {
    const change = await changeDir()
    await appendTaskRunValidatorVerdict(change, 'revision-1', 0, {
      validator_id: 'integration', scope: 'run', status: 'pending',
      recorded_at: '2026-08-04T00:00:00.000Z',
    })
    await appendTaskRunValidatorVerdict(change, 'revision-1', 1, {
      validator_id: 'integration', scope: 'run', status: 'passed',
      recorded_at: '2026-08-04T00:00:01.000Z',
    })
    const journal = await readTaskRunJournal(change, 'revision-1')
    expect(journal.run_revision).toBe(2)
    expect(journal.validator_verdicts).toEqual([{
      validator_id: 'integration', scope: 'run', status: 'passed',
      recorded_at: '2026-08-04T00:00:01.000Z',
    }])
  })

  it('allows only one concurrent operation for the same expected revision', async () => {
    const change = await changeDir()
    const operation = (id: string) => appendTaskRunOperation(change, 'revision-1', {
      operation_id: id,
      operation: 'resume' as const,
      expected_run_revision: 0,
      expected_state: 'blocked',
      recorded_at: '2026-08-04T00:00:00.000Z',
    })

    const results = await Promise.allSettled([operation('first'), operation('second')])
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(({ status }) => status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: expect.any(TaskRunRevisionConflictError) })
    expect((await readTaskRunJournal(change, 'revision-1')).operations).toHaveLength(1)
  })
})
