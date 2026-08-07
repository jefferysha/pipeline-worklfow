import { skillActionAuthorityContract, type SkillActionAuthorityResolver } from '@tenon/automation'
import type { ExtendedManifestData, SkillTrackKey } from '@tenon/kernel'

/** Adapts the manifest's explicit closed grants to exact WorkflowRun-bound Skill contracts. */
export function createManifestSkillActionAuthorityResolver(
  manifest: Pick<ExtendedManifestData, 'skillActionAuthority'>,
  isKnownProfile: (profile: string) => boolean,
): SkillActionAuthorityResolver {
  return async (query) => {
    const authority = manifest.skillActionAuthority
    const known = query.skillBundleId === '_all' || isKnownProfile(query.skillBundleId)
    if (!authority || !known) return undefined
    const grants = authority.grants[query.skillBundleId as SkillTrackKey] ?? authority.grants._all
    return grants ? skillActionAuthorityContract(query, grants) : undefined
  }
}
