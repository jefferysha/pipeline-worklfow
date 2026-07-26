import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readProjectRegistry, resolveProductPaths, writeProjectRegistry } from '@tenon/kernel'
import {
  migrateLegacyProjectRegistry,
  resolveHostProjectRegistryCandidates,
} from './legacy-project-registry.js'

describe('legacy project registry migration', () => {
  test.each([
    ['darwin' as const, '/Users/demo', [
      '/Users/demo/.claude/pipeline-projects.json',
      '/Users/demo/.codex/pipeline-projects.json',
    ]],
    ['linux' as const, '/home/demo', [
      '/home/demo/.claude/pipeline-projects.json',
      '/home/demo/.codex/pipeline-projects.json',
    ]],
    ['win32' as const, 'C:\\Users\\demo', [
      'C:\\Users\\demo\\.claude\\pipeline-projects.json',
      'C:\\Users\\demo\\.codex\\pipeline-projects.json',
    ]],
  ])('keeps %s host protocol knowledge in the CLI migration owner', (platform, homeDir, expected) => {
    expect(resolveHostProjectRegistryCandidates({ platform, homeDir })).toEqual(expected)
  })

  test('merges existing legacy project roots into the canonical Tenon registry once', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-'))
    const projectOne = join(homeDir, 'project-one')
    const projectTwo = join(homeDir, 'project-two')
    const current = resolveProductPaths({ homeDir, platform: 'darwin' }).registryPath
    const legacy = JSON.stringify([projectOne, projectTwo, projectTwo])

    const result = await migrateLegacyProjectRegistry({
      homeDir,
      platform: 'darwin',
      readText: (path) => path === join(homeDir, '.claude', 'pipeline-projects.json') ? legacy : undefined,
      pathExists: (path) => path === projectOne || path === projectTwo,
      pathIsDirectory: (path) => path === projectOne || path === projectTwo,
    })

    expect(result).toEqual({ status: 'completed', discovered: 2, imported: 2, rejected: 0 })
    expect(readProjectRegistry(current)).toEqual([projectOne, projectTwo])

    await writeProjectRegistry(current, [projectOne])
    const second = await migrateLegacyProjectRegistry({
      homeDir,
      platform: 'darwin',
      readText: () => {
        throw new Error('completed migration must never read a host registry again')
      },
      pathExists: () => true,
      pathIsDirectory: () => true,
    })
    expect(second).toEqual({ status: 'already-complete', discovered: 0, imported: 0, rejected: 0 })
    expect(readProjectRegistry(current)).toEqual([projectOne])
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

    expect(result).toEqual({ status: 'completed', discovered: 0, imported: 0, rejected: 6 })
    expect(readProjectRegistry(resolveProductPaths({ homeDir, platform: 'darwin' }).registryPath)).toEqual([])
  })

  test('serializes concurrent first setup and publishes exactly one durable receipt', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-concurrent-'))
    const project = join(homeDir, 'project')
    const input = {
      homeDir,
      platform: 'linux' as const,
      readText: (path: string) => path.endsWith('pipeline-projects.json')
        ? JSON.stringify([project])
        : undefined,
      pathExists: (path: string) => path === project,
      pathIsDirectory: (path: string) => path === project,
    }

    const results = await Promise.all([
      migrateLegacyProjectRegistry(input),
      migrateLegacyProjectRegistry(input),
    ])

    expect(results.map((result) => result.status).sort()).toEqual(['already-complete', 'completed'])
    expect(readProjectRegistry(resolveProductPaths({ homeDir, platform: 'linux' }).registryPath)).toEqual([project])
  })

  test('fails closed when the versioned receipt is corrupt instead of re-importing host data', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-corrupt-'))
    const paths = resolveProductPaths({ homeDir, platform: 'linux' })
    const receiptPath = join(paths.migrationsRoot, 'host-project-registry-v1', 'receipt.json')
    await mkdir(join(paths.migrationsRoot, 'host-project-registry-v1'), { recursive: true })
    await writeFile(receiptPath, '{broken', 'utf8')

    await expect(migrateLegacyProjectRegistry({
      homeDir,
      platform: 'linux',
      readText: () => JSON.stringify(['/must-not-import']),
      pathExists: () => true,
      pathIsDirectory: () => true,
    })).rejects.toThrow(/migration receipt/)
    expect(readProjectRegistry(paths.registryPath)).toEqual([])
  })
})
