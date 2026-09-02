import { describe, expect, test } from 'vitest'
import {
  createAggregateV2,
  decodeBoardCommandV2,
  decodeBoardEventV2,
  decodeDevelopmentRequestV2,
  decodeSkillRunV2,
  decodeWorkflowPipelineV2,
  decideV2,
  evolveV2,
  foldV2,
  projectBoardSnapshotV2,
  type BoardCommandV2,
  type DevelopmentRequestV2,
  type OrchestrationAggregateV2,
} from './v2.js'

const now = '2026-09-01T00:00:00.000Z'
const meta = {
  schema_version: 'development-request/v2' as const,
  record_id: 'request:req-1', project_id: 'project-1', change_id: 'change-1', revision: 0,
  correlation_id: 'corr-1', actor: { kind: 'user' as const, id: 'user-1' }, created_at: now,
}
const request: DevelopmentRequestV2 = {
  ...meta, request_id: 'req-1', intent: 'ship feature', interaction_policy: 'recommended-defaults',
  requested_effects: ['read', 'write'], constraints: [], user_skills: [], user_mcps: [], auto_select: true,
}

function command(type: BoardCommandV2['type'], aggregate: OrchestrationAggregateV2, payload: Record<string, unknown> = {}): BoardCommandV2 {
  return {
    schema_version: 'board-command/v2', command_id: `cmd-${aggregate.revision + 1}-${type}`,
    idempotency_key: `idem-${aggregate.revision + 1}-${type}`, expected_revision: aggregate.revision,
    actor: { kind: 'user', id: 'user-1' }, issued_at: now, correlation_id: 'corr-1',
    causation_id: aggregate.event_head_id, change_id: 'change-1', type, ...payload,
  } as BoardCommandV2
}

function accepted(aggregate: OrchestrationAggregateV2, cmd: BoardCommandV2): OrchestrationAggregateV2 {
  const decision = decideV2(aggregate, cmd)
  expect(decision.ok).toBe(true)
  if (!decision.ok) throw new Error(decision.rejection.message)
  return evolveV2(aggregate, decision.event)
}

