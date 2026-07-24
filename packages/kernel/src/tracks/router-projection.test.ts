import { describe, expect, it } from 'vitest'
import type { ExtendedManifestData } from '../flow/manifest.js'
import type { TrackDefinition, TrackRegistry } from './types.js'
import { buildRouterProjection, effectiveRouterRevision, encodeRouterDataCache } from './router-projection.js'

function track(input: Partial<TrackDefinition> & Pick<TrackDefinition, 'id'>): TrackDefinition {
  return {
    id: input.id,
    label: input.label ?? input.id,
    builtin: input.builtin ?? false,
    workflow: input.workflow ?? { default: 'default', allowed: '*' },
    policyProfile: input.policyProfile ?? {
      reviewSeed: 'pending',
      automationEligible: true,
      coverageProfile: 'backend',
      routing: { enabled: true, pattern: input.id, priority: 10 },
      skills: { matrix: true, profile: 'backend' },
    },
  }
}

function registry(ordered: readonly TrackDefinition[]): TrackRegistry {
  return {
    ordered,
    byId: new Map(ordered.map((item) => [item.id, item])),
    revision: '0123456789abcdef',
    source: 'project-file',
  }
}

function manifest(): ExtendedManifestData {
  return {
    phases: ['open', 'build'],
    transitions: { open: ['build'], build: [] },
    reviewPhases: [],
    mandatorySkills: {
      open: { _all: ['shared'] },
      build: { backend: ['be-mandatory'], _all: ['fallback-mandatory'] },
    },
    recommendedSkills: {
      open: {},
      build: { backend: ['be-recommended'] },
    },
    breadcrumbs: { open: 'open now', build: 'build now' },
  } as ExtendedManifestData
}

describe('dynamic track router projection', () => {
  it('changes the cache revision when an effective builtin changes without a project revision change', () => {
    const first = buildRouterProjection(registry([track({ id: 'free', builtin: true })]), manifest())
    const changed = buildRouterProjection(
      registry([track({ id: 'free', builtin: true, label: 'Neutral' })]),
      manifest(),
    )
    expect(effectiveRouterRevision('0123456789abcdef', first)).toMatch(/^[a-f0-9]{64}$/)
    expect(effectiveRouterRevision('0123456789abcdef', changed))
      .not.toBe(effectiveRouterRevision('0123456789abcdef', first))
  })

  it('carries every registry track in declaration order and marks disabled tracks as manual-only candidates', () => {
    const r = registry([
      track({ id: 'mobile', policyProfile: {
        reviewSeed: 'pending', automationEligible: true, coverageProfile: 'frontend',
        routing: {
          enabled: true,
          pattern: '(swift|kotlin)',
          excludePattern: '(API|schema)',
          priority: 900,
        },
        skills: { matrix: true, profile: 'frontend' },
      } }),
      track({ id: 'silent', policyProfile: {
        reviewSeed: 'pending', automationEligible: true, coverageProfile: 'none',
        routing: { enabled: false }, skills: { matrix: false, profile: '_all' },
      } }),
      track({ id: 'ops', policyProfile: {
        reviewSeed: 'pending', automationEligible: true, coverageProfile: 'backend',
        routing: { enabled: true, pattern: '(deploy|incident)', priority: 700 },
        skills: { matrix: false, profile: 'backend' },
      } }),
    ])

    const p = buildRouterProjection(r, manifest())
    expect(p.tracks.map((item) => ({
      id: item.id,
      order: item.order,
      routable: item.routable,
      priority: item.priority,
      workflowDefault: item.workflowDefault,
    }))).toEqual([
      { id: 'mobile', order: 0, routable: true, priority: 900, workflowDefault: 'default' },
      { id: 'silent', order: 1, routable: false, priority: 0, workflowDefault: 'default' },
      { id: 'ops', order: 2, routable: true, priority: 700, workflowDefault: 'default' },
    ])
    expect(p.tracks[1]).toMatchObject({ matrix: false, profile: '_all' })
    expect(p.tracks[1]).not.toHaveProperty('pattern')
    expect(p.tracks[0]?.excludePattern).toBe('(API|schema)')
  })

  it('resolves skills by profile then _all then empty, never by dynamic track id', () => {
    const r = registry([track({ id: 'ops' })])
    const p = buildRouterProjection(r, manifest())
    expect(p.skills).toEqual([
      { phase: 'open', profile: 'backend', mandatory: ['shared'], recommended: [], mandatorySource: '_all', recommendedSource: 'empty' },
      { phase: 'build', profile: 'backend', mandatory: ['be-mandatory'], recommended: ['be-recommended'], mandatorySource: 'profile', recommendedSource: 'profile' },
    ])
  })

  it('uses effective registry as the sole routing source', () => {
    const hostileLegacyManifest = {
      ...manifest(),
      routerPatterns: { frontend: 'poison-fe', backend: 'poison-be', pm: 'poison-pm' },
    } as unknown as ExtendedManifestData
    const p = buildRouterProjection(registry([track({ id: 'ops' })]), hostileLegacyManifest)
    expect(p.tracks[0]?.pattern).toBe('ops')
    expect(p.tracks.map((item) => item.pattern)).not.toContain('poison-be')
  })

  it('preserves the validated Track default workflow for normal-chat selection', () => {
    const p = buildRouterProjection(registry([
      track({ id: 'adoption', workflow: { default: 'pet-adoption', allowed: ['pet-adoption'] } }),
    ]), manifest())
    expect(p.tracks[0]).toMatchObject({ id: 'adoption', workflowDefault: 'pet-adoption' })
  })
})

