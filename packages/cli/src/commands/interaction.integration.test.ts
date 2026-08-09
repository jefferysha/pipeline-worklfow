import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { freshHarness } from '../integration-harness.js'

const fixtureRoot = fileURLToPath(new URL('../../../../tools/fixtures/interaction-events/v1/', import.meta.url))

describe('interaction scorecard CLI integration', () => {
  test('buildProgram invokes scorecard against a real temporary fixture directory', async () => {
    const harness = await freshHarness()
    const fixtureDir = await mkdtemp(join(tmpdir(), 'interaction-scorecard-integration-'))
    try {
      await cp(fixtureRoot, fixtureDir, { recursive: true })
      expect(await harness.run(['interaction', 'scorecard', fixtureDir, '--json'])).toBe(0)
      const output = harness.out[0]
      expect(output).toBeDefined()
      expect(JSON.parse(output ?? '{}')).toMatchObject({ schema: 'tenon-interaction-scorecard/v1' })
      expect(output).not.toContain(fixtureDir)
    } finally {
      await rm(harness.cwd, { recursive: true, force: true })
      await rm(fixtureDir, { recursive: true, force: true })
    }
  })

  test('real CLI rejects a missing fixture directory without output or path leakage', async () => {
    const harness = await freshHarness()
    const missing = join(harness.cwd, 'fixtures-does-not-exist')
    try {
      expect(await harness.run(['interaction', 'scorecard', missing, '--json'])).toBe(1)
      expect(harness.out).toEqual([])
      expect(harness.err.join('\n')).toContain('fixture directory unavailable')
      expect(harness.err.join('\n')).not.toContain(missing)
    } finally {
      await rm(harness.cwd, { recursive: true, force: true })
    }
  })

  test('real CLI rejects a corrupt fixture with stable schema error and no path/value leakage', async () => {
    const harness = await freshHarness()
    const fixtureDir = await mkdtemp(join(tmpdir(), 'interaction-scorecard-corrupt-'))
    try {
      await cp(fixtureRoot, fixtureDir, { recursive: true })
      await writeFile(join(fixtureDir, 'positive.json'), JSON.stringify({
        schema: 'tenon-interaction-event/v1',
        fixture_id: 'positive',
        events: [{ prompt: 'attacker-secret' }],
      }), 'utf8')
      expect(await harness.run(['interaction', 'scorecard', fixtureDir, '--json'])).toBe(1)
      expect(harness.out).toEqual([])
      expect(harness.err.join('\n')).toContain('event-schema-invalid')
      expect(harness.err.join('\n')).not.toContain(fixtureDir)
      expect(harness.err.join('\n')).not.toContain('attacker-secret')
    } finally {
      await rm(harness.cwd, { recursive: true, force: true })
      await rm(fixtureDir, { recursive: true, force: true })
    }
  })
})
