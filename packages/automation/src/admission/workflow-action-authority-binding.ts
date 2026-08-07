import {
  createWorkflowActionAuthoritySnapshot,
  type WorkflowActionAuthoritySnapshotV1,
  type WorkflowPermissionLayerInput,
  type WorkflowPermissionLayers,
} from '@tenon/kernel'

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

/** Builds the kernel-owned full effective snapshot without changing the Workflow definition. */
export function buildAfkWorkflowActionAuthoritySnapshot(input: {
  readonly run: { readonly id: string; readonly workflowId?: string; readonly workflowPlanFingerprint?: string }
  readonly context: {
    readonly loop_id: string; readonly iteration_id?: string
    readonly attempt_id: string; readonly reservation_id: string; readonly skill_bundle_id?: string | null
  }
  readonly projectAuthority: WorkflowProjectAuthorityIdentityV1
  readonly layers: WorkflowPermissionLayers
}): WorkflowActionAuthoritySnapshotV1 {
  const workflowId = input.run.workflowId ?? ''
  const workflowFingerprint = input.run.workflowPlanFingerprint ?? ''
  const iterationId = input.context.iteration_id ?? ''
  const skillBundleId = input.context.skill_bundle_id ?? ''
  const project = input.projectAuthority
  return createWorkflowActionAuthoritySnapshot({
    action: 'enter-afk',
    workflowRunId: input.run.id,
    workflowId,
    workflowFingerprint,
    loopId: input.context.loop_id,
    iterationId,
    attemptId: input.context.attempt_id,
    reservationId: input.context.reservation_id,
    skillBundleId,
    trackId: project.track_id,
    trackRegistryRevision: project.track_registry_revision,
    layers: input.layers,
    provenance: {
      platform: { kind: 'platform-policy', identity: 'tenon-workflow-action', revision: 'v1' },
      skill: { kind: 'skill-contract', identity: skillBundleId, revision: workflowFingerprint },
      project: { kind: 'track-registry', identity: project.track_id, revision: project.track_registry_revision },
      workflow: { kind: 'workflow-plan', identity: workflowId, revision: workflowFingerprint },
      run: { kind: 'workflow-run', identity: input.run.id, revision: iterationId },
    },
  })
}

/**
 * Per-action authority identity. This is an execution overlay and deliberately does not enter the
 * Workflow-owned definition fingerprint.
 */
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
