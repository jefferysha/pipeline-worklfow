import { describe, expect, test } from 'vitest'
import {
  applyBoardCommand,
  createOrchestrationState,
  decodeDevelopmentRequestV1,
  decodeSkillResultEnvelopeV1,
  decodeValidationReportV1,
  resolveCapabilities,
  type BoardCommandV1,
  type CapabilityAssessmentV1,
  type DevelopmentRequestV1,
  type SkillDescriptorV1,
  type WorkGraphV1,
} from './index.js'

const now = '2026-09-01T10:00:00.000Z'
const request: DevelopmentRequestV1 = {
  schema_version: 'development-request/v1', request_id: 'req-1', project_id: 'project-1', change_id: 'change-1',
  intent: '实现一个可暂停的自动开发闭环', created_at: now, auto_select: true,
  user_skills: [{ id: 'skill.plan', mode: 'serial', depends_on: [] }], user_mcps: [],
}
const assessment: CapabilityAssessmentV1 = {
  schema_version: 'capability-assessment/v1', assessment_id: 'assessment-1', request_id: request.request_id,
  status: 'complete', source: 'rule', confidence: 0.9, capability_requirements: ['planning', 'testing'],
  mcp_requirements: [], constraints: [], risks: [], questions: [], signals: { language: 'typescript' }, assessed_at: now,
}
const context = {
  schema_version: 'repository-context/v1' as const, project_id: request.project_id, repository_ref: 'repo-1', revision: 'sha256:abc',
  branch: 'codex/v1', base_branch: 'main', dirty: true, observed_at: now, source: 'system' as const,
}
const descriptors: SkillDescriptorV1[] = [
  { schema_version: 'skill-descriptor/v1', id: 'skill.plan', version: '1.0.0', capabilities: ['planning'], availability: 'available', supports_parallel: false, resource_claims: [], permissions: [] },
  { schema_version: 'skill.test', version: '1.0.0', id: 'skill.test', capabilities: ['testing'], availability: 'available', supports_parallel: true, resource_claims: [], permissions: [] },
]
const graph: WorkGraphV1 = {
  schema_version: 'work-graph/v1', graph_id: 'graph-1', change_id: request.change_id, generated_at: now, source: 'system',
  task_plan: {
    schema_version: 'task-plan/v1', plan_id: 'plan-1', revision_id: 'revision-1', revision_number: 1, status: 'frozen', created_at: now,
    requirements: [{ id: 'r1', title: 'core' }], acceptance_criteria: [{ id: 'a1', title: 'tested' }],
    groups: [{ id: 'g1', title: 'main', parent_id: null, work_item_ids: ['item-1'] }],
    work_items: [{ id: 'item-1', title: '完成核心闭环', group_id: 'g1', requirement_refs: ['r1'], acceptance_refs: ['a1'], depends_on: [], resource_claims: [], expected_outputs: [], validators: [] }],
  },
}

function command<T extends BoardCommandV1['type']>(stateRevision: number, type: T, payload: Omit<Extract<BoardCommandV1, { type: T }>, 'schema_version' | 'command_id' | 'change_id' | 'expected_revision' | 'actor' | 'issued_at' | 'type'>): Extract<BoardCommandV1, { type: T }> {
  return { schema_version: 'board-command/v1', command_id: `cmd-${stateRevision}-${type}`, change_id: request.change_id, expected_revision: stateRevision, actor: 'test', issued_at: now, type, ...payload } as Extract<BoardCommandV1, { type: T }>
}

function expectOk(result: ReturnType<typeof applyBoardCommand>) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.message)
  return result.state
}

