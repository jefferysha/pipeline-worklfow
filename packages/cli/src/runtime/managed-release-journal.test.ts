import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { resolveRuntimePaths } from './paths.js'
import { createManagedReleaseJournal } from './managed-release-journal.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'tenon-release-journal-'))
  roots.push(root)
  const paths = resolveRuntimePaths({
    homeDir: root,
    env: { TENON_RUNTIME_HOME: join(root, 'runtime') },
  })
  return { root, paths, journal: createManagedReleaseJournal(paths) }
}

describe('managed release write-ahead journal', () => {
  test('persists an exact transaction phase across process-like store recreation', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('update', 'codex', '2026-07-27T00:00:00Z')
    await journal.write(initial)
    await journal.write({
      ...initial,
      dashboardPort: 43_210,
      phase: 'candidate-resolved',
      candidateRoot: '/host/tenon',
      evidence: '{"installed":[]}',
      updatedAt: '2026-07-27T00:00:01Z',
    })

    await expect(createManagedReleaseJournal(paths).read()).resolves.toMatchObject({
      transactionId: initial.transactionId,
      operation: 'update',
      source: 'codex',
      phase: 'candidate-resolved',
      dashboardPort: 43_210,
      candidateRoot: '/host/tenon',
      evidence: '{"installed":[]}',
    })
  })

  test('rejects an invalid persisted Dashboard port', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('setup', 'codex', '2026-07-27T00:00:00Z')
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    await writeFile(
      join(paths.managedTransactionRoot, 'release-transaction.json'),
      JSON.stringify({ ...initial, dashboardPort: 65_536 }),
      'utf8',
    )

    await expect(journal.read()).rejects.toThrow('格式非法')
  })

  test('rejects a non-canonical top-level transaction identity', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('setup', 'codex', '2026-07-27T00:00:00Z')
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    await writeFile(
      join(paths.managedTransactionRoot, 'release-transaction.json'),
      JSON.stringify({ ...initial, transactionId: 'contains whitespace' }),
      'utf8',
    )

    await expect(journal.read()).rejects.toThrow('格式非法')
  })

  test('persists an explicit empty pre-activation Dashboard probe', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('setup', 'codex', '2026-07-27T00:00:00Z')
    await journal.write({
      ...initial,
      dashboardPort: 43_210,
      dashboardBeforeAbsent: true,
    })

    await expect(createManagedReleaseJournal(paths).read()).resolves.toMatchObject({
      dashboardPort: 43_210,
      dashboardBeforeAbsent: true,
    })
  })

  test('rejects contradictory present and absent pre-activation Dashboard proofs', async () => {
    const { journal } = await fixture()
    const initial = journal.create('setup', 'codex', '2026-07-27T00:00:00Z')
    await expect(journal.write({
      ...initial,
      dashboardPort: 18_765,
      dashboardBeforeAbsent: true,
      dashboardBefore: {
        version: 1,
        port: 18_765,
        pid: 4242,
        releaseId: `sha256-${'a'.repeat(64)}`,
        stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
      },
    })).rejects.toThrow('格式非法')
  })

  test.each(['dashboardBefore', 'dashboard'] as const)(
    'rejects %s ownership on a port that conflicts with the frozen Dashboard port',
    async (field) => {
      const { paths, journal } = await fixture()
      const initial = journal.create('setup', 'codex', '2026-07-27T00:00:00Z')
      const identity = {
        version: 1 as const,
        port: 18_765,
        pid: 4242,
        releaseId: `sha256-${'a'.repeat(64)}`,
        stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
        transactionId: initial.transactionId,
      }
      await mkdir(paths.managedTransactionRoot, { recursive: true })
      await writeFile(
        join(paths.managedTransactionRoot, 'release-transaction.json'),
        JSON.stringify({
          ...initial,
          dashboardPort: 43_210,
          [field]: field === 'dashboard' ? { ...identity, owner: 'transaction' } : identity,
        }),
        'utf8',
      )

      await expect(journal.read()).rejects.toThrow('格式非法')
    },
  )

  test('rejects an in-memory write with conflicting frozen and owned Dashboard ports', async () => {
    const { journal } = await fixture()
    const initial = journal.create('setup', 'codex', '2026-07-27T00:00:00Z')
    await expect(journal.write({
      ...initial,
      dashboardPort: 43_210,
      dashboardBefore: {
        version: 1,
        port: 18_765,
        pid: 4242,
        releaseId: `sha256-${'a'.repeat(64)}`,
        stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
      },
    })).rejects.toThrow('格式非法')
  })

  test('persists before/desired/replay policy/observed-after while keeping stdout diagnostic', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('update', 'codex', '2026-07-27T00:00:00Z')
    await journal.write({
      ...initial,
      hostSteps: [{
        id: 'plugin-install',
        state: 'completed',
        before: '{"version":1,"plugins":[]}',
        desired: '{"version":1,"plugins":["tenon@1.0.1"]}',
        replayPolicy: 'observe-before-replay-v1',
        observedAfter: '{"version":1,"plugins":["tenon@1.0.1"]}',
        result: '{"code":0,"stdout":"diagnostic","stderr":""}',
      }],
    })

    await expect(createManagedReleaseJournal(paths).read()).resolves.toMatchObject({
      hostSteps: [{
        state: 'completed',
        before: '{"version":1,"plugins":[]}',
        desired: '{"version":1,"plugins":["tenon@1.0.1"]}',
        observedAfter: '{"version":1,"plugins":["tenon@1.0.1"]}',
      }],
    })
  })

  test('rejects a completed reconciled host checkpoint with no observed-after proof', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('update', 'codex', '2026-07-27T00:00:00Z')
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    await writeFile(
      join(paths.managedTransactionRoot, 'release-transaction.json'),
      JSON.stringify({
        ...initial,
        hostSteps: [{
          id: 'plugin-install',
          state: 'completed',
          before: 'before',
          desired: 'desired',
          replayPolicy: 'observe-before-replay-v1',
        }],
      }),
      'utf8',
    )

    await expect(journal.read()).rejects.toThrow('格式非法')
  })

  test('fails closed on malformed or unknown journal fields', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('setup', 'claude', '2026-07-27T00:00:00Z')
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    await writeFile(
      join(paths.managedTransactionRoot, 'release-transaction.json'),
      JSON.stringify({ ...initial, unexpected: true }),
      'utf8',
    )

    await expect(journal.read()).rejects.toThrow('格式非法')
  })

  test('rejects a symlink journal and never follows it', async () => {
    const { root, paths, journal } = await fixture()
    const target = join(root, 'attacker-controlled.json')
    await writeFile(target, '{}', 'utf8')
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    await symlink(target, join(paths.managedTransactionRoot, 'release-transaction.json'))

    await expect(journal.read()).rejects.toThrow('不是普通文件')
  })

  test('rejects checkpoint launcher paths outside the product-owned stable launcher locations', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('setup', 'codex', '2026-07-27T00:00:00Z')
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    await writeFile(
      join(paths.managedTransactionRoot, 'release-transaction.json'),
      JSON.stringify({
        ...initial,
        phase: 'activating-runtime',
        candidateRoot: '/host/tenon',
        activationCheckpoint: {
          selection: {
            version: 1,
            revision: 0,
            activeRelease: null,
            previousRelease: null,
            updatedAt: '1970-01-01T00:00:00Z',
          },
          launchers: {
            tenon: { path: '/tmp/attacker-target', state: { kind: 'missing' } },
            hook: { path: '/tmp/attacker-hook', state: { kind: 'missing' } },
          },
        },
      }),
      'utf8',
    )

    await expect(journal.read()).rejects.toThrow('格式非法')
  })

  test('clears only the transaction that still owns the journal', async () => {
    const { journal } = await fixture()
    const initial = journal.create('adapter', 'adapter', '2026-07-27T00:00:00Z')
    await journal.write(initial)

    await expect(journal.clear('another-transaction')).rejects.toThrow('ownership changed')
    await expect(journal.read()).resolves.toMatchObject({ transactionId: initial.transactionId })
    await journal.clear(initial.transactionId)
    await expect(journal.read()).resolves.toBeNull()
  })

  test('persists exact Dashboard ownership across store recreation', async () => {
    const { root, paths, journal } = await fixture()
    const initial = journal.create('update', 'codex', '2026-07-27T00:00:00Z')
    const releaseId = `sha256-${'a'.repeat(64)}`
    const activation = {
      selection: {
        version: 1 as const,
        revision: 1,
        activeRelease: releaseId,
        previousRelease: null,
        updatedAt: '2026-07-27T00:00:01Z',
      },
      release: {
        version: 1 as const,
        releaseId,
        payloadDigest: 'a'.repeat(64),
        createdAt: '2026-07-27T00:00:01Z',
        source: { host: 'codex' as const, pluginVersion: '1.0.0' },
      },
      releaseRoot: join(paths.releasesRoot, releaseId),
    }
    const identity = {
      version: 1 as const,
      port: 18765,
      pid: 4242,
      releaseId,
      stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
      transactionId: initial.transactionId,
    }
    const dashboardBefore = {
      ...identity,
      transactionId: 'transaction-before',
    }
    await journal.write({
      ...initial,
      phase: 'dashboard-ready',
      dashboardPort: 18765,
      candidateRoot: '/host/tenon',
      activation,
      activationCheckpoint: {
        selection: {
          version: 1,
          revision: 0,
          activeRelease: null,
          previousRelease: null,
          updatedAt: '2026-07-27T00:00:00Z',
        },
        launchers: {
          tenon: { path: join(root, '.local', 'bin', 'tenon'), state: { kind: 'missing' } },
          hook: { path: join(root, '.local', 'bin', 'tenon-hook'), state: { kind: 'missing' } },
        },
      },
      dashboardBefore,
      dashboard: { ...identity, owner: 'transaction' },
      updatedAt: '2026-07-27T00:00:02Z',
    })

    await expect(createManagedReleaseJournal(paths).read()).resolves.toMatchObject({
      phase: 'dashboard-ready',
      dashboardBefore,
      dashboard: { ...identity, owner: 'transaction' },
    })
  })

  test('rejects malformed Dashboard ownership instead of adopting an unproven listener', async () => {
    const { paths, journal } = await fixture()
    const initial = journal.create('setup', 'codex', '2026-07-27T00:00:00Z')
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    await writeFile(
      join(paths.managedTransactionRoot, 'release-transaction.json'),
      JSON.stringify({
        ...initial,
        dashboardBefore: {
          version: 1,
          port: 18765,
          pid: 0,
          releaseId: `sha256-${'a'.repeat(64)}`,
          stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
        },
      }),
      'utf8',
    )

    await expect(journal.read()).rejects.toThrow('格式非法')
  })
})
