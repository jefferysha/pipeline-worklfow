import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdInternalSkillProvenance } from './internal-skill-provenance.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cli-skill-provenance-'))
  roots.push(root)
  await mkdir(join(root, 'skills', 'demo'), { recursive: true })
  await mkdir(join(root, 'templates'), { recursive: true })
  await writeFile(join(root, 'skills', 'demo', 'SKILL.md'), '# demo\n', 'utf8')
  await writeFile(join(root, 'templates', 'skill-sources.yaml'), [
    'version: 2',
    'skills:',
    '  demo: { tool: bundled, source: tenon, content_skill: demo, tier: mandatory, official: true }',
    '',
  ].join('\n'), 'utf8')
  return root
}

describe('cmdInternalSkillProvenance', () => {
  it('syncs atomically then verifies clean root', async () => {
    const root = await makeRoot()
    const deps = makeDeps()
    expect(await cmdInternalSkillProvenance(deps, 'sync', { root, quiet: true })).toBe(0)
    expect(deps.outLines).toEqual([])
    const quietJsonDeps = makeDeps()
    expect(await cmdInternalSkillProvenance(quietJsonDeps, 'sync', { root, json: true, quiet: true })).toBe(0)
    expect(quietJsonDeps.outLines).toEqual([])
    const registry = await readFile(join(root, 'templates', 'skill-sources.yaml'), 'utf8')
    expect(registry).toContain('version: 3')
    expect(registry).toContain('content_hash: sha256:')
    expect(await cmdInternalSkillProvenance(deps, 'verify', { root, quiet: true })).toBe(0)
  })

  it('returns non-zero and actionable category on drift', async () => {
    const root = await makeRoot()
    const deps = makeDeps()
    await cmdInternalSkillProvenance(deps, 'sync', { root, quiet: true })
    await writeFile(join(root, 'skills', 'demo', 'SKILL.md'), '# drift\n', 'utf8')
    expect(await cmdInternalSkillProvenance(deps, 'verify', { root })).toBe(1)
    expect(deps.errLines.join('\n')).toContain('content-hash-mismatch')
  })

  it('rejects a registry path that escapes the explicit root through a symlink', async () => {
    const root = await makeRoot()
    const outside = await mkdtemp(join(tmpdir(), 'cli-skill-provenance-outside-'))
    roots.push(outside)
    const registry = await readFile(join(root, 'templates', 'skill-sources.yaml'), 'utf8')
    await rm(join(root, 'templates'), { recursive: true, force: true })
    await mkdir(outside, { recursive: true })
    await writeFile(join(outside, 'skill-sources.yaml'), registry, 'utf8')
    await symlink(outside, join(root, 'templates'))

    const deps = makeDeps()
    expect(await cmdInternalSkillProvenance(deps, 'sync', { root, quiet: true })).toBe(1)
    expect(deps.errLines.join('\n')).toMatch(/root|symlink|registry/i)
  })

  it('does not partially rewrite the registry when a later Skill cannot be hashed', async () => {
    const root = await makeRoot()
    const path = join(root, 'templates', 'skill-sources.yaml')
    const before = await readFile(path, 'utf8')
    const broken = `${before}  missing: { tool: bundled, source: tenon, tier: mandatory, official: true }\n`
    await writeFile(path, broken, 'utf8')

    const deps = makeDeps()
    expect(await cmdInternalSkillProvenance(deps, 'sync', { root, quiet: true })).toBe(1)
    expect(await readFile(path, 'utf8')).toBe(broken)
  })
})
