import { randomUUID } from 'node:crypto'
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { atomicWriteFile, withLock } from '@tenon/kernel'
import type {
  RuntimeActivation,
  RuntimeAuditEntry,
  RuntimeInspection,
  RuntimePaths,
  RuntimeReleaseManifest,
  RuntimeReleaseSource,
  RuntimeSelection,
} from './types.js'
import { RuntimeFailure } from './types.js'
import { compensateActivation } from './activation-compensation.js'
import {
  isExistingReleaseCollision,
  lastAudit,
  readReleaseManifest,
  readSelection,
  stableJson,
  validReleaseId,
  writeAudit,
} from './release-store-codecs.js'
import {
  assertFile,
  copyReleasePayload,
  defaultRuntimeCommandRunner,
  hashReleasePayload,
  releaseCandidateVersion,
  runChecked,
  verifyReleasePayload,
  type RuntimeCommandRunner,
} from './release-payload.js'
export {
  inspectCandidatePayload,
  type CandidatePayloadIdentity,
  type RuntimeCommandRunner,
} from './release-payload.js'

export type RuntimeAuditWriter = (paths: RuntimePaths, entry: RuntimeAuditEntry) => Promise<void>

export interface RuntimeReleaseStoreOptions {
  readonly paths: RuntimePaths
  readonly now?: () => string
  readonly runner?: RuntimeCommandRunner
  readonly retainedReleases?: number
  readonly auditWriter?: RuntimeAuditWriter
}
export class RuntimeReleaseStore {
  private readonly paths: RuntimePaths
  private readonly now: () => string
  private readonly runner: RuntimeCommandRunner
  private readonly retainedReleases: number
  private readonly auditWriter: RuntimeAuditWriter

  constructor(options: RuntimeReleaseStoreOptions) {
    this.paths = options.paths
    this.now = options.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'))
    this.runner = options.runner ?? defaultRuntimeCommandRunner()
    this.retainedReleases = Math.max(2, options.retainedReleases ?? 3)
    this.auditWriter = options.auditWriter ?? writeAudit
  }

  async stageAndActivate(
    candidateRoot: string,
    host: RuntimeReleaseSource['host'],
    expectedPluginVersion?: string,
  ): Promise<RuntimeActivation> {
    const absoluteCandidate = resolve(candidateRoot)
    await this.prepareRoots()
    try {
      return await withLock(this.paths.stateRoot, async () =>
        this.stageAndActivateUnderLock(absoluteCandidate, host, expectedPluginVersion))
    } catch (error) {
      if (error instanceof RuntimeFailure) throw error
      throw new RuntimeFailure('candidate-invalid', `无法安装候选 runtime: ${String(error)}`)
    }
  }

  async inspect(): Promise<RuntimeInspection> {
    await this.prepareRoots()
    const selection = await readSelection(this.paths)
    const active = selection.activeRelease === null ? null : await this.validateStoredRelease(selection.activeRelease)
    const previous = selection.previousRelease === null ? null : await this.validateStoredRelease(selection.previousRelease)
    return {
      selection,
      active,
      previous,
      activeValid: selection.activeRelease === null ? false : active !== null,
      previousValid: selection.previousRelease === null ? false : previous !== null,
      lastAudit: await lastAudit(this.paths),
    }
  }

