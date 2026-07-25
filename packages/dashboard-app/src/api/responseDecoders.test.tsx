import { describe, expect, it } from 'vitest'
import { decodeCadenceStatus, decodeOperationResponse, decodeRunDetail } from './responseDecoders'

describe('API response decoders (runtime boundary)', () => {
  it('rejects malformed nested run detail', () => {
    expect(decodeRunDetail({
      ok: true,
      source: 'canonical',
      projection: { status: 'ok' },
      revisions: [],
      transitions: [],
      attempt_contexts: [],
      ledger: { health: 'impossible', records: [], rejected: [] },
    })).toBeNull()
  })

  it('validates every cadence row state', () => {
    expect(decodeCadenceStatus({
      enabled: true,
      poll_interval_ms: 1000,
      generated_at: '2026-07-25T00:00:00Z',
      running: false,
      errors: [],
      loops: [{
        root: '/repo', loop_id: 'daily', cadence: 'daily', runner: 'codex',
        state: 'invented', last_finished_at: null, due_at: null,
      }],
    })).toBeNull()
  })

  it('requires the complete operation response envelope', () => {
    expect(decodeOperationResponse({ ok: true, exit_code: 0, command: [], stdout: '', stderr: '' })).toBeNull()
    expect(decodeOperationResponse({
      ok: true, exit_code: 0, command: ['pipeline'], result: null, stdout: '', stderr: '',
    })?.ok).toBe(true)
  })
})
