import { describe, expect, it } from 'vitest'
import type { ExtendedManifestData } from '../flow/manifest.js'
import type { TrackDefinition, TrackRegistry } from './types.js'
import { buildRouterProjection, encodeRouterDataCache } from './router-projection.js'

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
  it('uses every enabled registry track in declaration order; disabled tracks are absent', () => {
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
    expect(p.tracks.map((item) => ({ id: item.id, order: item.order, priority: item.priority, workflowDefault: item.workflowDefault }))).toEqual([
      { id: 'mobile', order: 0, priority: 900, workflowDefault: 'default' },
      { id: 'ops', order: 2, priority: 700, workflowDefault: 'default' },
    ])
    expect(p.tracks[1]).toMatchObject({ matrix: false, profile: 'backend' })
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

describe('router v4 data cache encoding', () => {
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
      projection,
    })

    expect(cache).toMatch(/^PIPELINE_ROUTER_V4\nM\|/)
    expect(cache).not.toContain('$(')
    expect(cache).not.toContain('`')
    expect(cache).not.toContain('/tmp/router-owned')
    expect(cache).not.toContain('/repo with spaces')
    expect(cache).toBe(encodeRouterDataCache({
      projectRoot: '/repo with spaces',
      manifestSha256: 'a'.repeat(64),
      tracksPresent: true,
      registryRevision: '0123456789abcdef',
      projection,
    }))
  })

  it('encodes exclusion patterns as the sixth routing field', () => {
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
      projection: buildRouterProjection(registry([excluded]), manifest()),
    })
    const route = cache.split('\n').find((line) => line.startsWith('R|'))
    expect(route?.split('|')[5]).toBe(Buffer.from('(API|schema)', 'utf8').toString('hex'))
  })

  it('rejects malformed cache identity metadata instead of emitting an ambiguous cache', () => {
    const projection = buildRouterProjection(registry([track({ id: 'ops' })]), manifest())
    expect(() => encodeRouterDataCache({
      projectRoot: '/repo', manifestSha256: 'not-a-sha', tracksPresent: false,
      registryRevision: '0123456789abcdef', projection,
    })).toThrow(/manifestSha256/)
    expect(() => encodeRouterDataCache({
      projectRoot: '/repo', manifestSha256: 'b'.repeat(64), tracksPresent: false,
      registryRevision: 'bad|revision', projection,
    })).toThrow(/registryRevision/)
  })
})
