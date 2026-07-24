/**
 * Track CRUD 纯配置变换 + 引用完整性策略（GOAL.md 清单 T · T-R3，codex D1/D2/D3 裁决）。
 *
 * 职责边界：本模块只做「ProjectTrackConfig → next ProjectTrackConfig」的纯变换 + builtin 可变面
 * 裁决 + 领域错误，**不做 I/O、不做完整校验、不做 CLI 输出**：
 * - 完整校验（id 词法/_all/上限 32/label/workflow 存在性/policy 闭集）由 mutateTrackRegistry
 *   落盘前的 validateTrackRegistry 统一守住——本模块只负责结构上「配置怎么变」与撞名/不存在/
 *   builtin 禁改这类**从 config 自身即可判定**的领域错误。
 * - 引用扫描是 I/O，故经 callback（ScanActiveChanges）注入：kernel 不依赖 CLI 的 change 路径
 *   枚举，只消费扫描结果并执行 fail-closed 策略（codex D2）。
 *
 * builtin 可变面（D1）：id/builtin/policyProfile immutable、delete 一律拒；label/workflow.default/
 * workflow.allowed 可改，且以「相对代码常量 BUILTIN_TRACK_DEFINITIONS 的差异覆盖层」存进
 * tracks.yaml.builtins——改回代码默认值即从 override 移除该字段，整节点空则移除节点（防冗余快照
 * 永久遮蔽未来默认值升级）。
 */
import { builtinTrack, isBuiltinTrackId, type BuiltinTrackId } from './builtins.js'
import type {
  CreateTrackSpec,
  ProjectBuiltinOverrideConfig,
  ProjectPolicyProfileConfig,
  ProjectRoutingConfig,
  ProjectTrackConfig,
  ProjectTrackEntryConfig,
  ProjectWorkflowConfig,
  TrackPolicyProfile,
  TrackWorkflowBinding,
  UpdateTrackPatch,
} from './types.js'

// ── 领域错误（CLI 统一映射 exit 1；引用类错误另附名单/失败原因）──────────────────

export class TrackNotFoundError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`track '${id}' 不存在（无法 update/delete 未注册的额外 track）`)
    this.name = 'TrackNotFoundError'
    this.id = id
  }
}

export class TrackAlreadyExistsError extends Error {
  readonly id: string
  readonly collidesWith: 'builtin' | 'custom'
  constructor(id: string, collidesWith: 'builtin' | 'custom') {
    super(
      collidesWith === 'builtin'
        ? `track '${id}' 与内建 Track 重名（内建轨改配置用 tracks update，不能 create）`
        : `track '${id}' 已存在（额外 track id 不能重复 create；改配置用 tracks update）`,
    )
    this.name = 'TrackAlreadyExistsError'
    this.id = id
    this.collidesWith = collidesWith
  }
}

export class BuiltinTrackDeleteError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`内建 track '${id}' 不可删除（内建 Track 恒存在、恒排最前）`)
    this.name = 'BuiltinTrackDeleteError'
    this.id = id
  }
}

export class BuiltinTrackPolicyError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`内建 track '${id}' 的 policyProfile 在 v1 锁死不可改（只能改 label/workflow.default/workflow.allowed）`)
    this.name = 'BuiltinTrackPolicyError'
    this.id = id
  }
}

export class TrackReferencedError extends Error {
  readonly id: string
  readonly references: readonly string[]
  constructor(id: string, references: readonly string[]) {
    super(`track '${id}' 仍被 ${references.length} 个活跃 change 引用，拒删：${references.join(', ')}`)
    this.name = 'TrackReferencedError'
    this.id = id
    this.references = references
  }
}

export class TrackReferencesInvalidatedError extends Error {
  readonly id: string
  readonly offending: readonly string[]
  constructor(id: string, offending: readonly string[]) {
    super(
      `更新 track '${id}' 会使 ${offending.length} 个活跃 change 的 {track,workflow} 组合失效，拒改：${offending.join(', ')}`,
    )
    this.name = 'TrackReferencesInvalidatedError'
    this.id = id
    this.offending = offending
  }
}

export class ChangeScanFailedError extends Error {
  readonly unreadable: readonly string[]
  constructor(unreadable: readonly string[]) {
    super(
      `无法读取/解析 ${unreadable.length} 个活跃 change，无法证明引用安全，fail-closed 拒绝操作：${unreadable.join(', ')}`,
    )
    this.name = 'ChangeScanFailedError'
    this.unreadable = unreadable
  }
}

