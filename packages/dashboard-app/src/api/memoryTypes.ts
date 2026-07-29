export const RELATED_SESSION_PLATFORMS = ['all', 'claude', 'codex', 'opencode', 'pi'] as const

export type RelatedSessionPlatform = (typeof RELATED_SESSION_PLATFORMS)[number]

export interface RelatedSessionSearchInput {
  root: string
  name: string
  query: string
  platform: RelatedSessionPlatform
}

export interface RelatedSessionMatch {
  platform: Exclude<RelatedSessionPlatform, 'all'>
  session_id: string
  title?: string
  updated_at?: string
  score: number
  hit_count: number
  excerpt: string
  descendants_merged: number
}

export interface RelatedSessionSearchResponse {
  protocol: 'tenon-related-session-memory/v1'
  query: string
  platform: RelatedSessionPlatform
  partial: boolean
  warnings: Array<{ code: string; message: string }>
  matches: RelatedSessionMatch[]
}
