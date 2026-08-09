import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createReviewAttemptBudgetStore,
  ReviewAttemptBudgetError,
  type ReviewAttemptBudgetStore,
} from './review-attempt-budget.js'

const RUN_ID = 'run-review-budget'
const WORKFLOW_FINGERPRINT = 'a'.repeat(64)
const CANDIDATE_A = `workspace:sha256:${'1'.repeat(64)}`
const CANDIDATE_B = `workspace:sha256:${'2'.repeat(64)}`
const CANDIDATE_C = `workspace:sha256:${'3'.repeat(64)}`

let root: string
let changeDir: string
let reportPath: string
let nextId: number
let store: ReviewAttemptBudgetStore

function identity(scope = 'build') {
  return {
    projectRoot: root,
    changeDir,
    runId: RUN_ID,
    workflowFingerprint: WORKFLOW_FINGERPRINT,
    scope,
  }
}

function beginInput(candidateFingerprint: string, maxAttempts = 2) {
  return {
    ...identity(),
    candidateFingerprint,
    maxAttempts,
    requiredLanes: ['standards', 'spec', 'e2e'],
  }
}

async function recordAllLanes(attemptId: string, result: 'pass' | 'fail' = 'pass'): Promise<void> {
  for (const lane of ['standards', 'spec', 'e2e']) {
    await store.recordLane({
      ...identity(), attemptId, lane, result, reportPath,
    })
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tenon-review-budget-'))
  changeDir = join(root, 'openspec', 'changes', 'demo')
  reportPath = join(root, 'reports', 'review.md')
  await mkdir(changeDir, { recursive: true })
  await mkdir(join(root, 'reports'), { recursive: true })
  await writeFile(reportPath, '# review\n\n- blocker A\n', 'utf8')
  nextId = 1
  store = createReviewAttemptBudgetStore({
    clock: () => '2026-08-09T00:00:00.000Z',
    attemptId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
  })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('durable review attempt budget', () => {
  it('resumes the exact active candidate without consuming another attempt', async () => {
    const first = await store.begin(beginInput(CANDIDATE_A))
    const resumed = await store.begin(beginInput(CANDIDATE_A))

    expect(first).toMatchObject({ sequence: 1, used: 1, maxAttempts: 2, resumed: false })
    expect(resumed).toEqual({ ...first, resumed: true })
    await expect(store.begin(beginInput(CANDIDATE_B)))
      .rejects.toThrow(/active.*candidate|进行中的 Review/i)
  })

  it('persists completed reports and rejects a third candidate without changing durable bytes', async () => {
    const first = await store.begin(beginInput(CANDIDATE_A))
    await recordAllLanes(first.attemptId, 'fail')
    const completed = await store.complete({
      ...identity(), attemptId: first.attemptId, result: 'fail', reportPath,
    })
    expect(completed.reportDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(completed.reportPath).toMatch(/^openspec\/changes\/demo\/\.pipeline-run\/review-attempt-reports\//)

    const second = await store.begin(beginInput(CANDIDATE_B))
    await recordAllLanes(second.attemptId, 'fail')
    await store.complete({ ...identity(), attemptId: second.attemptId, result: 'fail', reportPath })

    const statePath = join(changeDir, '.pipeline-run', 'review-attempt-budget.json')
    const before = await readFile(statePath)
    await expect(store.begin(beginInput(CANDIDATE_C))).rejects.toMatchObject({
      code: 'review-budget-exhausted',
      used: 2,
      maxAttempts: 2,
    })
    expect(await readFile(statePath)).toEqual(before)
  })

  it('keeps an active attempt when report proof is missing and completes idempotently after restart', async () => {
    const active = await store.begin(beginInput(CANDIDATE_A))
    await recordAllLanes(active.attemptId)
    await expect(store.complete({
      ...identity(), attemptId: active.attemptId, result: 'pass', reportPath: join(root, 'missing.md'),
    })).rejects.toThrow(/report|报告/i)

    const restarted = createReviewAttemptBudgetStore()
    expect(await restarted.inspect(identity())).toMatchObject({
      used: 1,
      active: { attemptId: active.attemptId, candidateFingerprint: CANDIDATE_A },
    })
    for (const lane of ['standards', 'spec', 'e2e']) {
      await restarted.recordLane({
        ...identity(), attemptId: active.attemptId, lane, result: 'pass', reportPath,
      })
    }
    const complete = await restarted.complete({
      ...identity(), attemptId: active.attemptId, result: 'pass', reportPath,
    })
    expect(await restarted.complete({
      ...identity(), attemptId: active.attemptId, result: 'pass', reportPath,
    })).toEqual(complete)
  })

  it('binds overrides to the run and workflow and never mutates an active budget', async () => {
    expect(await store.setOverride({ ...identity(), maxAttempts: 3, defaultMaxAttempts: 2 }))
      .toMatchObject({ maxAttempts: 3, used: 0 })
    const active = await store.begin(beginInput(CANDIDATE_A))
    await expect(store.setOverride({ ...identity(), maxAttempts: 4, defaultMaxAttempts: 2 }))
      .rejects.toThrow(/active|进行中/i)
    await recordAllLanes(active.attemptId, 'fail')
    await store.complete({ ...identity(), attemptId: active.attemptId, result: 'fail', reportPath })
    await expect(store.setOverride({ ...identity(), maxAttempts: 0, defaultMaxAttempts: 2 }))
      .rejects.toThrow(/1\.\.20/)
    await expect(store.inspect({ ...identity(), runId: 'another-run' }))
      .rejects.toThrow(/run|identity/i)
    await expect(store.inspect({ ...identity(), workflowFingerprint: 'b'.repeat(64) }))
      .rejects.toThrow(/workflow|identity/i)
  })

  it('allows only one concurrent contender to claim the final slot', async () => {
    const first = await store.begin(beginInput(CANDIDATE_A))
    await recordAllLanes(first.attemptId, 'fail')
    await store.complete({ ...identity(), attemptId: first.attemptId, result: 'fail', reportPath })

    const contenders = await Promise.allSettled([
      store.begin(beginInput(CANDIDATE_B)),
      store.begin(beginInput(CANDIDATE_C)),
    ])
    expect(contenders.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(contenders.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(await store.inspect(identity())).toMatchObject({ used: 2, maxAttempts: 2 })
  })

  it('uses a stable typed exhaustion error for dispatch gates', async () => {
    const active = await store.begin(beginInput(CANDIDATE_A, 1))
    await recordAllLanes(active.attemptId, 'fail')
    await store.complete({ ...identity(), attemptId: active.attemptId, result: 'fail', reportPath })
    try {
      await store.begin(beginInput(CANDIDATE_B, 1))
      throw new Error('expected exhaustion')
    } catch (error) {
      expect(error).toBeInstanceOf(ReviewAttemptBudgetError)
      expect(error).toMatchObject({ code: 'review-budget-exhausted', scope: 'build' })
    }
  })

  it('aggregates parallel Review lanes into one attempt and requires every lane before complete', async () => {
    const attempt = await store.begin(beginInput(CANDIDATE_A))
    expect(attempt).toMatchObject({
      used: 1,
      requiredLanes: ['standards', 'spec', 'e2e'],
    })

    const standards = await store.recordLane({
      ...identity(), attemptId: attempt.attemptId, lane: 'standards', result: 'pass', reportPath,
    })
    expect(await store.recordLane({
      ...identity(), attemptId: attempt.attemptId, lane: 'standards', result: 'pass', reportPath,
    })).toEqual(standards)
    await store.recordLane({
      ...identity(), attemptId: attempt.attemptId, lane: 'spec', result: 'pass', reportPath,
    })

    await expect(store.complete({
      ...identity(), attemptId: attempt.attemptId, result: 'pass', reportPath,
    })).rejects.toThrow(/e2e|lane|缺/i)
    expect(await store.inspect(identity())).toMatchObject({
      used: 1,
      active: { attemptId: attempt.attemptId },
    })

    await store.recordLane({
      ...identity(), attemptId: attempt.attemptId, lane: 'e2e', result: 'fail', reportPath,
    })
    await expect(store.complete({
      ...identity(), attemptId: attempt.attemptId, result: 'pass', reportPath,
    })).rejects.toThrow(/result|fail|lane/i)
    const completed = await store.complete({
      ...identity(), attemptId: attempt.attemptId, result: 'fail', reportPath,
    })
    expect(completed.lanes).toEqual([
      expect.objectContaining({ lane: 'standards', result: 'pass' }),
      expect.objectContaining({ lane: 'spec', result: 'pass' }),
      expect.objectContaining({ lane: 'e2e', result: 'fail' }),
    ])
    const aggregate = await readFile(join(root, completed.reportPath), 'utf8')
    expect(JSON.parse(aggregate.split('\n')[0] ?? '{}')).toMatchObject({
      attemptId: attempt.attemptId,
      requiredLanes: ['standards', 'spec', 'e2e'],
      result: 'fail',
      lanes: [
        { lane: 'standards', result: 'pass' },
        { lane: 'spec', result: 'pass' },
        { lane: 'e2e', result: 'fail' },
      ],
    })
    expect((await store.inspect(identity()))?.used).toBe(1)
  })

  it('refuses to resume the same candidate with a different frozen lane set', async () => {
    await store.begin(beginInput(CANDIDATE_A))
    await expect(store.begin({
      ...beginInput(CANDIDATE_A),
      requiredLanes: ['standards', 'e2e'],
    })).rejects.toThrow(/lane|identity|不一致/i)
  })
})
