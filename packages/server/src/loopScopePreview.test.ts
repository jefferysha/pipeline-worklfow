import { describe, expect, it } from 'vitest'
import type { LoopEntry } from '@tenon/kernel'
import {
  buildLoopScopePreviewResponse,
  LoopScopePreviewInputError,
  LoopScopePreviewRootUntrustedError,
  parseLoopScopePreviewRequest,
  readWithLoopScopeRootTrust,
} from './loopScopePreview.js'

const loop = (overrides: Partial<LoopEntry> = {}): LoopEntry => ({
  id: 'release-loop',
  name: 'Release loop',
  kind: 'executor',
  goal: 'Ship safely',
  cadence: 'manual',
  risk: 'medium',
  runner: 'codex',
  change_prefix: 'release-',
  phases: ['build'],
  human_gates: [],
  design_doc: 'docs/release.md',
  status: 'active',
  budget: { max_runs_per_day: 3, max_in_flight: 1, on_exceed: 'pause-loop' },
  kill_criteria: [],
  autonomy_level: 'L3',
  allowlist: ['src/**', 'docs/**'],
  denylist: ['src/secrets/**'],
  skill_bundle_id: '_all',
  ...overrides,
})

const matches = (path: string, glob: string): boolean => {
  const prefix = glob.endsWith('/**') ? glob.slice(0, -3) : glob
  return path === prefix || path.startsWith(`${prefix}/`)
}

describe('Loop scope preview request', () => {
  it('fails closed when the root trust anchor is stale before or after the registry read', () => {
    let reads = 0
    expect(() => readWithLoopScopeRootTrust(
      () => { throw new Error('stale before read') },
      () => { reads += 1; return 'registry' },
    )).toThrow(expect.objectContaining<Partial<LoopScopePreviewRootUntrustedError>>({
      stage: 'before-read',
    }))
    expect(reads).toBe(0)

    let assertions = 0
    expect(() => readWithLoopScopeRootTrust(
      () => {
        assertions += 1
        if (assertions === 2) throw new Error('stale after read')
      },
      () => { reads += 1; return 'registry' },
    )).toThrow(expect.objectContaining<Partial<LoopScopePreviewRootUntrustedError>>({
      stage: 'after-read',
    }))
    expect(reads).toBe(1)
  })

  it('accepts only closed, canonical, bounded paths and deduplicates in first-seen order', () => {
    expect(parseLoopScopePreviewRequest({
      root: '/repo',
      loop_id: 'release-loop',
      paths: ['src/app.ts', 'docs/guide.md', 'src/app.ts'],
    })).toEqual({
      root: '/repo',
      loopId: 'release-loop',
      paths: ['src/app.ts', 'docs/guide.md'],
    })

    for (const input of [
      { root: '/repo', loop_id: 'release-loop', paths: ['../secret'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['/etc/passwd'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['C:/Windows/system32'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['C:\\Windows\\system32'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src\\app.ts'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src//app.ts'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src/app.ts/'] },
      { root: '/repo', loop_id: 'release-loop', paths: [] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src/app.ts'], extra: true },
    ]) {
      expect(() => parseLoopScopePreviewRequest(input)).toThrow(LoopScopePreviewInputError)
    }
  })

  it('enforces path count, per-path UTF-8 bytes, and aggregate UTF-8 bytes', () => {
    expect(() => parseLoopScopePreviewRequest({
      root: '/repo',
      loop_id: 'release-loop',
      paths: Array.from({ length: 101 }, (_, index) => `src/${index}.ts`),
    })).toThrow(/100/)
    expect(() => parseLoopScopePreviewRequest({
      root: '/repo',
      loop_id: 'release-loop',
      paths: [`src/${'界'.repeat(342)}.ts`],
    })).toThrow(/1024/)
    expect(() => parseLoopScopePreviewRequest({
      root: '/repo',
      loop_id: 'release-loop',
      paths: Array.from({ length: 100 }, (_, index) => `src/${index}-${'界'.repeat(108)}.ts`),
    })).toThrow(/32768/)
  })
})

describe('Loop scope preview response', () => {
  it('returns summary, per-path explanations, and the live L3 enforcement hint', () => {
    expect(buildLoopScopePreviewResponse(loop(), [
      'src/app.ts',
      'src/secrets/key.txt',
      'docs/guide.md',
      'assets/logo.svg',
    ], matches)).toEqual({
      ok: true,
      schema_version: 1,
      loop_id: 'release-loop',
      loop_status: 'active',
      autonomy_level: 'L3',
      enforced_for_unattended_merge: true,
      summary: { total: 4, allowed: 2, blocked: 2 },
      items: [
        { path: 'src/app.ts', verdict: 'allowed', reason: 'allowlist', matched_pattern: 'src/**' },
        { path: 'src/secrets/key.txt', verdict: 'blocked', reason: 'path-denied', matched_pattern: 'src/secrets/**' },
        { path: 'docs/guide.md', verdict: 'allowed', reason: 'allowlist', matched_pattern: 'docs/**' },
        { path: 'assets/logo.svg', verdict: 'blocked', reason: 'path-outside-allowlist', matched_pattern: null },
      ],
    })
  })

  it('marks paused and non-L3 loops as simulation without changing path results', () => {
    const response = buildLoopScopePreviewResponse(loop({ status: 'paused', autonomy_level: 'L2' }), [
      'src/app.ts',
    ], matches)
    expect(response.enforced_for_unattended_merge).toBe(false)
    expect(response.items[0]?.verdict).toBe('allowed')
  })
})