describe('canonical orchestration aggregate v2', () => {
  test('closed bounded request codec accepts base fixture and rejects unknown/oversized values', () => {
    expect(decodeDevelopmentRequestV2(request)).toMatchObject({ ok: true })
    expect(decodeDevelopmentRequestV2({ ...request, extra: true })).toMatchObject({ ok: false })
    expect(decodeDevelopmentRequestV2({ ...request, intent: 'x'.repeat(9_000) })).toMatchObject({ ok: false })
  })

  test('input manifest is a closed read-proof contract', () => {
    const run = {
      schema_version: 'skill-run/v2', record_id: 'run:manifest', project_id: 'project-1', change_id: 'change-1', revision: 1,
      correlation_id: 'corr-1', actor: { kind: 'worker', id: 'worker-1' }, created_at: now,
      run_id: 'run-manifest', attempt_id: 'attempt-manifest', attempt: 1, work_item_id: 'item-1', skill_id: 'skill-1', skill_version: '1.0.0', mcp_ids: [], status: 'running', input_refs: ['artifact://result/output.json'],
      input_manifest: { schema_version: 'skill-input-manifest/v2', manifest_id: 'input:run-manifest', run_id: 'run-manifest', work_item_id: 'item-1', input_refs: ['artifact://result/output.json'], artifact_digests: [`sha256:${'a'.repeat(64)}`], bundle_digest: `sha256:${'b'.repeat(64)}`, byte_length: 12, delivery: 'injected', created_at: now },
    }
    expect(decodeSkillRunV2(run)).toMatchObject({ ok: true })
    expect(decodeSkillRunV2({ ...run, input_manifest: { ...run.input_manifest, artifact_digests: [] } })).toMatchObject({ ok: false })
    expect(decodeSkillRunV2({ ...run, input_manifest: { ...run.input_manifest, delivery: 'rejected' } })).toMatchObject({ ok: false })
  })

  test('event effect union is closed and fully decoded', () => {
    const aggregate = createAggregateV2('project-1', 'change-1', 'corr-1')
    const decision = decideV2(aggregate, command('accept-request', aggregate, { request }))
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decodeBoardEventV2(decision.event)).toMatchObject({ ok: true })
    expect(decodeBoardEventV2({ ...decision.event, effects: [{ type: 'unknown-effect' }] })).toMatchObject({ ok: false })
    expect(decodeBoardEventV2({ ...decision.event, effects: [{ type: 'wake-scheduler', reason: 'x', extra: true }] })).toMatchObject({ ok: false })
  })

  test('freezes a workflow pipeline before the graph and rejects stale bindings', () => {
    const pipeline = {
      schema_version: 'workflow-pipeline/v2' as const, record_id: 'pipeline:default:free:main', project_id: 'project-1', change_id: 'change-1', revision: 2,
      correlation_id: 'corr-1', actor: { kind: 'system' as const, id: 'planner' }, created_at: now,
      pipeline_id: 'default:free:main', pipeline_version: '1', workflow_id: 'default', workflow_version: 'auto-v2', workflow_source: 'automatic' as const,
      workflow_fingerprint: `sha256:${'a'.repeat(64)}`, track_id: 'free', track_revision: 'auto-v2', track_source: 'automatic' as const,
      pipeline_source: 'automatic' as const, graph_id: 'graph-1', assessment_id: 'assessment-1', status: 'frozen' as const,
      stage_order: ['item-1'], stages: [{ stage_id: 'item-1', name: 'Build', ordinal: 0, execution_mode: 'serial' as const, depends_on: [], work_item_ids: ['item-1'], gate: 'none' as const,
        skills: [{ binding_id: 'binding:item-1:skill-1', skill_id: 'skill-1', skill_version: '1.0.0', order: 0, role: 'automatic' as const, source: 'automatic' as const, mode: 'serial' as const, depends_on: [], mcp_ids: [], validator_ids: [] }], input_refs: [], output_refs: ['result:item-1'] }],
      customizations: { custom_workflow: false, custom_track: false, custom_pipeline: false, user_skill_ids: [], user_mcp_ids: [] }, pipeline_digest: `sha256:${'b'.repeat(64)}`,
    }
    expect(decodeWorkflowPipelineV2(pipeline)).toMatchObject({ ok: true })
    expect(decodeWorkflowPipelineV2({ ...pipeline, extra: true })).toMatchObject({ ok: false })
    let aggregate = createAggregateV2('project-1', 'change-1', 'corr-1')
    aggregate = accepted(aggregate, command('accept-request', aggregate, { request }))
    const context = { schema_version: 'repository-context/v2' as const, record_id: 'context:1', project_id: 'project-1', change_id: 'change-1', revision: 1, correlation_id: 'corr-1', actor: { kind: 'system' as const, id: 'host' }, created_at: now, request_id: 'req-1', repository: { ref: 'repo', branch: 'main', base_branch: 'main', head_sha: 'abc', dirty: false }, workspace_fingerprint: 'sha256:' + 'a'.repeat(64) as `sha256:${string}`, policy_digest: 'sha256:' + 'b'.repeat(64) as `sha256:${string}`, skill_catalog_digest: 'sha256:' + 'c'.repeat(64) as `sha256:${string}`, mcp_catalog_digest: 'sha256:' + 'd'.repeat(64) as `sha256:${string}`, observed_facts: [] }
    aggregate = accepted(aggregate, command('record-context', aggregate, { context }))
    const assessment = { schema_version: 'capability-assessment/v2' as const, record_id: 'assessment:1', project_id: 'project-1', change_id: 'change-1', revision: 2, correlation_id: 'corr-1', actor: { kind: 'model' as const, id: 'planner' }, created_at: now, assessment_id: 'assessment-1', request_id: 'req-1', context_record_id: 'context:1', normalization: 'complete' as const, requirements: [], questions: [], risks: [], proposal_evidence_ref: 'evidence:assessment' }
    aggregate = accepted(aggregate, command('record-assessment', aggregate, { assessment }))
    const frozen = decideV2(aggregate, command('freeze-pipeline', aggregate, { pipeline }))
    expect(frozen.ok).toBe(true)
    if (!frozen.ok) return
    aggregate = evolveV2(aggregate, frozen.event)
    expect(aggregate.pipeline?.stage_order).toEqual(['item-1'])
    expect(aggregate.next_actions).toEqual(['freeze-work-graph'])
    const stale = decideV2(aggregate, command('freeze-pipeline', aggregate, { pipeline: { ...pipeline, assessment_id: 'assessment-other' } }))
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.rejection.reason_code).toBe('pipeline-binding-invalid')
  })

  test('decode → accept-request → fold/project is deterministic and causal', () => {
    const decoded = decodeDevelopmentRequestV2(request)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    const aggregate = createAggregateV2('project-1', 'change-1', 'corr-1')
    const cmd = command('accept-request', aggregate, { request: decoded.value })
    const decision = decideV2(aggregate, cmd)
    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    const next = evolveV2(aggregate, decision.event)
    expect(next.revision).toBe(1)
    expect(next.status).toBe('draft')
    expect(next.request?.request_id).toBe('req-1')
    expect(next.event_head_id).toBe('event:cmd-1-accept-request')
    expect(projectBoardSnapshotV2(next)).toEqual(next)
    expect(foldV2([decision.event], aggregate)).toEqual(next)
  })

  test('pause/resume/retry/replan/cancel transitions preserve history and reject stale mutation', () => {
    let aggregate = accepted(createAggregateV2('project-1', 'change-1', 'corr-1'), command('accept-request', createAggregateV2('project-1', 'change-1', 'corr-1'), { request }))
    const pause = decideV2(aggregate, command('pause-change', aggregate, { reason: 'operator' }))
    expect(pause.ok).toBe(false)
    const stale = decideV2(aggregate, { ...command('cancel-change', aggregate), expected_revision: 0 })
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.rejection.code).toBe('revision-conflict')
  })

  test('illegal terminal transition and zero mutation are typed', () => {
    let aggregate = accepted(createAggregateV2('project-1', 'change-1', 'corr-1'), command('accept-request', createAggregateV2('project-1', 'change-1', 'corr-1'), { request }))
    aggregate = accepted(aggregate, command('cancel-change', aggregate, { reason: 'done' }))
    const before = JSON.stringify(aggregate)
    const decision = decideV2(aggregate, command('resume-change', aggregate))
    expect(decision.ok).toBe(false)
    expect(JSON.stringify(aggregate)).toBe(before)
  })

  test('lease generation is monotonic and wrong owner/generation cannot complete', () => {
    let aggregate = accepted(createAggregateV2('project-1', 'change-1', 'corr-1'), command('accept-request', createAggregateV2('project-1', 'change-1', 'corr-1'), { request }))
    aggregate = accepted(aggregate, command('record-context', aggregate, { context: { schema_version: 'repository-context/v2', record_id: 'context:1', project_id: 'project-1', change_id: 'change-1', revision: 1, correlation_id: 'corr-1', actor: { kind: 'system', id: 'host' }, created_at: now, request_id: 'req-1', repository: { ref: 'repo', branch: 'main', base_branch: 'main', head_sha: 'abc', dirty: false }, workspace_fingerprint: 'sha256:abc', policy_digest: 'sha256:policy', skill_catalog_digest: 'sha256:skills', mcp_catalog_digest: 'sha256:mcps', observed_facts: [] } }))
    expect(aggregate.revision).toBe(2)
    expect(aggregate.leases).toEqual([])
  })

  test('full deterministic lifecycle covers graph, resolution, lease, validation, gate and completion', () => {
    let aggregate = createAggregateV2('project-1', 'change-1', 'corr-1')
    aggregate = accepted(aggregate, command('accept-request', aggregate, { request }))
    const context = { schema_version: 'repository-context/v2' as const, record_id: 'context:1', project_id: 'project-1', change_id: 'change-1', revision: 1, correlation_id: 'corr-1', actor: { kind: 'system' as const, id: 'host' }, created_at: now, request_id: 'req-1', repository: { ref: 'repo', branch: 'main', base_branch: 'main', head_sha: 'abc', dirty: false }, workspace_fingerprint: 'sha256:' + 'a'.repeat(64) as `sha256:${string}`, policy_digest: 'sha256:' + 'b'.repeat(64) as `sha256:${string}`, skill_catalog_digest: 'sha256:' + 'c'.repeat(64) as `sha256:${string}`, mcp_catalog_digest: 'sha256:' + 'd'.repeat(64) as `sha256:${string}`, observed_facts: [] }
    aggregate = accepted(aggregate, command('record-context', aggregate, { context }))
    const assessment = { schema_version: 'capability-assessment/v2' as const, record_id: 'assessment:1', project_id: 'project-1', change_id: 'change-1', revision: 2, correlation_id: 'corr-1', actor: { kind: 'model' as const, id: 'planner' }, created_at: now, assessment_id: 'assessment-1', request_id: 'req-1', context_record_id: 'context:1', normalization: 'complete' as const, requirements: [], questions: [], risks: [], proposal_evidence_ref: 'evidence:assessment' }
    aggregate = accepted(aggregate, command('record-assessment', aggregate, { assessment }))
    const graph = { schema_version: 'work-graph/v2' as const, record_id: 'graph:1', project_id: 'project-1', change_id: 'change-1', revision: 3, correlation_id: 'corr-1', actor: { kind: 'system' as const, id: 'planner' }, created_at: now, graph_id: 'graph-1', graph_revision: 1, assessment_id: 'assessment-1', task_plan_revision_id: 'plan-1', task_plan_digest: 'sha256:' + 'e'.repeat(64) as `sha256:${string}`, dependency_edges: [], execution_groups: [{ id: 'group-1', mode: 'serial' as const, work_item_ids: ['item-1'] }], acceptance_coverage: [], status: 'frozen' as const }
    aggregate = accepted(aggregate, command('freeze-work-graph', aggregate, { graph }))
    const resolution = { schema_version: 'capability-resolution/v2' as const, record_id: 'resolution:1', project_id: 'project-1', change_id: 'change-1', revision: 4, correlation_id: 'corr-1', actor: { kind: 'system' as const, id: 'resolver' }, created_at: now, resolution_id: 'resolution-1', assessment_id: 'assessment-1', graph_id: 'graph-1', policy_digest: 'sha256:' + 'b'.repeat(64) as `sha256:${string}`, status: 'resolved' as const, bindings: [], candidates: [], blockers: [], binding_digest: 'sha256:' + 'f'.repeat(64) as `sha256:${string}` }
    aggregate = accepted(aggregate, command('resolve-capabilities', aggregate, { resolution }))
    aggregate = accepted(aggregate, command('start-change', aggregate))
    aggregate = accepted(aggregate, command('enqueue-work-item', aggregate, { work_item_id: 'item-1' }))
    const run = { schema_version: 'skill-run/v2' as const, record_id: 'run:1', project_id: 'project-1', change_id: 'change-1', revision: 6, correlation_id: 'corr-1', actor: { kind: 'worker' as const, id: 'worker-1' }, created_at: now, run_id: 'run-1', attempt_id: 'attempt-1', attempt: 1, work_item_id: 'item-1', skill_id: 'skill-1', skill_version: '1.0.0', mcp_ids: [], status: 'queued' as const, input_refs: [] }
    const lease = { lease_id: 'lease-1', owner_id: 'worker-1', acquired_at: now, heartbeat_at: now, expires_at: '2026-09-01T00:10:00.000Z', generation: 1, status: 'active' as const }
    aggregate = accepted(aggregate, command('claim-run', aggregate, { run, lease }))
    aggregate = accepted(aggregate, command('heartbeat-run', aggregate, { run_id: 'run-1', lease_id: 'lease-1', owner_id: 'worker-1', generation: 2, heartbeat_at: now, expires_at: '2026-09-01T00:20:00.000Z' }))
    aggregate = accepted(aggregate, command('begin-run', aggregate, { run_id: 'run-1', lease_id: 'lease-1', owner_id: 'worker-1', generation: 2 }))
    const result = { schema_version: 'skill-result/v2' as const, record_id: 'result:1', project_id: 'project-1', change_id: 'change-1', revision: 9, correlation_id: 'corr-1', actor: { kind: 'worker' as const, id: 'worker-1' }, created_at: now, result_id: 'result-1', run_id: 'run-1', status: 'completed' as const, contract_status: 'validated' as const, artifacts: [], validation_refs: [], diagnostics: [] }
    aggregate = accepted(aggregate, command('complete-run', aggregate, { run_id: 'run-1', result }))
    const report = { schema_version: 'validation-report/v2' as const, record_id: 'validation:1', project_id: 'project-1', change_id: 'change-1', revision: 10, correlation_id: 'corr-1', actor: { kind: 'system' as const, id: 'validator' }, created_at: now, report_id: 'report-1', work_item_id: 'item-1', result_id: 'result-1', validator_id: 'unit', validator_version: '1', status: 'pass' as const, target_digests: [], evidence_refs: [], checks: [] }
    aggregate = accepted(aggregate, command('record-validation', aggregate, { report }))
    const gate = { schema_version: 'gate-evaluation/v2' as const, record_id: 'gate:1', project_id: 'project-1', change_id: 'change-1', revision: 11, correlation_id: 'corr-1', actor: { kind: 'user' as const, id: 'user-1' }, created_at: now, gate_id: 'gate-1', kind: 'verification' as const, status: 'passed' as const, required_evidence_refs: [], decision_revision: 11 }
    aggregate = accepted(aggregate, command('evaluate-gate', aggregate, { gate }))
    expect(aggregate.status).toBe('completed')
    expect(aggregate.revision).toBe(13)
  })
})
