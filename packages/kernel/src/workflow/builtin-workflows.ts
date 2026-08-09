import type { WorkflowDef } from './types.js'

/**
 * Versioned, plugin-owned workflows. Project files cannot shadow these identities.
 *
 * `simple` intentionally has no OpenSpec contract or document fields. It keeps a canonical Change
 * and auditable transitions while avoiding the seven-phase product/engineering ceremony.
 */
const SIMPLE_WORKFLOW: WorkflowDef = {
  name: 'simple',
  reviewBudget: { version: 'v1', max_attempts: 2 },
  steps: [
    {
      id: 'change',
      label: 'Change',
      gate: null,
      skills: [{ id: 'simple-task' }],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: [
        { event: 'change-complete', to: 'verify' },
        { event: 'scope-expanded', to: 'escalated', actions: [{ type: 'archive-run' }] },
      ],
    },
    {
      id: 'verify',
      label: 'Verify',
      gate: null,
      reviewLanes: ['e2e'],
      skills: [{ id: 'verification-before-completion', kind: 'review', review_lane: 'e2e' }],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: [
        {
          event: 'verify-pass',
          to: 'done',
          actions: [{ type: 'mark-verification-passed' }, { type: 'archive-run' }],
        },
        { event: 'verify-fail', to: 'change', actions: [{ type: 'mark-verification-failed' }] },
        { event: 'scope-expanded', to: 'escalated', actions: [{ type: 'archive-run' }] },
      ],
    },
    {
      id: 'done',
      label: 'Done',
      gate: null,
      skills: [],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: [],
    },
    {
      id: 'escalated',
      label: 'Escalated',
      gate: null,
      skills: [],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: [],
    },
  ],
}

export const BUILTIN_WORKFLOW_IDS = ['simple'] as const
export type BuiltinWorkflowId = (typeof BUILTIN_WORKFLOW_IDS)[number]

export function builtinWorkflow(name: string): WorkflowDef | null {
  if (name !== 'simple') return null
  return structuredClone(SIMPLE_WORKFLOW)
}
