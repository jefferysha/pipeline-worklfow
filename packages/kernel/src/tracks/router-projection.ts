/**
 * Dynamic Track Registry -> router 的纯数据投影（T-R5）。
 *
 * 这里刻意不生成 shell 赋值：项目内 cache 是可写数据，若后续被 `source`/`eval`，再严密的
 * 生成期引用也挡不住落盘后篡改。`encodeRouterDataCache` 因此只输出固定字段与 UTF-8 hex；hook
 * 必须把它当数据逐行校验/解码。routing 只来自 effective registry，manifest 不承载
 * 路由规则，避免双真相源。
 */
import { sha256Hex } from '../sha256.js'
import type { ExtendedManifestData, SkillTable } from '../flow/manifest.js'
import { BUILTIN_TRACK_DEFINITIONS } from './builtins.js'
import type { TrackRegistry } from './types.js'

export type RouterSkillSource = 'profile' | '_all' | 'empty'

export interface RouterTrackProjection {
  readonly id: string
  readonly label: string
  /** Effective binding used when a new Change is created from this routed Track. */
  readonly workflowDefault: string
  /** effective registry declaration order；tie 的最后一维，不能压缩成 enabled 子集下标。 */
  readonly order: number
  /** Manual availability and content scoring are separate contracts. */
  readonly routable: boolean
  readonly priority: number
  readonly pattern?: string
  readonly excludePattern?: string
  readonly profile: string
  readonly matrix: boolean
  readonly builtin: boolean
}

export interface RouterSkillProjection {
  readonly phase: string
  readonly profile: string
  readonly mandatory: readonly string[]
  readonly recommended: readonly string[]
  readonly mandatorySource: RouterSkillSource
  readonly recommendedSource: RouterSkillSource
}

export interface RouterProjection {
  readonly tracks: readonly RouterTrackProjection[]
  readonly skills: readonly RouterSkillProjection[]
  readonly breadcrumbs: readonly { readonly phase: string; readonly prose: string }[]
}

/**
 * Router cache revision covers both project Track configuration and the effective built-in
 * projection. A plugin release can change a builtin without touching `.pipeline/tracks.yaml`;
 * hashing only the project registry revision would then leave a valid-looking stale cache.
 */
export function effectiveRouterRevision(
  registryRevision: string,
  projection: RouterProjection,
): string {
  return sha256Hex(JSON.stringify({ registryRevision, tracks: projection.tracks }))
}

/**
 * Release-owned router contract. Unlike the effective registry revision, this value excludes
 * project Track overrides, so the bash hot path can compare it without parsing project YAML or
 * spawning Node. A builtin Track, phase skill table, or breadcrumb change necessarily changes
 * this digest and invalidates an otherwise fresh project cache.
 */
export function routerContractRevision(manifest: ExtendedManifestData): string {
  const byId = new Map(BUILTIN_TRACK_DEFINITIONS.map((track) => [track.id, track]))
  const projection = buildRouterProjection({
    ordered: BUILTIN_TRACK_DEFINITIONS,
    byId,
    revision: 'builtin-contract',
    source: 'builtin-only',
  }, manifest)
  return sha256Hex(JSON.stringify(projection))
}