  async rollbackToPrevious(): Promise<RuntimeActivation> {
    await this.prepareRoots()
    return withLock(this.paths.stateRoot, async () => {
      const selection = await readSelection(this.paths)
      if (selection.previousRelease === null) {
        throw new RuntimeFailure('no-recovery-release', '没有可回滚的已验证 runtime release；请重新运行 tenon setup --<host>')
      }
      const manifest = await this.validateStoredRelease(selection.previousRelease)
      if (manifest === null) {
        throw new RuntimeFailure('no-recovery-release', 'previous runtime release 无法通过完整性校验；请重新运行 tenon setup --<host>')
      }
      const previousRoot = this.releaseRoot(manifest.releaseId)
      const next: RuntimeSelection = {
        version: 1,
        revision: selection.revision + 1,
        activeRelease: manifest.releaseId,
        previousRelease: selection.activeRelease,
        updatedAt: this.now(),
      }
      try {
        // Write-ahead audit: an audit failure must occur before either bootstrap or selection moves.
        await this.auditWriter(this.paths, {
          version: 1,
          at: this.now(),
          kind: 'rolled-back',
          releaseId: manifest.releaseId,
          previousRelease: selection.activeRelease,
          detail: 'verified rollback prepared; selection publication follows under the same lock',
        })
        await this.installBootstrap(previousRoot)
        await atomicWriteFile(this.paths.selectionPath, stableJson(next))
        return { selection: next, release: manifest, releaseRoot: previousRoot }
      } catch (error) {
        await this.auditWriter(this.paths, {
          version: 1,
          at: this.now(),
          kind: 'rollback-rejected',
          releaseId: manifest.releaseId,
          previousRelease: selection.activeRelease,
          detail: error instanceof Error ? error.message : String(error),
        }).catch(() => {})
        throw error
      }
    })
  }

  async revertActivation(activated: RuntimeSelection): Promise<void> {
    await this.prepareRoots()
    await withLock(this.paths.stateRoot, async () => {
      await compensateActivation({
        paths: this.paths,
        activated,
        current: await readSelection(this.paths),
        now: this.now,
        audit: (entry) => this.auditWriter(this.paths, entry),
        validateRelease: (releaseId) => this.validateStoredRelease(releaseId),
        installBootstrap: (releaseId) => this.installBootstrap(this.releaseRoot(releaseId)),
      })
    })
  }

  async recordUpdateFailure(detail: string): Promise<void> {
    await this.prepareRoots()
    await withLock(this.paths.stateRoot, async () => {
      await this.auditWriter(this.paths, {
        version: 1,
        at: this.now(),
        kind: 'update-rejected',
        detail,
      })
    })
  }

  private async stageAndActivateUnderLock(
    candidateRoot: string,
    host: RuntimeReleaseSource['host'],
    expectedPluginVersion?: string,
  ): Promise<RuntimeActivation> {
    const stageRoot = join(this.paths.stagingRoot, `release-${randomUUID()}`)
    const payloadRoot = join(stageRoot, 'payload')
    let releaseId: string | null = null
    try {
      await mkdir(payloadRoot, { recursive: true })
      await copyReleasePayload(candidateRoot, payloadRoot)
      await verifyReleasePayload(payloadRoot, this.runner)
      const payloadDigest = await hashReleasePayload(payloadRoot)
      releaseId = `sha256-${payloadDigest}`
      const pluginVersion = await releaseCandidateVersion(candidateRoot)
      if (expectedPluginVersion !== undefined && pluginVersion !== expectedPluginVersion) {
        throw new RuntimeFailure(
          'candidate-invalid',
          `候选 plugin version ${pluginVersion} 与冻结目标 ${expectedPluginVersion} 不一致`,
        )
      }
      const source: RuntimeReleaseSource = { host, pluginVersion }
      const manifest: RuntimeReleaseManifest = {
        version: 1,
        releaseId,
        payloadDigest,
        createdAt: this.now(),
        source,
      }
      await atomicWriteFile(join(stageRoot, 'release.json'), stableJson(manifest))

      const finalRoot = this.releaseRoot(releaseId)
      let effectiveManifest = manifest
      try {
        await rename(stageRoot, finalRoot)
      } catch (error) {
        if (!isExistingReleaseCollision(error)) throw error
        const existing = await this.validateStoredRelease(releaseId)
        if (existing === null) throw new RuntimeFailure('runtime-corrupt', `现有 release 无法验证: ${releaseId}`)
        effectiveManifest = existing
      }

      const selection = await readSelection(this.paths)
      const next: RuntimeSelection = {
        version: 1,
        revision: selection.revision + 1,
        activeRelease: releaseId,
        previousRelease: selection.activeRelease === releaseId ? selection.previousRelease : selection.activeRelease,
        updatedAt: this.now(),
      }
      // Write-ahead audit: do not return an activation failure after selection already changed.
      await this.auditWriter(this.paths, {
        version: 1,
        at: this.now(),
        kind: 'activated',
        releaseId,
        previousRelease: selection.activeRelease,
        detail: `verified ${host} candidate activation prepared; publication follows under the same lock`,
      })
      await this.installBootstrap(finalRoot)
      await atomicWriteFile(this.paths.selectionPath, stableJson(next))
      // Retention is post-commit housekeeping. A pruning/audit problem must not turn a successful
      // activation into a reported failure after the canonical selection has already changed.
      await this.prune(next).catch(() => {})
      return { selection: next, release: effectiveManifest, releaseRoot: finalRoot }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      await this.auditWriter(this.paths, {
        version: 1,
        at: this.now(),
        kind: 'activation-rejected',
        ...(releaseId === null ? {} : { releaseId }),
        detail,
      }).catch(() => {})
      throw error
    } finally {
      await rm(stageRoot, { recursive: true, force: true }).catch(() => {})
    }
  }

