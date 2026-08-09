import { describe, expect, it } from 'vitest'
import {
  assessBuildRevisionTrust,
  createBuildRevisionToken,
  parseBuildRevisionToken,
  safeRevisionHash,
} from './build-revision.js'

const identity = { repository: '/repo.git', worktree: '/repo\0/repo.git/worktrees/change' }
const revision = 'a'.repeat(40)
const token = createBuildRevisionToken('git', revision, identity)
const stateHash = safeRevisionHash({ phase: 'verify', build_sha: token.value })

function request(overrides: Partial<Parameters<typeof assessBuildRevisionTrust>[0]> = {}) {
  return {
    buildSha: token.value,
    isolation: 'branch',
    expectedStep: 'verify',
    stateHash,
    observe: async () => ({ kind: 'git' as const, revision, identity }),
    provenance: async () => ({
      currentStep: 'verify',
      stateHash,
      stateBuildSha: token.value,
      recordTo: 'verify',
      buildShaEffects: [token.value],
    }),
    ...overrides,
  }
}

describe('build:v1 trustworthy revision boundary', () => {
  it('creates a deterministic token without exposing physical identity', () => {
    const again = createBuildRevisionToken('git', revision, identity)
    expect(again).toEqual(token)
    expect(token.value).toMatch(/^build:v1:git:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/)
    expect(token.value).not.toContain('/repo')
    expect(parseBuildRevisionToken(token.value)).toEqual(token)
    expect(parseBuildRevisionToken(` ${token.value}`)).toBeUndefined()
  })

  it('accepts one fresh token with matching physical identity and provenance', async () => {
    await expect(assessBuildRevisionTrust(request())).resolves.toEqual({ trusted: true, token })
  })

  it.each([
    ['missing', undefined, 'missing'],
    ['null', null, 'null'],
    ['ambiguous', [token.value], 'ambiguous'],
    ['legacy bare sha', revision, 'malformed'],
    ['malformed token', 'build:v1:git:bad', 'malformed'],
  ])('%s never becomes a skipped success', async (_label, buildSha, reason) => {
    const result = await assessBuildRevisionTrust(request({ buildSha }))
    expect(result).toMatchObject({ trusted: false, blocker: { code: 'verify-build-revision-untrusted', reason } })
  })

  it.each([
    ['revision drift', { observe: async () => ({ kind: 'git' as const, revision: 'b'.repeat(40), identity }) }, 'revision-stale'],
    ['project drift', { observe: async () => ({ kind: 'git' as const, revision, identity: { ...identity, repository: '/other.git' } }) }, 'project-mismatch'],
    ['worktree drift', { observe: async () => ({ kind: 'git' as const, revision, identity: { ...identity, worktree: '/other\0/worktree' } }) }, 'worktree-mismatch'],
    ['missing provenance', { provenance: async () => undefined }, 'provenance-missing'],
    ['stale state', { provenance: async () => ({ ...request().provenance ? await request().provenance!() : undefined, stateHash: safeRevisionHash({ phase: 'build' }) }) }, 'state-stale'],
  ])('%s is a stable blocker', async (_label, overrides, reason) => {
    const result = await assessBuildRevisionTrust(request(overrides as never))
    expect(result).toMatchObject({ trusted: false, blocker: { code: 'verify-build-revision-untrusted', reason } })
  })

  it.each([
    ['wrong current step', { currentStep: 'build' }],
    ['wrong record target', { recordTo: 'ship' }],
    ['state build_sha mismatch', { stateBuildSha: `${token.value}-other` }],
    ['zero build_sha effects', { buildShaEffects: [] }],
    ['multiple build_sha effects', { buildShaEffects: [token.value, token.value] }],
    ['wrong build_sha effect', { buildShaEffects: ['build:v1:git:spoofed'] }],
  ] as const)('%s cannot satisfy the validated transition provenance', async (_label, patch) => {
    const result = await assessBuildRevisionTrust(request({
      provenance: async () => ({
        currentStep: patch.currentStep ?? 'verify',
        stateHash,
        stateBuildSha: patch.stateBuildSha ?? token.value,
        recordTo: patch.recordTo ?? 'verify',
        buildShaEffects: patch.buildShaEffects ?? [token.value],
      }),
    }))
    expect(result).toMatchObject({
      trusted: false,
      blocker: { code: 'verify-build-revision-untrusted', reason: 'provenance-mismatch' },
    })
    expect(JSON.stringify(result)).not.toMatch(/build:v1|\/repo|other/)
  })

  it.each([
    ['provenance throws', async () => { throw new Error('/private/provenance/path') }],
    ['provenance returns undefined', async () => undefined],
  ] as const)('%s is closed without leaking provenance details', async (_label, provenance) => {
    const result = await assessBuildRevisionTrust(request({ provenance }))
    expect(result).toMatchObject({
      trusted: false,
      blocker: {
        code: 'verify-build-revision-untrusted',
        reason: _label === 'provenance throws' ? 'provenance-mismatch' : 'provenance-missing',
      },
    })
    expect(JSON.stringify(result)).not.toContain('/private/provenance/path')
  })

  it('maps observer failures to privacy-safe evaluation errors', async () => {
    const result = await assessBuildRevisionTrust(request({ observe: async () => { throw new Error('/secret/path') } }))
    expect(result).toMatchObject({ trusted: false, blocker: { reason: 'evaluation-error' } })
    expect(JSON.stringify(result)).not.toContain('/secret/path')
  })
})
