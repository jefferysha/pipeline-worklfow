import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { SERVER_VERSION, resolveReleaseVersion } from './version.js'

describe('resolveReleaseVersion', () => {
  test('takes the Codex plugin manifest as the runtime release and takeover version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pipeline-release-version-'))
    await mkdir(join(root, '.codex-plugin'), { recursive: true })
    await writeFile(join(root, '.codex-plugin', 'plugin.json'), JSON.stringify({ version: '0.2.0' }), 'utf8')

    expect(resolveReleaseVersion(root)).toBe('0.2.0')
  })

  test('falls back to the Claude manifest, then the stable library fallback for damaged metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pipeline-release-version-'))
    await mkdir(join(root, '.claude-plugin'), { recursive: true })
    await writeFile(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.2.1' }), 'utf8')
    expect(resolveReleaseVersion(root)).toBe('0.2.1')

    await writeFile(join(root, '.claude-plugin', 'plugin.json'), '{ bad json', 'utf8')
    expect(resolveReleaseVersion(root)).toBe(SERVER_VERSION)
  })
})
