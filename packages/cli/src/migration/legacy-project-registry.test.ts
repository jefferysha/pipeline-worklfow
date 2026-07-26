import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readProjectRegistry, resolveProductPaths, writeProjectRegistry } from '@tenon/kernel'
import { migrateLegacyProjectRegistry } from './legacy-project-registry.js'

describe('legacy project registry migration', () => {
  test('merges existing legacy project roots into the canonical Tenon registry once', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-'))
    const projectOne = join(homeDir, 'project-one')
    const projectTwo = join(homeDir, 'project-two')
    const current = resolveProductPaths({ homeDir, platform: 'darwin' }).registryPath
    await writeProjectRegistry(current, [projectOne])
    const legacy = JSON.stringify([projectOne, projectTwo, projectTwo])

    const result = await migrateLegacyProjectRegistry({
      homeDir,
      platform: 'darwin',
      readText: (path) => path === join(homeDir, '.claude', 'pipeline-projects.json') ? legacy : undefined,
      pathExists: (path) => path === projectOne || path === projectTwo,
      pathIsDirectory: (path) => path === projectOne || path === projectTwo,
    })

    expect(result).toEqual({ discovered: 2, imported: 1, rejected: 0 })
    expect(readProjectRegistry(current)).toEqual([projectOne, projectTwo])
  })

  test('drops non-absolute, missing, non-string and oversized legacy entries', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-invalid-'))
    const missing = join(homeDir, 'missing')
    const legacy = JSON.stringify(['relative', missing, 42])

    const result = await migrateLegacyProjectRegistry({
      homeDir,
      platform: 'darwin',
      readText: (path) => path.endsWith('pipeline-projects.json') ? legacy : undefined,
      pathExists: () => false,
      pathIsDirectory: () => false,
    })

    expect(result).toEqual({ discovered: 0, imported: 0, rejected: 6 })
    expect(readProjectRegistry(resolveProductPaths({ homeDir, platform: 'darwin' }).registryPath)).toEqual([])
  })
})
