import {
  WORKFLOW_ACTIONS,
  type WorkflowAction,
  type WorkflowPermissionLayerInput,
} from '@tenon/kernel'

const CONTRACT_KEYS = Object.freeze([
  'version', 'skill_bundle_id', 'workflow_run_id', 'workflow_fingerprint', 'grants',
] as const)
const ACTIONS = new Set<WorkflowAction>(WORKFLOW_ACTIONS)

export interface SkillActionAuthorityContractV1 {
  readonly version: 'v1'
  readonly skill_bundle_id: string
  readonly workflow_run_id: string
  readonly workflow_fingerprint: string
  readonly grants: readonly WorkflowAction[]
}

export interface SkillActionAuthorityQuery {
  readonly change: string
  readonly skillBundleId: string
  readonly workflowRunId: string
  readonly workflowFingerprint: string
}

export type SkillActionAuthorityResolver = (query: SkillActionAuthorityQuery) => Promise<unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Strictly parses an externally supplied Skill contract and binds it to the exact admission facts. */
export function parseSkillActionAuthorityContract(
  raw: unknown,
  expected: SkillActionAuthorityQuery,
): WorkflowPermissionLayerInput {
  if (raw === undefined || raw === null) return { status: 'missing', grants: [] }
  if (!isRecord(raw)) return { status: 'malformed', grants: [] }
  const keys = Object.keys(raw).sort()
  if (keys.length !== CONTRACT_KEYS.length
    || !CONTRACT_KEYS.every((key) => keys.includes(key))) {
    return { status: 'malformed', grants: [] }
  }
  if (raw.version !== 'v1'
    || typeof raw.skill_bundle_id !== 'string' || raw.skill_bundle_id.length === 0
    || typeof raw.workflow_run_id !== 'string' || raw.workflow_run_id.length === 0
    || typeof raw.workflow_fingerprint !== 'string' || raw.workflow_fingerprint.length === 0
    || !Array.isArray(raw.grants)
    || Array.from(raw.grants).some((grant) => typeof grant !== 'string' || !ACTIONS.has(grant as WorkflowAction))
    || new Set(raw.grants).size !== raw.grants.length) {
    return { status: 'malformed', grants: [] }
  }
  if (raw.skill_bundle_id !== expected.skillBundleId
    || raw.workflow_run_id !== expected.workflowRunId) {
    return { status: 'identity-mismatch', grants: [] }
  }
  if (raw.workflow_fingerprint !== expected.workflowFingerprint) {
    return { status: 'fingerprint-mismatch', grants: [] }
  }
  return { status: 'valid', grants: raw.grants as WorkflowAction[] }
}

export function skillActionAuthorityContract(
  query: SkillActionAuthorityQuery,
  grants: readonly WorkflowAction[],
): SkillActionAuthorityContractV1 {
  return {
    version: 'v1',
    skill_bundle_id: query.skillBundleId,
    workflow_run_id: query.workflowRunId,
    workflow_fingerprint: query.workflowFingerprint,
    grants: [...grants],
  }
}
