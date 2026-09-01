import { describe, expect, it, vi } from 'vitest'
import type {
  CapabilityAssessmentV1,
  DevelopmentRequestV1,
  RepositoryContextSnapshotV1,
} from '@tenon/kernel'
import {
  createCapabilityProposalRequest,
  normalizeCapabilityProposal,
  requestCapabilityAssessment,
  type CapabilityProposalInvocationV1,
} from './proposal.js'

const now = '2026-09-01T10:00:00.000Z'
const request: DevelopmentRequestV1 = {
  schema_version: 'development-request/v1',
  request_id: 'request-1',
  project_id: 'project-1',
  change_id: 'change-1',
  intent: '自动完成一个 TypeScript API 变更',
  created_at: now,
  auto_select: true,
  user_skills: [],
  user_mcps: [],
}
const context: RepositoryContextSnapshotV1 = {
  schema_version: 'repository-context/v1',
  project_id: request.project_id,
  repository_ref: 'repo-1',
  revision: 'sha256:abc',
  branch: 'codex/test',
  base_branch: 'main',
  dirty: false,
  observed_at: now,
  source: 'system',
}
const proposal: CapabilityAssessmentV1 = {
  schema_version: 'capability-assessment/v1',
  assessment_id: 'model-owned-id',
  request_id: request.request_id,
  status: 'complete',
  source: 'model',
  confidence: 0.8,
  capability_requirements: ['edit.typescript', 'run.unit-tests'],
  mcp_requirements: [],
  constraints: ['single repository'],
  risks: ['public API compatibility'],
  questions: [],
  signals: { language: 'typescript' },
  assessed_at: '2020-01-01T00:00:00.000Z',
}
const invocation = (output: unknown = proposal): CapabilityProposalInvocationV1 => ({
  output,
  provenance: { provider: 'fake', model: 'model-1', invocation_id: 'invocation-1' },
})
const host = {
  proposal_id: 'proposal-1',
  assessment_id: 'assessment-1',
  assessed_at: now,
  output_ref: 'proposal:proposal-1',
  expected_provider: 'fake',
}

describe('capability proposal boundary', () => {
  it('freezes the provider request and keeps scene choice out of the contract', () => {
    const value = createCapabilityProposalRequest(request, context, ['no deploy'])
    expect(value).toMatchObject({
      schema_version: 'capability-proposal-request/v1',
      request_id: request.request_id,
      change_id: request.change_id,
      user_constraints: ['no deploy'],
    })
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.context)).toBe(true)
    expect(value).not.toHaveProperty('scene')
  })

  it('normalizes valid model output and replaces model-owned identity/time with host values', () => {
    const outcome = normalizeCapabilityProposal(request, context, invocation(), host)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.assessment).toMatchObject({
      assessment_id: 'assessment-1',
      request_id: request.request_id,
      source: 'model',
      assessed_at: now,
      capability_requirements: ['edit.typescript', 'run.unit-tests'],
    })
    expect(outcome.evidence).toMatchObject({
      proposal_id: 'proposal-1',
      context_revision: context.revision,
      output_ref: 'proposal:proposal-1',
      media_type: 'application/json',
    })
    expect(outcome.evidence.output_digest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(outcome.evidence.output_bytes).toBeGreaterThan(0)
  })

  it.each([
    ['unknown field', { ...proposal, scene: 'backend' }, 'proposal-invalid'],
    ['wrong request binding', { ...proposal, request_id: 'request-other' }, 'proposal-binding-mismatch'],
    ['self-asserted non-model source', { ...proposal, source: 'system' }, 'proposal-invalid'],
  ])('rejects %s', (_name, output, code) => {
    expect(normalizeCapabilityProposal(request, context, invocation(output), host)).toMatchObject({
      ok: false,
      code,
    })
  })

  it('rejects provider provenance that does not match the host adapter', () => {
    expect(normalizeCapabilityProposal(request, context, invocation(), {
      ...host,
      expected_provider: 'another-provider',
    })).toMatchObject({ ok: false, code: 'provider-provenance-mismatch' })
  })

  it('rejects oversized and cyclic output without invoking the Kernel decoder on it', () => {
    expect(normalizeCapabilityProposal(request, context, invocation({ value: 'x'.repeat(1_024) }), {
      ...host,
      max_output_bytes: 128,
    })).toMatchObject({ ok: false, code: 'proposal-too-large' })

    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(normalizeCapabilityProposal(request, context, invocation(cyclic), host)).toMatchObject({
      ok: false,
      code: 'invocation-invalid',
    })
  })

  it('rejects accessor properties instead of executing them', () => {
    const getter = vi.fn(() => proposal)
    const malicious = {
      provenance: invocation().provenance,
      get output() { return getter() },
    }
    expect(normalizeCapabilityProposal(request, context, malicious, host)).toMatchObject({
      ok: false,
      code: 'invocation-invalid',
    })
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects prototype-pollution keys before they reach the Kernel decoder', () => {
    const output = { ...proposal, signals: JSON.parse('{"__proto__":"data"}') as Record<string, string> }
    const outcome = normalizeCapabilityProposal(request, context, invocation(output), host)
    expect(outcome).toMatchObject({ ok: false, code: 'invocation-invalid' })
  })

  it('maps provider failure and abort to stable failure codes', async () => {
    const failure = await requestCapabilityAssessment({
      request,
      context,
      provider: { kind: 'fake', propose: vi.fn(async () => { throw new Error('secret provider detail') }) },
      host,
      signal: new AbortController().signal,
    })
    expect(failure).toMatchObject({ ok: false, code: 'provider-failed' })

    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    const provider = { kind: 'fake', propose: vi.fn(async () => invocation()) }
    const aborted = await requestCapabilityAssessment({ request, context, provider, host, signal: controller.signal })
    expect(aborted).toMatchObject({ ok: false, code: 'provider-aborted' })
    expect(provider.propose).not.toHaveBeenCalled()
  })
})