function own(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function skillsWithSource(
  table: SkillTable,
  phase: string,
  profile: string,
): { readonly values: readonly string[]; readonly source: RouterSkillSource } {
  const row = (table as Readonly<Record<string, Readonly<Record<string, readonly string[]>> | undefined>>)[phase]
  if (row === undefined) return { values: [], source: 'empty' }
  if (own(row, profile)) return { values: [...(row[profile] ?? [])], source: 'profile' }
  if (own(row, '_all')) return { values: [...(row._all ?? [])], source: '_all' }
  return { values: [], source: 'empty' }
}

/**
 * effective registry 的全部行保持原声明序。禁用 routing 的行仍可作为显式手选候选，但
 * 没有 pattern/priority，消费方绝不能把它送入 scorer。技能只按 track.skills.profile 求值：
 * profile -> `_all` -> []，绝不把动态 track id 猜成 manifest profile。
 */
export function buildRouterProjection(
  registry: TrackRegistry,
  manifest: ExtendedManifestData,
): RouterProjection {
  const tracks: RouterTrackProjection[] = []
  for (const [order, track] of registry.ordered.entries()) {
    const routing = track.policyProfile.routing
    tracks.push({
      id: track.id,
      label: track.label,
      workflowDefault: track.workflow.default,
      order,
      routable: routing.enabled,
      priority: routing.enabled ? routing.priority : 0,
      ...(routing.enabled ? { pattern: routing.pattern } : {}),
      ...(routing.enabled && routing.excludePattern !== undefined
        ? { excludePattern: routing.excludePattern }
        : {}),
      profile: track.policyProfile.skills.profile,
      matrix: track.policyProfile.skills.matrix,
      builtin: track.builtin,
    })
  }

  // 同 profile 的多个动态 track 共用一份 skill 解析结果；顺序取第一次出现在 enabled registry 的位置。
  const profiles = [...new Set(tracks.map((track) => track.profile))]
  const skills: RouterSkillProjection[] = []
  for (const phase of manifest.phases) {
    for (const profile of profiles) {
      const mandatory = skillsWithSource(manifest.mandatorySkills, phase, profile)
      const recommended = skillsWithSource(manifest.recommendedSkills, phase, profile)
      skills.push({
        phase,
        profile,
        mandatory: mandatory.values,
        recommended: recommended.values,
        mandatorySource: mandatory.source,
        recommendedSource: recommended.source,
      })
    }
  }

  const breadcrumbs = manifest.phases.flatMap((phase) => {
    const prose = manifest.breadcrumbs[phase]
    return prose === undefined ? [] : [{ phase, prose }]
  })
  return { tracks, skills, breadcrumbs }
}

export interface RouterDataCacheInput {
  readonly projectRoot: string
  readonly manifestSha256: string
  readonly tracksPresent: boolean
  readonly registryRevision: string
  readonly contractRevision: string
  readonly projection: RouterProjection
}

function hex(value: string): string {
  return Buffer.from(value, 'utf8').toString('hex')
}

function assertCacheMetadata(input: RouterDataCacheInput): void {
  if (input.projectRoot.length === 0 || input.projectRoot.includes('\0')) {
    throw new Error('router cache projectRoot 必须为非空且不含 NUL')
  }
  if (!/^[0-9a-f]{64}$/.test(input.manifestSha256)) {
    throw new Error('router cache manifestSha256 必须为 64 位小写 hex')
  }
  if (!/^[0-9a-f]{16,64}$/.test(input.registryRevision)) {
    throw new Error('router cache registryRevision 必须为 16..64 位小写 hex')
  }
  if (!/^[0-9a-f]{64}$/.test(input.contractRevision)) {
    throw new Error('router cache contractRevision 必须为 64 位小写 hex')
  }
}

function sourceCode(source: RouterSkillSource): 'P' | 'A' | 'E' {
  if (source === 'profile') return 'P'
  if (source === '_all') return 'A'
  return 'E'
}

/**
 * 固定 schema 的 data-only cache。所有自由字符串均为 UTF-8 hex；无 shell assignment、quote、
 * command substitution、`source` 语义。记录：M metadata、R routing、B breadcrumb、C cell source、
 * S skill token。调用方须以临时文件校验完整后原子 rename。
 */
export function encodeRouterDataCache(input: RouterDataCacheInput): string {
  assertCacheMetadata(input)
  const lines = [
    'PIPELINE_ROUTER_V5',
    `M|${hex(input.projectRoot)}|${input.manifestSha256}|${input.registryRevision}|${input.tracksPresent ? '1' : '0'}|${input.contractRevision}`,
  ]
  for (const track of input.projection.tracks) {
    lines.push([
      'R', String(track.order), String(track.priority), hex(track.id), track.routable ? '1' : '0',
      hex(track.pattern ?? ''),
      hex(track.excludePattern ?? ''),
      hex(track.profile), track.matrix ? '1' : '0', track.builtin ? '1' : '0', hex(track.label),
      hex(track.workflowDefault),
    ].join('|'))
  }
  for (const breadcrumb of input.projection.breadcrumbs) {
    lines.push(`B|${hex(breadcrumb.phase)}|${hex(breadcrumb.prose)}`)
  }
  for (const cell of input.projection.skills) {
    const phase = hex(cell.phase)
    const profile = hex(cell.profile)
    lines.push(`C|${phase}|${profile}|M|${sourceCode(cell.mandatorySource)}`)
    lines.push(`C|${phase}|${profile}|R|${sourceCode(cell.recommendedSource)}`)
    cell.mandatory.forEach((skill, index) => lines.push(`S|${phase}|${profile}|M|${index}|${hex(skill)}`))
    cell.recommended.forEach((skill, index) => lines.push(`S|${phase}|${profile}|R|${index}|${hex(skill)}`))
  }
  return `${lines.join('\n')}\n`
}
