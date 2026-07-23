/**
 * Dynamic Track Registry -> router 的纯数据投影（T-R5）。
 *
 * 这里刻意不生成 shell 赋值：项目内 cache 是可写数据，若后续被 `source`/`eval`，再严密的
 * 生成期引用也挡不住落盘后篡改。`encodeRouterDataCache` 因此只输出固定字段与 UTF-8 hex；hook
 * 必须把它当数据逐行校验/解码。routing 只来自 effective registry，manifest 不承载
 * 路由规则，避免双真相源。
 */
import type { ExtendedManifestData, SkillTable } from '../flow/manifest.js'
import type { TrackRegistry } from './types.js'

export type RouterSkillSource = 'profile' | '_all' | 'empty'

export interface RouterTrackProjection {
  readonly id: string
  readonly label: string
  /** effective registry declaration order；tie 的最后一维，不能压缩成 enabled 子集下标。 */
  readonly order: number
  readonly priority: number
  readonly pattern: string
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
 * effective registry 的 enabled routing 行保持原声明序。技能只按 track.skills.profile 求值：
 * profile -> `_all` -> []，绝不把动态 track id 猜成 manifest profile。
 */
export function buildRouterProjection(
  registry: TrackRegistry,
  manifest: ExtendedManifestData,
): RouterProjection {
  const tracks: RouterTrackProjection[] = []
  for (const [order, track] of registry.ordered.entries()) {
    const routing = track.policyProfile.routing
    if (!routing.enabled) continue
    tracks.push({
      id: track.id,
      label: track.label,
      order,
      priority: routing.priority,
      pattern: routing.pattern,
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
    'PIPELINE_ROUTER_V2',
    `M|${hex(input.projectRoot)}|${input.manifestSha256}|${input.registryRevision}|${input.tracksPresent ? '1' : '0'}`,
  ]
  for (const track of input.projection.tracks) {
    lines.push([
      'R', String(track.order), String(track.priority), hex(track.id), hex(track.pattern),
      hex(track.profile), track.matrix ? '1' : '0', track.builtin ? '1' : '0', hex(track.label),
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
