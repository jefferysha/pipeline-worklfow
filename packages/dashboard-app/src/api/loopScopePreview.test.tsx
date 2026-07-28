import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeLoopScopePreview,
  LoopScopePreviewError,
  parseLoopScopePreviewPaths,
  postLoopScopePreview,
} from './loopScopePreview'

const response = {
  ok: true,
  schema_version: 1,
  loop_id: 'release-loop',
  loop_status: 'active',
  autonomy_level: 'L3',
  enforced_for_unattended_merge: true,
  summary: { total: 2, allowed: 1, blocked: 1 },
  items: [
    { path: 'src/app.ts', verdict: 'allowed', reason: 'allowlist', matched_pattern: 'src/**' },
    { path: 'docs/guide.md', verdict: 'blocked', reason: 'path-outside-allowlist', matched_pattern: null },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe('loop scope preview API', () => {
  it('keeps UX parsing in the protocol adapter and rejects Windows absolute paths', () => {
    expect(parseLoopScopePreviewPaths('src/app.ts\nsrc/app.ts\ndocs/guide.md')).toEqual([
      'src/app.ts',
      'docs/guide.md',
    ])
    expect(parseLoopScopePreviewPaths('C:/Windows/system32')).toBeNull()
    expect(parseLoopScopePreviewPaths('C:\\Windows\\system32')).toBeNull()
  })

  it('decodes only a complete, internally consistent closed response', () => {
    expect(decodeLoopScopePreview(response)).toEqual(response)
    expect(decodeLoopScopePreview({ ...response, schema_version: 2 })).toBeNull()
    expect(decodeLoopScopePreview({ ...response, surprise: true })).toBeNull()
    expect(decodeLoopScopePreview({ ...response, summary: { total: 3, allowed: 1, blocked: 2 } })).toBeNull()
    expect(decodeLoopScopePreview({
      ...response,
      items: [{ path: 'src/app.ts', verdict: 'allowed', reason: 'path-denied', matched_pattern: 'src/**' }],
      summary: { total: 1, allowed: 1, blocked: 0 },
    })).toBeNull()
    const oversizedItems = Array.from({ length: 101 }, (_, index) => ({
      path: `src/${index}.ts`,
      verdict: 'allowed' as const,
      reason: 'allowlist' as const,
      matched_pattern: 'src/**',
    }))
    expect(decodeLoopScopePreview({
      ...response,
      summary: { total: 101, allowed: 101, blocked: 0 },
      items: oversizedItems,
    })).toBeNull()
    expect(decodeLoopScopePreview({
      ...response,
      autonomy_level: 'L2',
      enforced_for_unattended_merge: true,
    })).toBeNull()
  })

  it('posts the protected request and rejects malformed success payloads', async () => {
    window.__TENON_DASHBOARD_TOKEN__ = 'scope-token'
    global.fetch = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }))
    await expect(postLoopScopePreview({
      root: '/repo',
      loopId: 'release-loop',
      paths: ['src/app.ts', 'docs/guide.md'],
    })).resolves.toEqual(response)
    expect(global.fetch).toHaveBeenCalledWith('/api/loops/scope-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer scope-token' },
      body: JSON.stringify({
        root: '/repo',
        loop_id: 'release-loop',
        paths: ['src/app.ts', 'docs/guide.md'],
      }),
      signal: undefined,
    })

    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ...response, items: [] }), { status: 200 }))
    await expect(postLoopScopePreview({
      root: '/repo', loopId: 'release-loop', paths: ['src/app.ts'],
    })).rejects.toMatchObject({ kind: 'response', status: 200 })

    for (const mismatched of [
      { ...response, loop_id: 'other-loop' },
      {
        ...response,
        items: [...response.items].reverse(),
      },
    ]) {
      global.fetch = vi.fn(async () => new Response(JSON.stringify(mismatched), { status: 200 }))
      await expect(postLoopScopePreview({
        root: '/repo',
        loopId: 'release-loop',
        paths: ['src/app.ts', 'docs/guide.md'],
      })).rejects.toMatchObject({ kind: 'response', status: 200 })
    }
  })

  it('binds the response to an immutable snapshot of the request paths', async () => {
    const paths = ['src/app.ts', 'docs/guide.md']
    global.fetch = vi.fn(async () => {
      paths.reverse()
      return new Response(JSON.stringify(response), { status: 200 })
    })
    await expect(postLoopScopePreview({
      root: '/repo',
      loopId: 'release-loop',
      paths,
    })).resolves.toEqual(response)
  })

  it('maps stable server codes without exposing server-localized text', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: 'LOOP_SCOPE_REGISTRY_INVALID',
      error: '服务端中文细节',
    }), { status: 409 }))
    await expect(postLoopScopePreview({
      root: '/repo', loopId: 'release-loop', paths: ['src/app.ts'],
    })).rejects.toEqual(expect.objectContaining<Partial<LoopScopePreviewError>>({
      kind: 'registry',
      status: 409,
    }))
  })
})
