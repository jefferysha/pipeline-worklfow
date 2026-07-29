import { describe, expect, it } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LoopEntry } from '@tenon/kernel'
import {
  buildLoopScopePreviewResponse,
  LoopScopePreviewInputError,
  LoopScopePreviewRootUntrustedError,
  parseLoopScopePreviewRequest,
  readTrustedLoopRegistry,
  readWithLoopScopeRootTrust,
} from './loopScopePreview.js'
import {
  captureWorkflowRootAnchor,
  closeWorkflowRootAnchor,
} from './workflowTrustedFs.js'

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

  it('fails closed when loops.yaml is replaced after its trusted fd is opened', () => {
    const root = mkdtempSync(join(tmpdir(), 'loop-scope-swap-'))
    const pipeline = join(root, '.pipeline')
    const registry = join(pipeline, 'loops.yaml')
    const parked = join(pipeline, 'loops.old.yaml')
    mkdirSync(pipeline)
    writeFileSync(registry, 'version: 1\nloops: []\n', 'utf8')
    const anchor = captureWorkflowRootAnchor(root)
    try {
      expect(() => readTrustedLoopRegistry(anchor, (fd) => {
        renameSync(registry, parked)
        writeFileSync(registry, 'version: 1\nloops: []\n', 'utf8')
        return readFileSync(fd, 'utf8')
      })).toThrow(LoopScopePreviewRootUntrustedError)
    } finally {
      closeWorkflowRootAnchor(anchor)
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts only closed, canonical, bounded paths and deduplicates in first-seen order', () => {
    expect(parseLoopScopePreviewRequest({
      root: '/repo',
      loop_id: 'release-loop',
      paths: ['src/app.ts', 'a:b', 'C:notes.txt', 'src/emoji-😀.ts', 'src/app.ts'],
    })).toEqual({
      root: '/repo',
      loopId: 'release-loop',
      paths: ['src/app.ts', 'a:b', 'C:notes.txt', 'src/emoji-😀.ts'],
    })

    for (const input of [
      { root: '/repo', loop_id: 'release-loop', paths: ['../secret'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['/etc/passwd'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['C:/Windows/system32'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['C:\\Windows\\system32'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src\\app.ts'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src/\"quoted\".ts'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src/control\u0001.ts'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src/lone-\ud800.ts'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src/trailing-\ud800'] },
      { root: '/repo', loop_id: 'release-loop', paths: ['src/lone-low-\udc00.ts'] },
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
