import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  parseSkillProvenanceRegistry,
  SKILL_PROVENANCE_ERROR_CATEGORIES,
  type SkillProvenanceErrorCategory,
  type SkillProvenanceRegistry,
  SkillProvenanceRegistryError,
} from '@tenon/kernel'
import { buildCanonicalManifest } from './snapshot-manifest.js'

export { SKILL_PROVENANCE_ERROR_CATEGORIES } from '@tenon/kernel'

export type SkillProvenanceFindingCategory =
  | SkillProvenanceErrorCategory
  | 'registry-read-error'
  | 'filesystem-safety-error'

export interface SkillProvenanceFinding {
  readonly category: SkillProvenanceFindingCategory
  readonly skill?: string
  readonly sourceRef?: string
  readonly expected?: string
  readonly actual?: string
  readonly detail: string
  readonly remediation: string
}

export interface SkillProvenanceVerificationResult {
  readonly ok: boolean
  readonly root: string
  readonly registry?: SkillProvenanceRegistry
  readonly findings: readonly SkillProvenanceFinding[]
}

export interface SkillProvenanceVerificationOptions {
  readonly registryPath?: string
  readonly skillsRoot?: string
}

const CATEGORY_ORDER = new Map<string, number>(SKILL_PROVENANCE_ERROR_CATEGORIES.map((category, index) => [category, index]))

function remediation(category: SkillProvenanceFindingCategory): string {
  switch (category) {
    case 'legacy-provenance-source': return '删除 skills-lock.json，并重新运行 npm run sync:skill-provenance'
    case 'content-hash-mismatch': return '运行 npm run sync:skill-provenance 更新 canonical content_hash 后再验证'
    case 'coordinate-mismatch': return '修复 coordinate，使其等于 tenon:<source_ref>@<content_hash>'
    case 'missing-distributed-skill': return '恢复缺失的 skills/<id> 目录，或运行 provenance sync 更新 registry'
    case 'unregistered-distributed-skill': return '删除未登记目录，或运行 provenance sync 登记 canonical Skill'
    case 'duplicate-distributed-source': return '保证每个 source_ref 只出现一次'
    case 'unknown-source-kind': return '使用受支持的 source_kind: bundled，并重新运行 provenance sync'
    case 'unsupported-registry-version': return '升级 registry 到 version: 3 与 hash_algorithm: tree-sha256-v1'
    case 'invalid-source-ref': return '将 source_ref 修复为安全规范的 skills/<id> 路径'
    case 'registry-read-error': return '恢复 templates/skill-sources.yaml 的可读性后重新验证'
    case 'filesystem-safety-error': return '修复 Skill 内容树的文件类型、权限或 symlink 后重新验证'
  }
}

function finding(
  category: SkillProvenanceFindingCategory,
  detail: string,
  values: Omit<SkillProvenanceFinding, 'category' | 'detail' | 'remediation'> = {},
): SkillProvenanceFinding {
  return { category, detail, remediation: remediation(category), ...values }
}

function sortFindings(findings: readonly SkillProvenanceFinding[]): SkillProvenanceFinding[] {
  return [...findings].sort((left, right) => {
    const category = (CATEGORY_ORDER.get(left.category) ?? 99) - (CATEGORY_ORDER.get(right.category) ?? 99)
    if (category !== 0) return category
    const skill = (left.skill ?? '').localeCompare(right.skill ?? '')
    if (skill !== 0) return skill
    return left.detail.localeCompare(right.detail)
  })
}

async function directDistributedSkills(skillsRoot: string): Promise<string[]> {
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

function pathWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

async function assertPhysicalSkillRoot(skillsRoot: string, realSkillsRoot: string, skillId: string): Promise<void> {
  const path = join(skillsRoot, skillId)
  const entry = await lstat(path)
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`skills/${skillId} 必须是 skillsRoot 内的普通目录，拒绝 symlink/非目录`)
  }
  const real = await realpath(path)
  if (!pathWithin(realSkillsRoot, real)) {
    throw new Error(`skills/${skillId} realpath 逃逸 skillsRoot: ${real}`)
  }
}

function physicalId(sourceRef: string): string {
  return sourceRef.slice('skills/'.length)
}

/**
 * Read-only verification of a plugin/release root. All content hashes are
 * delegated to buildCanonicalManifest; this module intentionally has no hash
 * implementation of its own.
 */
