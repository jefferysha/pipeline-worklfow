import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  VerificationEvidenceApiError,
  postVerificationEvidenceCompose,
} from './verificationEvidenceClient'

beforeEach(() => {
  window.__TENON_DASHBOARD_TOKEN__ = 'tok-evidence'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('postVerificationEvidenceCompose', () => {
  it('sends the protected fullstack contract and decodes a valid draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      markdown: '# Verification evidence draft',
      entryCount: 1,
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const input = {
      root: '/repo',
      locale: 'en' as const,
      entries: [{
        kind: 'command' as const,
        title: 'Unit tests',
        status: 'passed' as const,
        command: 'npm test',
        result: '42 tests passed',
      }],
    }
    await expect(postVerificationEvidenceCompose(input)).resolves.toEqual({
      markdown: '# Verification evidence draft',
      entryCount: 1,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/verification-evidence/compose', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-evidence',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
  })

  it('preserves structured validation paths without exposing server prose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: 'verification_evidence_invalid',
      error: 'untrusted server prose',
      details: [{ code: 'field_required', path: 'entries[0].result' }],
      overflow: false,
    }), { status: 400 })))

    const error = await postVerificationEvidenceCompose({
      root: '/repo',
      locale: 'en',
      entries: [],
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(VerificationEvidenceApiError)
    expect(error).toMatchObject({
      status: 400,
      details: [{ code: 'field_required', path: 'entries[0].result' }],
      overflow: false,
    })
    expect((error as Error).message).not.toContain('untrusted server prose')
  })

  it('rejects malformed success envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      markdown: 42,
      entryCount: 0,
    }), { status: 200 })))

    await expect(postVerificationEvidenceCompose({
      root: '/repo',
      locale: 'zh-CN',
      entries: [{ kind: 'browser', title: '验收', status: 'skipped', skipReason: '未启动' }],
    })).rejects.toThrow('verification evidence response is invalid')
  })

  it('normalizes network failures to a stable API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(postVerificationEvidenceCompose({
      root: '/repo',
      locale: 'en',
      entries: [{ kind: 'review', title: 'Review', status: 'passed', result: 'No findings' }],
    })).rejects.toThrow('offline')
  })
})
