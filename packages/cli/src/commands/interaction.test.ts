import { link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cmdInteraction } from './interaction.js'
import type { CliDeps } from '../deps.js'

const MAX_FIXTURES = 256

const fixtureRoot = fileURLToPath(new URL('../../../../tools/fixtures/interaction-events/v1/', import.meta.url))

function deps(output: string[], errors: string[]): CliDeps {
  return {
    io: {
      out: (line) => output.push(line),
      err: (line) => errors.push(line),
    },
  } as unknown as CliDeps
}

describe('interaction scorecard CLI', () => {
  it('emits deterministic machine JSON without fixture paths', async () => {
    const firstOutput: string[] = []
    const firstErrors: string[] = []
    const firstCode = await cmdInteraction(deps(firstOutput, firstErrors), 'scorecard', [fixtureRoot], { json: true })
    const secondOutput: string[] = []
    const secondErrors: string[] = []
    const secondCode = await cmdInteraction(deps(secondOutput, secondErrors), 'scorecard', [fixtureRoot], { json: true })

    expect(firstCode).toBe(0)
    expect(secondCode).toBe(0)
    expect(firstErrors).toEqual([])
    expect(secondErrors).toEqual([])
    expect(secondOutput).toEqual(firstOutput)
    expect(firstOutput[0]).toBeDefined()
    expect(firstOutput[0]).not.toContain(fixtureRoot)
    expect(JSON.parse(firstOutput[0] ?? '{}')).toMatchObject({
      schema: 'tenon-interaction-scorecard/v1',
      acceptedStaleDecisions: 0,
      sameStateRepeatedPrompts: 0,
    })
  })

  it('does not leak an absolute path when a fixture directory is unavailable', async () => {
    const output: string[] = []
    const errors: string[] = []
    const missing = fixtureRoot + '-missing'
    const code = await cmdInteraction(deps(output, errors), 'scorecard', [missing], { json: true })
    expect(code).toBe(1)
    expect(output).toEqual([])
    expect(errors[0]).toBe('ERROR: interaction scorecard unavailable (fixture directory unavailable)')
    expect(errors.join('\n')).not.toContain(missing)
  })

  it('rejects privacy fields with stable event-schema-invalid code', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-cli-'))
    try {
      const fixture = JSON.parse(await readFile(join(fixtureRoot, 'positive.json'), 'utf8')) as {
        readonly events: Array<Record<string, unknown>>
      }
      const first = fixture.events[0]
      if (first === undefined) throw new Error('positive fixture missing event')
      first.prompt = 'secret-token-value'
      await writeFixture(root, fixture)
      const errors: string[] = []
      expect(await cmdInteraction(deps([], errors), 'scorecard', [root], { json: true })).toBe(1)
      expect(errors.join('\n')).toContain('event-schema-invalid')
      expect(errors.join('\n')).not.toContain('secret-token-value')
      expect(errors.join('\n')).not.toContain(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects symlink and oversized fixture files without path disclosure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-cli-'))
    try {
      const fixture = JSON.parse(await readFile(join(fixtureRoot, 'positive.json'), 'utf8')) as unknown
      await writeFile(join(root, 'manifest.json'), JSON.stringify(minimalManifest()), 'utf8')
      const target = join(root, 'target.json')
      await writeFile(target, JSON.stringify(fixture), 'utf8')
      await symlink(target, join(root, 'positive.json'))
      const symlinkErrors: string[] = []
      expect(await cmdInteraction(deps([], symlinkErrors), 'scorecard', [root], { json: true })).toBe(1)
      expect(symlinkErrors.join('\n')).not.toContain(root)

      await rm(join(root, 'positive.json'))
      await writeFile(join(root, 'positive.json'), 'x'.repeat(1024 * 1024 + 1), 'utf8')
      const oversizedErrors: string[] = []
      expect(await cmdInteraction(deps([], oversizedErrors), 'scorecard', [root], { json: true })).toBe(1)
      expect(oversizedErrors.join('\n')).not.toContain(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects nested ancestor symlinks and physical fixture aliases', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-cli-'))
    const outside = await mkdtemp(join(tmpdir(), 'interaction-cli-outside-'))
    try {
      const fixture = JSON.parse(await readFile(join(fixtureRoot, 'positive.json'), 'utf8')) as unknown
      await writeFile(join(outside, 'positive.json'), JSON.stringify(fixture), 'utf8')
      await symlink(outside, join(root, 'nested'))
      const nestedManifest = minimalManifest()
      ;(nestedManifest.fixtures as Array<Record<string, unknown>>)[0] = {
        ...(nestedManifest.fixtures as Array<Record<string, unknown>>)[0],
        file: 'nested/positive.json',
      }
      await writeFile(join(root, 'manifest.json'), JSON.stringify(nestedManifest), 'utf8')
      const nestedErrors: string[] = []
      expect(await cmdInteraction(deps([], nestedErrors), 'scorecard', [root], { json: true })).toBe(1)
      expect(nestedErrors.join('\n')).not.toContain(root)

      await rm(join(root, 'nested'))
      const aliasManifest = minimalManifest()
      aliasManifest.fixtures = [
        ...(aliasManifest.fixtures as Array<Record<string, unknown>>),
        { id: 'alias', mode: 'measurement', file: 'alias.json', expected: { valid: true, diagnostics: [] } },
      ]
      const positivePath = join(root, 'positive.json')
      await writeFile(positivePath, JSON.stringify(fixture), 'utf8')
      await link(positivePath, join(root, 'alias.json'))
      await writeFile(join(root, 'manifest.json'), JSON.stringify(aliasManifest), 'utf8')
      const aliasErrors: string[] = []
      expect(await cmdInteraction(deps([], aliasErrors), 'scorecard', [root], { json: true })).toBe(1)
      expect(aliasErrors.join('\n')).not.toContain(root)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects incomplete or duplicate comparison dimensions in the manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-cli-'))
    try {
      const manifest = minimalManifest()
      const dimensions = manifest.dimensions as Record<string, unknown>
      dimensions.surface = ['cli']
      await writeFixture(root, JSON.parse(await readFile(join(fixtureRoot, 'positive.json'), 'utf8')))
      await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8')
      const incompleteErrors: string[] = []
      expect(await cmdInteraction(deps([], incompleteErrors), 'scorecard', [root], { json: true })).toBe(1)

      dimensions.surface = ['plugin-chat', 'cli', 'api-sse', 'dashboard', 'dashboard']
      await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8')
      const duplicateErrors: string[] = []
      expect(await cmdInteraction(deps([], duplicateErrors), 'scorecard', [root], { json: true })).toBe(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects unsafe fixture ids and excessive manifest fixture counts without echoing input', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-cli-'))
    try {
      const fixture = JSON.parse(await readFile(join(fixtureRoot, 'positive.json'), 'utf8')) as unknown
      await writeFixture(root, fixture)
      const manifest = minimalManifest()
      const entries = manifest.fixtures as Array<Record<string, unknown>>
      entries[0] = { ...entries[0], id: 'unsafe fixture id with secret' }
      await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8')
      const unsafeErrors: string[] = []
      expect(await cmdInteraction(deps([], unsafeErrors), 'scorecard', [root], { json: true })).toBe(1)
      expect(unsafeErrors.join('\n')).toContain('manifest fixture id invalid')
      expect(unsafeErrors.join('\n')).not.toContain('unsafe fixture id with secret')
      expect(unsafeErrors.join('\n')).not.toContain(root)

      manifest.fixtures = Array.from({ length: MAX_FIXTURES + 1 }, (_, index) => ({
        id: `fixture-${index}`,
        mode: 'measurement',
        file: `fixture-${index}.json`,
        expected: { valid: true, diagnostics: [] },
      }))
      await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8')
      const countErrors: string[] = []
      expect(await cmdInteraction(deps([], countErrors), 'scorecard', [root], { json: true })).toBe(1)
      expect(countErrors.join('\n')).toContain('manifest fixtures limit exceeded')
      expect(countErrors.join('\n')).not.toContain(root)
      expect(countErrors.join('\n')).not.toContain('fixture-256')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function minimalManifest(): Record<string, unknown> {
  return {
    schema: 'tenon-interaction-event/v1',
    dimensions: {
      executionMode: ['interactive', 'afk'], workflowMode: ['default', 'custom'],
      trackKind: ['built-in', 'free', 'custom'], pipelineStage: ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive', 'custom'],
      controlStage: ['assessment', 'admission', 'execution', 'verification', 'correction', 'revalidation', 'exact-resume'],
      surface: ['plugin-chat', 'cli', 'api-sse', 'dashboard'],
    },
    fixtures: [{ id: 'positive', mode: 'measurement', file: 'positive.json', expected: { valid: true, diagnostics: [] } }],
  }
}

async function writeFixture(root: string, fixture: unknown): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'manifest.json'), JSON.stringify(minimalManifest()), 'utf8')
  await writeFile(join(root, 'positive.json'), JSON.stringify(fixture), 'utf8')
}
