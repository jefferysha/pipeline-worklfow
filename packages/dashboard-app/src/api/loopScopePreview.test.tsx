import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeLoopScopePreview, postLoopScopePreview } from './loopScopePreview'

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
    })

    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ...response, items: [] }), { status: 200 }))
    await expect(postLoopScopePreview({
      root: '/repo', loopId: 'release-loop', paths: ['src/app.ts'],
    })).rejects.toThrow(/响应形状无效/)
  })
})
