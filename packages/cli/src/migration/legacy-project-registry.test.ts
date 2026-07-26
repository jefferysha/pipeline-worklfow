import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readProjectRegistry, resolveProductPaths, writeProjectRegistry } from '@tenon/kernel'
import {
  migrateLegacyProjectRegistry,
  resolveHostProjectRegistryCandidates,
} from './legacy-project-registry.js'

describe('legacy project registry migration', () => {
  const isolatedEnv = {}

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
    const current = resolveProductPaths({ homeDir, platform: 'darwin', env: isolatedEnv }).registryPath
    const legacy = JSON.stringify([projectOne, projectTwo, projectTwo])

    const result = await migrateLegacyProjectRegistry({
      homeDir,
      platform: 'darwin',
      env: isolatedEnv,
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
      env: isolatedEnv,
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
      env: isolatedEnv,
      readText: (path) => path.endsWith('pipeline-projects.json') ? legacy : undefined,
      pathExists: () => false,
      pathIsDirectory: () => false,
    })

    expect(result).toEqual({ status: 'completed', discovered: 0, imported: 0, rejected: 6 })
    expect(readProjectRegistry(resolveProductPaths({
      homeDir,
      platform: 'darwin',
      env: isolatedEnv,
    }).registryPath)).toEqual([])
  })

  test('serializes concurrent first setup and publishes exactly one durable receipt', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-concurrent-'))
    const project = join(homeDir, 'project')
    const input = {
      homeDir,
      platform: 'linux' as const,
      env: isolatedEnv,
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
    expect(readProjectRegistry(resolveProductPaths({
      homeDir,
      platform: 'linux',
      env: isolatedEnv,
    }).registryPath)).toEqual([project])
  })

  test('resumes an interrupted partial import from its durable snapshot without rereading host files', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-resume-'))
    const projectOne = join(homeDir, 'project-one')
    const projectTwo = join(homeDir, 'project-two')
    const paths = resolveProductPaths({ homeDir, platform: 'linux', env: isolatedEnv })
    let writes = 0

    await expect(migrateLegacyProjectRegistry({
      homeDir,
      platform: 'linux',
      env: isolatedEnv,
      readText: (path) => path.endsWith('pipeline-projects.json')
        ? JSON.stringify([projectOne, projectTwo])
        : undefined,
      pathExists: (path) => path === projectOne || path === projectTwo,
      pathIsDirectory: (path) => path === projectOne || path === projectTwo,
      registerProject: async (registryPath, root) => {
        writes += 1
        if (writes === 2) throw new Error('injected second project failure')
        const current = readProjectRegistry(registryPath)
        await writeProjectRegistry(registryPath, [...current, root])
        return true
      },
    })).rejects.toThrow(/injected second project failure/)
    expect(readProjectRegistry(paths.registryPath)).toEqual([projectOne])

    const resumed = await migrateLegacyProjectRegistry({
      homeDir,
      platform: 'linux',
      env: isolatedEnv,
      readText: () => {
        throw new Error('resume must use the durable pending snapshot')
      },
      pathExists: () => true,
      pathIsDirectory: () => true,
    })

    expect(resumed).toEqual({ status: 'completed', discovered: 2, imported: 1, rejected: 0 })
    expect(readProjectRegistry(paths.registryPath)).toEqual([projectOne, projectTwo])
    await expect(readFile(
      join(paths.migrationsRoot, 'host-project-registry-v1', 'receipt.json'),
      'utf8',
    ).then((text) => JSON.parse(text))).resolves.toMatchObject({
      discovered: 2,
      imported: 1,
      ensured: 2,
      rejected: 0,
    })
  })

  test('fails closed when the versioned receipt is corrupt instead of re-importing host data', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-corrupt-'))
    const paths = resolveProductPaths({ homeDir, platform: 'linux', env: isolatedEnv })
    const receiptPath = join(paths.migrationsRoot, 'host-project-registry-v1', 'receipt.json')
    await mkdir(join(paths.migrationsRoot, 'host-project-registry-v1'), { recursive: true })
    await writeFile(receiptPath, '{broken', 'utf8')

    await expect(migrateLegacyProjectRegistry({
      homeDir,
      platform: 'linux',
      env: isolatedEnv,
      readText: () => JSON.stringify(['/must-not-import']),
      pathExists: () => true,
      pathIsDirectory: () => true,
    })).rejects.toThrow(/migration receipt/)
    expect(readProjectRegistry(paths.registryPath)).toEqual([])
  })

  test('fails closed when a receipt contains impossible imported and ensured counts', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-invalid-counts-'))
    const paths = resolveProductPaths({ homeDir, platform: 'linux', env: isolatedEnv })
    const receiptPath = join(paths.migrationsRoot, 'host-project-registry-v1', 'receipt.json')
    await mkdir(join(paths.migrationsRoot, 'host-project-registry-v1'), { recursive: true })
    await writeFile(receiptPath, JSON.stringify({
      version: 1,
      migration: 'host-project-registry-v1',
      completedAt: '2026-07-26T00:00:00.000Z',
      discovered: 1,
      imported: 99,
      ensured: 0,
      rejected: 0,
    }), 'utf8')

    await expect(migrateLegacyProjectRegistry({
      homeDir,
      platform: 'linux',
      env: isolatedEnv,
      readText: () => {
        throw new Error('an invalid receipt must fail before reading host data')
      },
      pathExists: () => true,
      pathIsDirectory: () => true,
    })).rejects.toThrow(/migration receipt/)
  })

  test('accepts a valid v1 receipt written before the ensured field was introduced', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'tenon-project-migration-old-receipt-'))
    const paths = resolveProductPaths({ homeDir, platform: 'linux', env: isolatedEnv })
    const receiptPath = join(paths.migrationsRoot, 'host-project-registry-v1', 'receipt.json')
    await mkdir(join(paths.migrationsRoot, 'host-project-registry-v1'), { recursive: true })
    await writeFile(receiptPath, JSON.stringify({
      version: 1,
      migration: 'host-project-registry-v1',
      completedAt: '2026-07-26T00:00:00.000Z',
      discovered: 2,
      imported: 2,
      rejected: 0,
    }), 'utf8')

    await expect(migrateLegacyProjectRegistry({
      homeDir,
      platform: 'linux',
      env: isolatedEnv,
      readText: () => {
        throw new Error('a valid completed receipt must suppress host reads')
      },
      pathExists: () => true,
      pathIsDirectory: () => true,
    })).resolves.toEqual({
      status: 'already-complete',
      discovered: 0,
      imported: 0,
      rejected: 0,
    })
  })
})
