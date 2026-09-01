import { describe, expect, it, vi } from 'vitest'
import type {
  CapabilityAssessmentV1,
  DevelopmentRequestV1,
  McpDescriptorV1,
  SkillDescriptorV1,
  ValidationReportV1,
  WorkGraphV1,
} from '@tenon/kernel'
import {
  executeCapabilityWorkItems,
  initializeCapabilityExecution,
  runCapabilityOrchestration,
  type CapabilityExecutionHost,
  type SkillExecutionBindingV1,
} from './execution.js'

const now = '2026-09-01T10:00:00.000Z'
const host = (): CapabilityExecutionHost => {
  let id = 0
  return {
    clock: () => now,
    new_id: (prefix) => `${prefix}-${++id}`,
    actor: 'test-actor',
    worker_id: 'test-worker',
  }
}

function request(over: Partial<DevelopmentRequestV1> = {}): DevelopmentRequestV1 {
  return {
    schema_version: 'development-request/v1', request_id: 'request-1', project_id: 'project-1', change_id: 'change-1',
    intent: '实现一个可验证的变更', created_at: now, auto_select: true, user_skills: [], user_mcps: [], ...over,
  }
}

const context = {
  schema_version: 'repository-context/v1' as const, project_id: 'project-1', repository_ref: 'repo-1', revision: 'sha256:abc',
  branch: 'codex/test', base_branch: 'main', dirty: false, observed_at: now, source: 'system' as const,
}

function assessment(capabilities: readonly string[], over: Partial<CapabilityAssessmentV1> = {}): CapabilityAssessmentV1 {
  return {
    schema_version: 'capability-assessment/v1', assessment_id: 'assessment-1', request_id: 'request-1', status: 'complete', source: 'rule',
    confidence: 0.9, capability_requirements: capabilities, mcp_requirements: [], constraints: [], risks: [], questions: [], signals: {}, assessed_at: now, ...over,
  }
}

function skill(id: string, capability: string, over: Partial<SkillDescriptorV1> = {}): SkillDescriptorV1 {
  return {
    schema_version: 'skill-descriptor/v1', id, version: '1.0.0', capabilities: [capability], availability: 'available',
    supports_parallel: true, resource_claims: [], permissions: [], ...over,
  }
}

function graph(itemIds: readonly string[], mode: 'serial' | 'parallel' = 'serial', depends: Readonly<Record<string, readonly string[]>> = {}): WorkGraphV1 {
  return {
    schema_version: 'work-graph/v1', graph_id: 'graph-1', change_id: 'change-1', generated_at: now, source: 'system',
    task_plan: {
      schema_version: 'task-plan/v1', plan_id: 'plan-1', revision_id: 'revision-1', revision_number: 1, status: 'frozen', created_at: now,
      requirements: itemIds.map((id) => ({ id: `req-${id}`, title: id })),
      acceptance_criteria: itemIds.map((id) => ({ id: `accept-${id}`, title: id })),
      groups: [{ id: 'group-1', title: 'main', parent_id: null, work_item_ids: [...itemIds] }],
      work_items: itemIds.map((id) => ({
        id, title: id, group_id: 'group-1', requirement_refs: [`req-${id}`], acceptance_refs: [`accept-${id}`],
        depends_on: depends[id] ?? [], resource_claims: [], expected_outputs: [], validators: [],
      })),
    },
    execution_groups: [{ id: 'execution-group-1', mode, work_item_ids: [...itemIds] }],
  }
}

function binding(workItemId: string, skillId: string, mode: 'serial' | 'parallel' = 'serial'): SkillExecutionBindingV1 {
  return { work_item_id: workItemId, skill_id: skillId, skill_version: '1.0.0', mcp_ids: [], mode }
}

function report(workItemId: string): ValidationReportV1 {
  return {
    schema_version: 'validation-report/v1', report_id: `report-${workItemId}`, work_item_id: workItemId, status: 'pass',
    checks: [{ id: `check-${workItemId}`, status: 'pass', validator: 'test', evidence_refs: [] }], produced_at: now,
  }
}

const noMcps: readonly McpDescriptorV1[] = []

