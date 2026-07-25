export type WbHookEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse'

export interface WbHookMeta {
  id: string
  event: WbHookEvent
  matcher: string
  script: string
  configurable: boolean
}

export interface WbHooksConfig {
  hooks: WbHookMeta[]
  matrix: Record<string, false>
}

export interface ChangeHistoryEntry {
  ts: string
  kind: string
  field?: string
  from?: string
  to?: string
  by?: string
  raw?: string
}

export interface WbSkillEntry {
  name: string
  installed: boolean
  source: 'local-plugin' | 'external-marketplace' | 'builtin' | 'user'
  description?: string
  tier?: 'mandatory' | 'recommended' | 'conditional' | 'optional'
  available?: boolean
  installCmd?: string
  version?: string
}

export interface WbTrackDefinition {
  id: string
  label: string
  builtin: boolean
  workflow: { default: string; allowed: '*' | string[] }
  policyProfile: {
    reviewSeed: 'pending' | 'skipped'
    autoEnqueueOnSpecComplete?: boolean
    automationEligible: boolean
    coverageProfile: 'none' | 'pm' | 'frontend' | 'backend'
    routing:
      | { enabled: false }
      | { enabled: true; pattern: string; excludePattern?: string; priority: number }
    skills: { matrix: boolean; profile: string }
  }
}

export interface WbRouterPreviewCandidate {
  track: WbTrackDefinition
  order: number
  priority: number
  score: number
  routable: boolean
  excluded: boolean
}

export interface WbRouterPreview {
  ok: true
  revision: string
  source: 'builtin-only' | 'project-file'
  winner: WbRouterPreviewCandidate | null
  candidates: WbRouterPreviewCandidate[]
  suppressed_reason: 'system-notification' | 'slash-command' | 'discussion' | null
}

export type ChangeSessionStatus = 'not_requested' | 'unavailable' | 'failed' | 'degraded' | 'active'

export interface ChangeSessionLaunch {
  requested: boolean
  active: boolean
  status: ChangeSessionStatus
  exit_code: number | null
}

export interface CreatedChange {
  ok: true
  name: string
  /** Current servers return the initialized directory; older compatible responses may omit it. */
  path?: string
  task_prompt_saved?: boolean
  session?: ChangeSessionLaunch
}

export interface WbConfigSnapshot {
  ok: true
  generated_at: string
  revision: string
  source: 'builtin-only' | 'project-file'
  mandatory_skills: Record<string, string[]>
  tracks: WbTrackDefinition[]
  mandatory_skills_writable_profiles: string[]
}
