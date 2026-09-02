import { describe, expect, it } from 'vitest'
import { decodeWorkflowPipelineV2, type DevelopmentRequestV2, type RepositoryContextV2 } from '@tenon/kernel'
import {
  assessDevelopmentIntentV2,
  buildWorkGraphV2,
  normalizeCapabilityCatalogV2,
  planDevelopmentV2,
  resolvePlannerCapabilitiesV2,
  type PlannerCatalogInputV2,
} from './planner-v2.js'

const now = '2026-09-02T00:00:00.000Z'
const request: DevelopmentRequestV2 = {
  schema_version: 'development-request/v2', record_id: 'request:req-1', project_id: 'project-1',
  change_id: 'change-1', revision: 0, correlation_id: 'corr-1', actor: { kind: 'user', id: 'u1' }, created_at: now,
  request_id: 'req-1', intent: 'Build a React frontend and a TypeScript API, then run tests',
  interaction_policy: 'recommended-defaults', requested_effects: ['read', 'write'], constraints: [],
  user_skills: [{ id: 'ui-custom', version: '2.0.0', mode: 'parallel', depends_on: [] }],
  user_mcps: [], auto_select: true,
}
const context: RepositoryContextV2 = {
  schema_version: 'repository-context/v2', record_id: 'context:1', project_id: 'project-1', change_id: 'change-1',
  revision: 0, correlation_id: 'corr-1', actor: { kind: 'system', id: 'host' }, created_at: now,
  request_id: 'req-1', repository: { ref: 'repo', branch: 'main', base_branch: 'main', head_sha: 'abc', dirty: false },
  workspace_fingerprint: `sha256:${'a'.repeat(64)}`, policy_digest: `sha256:${'b'.repeat(64)}`,
  skill_catalog_digest: `sha256:${'c'.repeat(64)}`, mcp_catalog_digest: `sha256:${'d'.repeat(64)}`, observed_facts: [],
}

const catalog: PlannerCatalogInputV2 = {
  skills: [
    {
      id: 'ui-custom', version: '2.0.0', source: 'user', availability: 'available',
      capabilities: ['frontend.ui'], supports_parallel: true, permissions: ['repo.write'],
      resource_claims: [{ kind: 'path', key: 'src/ui', access: 'write' }], output_schema_id: 'ui/output-v9',
      validators: ['ui-check'],
    },
    {
      id: 'api-built-in', version: '1.4.0', source: 'builtin', availability: 'available',
      capabilities: ['backend.api'], supports_parallel: false, permissions: ['repo.write'],
      resource_claims: [{ kind: 'path', key: 'src/api', access: 'write' }], output_schema_id: 'api/output-v2',
      validators: ['typecheck'],
    },
    {
      id: 'tests', version: '1.0.0', source: 'builtin', availability: 'available',
      capabilities: ['test.run'], supports_parallel: false, permissions: ['repo.read'], resource_claims: [],
      output_schema_id: 'test/report-v1', validators: ['test-report'],
    },
  ],
  mcps: [],
  allowed_permissions: ['repo.read', 'repo.write'],
}