  private async prepareRoots(): Promise<void> {
    await Promise.all([
      mkdir(this.paths.dataRoot, { recursive: true }),
      mkdir(this.paths.stateRoot, { recursive: true }),
      mkdir(this.paths.configRoot, { recursive: true }),
      mkdir(this.paths.releasesRoot, { recursive: true }),
      mkdir(this.paths.stagingRoot, { recursive: true }),
      mkdir(this.paths.bootstrapRoot, { recursive: true }),
    ])
  }

  private releaseRoot(releaseId: string): string {
    if (!validReleaseId(releaseId)) throw new RuntimeFailure('runtime-corrupt', `非法 runtime release id: ${releaseId}`)
    return join(this.paths.releasesRoot, releaseId)
  }

  private async validateStoredRelease(releaseId: string): Promise<RuntimeReleaseManifest | null> {
    if (!validReleaseId(releaseId)) return null
    const root = this.releaseRoot(releaseId)
    const manifest = await readReleaseManifest(root)
    if (manifest === null || manifest.releaseId !== releaseId) return null
    const payloadRoot = join(root, 'payload')
    try {
      if ((await hashReleasePayload(payloadRoot)) !== manifest.payloadDigest) return null
      await verifyReleasePayload(payloadRoot, this.runner)
      return manifest
    } catch {
      return null
    }
  }

  private async installBootstrap(releaseRoot: string): Promise<void> {
    const source = join(releaseRoot, 'payload', 'runtime', 'tenon-bootstrap.mjs')
    await assertFile(source, 'runtime bootstrap')
    await runChecked(this.runner, process.execPath, ['--check', source], releaseRoot, 'runtime bootstrap syntax')
    const active = join(this.paths.bootstrapRoot, 'active.mjs')
    const previous = join(this.paths.bootstrapRoot, 'previous.mjs')
    try {
      await stat(active)
      await atomicWriteFile(previous, await readFile(active, 'utf8'))
      await chmod(previous, 0o755)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await atomicWriteFile(active, await readFile(source, 'utf8'))
    await chmod(active, 0o755)
  }

  private async prune(selection: RuntimeSelection): Promise<void> {
    const protectedIds = new Set([selection.activeRelease, selection.previousRelease].filter((value): value is string => value !== null))
    const entries = await readdir(this.paths.releasesRoot, { withFileTypes: true })
    const candidates: Array<{ id: string; modifiedAt: number }> = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !validReleaseId(entry.name) || protectedIds.has(entry.name)) continue
      try {
        candidates.push({ id: entry.name, modifiedAt: (await stat(join(this.paths.releasesRoot, entry.name))).mtimeMs })
      } catch {
        // A concurrently removed unprotected release is already absent.
      }
    }
    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
    const keep = Math.max(0, this.retainedReleases - protectedIds.size)
    for (const candidate of candidates.slice(keep)) {
      await rm(this.releaseRoot(candidate.id), { recursive: true, force: true })
      await this.auditWriter(this.paths, {
        version: 1,
        at: this.now(),
        kind: 'pruned',
        releaseId: candidate.id,
        detail: 'unprotected verified release exceeded retention limit',
      })
    }
  }
}