// ── 强类型 → 文件形态 config 的转换（policyProfile 是结构体，落盘全字段声明）─────────

function bindingToConfig(w: TrackWorkflowBinding): ProjectWorkflowConfig {
  return { default: w.default, allowed: w.allowed }
}

function policyToConfig(p: TrackPolicyProfile): ProjectPolicyProfileConfig {
  const routing: ProjectRoutingConfig = p.routing.enabled
    ? {
        enabled: true,
        pattern: p.routing.pattern,
        ...(p.routing.excludePattern === undefined ? {} : { excludePattern: p.routing.excludePattern }),
        priority: p.routing.priority,
      }
    : { enabled: false }
  return {
    reviewSeed: p.reviewSeed,
    ...(p.autoEnqueueOnSpecComplete === undefined
      ? {}
      : { autoEnqueueOnSpecComplete: p.autoEnqueueOnSpecComplete }),
    automationEligible: p.automationEligible,
    coverageProfile: p.coverageProfile,
    routing,
    skills: { matrix: p.skills.matrix, profile: p.skills.profile },
  }
}

// ── 纯配置变换 ────────────────────────────────────────────────────────────────

/**
 * create 一个额外 track：撞内建/撞已有 custom → 领域错误；否则把完整声明追加到 tracks 尾部
 * （保留声明序）。id 词法/_all/上限 32/label/workflow 存在性/policy 闭集等由落盘前完整校验兜住。
 */
export function createTrack(config: ProjectTrackConfig, spec: CreateTrackSpec): ProjectTrackConfig {
  if (isBuiltinTrackId(spec.id)) throw new TrackAlreadyExistsError(spec.id, 'builtin')
  const tracks = config.tracks ?? []
  if (tracks.some((t) => t.id === spec.id)) throw new TrackAlreadyExistsError(spec.id, 'custom')
  const entry: ProjectTrackEntryConfig = {
    id: spec.id,
    label: spec.label,
    workflow: bindingToConfig(spec.workflow),
    policyProfile: policyToConfig(spec.policyProfile),
  }
  return { ...config, tracks: [...tracks, entry] }
}

/** delete：内建一律拒；未注册 custom → not-found；否则从 tracks 数组移除（保留其余声明序）。 */
export function deleteTrack(config: ProjectTrackConfig, id: string): ProjectTrackConfig {
  if (isBuiltinTrackId(id)) throw new BuiltinTrackDeleteError(id)
  const tracks = config.tracks ?? []
  const idx = tracks.findIndex((t) => t.id === id)
  if (idx < 0) throw new TrackNotFoundError(id)
  const next = tracks.filter((_, i) => i !== idx)
  return { ...config, tracks: next.length > 0 ? next : undefined }
}

/**
 * update 字段级 partial（未给的键保留）：内建走差异覆盖层（policyProfile 传入即拒）；custom 就地
 * 改 label/workflow.default/workflow.allowed/policyProfile。id 不可改（不在 patch）。完整 next
 * 的合法性（含缩小 allowed 后 default∈allowed）由落盘前完整校验守住；引用完整性另经 scan 校验。
 */
export function updateTrack(config: ProjectTrackConfig, id: string, patch: UpdateTrackPatch): ProjectTrackConfig {
  if (isBuiltinTrackId(id)) {
    if (patch.policyProfile !== undefined) throw new BuiltinTrackPolicyError(id)
    return applyBuiltinOverride(config, id, patch)
  }
  const tracks = config.tracks ?? []
  const idx = tracks.findIndex((t) => t.id === id)
  if (idx < 0) throw new TrackNotFoundError(id)
  const cur = tracks[idx]!
  const curWf = cur.workflow ?? {}
  const nextEntry: ProjectTrackEntryConfig = {
    id: cur.id,
    label: patch.label ?? cur.label,
    workflow: {
      default: patch.workflowDefault ?? curWf.default,
      allowed: patch.workflowAllowed ?? curWf.allowed,
    },
    policyProfile: patch.policyProfile !== undefined ? policyToConfig(patch.policyProfile) : cur.policyProfile,
  }
  const nextTracks = tracks.slice()
  nextTracks[idx] = nextEntry
  return { ...config, tracks: nextTracks }
}

