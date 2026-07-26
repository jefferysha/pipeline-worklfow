export type SolutionMode = 'discussion' | 'simple' | 'default' | 'free' | 'custom'
export type SolutionPhase = 'open' | 'explore' | 'spec' | 'build' | 'verify' | 'ship' | 'archive'
export type EvidenceStep = 'skill' | 'digest' | 'read' | 'review' | 'transition'
export type SolutionModule = 'cli' | 'workflow' | 'dashboard' | 'adapters' | 'automation' | 'diagnostics'
export type HostTier = 'a' | 'b' | 'c'

export interface CommunityLink {
  id: 'repository' | 'docs' | 'support' | 'security' | 'contributing' | 'license'
  href: string
}

export const solutionModes: readonly SolutionMode[] = [
  'discussion',
  'simple',
  'default',
  'free',
  'custom',
]

export const solutionPhases: readonly SolutionPhase[] = [
  'open',
  'explore',
  'spec',
  'build',
  'verify',
  'ship',
  'archive',
]

export const evidenceSteps: readonly EvidenceStep[] = [
  'skill',
  'digest',
  'read',
  'review',
  'transition',
]

export const solutionModules: readonly SolutionModule[] = [
  'cli',
  'workflow',
  'dashboard',
  'adapters',
  'automation',
  'diagnostics',
]

export const hostTiers: readonly HostTier[] = ['a', 'b', 'c']

const repository = 'https://github.com/jefferysha/tenon'

export const communityLinks: readonly CommunityLink[] = [
  { id: 'repository', href: repository },
  { id: 'docs', href: `${repository}/blob/main/docs/usage/README.md` },
  { id: 'support', href: `${repository}/blob/main/SUPPORT.md` },
  { id: 'security', href: `${repository}/blob/main/SECURITY.md` },
  { id: 'contributing', href: `${repository}/blob/main/CONTRIBUTING.md` },
  { id: 'license', href: `${repository}/blob/main/LICENSE` },
]
