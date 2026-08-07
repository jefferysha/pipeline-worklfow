import {
  readWorkflowActionAuthorityRecord,
  workflowPolicyPermissionLayer,
  type EffectiveWorkflowPlan,
  type PipelineState,
  type WorkflowActionAuthoritySnapshotV1,
  type WorkflowPermissionLayer,
  type WorkflowPermissionLayerInput,
  type WorkflowPermissionLayers,
} from '@tenon/kernel'
import type { WorkflowSnapshotAuthorityInput } from './workflowSnapshot.js'

function snapshotAuthorityStringField(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(',') : value ?? ''
}

function sameGrants(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((grant, index) => right[index] === grant)
}

function projectLayer(
  snapshot: WorkflowActionAuthoritySnapshotV1,
  name: WorkflowPermissionLayer,
): WorkflowPermissionLayerInput | undefined {
  const layer = snapshot.layers.find((candidate) => candidate.layer === name)
  return layer === undefined ? undefined : { status: layer.status, grants: [...layer.grants] }
}

/**
 * Read the immutable authority bound to the canonical current iteration. This is a projection-only
 * adapter: it never asks an admission provider for fresh facts and never advances canonical state.
 */
export async function readWorkflowSnapshotAuthority(
  changeDir: string,
  state: PipelineState,
  plan: EffectiveWorkflowPlan,
): Promise<WorkflowSnapshotAuthorityInput | undefined> {
  const iterationId = state.runMetadata?.iterationId
  if (iterationId === undefined) return undefined
  let snapshot
  try {
    snapshot = await readWorkflowActionAuthorityRecord(changeDir, iterationId)
  } catch {
    return undefined
  }
  return projectWorkflowSnapshotAuthority(snapshot, state, plan)
}

/** Validate every identity before exposing any authority fact to the snapshot evaluator. */
export function projectWorkflowSnapshotAuthority(
  snapshot: WorkflowActionAuthoritySnapshotV1 | undefined,
  state: PipelineState,
  plan: EffectiveWorkflowPlan,
): WorkflowSnapshotAuthorityInput | undefined {
  const metadata = state.runMetadata
  const frozenPlan = metadata?.workflowPlanSnapshot
  const iterationId = metadata?.iterationId
  if (metadata === undefined || frozenPlan === undefined || iterationId === undefined) return undefined
  const workflowId = snapshotAuthorityStringField(state.fields.workflow) || 'default'
  const trackId = snapshotAuthorityStringField(state.fields.track)
  const skillBundleId = metadata.automationPolicy?.skill_bundle_id
  if (snapshot === undefined
    || snapshot.workflow_run_id !== metadata.runId
    || snapshot.workflow_id !== workflowId
    || snapshot.workflow_id !== frozenPlan.workflowId
    || snapshot.workflow_id !== plan.id
    || snapshot.workflow_fingerprint !== metadata.workflowPlanFingerprint
    || snapshot.workflow_fingerprint !== frozenPlan.workflowFingerprint
    || snapshot.workflow_fingerprint !== plan.workflowFingerprint
    || snapshot.loop_id !== metadata.loopId
    || snapshot.iteration_id !== iterationId
    || snapshot.skill_bundle_id !== skillBundleId
    || snapshot.track_id !== trackId) return undefined

  const platform = projectLayer(snapshot, 'platform')
  const skill = projectLayer(snapshot, 'skill')
  const project = projectLayer(snapshot, 'project')
  const workflow = projectLayer(snapshot, 'workflow')
  const run = projectLayer(snapshot, 'run')
  if (platform === undefined || skill === undefined || project === undefined
    || workflow === undefined || run === undefined) return undefined
  const frozenWorkflowLayer = workflowPolicyPermissionLayer(plan)
  if (workflow.status !== frozenWorkflowLayer.status
    || !sameGrants(workflow.grants, frozenWorkflowLayer.grants)) return undefined
  return {
    layers: { platform, skill, project, run },
    authority: {
      authority_id: snapshot.authorization_fingerprint,
      workflow_run_id: snapshot.workflow_run_id,
      workflow_fingerprint: snapshot.workflow_fingerprint,
    },
  }
}
