import { describe, expect, it } from 'vitest'
import {
  DEFINITION_CATALOG_EVENT_SCHEMA,
  DEFINITION_CATALOG_SCHEMA,
  PIPELINE_SELECTION_SCHEMA,
  validateDefinitionCatalogEventV1,
  validateDefinitionCatalogV1,
  validatePipelineSelectionV1,
} from './index.js'

const catalog = {
  schema_version: DEFINITION_CATALOG_SCHEMA,
  revision: '0123456789abcdef',
  fingerprint: '0123456789abcdef0123456789abcdef',
  generated_at: '2026-09-02T00:00:00.000Z',
  project: { root: '/tmp/project', identity: 'abc' },
  adapters: [{
    id: 'codex', label: 'Codex', kind: 'native', tier: 'A', cli_flag: '--codex', target_scope: 'user',
    capabilities: { inject: true, veto: true, track: true }, supported_operations: ['setup', 'update'], state: 'detected',
  }],
  workflows: [{
    id: 'default', version: 'v1', fingerprint: 'wf', source: 'builtin', readonly: true,
    steps: [{ id: 'open', label: 'Open', order: 0, gate: null, skill_ids: ['tenon-open'], skill_dependencies: { 'tenon-open': [] }, transition_events: ['open-complete'] }],
  }],
  tracks: [{ id: 'simple', label: 'Simple', builtin: true, revision: 'rev', source: 'builtin', default_workflow: 'default', allowed_workflows: '*' }],
  pipelines: [{
    id: 'default:simple', version: 'v1', fingerprint: 'pipe', source: 'builtin', workflow_id: 'default', track_id: 'simple',
    stage_order: ['open'], stages: [{ id: 'open', label: 'Open', order: 0, mode: 'serial', skill_ids: ['tenon-open'], skill_dependencies: { 'tenon-open': [] }, depends_on: [], gate: null }],
  }],
} as const

describe('definition catalog codec', () => {
  it('accepts the complete v1 projection and event envelope', () => {
    expect(validateDefinitionCatalogV1(catalog)).toBe(true)
    expect(validateDefinitionCatalogEventV1({
      schema_version: DEFINITION_CATALOG_EVENT_SCHEMA,
      kind: 'snapshot',
      revision: catalog.revision,
      fingerprint: catalog.fingerprint,
      catalog,
    })).toBe(true)
  })

  it('rejects missing nested stage dependency and unknown adapter state', () => {
    expect(validateDefinitionCatalogV1({
      ...catalog,
      adapters: [{ ...catalog.adapters[0], state: 'bogus' }],
    })).toBe(false)
    expect(validateDefinitionCatalogV1({
      ...catalog,
      pipelines: [{ ...catalog.pipelines[0], stages: [{ ...catalog.pipelines[0].stages[0], depends_on: [1] }] }],
    })).toBe(false)
  })

  it('accepts and rejects the immutable Change pipeline selection receipt', () => {
    const receipt = {
      schema_version: PIPELINE_SELECTION_SCHEMA,
      pipeline_id: 'default:simple:main', pipeline_version: '1', workflow_id: 'default',
      workflow_fingerprint: 'a'.repeat(64), track_id: 'simple', track_revision: 'r1',
      source: 'automatic', selected_at: '2026-09-02T00:00:00.000Z',
    }
    expect(validatePipelineSelectionV1(receipt)).toBe(true)
    expect(validatePipelineSelectionV1({ ...receipt, workflow_fingerprint: 'tampered' })).toBe(false)
  })
})
