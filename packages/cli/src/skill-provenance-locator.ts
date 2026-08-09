import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createFsSkillContentLocator,
  SkillContentNotFoundError,
  type SkillContentLocator,
} from '@tenon/automation'
import {
  parseSkillProvenanceRegistry,
  parseSkillSources,
  SkillProvenanceRegistryError,
  type SkillProvenanceRegistry,
} from '@tenon/kernel'
import { buildCanonicalManifest } from '@tenon/automation'

export class SkillProvenanceLocatorError extends Error {
  override readonly name = 'SkillProvenanceLocatorError'
  readonly _tag = 'SkillProvenanceLocatorError'
  constructor(
    readonly category: string,
    message: string,
  ) {
    super(`[${category}] ${message}`)
  }
}

function errnoCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : 'unknown'
}

function candidateExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return false
    throw new SkillProvenanceLocatorError('filesystem-safety-error', `读取 bundled candidate 失败: ${path}（${String(error)}）`)
  }
}

function bundledRootHasEntries(root: string): boolean {
  try {
    return readdirSync(root).length > 0
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return false
    throw new SkillProvenanceLocatorError('filesystem-safety-error', `读取 bundled Skill 根失败: ${root}（${String(error)}）`)
  }
}

/** Generic alias projection retained for explicitly legacy/runner compatibility paths. */
export function loadSkillAliases(pluginRoot: string | undefined): ReadonlyMap<string, string> {
  if (pluginRoot === undefined) return new Map()
  const path = join(pluginRoot, 'templates', 'skill-sources.yaml')
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return new Map()
    throw new SkillProvenanceLocatorError('registry-read-error', `读取 skill source registry 失败: ${path}（${String(error)}）`)
  }
  const aliases = new Map<string, string>()
  for (const row of parseSkillSources(text)) {
    const physical = row.contentSkill
      ?? ((row.tool === 'skills-cli' || row.tool === 'claude-plugin') ? row.skill : undefined)
    if (!row.token.includes(':') && physical !== undefined && physical !== row.token) aliases.set(row.token, physical)
  }
  return aliases
}

function withLogicalSkillAliases(locator: SkillContentLocator, aliases: ReadonlyMap<string, string>): SkillContentLocator {
  if (aliases.size === 0) return locator
  return {
    async locate(skillId) {
      const physicalId = aliases.get(skillId) ?? skillId
      const located = await locator.locate(physicalId)
      return physicalId === skillId ? located : { skillId, contentDir: located.contentDir }
    },
  }
}

function physicalId(sourceRef: string): string {
  return sourceRef.slice('skills/'.length)
}

/**
 * Bundled-only locator that binds every returned tree to the strict v3 registry.
 * It deliberately returns SkillContentNotFoundError only when no bundled path exists;
 * an existing undeclared/drifted path is a higher-tier provenance failure.
 */
export function createProvenanceAwareBundledLocator(pluginRoot: string): SkillContentLocator {
  const bundledRoot = join(pluginRoot, 'skills')
  const base = createFsSkillContentLocator([bundledRoot])
  let registry: SkillProvenanceRegistry | undefined
  let registryError: SkillProvenanceLocatorError | undefined
  let loaded = false
  const load = (): SkillProvenanceRegistry | undefined => {
    if (loaded) {
      if (registryError) throw registryError
      return registry
    }
    loaded = true
    try {
      const raw = readFileSync(join(pluginRoot, 'templates', 'skill-sources.yaml'), 'utf8')
      registry = parseSkillProvenanceRegistry(raw)
      return registry
    } catch (error) {
      const category = error instanceof SkillProvenanceRegistryError ? error.category : 'registry-read-error'
      registryError = new SkillProvenanceLocatorError(
        category,
        error instanceof Error ? error.message : String(error),
      )
      throw registryError
    }
  }

  return {
    async locate(skillId) {
      const directPath = join(bundledRoot, skillId)
      let exists = false
      try {
        exists = candidateExists(directPath)
      } catch (error) {
        throw error
      }
      // A plugin root with no bundled entries has no higher-tier candidate to prove; preserve
      // external tier NotFound semantics even when an old/custom fixture omits the registry.
      if (!exists && !bundledRootHasEntries(bundledRoot)) {
        throw new SkillContentNotFoundError(`bundled Skill '${skillId}' 不存在`)
      }
      let current = load()
      if (current === undefined) {
        if (!exists) throw new SkillContentNotFoundError(`bundled Skill '${skillId}' 不存在`)
        throw registryError ?? new SkillProvenanceLocatorError('registry-read-error', 'canonical registry 未加载')
      }
      const byToken = new Map(current.skills.map((entry) => [entry.token, entry]))
      const byPhysical = new Map(current.skills.map((entry) => [physicalId(entry.sourceRef), entry]))
      const entry = byToken.get(skillId) ?? byPhysical.get(skillId)
      if (entry === undefined) {
        if (!exists) throw new SkillContentNotFoundError(`bundled Skill '${skillId}' 未登记且不存在`)
        throw new SkillProvenanceLocatorError(
          'unregistered-distributed-skill',
          `bundled Skill '${skillId}' 存在但未在 canonical registry 声明`,
        )
      }
      const physical = physicalId(entry.sourceRef)
      const physicalPath = join(bundledRoot, physical)
      if (!candidateExists(physicalPath)) {
        throw new SkillProvenanceLocatorError(
          'missing-distributed-skill',
          `registry 声明的 bundled Skill '${physical}' 不存在`,
        )
      }
      const located = await base.locate(physical)
      const manifest = await buildCanonicalManifest(physical, located.contentDir)
      const actual = `sha256:${manifest.treeSha256}`
      if (actual !== entry.contentHash) {
        throw new SkillProvenanceLocatorError(
          'content-hash-mismatch',
          `bundled Skill '${physical}' hash drift: expected ${entry.contentHash}, actual ${actual}`,
        )
      }
      return { skillId, contentDir: located.contentDir }
    },
  }
}
