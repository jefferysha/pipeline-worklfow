import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWriteFile } from '@tenon/kernel'
import { stableJson } from './release-store-codecs.js'
import type {
  RuntimeAuditEntry,
  RuntimePaths,
  RuntimeReleaseManifest,
  RuntimeSelection,
} from './types.js'
import { RuntimeFailure } from './types.js'

export interface ActivationCompensation {
  readonly paths: RuntimePaths
  readonly activated: RuntimeSelection
  readonly current: RuntimeSelection
  readonly now: () => string
  readonly audit: (entry: RuntimeAuditEntry) => Promise<void>
  readonly validateRelease: (releaseId: string) => Promise<RuntimeReleaseManifest | null>
}

/** Compensate only the exact activation that failed its post-publication readiness gate. */
export async function compensateActivation(input: ActivationCompensation): Promise<void> {
  const { activated, current } = input
  if (current.revision !== activated.revision
    || current.activeRelease !== activated.activeRelease
    || current.previousRelease !== activated.previousRelease) {
    throw new RuntimeFailure(
      'runtime-corrupt',
      'runtime selection 已被其他更新推进；拒绝回滚非当前 activation',
    )
  }
  const restoredRelease = activated.previousRelease
  const restored: RuntimeSelection = {
    version: 1,
    revision: current.revision + 1,
    activeRelease: restoredRelease,
    previousRelease: current.activeRelease,
    updatedAt: input.now(),
  }
  if (restoredRelease !== null) {
    const manifest = await input.validateRelease(restoredRelease)
    if (manifest === null) {
      throw new RuntimeFailure('no-recovery-release', 'activation 的 previous runtime 无法通过完整性校验')
    }
  }
  await input.audit({
    version: 1,
    at: input.now(),
    kind: 'rollback-prepared',
    ...(restoredRelease === null ? {} : { releaseId: restoredRelease }),
    previousRelease: current.activeRelease,
    detail: 'post-activation readiness compensation prepared; selection publication follows',
  })
  try {
    // The current bootstrap is the hardened, backward-compatible execution boundary. Selecting a
    // previous release must never replace it with payload bytes from that older release.
    await atomicWriteFile(input.paths.selectionPath, stableJson(restored))
  } catch (error) {
    await input.audit({
      version: 1,
      at: input.now(),
      kind: 'rollback-rejected',
      ...(restoredRelease === null ? {} : { releaseId: restoredRelease }),
      previousRelease: current.activeRelease,
      detail: error instanceof Error ? error.message : String(error),
    }).catch(() => {})
    throw error
  }
  if (restoredRelease === null) {
    // First-install compensation has no executable release. A stale hardened bootstrap is not an
    // authority source because selection is already null, but remove it as best-effort hygiene.
    await rm(join(input.paths.bootstrapRoot, 'active.mjs'), { force: true }).catch(() => {})
  }
  await input.audit({
    version: 1,
    at: input.now(),
    kind: 'rolled-back',
    ...(restoredRelease === null ? {} : { releaseId: restoredRelease }),
    previousRelease: current.activeRelease,
    detail: 'post-activation readiness failed; exact current activation selection was compensated',
  }).catch(() => {})
}
