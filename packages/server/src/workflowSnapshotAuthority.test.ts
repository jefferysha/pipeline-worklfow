import { describe, expect, it } from 'vitest'
import {
  compileAutomationPolicySnapshot,
  compileEffectiveWorkflowPlan,
  createWorkflowActionAuthoritySnapshot,
  workflowPlanSnapshot,
  type LoopEntry,
  type PipelineState,
  type RunMetadata,
  type WorkflowDef,
} from '@tenon/kernel'
import { projectWorkflowSnapshotAuthority } from './workflowSnapshotAuthority.js'

const WORKFLOW = {
  name: 'authority-unit',
  interaction: { version: 'v1', mode: 'afk' },
  steps: [{
    id: 'run', label: 'Run', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [],
  }],
} satisfies WorkflowDef
const PLAN = compileEffectiveWorkflowPlan(WORKFLOW.name, WORKFLOW)
const POLICY = compileAutomationPolicySnapshot({
  id: 'loop-unit', name: 'Unit loop', kind: 'executor', goal: 'Validate projection',
  cadence: 'manual', risk: 'low', runner: 'codex', change_prefix: 'unit-', phases: [],
  human_gates: [], state: 'legacy', design_doc: 'design.md', status: 'active',
  budget: { max_runs_per_day: 1, max_in_flight: 1, on_exceed: 'skip-run' },
  kill_criteria: [], autonomy_level: 'L1', allowlist: ['**'], denylist: [],
  skill_bundle_id: 'backend',
} satisfies LoopEntry, { capturedAt: '2026-08-08T00:00:00Z' })
const ITERATION = 'iteration-attempt-unit'

function state(
  metadata: Partial<RunMetadata> = {},
  fields: { readonly workflow?: string; readonly track?: string } = {},
): PipelineState {
  return {
    fields: {
      workflow: fields.workflow ?? PLAN.id,
      track: fields.track ?? 'backend',
    } as PipelineState['fields'],
    runMetadata: {
      runId: 'run-unit',
      transitionSequence: 0,
      workflowPlanFingerprint: PLAN.workflowFingerprint,
      workflowPlanSnapshot: workflowPlanSnapshot(PLAN),
      automationPolicy: POLICY,
      loopId: POLICY.loop_id,
      iterationId: ITERATION,
      ...metadata,
    },
    opaqueTail: '',
  }
}

function authority(extraWorkflowGrant = false) {
  const grant = { status: 'valid', grants: ['enter-afk'] } as const
  const workflowGrant = {
    status: 'valid' as const,
    grants: extraWorkflowGrant ? ['enter-afk', 'write-filesystem'] as const : grant.grants,
  }
  return createWorkflowActionAuthoritySnapshot({
    action: 'enter-afk',
    workflowRunId: 'run-unit',
    workflowId: PLAN.id,
    workflowFingerprint: PLAN.workflowFingerprint,
    loopId: POLICY.loop_id,
    iterationId: ITERATION,
    attemptId: 'attempt-unit',
    reservationId: 'reservation-unit',
    skillBundleId: POLICY.skill_bundle_id,
    trackId: 'backend',
    trackRegistryRevision: '0123456789abcdef',
    layers: { platform: grant, skill: grant, project: grant, workflow: workflowGrant, run: grant },
    provenance: {
      platform: { kind: 'platform-policy', identity: 'tenon', revision: 'v1' },
      skill: { kind: 'skill-contract', identity: POLICY.skill_bundle_id, revision: PLAN.workflowFingerprint },
      project: { kind: 'track-registry', identity: 'backend', revision: '0123456789abcdef' },
      workflow: { kind: 'workflow-plan', identity: PLAN.id, revision: PLAN.workflowFingerprint },
      run: { kind: 'workflow-run', identity: 'run-unit', revision: ITERATION },
    },
  })
}

describe('projectWorkflowSnapshotAuthority', () => {
  it('projects the four dynamic layers and exact binding after validating the frozen workflow layer', () => {
    const snapshot = authority()
    expect(projectWorkflowSnapshotAuthority(snapshot, state(), PLAN)).toEqual({
      layers: {
        platform: { status: 'valid', grants: ['enter-afk'] },
        skill: { status: 'valid', grants: ['enter-afk'] },
        project: { status: 'valid', grants: ['enter-afk'] },
        run: { status: 'valid', grants: ['enter-afk'] },
      },
      authority: {
        authority_id: snapshot.authorization_fingerprint,
        workflow_run_id: 'run-unit',
        workflow_fingerprint: PLAN.workflowFingerprint,
      },
    })
  })

  it.each([
    ['run id', state({ runId: 'run-other' })],
    ['workflow id', state({}, { workflow: 'workflow-other' })],
    ['workflow fingerprint', state({ workflowPlanFingerprint: '0'.repeat(64) })],
    ['loop id', state({ loopId: 'loop-other' })],
    ['iteration id', state({ iterationId: 'iteration-attempt-other' })],
    ['skill bundle id', state({ automationPolicy: { ...POLICY, skill_bundle_id: 'frontend' } })],
    ['track id', state({}, { track: 'frontend' })],
    ['frozen workflow id', state({
      workflowPlanSnapshot: { ...workflowPlanSnapshot(PLAN), workflowId: 'workflow-other' },
    })],
    ['frozen workflow fingerprint', state({
      workflowPlanSnapshot: { ...workflowPlanSnapshot(PLAN), workflowFingerprint: '0'.repeat(64) },
    })],
  ])('fails closed for a mismatched %s', (_label, mismatchedState) => {
    expect(projectWorkflowSnapshotAuthority(authority(), mismatchedState, PLAN)).toBeUndefined()
  })

  it('rejects sidecar workflow grants that exceed the frozen plan ceiling', () => {
    expect(projectWorkflowSnapshotAuthority(authority(true), state(), PLAN)).toBeUndefined()
  })
})
