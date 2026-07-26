import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeStableLaunchers } from './launchers.js'
import { resolveRuntimePaths } from './paths.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('writeStableLaunchers', () => {
  it('writes stable scripts rather than a marketplace bundle symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenon-launcher-'))
    roots.push(root)
    const paths = resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
    const written = await writeStableLaunchers(paths, root)
    const tenon = await readFile(written.tenon, 'utf8')
    const hook = await readFile(written.hook, 'utf8')
    expect(tenon).toContain('TENON_RUNTIME_DATA_ROOT')
    expect(tenon).toContain('TENON_RUNTIME_CONFIG_ROOT')
    expect(tenon).not.toContain('PLUGIN_ROOT')
    expect(hook).toContain(' hook "$@"')
  })
})
