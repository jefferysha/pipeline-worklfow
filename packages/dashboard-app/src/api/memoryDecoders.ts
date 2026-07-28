import type {
  RelatedSessionMatch,
  RelatedSessionPlatform,
  RelatedSessionSearchResponse,
} from './memoryTypes'
import { RELATED_SESSION_PLATFORMS } from './memoryTypes'
import { isRecord, optionalString } from './transport'

function isPlatform(value: unknown): value is RelatedSessionPlatform {
  return typeof value === 'string'
    && RELATED_SESSION_PLATFORMS.some((platform) => platform === value)
}

function isSessionPlatform(value: unknown): value is RelatedSessionMatch['platform'] {
  return isPlatform(value) && value !== 'all'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function decodeMatch(value: unknown): RelatedSessionMatch | null {
  if (!isRecord(value)
    || !isSessionPlatform(value.platform)
    || typeof value.session_id !== 'string'
    || value.session_id.length === 0
    || !optionalString(value.title)
    || !optionalString(value.updated_at)
    || (value.updated_at !== undefined && !Number.isFinite(Date.parse(value.updated_at)))
    || !isFiniteNumber(value.score)
    || value.score < 0
    || typeof value.hit_count !== 'number'
    || !Number.isInteger(value.hit_count)
    || value.hit_count < 1
    || typeof value.excerpt !== 'string'
    || Array.from(value.excerpt).length > 320
    || typeof value.descendants_merged !== 'number'
    || !Number.isInteger(value.descendants_merged)
    || value.descendants_merged < 0) return null
  return {
    platform: value.platform,
    session_id: value.session_id,
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.updated_at === undefined ? {} : { updated_at: value.updated_at }),
    score: value.score,
    hit_count: value.hit_count,
    excerpt: value.excerpt,
    descendants_merged: value.descendants_merged,
  }
}

function decodeWarnings(value: unknown): Array<{ code: string; message: string }> | null {
  if (!Array.isArray(value)) return null
  const warnings: Array<{ code: string; message: string }> = []
  for (const warning of value) {
    if (!isRecord(warning)
      || typeof warning.code !== 'string'
      || warning.code.length === 0
      || typeof warning.message !== 'string') return null
    warnings.push({ code: warning.code, message: warning.message })
  }
  return warnings
}

export function decodeRelatedSessionSearch(value: unknown): RelatedSessionSearchResponse | null {
  if (!isRecord(value)
    || value.protocol !== 'tenon-related-session-memory/v1'
    || typeof value.query !== 'string'
    || Array.from(value.query).length < 2
    || Array.from(value.query).length > 128
    || !isPlatform(value.platform)
    || typeof value.partial !== 'boolean'
    || !Array.isArray(value.matches)
    || value.matches.length > 8) return null
  const warnings = decodeWarnings(value.warnings)
  if (warnings === null) return null
  const matches = value.matches.map(decodeMatch)
  if (matches.some((match) => match === null)) return null
  return {
    protocol: 'tenon-related-session-memory/v1',
    query: value.query,
    platform: value.platform,
    partial: value.partial,
    warnings,
    matches: matches.filter((match): match is RelatedSessionMatch => match !== null),
  }
}
