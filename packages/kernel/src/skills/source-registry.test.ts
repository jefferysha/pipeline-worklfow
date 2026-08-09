import { describe, expect, it } from 'vitest'
import {
  parseSkillProvenanceRegistry,
  SkillProvenanceRegistryError,
} from './source-registry.js'

const DIGEST = 'a'.repeat(64)

function fixture(overrides = ''): string {
  return [
    'version: 3',
    'hash_algorithm: tree-sha256-v1',
    'skills:',
    `  demo: { tool: bundled, source: tenon, content_skill: demo, tier: mandatory, official: true, source_kind: bundled, source_ref: skills/demo, content_hash: sha256:${DIGEST}, coordinate: tenon:skills/demo@sha256:${DIGEST} }`,
    overrides,
  ].filter(Boolean).join('\n') + '\n'
}

describe('parseSkillProvenanceRegistry', () => {
  it('parses strict v3 bundled provenance', () => {
    const parsed = parseSkillProvenanceRegistry(fixture())
    expect(parsed.version).toBe(3)
    expect(parsed.hashAlgorithm).toBe('tree-sha256-v1')
    expect(parsed.skills[0]).toMatchObject({
      token: 'demo',
      sourceKind: 'bundled',
      sourceRef: 'skills/demo',
      contentHash: `sha256:${DIGEST}`,
      coordinate: `tenon:skills/demo@sha256:${DIGEST}`,
    })
  })

  it.each([
    ['version: 2', 'unsupported-registry-version'],
    ['source_kind: mystery', 'unknown-source-kind'],
    ['source_ref: ../escape', 'invalid-source-ref'],
    ['content_hash: sha256:not-a-digest', 'content-hash-mismatch'],
    ['coordinate: tenon:skills/other@sha256:' + DIGEST, 'coordinate-mismatch'],
  ])('rejects %s with %s', (replacement, category) => {
    const raw = fixture().replace(
      replacement.startsWith('version:') ? 'version: 3' : replacement.startsWith('source_kind:') ? 'source_kind: bundled' : replacement.startsWith('source_ref:') ? 'source_ref: skills/demo' : replacement.startsWith('content_hash:') ? `content_hash: sha256:${DIGEST}` : `coordinate: tenon:skills/demo@sha256:${DIGEST}`,
      replacement,
    )
    expect(() => parseSkillProvenanceRegistry(raw)).toThrow(SkillProvenanceRegistryError)
    try {
      parseSkillProvenanceRegistry(raw)
    } catch (error) {
      expect((error as SkillProvenanceRegistryError).category).toBe(category)
    }
  })

  it('rejects duplicate physical source refs', () => {
    const raw = fixture() + `  other: { tool: bundled, source: tenon, content_skill: demo, tier: optional, official: true, source_kind: bundled, source_ref: skills/demo, content_hash: sha256:${DIGEST}, coordinate: tenon:skills/demo@sha256:${DIGEST} }\n`
    expect(() => parseSkillProvenanceRegistry(raw)).toThrow(/duplicate-distributed-source/)
  })
})
