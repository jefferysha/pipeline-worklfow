import { createHash } from 'node:crypto'
import type {
  WorkflowActionEvaluation,
  WorkflowPermissionLayer,
  WorkflowPermissionLayerInput,
} from '@tenon/kernel'

const AUTHORITY_LAYERS = Object.freeze([
  'platform', 'skill', 'project', 'workflow', 'run',
] as const satisfies readonly WorkflowPermissionLayer[])

/** Exact TrackRegistry identity used to derive the project permission layer. */
export interface WorkflowProjectAuthorityIdentityV1 {
  readonly version: 'v1'
  readonly track_id: string
  readonly track_registry_revision: string
}

/** Fresh non-Workflow facts returned by the host under its TrackRegistry read lock. */
export interface WorkflowActionAuthorityFacts {
  readonly platform: WorkflowPermissionLayerInput
  readonly skill: WorkflowPermissionLayerInput
  readonly project: WorkflowPermissionLayerInput
  readonly run: WorkflowPermissionLayerInput
  readonly projectAuthority?: WorkflowProjectAuthorityIdentityV1
}

/**
 * Per-action authority identity. This is an execution overlay and deliberately does not enter the
 * Workflow-owned definition fingerprint.
 */
export interface AfkWorkflowActionAuthorityBindingV1 {
  readonly version: 'v1'
  readonly action: 'enter-afk'
  readonly workflow_run_id: string
  readonly workflow_id: string
  readonly workflow_fingerprint: string
  readonly loop_id: string
  readonly iteration_id: string
  readonly skill_bundle_id: string
  readonly track_id: string
  readonly track_registry_revision: string
  readonly authority_fingerprint: string
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0

export function isWorkflowProjectAuthorityIdentityV1(
  value: unknown,
): value is WorkflowProjectAuthorityIdentityV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 3
    && record.version === 'v1'
    && nonEmpty(record.track_id)
    && typeof record.track_registry_revision === 'string'
    && /^[0-9a-f]{16}$/.test(record.track_registry_revision)
}

/** Builds the closed v1 comparison identity only from a successful five-layer evaluation. */
export function buildAfkWorkflowActionAuthorityBinding(input: {
  readonly workflowRunId: string
  readonly workflowId: string
  readonly workflowFingerprint: string
  readonly loopId: string
  readonly iterationId: string
  readonly skillBundleId: string
  readonly projectAuthority?: WorkflowProjectAuthorityIdentityV1
  readonly authorization: WorkflowActionEvaluation
}): AfkWorkflowActionAuthorityBindingV1 | undefined {
  const project = input.projectAuthority
  if (!isWorkflowProjectAuthorityIdentityV1(project)
    || !nonEmpty(input.workflowRunId)
    || !nonEmpty(input.workflowId)
    || !/^[0-9a-f]{64}$/.test(input.workflowFingerprint)
    || !nonEmpty(input.loopId)
    || !nonEmpty(input.iterationId)
    || !nonEmpty(input.skillBundleId)
    || input.authorization.action !== 'enter-afk'
    || input.authorization.allowed !== true
    || input.authorization.status !== 'allowed'
    || input.authorization.denials.length !== 0) return undefined

  const contributions = AUTHORITY_LAYERS.map((layer) =>
    input.authorization.contributions.filter((item) => item.layer === layer))
  if (contributions.some((items) => items.length !== 1)) return undefined
  const canonicalContributions = contributions.flatMap((items) => items.map((item) => ({
    layer: item.layer, status: item.status, granted: item.granted,
  })))
  const canonical = {
    schema: 'afk-workflow-action-authority-v1',
    action: 'enter-afk',
    workflow_run_id: input.workflowRunId,
    workflow_id: input.workflowId,
    workflow_fingerprint: input.workflowFingerprint,
    loop_id: input.loopId,
    iteration_id: input.iterationId,
    skill_bundle_id: input.skillBundleId,
    track_id: project.track_id,
    track_registry_revision: project.track_registry_revision,
    contributions: canonicalContributions,
  }
  return Object.freeze({
    version: 'v1',
    action: 'enter-afk',
    workflow_run_id: input.workflowRunId,
    workflow_id: input.workflowId,
    workflow_fingerprint: input.workflowFingerprint,
    loop_id: input.loopId,
    iteration_id: input.iterationId,
    skill_bundle_id: input.skillBundleId,
    track_id: project.track_id,
    track_registry_revision: project.track_registry_revision,
    authority_fingerprint: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
  })
}

export function sameAfkWorkflowActionAuthorityBinding(
  left: AfkWorkflowActionAuthorityBindingV1,
  right: AfkWorkflowActionAuthorityBindingV1,
): boolean {
  return left.version === right.version
    && left.action === right.action
    && left.workflow_run_id === right.workflow_run_id
    && left.workflow_id === right.workflow_id
    && left.workflow_fingerprint === right.workflow_fingerprint
    && left.loop_id === right.loop_id
    && left.iteration_id === right.iteration_id
    && left.skill_bundle_id === right.skill_bundle_id
    && left.track_id === right.track_id
    && left.track_registry_revision === right.track_registry_revision
    && left.authority_fingerprint === right.authority_fingerprint
}
