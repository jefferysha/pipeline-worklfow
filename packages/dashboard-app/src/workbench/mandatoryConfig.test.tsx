import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearMandatoryConfig,
  invalidateMandatoryConfig,
  loadMandatoryConfig,
  mergeMandatoryConfigCell,
  peekMandatoryConfig,
} from './mandatoryConfig'

const ROOT = '/repo'

function configResponse(revision: string): Response {
  return new Response(JSON.stringify({
    ok: true,
    generated_at: '2026-08-03T00:00:00.000Z',
    revision,
    source: 'project-file',
    mandatory_skills: { 'build.pm': [] },
    mandatory_skills_writable_profiles: ['pm'],
    tracks: [{
      id: 'pm',
      label: 'PM',
      builtin: true,
      workflow: { default: 'default', allowed: '*' },
      policyProfile: {
        reviewSeed: 'pending',
        automationEligible: true,
        coverageProfile: 'pm',
        routing: { enabled: false },
        skills: { matrix: true, profile: 'pm' },
      },
    }],
  }), { status: 200 })
}

describe('mandatory config refresh concurrency', () => {
  const originalFetch = global.fetch

  beforeEach(() => invalidateMandatoryConfig())
  afterEach(() => {
    global.fetch = originalFetch
    invalidateMandatoryConfig()
  })

  it('prevents a superseded response from replacing or detaching the current refresh', async () => {
    const releases: Array<(response: Response) => void> = []
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => releases.push(resolve))) as typeof fetch

    const superseded = loadMandatoryConfig(ROOT)
    clearMandatoryConfig(ROOT)
    const current = loadMandatoryConfig(ROOT)
    expect(global.fetch).toHaveBeenCalledTimes(2)

    releases[0](configResponse('revision-old'))
    await superseded

    const joined = loadMandatoryConfig(ROOT)
    expect(joined).toBe(current)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(peekMandatoryConfig(ROOT)).toBeNull()

    releases[1](configResponse('revision-new'))
    await current
    expect((await joined).revision).toBe('revision-new')
    expect(peekMandatoryConfig(ROOT)?.revision).toBe('revision-new')
  })

  it('retries a partial cell merge when a newer full-config generation starts while it waits', async () => {
    const releases: Array<(response: Response) => void> = []
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => releases.push(resolve))) as typeof fetch

    const initialRequest = loadMandatoryConfig(ROOT)
    releases[0](configResponse('revision-initial'))
    const fallback = await initialRequest

    clearMandatoryConfig(ROOT)
    const superseded = loadMandatoryConfig(ROOT)
    const merged = mergeMandatoryConfigCell(ROOT, 'build.pm', ['written-skill'], fallback)
    clearMandatoryConfig(ROOT)
    const current = loadMandatoryConfig(ROOT)

    releases[1](configResponse('revision-superseded'))
    await superseded
    releases[2](configResponse('revision-current'))
    await current

    expect(await merged).toMatchObject({
      revision: 'revision-current',
      table: { 'build.pm': ['written-skill'] },
    })
    expect(peekMandatoryConfig(ROOT)?.revision).toBe('revision-current')
  })
})
