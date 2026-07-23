import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { withRegistryGovernanceLock } from './governance.js'
import { loadRegistry } from './registry.js'
import {
  applyReconciliationOperations,
  decodeReconciliationPlan,
  ReconciliationPlanCodecError,
  resourceEpoch,
} from './reconciliation.js'
import type { ResourceEpoch } from './reconciliation.js'
import type { LoopEntry } from './types.js'

export interface ReconciliationSnapshot {
  readonly registry_bytes: Uint8Array | null
  readonly registry_epoch: ResourceEpoch
  readonly loop_doc_bytes: Uint8Array | null
  readonly loop_doc_epoch: ResourceEpoch
}

export type ReconciliationResource = 'registry' | 'loop_doc'

export class ReconciliationResourceError extends Error {
  readonly _tag = 'ReconciliationResourceError'
  readonly resource: ReconciliationResource
  readonly path: string
  readonly reason: 'symlink' | 'not-regular-file' | 'changed-during-read' | 'io'
  readonly code: string | undefined
  override readonly cause: unknown

  constructor(
    resource: ReconciliationResource,
    path: string,
    reason: ReconciliationResourceError['reason'],
    cause?: unknown,
  ) {
    const code = (cause as NodeJS.ErrnoException | undefined)?.code
    super(`reconciliation ${resource} read failed (${reason}${code === undefined ? '' : `/${code}`}): ${path}`)
    this.name = 'ReconciliationResourceError'
    this.resource = resource
    this.path = path
    this.reason = reason
    this.code = code
    this.cause = cause
  }
}

export class ReconciliationSourceError extends Error {
  readonly _tag = 'ReconciliationSourceError'
  readonly source: 'registry' | 'loop_doc' | 'plan'
  readonly detail: string

  constructor(source: ReconciliationSourceError['source'], detail: string) {
    super(`reconciliation ${source} source is invalid: ${detail}`)
    this.name = 'ReconciliationSourceError'
    this.source = source
    this.detail = detail
  }
}

export interface ReconciliationApplyWarning {
  readonly stage: 'directory-fsync' | 'readback'
  readonly message: string
}

export interface ReconciliationEpochConflict {
  readonly resource: ReconciliationResource
  readonly expected: ResourceEpoch
  readonly actual: ResourceEpoch
}

export type ReconciliationApplyResult =
  | {
      readonly status: 'applied'
      readonly plan_id: string
      readonly loop_doc_epoch: ResourceEpoch
      readonly warnings: readonly ReconciliationApplyWarning[]
    }
  | {
      readonly status: 'noop'
      readonly plan_id: string
      readonly loop_doc_epoch: ResourceEpoch
      readonly warnings: readonly []
    }
  | {
      readonly status: 'conflict'
      readonly reason: 'stale-precondition'
      readonly plan_id: string
      readonly conflicts: readonly ReconciliationEpochConflict[]
    }

async function readRawFile(resource: ReconciliationResource, path: string): Promise<Uint8Array | null> {
  let before: Awaited<ReturnType<typeof lstat>>
  try {
    before = await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new ReconciliationResourceError(resource, path, 'io', error)
  }
  if (before.isSymbolicLink()) {
    throw new ReconciliationResourceError(resource, path, 'symlink')
  }
  if (!before.isFile()) {
    throw new ReconciliationResourceError(resource, path, 'not-regular-file')
  }

  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new ReconciliationResourceError(
      resource,
      path,
      (error as NodeJS.ErrnoException).code === 'ELOOP' ? 'symlink' : 'io',
      error,
    )
  }
  try {
    const opened = await handle.stat()
    if (!opened.isFile()) {
      throw new ReconciliationResourceError(resource, path, 'not-regular-file')
    }
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new ReconciliationResourceError(resource, path, 'changed-during-read')
    }
    return new Uint8Array(await handle.readFile())
  } catch (error) {
    if (error instanceof ReconciliationResourceError) throw error
    throw new ReconciliationResourceError(resource, path, 'io', error)
  } finally {
    await handle.close()
  }
}

export async function readReconciliationSnapshot(repoRoot: string): Promise<ReconciliationSnapshot> {
  const [registryBytes, loopDocBytes] = await Promise.all([
    readRawFile('registry', join(repoRoot, '.pipeline', 'loops.yaml')),
    readRawFile('loop_doc', join(repoRoot, 'LOOP.md')),
  ])
  return {
    registry_bytes: registryBytes,
    registry_epoch: resourceEpoch(registryBytes),
    loop_doc_bytes: loopDocBytes,
    loop_doc_epoch: resourceEpoch(loopDocBytes),
  }
}

