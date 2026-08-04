import { describe, expect, it } from 'vitest'
import { evaluateWorkflowDecompositionMaterialization } from './decomposition-policy-evaluator.js'
import type { WorkflowDecompositionPolicyV1 } from './types.js'

const RUN_FINGERPRINT = 'a'.repeat(64)
const CANDIDATE_FINGERPRINT = 'c'.repeat(64)
const authority = {
  authority_id: 'authority-1',
  workflow_run_id: 'run-1',
  workflow_fingerprint: RUN_FINGERPRINT,
} as const

function policy(
  overrides: Partial<WorkflowDecompositionPolicyV1> = {},
): WorkflowDecompositionPolicyV1 {
  return {
    version: 'v1',
    mode: 'auto-safe',
    target: 'work-items',
    strategy: 'balanced',
    max_items: 4,
    max_depth: 2,
    auto_when: ['independent-work-items'],
    ask_when: ['ambiguous-requirements', 'hard-boundary', 'limit-exceeded'],
    ...overrides,
  }
}

function input(overrides: Record<string, unknown> = {}) {
  const grant = { status: 'valid', grants: ['materialize-work-items'] } as const
  return {
    policy: policy(),
    interactionMode: 'afk' as const,
    authority,
    layers: { platform: grant, skill: grant, project: grant, run: grant },
    candidate: {
      item_count: 2,
      resulting_depth: 1,
      matched_auto_when: ['independent-work-items'],
      triggered_ask_when: [],
      candidate_fingerprint: CANDIDATE_FINGERPRINT,
      classification: 'routine-reversible',
    },
    ...overrides,
  }
}

describe('authoritative decomposition materialization', () => {
  it('materializes auto-safe only when a frozen auto condition matches within both limits', () => {
    expect(evaluateWorkflowDecompositionMaterialization(input())).toMatchObject({
      action: 'materialize-work-items', allowed: true, status: 'allowed', denials: [],
    })
  })

  it.each([
    ['off', 'decomposition-disabled'],
    ['suggest', 'decomposition-suggest-only'],
  ] as const)('keeps %s non-materializing independently of interaction mode', (mode, code) => {
    const result = evaluateWorkflowDecompositionMaterialization(input({ policy: policy({ mode }) }))
    expect(result).toMatchObject({ allowed: false })
    expect(result.denials).toContainEqual(expect.objectContaining({ code }))
  })

  it('hard-blocks an unknown candidate classification even with exact review', () => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      policy: policy({ mode: 'require-review' }),
      candidate: { ...input().candidate, classification: 'future-privilege' },
      review: {
        event_id: 'review-event-7',
        receipt: {
          status: 'approved', event_id: 'review-event-7', action: 'materialize-work-items',
          candidate_fingerprint: CANDIDATE_FINGERPRINT, ...authority,
        },
      },
    }) as Parameters<typeof evaluateWorkflowDecompositionMaterialization>[0])

    expect(result).toMatchObject({ allowed: false, status: 'hard-blocked' })
    expect(result.denials).toContainEqual(expect.objectContaining({
      code: 'decomposition-candidate-malformed',
    }))
  })

  it('denies auto-safe when no configured auto_when condition matches', () => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      candidate: { ...input().candidate, matched_auto_when: ['context-budget-risk'] },
    }))
    expect(result).toMatchObject({ allowed: false })
    expect(result.denials).toContainEqual(expect.objectContaining({
      code: 'decomposition-auto-condition-unmatched',
    }))
  })

  it.each([
    ['item ceiling', { item_count: 5 }, 'decomposition-max-items-exceeded'],
    ['depth ceiling', { resulting_depth: 3 }, 'decomposition-max-depth-exceeded'],
  ])('hard-blocks the frozen %s', (_label, candidateOverride, code) => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      candidate: { ...input().candidate, ...candidateOverride },
    }))
    expect(result).toMatchObject({ allowed: false, status: 'hard-blocked' })
    expect(result.denials).toContainEqual(expect.objectContaining({ code }))
  })

  it.each([
    ['configured ask condition', {
      triggered_ask_when: ['ambiguous-requirements'],
    }, 'decomposition-ask-condition-triggered'],
    ['hard boundary', {
      triggered_ask_when: ['hard-boundary'],
    }, 'decomposition-hard-boundary'],
    ['non-reversible classification', {
      classification: 'external-side-effect',
    }, 'decomposition-auto-safe-reversible-only'],
  ])('fails closed for auto-safe %s', (_label, candidateOverride, code) => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      candidate: { ...input().candidate, ...candidateOverride },
    }))
    expect(result).toMatchObject({ allowed: false })
    expect(result.denials).toContainEqual(expect.objectContaining({ code }))
  })

  it('requires an exact review receipt before require-review materialization', () => {
    const missing = evaluateWorkflowDecompositionMaterialization(input({
      policy: policy({ mode: 'require-review' }),
      review: { event_id: 'review-event-7' },
    }))
    expect(missing).toMatchObject({ allowed: false, status: 'hard-blocked' })
    expect(missing.denials).toContainEqual(expect.objectContaining({
      code: 'decomposition-review-receipt-required',
    }))
  })

  it.each([
    ['event', { event_id: 'other-event' }],
    ['authority', { authority_id: 'other-authority' }],
    ['action', { action: 'create-child-pipeline' }],
    ['run', { workflow_run_id: 'other-run' }],
    ['workflow fingerprint', { workflow_fingerprint: 'b'.repeat(64) }],
    ['candidate fingerprint', { candidate_fingerprint: 'd'.repeat(64) }],
  ])('rejects a require-review receipt for another %s', (_label, receiptOverride) => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      policy: policy({ mode: 'require-review' }),
      review: {
        event_id: 'review-event-7',
        receipt: {
          status: 'approved',
          event_id: 'review-event-7',
          action: 'materialize-work-items',
          candidate_fingerprint: CANDIDATE_FINGERPRINT,
          ...authority,
          ...receiptOverride,
        },
      },
    }))
    expect(result).toMatchObject({ allowed: false, status: 'hard-blocked' })
  })

  it('allows require-review only with the exact approved event and authority binding', () => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      policy: policy({ mode: 'require-review' }),
      review: {
        event_id: 'review-event-7',
        receipt: {
          status: 'approved',
          event_id: 'review-event-7',
          action: 'materialize-work-items',
          candidate_fingerprint: CANDIDATE_FINGERPRINT,
          ...authority,
        },
      },
    }))
    expect(result).toMatchObject({ allowed: true, status: 'allowed' })
  })
})
