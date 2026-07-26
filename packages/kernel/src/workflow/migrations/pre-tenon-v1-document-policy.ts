import type { DocumentGovernancePolicy } from '../document-contract.js'

const STEPS = ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'] as const
const RETIRED_SKILL_NAMESPACE = ['pipeline', 'lite'].join('-')
const retiredQualifiedSkill = (id: string): string => `${RETIRED_SKILL_NAMESPACE}:${id}`

/**
 * Immutable reader for the default document policy embedded by the pre-Tenon v1 runtime.
 *
 * This is persistence-protocol compatibility, not a public CLI or Skill alias. It exists only so
 * an in-flight, fingerprint-pinned WorkflowRun remains executable after the product identity
 * migration. New snapshots write v2 and carry their complete policy instead of consulting this
 * table.
 */
const PRE_TENON_DEFAULT_DOCUMENT_POLICY: DocumentGovernancePolicy = {
  id: 'openspec-v1',
  steps: STEPS,
  outputsByStep: {
    open: [
      { kind: 'proposal', producerCandidates: ['openspec-propose', 'opsx:propose'] },
      { kind: 'openspec-design', producerCandidates: ['openspec-propose', 'opsx:propose'] },
      { kind: 'tasks', producerCandidates: ['openspec-propose', 'opsx:propose'] },
    ],
    explore: [
      { kind: 'superpower-design', producerCandidates: ['brainstorming', 'superpowers:brainstorming'] },
      {
        kind: 'adr',
        producerCandidates: [
          'pipeline-explore',
          retiredQualifiedSkill('pipeline-explore'),
          'brainstorming',
          'superpowers:brainstorming',
        ],
      },
    ],
    spec: [
      { kind: 'delta-spec', producerCandidates: ['openspec-propose', 'opsx:propose'] },
      { kind: 'superpower-plan', producerCandidates: ['writing-plans', 'superpowers:writing-plans'] },
      { kind: 'plan', producerCandidates: ['writing-plans', 'superpowers:writing-plans'] },
    ],
    build: [],
    verify: [{
      kind: 'verification-report',
      producerCandidates: [
        'verification-before-completion',
        'superpowers:verification-before-completion',
        'pipeline-verify',
        retiredQualifiedSkill('pipeline-verify'),
      ],
    }],
    ship: [{ kind: 'applied-spec', producerCandidates: ['openspec-apply-change', 'opsx:apply'] }],
    archive: [],
  },
  mutableByStep: {
    open: [],
    explore: [
      { kind: 'proposal', producerCandidates: ['pipeline-explore', retiredQualifiedSkill('pipeline-explore')] },
      { kind: 'openspec-design', producerCandidates: ['pipeline-explore', retiredQualifiedSkill('pipeline-explore')] },
      { kind: 'tasks', producerCandidates: ['pipeline-explore', retiredQualifiedSkill('pipeline-explore')] },
    ],
    spec: [
      { kind: 'proposal', producerCandidates: ['pipeline-spec', retiredQualifiedSkill('pipeline-spec')] },
      { kind: 'openspec-design', producerCandidates: ['pipeline-spec', retiredQualifiedSkill('pipeline-spec')] },
      { kind: 'tasks', producerCandidates: ['pipeline-spec', retiredQualifiedSkill('pipeline-spec')] },
      { kind: 'superpower-design', producerCandidates: ['pipeline-spec', retiredQualifiedSkill('pipeline-spec')] },
    ],
    build: [{ kind: 'tasks', producerCandidates: ['pipeline-build', retiredQualifiedSkill('pipeline-build')] }],
    verify: [{ kind: 'tasks', producerCandidates: ['pipeline-verify', retiredQualifiedSkill('pipeline-verify')] }],
    ship: [{ kind: 'tasks', producerCandidates: ['pipeline-ship', retiredQualifiedSkill('pipeline-ship')] }],
    archive: [{ kind: 'tasks', producerCandidates: ['pipeline-archive', retiredQualifiedSkill('pipeline-archive')] }],
  },
  readsByStep: {
    open: [],
    explore: ['proposal', 'openspec-design', 'tasks'],
    spec: ['proposal', 'openspec-design', 'tasks', 'superpower-design', 'adr'],
    build: [
      'proposal',
      'openspec-design',
      'tasks',
      'superpower-design',
      'adr',
      'delta-spec',
      'superpower-plan',
      'plan',
    ],
    verify: [
      'proposal',
      'openspec-design',
      'tasks',
      'superpower-design',
      'adr',
      'delta-spec',
      'superpower-plan',
      'plan',
    ],
    ship: [
      'proposal',
      'openspec-design',
      'tasks',
      'superpower-design',
      'adr',
      'delta-spec',
      'superpower-plan',
      'plan',
      'verification-report',
    ],
    archive: [
      'proposal',
      'openspec-design',
      'tasks',
      'superpower-design',
      'adr',
      'delta-spec',
      'superpower-plan',
      'plan',
      'verification-report',
      'applied-spec',
    ],
  },
}

const PRE_TENON_DEFAULT_WORKFLOW_FINGERPRINT =
  'c9a829b12b12138522532a9127efb8b93a551b1f28922a53dc174ad13e35b7dd'

export function preTenonV1DocumentPolicy(
  workflowId: string,
  workflowFingerprint: string,
): DocumentGovernancePolicy | undefined {
  if (
    workflowId !== 'default'
    || workflowFingerprint !== PRE_TENON_DEFAULT_WORKFLOW_FINGERPRINT
  ) return undefined
  return PRE_TENON_DEFAULT_DOCUMENT_POLICY
}
