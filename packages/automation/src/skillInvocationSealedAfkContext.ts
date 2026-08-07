import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkillInvocationSubjectV1 } from '@tenon/kernel'
import { SKILL_BUNDLE_CONTAINER_DIR } from './lifecycle/lifecycle-support.js'
import { computePublishDigest } from './skills/snapshot-store.js'
import type { SkillSnapshotProvenance } from './skills/types.js'

const MAX_MANIFEST_BYTES = 1_048_576
const SHA256 = /^[0-9a-f]{64}$/u
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u
const RESOLUTION_SOURCES = ['default', 'custom'] as const
const issuedContexts = new WeakSet<object>()

export class SealedAfkSkillInvocationContextError extends Error {
  override readonly name = 'SealedAfkSkillInvocationContextError'
}

export interface SealedAfkSkillInvocationContext {
  readonly bundle_digest: string
  readonly attempt_id: string
  readonly reservation_id: string
  readonly workflow_run_id: string
  readonly workflow: string
  readonly step: string
  readonly selected_skill_ids: readonly string[]
}

interface ManifestRecord {
  readonly schemaVersion: 1
  readonly digest: string
  readonly skills: readonly { readonly skillId: string; readonly treeSha256: string; readonly fileCount: number }[]
  readonly files: readonly { readonly relativePath: string; readonly sha256: string; readonly executable: boolean }[]
  readonly provenance: SkillSnapshotProvenance
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function closed(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key))
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value) && !value.includes('..')
}

function parseManifest(raw: string): ManifestRecord {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new SealedAfkSkillInvocationContextError('sealed AFK manifest is not valid JSON')
  }
  if (!isRecord(value)
    || !closed(value, ['schemaVersion', 'digest', 'skills', 'files', 'provenance'])
    || value.schemaVersion !== 1
    || typeof value.digest !== 'string'
    || !SHA256.test(value.digest)
    || !Array.isArray(value.skills)
    || value.skills.length === 0
    || value.skills.length > 64
    || !Array.isArray(value.files)
    || value.files.length > 4096
    || !isRecord(value.provenance)) {
    throw new SealedAfkSkillInvocationContextError('sealed AFK manifest has an invalid closed schema')
  }
  const skills = value.skills.map((candidate) => {
    if (!isRecord(candidate)
      || !closed(candidate, ['skillId', 'treeSha256', 'fileCount'])
      || !validId(candidate.skillId)
      || typeof candidate.treeSha256 !== 'string'
      || !SHA256.test(candidate.treeSha256)
      || !Number.isSafeInteger(candidate.fileCount)
      || (candidate.fileCount as number) < 1) {
      throw new SealedAfkSkillInvocationContextError('sealed AFK skill descriptor is invalid')
    }
    return {
      skillId: candidate.skillId,
      treeSha256: candidate.treeSha256,
      fileCount: candidate.fileCount as number,
    }
  })
  const files = value.files.map((candidate) => {
    if (!isRecord(candidate)
      || !closed(candidate, ['relativePath', 'sha256', 'executable'])
      || typeof candidate.relativePath !== 'string'
      || candidate.relativePath.startsWith('/')
      || candidate.relativePath.includes('\\')
      || candidate.relativePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
      || typeof candidate.sha256 !== 'string'
      || !SHA256.test(candidate.sha256)
      || typeof candidate.executable !== 'boolean') {
      throw new SealedAfkSkillInvocationContextError('sealed AFK file descriptor is invalid')
    }
    return {
      relativePath: candidate.relativePath,
      sha256: candidate.sha256,
      executable: candidate.executable,
    }
  })
  const provenance = value.provenance
  if (!closed(
    provenance,
    ['loop_id', 'policy_epoch', 'skill_bundle_id', 'attempt_id', 'reservation_id', 'workflow_run_id', 'workflow', 'step', 'track', 'coordinate_digest', 'resolution_source', 'slots'],
  )) {
    throw new SealedAfkSkillInvocationContextError('sealed AFK provenance is incomplete or open-ended')
  }
  for (const key of [
    'loop_id', 'policy_epoch', 'skill_bundle_id', 'attempt_id', 'reservation_id',
    'workflow_run_id', 'workflow', 'step', 'track', 'coordinate_digest',
  ] as const) {
    if (!validId(provenance[key])) {
      throw new SealedAfkSkillInvocationContextError(`sealed AFK provenance ${key} is invalid`)
    }
  }
  let resolutionSource: (typeof RESOLUTION_SOURCES)[number] | undefined
  for (const candidate of RESOLUTION_SOURCES) {
    if (provenance.resolution_source === candidate) resolutionSource = candidate
  }
  if (resolutionSource === undefined || !Array.isArray(provenance.slots)
    || provenance.slots.length === 0
    || provenance.slots.length > 64) {
    throw new SealedAfkSkillInvocationContextError('sealed AFK provenance slots are invalid')
  }
  const slots = provenance.slots.map((candidate) => {
    if (!isRecord(candidate)
      || !closed(candidate, ['alternatives', 'concrete_skill_id', 'tree_sha256'])
      || !Array.isArray(candidate.alternatives)
      || candidate.alternatives.length === 0
      || candidate.alternatives.length > 16
      || !candidate.alternatives.every(validId)
      || !validId(candidate.concrete_skill_id)
      || !candidate.alternatives.includes(candidate.concrete_skill_id)
      || typeof candidate.tree_sha256 !== 'string'
      || !SHA256.test(candidate.tree_sha256)) {
      throw new SealedAfkSkillInvocationContextError('sealed AFK provenance slot is invalid')
    }
    return {
      alternatives: [...candidate.alternatives] as string[],
      concrete_skill_id: candidate.concrete_skill_id,
      tree_sha256: candidate.tree_sha256,
    }
  })
  const selected = new Set(slots.map((slot) => slot.concrete_skill_id))
  if (selected.size !== slots.length
    || skills.length !== selected.size
    || skills.some((skill) => !selected.has(skill.skillId))
    || slots.some((slot) => skills.find((skill) => skill.skillId === slot.concrete_skill_id)?.treeSha256 !== slot.tree_sha256)) {
    throw new SealedAfkSkillInvocationContextError('sealed AFK selected skills disagree with the descriptor')
  }
  const typedProvenance: SkillSnapshotProvenance = {
    loop_id: provenance.loop_id as string,
    policy_epoch: provenance.policy_epoch as string,
    skill_bundle_id: provenance.skill_bundle_id as string,
    attempt_id: provenance.attempt_id as string,
    reservation_id: provenance.reservation_id as string,
    workflow_run_id: provenance.workflow_run_id as string,
    workflow: provenance.workflow as string,
    step: provenance.step as string,
    track: provenance.track as string,
    coordinate_digest: provenance.coordinate_digest as string,
    resolution_source: resolutionSource,
    slots,
  }
  if (computePublishDigest(files, skills, typedProvenance) !== value.digest) {
    throw new SealedAfkSkillInvocationContextError('sealed AFK manifest digest does not cover its descriptor')
  }
  return { schemaVersion: 1, digest: value.digest, skills, files, provenance: typedProvenance }
}