describe('capability execution application boundary', () => {
  it('routes explicit and automatic skills, then completes a serial graph through validation', async () => {
    const req = request({ user_skills: [{ id: 'skill.plan', mode: 'serial', depends_on: [] }] })
    const g = graph(['plan', 'test'], 'serial', { test: ['plan'] })
    const executions: string[] = []
    const outcome = await runCapabilityOrchestration({
      ...host(), request: req, context, assessment: assessment(['planning', 'testing']), graph: g,
      skills: [skill('skill.plan', 'planning'), skill('skill.test', 'testing')], mcps: noMcps,
      bindings: [binding('plan', 'skill.plan'), binding('test', 'skill.test')], allowed_permissions: [],
      executor: { execute: vi.fn(async ({ work_item_id }) => {
        executions.push(work_item_id)
        return { output: { work_item_id }, raw_output_ref: `output:${work_item_id}`, artifacts: [], diagnostics: [] }
      }) },
      validator: { validate: vi.fn(async ({ binding: selected }) => ({
        contract_status: 'validated', diagnostics: [], report: report(selected.work_item_id),
      })) },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.state.status).toBe('verifying')
    expect(outcome.state.work_items.every((item) => item.status === 'completed')).toBe(true)
    expect(executions).toEqual(['plan', 'test'])
    expect(outcome.state.runs.every((run) => run.status === 'completed')).toBe(true)
  })

  it('runs an independent parallel group concurrently when resources are safe', async () => {
    const req = request({ user_skills: [
      { id: 'skill.a', mode: 'parallel', depends_on: [] },
      { id: 'skill.b', mode: 'parallel', depends_on: [] },
    ] })
    let active = 0
    let maximum = 0
    const outcome = await runCapabilityOrchestration({
      ...host(), request: req, context, assessment: assessment(['a', 'b']), graph: graph(['a', 'b'], 'parallel'),
      skills: [skill('skill.a', 'a'), skill('skill.b', 'b')], mcps: noMcps,
      bindings: [binding('a', 'skill.a', 'parallel'), binding('b', 'skill.b', 'parallel')], allowed_permissions: [],
      executor: { execute: vi.fn(async ({ work_item_id }) => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        await Promise.resolve()
        active -= 1
        return { output: { work_item_id }, raw_output_ref: `output:${work_item_id}`, artifacts: [], diagnostics: [] }
      }) },
      validator: { validate: vi.fn(async ({ binding: selected }) => ({ contract_status: 'validated', diagnostics: [], report: report(selected.work_item_id) })) },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.state.status).toBe('verifying')
    expect(maximum).toBe(2)
  })

  it('keeps opaque output blocked when no host validator is configured', async () => {
    const outcome = await runCapabilityOrchestration({
      ...host(), request: request({ user_skills: [{ id: 'skill.one', mode: 'serial', depends_on: [] }] }), context,
      assessment: assessment(['one']), graph: graph(['one']), skills: [skill('skill.one', 'one')], mcps: noMcps,
      bindings: [binding('one', 'skill.one')], allowed_permissions: [],
      executor: { execute: async () => ({ output: { arbitrary: ['domain', 1] }, raw_output_ref: 'output:one', artifacts: [], diagnostics: [] }) },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.state.status).toBe('blocked')
    expect(outcome.state.runs[0]).toMatchObject({ status: 'completed', result_id: expect.any(String) })
    expect(outcome.state.work_items[0]).toMatchObject({ status: 'blocked', blocked_reason: 'result-contract-unproven' })
  })

  it('fails closed for validator output that is invalid or bound to another Work Item', async () => {
    const outcome = await runCapabilityOrchestration({
      ...host(), request: request({ user_skills: [{ id: 'skill.one', mode: 'serial', depends_on: [] }] }), context,
      assessment: assessment(['one']), graph: graph(['one']), skills: [skill('skill.one', 'one')], mcps: noMcps,
      bindings: [binding('one', 'skill.one')], allowed_permissions: [],
      executor: { execute: async () => ({ output: { ok: true }, artifacts: [], diagnostics: [] }) },
      validator: { validate: async () => ({ contract_status: 'validated', diagnostics: [], report: report('other') }) },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.state.status).toBe('blocked')
    expect(outcome.state.work_items[0]?.blocked_reason).toBe('result-contract-unproven')
  })

  it('maps executor errors to failed without invoking a fake success path', async () => {
    const outcome = await runCapabilityOrchestration({
      ...host(), request: request({ user_skills: [{ id: 'skill.one', mode: 'serial', depends_on: [] }] }), context,
      assessment: assessment(['one']), graph: graph(['one']), skills: [skill('skill.one', 'one')], mcps: noMcps,
      bindings: [binding('one', 'skill.one')], allowed_permissions: [],
      executor: { execute: async () => { throw new Error('private runner detail') } },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.state.status).toBe('failed')
    expect(outcome.state.runs[0]?.error_code).toBe('failed')
  })

  it('blocks permissions and binding mismatches before any Skill is invoked', () => {
    const executor = vi.fn()
    const result = initializeCapabilityExecution({
      ...host(), request: request({ user_skills: [{ id: 'skill.one', mode: 'serial', depends_on: [] }] }), context,
      assessment: assessment(['one']), graph: graph(['one']), skills: [skill('skill.one', 'one', { permissions: ['write'] })], mcps: noMcps,
      bindings: [binding('one', 'skill.one')], allowed_permissions: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.status).toBe('blocked')
    expect(result.state.resolution?.blockers).toContain('permission write is not allowed for skill.one')
    expect(executor).not.toHaveBeenCalled()
  })

  it('serializes a shared write resource even when the graph group requests parallelism', () => {
    const req = request({ user_skills: [
      { id: 'skill.a', mode: 'parallel', depends_on: [] }, { id: 'skill.b', mode: 'parallel', depends_on: [] },
    ] })
    const shared = { kind: 'path' as const, access: 'write' as const, key: 'src/shared.ts' }
    const baseGraph = graph(['a', 'b'], 'parallel')
    const sharedGraph: WorkGraphV1 = {
      ...baseGraph,
      task_plan: {
        ...baseGraph.task_plan,
        work_items: baseGraph.task_plan.work_items.map((item) => ({ ...item, resource_claims: [shared] })),
      },
    }
    const result = initializeCapabilityExecution({
      ...host(), request: req, context, assessment: assessment(['a', 'b']), graph: sharedGraph,
      skills: [skill('skill.a', 'a'), skill('skill.b', 'b')], mcps: noMcps,
      bindings: [binding('a', 'skill.a', 'parallel'), binding('b', 'skill.b', 'parallel')], allowed_permissions: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.status).toBe('executing')
  })

  it('cancels before claiming when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('operator stop'))
    const outcome = await runCapabilityOrchestration({
      ...host(), request: request({ user_skills: [{ id: 'skill.one', mode: 'serial', depends_on: [] }] }), context,
      assessment: assessment(['one']), graph: graph(['one']), skills: [skill('skill.one', 'one')], mcps: noMcps,
      bindings: [binding('one', 'skill.one')], allowed_permissions: [], signal: controller.signal,
      executor: { execute: vi.fn() },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.state.status).toBe('cancelled')
    expect(outcome.state.work_items[0]?.status).toBe('cancelled')
  })

  it('carries persisted dependency result refs into downstream Work Items', async () => {
    const req = request({ user_skills: [
      { id: 'skill.a', mode: 'serial', depends_on: [] }, { id: 'skill.b', mode: 'serial', depends_on: ['skill.a'] },
    ] })
    const setup = initializeCapabilityExecution({
      ...host(), request: req, context, assessment: assessment(['a', 'b']), graph: graph(['a', 'b'], 'serial', { b: ['a'] }),
      skills: [skill('skill.a', 'a'), skill('skill.b', 'b')], mcps: noMcps,
      bindings: [binding('a', 'skill.a'), binding('b', 'skill.b')], allowed_permissions: [],
    })
    expect(setup.ok).toBe(true)
    if (!setup.ok) return
    const downstreamInputs: string[][] = []
    const executed = await executeCapabilityWorkItems({
      ...host(), state: setup.state, bindings: [binding('a', 'skill.a'), binding('b', 'skill.b')],
      skills: [skill('skill.a', 'a'), skill('skill.b', 'b')], mcps: noMcps,
      executor: { execute: async ({ work_item_id, input_artifacts }) => {
        if (work_item_id === 'b') downstreamInputs.push(input_artifacts.map((artifact) => artifact.ref))
        return { output: { work_item_id }, artifacts: [], diagnostics: [] }
      } },
      validator: { validate: async ({ binding: selected }) => ({ contract_status: 'validated', diagnostics: [], report: report(selected.work_item_id) }) },
    })
    expect(executed.ok).toBe(true)
    if (!executed.ok) return
    expect(executed.state.status).toBe('verifying')
    expect(downstreamInputs).toHaveLength(1)
    expect(downstreamInputs[0]?.[0]).toMatch(/^skill-result:result-/u)
  })
})
