import type { NativeRuntimeHost } from '../runtime/types.js'

export const LEGACY_TENON_MIGRATION_DEADLINE = '2026-10-31'
export const LEGACY_PLUGIN_IDENTITY = 'pipeline-lite@pipeline-lite'
export const TENON_PLUGIN_IDENTITY = 'tenon@tenon'

export type LegacyMigrationState = 'cleanup-pending' | 'completed' | 'failed'
export type LegacyMigrationAction = 'activate' | 'finalize'

export interface LegacyMigrationReceipt {
  readonly version: 1
  readonly state: LegacyMigrationState
  readonly host: NativeRuntimeHost
  readonly legacyIdentity: typeof LEGACY_PLUGIN_IDENTITY
  readonly tenonIdentity: typeof TENON_PLUGIN_IDENTITY
  readonly legacyScope: string
  readonly candidateRoot: string
  readonly pluginVersion: string
  readonly payloadDigest: string
  readonly releaseId: string
  readonly previousRelease: string | null
  readonly activatedAt: string
  readonly updatedAt: string
  readonly migrationDeadline: typeof LEGACY_TENON_MIGRATION_DEADLINE
  readonly detail: string
}

export interface LegacyDetection {
  readonly present: boolean
  readonly scope: string
}

export interface TenonMigrationCandidate {
  readonly root: string
  readonly pluginVersion: string
}

export interface VerifiedTenonCandidate {
  readonly payloadDigest: string
}

export interface ActivatedTenonRuntime {
  readonly releaseId: string
  readonly previousRelease: string | null
}

export interface LegacyMigrationDeps {
  readonly now: () => string
  readonly readReceipt: (host: NativeRuntimeHost) => Promise<LegacyMigrationReceipt | null>
  readonly writeReceipt: (receipt: LegacyMigrationReceipt) => Promise<void>
  readonly detectLegacy: (host: NativeRuntimeHost) => Promise<LegacyDetection>
  readonly installTenonCandidate: (host: NativeRuntimeHost) => Promise<TenonMigrationCandidate>
  readonly verifyTenonCandidate: (
    host: NativeRuntimeHost,
    candidate: TenonMigrationCandidate,
  ) => Promise<VerifiedTenonCandidate>
  readonly activateTenonRuntime: (
    host: NativeRuntimeHost,
    candidate: TenonMigrationCandidate,
  ) => Promise<ActivatedTenonRuntime>
  readonly verifyTenonLauncher: (host: NativeRuntimeHost) => Promise<boolean>
  readonly verifyTenonSession: (host: NativeRuntimeHost, receipt: LegacyMigrationReceipt) => Promise<boolean>
  readonly rollbackTenonRuntime: (host: NativeRuntimeHost, previousRelease: string | null) => Promise<void>
  readonly removeLegacyRegistration: (host: NativeRuntimeHost, scope: string) => Promise<void>
  readonly removeOwnedLegacyLaunchers: (host: NativeRuntimeHost) => Promise<void>
}