function epochsEqual(left: ResourceEpoch, right: ResourceEpoch): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'absent') return true
  return right.kind === 'sha256' && left.value === right.value
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  for (let i = 0; i < left.byteLength; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}

function parseRegistryBytes(repoRoot: string, bytes: Uint8Array | null): readonly LoopEntry[] {
  if (bytes === null) return []
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ReconciliationSourceError('registry', 'bytes are not valid UTF-8')
  }
  const loaded = loadRegistry(repoRoot, { readText: () => text })
  if (loaded.data === null || loaded.errors.length > 0) {
    throw new ReconciliationSourceError(
      'registry',
      loaded.errors.length > 0 ? loaded.errors.join('; ') : 'registry is absent after decoding present bytes',
    )
  }
  return loaded.data.loops
}

async function publishLoopDoc(
  repoRoot: string,
  bytes: Uint8Array,
): Promise<readonly ReconciliationApplyWarning[]> {
  const target = join(repoRoot, 'LOOP.md')
  const temporary = join(repoRoot, `.LOOP.md.tmp.${process.pid}.${randomBytes(8).toString('hex')}`)
  let created = false
  let committed = false
  try {
    const handle = await open(temporary, 'wx')
    created = true
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, target)
    // Commit point: from here on LOOP.md has been atomically published. Durability/readback failures must be
    // reported as warnings, never converted into a false "not applied" result that invites a duplicate retry.
    committed = true
  } finally {
    if (created && !committed) await unlink(temporary).catch(() => {})
  }

  const warnings: ReconciliationApplyWarning[] = []
  try {
    const directory = await open(repoRoot, 'r')
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } catch (error) {
    warnings.push({
      stage: 'directory-fsync',
      message: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    const readback = await readRawFile('loop_doc', target)
    if (readback === null) {
      warnings.push({ stage: 'readback', message: 'LOOP.md was absent after atomic publish' })
    } else if (!bytesEqual(readback, bytes)) {
      const expected = createHash('sha256').update(bytes).digest('hex')
      const actual = createHash('sha256').update(readback).digest('hex')
      warnings.push({ stage: 'readback', message: `LOOP.md readback mismatch (${expected} != ${actual})` })
    }
  } catch (error) {
    warnings.push({
      stage: 'readback',
      message: error instanceof Error ? error.message : String(error),
    })
  }
  return warnings
}

export async function applyReconciliationPlan(
  repoRoot: string,
  encodedPlan: string | Uint8Array,
): Promise<ReconciliationApplyResult> {
  const decoded = decodeReconciliationPlan(encodedPlan)
  if (!decoded.ok) throw new ReconciliationPlanCodecError(decoded.errors)
  const plan = decoded.plan

  return withRegistryGovernanceLock(repoRoot, async (): Promise<ReconciliationApplyResult> => {
    const snapshot = await readReconciliationSnapshot(repoRoot)
    const conflicts: ReconciliationEpochConflict[] = []
    if (!epochsEqual(snapshot.registry_epoch, plan.preconditions.registry_epoch)) {
      conflicts.push({
        resource: 'registry',
        expected: plan.preconditions.registry_epoch,
        actual: snapshot.registry_epoch,
      })
    }
    if (!epochsEqual(snapshot.loop_doc_epoch, plan.preconditions.loop_doc_epoch)) {
      conflicts.push({
        resource: 'loop_doc',
        expected: plan.preconditions.loop_doc_epoch,
        actual: snapshot.loop_doc_epoch,
      })
    }
    if (conflicts.length > 0) {
      return {
        status: 'conflict',
        reason: 'stale-precondition',
        plan_id: plan.plan_id,
        conflicts,
      }
    }

    const transformed = applyReconciliationOperations({
      loop_doc_bytes: snapshot.loop_doc_bytes,
      loops: parseRegistryBytes(repoRoot, snapshot.registry_bytes),
      operations: plan.operations,
    })
    if (!transformed.ok) {
      throw new ReconciliationSourceError('loop_doc', `${transformed.reason}: ${transformed.detail}`)
    }
    if (!epochsEqual(transformed.epoch, plan.expected_loop_doc_epoch)) {
      throw new ReconciliationSourceError(
        'plan',
        `computed LOOP.md epoch does not match expected_loop_doc_epoch`,
      )
    }
    if (!transformed.changed) {
      return {
        status: 'noop',
        plan_id: plan.plan_id,
        loop_doc_epoch: transformed.epoch,
        warnings: [],
      }
    }

    const warnings = await publishLoopDoc(repoRoot, transformed.bytes)
    return {
      status: 'applied',
      plan_id: plan.plan_id,
      loop_doc_epoch: transformed.epoch,
      warnings,
    }
  })
}
