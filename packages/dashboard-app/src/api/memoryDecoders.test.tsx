import { describe, expect, it } from 'vitest'
import { decodeRelatedSessionSearch } from './memoryDecoders'

const validResponse = {
  protocol: 'tenon-related-session-memory/v1',
  query: 'review gate',
  platform: 'all',
  partial: false,
  warnings: [],
  matches: [{
    platform: 'codex',
    session_id: 'opaque-session',
    title: 'Review gate investigation',
    updated_at: '2026-07-28T00:00:00Z',
    score: 2.5,
    hit_count: 3,
    excerpt: 'We traced the review receipt to the exact transition event.',
    descendants_merged: 0,
  }],
}

describe('related-session search decoder', () => {
  it('accepts the complete v1 envelope and rejects an unknown nested platform', () => {
    expect(decodeRelatedSessionSearch(validResponse)).toEqual(validResponse)
    expect(decodeRelatedSessionSearch({
      ...validResponse,
      query: '🙂'.repeat(128),
    })?.query).toBe('🙂'.repeat(128))
    expect(decodeRelatedSessionSearch({
      ...validResponse,
      matches: [{ ...validResponse.matches[0], platform: 'unknown-host' }],
    })).toBeNull()
  })

  it('rejects envelopes that violate the bounded response contract', () => {
    expect(decodeRelatedSessionSearch({ ...validResponse, protocol: 'other/v1' })).toBeNull()
    expect(decodeRelatedSessionSearch({ ...validResponse, query: 'x' })).toBeNull()
    expect(decodeRelatedSessionSearch({
      ...validResponse,
      warnings: [{ code: 'file-read-truncated', message: 'A source was truncated.' }],
    })?.warnings).toEqual([{ code: 'file-read-truncated', message: 'A source was truncated.' }])
    expect(decodeRelatedSessionSearch({
      ...validResponse,
      warnings: [{ code: 42, message: 'bad code' }],
    })).toBeNull()
    expect(decodeRelatedSessionSearch({
      ...validResponse,
      matches: [{ ...validResponse.matches[0], updated_at: 'not-a-date' }],
    })).toBeNull()
    expect(decodeRelatedSessionSearch({
      ...validResponse,
      matches: [{ ...validResponse.matches[0], excerpt: 'x'.repeat(321) }],
    })).toBeNull()
    expect(decodeRelatedSessionSearch({
      ...validResponse,
      matches: [{ ...validResponse.matches[0], excerpt: '🙂'.repeat(320) }],
    })?.matches[0]?.excerpt).toBe('🙂'.repeat(320))
    expect(decodeRelatedSessionSearch({
      ...validResponse,
      matches: Array.from({ length: 9 }, (_, index) => ({
        ...validResponse.matches[0],
        session_id: `session-${index}`,
      })),
    })).toBeNull()
  })

  it('accepts matches whose optional display title and timestamp are absent', () => {
    const match = {
      platform: 'codex',
      session_id: 'opaque-session',
      score: 2.5,
      hit_count: 3,
      excerpt: 'We traced the review receipt to the exact transition event.',
      descendants_merged: 0,
    }
    expect(decodeRelatedSessionSearch({ ...validResponse, matches: [match] })?.matches[0]).toEqual(match)
  })
})
