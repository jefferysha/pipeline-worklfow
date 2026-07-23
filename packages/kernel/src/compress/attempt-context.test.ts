import { describe, expect, it } from 'vitest'
import {
  buildAttemptContext,
  detectAttemptStagnation,
  normalizeAttemptError,
  type RunAttemptRecord,
} from './attempt-context.js'

const attempt = (
  attemptId: string,
  result: RunAttemptRecord['result'],
  recordedAt: string,
  detail?: string,
): RunAttemptRecord => ({
  attempt_id: attemptId,
  loop_id: 'loop-a',
  change: 'change-a',
  result,
  recorded_at: recordedAt,
  ...(detail === undefined ? {} : { detail }),
})

describe('attempt-context · H2 durable attempt context', () => {
  it('normalizes volatile paths, ids, timestamps, and whitespace into a stable failure fingerprint', () => {
    const a = normalizeAttemptError('Error: build failed at /tmp/run-a/src/a.ts:41\nrequest req_123 at 2026-07-19T01:02:03.000Z')
    const b = normalizeAttemptError(' build failed at /private/tmp/run-b/src/a.ts:99  request req_999 at 2026-07-20T04:05:06Z ')
    expect(a.message).toBe('build failed at <tmp>/src/a.ts:<line> request <request-id> at <timestamp>')
    expect(b).toEqual(a)
  })

  it('detects only consecutive repeated durable failures and ignores success boundaries', () => {
    const stalled = [
      attempt('a1', 'failed', '2026-07-19T00:00:00Z', 'boom at /tmp/x.ts:1'),
      attempt('a2', 'retry-queued', '2026-07-19T00:01:00Z', 'boom at /tmp/x.ts:2'),
      attempt('a3', 'failed', '2026-07-19T00:02:00Z', 'boom at /tmp/x.ts:3'),
    ]
    expect(detectAttemptStagnation(stalled, { threshold: 3 })).toMatchObject({
      stagnant: true,
      repeatedAttempts: ['a1', 'a2', 'a3'],
    })

    expect(detectAttemptStagnation([
      stalled[0]!,
      attempt('ok', 'merged', '2026-07-19T00:01:30Z'),
      stalled[2]!,
    ], { threshold: 2 }).stagnant).toBe(false)
  })

  it('does not read or model legacy pattern/level fields when deciding stagnation', () => {
    const records = [
      { ...attempt('a1', 'failed', '2026-07-19T00:00:00Z', 'same'), pattern: 'x', level: 'L1' },
      { ...attempt('a2', 'failed', '2026-07-19T00:01:00Z', 'same'), pattern: 'y', level: 'L3' },
    ]
    expect(detectAttemptStagnation(records, { threshold: 2 }).stagnant).toBe(true)
  })

  it('prunes deterministically: retains first attempt, result/fingerprint changes, and newest tail within character budget', () => {
    const records = [
      attempt('a1', 'failed', '2026-07-19T00:00:00Z', 'compile failed'),
      attempt('a2', 'failed', '2026-07-19T00:01:00Z', 'compile failed'),
      attempt('a3', 'failed', '2026-07-19T00:02:00Z', 'compile failed'),
      attempt('a4', 'retry-queued', '2026-07-19T00:03:00Z', 'network reset'),
      attempt('a5', 'paused', '2026-07-19T00:04:00Z', 'human review'),
    ]
    const result = buildAttemptContext(records, { tail: 2, maxChars: 10_000, stagnationThreshold: 3 })
    expect(result.attempts.map((r) => r.attempt_id)).toEqual(['a1', 'a4', 'a5'])
    expect(result.omittedAttemptIds).toEqual(['a2', 'a3'])
    expect(result.stagnation.stagnant).toBe(false)
    expect(result.rendered).toContain('omitted: a2, a3')
  })

  it('maxChars never emits a partial record and always keeps the newest attempt', () => {
    const records = [
      attempt('a1', 'failed', '2026-07-19T00:00:00Z', 'x'.repeat(200)),
      attempt('a2', 'failed', '2026-07-19T00:01:00Z', 'y'.repeat(200)),
      attempt('a3', 'paused', '2026-07-19T00:02:00Z', 'latest'),
    ]
    const result = buildAttemptContext(records, { tail: 3, maxChars: 150 })
    expect(result.attempts.at(-1)?.attempt_id).toBe('a3')
    expect(result.rendered.length).toBeLessThanOrEqual(150)
    expect(result.rendered).not.toContain('xxx')
    expect(result.rendered).not.toContain('yyy')
  })

  it('rejects mixed loop/change inputs instead of producing a misleading cross-run summary', () => {
    expect(() => buildAttemptContext([
      attempt('a1', 'failed', '2026-07-19T00:00:00Z', 'x'),
      { ...attempt('a2', 'failed', '2026-07-19T00:01:00Z', 'x'), change: 'other' },
    ])).toThrow(/same loop_id and change/)
  })
})
