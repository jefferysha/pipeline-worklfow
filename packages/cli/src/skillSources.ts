/**
 * CLI adapter for the shared skill source registry contract.
 *
 * Parsing and field validation live in kernel so setup/doctor and Dashboard use one token -> source/id/tier
 * interpretation. This adapter only locates templates/skill-sources.yaml and chooses read failure semantics.
 */
import {
  parseSkillSources,
  SkillSourcesError,
  type SkillSourceDefinition,
  type SkillTier,
  type SkillTool,
} from '@tenon/kernel'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export { parseSkillSources, SkillSourcesError }
export type { SkillTier, SkillTool }
export type SkillSource = SkillSourceDefinition

function defaultRegistryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'skill-sources.yaml')
}

/** doctor/read-only consumers fail open so a damaged optional registry does not crash unrelated commands. */
export function readSkillSources(path?: string): SkillSource[] {
  try {
    return parseSkillSources(readFileSync(path ?? defaultRegistryPath(), 'utf8'))
  } catch {
    return []
  }
}

export type SkillSourcesResult =
  | { ok: true; sources: SkillSource[] }
  | { ok: false; error: string }

/** setup must distinguish an empty registry from an unreadable or malformed registry. */
export function loadSkillSources(path?: string): SkillSourcesResult {
  let text: string
  try {
    text = readFileSync(path ?? defaultRegistryPath(), 'utf8')
  } catch (e) {
    return { ok: false, error: `读取 registry 失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  try {
    return { ok: true, sources: parseSkillSources(text) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
