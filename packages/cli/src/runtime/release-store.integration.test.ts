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
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
    'adapters',
    'hooks',
    'packages/cli/dist/tenon.mjs',
    'packages/dashboard-app/dist',
    'packages/server/dist/dashboard.mjs',
    'runtime/tenon-bootstrap.mjs',
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
    paths: resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' }),
    now: () => '2026-07-24T00:00:00Z',
    retainedReleases: 3,
  })
}

function pathsFor(root: string) {
  return resolveRuntimePaths({ env: { TENON_RUNTIME_HOME: join(root, 'runtime') }, homeDir: root, platform: 'linux' })
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

  it('rejects a candidate missing the Claude marketplace manifest without replacing selection', async () => {
    const root = await freshRoot('missing-claude-marketplace')
    const healthy = await candidateCopy(root, '-healthy')
    const broken = await candidateCopy(root, '-broken')
    const store = storeFor(root)
    const first = await store.stageAndActivate(healthy, 'codex')
    await rm(join(broken, '.claude-plugin', 'marketplace.json'))

    await expect(store.stageAndActivate(broken, 'codex')).rejects.toThrow(/marketplace\.json|插件资产/i)

    expect((await store.inspect()).selection.activeRelease).toBe(first.release.releaseId)
  }, 30_000)

  it('rolls back only to a fully verified previous release', async () => {
    const root = await freshRoot('rollback')
    const firstCandidate = await candidateCopy(root, '-one')
    const secondCandidate = await candidateCopy(root, '-two')
    await writeFile(
      join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// release-two\n`,
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

  it('compensates only the exact activation, including a failed first-install readiness gate', async () => {
    const root = await freshRoot('revert-activation')
    const candidate = await candidateCopy(root)
    const store = storeFor(root)
    const activated = await store.stageAndActivate(candidate, 'codex')

    await store.revertActivation(activated.selection)

    const inspection = await store.inspect()
    expect(inspection.selection.activeRelease).toBeNull()
    expect(inspection.selection.previousRelease).toBe(activated.release.releaseId)
    expect(inspection.activeValid).toBe(false)
    await expect(store.revertActivation(activated.selection)).rejects.toThrow(/拒绝回滚非当前 activation/)
  }, 30_000)

  it('rejects symbolic links in a candidate payload', async () => {
    const root = await freshRoot('symlink')
    const candidate = await candidateCopy(root)
    await rm(join(candidate, 'packages', 'cli', 'dist', 'tenon.mjs'))
    await symlink('/tmp/not-a-pipeline', join(candidate, 'packages', 'cli', 'dist', 'tenon.mjs'))

    await expect(storeFor(root).stageAndActivate(candidate, 'codex')).rejects.toThrow(/符号链接/i)
  }, 30_000)

  it('never changes activation or rollback selection after an audit append failure', async () => {
    const root = await freshRoot('audit-failure')
    const firstCandidate = await candidateCopy(root, '-one')
    const secondCandidate = await candidateCopy(root, '-two')
    await writeFile(
      join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(secondCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// second\n`,
      'utf8',
    )
    const healthy = storeFor(root)
    const first = await healthy.stageAndActivate(firstCandidate, 'codex')
    const second = await healthy.stageAndActivate(secondCandidate, 'codex')
    const failingAudit = new RuntimeReleaseStore({
      paths: pathsFor(root),
      auditWriter: async () => { throw new Error('injected audit append failure') },
    })

    await expect(failingAudit.rollbackToPrevious()).rejects.toThrow(/audit append failure/)
    expect((await healthy.inspect()).selection).toEqual(second.selection)

    const thirdCandidate = await candidateCopy(root, '-three')
    await writeFile(
      join(thirdCandidate, 'runtime', 'tenon-bootstrap.mjs'),
      `${await readFile(join(thirdCandidate, 'runtime', 'tenon-bootstrap.mjs'), 'utf8')}\n// third\n`,
      'utf8',
    )
    await expect(failingAudit.stageAndActivate(thirdCandidate, 'codex')).rejects.toThrow(/audit append failure/)
    expect((await healthy.inspect()).selection).toEqual(second.selection)
    expect(first.release.releaseId).not.toBe(second.release.releaseId)
  }, 60_000)

  it('persists a host refresh failure for runtime status diagnostics', async () => {
    const root = await freshRoot('update-diagnostic')
    const store = storeFor(root)

    await store.recordUpdateFailure('host marketplace refresh failed')

    expect((await store.inspect()).lastAudit).toMatchObject({
      kind: 'update-rejected',
      detail: 'host marketplace refresh failed',
    })
  })
})