export async function verifySkillProvenance(
  pluginRoot: string,
  options: SkillProvenanceVerificationOptions = {},
): Promise<SkillProvenanceVerificationResult> {
  const root = resolve(pluginRoot)
  const registryPath = options.registryPath ?? join(root, 'templates', 'skill-sources.yaml')
  const skillsRoot = options.skillsRoot ?? join(root, 'skills')
  const findings: SkillProvenanceFinding[] = []

  try {
    await lstat(join(root, 'skills-lock.json'))
    findings.push(finding(
      'legacy-provenance-source',
      '检测到禁止重新引入的 legacy skills-lock.json',
      { actual: 'skills-lock.json' },
    ))
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) || String((error as { code?: unknown }).code) !== 'ENOENT') {
      findings.push(finding('filesystem-safety-error', `读取 legacy provenance source 失败: ${String(error)}`))
    }
  }

  let registryText: string
  try {
    registryText = await readFile(registryPath, 'utf8')
  } catch (error) {
    findings.push(finding('registry-read-error', `读取 canonical registry 失败: ${registryPath}（${String(error)}）`))
    return { ok: false, root, findings: sortFindings(findings) }
  }

  let registry: SkillProvenanceRegistry
  try {
    registry = parseSkillProvenanceRegistry(registryText)
  } catch (error) {
    const category = error instanceof SkillProvenanceRegistryError
      ? error.category
      : 'invalid-source-ref'
    findings.push(finding(category, error instanceof Error ? error.message : String(error)))
    return { ok: false, root, findings: sortFindings(findings) }
  }

  let physical: string[]
  let realSkillsRoot: string
  try {
    const skillsRootStat = await lstat(skillsRoot)
    if (skillsRootStat.isSymbolicLink() || !skillsRootStat.isDirectory()) {
      throw new Error(`bundled Skill 根必须是普通目录，拒绝 symlink/非目录: ${skillsRoot}`)
    }
    realSkillsRoot = await realpath(skillsRoot)
    physical = await directDistributedSkills(skillsRoot)
  } catch (error) {
    findings.push(finding('filesystem-safety-error', `读取 bundled Skill 根失败: ${skillsRoot}（${String(error)}）`))
    return { ok: false, root, registry, findings: sortFindings(findings) }
  }

  const declared = new Map(registry.skills.map((entry) => [physicalId(entry.sourceRef), entry]))
  const physicalSet = new Set(physical)
  const safePhysical = new Set<string>()
  for (const id of physical) {
    try {
      await assertPhysicalSkillRoot(skillsRoot, realSkillsRoot, id)
      safePhysical.add(id)
    } catch (error) {
      findings.push(finding(
        'filesystem-safety-error',
        `Skill '${id}' 顶层内容根无法安全读取: ${error instanceof Error ? error.message : String(error)}`,
        { skill: id, actual: `skills/${id}` },
      ))
    }
  }
  for (const entry of registry.skills) {
    const id = physicalId(entry.sourceRef)
    if (!physicalSet.has(id)) {
      findings.push(finding(
        'missing-distributed-skill',
        `registry 声明的 bundled Skill '${id}' 不存在`,
        { skill: id, sourceRef: entry.sourceRef },
      ))
    }
  }
  for (const id of physical) {
    if (!declared.has(id)) {
      findings.push(finding(
        'unregistered-distributed-skill',
        `physical bundled Skill '${id}' 未在 canonical registry 声明`,
        { skill: id, actual: `skills/${id}` },
      ))
    }
  }

  for (const entry of registry.skills) {
    const id = physicalId(entry.sourceRef)
    if (!physicalSet.has(id) || !safePhysical.has(id)) continue
    try {
      const manifest = await buildCanonicalManifest(id, join(skillsRoot, id))
      const actual = `sha256:${manifest.treeSha256}`
      if (actual !== entry.contentHash) {
        findings.push(finding(
          'content-hash-mismatch',
          `Skill '${id}' canonical tree digest 与 registry 不一致`,
          { skill: id, sourceRef: entry.sourceRef, expected: entry.contentHash, actual },
        ))
      }
      const expectedCoordinate = `tenon:${entry.sourceRef}@${entry.contentHash}`
      if (entry.coordinate !== expectedCoordinate) {
        findings.push(finding(
          'coordinate-mismatch',
          `Skill '${id}' coordinate 与 registry identity/hash 不一致`,
          { skill: id, sourceRef: entry.sourceRef, expected: expectedCoordinate, actual: entry.coordinate },
        ))
      }
    } catch (error) {
      findings.push(finding(
        'filesystem-safety-error',
        `Skill '${id}' 内容树无法安全读取: ${error instanceof Error ? error.message : String(error)}`,
        { skill: id, sourceRef: entry.sourceRef },
      ))
    }
  }

  const sorted = sortFindings(findings)
  return { ok: sorted.length === 0, root, registry, findings: sorted }
}

/** Naming aliases kept intentionally small for callers that describe this as a verifier. */
export const verifyCanonicalSkillProvenance = verifySkillProvenance
export const verifySkillSources = verifySkillProvenance
