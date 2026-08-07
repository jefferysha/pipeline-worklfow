import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parseWorkflowActionAuthoritySnapshot,
  sameWorkflowActionAuthoritySnapshot,
  workflowActionAuthoritySnapshotContent,
} from './workflow-action-authority-snapshot.js'
import type { WorkflowActionAuthoritySnapshotV1 } from '../workflow/action-authority-types.js'
import { atomicLinkPublish } from './atomic-publish.js'

export const WORKFLOW_ACTION_AUTHORITY_RECORD_PREFIX = '.pipeline-workflow-action-authority-'

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

/** One immutable file per iteration; historical attempts remain append-only audit evidence. */
export function workflowActionAuthorityRecordPath(changeDir: string, iterationId: string): string {
  const identity = createHash('sha256').update(iterationId).digest('hex')
  return join(changeDir, `${WORKFLOW_ACTION_AUTHORITY_RECORD_PREFIX}${identity}.json`)
}

export async function readWorkflowActionAuthorityRecord(
  changeDir: string,
  iterationId: string,
): Promise<WorkflowActionAuthoritySnapshotV1 | undefined> {
  const target = workflowActionAuthorityRecordPath(changeDir, iterationId)
  try {
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Workflow action authority record must be a non-symlink regular file: ${target}`)
    }
    const snapshot = parseWorkflowActionAuthoritySnapshot(await readFile(target, 'utf8'))
    if (snapshot.iteration_id !== iterationId) {
      throw new Error('Workflow action authority record iteration identity mismatch')
    }
    return snapshot
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

export async function ensureWorkflowActionAuthorityRecord(
  changeDir: string,
  snapshot: WorkflowActionAuthoritySnapshotV1,
): Promise<WorkflowActionAuthoritySnapshotV1> {
  const requested = parseWorkflowActionAuthoritySnapshot(JSON.stringify(snapshot))
  const existing = await readWorkflowActionAuthorityRecord(changeDir, requested.iteration_id)
  if (existing !== undefined) {
    if (!sameWorkflowActionAuthoritySnapshot(existing, requested)) {
      throw new Error('Workflow action authority binding is immutable and already contains different facts')
    }
    return existing
  }
  const target = workflowActionAuthorityRecordPath(changeDir, requested.iteration_id)
  try {
    await atomicLinkPublish(
      changeDir,
      '.pipeline-workflow-action-authority.tmp',
      target,
      workflowActionAuthoritySnapshotContent(requested),
    )
    return requested
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
    const raced = await readWorkflowActionAuthorityRecord(changeDir, requested.iteration_id)
    if (raced === undefined || !sameWorkflowActionAuthoritySnapshot(raced, requested)) {
      throw new Error('Workflow action authority concurrent immutable bind contains different facts')
    }
    return raced
  }
}