export interface LegacyMigrationResult {
  readonly ok: boolean
  readonly state: LegacyMigrationState | 'not-needed'
  readonly detail: string
  readonly receipt: LegacyMigrationReceipt | null
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function receiptBase(
  host: NativeRuntimeHost,
  legacyScope: string,
  candidate: TenonMigrationCandidate,
  verified: VerifiedTenonCandidate,
  activation: ActivatedTenonRuntime,
  at: string,
): Omit<LegacyMigrationReceipt, 'state' | 'updatedAt' | 'detail'> {
  return {
    version: 1,
    host,
    legacyIdentity: LEGACY_PLUGIN_IDENTITY,
    tenonIdentity: TENON_PLUGIN_IDENTITY,
    legacyScope,
    candidateRoot: candidate.root,
    pluginVersion: candidate.pluginVersion,
    payloadDigest: verified.payloadDigest,
    releaseId: activation.releaseId,
    previousRelease: activation.previousRelease,
    activatedAt: at,
    migrationDeadline: LEGACY_TENON_MIGRATION_DEADLINE,
  }
}

async function activate(
  host: NativeRuntimeHost,
  deps: LegacyMigrationDeps,
): Promise<LegacyMigrationResult> {
  const legacy = await deps.detectLegacy(host)
  if (!legacy.present) {
    return {
      ok: true,
      state: 'not-needed',
      detail: '未发现受支持的旧插件登记；未执行迁移。',
      receipt: null,
    }
  }

  let candidate: TenonMigrationCandidate | null = null
  let verified: VerifiedTenonCandidate | null = null
  let activation: ActivatedTenonRuntime | null = null
  const activatedAt = deps.now()
  try {
    candidate = await deps.installTenonCandidate(host)
    verified = await deps.verifyTenonCandidate(host, candidate)
    activation = await deps.activateTenonRuntime(host, candidate)
    if (!await deps.verifyTenonLauncher(host)) {
      throw new Error('Tenon launcher 验证失败')
    }
    const receipt: LegacyMigrationReceipt = {
      ...receiptBase(host, legacy.scope, candidate, verified, activation, activatedAt),
      state: 'cleanup-pending',
      updatedAt: deps.now(),
      detail: 'Tenon 候选和 runtime 已验证；等待新宿主会话加载 Tenon 后清理旧登记。',
    }
    await deps.writeReceipt(receipt)
    return { ok: true, state: receipt.state, detail: receipt.detail, receipt }
  } catch (error) {
    if (activation !== null) {
      try {
        await deps.rollbackTenonRuntime(host, activation.previousRelease)
      } catch {
        // The original failure remains authoritative; the durable receipt below records rollback risk.
      }
    }
    const failedAt = deps.now()
    const receipt: LegacyMigrationReceipt = {
      ...receiptBase(
        host,
        legacy.scope,
        candidate ?? { root: '', pluginVersion: 'unknown' },
        verified ?? { payloadDigest: '' },
        activation ?? { releaseId: '', previousRelease: null },
        activatedAt,
      ),
      state: 'failed',
      updatedAt: failedAt,
      detail: `迁移失败，旧登记未清理：${detailOf(error)}`,
    }
    try {
      await deps.writeReceipt(receipt)
    } catch {
      // A receipt I/O failure must not turn a failed migration into success.
    }
    return { ok: false, state: receipt.state, detail: receipt.detail, receipt }
  }
}

async function finalize(
  host: NativeRuntimeHost,
  deps: LegacyMigrationDeps,
  receipt: LegacyMigrationReceipt | null,
): Promise<LegacyMigrationResult> {
  if (receipt === null || receipt.host !== host || receipt.state !== 'cleanup-pending') {
    return {
      ok: false,
      state: receipt?.state ?? 'not-needed',
      detail: '没有可收口的 cleanup-pending 迁移 receipt。',
      receipt,
    }
  }
  if (!await deps.verifyTenonLauncher(host)) {
    return { ok: false, state: receipt.state, detail: 'Tenon launcher 尚未通过复验；保留旧登记。', receipt }
  }
  if (!await deps.verifyTenonSession(host, receipt)) {
    return { ok: false, state: receipt.state, detail: '新宿主会话尚未证明已加载 Tenon；保留旧登记。', receipt }
  }

  try {
    await deps.removeLegacyRegistration(host, receipt.legacyScope)
    await deps.removeOwnedLegacyLaunchers(host)
    const completed: LegacyMigrationReceipt = {
      ...receipt,
      state: 'completed',
      updatedAt: deps.now(),
      detail: 'Tenon 新会话已验证；旧插件登记与受管 launcher 已清理。',
    }
    await deps.writeReceipt(completed)
    return { ok: true, state: completed.state, detail: completed.detail, receipt: completed }
  } catch (error) {
    const pending: LegacyMigrationReceipt = {
      ...receipt,
      updatedAt: deps.now(),
      detail: `清理未完成，可安全重试：${detailOf(error)}`,
    }
    try {
      await deps.writeReceipt(pending)
    } catch {
      // Preserve the original cleanup failure and keep the operation retryable.
    }
    return { ok: false, state: pending.state, detail: pending.detail, receipt: pending }
  }
}

/**
 * Two-step cross-brand migration used only by the frozen legacy distribution channel.
 *
 * `activate` installs and verifies Tenon, atomically selects its runtime, and stops at
 * `cleanup-pending`. `finalize` requires an independently verified Tenon host session before it
 * removes any old registration. The Tenon CLI never exposes a legacy command alias.
 */
export async function runLegacyTenonMigration(
  host: NativeRuntimeHost,
  action: LegacyMigrationAction,
  deps: LegacyMigrationDeps,
): Promise<LegacyMigrationResult> {
  const receipt = await deps.readReceipt(host)
  if (receipt?.state === 'completed') {
    return { ok: true, state: receipt.state, detail: receipt.detail, receipt }
  }
  return action === 'activate'
    ? activate(host, deps)
    : finalize(host, deps, receipt)
}
