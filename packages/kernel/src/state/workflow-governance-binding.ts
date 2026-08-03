import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocumentProfileId, RunMetadata } from '../types.js'
import { atomicLinkPublish } from './atomic-publish.js'

export const WORKFLOW_GOVERNANCE_BINDING_FILE = '.pipeline-workflow-governance.json'

export interface WorkflowGovernanceBinding {
  readonly version: 1
  readonly run_id: string
  readonly document_profile?: DocumentProfileId
  readonly document_governance_fingerprint?: string
  readonly workflow_plan_fingerprint?: string
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const value = Reflect.get(error, 'code')
  return typeof value === 'string' ? value : undefined
}

export function parseWorkflowGovernanceBinding(raw: string): WorkflowGovernanceBinding {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('workflow governance binding 不是合法 JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('workflow governance binding 必须是对象')
  }
  const record = value as Record<string, unknown>
  const allowed = new Set([
    'version', 'run_id', 'document_profile',
    'document_governance_fingerprint', 'workflow_plan_fingerprint',
  ])
  const digest = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && /^[0-9a-f]{64}$/.test(candidate)
  if (Object.keys(record).some((key) => !allowed.has(key))
    || record.version !== 1
    || typeof record.run_id !== 'string'
    || record.run_id === ''
    || (record.document_profile !== undefined
      && record.document_profile !== 'legacy-full'
      && record.document_profile !== 'document-v1')
    || (record.document_governance_fingerprint !== undefined
      && !digest(record.document_governance_fingerprint))
    || (record.workflow_plan_fingerprint !== undefined
      && !digest(record.workflow_plan_fingerprint))
    || (record.document_governance_fingerprint !== undefined
      && record.document_profile === undefined)) {
    throw new Error('workflow governance binding 形状非法')
  }
  return {
    version: 1,
    run_id: record.run_id,
    ...(record.document_profile === undefined
      ? {}
      : { document_profile: record.document_profile }),
    ...(record.document_governance_fingerprint === undefined
      ? {}
      : { document_governance_fingerprint: record.document_governance_fingerprint }),
    ...(record.workflow_plan_fingerprint === undefined
      ? {}
      : { workflow_plan_fingerprint: record.workflow_plan_fingerprint }),
  }
}

export async function readWorkflowGovernanceBinding(
  changeDir: string,
): Promise<WorkflowGovernanceBinding | undefined> {
  const target = join(changeDir, WORKFLOW_GOVERNANCE_BINDING_FILE)
  try {
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`workflow governance binding 必须是非 symlink 普通文件: ${target}`)
    }
    return parseWorkflowGovernanceBinding(await readFile(target, 'utf8'))
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

function bindingFor(metadata: RunMetadata): WorkflowGovernanceBinding {
  return {
    version: 1,
    run_id: metadata.runId,
    ...(metadata.documentProfile === undefined
      ? {}
      : { document_profile: metadata.documentProfile }),
    ...(metadata.documentGovernanceFingerprint === undefined
      ? {}
      : { document_governance_fingerprint: metadata.documentGovernanceFingerprint }),
    ...(metadata.workflowPlanFingerprint === undefined
      ? {}
      : { workflow_plan_fingerprint: metadata.workflowPlanFingerprint }),
  }
}

export async function ensureWorkflowGovernanceBinding(
  changeDir: string,
  metadata: RunMetadata,
): Promise<WorkflowGovernanceBinding> {
  const requested = bindingFor(metadata)
  const existing = await readWorkflowGovernanceBinding(changeDir)
  if (existing !== undefined) {
    if (JSON.stringify(existing) !== JSON.stringify(requested)) {
      throw new Error('Change 已固定不同的 workflow governance binding，拒绝覆盖')
    }
    return existing
  }
  const target = join(changeDir, WORKFLOW_GOVERNANCE_BINDING_FILE)
  try {
    await atomicLinkPublish(
      changeDir,
      '.pipeline-workflow-governance.tmp',
      target,
      `${JSON.stringify(requested)}\n`,
    )
    return requested
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
    const raced = await readWorkflowGovernanceBinding(changeDir)
    if (raced === undefined || JSON.stringify(raced) !== JSON.stringify(requested)) {
      throw new Error('workflow governance binding 并发创建后内容不一致')
    }
    return raced
  }
}

export function attachWorkflowGovernanceBinding(
  metadata: RunMetadata | undefined,
  binding: WorkflowGovernanceBinding | undefined,
): RunMetadata | undefined {
  if (metadata === undefined) return undefined
  if (binding === undefined) return metadata
  if (binding.run_id !== metadata.runId) {
    throw new Error('workflow governance binding 与 canonical runId 不一致')
  }
  const asserted = [
    ['documentProfile', metadata.documentProfile, binding.document_profile],
    ['documentGovernanceFingerprint', metadata.documentGovernanceFingerprint, binding.document_governance_fingerprint],
    ['workflowPlanFingerprint', metadata.workflowPlanFingerprint, binding.workflow_plan_fingerprint],
  ] as const
  for (const [field, canonical, sidecar] of asserted) {
    if (canonical !== undefined && sidecar !== undefined && canonical !== sidecar) {
      throw new Error(`workflow governance binding 与 legacy canonical ${field} 不一致`)
    }
  }
  return {
    ...metadata,
    ...(binding.document_profile === undefined ? {} : { documentProfile: binding.document_profile }),
    ...(binding.document_governance_fingerprint === undefined
      ? {}
      : { documentGovernanceFingerprint: binding.document_governance_fingerprint }),
    ...(binding.workflow_plan_fingerprint === undefined
      ? {}
      : { workflowPlanFingerprint: binding.workflow_plan_fingerprint }),
  }
}

/** Keep N-1 canonical readers compatible; governance presentation identity lives in the sidecar. */
export function withoutWorkflowGovernanceBinding(metadata: RunMetadata): RunMetadata {
  const {
    documentProfile: _documentProfile,
    documentGovernanceFingerprint: _documentGovernanceFingerprint,
    workflowPlanFingerprint: _workflowPlanFingerprint,
    workflowPlanSnapshot: _workflowPlanSnapshot,
    ...canonical
  } = metadata
  return canonical
}