describe('planner v2', () => {
  it('infers capabilities from natural language without a scene enum', () => {
    const result = assessDevelopmentIntentV2({ request, context, assessment_id: 'assessment:1', assessed_at: now })
    expect(result.normalization).toBe('complete')
    expect(result.requirements.map((item) => item.capability)).toEqual(['frontend.ui', 'backend.api', 'test.run'])
    expect(result).not.toHaveProperty('scene')
  })

  it('rejects accessor/oversized catalog entries before any planning', () => {
    const hostile = { ...catalog, skills: [{ ...catalog.skills[0], extra: 'reject' }] }
    expect(normalizeCapabilityCatalogV2(hostile)).toMatchObject({ ok: false, code: 'catalog-invalid' })
    expect(normalizeCapabilityCatalogV2({ skills: [{ ...catalog.skills[0], id: 'x'.repeat(161) }], mcps: [] })).toMatchObject({ ok: false })
    const accessor = { ...catalog, skills: [] as unknown[] }
    Object.defineProperty(accessor.skills, '0', { enumerable: true, get: () => catalog.skills[0] })
    expect(normalizeCapabilityCatalogV2(accessor)).toMatchObject({ ok: false, code: 'catalog-invalid' })
  })

  it('preserves explicit parallel selection and produces stable graph/resolution digests', () => {
    const assessment = assessDevelopmentIntentV2({ request, context, assessment_id: 'assessment:1', assessed_at: now })
    const first = planDevelopmentV2({ request, context, assessment, catalog, graph_id: 'graph:1', plan_revision_id: 'plan:1', now })
    const second = planDevelopmentV2({ request, context, assessment, catalog, graph_id: 'graph:1', plan_revision_id: 'plan:1', now })
    expect(first.ok).toBe(true)
    expect(second).toEqual(first)
    if (!first.ok) return
    expect(first.graph.execution_groups.find((group) => group.mode === 'parallel')?.work_item_ids).toContain('work-req-frontend-ui')
    expect(first.resolution.bindings.find((binding) => binding.skill_id === 'ui-custom')?.mode).toBe('parallel')
    expect(first.graph.task_plan_digest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(first.resolution.binding_digest).toMatch(/^sha256:[a-f0-9]{64}$/u)
  })

  it('materializes an auditable workflow, inferred track, pipeline and exact stage/Skill order', () => {
    const assessment = assessDevelopmentIntentV2({ request, context, assessment_id: 'assessment:1', assessed_at: now })
    const result = planDevelopmentV2({ request, context, assessment, catalog, graph_id: 'graph:1', plan_revision_id: 'plan:1', now })
    expect(result.ok).toBe(true)
    if (!result.ok || result.pipeline === undefined) return
    expect(result.pipeline.workflow_id).toBe('default')
    expect(result.pipeline.workflow_version).toBe('auto-v2')
    expect(result.pipeline.track_id).toBe('frontend')
    expect(result.pipeline.pipeline_id).toBe('default:frontend:main')
    expect(result.pipeline.customizations).toMatchObject({ custom_workflow: false, custom_track: false, custom_pipeline: false })
    expect(result.pipeline.stage_order).toEqual([
      'work-req-frontend-ui', 'work-req-backend-api', 'work-req-test-run',
    ])
    expect(result.pipeline.stages.map((stage) => stage.skills.map((skill) => `${skill.order}:${skill.skill_id}`))).toEqual([
      ['0:ui-custom'], ['0:api-built-in'], ['0:tests'],
    ])
    expect(result.graph.pipeline_id).toBe(result.pipeline.pipeline_id)
    expect(result.pipeline.pipeline_digest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    const decodedPipeline = decodeWorkflowPipelineV2(result.pipeline)
    if (!decodedPipeline.ok) console.log('PIPELINE_CODEC_ERROR', decodedPipeline.errors, result.pipeline.stages.map((stage) => stage.skills.map((skill) => skill.output_schema_id)))
    expect(decodedPipeline).toMatchObject({ ok: true })
  })

  it('accepts fully custom workflow/track/pipeline identities and user-defined stage order', () => {
    const assessment = assessDevelopmentIntentV2({ request, context, assessment_id: 'assessment:custom', assessed_at: now })
    const blueprint = {
      workflow_id: 'enterprise-delivery', workflow_version: '2026.09', workflow_source: 'user' as const,
      track_id: 'fullstack-team-a', track_revision: 'team-a.7', track_source: 'project' as const,
      pipeline_id: 'enterprise-delivery:fullstack-team-a:release', pipeline_version: '42', pipeline_source: 'user' as const,
      stages: [
        {
          stage_id: 'verify', name: 'Verify', ordinal: 2, execution_mode: 'serial' as const, depends_on: ['build'],
          work_item_ids: ['work-req-test-run'], gate: 'verification' as const, input_refs: ['result:work-req-backend-api'], output_refs: ['result:work-req-test-run'],
          skills: [{ skill_id: 'tests', skill_version: '1.0.0', role: 'review' as const, source: 'user' as const, mode: 'serial' as const, depends_on: [], mcp_ids: [], validator_ids: ['test-report'], order: 0 }],
        },
        {
          stage_id: 'build', name: 'Build', ordinal: 1, execution_mode: 'parallel' as const, depends_on: [],
          work_item_ids: ['work-req-frontend-ui', 'work-req-backend-api'], gate: 'none' as const, input_refs: [], output_refs: ['result:work-req-frontend-ui', 'result:work-req-backend-api'],
          skills: [
            { skill_id: 'api-built-in', skill_version: '1.4.0', role: 'automatic' as const, source: 'automatic' as const, mode: 'serial' as const, depends_on: [], mcp_ids: [], validator_ids: ['typecheck'], order: 20 },
            { skill_id: 'ui-custom', skill_version: '2.0.0', role: 'user' as const, source: 'user' as const, mode: 'parallel' as const, depends_on: ['api-built-in'], mcp_ids: [], validator_ids: ['ui-check'], order: 10 },
          ],
        },
      ],
    }
    const result = planDevelopmentV2({ request, context, assessment, catalog, graph_id: 'graph:custom', plan_revision_id: 'plan:custom', now, pipeline_blueprint: blueprint })
    expect(result.ok).toBe(true)
    if (!result.ok || result.pipeline === undefined) return
    expect(result.pipeline.workflow_id).toBe('enterprise-delivery')
    expect(result.pipeline.track_id).toBe('fullstack-team-a')
    expect(result.pipeline.pipeline_id).toBe('enterprise-delivery:fullstack-team-a:release')
    expect(result.pipeline.customizations).toMatchObject({ custom_workflow: true, custom_track: true, custom_pipeline: true })
    expect(result.pipeline.stage_order).toEqual(['build', 'verify'])
    expect(result.pipeline.stages.find((stage) => stage.stage_id === 'build')?.skills.map((skill) => skill.skill_id)).toEqual(['ui-custom', 'api-built-in'])
  })

  it('reports permission/resource/unresolved blockers without inventing a tool', () => {
    const assessment = assessDevelopmentIntentV2({ request: { ...request, intent: 'Do quantum research' }, context, assessment_id: 'assessment:2', assessed_at: now })
    const restricted = { ...catalog, allowed_permissions: ['repo.read'] as const }
    const graph = buildWorkGraphV2({ request, context, assessment, graph_id: 'graph:2', plan_revision_id: 'plan:2', now })
    const resolution = resolvePlannerCapabilitiesV2({ request, context, assessment, graph, catalog: restricted, now })
    expect(resolution.status).toBe('blocked')
    expect(resolution.bindings).toHaveLength(0)
    expect(resolution.blockers.some((blocker) => blocker.includes('unresolved-capability'))).toBe(true)
    expect(resolution.blockers.some((blocker) => blocker.includes('permission'))).toBe(false)
  })
})
