import { describe, expect, it } from 'vitest'
import {
  LEGACY_TENON_MIGRATION_DEADLINE,
  runLegacyTenonMigration,
  type LegacyMigrationDeps,
  type LegacyMigrationReceipt,
} from './legacy-tenon-migration.js'

function fixture(overrides: Partial<LegacyMigrationDeps> = {}) {
  const calls: string[] = []
  let receipt: LegacyMigrationReceipt | null = null
  const deps: LegacyMigrationDeps = {
    now: () => '2026-07-26T04:00:00Z',
    readReceipt: async () => receipt,
    writeReceipt: async (next) => {
      calls.push(`receipt:${next.state}`)
      receipt = next
    },
    detectLegacy: async () => {
      calls.push('detect-legacy')
      return { present: true, scope: 'user' }
    },
    installTenonCandidate: async () => {
      calls.push('install-tenon')
      return { root: '/host/tenon', pluginVersion: '1.0.0' }
    },
    verifyTenonCandidate: async () => {
      calls.push('verify-candidate')
      return { payloadDigest: 'a'.repeat(64) }
    },
    activateTenonRuntime: async () => {
      calls.push('activate-runtime')
      return { releaseId: `sha256-${'b'.repeat(64)}`, previousRelease: 'legacy-release' }
    },
    verifyTenonLauncher: async () => {
      calls.push('verify-launcher')
      return true
    },
    verifyTenonSession: async () => {
      calls.push('verify-session')
      return false
    },
    rollbackTenonRuntime: async () => {
      calls.push('rollback-runtime')
    },
    removeLegacyRegistration: async () => {
      calls.push('remove-registration')
    },
    removeOwnedLegacyLaunchers: async () => {
      calls.push('remove-launchers')
    },
    ...overrides,
  }
  return {
    calls,
    deps,
    receipt: () => receipt,
    setReceipt: (next: LegacyMigrationReceipt) => { receipt = next },
  }
}

describe('legacy Tenon migration bridge', () => {
  it('activates a verified Tenon candidate but preserves the old identity until a new session proves it loaded', async () => {
    const f = fixture()

    const result = await runLegacyTenonMigration('codex', 'activate', f.deps)

    expect(result).toMatchObject({ ok: true, state: 'cleanup-pending' })
    expect(f.receipt()).toMatchObject({
      state: 'cleanup-pending',
      host: 'codex',
      legacyIdentity: 'pipeline-lite@pipeline-lite',
      tenonIdentity: 'tenon@tenon',
      migrationDeadline: LEGACY_TENON_MIGRATION_DEADLINE,
    })
    expect(f.calls).toEqual([
      'detect-legacy',
      'install-tenon',
      'verify-candidate',
      'activate-runtime',
      'verify-launcher',
      'receipt:cleanup-pending',
    ])
    expect(f.calls).not.toContain('remove-registration')
  })

  it('rolls back the new runtime and records a durable failure when launcher verification fails', async () => {
    const f = fixture({ verifyTenonLauncher: async () => false })

    const result = await runLegacyTenonMigration('claude', 'activate', f.deps)

    expect(result).toMatchObject({ ok: false, state: 'failed' })
    expect(f.calls).toContain('rollback-runtime')
    expect(f.calls).not.toContain('remove-registration')
    expect(f.receipt()).toMatchObject({
      state: 'failed',
      host: 'claude',
      previousRelease: 'legacy-release',
    })
  })

  it('finalizes cleanup only after both the Tenon launcher and a new host session are verified', async () => {
    const f = fixture()
    const deps: LegacyMigrationDeps = {
      ...f.deps,
      verifyTenonSession: async () => {
        f.calls.push('verify-session')
        return true
      },
    }
    f.setReceipt({
      version: 1,
      state: 'cleanup-pending',
      host: 'codex',
      legacyIdentity: 'pipeline-lite@pipeline-lite',
      tenonIdentity: 'tenon@tenon',
      legacyScope: 'user',
      candidateRoot: '/host/tenon',
      pluginVersion: '1.0.0',
      payloadDigest: 'a'.repeat(64),
      releaseId: `sha256-${'b'.repeat(64)}`,
      previousRelease: 'legacy-release',
      activatedAt: '2026-07-26T03:59:00Z',
      updatedAt: '2026-07-26T03:59:00Z',
      migrationDeadline: LEGACY_TENON_MIGRATION_DEADLINE,
      detail: 'ready',
    })

    const result = await runLegacyTenonMigration('codex', 'finalize', deps)

    expect(result).toMatchObject({ ok: true, state: 'completed' })
    expect(f.calls).toEqual([
      'verify-launcher',
      'verify-session',
      'remove-registration',
      'remove-launchers',
      'receipt:completed',
    ])
  })

  it('keeps cleanup pending when the new session has not loaded Tenon', async () => {
    const f = fixture()
    f.setReceipt({
      version: 1,
      state: 'cleanup-pending',
      host: 'codex',
      legacyIdentity: 'pipeline-lite@pipeline-lite',
      tenonIdentity: 'tenon@tenon',
      legacyScope: 'user',
      candidateRoot: '/host/tenon',
      pluginVersion: '1.0.0',
      payloadDigest: 'a'.repeat(64),
      releaseId: `sha256-${'b'.repeat(64)}`,
      previousRelease: null,
      activatedAt: '2026-07-26T03:59:00Z',
      updatedAt: '2026-07-26T03:59:00Z',
      migrationDeadline: LEGACY_TENON_MIGRATION_DEADLINE,
      detail: 'ready',
    })

    const result = await runLegacyTenonMigration('codex', 'finalize', f.deps)

    expect(result).toMatchObject({ ok: false, state: 'cleanup-pending' })
    expect(f.calls).not.toContain('remove-registration')
    expect(f.calls).not.toContain('remove-launchers')
  })

  it('is idempotent after completion and never installs a second candidate', async () => {
    const f = fixture()
    f.setReceipt({
      version: 1,
      state: 'completed',
      host: 'codex',
      legacyIdentity: 'pipeline-lite@pipeline-lite',
      tenonIdentity: 'tenon@tenon',
      legacyScope: 'user',
      candidateRoot: '/host/tenon',
      pluginVersion: '1.0.0',
      payloadDigest: 'a'.repeat(64),
      releaseId: `sha256-${'b'.repeat(64)}`,
      previousRelease: null,
      activatedAt: '2026-07-26T03:59:00Z',
      updatedAt: '2026-07-26T03:59:00Z',
      migrationDeadline: LEGACY_TENON_MIGRATION_DEADLINE,
      detail: 'complete',
    })

    const result = await runLegacyTenonMigration('codex', 'activate', f.deps)

    expect(result).toMatchObject({ ok: true, state: 'completed' })
    expect(f.calls).toEqual([])
  })
})