describe('router v5 data cache encoding', () => {
  it('is deterministic data-only hex: hostile shell text never appears executable or raw', () => {
    const hostile = track({ id: 'safe-id', policyProfile: {
      reviewSeed: 'pending', automationEligible: true, coverageProfile: 'backend',
      routing: { enabled: true, pattern: "'$(touch /tmp/router-owned)`echo pwn`|x", priority: 3 },
      skills: { matrix: true, profile: 'backend' },
    } })
    const m = manifest()
    const poisoned = { ...m, breadcrumbs: { ...m.breadcrumbs, build: '$(touch /tmp/breadcrumb-owned)' } }
    const projection = buildRouterProjection(registry([hostile]), poisoned)
    const cache = encodeRouterDataCache({
      projectRoot: '/repo with spaces',
      manifestSha256: 'a'.repeat(64),
      tracksPresent: true,
      registryRevision: '0123456789abcdef',
      contractRevision: 'b'.repeat(64),
      projection,
    })

    expect(cache).toMatch(/^PIPELINE_ROUTER_V5\nM\|/)
    expect(cache).not.toContain('$(')
    expect(cache).not.toContain('`')
    expect(cache).not.toContain('/tmp/router-owned')
    expect(cache).not.toContain('/repo with spaces')
    expect(cache).toBe(encodeRouterDataCache({
      projectRoot: '/repo with spaces',
      manifestSha256: 'a'.repeat(64),
      tracksPresent: true,
      registryRevision: '0123456789abcdef',
      contractRevision: 'b'.repeat(64),
      projection,
    }))
  })

  it('encodes routability before pattern fields so disabled rows cannot be guessed as enabled', () => {
    const excluded = track({ id: 'simple', policyProfile: {
      reviewSeed: 'skipped', automationEligible: false, coverageProfile: 'none',
      routing: { enabled: true, pattern: '(typo|copy)', excludePattern: '(API|schema)', priority: 1000 },
      skills: { matrix: false, profile: '_all' },
    } })
    const cache = encodeRouterDataCache({
      projectRoot: '/repo',
      manifestSha256: 'c'.repeat(64),
      tracksPresent: false,
      registryRevision: '0123456789abcdef',
      contractRevision: 'b'.repeat(64),
      projection: buildRouterProjection(registry([excluded]), manifest()),
    })
    const route = cache.split('\n').find((line) => line.startsWith('R|'))
    expect(route?.split('|')[4]).toBe('1')
    expect(route?.split('|')[6]).toBe(Buffer.from('(API|schema)', 'utf8').toString('hex'))

    const disabled = track({
      id: 'free',
      policyProfile: {
        reviewSeed: 'pending',
        automationEligible: false,
        coverageProfile: 'none',
        routing: { enabled: false },
        skills: { matrix: false, profile: '_all' },
      },
    })
    const disabledCache = encodeRouterDataCache({
      projectRoot: '/repo',
      manifestSha256: 'd'.repeat(64),
      tracksPresent: false,
      registryRevision: '0123456789abcdef',
      contractRevision: 'b'.repeat(64),
      projection: buildRouterProjection(registry([disabled]), manifest()),
    })
    const disabledRoute = disabledCache.split('\n').find((line) => line.startsWith('R|'))
    expect(disabledRoute?.split('|').slice(4, 7)).toEqual(['0', '', ''])
  })

  it('rejects malformed cache identity metadata instead of emitting an ambiguous cache', () => {
    const projection = buildRouterProjection(registry([track({ id: 'ops' })]), manifest())
    expect(() => encodeRouterDataCache({
      projectRoot: '/repo', manifestSha256: 'not-a-sha', tracksPresent: false,
      registryRevision: '0123456789abcdef', contractRevision: 'b'.repeat(64), projection,
    })).toThrow(/manifestSha256/)
    expect(() => encodeRouterDataCache({
      projectRoot: '/repo', manifestSha256: 'b'.repeat(64), tracksPresent: false,
      registryRevision: 'bad|revision', contractRevision: 'b'.repeat(64), projection,
    })).toThrow(/registryRevision/)
    expect(() => encodeRouterDataCache({
      projectRoot: '/repo', manifestSha256: 'b'.repeat(64), tracksPresent: false,
      registryRevision: '0123456789abcdef', contractRevision: 'bad-contract', projection,
    })).toThrow(/contractRevision/)
  })
})
