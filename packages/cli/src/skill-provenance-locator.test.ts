import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildCanonicalManifest } from '@tenon/automation'
import {
  createProvenanceAwareBundledLocator,
  SkillProvenanceLocatorError,
} from './skill-provenance-locator.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRoot(): Promise<{ root: string; digest: string }> {
  const root = await mkdtemp(join(tmpdir(), 'provenance-locator-'))
  roots.push(root)
  const skill = join(root, 'skills', 'demo')
  await mkdir(skill, { recursive: true })
  await mkdir(join(root, 'templates'), { recursive: true })
  await writeFile(join(skill, 'SKILL.md'), '# demo\n', 'utf8')
  const manifest = await buildCanonicalManifest('demo', skill)
  const digest = `sha256:${manifest.treeSha256}`
  await writeFile(join(root, 'templates', 'skill-sources.yaml'), [
    'version: 3',
    'hash_algorithm: tree-sha256-v1',
    'skills:',
    `  logical: { tool: bundled, source: tenon, content_skill: demo, tier: mandatory, official: true, source_kind: bundled, source_ref: skills/demo, content_hash: ${digest}, coordinate: tenon:skills/demo@${digest} }`,
    '',
  ].join('\n'), 'utf8')
  return { root, digest }
}

describe('createProvenanceAwareBundledLocator', () => {
  it('returns only hash-verified bundled content and preserves logical token', async () => {
    const { root } = await makeRoot()
    const result = await createProvenanceAwareBundledLocator(root).locate('logical')
    expect(result.skillId).toBe('logical')
    expect(result.contentDir).toContain(join('skills', 'demo'))
  })

  it('rejects drift instead of falling back to a lower tier', async () => {
    const { root } = await makeRoot()
    await writeFile(join(root, 'skills', 'demo', 'SKILL.md'), '# drift\n', 'utf8')
    await expect(createProvenanceAwareBundledLocator(root).locate('logical')).rejects.toMatchObject({
      category: 'content-hash-mismatch',
    } satisfies Partial<SkillProvenanceLocatorError>)
  })

  it('rejects an existing undeclared bundled tree', async () => {
    const { root } = await makeRoot()
    await mkdir(join(root, 'skills', 'extra'), { recursive: true })
    await writeFile(join(root, 'skills', 'extra', 'SKILL.md'), '# extra\n', 'utf8')
    await expect(createProvenanceAwareBundledLocator(root).locate('extra')).rejects.toMatchObject({
      category: 'unregistered-distributed-skill',
    } satisfies Partial<SkillProvenanceLocatorError>)
  })
})
