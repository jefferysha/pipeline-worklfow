import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRuntimePaths } from './paths.js'
import { RuntimeReleaseStore } from './release-store.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const roots: string[] = []

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function freshRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `pipeline-runtime-${label}-`))
  roots.push(root)
  return root
}

async function candidateCopy(root: string, suffix = ''): Promise<string> {
  const candidate = join(root, `candidate${suffix}`)
  const entries = [
    '.agents/plugins/marketplace.json',
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
    'adapters',
    'hooks',
    'packages/cli/dist/pipeline.mjs',
    'packages/dashboard-app/dist',
    'packages/server/dist/dashboard.mjs',
    'runtime/pipeline-bootstrap.mjs',
    'skills',
    'templates',
    'tools/verify-skills.sh',
  ]
  for (const entry of entries) {
    await cp(join(repoRoot, entry), join(candidate, entry), { recursive: true, preserveTimestamps: false })
  }
  return candidate
}

function storeFor(root: string): RuntimeReleaseStore {
  return new RuntimeReleaseStore({
    paths: resolveRuntimePaths({ env: { PIPELINE_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' }),
    now: () => '2026-07-24T00:00:00Z',
    retainedReleases: 3,
  })
}

describe('RuntimeReleaseStore', () => {
  it('stages, verifies, and atomically selects a complete candidate release', async () => {
    const root = await freshRoot('activate')
    const candidate = await candidateCopy(root)
    const store = storeFor(root)

    const activated = await store.stageAndActivate(candidate, 'codex')

    expect(activated.release.releaseId).toMatch(/^sha256-[a-f0-9]{64}$/)
    expect(activated.selection.activeRelease).toBe(activated.release.releaseId)
    expect(activated.selection.previousRelease).toBeNull()
    expect((await store.inspect()).activeValid).toBe(true)
  }, 30_000)

  it('reuses a fully verified content-addressed release when an idempotent publish collides', async () => {
    const root = await freshRoot('idempotent-release')
    const candidate = await candidateCopy(root)
    const store = storeFor(root)
    const first = await store.stageAndActivate(candidate, 'codex')

    // macOS reports ENOTEMPTY for this directory rename; Linux may report EEXIST. The public
    // installer contract is the same: validate the existing digest-addressed release and reuse it.
    const second = await store.stageAndActivate(candidate, 'codex')

    expect(second.release.releaseId).toBe(first.release.releaseId)
    expect(second.selection.activeRelease).toBe(first.release.releaseId)
    expect((await store.inspect()).activeValid).toBe(true)
  }, 30_000)

  it('rejects a malformed candidate without replacing the active release', async () => {
    const root = await freshRoot('reject')
    const healthy = await candidateCopy(root, '-healthy')
    const broken = await candidateCopy(root, '-broken')
    const store = storeFor(root)
    const first = await store.stageAndActivate(healthy, 'codex')
    await writeFile(join(broken, 'hooks', 'gate.sh'), 'if then\n', 'utf8')

    await expect(store.stageAndActivate(broken, 'codex')).rejects.toThrow(/语法|candidate|插件资产/i)

    expect((await store.inspect()).selection.activeRelease).toBe(first.release.releaseId)
  }, 30_000)

  it('rolls back only to a fully verified previous release', async () => {
    const root = await freshRoot('rollback')
    const firstCandidate = await candidateCopy(root, '-one')
    const secondCandidate = await candidateCopy(root, '-two')
    await writeFile(
      join(secondCandidate, 'runtime', 'pipeline-bootstrap.mjs'),
      `${await readFile(join(secondCandidate, 'runtime', 'pipeline-bootstrap.mjs'), 'utf8')}\n// release-two\n`,
      'utf8',
    )
    const store = storeFor(root)
    const first = await store.stageAndActivate(firstCandidate, 'claude')
    const second = await store.stageAndActivate(secondCandidate, 'claude')

    const rolledBack = await store.rollbackToPrevious()

    expect(second.release.releaseId).not.toBe(first.release.releaseId)
    expect(rolledBack.selection.activeRelease).toBe(first.release.releaseId)
    expect(rolledBack.selection.previousRelease).toBe(second.release.releaseId)
  }, 30_000)

  it('rejects symbolic links in a candidate payload', async () => {
    const root = await freshRoot('symlink')
    const candidate = await candidateCopy(root)
    await rm(join(candidate, 'packages', 'cli', 'dist', 'pipeline.mjs'))
    await symlink('/tmp/not-a-pipeline', join(candidate, 'packages', 'cli', 'dist', 'pipeline.mjs'))

    await expect(storeFor(root).stageAndActivate(candidate, 'codex')).rejects.toThrow(/符号链接/i)
  }, 30_000)
})
