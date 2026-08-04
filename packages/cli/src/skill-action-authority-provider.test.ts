import { describe, expect, it } from 'vitest'
import type { ExtendedManifestData } from '@tenon/kernel'
import { createManifestSkillActionAuthorityResolver } from './skill-action-authority-provider.js'

const query = {
  change: 'change-a',
  skillBundleId: 'backend',
  workflowRunId: 'run-a',
  workflowFingerprint: 'fingerprint-a',
}

function manifest(grants: { backend?: readonly ['enter-afk']; _all?: readonly ['enter-afk'] } | null) {
  return {
    skillActionAuthority: grants ? { version: 'v1', grants } : null,
  } as Pick<ExtendedManifestData, 'skillActionAuthority'>
}

describe('createManifestSkillActionAuthorityResolver', () => {
  it('emits the closed manifest grant bound to the exact query identity', async () => {
    const resolve = createManifestSkillActionAuthorityResolver(manifest({ backend: ['enter-afk'] }), () => true)
    await expect(resolve(query)).resolves.toEqual({
      version: 'v1',
      skill_bundle_id: 'backend',
      workflow_run_id: 'run-a',
      workflow_fingerprint: 'fingerprint-a',
      grants: ['enter-afk'],
    })
  })

  it('fails closed for missing authority and unknown profile', async () => {
    await expect(createManifestSkillActionAuthorityResolver(manifest(null), () => true)(query)).resolves.toBeUndefined()
    await expect(createManifestSkillActionAuthorityResolver(manifest({ _all: ['enter-afk'] }), () => false)(query)).resolves.toBeUndefined()
  })
})
