import { describe, expect, it } from 'vitest'
import {
  evaluateWorkflowDecompositionMaterialization,
  workflowDecompositionCandidateFingerprint,
} from './decomposition-policy-evaluator.js'
import type { WorkflowDecompositionCandidate } from './decomposition-policy-evaluator.js'
import type { WorkflowDecompositionPolicyV1 } from './types.js'

const RUN_FINGERPRINT = 'a'.repeat(64)
const EXECUTABLE_PLAN_DIGEST = 'e'.repeat(64)
const authority = {
  authority_id: 'authority-1',
  workflow_run_id: 'run-1',
  workflow_fingerprint: RUN_FINGERPRINT,
} as const

type CandidateSemantics = Omit<WorkflowDecompositionCandidate, 'candidate_fingerprint' | 'executable_plan_digest'> & {
  readonly executable_plan_digest: string
}

function canonicalCandidateFingerprint(candidate: CandidateSemantics): string {
  return workflowDecompositionCandidateFingerprint(candidate)
}

function candidate(overrides: Partial<CandidateSemantics> = {}) {
  const semantics: CandidateSemantics = {
    item_count: 2,
    resulting_depth: 1,
    matched_auto_when: ['independent-work-items'],
    triggered_ask_when: [],
    classification: 'routine-reversible',
    executable_plan_digest: EXECUTABLE_PLAN_DIGEST,
    ...overrides,
  }
  return { ...semantics, candidate_fingerprint: canonicalCandidateFingerprint(semantics) }
}

const CANDIDATE_FINGERPRINT = candidate().candidate_fingerprint

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
    candidate: candidate(),
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

  it('hard-blocks missing authorization in auto-safe even when policy does not ask and classification is routine', () => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      policy: policy({ ask_when: [] }),
      candidate: {
        ...input().candidate,
        triggered_ask_when: ['missing-authorization'],
        classification: 'routine-reversible',
      },
    }))

    expect(result).toMatchObject({ allowed: false, status: 'hard-blocked' })
    expect(result.denials).toContainEqual(expect.objectContaining({
      code: 'decomposition-missing-authorization',
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

  it('rejects require-review when the executable plan identity is absent', () => {
    const base = input({
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
    })
    const candidateWithoutPlan = { ...base.candidate, executable_plan_digest: undefined }
    const result = evaluateWorkflowDecompositionMaterialization({
      ...base,
      candidate: candidateWithoutPlan,
    } as unknown as Parameters<typeof evaluateWorkflowDecompositionMaterialization>[0])

    expect(result).toMatchObject({ allowed: false, status: 'hard-blocked' })
  })

  it.each([
    ['item count', { item_count: 3 }],
    ['resulting depth', { resulting_depth: 2 }],
    ['matched auto condition', { matched_auto_when: ['context-budget-risk'] }],
    ['triggered ask condition', { triggered_ask_when: ['ambiguous-requirements'] }],
    ['classification', { classification: 'irreversible' }],
    ['executable plan digest', { executable_plan_digest: 'f'.repeat(64) }],
  ] as const)('rejects a receipt when %s changes under a reused candidate fingerprint', (_label, mutation) => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      policy: policy({ mode: 'require-review' }),
      candidate: { ...input().candidate, ...mutation },
      hardConfirmation: {
        status: 'confirmed',
        ...authority,
        action: 'materialize-work-items',
      },
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

    expect(result).toMatchObject({ allowed: false, status: 'hard-blocked' })
    expect(result.denials).toContainEqual(expect.objectContaining({
      code: 'decomposition-review-receipt-mismatch',
    }))
  })

  it('hard-blocks missing authorization even with an exact require-review receipt', () => {
    const result = evaluateWorkflowDecompositionMaterialization(input({
      policy: policy({ mode: 'require-review', ask_when: [] }),
      candidate: {
        ...input().candidate,
        triggered_ask_when: ['missing-authorization'],
        classification: 'routine-reversible',
      },
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

    expect(result).toMatchObject({ allowed: false, status: 'hard-blocked' })
    expect(result.denials).toContainEqual(expect.objectContaining({
      code: 'decomposition-missing-authorization',
    }))
  })
})