describe('autonomous orchestration v1', () => {
  test('显式 Skill 优先，缺口按 descriptor 顺序自动选择', () => {
    const resolution = resolveCapabilities({ request, assessment, skills: descriptors, mcps: [], resolution_id: 'resolution-1', resolved_at: now })
    expect(resolution.status).toBe('resolved')
    expect(resolution.selected_skills.map((skill) => skill.id)).toEqual(['skill.plan', 'skill.test'])
    expect(resolution.selected_skills[0]?.source).toBe('user')
    expect(resolution.selected_skills[1]?.source).toBe('auto')
  })

  test('异构输出 contract unknown 不会被当成完成', () => {
    const state0 = createOrchestrationState(request)
    const state1 = expectOk(applyBoardCommand(state0, command(0, 'record-assessment', { assessment, context })))
    const state2 = expectOk(applyBoardCommand(state1, command(1, 'attach-work-graph', { graph })))
    const resolution = resolveCapabilities({ request, assessment, skills: descriptors, mcps: [], resolution_id: 'resolution-1', resolved_at: now })
    const state3 = expectOk(applyBoardCommand(state2, command(2, 'resolve-capabilities', { resolution })))
    const state4 = expectOk(applyBoardCommand(state3, command(3, 'start', {})))
    const state5 = expectOk(applyBoardCommand(state4, command(4, 'claim-work-item', { work_item_id: 'item-1', worker_id: 'worker-1' })))
    const state6 = expectOk(applyBoardCommand(state5, command(5, 'begin-skill-run', { work_item_id: 'item-1', run_id: 'run-1', skill_id: 'skill.plan', skill_version: '1.0.0', now })))
    const result = { schema_version: 'skill-result/v1' as const, result_id: 'result-1', run_id: 'run-1', status: 'completed' as const, contract_status: 'unknown' as const, artifacts: [], diagnostics: [], produced_at: now }
    const state7 = expectOk(applyBoardCommand(state6, command(6, 'complete-skill-run', { run_id: 'run-1', result })))
    expect(state7.status).toBe('blocked')
    expect(state7.work_items[0]?.status).toBe('blocked')
    expect(state7.work_items[0]?.blocked_reason).toBe('result-contract-unproven')
  })

  test('验证通过后进入 verifying，gate 通过才 completed', () => {
    let state = createOrchestrationState(request)
    state = expectOk(applyBoardCommand(state, command(state.revision, 'record-assessment', { assessment, context })))
    state = expectOk(applyBoardCommand(state, command(state.revision, 'attach-work-graph', { graph })))
    const resolution = resolveCapabilities({ request, assessment, skills: descriptors, mcps: [], resolution_id: 'resolution-1', resolved_at: now })
    state = expectOk(applyBoardCommand(state, command(state.revision, 'resolve-capabilities', { resolution })))
    state = expectOk(applyBoardCommand(state, command(state.revision, 'start', {})))
    state = expectOk(applyBoardCommand(state, command(state.revision, 'claim-work-item', { work_item_id: 'item-1', worker_id: 'worker-1' })))
    state = expectOk(applyBoardCommand(state, command(state.revision, 'begin-skill-run', { work_item_id: 'item-1', run_id: 'run-1', skill_id: 'skill.plan', skill_version: '1.0.0', now })))
    const result = { schema_version: 'skill-result/v1' as const, result_id: 'result-1', run_id: 'run-1', status: 'completed' as const, contract_status: 'validated' as const, artifacts: [], diagnostics: [], produced_at: now }
    state = expectOk(applyBoardCommand(state, command(state.revision, 'complete-skill-run', { run_id: 'run-1', result })))
    state = expectOk(applyBoardCommand(state, command(state.revision, 'record-validation', { report: { schema_version: 'validation-report/v1', report_id: 'report-1', work_item_id: 'item-1', status: 'pass', checks: [{ id: 'check-1', status: 'pass', validator: 'unit', evidence_refs: [] }], produced_at: now } })))
    expect(state.status).toBe('verifying')
    state = expectOk(applyBoardCommand(state, command(state.revision, 'evaluate-gate', { gate: { schema_version: 'gate-evaluation/v1', gate_id: 'gate-1', change_id: request.change_id, kind: 'verification', status: 'passed', actor: 'test', evaluated_at: now } })))
    expect(state.status).toBe('completed')
  })

  test('CAS 拒绝过期看板命令，pause/resume 保留恢复状态', () => {
    const state0 = createOrchestrationState(request)
    const stale = applyBoardCommand(state0, command(1, 'cancel', { reason: 'stale' }))
    expect(stale).toMatchObject({ ok: false, code: 'revision-conflict' })
    const state1 = expectOk(applyBoardCommand(state0, command(0, 'record-assessment', { assessment, context })))
    const state2 = expectOk(applyBoardCommand(state1, command(1, 'attach-work-graph', { graph })))
    const resolution = resolveCapabilities({ request, assessment, skills: descriptors, mcps: [], resolution_id: 'resolution-1', resolved_at: now })
    const state3 = expectOk(applyBoardCommand(state2, command(2, 'resolve-capabilities', { resolution })))
    const state4 = expectOk(applyBoardCommand(state3, command(3, 'pause', { reason: '用户暂时停止' })))
    expect(state4.status).toBe('paused')
    expect(state4.resume_status).toBe('ready')
    const state5 = expectOk(applyBoardCommand(state4, command(4, 'resume', {})))
    expect(state5.status).toBe('ready')
  })

  test('codec 拒绝未知字段和未声明的 Skill result contract', () => {
    const requestDecode = decodeDevelopmentRequestV1({ ...request, extra: true })
    expect(requestDecode.ok).toBe(false)
    const resultDecode = decodeSkillResultEnvelopeV1({ schema_version: 'skill-result/v1', result_id: 'result-1', run_id: 'run-1', status: 'completed', contract_status: 'validated', artifacts: [], diagnostics: [], produced_at: now })
    expect(resultDecode.ok).toBe(true)
    const reportDecode = decodeValidationReportV1({ schema_version: 'validation-report/v1', report_id: 'report-1', work_item_id: 'item-1', status: 'pass', checks: [{ id: 'check-1', status: 'pass', validator: 'unit', evidence_refs: ['artifact-1'] }], produced_at: now })
    expect(reportDecode.ok).toBe(true)
    if (reportDecode.ok) expect(reportDecode.value.checks[0]?.id).toBe('check-1')
  })
})
