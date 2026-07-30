import type { WbTrackDefinition } from './governanceTypes'

export interface TrackMutationSuccess {
  ok: true
  revision: string
  source: 'builtin-only' | 'project-file'
  tracks: WbTrackDefinition[]
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(value)
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key))
}

function decodeTrack(value: unknown): WbTrackDefinition | null {
  const item = record(value)
  const workflow = record(item?.workflow)
  const profile = record(item?.policyProfile)
  const routing = record(profile?.routing)
  const skills = record(profile?.skills)
  if (
    !item || typeof item.id !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(item.id)
    || typeof item.label !== 'string' || item.label.trim() === '' || typeof item.builtin !== 'boolean'
    || !workflow || typeof workflow.default !== 'string' || workflow.default === ''
    || !profile || !routing || !skills
  ) return null
  if (
    !exactKeys(item, ['id', 'label', 'builtin', 'workflow', 'policyProfile'])
    || !exactKeys(workflow, ['default', 'allowed'])
    || !exactKeys(profile, ['reviewSeed', 'automationEligible', 'coverageProfile', 'routing', 'skills'], ['autoEnqueueOnSpecComplete'])
    || !exactKeys(skills, ['matrix', 'profile'])
  ) return null
  const allowed = workflow.allowed
  if (
    allowed !== '*'
    && (
      !Array.isArray(allowed) || allowed.length === 0
      || !allowed.every((entry) => typeof entry === 'string' && entry !== '')
      || new Set(allowed).size !== allowed.length || !allowed.includes(workflow.default)
    )
  ) return null
  if (
    (profile.reviewSeed !== 'pending' && profile.reviewSeed !== 'skipped')
    || (profile.autoEnqueueOnSpecComplete !== undefined && typeof profile.autoEnqueueOnSpecComplete !== 'boolean')
    || typeof profile.automationEligible !== 'boolean'
    || !['none', 'pm', 'frontend', 'backend'].includes(String(profile.coverageProfile))
    || typeof routing.enabled !== 'boolean'
    || typeof skills.matrix !== 'boolean' || typeof skills.profile !== 'string'
  ) return null
  let decodedRouting: WbTrackDefinition['policyProfile']['routing']
  if (routing.enabled === false) {
    if (!exactKeys(routing, ['enabled'])) return null
    decodedRouting = { enabled: false }
  } else {
    if (!exactKeys(routing, ['enabled', 'pattern', 'priority'], ['excludePattern'])) return null
    if (
      typeof routing.pattern !== 'string' || routing.pattern === ''
      || (routing.excludePattern !== undefined
        && (typeof routing.excludePattern !== 'string' || routing.excludePattern === ''))
      || typeof routing.priority !== 'number' || !Number.isSafeInteger(routing.priority) || routing.priority < 0
    ) return null
    try {
      void new RegExp(routing.pattern)
      if (routing.excludePattern !== undefined) void new RegExp(routing.excludePattern)
    } catch {
      return null
    }
    decodedRouting = {
      enabled: true,
      pattern: routing.pattern,
      ...(routing.excludePattern === undefined ? {} : { excludePattern: routing.excludePattern }),
      priority: routing.priority,
    }
  }
  const coverageProfile = profile.coverageProfile
  if (coverageProfile !== 'none' && coverageProfile !== 'pm'
    && coverageProfile !== 'frontend' && coverageProfile !== 'backend') return null
  return {
    id: item.id,
    label: item.label,
    builtin: item.builtin,
    workflow: { default: workflow.default, allowed: allowed === '*' ? '*' : [...allowed] },
    policyProfile: {
      reviewSeed: profile.reviewSeed,
      ...(profile.autoEnqueueOnSpecComplete === undefined
        ? {} : { autoEnqueueOnSpecComplete: profile.autoEnqueueOnSpecComplete }),
      automationEligible: profile.automationEligible,
      coverageProfile,
      routing: decodedRouting,
      skills: { matrix: skills.matrix, profile: skills.profile },
    },
  }
}

export function decodeTrackMutationSuccess(value: unknown): TrackMutationSuccess | null {
  const body = record(value)
  if (!body) return null
  const keys = Object.keys(body)
  if (keys.length !== 4 || !['ok', 'revision', 'source', 'tracks'].every((key) => keys.includes(key))) return null
  if (
    body.ok !== true || typeof body.revision !== 'string' || body.revision.trim() === ''
    || (body.source !== 'builtin-only' && body.source !== 'project-file')
    || !Array.isArray(body.tracks)
  ) return null
  const tracks: WbTrackDefinition[] = []
  const ids = new Set<string>()
  for (const value of body.tracks) {
    const track = decodeTrack(value)
    if (track === null || ids.has(track.id)) return null
    ids.add(track.id)
    tracks.push(track)
  }
  return { ok: true, revision: body.revision, source: body.source, tracks }
}
