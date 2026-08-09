import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshHarness, rm, type Harness } from './integration-harness.js'
import { fingerprintWorkspace } from '@tenon/kernel'

const CANDIDATE_A = `workspace:sha256:${'1'.repeat(64)}`

let h: Harness

beforeEach(async () => {
  h = await freshHarness()
  await mkdir(join(h.cwd, '.pipeline', 'workflows'), { recursive: true })
  await writeFile(join(h.cwd, '.pipeline', 'workflows', 'review-flow.yaml'), `name: review-flow
review_budget:
  version: v1
  max_attempts: 2
steps:
  - id: verify
    label: Verify
    gate: review
    review_lanes: [standards, spec, e2e]
    skills:
      - id: acme-quality-gate
        kind: review
        review_lane: standards
    inputs: []
    outputs: []
    guards: []
    transitions: []
`, 'utf8')
  expect(await h.run([
    'init', 'demo', '--track', 'backend', '--preset', 'full', '--workflow', 'review-flow',
  ])).toBe(0)
  await mkdir(join(h.cwd, 'reports'), { recursive: true })
  await writeFile(join(h.cwd, 'reports', 'review.md'), '# Review\n\n- unresolved blocker\n', 'utf8')
})

afterEach(async () => {
  await rm(h.cwd, { recursive: true, force: true })
})

function jsonOut(): Record<string, unknown> {
  expect(h.out).toHaveLength(1)
  return JSON.parse(h.out[0] ?? '{}') as Record<string, unknown>
}

async function recordLanes(attemptId: unknown, result: 'pass' | 'fail'): Promise<void> {
  for (const lane of ['standards', 'spec', 'e2e']) {
    expect(await h.run([
      'review-attempt', 'lane', 'demo', '--attempt-id', String(attemptId),
      '--lane', lane, '--result', result, '--report', 'reports/review.md', '--json',
    ])).toBe(0)
    expect(jsonOut()).toMatchObject({ attemptId, lane, result })
  }
}

describe('review attempt budget CLI', () => {
  it('refuses a caller-supplied candidate that is not the current frozen review input', async () => {
    expect(await h.run([
      'review-attempt', 'begin', 'demo', '--candidate', CANDIDATE_A, '--json',
    ])).toBe(1)
    expect(h.err.join('\n')).toMatch(/candidate.*frozen input|frozen input.*candidate/i)
  })

  it('begins, resumes and completes one durable candidate-bound attempt', async () => {
    const candidate = await fingerprintWorkspace(h.cwd)
    expect(await h.run([
      'review-attempt', 'begin', 'demo', '--candidate', candidate, '--json',
    ])).toBe(0)
    const first = jsonOut()
    expect(first).toMatchObject({
      scope: 'verify', sequence: 1, used: 1, maxAttempts: 2, resumed: false,
      requiredLanes: ['standards', 'spec', 'e2e'],
    })

    await recordLanes(first.attemptId, 'fail')
    expect(await h.run([
      'review-attempt', 'begin', 'demo', '--candidate', candidate, '--json',
    ])).toBe(0)
    expect(jsonOut()).toMatchObject({ attemptId: first.attemptId, used: 1, resumed: true })

    expect(await h.run([
      'review-attempt', 'complete', 'demo', '--attempt-id', String(first.attemptId),
      '--result', 'fail', '--report', 'reports/review.md', '--json',
    ])).toBe(0)
    expect(jsonOut()).toMatchObject({
      attemptId: first.attemptId,
      scope: 'verify',
      result: 'fail',
    })
  })

  it('stops before reviewer dispatch when the frozen Workflow budget is exhausted', async () => {
    for (const index of [1, 2]) {
      if (index > 1) await writeFile(join(h.cwd, `candidate-${index}.txt`), `${index}\n`, 'utf8')
      const candidate = await fingerprintWorkspace(h.cwd)
      expect(await h.run([
        'review-attempt', 'begin', 'demo', '--candidate', candidate, '--json',
      ])).toBe(0)
      const attempt = jsonOut()
      await recordLanes(attempt.attemptId, 'fail')
      expect(await h.run([
        'review-attempt', 'complete', 'demo', '--attempt-id', String(attempt.attemptId),
        '--result', 'fail', '--report', 'reports/review.md', '--json',
      ])).toBe(0)
    }

    await writeFile(join(h.cwd, 'candidate-exhausted.txt'), 'exhausted\n', 'utf8')
    const exhaustedCandidate = await fingerprintWorkspace(h.cwd)
    expect(await h.run([
      'review-attempt', 'begin', 'demo', '--candidate', exhaustedCandidate, '--json',
    ])).toBe(2)
    expect(h.err.join('\n')).toMatch(/scope=verify.*used=2.*max=2/i)
    expect(h.err.join('\n')).toMatch(/remaining_blockers|最后失败报告|见 openspec/i)
  })

  it('supports an audited Pipeline override but refuses to rewrite an active attempt', async () => {
    expect(await h.run([
      'review-budget', 'set', 'demo', '--max-attempts', '3', '--json',
    ])).toBe(0)
    expect(jsonOut()).toMatchObject({ scope: 'verify', used: 0, maxAttempts: 3 })

    const candidate = await fingerprintWorkspace(h.cwd)
    expect(await h.run([
      'review-attempt', 'begin', 'demo', '--candidate', candidate, '--json',
    ])).toBe(0)
    expect(await h.run([
      'review-budget', 'set', 'demo', '--max-attempts', '4', '--json',
    ])).toBe(1)
    expect(h.err.join('\n')).toMatch(/active|进行中/i)
  })

  it('shows the finite frozen Workflow default before any attempt exists', async () => {
    expect(await h.run(['review-budget', 'show', 'demo', '--json'])).toBe(0)
    expect(jsonOut()).toEqual({
      change: 'demo',
      scope: 'verify',
      used: 0,
      maxAttempts: 2,
      defaultMaxAttempts: 2,
      override: null,
      active: null,
      lastCompleted: null,
      requiredLanes: ['standards', 'spec', 'e2e'],
    })
  })
})
