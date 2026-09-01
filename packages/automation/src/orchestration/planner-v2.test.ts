import { describe, expect, it } from 'vitest'
import type { DevelopmentRequestV2, RepositoryContextV2 } from '@tenon/kernel'
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
