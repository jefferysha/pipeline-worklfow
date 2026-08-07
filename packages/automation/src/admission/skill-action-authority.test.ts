import { describe, expect, it } from 'vitest'
import {
  parseSkillActionAuthorityContract,
  skillActionAuthorityContract,
  type SkillActionAuthorityQuery,
} from './skill-action-authority.js'

const expected: SkillActionAuthorityQuery = {
  change: 'demo',
  skillBundleId: 'backend',
  workflowRunId: 'run-1',
  workflowFingerprint: 'f'.repeat(64),
}

describe('SkillActionAuthorityContract', () => {
  it('accepts only closed grants bound to the exact bundle, Run, and Workflow fingerprint', () => {
    expect(parseSkillActionAuthorityContract(
      skillActionAuthorityContract(expected, ['enter-afk']),
      expected,
    )).toEqual({ status: 'valid', grants: ['enter-afk'] })
  })

  it.each([
    ['missing', undefined, 'missing'],
    ['unknown key', { ...skillActionAuthorityContract(expected, ['enter-afk']), surprise: true }, 'malformed'],
    ['unknown grant', { ...skillActionAuthorityContract(expected, []), grants: ['root-shell'] }, 'malformed'],
    ['bundle mismatch', { ...skillActionAuthorityContract(expected, []), skill_bundle_id: 'other' }, 'identity-mismatch'],
    ['Run mismatch', { ...skillActionAuthorityContract(expected, []), workflow_run_id: 'run-2' }, 'identity-mismatch'],
    ['fingerprint mismatch', {
      ...skillActionAuthorityContract(expected, []), workflow_fingerprint: '0'.repeat(64),
    }, 'fingerprint-mismatch'],
  ] as const)('fails closed for %s', (_label, raw, status) => {
    expect(parseSkillActionAuthorityContract(raw, expected)).toEqual({ status, grants: [] })
  })

  it('rejects sparse grant arrays instead of treating holes as closed actions', () => {
    const sparse = skillActionAuthorityContract(expected, ['enter-afk']) as unknown as { grants: unknown[] }
    sparse.grants = Array(1)
    expect(parseSkillActionAuthorityContract(sparse, expected)).toEqual({ status: 'malformed', grants: [] })
  })
})