async function readRegularNoFollow(path: string, maximum: number, requiredOwnerUid: number): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.uid !== requiredOwnerUid || (stat.mode & 0o222) !== 0
      || stat.size < 1 || stat.size > maximum) {
      throw new SealedAfkSkillInvocationContextError('sealed AFK proof file is not a bounded regular file')
    }
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

/** Package-internal test seam. The public package root exposes only the fixed container reader. */
export async function readSealedAfkSkillInvocationContextAt(
  root: string,
  requiredOwnerUid = 0,
): Promise<SealedAfkSkillInvocationContext> {
  const before = await lstat(root)
  if (!before.isDirectory() || before.isSymbolicLink() || before.uid !== requiredOwnerUid || (before.mode & 0o222) !== 0) {
    throw new SealedAfkSkillInvocationContextError('AFK bundle root is not root-owned and sealed')
  }
  const manifestBytes = await readRegularNoFollow(join(root, 'manifest.json'), MAX_MANIFEST_BYTES, requiredOwnerUid)
  const manifest = parseManifest(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes))
  const marker = await readRegularNoFollow(join(root, '.snapshot-committed'), 128, requiredOwnerUid)
  if (!marker.equals(Buffer.from(`${manifest.digest}\n`, 'utf8'))) {
    throw new SealedAfkSkillInvocationContextError('sealed AFK commit marker does not match the manifest')
  }
  const after = await lstat(root)
  if (!after.isDirectory() || after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino) {
    throw new SealedAfkSkillInvocationContextError('sealed AFK bundle root changed during the anchored read')
  }
  const context: SealedAfkSkillInvocationContext = Object.freeze({
    bundle_digest: manifest.digest,
    attempt_id: manifest.provenance.attempt_id,
    reservation_id: manifest.provenance.reservation_id,
    workflow_run_id: manifest.provenance.workflow_run_id as string,
    workflow: manifest.provenance.workflow,
    step: manifest.provenance.step,
    selected_skill_ids: Object.freeze(manifest.provenance.slots.map((slot) => slot.concrete_skill_id)),
  })
  issuedContexts.add(context)
  return context
}

export async function readSealedAfkSkillInvocationContext(): Promise<SealedAfkSkillInvocationContext | undefined> {
  try {
    return await readSealedAfkSkillInvocationContextAt(SKILL_BUNDLE_CONTAINER_DIR)
  } catch (error) {
    if (typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'ENOENT') return undefined
    throw error
  }
}

export function consumeSealedAfkSkillInvocationContext(
  context: SealedAfkSkillInvocationContext,
  subject: SkillInvocationSubjectV1,
  skillId: string,
): { readonly adapter: { readonly kind: 'afk'; readonly proof_ref: string }; readonly attempt: { readonly attempt_id: string; readonly reservation_id: string } } {
  if (!issuedContexts.has(context)) {
    throw new SealedAfkSkillInvocationContextError('AFK invocation context was not issued by the sealed reader')
  }
  issuedContexts.delete(context)
  if (!context.selected_skill_ids.includes(skillId)
    || context.workflow !== subject.workflow_definition_id
    || context.step !== subject.step_id
    || context.workflow_run_id !== subject.workflow_run_id
    || subject.step_visit.run_id !== context.workflow_run_id
    || subject.attempt?.attempt_id !== context.attempt_id
    || subject.attempt.reservation_id !== context.reservation_id) {
    throw new SealedAfkSkillInvocationContextError('AFK invocation does not match its selected Skill and canonical subject')
  }
  return {
    adapter: { kind: 'afk', proof_ref: `afk-bundle:${context.bundle_digest}` },
    attempt: { attempt_id: context.attempt_id, reservation_id: context.reservation_id },
  }
}
