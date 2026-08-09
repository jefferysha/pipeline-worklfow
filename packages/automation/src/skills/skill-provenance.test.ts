import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildCanonicalManifest } from './snapshot-manifest.js'
import {
  SKILL_PROVENANCE_ERROR_CATEGORIES,
  verifySkillProvenance,
  type SkillProvenanceVerificationResult,
} from './skill-provenance.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRoot(): Promise<{ root: string; digest: string }> {
  const root = await mkdtemp(join(tmpdir(), 'skill-provenance-'))
  roots.push(root)
  await mkdir(join(root, 'skills', 'demo'), { recursive: true })
  await writeFile(join(root, 'skills', 'demo', 'SKILL.md'), '# demo\n', 'utf8')
  const manifest = await buildCanonicalManifest('demo', join(root, 'skills', 'demo'))
  const digest = `sha256:${manifest.treeSha256}`
  await mkdir(join(root, 'templates'), { recursive: true })
  await writeFile(join(root, 'templates', 'skill-sources.yaml'), [
    'version: 3',
    'hash_algorithm: tree-sha256-v1',
    'skills:',
    `  demo: { tool: bundled, source: tenon, content_skill: demo, tier: mandatory, official: true, source_kind: bundled, source_ref: skills/demo, content_hash: ${digest}, coordinate: tenon:skills/demo@${digest} }`,
    '',
  ].join('\n'), 'utf8')
  return { root, digest }
}

describe('verifySkillProvenance', () => {
  it('accepts a clean root and detects content drift', async () => {
    const { root } = await makeRoot()
    const clean = await verifySkillProvenance(root)
    expect(clean.ok).toBe(true)
    await writeFile(join(root, 'skills', 'demo', 'SKILL.md'), '# drift\n', 'utf8')
    const drift = await verifySkillProvenance(root)
    expect(drift.ok).toBe(false)
    expect(drift.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'content-hash-mismatch', skill: 'demo' }),
    ]))
  })

  it('treats executable-bit drift as a content-hash mismatch', async () => {
    const { root } = await makeRoot()
    await chmod(join(root, 'skills', 'demo', 'SKILL.md'), 0o755)
    const result = await verifySkillProvenance(root)
    expect(result.ok).toBe(false)
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'content-hash-mismatch',
        skill: 'demo',
        expected: expect.stringMatching(/^sha256:/),
        actual: expect.stringMatching(/^sha256:/),
      }),
    ]))
  })

  it('rejects a reintroduced legacy lock', async () => {
    const { root } = await makeRoot()
    await writeFile(join(root, 'skills-lock.json'), '{}', 'utf8')
    const result: SkillProvenanceVerificationResult = await verifySkillProvenance(root)
    expect(result.ok).toBe(false)
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'legacy-provenance-source' }),
    ]))
  })

  it('has a deterministic failing fixture for every declared drift category', async () => {
    const fixtures: Record<string, () => Promise<string>> = {
      'unsupported-registry-version': async () => {
        const { root } = await makeRoot()
        const path = join(root, 'templates', 'skill-sources.yaml')
        const raw = await readFile(path, 'utf8')
        await writeFile(path, raw.replace('version: 3', 'version: 2'), 'utf8')
        return root
      },
      'unknown-source-kind': async () => {
        const { root } = await makeRoot()
        const path = join(root, 'templates', 'skill-sources.yaml')
        const raw = await readFile(path, 'utf8')
        await writeFile(path, raw.replace('source_kind: bundled', 'source_kind: mystery'), 'utf8')
        return root
      },
      'invalid-source-ref': async () => {
        const { root } = await makeRoot()
        const path = join(root, 'templates', 'skill-sources.yaml')
        const raw = await readFile(path, 'utf8')
        await writeFile(path, raw.replace('source_ref: skills/demo', 'source_ref: ../escape'), 'utf8')
        return root
      },
      'missing-distributed-skill': async () => {
        const { root } = await makeRoot()
        await rm(join(root, 'skills', 'demo'), { recursive: true, force: true })
        return root
      },
      'unregistered-distributed-skill': async () => {
        const { root } = await makeRoot()
        await mkdir(join(root, 'skills', 'extra'), { recursive: true })
        await writeFile(join(root, 'skills', 'extra', 'SKILL.md'), '# extra\n', 'utf8')
        return root
      },
      'duplicate-distributed-source': async () => {
        const { root, digest } = await makeRoot()
        await writeFile(join(root, 'templates', 'skill-sources.yaml'), [
          'version: 3', 'hash_algorithm: tree-sha256-v1', 'skills:',
          `  demo: { tool: bundled, source: tenon, content_skill: demo, tier: mandatory, official: true, source_kind: bundled, source_ref: skills/demo, content_hash: ${digest}, coordinate: tenon:skills/demo@${digest} }`,
          `  duplicate: { tool: bundled, source: tenon, content_skill: demo, tier: optional, official: true, source_kind: bundled, source_ref: skills/demo, content_hash: ${digest}, coordinate: tenon:skills/demo@${digest} }`,
          '',
        ].join('\n'), 'utf8')
        return root
      },
      'content-hash-mismatch': async () => {
        const { root } = await makeRoot()
        await chmod(join(root, 'skills', 'demo', 'SKILL.md'), 0o755)
        return root
      },
      'coordinate-mismatch': async () => {
        const { root } = await makeRoot()
        const path = join(root, 'templates', 'skill-sources.yaml')
        const raw = await readFile(path, 'utf8')
        await writeFile(path, raw.replace('coordinate: tenon:skills/demo@', 'coordinate: tenon:skills/other@'), 'utf8')
        return root
      },
      'legacy-provenance-source': async () => {
        const { root } = await makeRoot()
        await writeFile(join(root, 'skills-lock.json'), '{}', 'utf8')
        return root
      },
    }
    expect(Object.keys(fixtures).sort()).toEqual([...SKILL_PROVENANCE_ERROR_CATEGORIES].sort())
    for (const category of SKILL_PROVENANCE_ERROR_CATEGORIES) {
      const root = await fixtures[category]!()
      const result = await verifySkillProvenance(root)
      expect(result.ok, category).toBe(false)
      expect(result.findings.some((item) => item.category === category), category).toBe(true)
    }
  })
})