/** allowed 相等（'*' 或数组逐元素）——判定「改回代码默认值」用。 */
function allowedEquals(a: '*' | readonly string[] | undefined, b: '*' | readonly string[]): boolean {
  if (a === undefined) return false
  if (a === '*' || b === '*') return a === b
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/**
 * builtin 差异覆盖层归一化（D1）：effective = patch > 现存 override > 代码默认；只把「与代码默认
 * 不同」的字段写进 override，改回默认即移除该字段，整节点空则移除节点。
 */
function applyBuiltinOverride(config: ProjectTrackConfig, id: BuiltinTrackId, patch: UpdateTrackPatch): ProjectTrackConfig {
  const base = builtinTrack(id)
  const overrides: Record<string, ProjectBuiltinOverrideConfig> = { ...(config.builtins ?? {}) }
  const cur = overrides[id] ?? {}
  const curWf = cur.workflow ?? {}
  const effLabel = patch.label ?? cur.label ?? base.label
  const effDefault = patch.workflowDefault ?? curWf.default ?? base.workflow.default
  const effAllowed = patch.workflowAllowed ?? curWf.allowed ?? base.workflow.allowed

  const nextOv: { label?: string; workflow?: ProjectWorkflowConfig } = {}
  if (effLabel !== base.label) nextOv.label = effLabel
  const wf: { default?: string; allowed?: '*' | readonly string[] } = {}
  if (effDefault !== base.workflow.default) wf.default = effDefault
  if (!allowedEquals(effAllowed, base.workflow.allowed)) wf.allowed = effAllowed
  if (wf.default !== undefined || wf.allowed !== undefined) nextOv.workflow = wf

  if (nextOv.label !== undefined || nextOv.workflow !== undefined) overrides[id] = nextOv
  else delete overrides[id]

  const builtins = Object.keys(overrides).length > 0 ? overrides : undefined
  return { ...config, builtins }
}

// ── 引用完整性策略（扫描经 callback 注入，fail-closed；codex D2）──────────────────

/** 活跃 change 的 {track,workflow} 引用快照。 */
export interface ActiveChangeRef {
  readonly name: string
  readonly track: string
  readonly workflow: string
}

/** 引用扫描结果：refs=可读 change 的引用；unreadable=读/解析失败的 change 名（fail-closed 用）。 */
export interface ChangeRefScan {
  readonly refs: readonly ActiveChangeRef[]
  readonly unreadable: readonly string[]
}

/** CLI 注入的活跃 change 扫描器（listChanges + store.read 逐个解析，读不了的进 unreadable）。 */
export type ScanActiveChanges = () => Promise<ChangeRefScan>

/**
 * delete 引用完整性：扫全部活跃 change，有 track===id 的引用 → 拒删并列名；任一 change 读不了/
 * 解析失败 → fail-closed 拒删（不能把「无法证明无引用」当「无引用」，codex D2）。
 */
export async function assertTrackDeletable(id: string, scan: ScanActiveChanges): Promise<void> {
  const { refs, unreadable } = await scan()
  if (unreadable.length > 0) throw new ChangeScanFailedError([...unreadable].sort())
  const referencing = refs.filter((r) => r.track === id).map((r) => r.name).sort()
  if (referencing.length > 0) throw new TrackReferencedError(id, referencing)
}

/** next config 下 track id 的 effective allowed（builtin 走覆盖层兜底代码默认；custom 读声明）。 */
function effectiveAllowedFor(config: ProjectTrackConfig, id: string): '*' | readonly string[] {
  if (isBuiltinTrackId(id)) {
    return config.builtins?.[id]?.workflow?.allowed ?? builtinTrack(id).workflow.allowed
  }
  const entry = (config.tracks ?? []).find((t) => t.id === id)
  return entry?.workflow?.allowed ?? '*'
}

/**
 * update 引用完整性：在 next registry 下验证每个引用该轨的活跃 change 的 {track,workflow} 仍合法
 * （缩小 allowed / 改 default 等场景），一个失效整个 update 拒；任一 change 读不了 → fail-closed。
 * allowed='*' 时无 change 会失效，直接放行。改 label（不动 workflow）时 allowed 不变，天然不阻断。
 */
export async function assertUpdatePreservesReferences(
  next: ProjectTrackConfig,
  id: string,
  scan: ScanActiveChanges,
): Promise<void> {
  const allowed = effectiveAllowedFor(next, id)
  const { refs, unreadable } = await scan()
  if (unreadable.length > 0) throw new ChangeScanFailedError([...unreadable].sort())
  if (allowed === '*') return
  const offending = refs
    .filter((r) => r.track === id && !allowed.includes(r.workflow))
    .map((r) => `${r.name}(workflow ${r.workflow})`)
    .sort()
  if (offending.length > 0) throw new TrackReferencesInvalidatedError(id, offending)
}
