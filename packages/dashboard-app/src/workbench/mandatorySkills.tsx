import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp, Layers3, LockKeyhole } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  deleteTrackDefinition,
  fetchConfig,
  fetchSkillsRegistry,
  patchTrackDefinition,
  postMandatorySkills,
  postRouterPreview,
  postTrackDefinition,
  type WbConfigSnapshot,
  type WbSkillEntry,
  type WbTrackDefinition,
  type WbRouterPreview,
} from '../api/client'
import { useT } from '../i18n'
import { resolvedSkillId, skillPresentation } from './skillPresentation'

/**
 * mandatorySkills（P1 任务 B，契约 scratchpad/p1-contract.md §3）—— default workflow 的
 * 「阶段 × 轨道」manifest 强制技能矩阵接入编排画布：数据面（共享 config 缓存 + hook）
 * 与画布内的展示/编辑面（LaneMandatorySkills / TrackSelector）。
 * 设计定稿 design-demos/v11b-prod-lanes.html 的 default 泳道技能区（.tracktabs / .setchips）。
 *
 * ── 这份缓存为什么在本模块、为什么是模块级的 ──
 * `loadMandatoryConfig` / `cfgCache` / `cfgInflight` 原是 SkillChain.tsx 的模块私有物，B1 搬来
 * 本模块共享。当时的理由是 SkillChain 与画布技能区同屏共存、读写同一份 manifest 矩阵，两份
 * 缓存会让「用户在画布上改完、sheet 里的 SkillChain 还显示旧集合」。P4 五页签退役后 SkillChain
 * 已无生产挂载点（见 WorkbenchView 该处注释），同屏分叉的场景不再发生；缓存仍是模块级的理由
 * 换成了下方 cfgCache 处那条——它要跨 remount 存活。SkillChain 侧仍从本模块 import 这些符号
 * （`invalidateMandatoryConfig` 经 SkillChain 原样 re-export，既有测试的 import 面不变）。
 *
 * ── 诚实门（契约 §0.6，本模块最要紧的一条）──
 * 只在**真写得进去**的格子上给 ×/+：
 *   · `capable === false`（/api/config 不可达/非 2xx/缺 effective tracks）→ 明确不可用，
 *     不回落手抄轨道或静态技能表——它们可能与项目 registry 漂移。
 *   · `skills.matrix === false` → 仍进入 Track 设置，但不进入矩阵 selector。
 *   · `skills.profile !== track.id` → 整列展示继承 profile 的真值，但只读。
 *   · `_all` 通配集回退 → 只读（不给入口）。server 逐 profile 返回显式写能力，
 *     **写不到 `_all`**：在展示 `_all` 值的格子上给 ×，用户以为在改 `_all`，实际是给该 track
 *     悄悄建了一条覆盖键。「点了 × 却没改你看到的那个集合」正是诚实门要挡的（契约 §3-B3）。
 *     前端不靠 track id 猜写端能力；能力缺失时同样只读。
 *   · `archive` → 双侧拒写（前端既有 SkillChain 先例 + server config.ts）→ 不给入口。
 *
 * ── 展示顺序与运行顺序分离（契约 §3-B3）──
 * manifest 的 mandatory_skills 是**扁平 token 列表**，没有 order / depends_on 字段。界面仍按
 * 清单位置给出稳定编号，方便用户浏览和讨论；编号只代表展示次序，不冒充运行依赖。真正的串行、
 * 并行与依赖关系只在复制成自定义 workflow 后配置，提示文案与 hover 必须持续说明这一区别。
 */

/** T-R5 后 track id 来自项目 effective registry，不再是前端闭集。 */
export type MatrixTrack = string

// ══════════════════════════════════════════════════════════════════════════
// B1：共享 config 探测缓存（自 SkillChain.tsx:156-191 逐字搬迁，行为零改动）
// ══════════════════════════════════════════════════════════════════════════

// ── default 模式：manifest 强制技能矩阵的模块级探测缓存 ──
// StepEditor 按 (workflow, step) 复合 key 挂载，切阶段即重挂——探测结果放模块级，
// 避免每次切阶段都重打一发 GET /api/config（旧设置视图 的 fetchedConfigRef 等价物，
// 但要跨 remount 存活）。保存成功后同步写缓存，重挂读到的就是新值。
export interface MandatoryConfig {
  capable: boolean
  table: Record<string, string[]>
  tracks: WbTrackDefinition[]
  writableProfiles: string[]
  revision: string
  source: 'builtin-only' | 'project-file'
  generatedAt: string
  error: string | null
}

const cfgCache = new Map<string, MandatoryConfig>()
const cfgInflight = new Map<string, Promise<MandatoryConfig>>()

function cacheKey(root: string): string {
  return root
}

function unavailableConfig(error: string): MandatoryConfig {
  return {
    capable: false,
    table: {},
    tracks: [],
    writableProfiles: [],
    revision: '',
    source: 'builtin-only',
    generatedAt: '',
    error,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const TRACK_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/
const MATRIX_KEY_RE = /^[a-z][a-z0-9_-]{0,63}\.(?:_all|[a-z][a-z0-9_-]{0,31})$/
// 与 server/config.ts 的写边界同构；其后再叠加 kernel 对 a|b / namespace 段的语义校验。
const SKILL_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,127}$/
const MAX_SKILLS = 50

/** HTTP 边界严格验证：任一 track 畸形就拒整份快照，避免“半张 registry”制造错误可写列。 */
function parseTracks(value: unknown): WbTrackDefinition[] | null {
  if (!Array.isArray(value)) return null
  const parsed: WbTrackDefinition[] = []
  const ids = new Set<string>()
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !TRACK_ID_RE.test(item.id) || ids.has(item.id)) return null
    if (typeof item.label !== 'string' || item.label.trim() === '' || typeof item.builtin !== 'boolean') return null
    if (!isRecord(item.workflow) || typeof item.workflow.default !== 'string' || item.workflow.default === '') return null
    const allowed = item.workflow.allowed
    if (
      allowed !== '*' && (
        !Array.isArray(allowed) ||
        allowed.length === 0 ||
        !allowed.every((v) => typeof v === 'string' && v !== '') ||
        new Set(allowed).size !== allowed.length ||
        !allowed.includes(item.workflow.default)
      )
    ) return null
    if (!isRecord(item.policyProfile) || !isRecord(item.policyProfile.skills)) return null
    const profile = item.policyProfile.skills.profile
    const matrix = item.policyProfile.skills.matrix
    if (typeof profile !== 'string' || (profile !== '_all' && !TRACK_ID_RE.test(profile)) || typeof matrix !== 'boolean') return null
    const routing = item.policyProfile.routing
    if (!isRecord(routing) || typeof routing.enabled !== 'boolean') return null
    if (!routing.enabled && (
      routing.pattern !== undefined || routing.excludePattern !== undefined || routing.priority !== undefined
    )) return null
    if (routing.enabled) {
      if (
        typeof routing.pattern !== 'string' || routing.pattern === '' ||
        (routing.excludePattern !== undefined && (
          typeof routing.excludePattern !== 'string' || routing.excludePattern === ''
        )) ||
        typeof routing.priority !== 'number' || !Number.isSafeInteger(routing.priority) ||
        routing.priority < 0 || Object.is(routing.priority, -0)
      ) return null
      try {
        void new RegExp(routing.pattern)
        if (routing.excludePattern !== undefined) void new RegExp(routing.excludePattern)
      } catch {
        return null
      }
    }
    if (
      (item.policyProfile.reviewSeed !== 'pending' && item.policyProfile.reviewSeed !== 'skipped') ||
      (item.policyProfile.autoEnqueueOnSpecComplete !== undefined && typeof item.policyProfile.autoEnqueueOnSpecComplete !== 'boolean') ||
      typeof item.policyProfile.automationEligible !== 'boolean' ||
      !['none', 'pm', 'frontend', 'backend'].includes(String(item.policyProfile.coverageProfile))
    ) return null

    ids.add(item.id)
    parsed.push({
      id: item.id,
      label: item.label,
      builtin: item.builtin,
      workflow: { default: item.workflow.default, allowed: allowed === '*' ? '*' : [...allowed] as string[] },
      policyProfile: {
        reviewSeed: item.policyProfile.reviewSeed,
        ...(item.policyProfile.autoEnqueueOnSpecComplete === undefined
          ? {}
          : { autoEnqueueOnSpecComplete: item.policyProfile.autoEnqueueOnSpecComplete }),
        automationEligible: item.policyProfile.automationEligible,
        coverageProfile: item.policyProfile.coverageProfile as WbTrackDefinition['policyProfile']['coverageProfile'],
        routing: routing.enabled
          ? {
              enabled: true,
              pattern: routing.pattern as string,
              ...(routing.excludePattern === undefined
                ? {}
                : { excludePattern: routing.excludePattern as string }),
              priority: routing.priority as number,
            }
          : { enabled: false },
        skills: { matrix, profile },
      },
    })
  }
  return parsed
}

function isSkillToken(value: string): boolean {
  if (!SKILL_TOKEN_RE.test(value)) return false
  const alternatives = value.split('|')
  if (alternatives.some((branch) => branch === '')) return false
  if (new Set(alternatives).size !== alternatives.length) return false
  return alternatives.every((branch) => branch.split(':').every((segment) => segment !== '' && segment !== '.'))
}

/** GET/POST 两侧共用的 mandatory skill 数组边界校验。 */
export function isValidMandatorySkillList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_SKILLS
    && value.every((skill) => typeof skill === 'string' && isSkillToken(skill))
    && new Set(value).size === value.length
}

function parseMandatoryTable(value: unknown): Record<string, string[]> | null {
  if (!isRecord(value)) return null
  const table: Record<string, string[]> = {}
  for (const [key, skills] of Object.entries(value)) {
    if (!MATRIX_KEY_RE.test(key)) return null
    if (!isValidMandatorySkillList(skills)) return null
    table[key] = [...skills]
  }
  return table
}

interface ParsedConfigSnapshot {
  table: Record<string, string[]>
  tracks: WbTrackDefinition[]
  writableProfiles: string[]
  revision: string
  source: 'builtin-only' | 'project-file'
  generatedAt: string
}

/** `/api/config` 是能力边界：整包 canonical 后才开放 UI，不能从半合法信封拼出可写状态。 */
function parseConfigSnapshot(value: unknown): ParsedConfigSnapshot | null {
  if (!isRecord(value) || value.ok !== true) return null
  if (
    typeof value.generated_at !== 'string' || Number.isNaN(Date.parse(value.generated_at)) ||
    typeof value.revision !== 'string' || value.revision.trim() === '' ||
    (value.source !== 'builtin-only' && value.source !== 'project-file')
  ) return null
  const table = parseMandatoryTable(value.mandatory_skills)
  const tracks = parseTracks(value.tracks)
  if (table === null || tracks === null || !Array.isArray(value.mandatory_skills_writable_profiles)) return null

  const writableProfiles = value.mandatory_skills_writable_profiles
  if (
    !writableProfiles.every((profile) => typeof profile === 'string' && TRACK_ID_RE.test(profile)) ||
    new Set(writableProfiles).size !== writableProfiles.length ||
    writableProfiles.some((profile) => !tracks.some((track) =>
      track.id === profile && track.policyProfile.skills.matrix && track.policyProfile.skills.profile === profile,
    ))
  ) return null

  return {
    table,
    tracks,
    writableProfiles: [...writableProfiles],
    revision: value.revision,
    source: value.source,
    generatedAt: value.generated_at,
  }
}

/** 测试钩子 + 未来手动刷新入口：清空 config 探测缓存（同 invalidateWorkflowRules 的命名惯例）。 */
export function invalidateMandatoryConfig(): void {
  cfgCache.clear()
  cfgInflight.clear()
}

/**
 * 缓存读窗（搬迁适配位，非新行为）：原 SkillChain 在同一模块内直接读 `cfgCache` 作
 * useState 初值；跨模块后 import 绑定只读，故以取值函数暴露。语义逐字等价。
 */
export function peekMandatoryConfig(root: string): MandatoryConfig | null {
  if (root.trim() === '') return null
  return cfgCache.get(cacheKey(root)) ?? null
}

/**
 * 缓存写窗（搬迁适配位，非新行为）：原 SkillChain 保存成功后直接 `cfgCache = next`
 * 推进模块缓存；跨模块后同理改为函数。**只在写回成功后调用**——这条路径不是乐观更新。
 */
export function primeMandatoryConfig(next: MandatoryConfig, root: string): void {
  if (root.trim() === '') return
  cfgCache.set(cacheKey(root), next)
}

export function loadMandatoryConfig(root: string): Promise<MandatoryConfig> {
  if (root.trim() === '') return Promise.resolve(unavailableConfig('项目 root 缺失'))
  const key = cacheKey(root)
  const cached = cfgCache.get(key)
  if (cached) return Promise.resolve(cached)
  const running = cfgInflight.get(key)
  if (running) return running
  const request = fetchConfig(root)
    .then(async (res) => {
      // r.ok 检查必须在 r.json() 之前（SkillTransferModal 同一条既有教训：server 错误
      // 也是 JSON 信封，非 2xx 时 json() 照样 resolve，不先查 ok 就探测不到「不可写」）。
      if (!res.ok) return unavailableConfig(`HTTP ${res.status}`)
      const body = (await res.json()) as unknown as WbConfigSnapshot
      const parsed = parseConfigSnapshot(body)
      if (parsed === null) return unavailableConfig('config/effective tracks 快照缺失或畸形')
      return {
        capable: true,
        table: parsed.table,
        tracks: parsed.tracks,
        writableProfiles: parsed.writableProfiles,
        revision: parsed.revision,
        source: parsed.source,
        generatedAt: parsed.generatedAt,
        error: null,
      }
    })
    .catch((error): MandatoryConfig => unavailableConfig(error instanceof Error ? error.message : String(error)))
    .then((r) => {
      cfgCache.set(key, r)
      cfgInflight.delete(key)
      return r
    })
  cfgInflight.set(key, request)
  return request
}

/** POST /api/config/mandatory-skills 的成功响应体形状（自 旧设置视图 迁移）。 */
interface MandatorySkillsPostResponse {
  ok?: boolean
  error?: string
  skills?: string[]
}

// ══════════════════════════════════════════════════════════════════════════
// B2：useMandatorySkills —— 矩阵状态（宿主 WorkbenchView 持有，7 列共用一份）
// ══════════════════════════════════════════════════════════════════════════

export interface MandatoryState {
  root: string
  revision: string
  /** null = 加载中。 */
  table: Record<string, string[]> | null
  /** false = /api/config/effective registry 不可用；不退回静态轨道。 */
  capable: boolean
  tracks: readonly WbTrackDefinition[]
  matrixTracks: readonly WbTrackDefinition[]
  /** Server 显式授予的 profile 写能力；空数组即全只读，前端不猜固定三轨。 */
  writableProfiles: readonly string[]
  configError: string | null
  track: MatrixTrack | null
  setTrack: (t: MatrixTrack) => void
  /** 在途写回的 `phase.track` 键（照 SkillChain savingKeyRef 先例）；同键在途时该列控件禁用。 */
  savingKey: string | null
  saveError: string | null
  /**
   * 出错那次写回的 `phase.track` 键（契约 §3-B2 之外的附加项，故为可选）。
   * 理由：saveError 是矩阵级单值，7 列共用一份 state——不标记归属的话，build 列存失败会让
   * 7 列同时挂同一条红字。缺省（undefined）时 LaneMandatorySkills 退回「哪列都显示」的
   * 保守行为，手搓 MandatoryState 的调用点不必提供本字段。
   */
  saveErrorKey?: string | null
  /** 写回 POST /api/config/mandatory-skills（等响应、非乐观；失败只报错不回滚）。 */
  setSkills: (phase: string, skills: string[]) => void
  /** 候选池（GET /api/skills/registry）；null = 未就绪 → 添加入口禁用。 */
  registry: WbSkillEntry[] | null
  /** Track mutation 成功后的 authoritative config 重拉。 */
  reloadConfig: () => Promise<void>
}

export interface MandatoryCellView {
  key: string
  skills: string[]
  source: 'explicit' | 'profile-inherited' | 'all-inherited' | 'missing'
  profile: string
  editable: boolean
}

/** track policy profile → manifest key 的唯一前端投影；selector、lane 与 legacy SkillChain 共用。 */
export function resolveMandatoryCell(
  table: Record<string, string[]>,
  track: WbTrackDefinition,
  phase: string,
  writableProfiles: readonly string[],
): MandatoryCellView {
  const profile = track.policyProfile.skills.profile
  const profileKey = `${phase}.${profile}`
  const explicit = table[profileKey]
  if (explicit !== undefined) {
    return {
      key: profileKey,
      skills: explicit,
      source: profile === track.id ? 'explicit' : 'profile-inherited',
      profile,
      editable: profile === track.id && writableProfiles.includes(profile),
    }
  }
  const allKey = `${phase}._all`
  const all = table[allKey]
  if (all !== undefined) {
    return { key: allKey, skills: all, source: 'all-inherited', profile: '_all', editable: false }
  }
  return { key: profileKey, skills: [], source: 'missing', profile, editable: false }
}

export function useMandatorySkills(root: string): MandatoryState {
  const { t } = useT()
  const [requestedTrack, setRequestedTrack] = useState<MatrixTrack | null>(null)
  const [cfg, setCfg] = useState<MandatoryConfig | null>(() => peekMandatoryConfig(root))
  const [registry, setRegistry] = useState<WbSkillEntry[] | null>(null)
  const [regFailed, setRegFailed] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  // 保存操作同时绑定发起时的 root 与 cell。只记 cell 会让 root A 的晚到响应覆盖已经切到
  // root B 的同名格子；token 则避免旧操作的 finally 清掉较新的在途状态。
  const rootRef = useRef(root)
  rootRef.current = root
  const savingOpRef = useRef<{ token: symbol; root: string; cellKey: string } | null>(null)

  // config 探测（cancelled 守卫同 SkillChain：卸载后回来的响应不再 setState）。
  useEffect(() => {
    let cancelled = false
    const cached = peekMandatoryConfig(root)
    setCfg(cached)
    setSaveError(null)
    setSaveErrorKey(null)
    const active = savingOpRef.current
    setSavingKey(active?.root === root ? active.cellKey : null)
    if (cached !== null) return
    void loadMandatoryConfig(root).then((r) => {
      if (!cancelled) setCfg(r)
    })
    return () => {
      cancelled = true
    }
  }, [root])

  // registry 挂载即拉（同 SkillChain v6 T10 纪律）：chips 的「未装」徽章与添加候选都需要
  // installed 信息。fail-soft：失败即 regFailed，registry 恒为 null → 添加入口禁用
  // （不可判就不给写入口，保守，不谎报）；regFailed 同时兼作「已试过」守卫，不重试打转。
  useEffect(() => {
    if (registry !== null || regFailed) return
    let cancelled = false
    fetchSkillsRegistry()
      .then(async (r) => {
        if (!r.ok) throw new Error(`(${r.status})`)
        return r.json() as Promise<{ skills: WbSkillEntry[] }>
      })
      .then((body) => {
        if (!cancelled) setRegistry(body.skills)
      })
      .catch(() => {
        if (!cancelled) setRegFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [registry, regFailed])

  // ⚠️ 这条路径不是乐观更新（别照 HookTimeline 的 useHooksConfig，那是另一套乐观+回滚范式）。
  // 逐字沿用 SkillChain.tsx:361-399 的既有语义：
  //   · 等响应，res.ok 后才 setCfg —— 故无需回滚（失败时 cfg/cfgCache 从未被动过，只 setSaveError）；
  //   · 成功后不重新 GET，就地 merge 并同步推进模块级 cfgCache（sheet 里的 SkillChain 重挂即读到新值）；
  //   · res.ok 必须在 res.json() 之前（server 错误也是 JSON 信封，既有教训）。
  const tracks = cfg?.tracks ?? []
  const matrixTracks = tracks.filter((track) => track.policyProfile.skills.matrix)
  const selectedTrack = matrixTracks.find((track) => track.id === requestedTrack) ?? matrixTracks[0] ?? null
  const track = selectedTrack?.id ?? null

  async function saveMandatory(phase: string, skills: string[], selected: WbTrackDefinition): Promise<void> {
    const cellKey = `${phase}.${selected.id}`
    const requestRoot = root
    const requestCfg = cfg
    const op = { token: Symbol(cellKey), root: requestRoot, cellKey }
    savingOpRef.current = op
    setSavingKey(cellKey)
    setSaveError(null)
    setSaveErrorKey(null)
    try {
      const res = await postMandatorySkills({ phase, track: selected.id, skills, root: requestRoot })
      let body: MandatorySkillsPostResponse = {}
      try {
        body = (await res.json()) as MandatorySkillsPostResponse
      } catch {
        /* 无 JSON 体：走下方通用错误文案 */
      }
      if (!res.ok || body.ok !== true) {
        throw new Error(body.error || t('workbench.mand_save_failed', { status: res.status }))
      }
      if (body.skills !== undefined && !isValidMandatorySkillList(body.skills)) {
        throw new Error(t('workbench.mand_save_invalid'))
      }
      const saved = body.skills ?? skills
      const base = peekMandatoryConfig(requestRoot) ?? requestCfg
      if (base !== null) {
        const next: MandatoryConfig = { ...base, table: { ...base.table, [cellKey]: saved } }
        primeMandatoryConfig(next, requestRoot)
        if (rootRef.current === requestRoot) setCfg(next)
      }
    } catch (e) {
      if (rootRef.current === requestRoot) {
        setSaveError(e instanceof Error ? e.message : String(e))
        setSaveErrorKey(cellKey)
      }
    } finally {
      if (savingOpRef.current?.token === op.token) {
        savingOpRef.current = null
        if (rootRef.current === requestRoot) setSavingKey(null)
      }
    }
  }

  function setSkills(phase: string, skills: string[]): void {
    if (cfg === null || selectedTrack === null || phase === 'archive') return
    const cell = resolveMandatoryCell(cfg.table, selectedTrack, phase, cfg.writableProfiles)
    if (!cfg.capable || !cell.editable || cell.source !== 'explicit') return
    const active = savingOpRef.current
    if (active?.root === root && active.cellKey === `${phase}.${selectedTrack.id}`) return
    void saveMandatory(phase, skills, selectedTrack)
  }

  async function reloadConfig(): Promise<void> {
    const requestRoot = root
    cfgCache.delete(cacheKey(requestRoot))
    cfgInflight.delete(cacheKey(requestRoot))
    setCfg(null)
    const next = await loadMandatoryConfig(requestRoot)
    if (rootRef.current === requestRoot) setCfg(next)
  }

  return {
    root,
    revision: cfg?.revision ?? '',
    table: cfg?.table ?? null,
    // 加载中（cfg===null）时按不可写算——写入口在 table===null 分支下根本不渲染，此值不被读到。
    capable: cfg?.capable ?? false,
    tracks,
    matrixTracks,
    writableProfiles: cfg?.writableProfiles ?? [],
    configError: cfg?.error ?? null,
    track,
    setTrack: (next) => {
      if (matrixTracks.some((candidate) => candidate.id === next)) setRequestedTrack(next)
    },
    savingKey,
    saveError,
    saveErrorKey,
    setSkills,
    registry,
    reloadConfig,
  }
}

// ══════════════════════════════════════════════════════════════════════════
// B3：LaneMandatorySkills —— 画布 default 泳道的技能区
// ══════════════════════════════════════════════════════════════════════════

// ── 原子类合集（定稿 .setchips/.tracktabs/.minibadge 等值搬运；颜色全走 token，
//    字号守契约 §0.2 下限：徽章 ≥11.5px、说明 12.5px、chip 13px 同 P0 产出 chip）──
const ZONE_TITLE = 'text-[13px] font-[750] whitespace-nowrap text-text-2'
const NOTE_CLS = 'text-[12.5px] leading-[1.55] text-text-3'
/** 定稿 .setchips .sc：紫 chip，名字 nowrap 且无 overflow-hidden——列宽（max-content）负责放得下。 */
const CHIP_CLS =
  'inline-flex items-center gap-1.5 rounded-lg border border-purple-b bg-purple-t px-2.5 py-[5px] font-mono text-[13px] font-semibold whitespace-nowrap text-purple-d data-uninstalled:opacity-62'
/** 定稿 .setchips .add：虚线添加钮。 */
const ADD_CLS =
  'cursor-pointer rounded-lg border-[1.5px] border-dashed border-border-2 bg-transparent px-[11px] py-[5px] text-[12.5px] font-bold whitespace-nowrap text-text-3 transition-colors enabled:hover:border-purple-b enabled:hover:text-purple-d disabled:cursor-not-allowed disabled:opacity-50'
/** 未装徽章（同 SkillChain/SkillTransferModal 既有琥珀小徽章：红绿 color-mix 派生，决议 #9）。 */
const UNINST_CLS =
  'ml-1 flex-none whitespace-nowrap rounded-full border-0 bg-[color-mix(in_oklch,var(--red)_52%,var(--green))] px-1.5 py-px text-[11.5px] font-bold text-card'

export interface LaneMandatorySkillsProps {
  phase: string
  state: MandatoryState
  readonly?: boolean
}

export function LaneMandatorySkills({ phase, state, readonly = false }: LaneMandatorySkillsProps): JSX.Element {
  const { t } = useT()
  const { table, capable, track, tracks, writableProfiles, savingKey, saveError, saveErrorKey, registry } = state
  const [popOpen, setPopOpen] = useState(false)
  const popWrapRef = useRef<HTMLDivElement>(null)

  // 候选面板：点外部收起（同 OrchestrationBoard 门 popover 的既有做法；面板内的按钮
  // 自行 stopPropagation，故不会被本监听器误收）。
  useEffect(() => {
    if (!popOpen) return
    function onDocClick(e: MouseEvent): void {
      if (popWrapRef.current && e.target instanceof Node && !popWrapRef.current.contains(e.target)) setPopOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [popOpen])

  const selectedTrack = track === null ? null : tracks.find((candidate) => candidate.id === track) ?? null
  const cell = table !== null && selectedTrack !== null
    ? resolveMandatoryCell(table, selectedTrack, phase, writableProfiles)
    : null
  const writeKey = selectedTrack === null ? '' : `${phase}.${selectedTrack.id}`
  const busy = savingKey === writeKey
  const skills = cell?.skills ?? []
  const isArchive = phase === 'archive'
  // 只有 profile===track.id 且 phase.profile 已显式声明的格子可写。继承 profile、_all、空集合、
  // archive 与 config 不可用都结构性隐藏写入口，避免按钮暗示 server 能完成并不存在的 mutation。
  const entriesRendered = !readonly && capable && cell?.source === 'explicit' && cell.editable && !isArchive
  const writeDisabled = busy

  const entryOf = new Map((registry ?? []).map((e) => [e.name, e]))
  /** 未装徽章：registry 查得到且 installed===false 才标。查不到（如 manifest 的 `a|b` 备选 token）
   *  = 不可判 → 不标（保守，不谎报「没装」）。 */
  const uninstBadge = (id: string): JSX.Element | null => {
    const entry = entryOf.get(id)
    if (!entry || entry.installed) return null
    return (
      <span className={UNINST_CLS} title={entry.installCmd ?? t('workbench.sk_uninstalled_hint_user')}>
        {t('workbench.mand_uninstalled')}
      </span>
    )
  }

  // 说明区：可叠加（如 server 不可写 + 该阶段走 _all 同时成立），故装进一个容器里逐条列，
  // 不做「只显示最高优先级那条」的裁剪——每条都是真的，藏掉任何一条都是少说。
  const notes: string[] = []
  if (isArchive) notes.push(t('workbench.mand_note_archive'))
  if (cell?.source === 'profile-inherited') notes.push(`沿用“${tracks.find((candidate) => candidate.id === cell.profile)?.label ?? cell.profile}”轨道的默认 Skill。`)
  if (cell?.source === 'all-inherited') notes.push('沿用所有轨道共用的默认 Skill。')
  if (cell?.source === 'missing') notes.push('当前轨道尚未设置默认 Skill。')
  if (cell?.source === 'explicit' && !cell.editable) notes.push('当前配置仅供查看。')
  if (entriesRendered && capable && registry === null) notes.push(t('workbench.mand_note_reg'))

  const candidates = (registry ?? []).map((e) => e.name).filter((id) => !skills.includes(id))

  function removeSkill(id: string): void {
    state.setSkills(phase, skills.filter((s) => s !== id))
  }
  function addSkill(id: string): void {
    setPopOpen(false)
    state.setSkills(phase, [...skills, id])
  }

  return (
    <div data-testid={`wb-mand-${phase}`}>
      <div className="mx-0.5 mb-2 flex items-center gap-2">
        <span className={`${ZONE_TITLE} inline-flex items-center gap-1.5`} title={t('workbench.mand_zone_title')}>
          <Layers3 className="h-3.5 w-3.5" aria-hidden="true" /> Skill 调用
        </span>
      </div>

      {table === null ? (
        <span className={cn(NOTE_CLS, 'mx-0.5')}>{t('common.loading')}</span>
      ) : selectedTrack === null || cell === null ? (
        <span className={cn(NOTE_CLS, 'mx-0.5')} data-testid={`wb-mand-unavailable-${phase}`}>
          {t('workbench.mand_tracks_unavailable')}
        </span>
      ) : (
        <>
          {notes.length > 0 && (
            <div className="mx-0.5 mb-2 flex flex-col gap-1" data-testid={`wb-mand-note-${phase}`}>
              {notes.map((n) => (
                <p key={n} className={NOTE_CLS}>
                  {n}
                </p>
              ))}
            </div>
          )}
          <div className="relative" data-testid={`wb-mand-parallel-${phase}`} title="本阶段启动时会注入这些 Skill；当前来源未声明相互依赖。">
            <div className="mb-2 inline-flex items-center gap-2 text-[11.5px] font-bold text-text-3">
              <span className="h-2.5 w-2.5 rounded-full bg-(--accent) shadow-[0_0_0_4px_var(--accent-t)]" aria-hidden="true" />
              阶段开始
              {skills.length > 0 && <span className="h-px w-7 bg-purple-b" aria-hidden="true" />}
            </div>
            <div className="relative flex flex-col items-start gap-2 border-l border-purple-b pl-4">
            {skills.length === 0 && <span className="mx-0.5 text-[13px] text-text-3">{t('workbench.mand_empty')}</span>}
            {skills.map((id) => {
              const presentation = skillPresentation(id, registry)
              const resolvedId = resolvedSkillId(id, registry)
              return (
                <span
                  key={id}
                  data-skill-node=""
                  data-chip=""
                  data-uninstalled={entryOf.get(resolvedId)?.installed === false ? '' : undefined}
                  className={CHIP_CLS}
                  data-testid={`wb-mand-chip-${phase}-${id}`}
                  title={`${presentation.technicalTitle} 当前来源只提供本阶段需要的 Skill，没有声明先后依赖；可编辑工作流中可设置串行、并行与依赖。`}
                >
                  <span className="-ml-[22px] h-2.5 w-2.5 flex-none rounded-full border-2 border-card bg-purple" aria-hidden="true" />
                  <span className="flex-none font-sans">{presentation.name}</span>
                  {uninstBadge(resolvedId)}
                  {entriesRendered && (
                    <button
                      type="button"
                      className="-mr-1 inline-grid size-4 flex-none cursor-pointer place-items-center rounded-[5px] p-0 text-[14px] leading-none opacity-70 transition hover:opacity-100 enabled:hover:bg-red-t enabled:hover:text-red-d disabled:cursor-not-allowed disabled:opacity-40"
                      data-testid={`wb-mand-rm-${phase}-${id}`}
                      aria-label={t('workbench.mand_rm', { id, phase })}
                      disabled={writeDisabled}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSkill(id)
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              )
            })}
            {entriesRendered && (
              <div className="relative" ref={popWrapRef}>
                <button
                  type="button"
                  className={ADD_CLS}
                  data-testid={`wb-mand-add-${phase}`}
                  aria-label={t('workbench.mand_add_aria', { phase })}
                  aria-expanded={popOpen}
                  disabled={writeDisabled || registry === null}
                  title={registry === null ? t('workbench.mand_note_reg') : undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPopOpen((v) => !v)
                  }}
                >
                  {t('workbench.mand_add')}
                </button>
                {popOpen && (
                  <div
                    className="absolute top-[calc(100%+6px)] left-0 z-[6] flex max-h-[260px] w-[300px] flex-col gap-0.5 overflow-y-auto rounded-[11px] border border-border bg-card p-1.5 text-left shadow-md"
                    data-testid={`wb-mand-pop-${phase}`}
                    role="group"
                    aria-label={t('workbench.mand_pop_title', { key: cell.key })}
                  >
                    <p className="px-1.5 py-1 text-[11.5px] font-bold text-text-3">{t('workbench.mand_pop_title', { key: cell.key })}</p>
                    {candidates.length === 0 && <p className="px-1.5 py-1 text-[12.5px] text-text-3">{t('workbench.mand_pop_empty')}</p>}
                    {candidates.map((id) => {
                      const presentation = skillPresentation(id, registry)
                      return (
                      <button
                        key={id}
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-left text-[13px] whitespace-nowrap text-text-2 transition-colors hover:border-purple-b hover:bg-purple-t hover:text-purple-d"
                        data-testid={`wb-mand-opt-${phase}-${id}`}
                        title={presentation.technicalTitle}
                        onClick={(e) => {
                          e.stopPropagation()
                          addSkill(id)
                        }}
                      >
                        {presentation.name}
                        {uninstBadge(id)}
                      </button>
                    )})}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
          {/* saveError 是矩阵级单值：只挂在真出错的那一列（saveErrorKey 缺省时退回全列显示，
              见 MandatoryState.saveErrorKey 注释）。 */}
          {saveError !== null && (saveErrorKey == null || saveErrorKey === writeKey) && (
            <p className="mx-0.5 mt-2 text-[12.5px] text-red" data-testid={`wb-mand-err-${phase}`}>
              {saveError}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// B4：TrackSelector —— 看板级轨道镜头（塞进 OrchestrationBoard 的 toolbarSlot）
// ══════════════════════════════════════════════════════════════════════════

/**
 * 偏离定稿并已知会用户（契约 §3-B4）：定稿 demo 是每列一份 track tab（状态全局同步）。
 * 本实现改为看板级单个选择器——7 份同步控件点一个动全部，locality 坏；track 是横跨整个
 * 矩阵的镜头，不是某一列的属性。
 */
type TrackPolicyDraft = WbTrackDefinition['policyProfile']
interface TrackEditorDraft {
  id: string
  label: string
  workflowDefault: string
  workflowAny: boolean
  workflowAllowed: string
  policyProfile: TrackPolicyDraft
}

function clonePolicy(policy: TrackPolicyDraft): TrackPolicyDraft {
  return {
    ...policy,
    routing: policy.routing.enabled ? { ...policy.routing } : { enabled: false },
    skills: { ...policy.skills },
  }
}

function draftFromTrack(track: WbTrackDefinition): TrackEditorDraft {
  return {
    id: track.id,
    label: track.label,
    workflowDefault: track.workflow.default,
    workflowAny: track.workflow.allowed === '*',
    workflowAllowed: track.workflow.allowed === '*' ? '' : track.workflow.allowed.join(', '),
    policyProfile: clonePolicy(track.policyProfile),
  }
}

function trackDisplayName(track: WbTrackDefinition): string {
  const builtin: Record<string, string> = {
    chat: '对话',
    simple: '简单任务',
    pm: '产品',
    frontend: '前端',
    backend: '后端',
  }
  return builtin[track.id] ?? track.label
}

function TrackSettings({ state }: { state: MandatoryState }): JSX.Element {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; original: WbTrackDefinition | null; draft: TrackEditorDraft } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [routePrompt, setRoutePrompt] = useState('')
  const [routePreview, setRoutePreview] = useState<WbRouterPreview | null>(null)
  const [routePreviewBusy, setRoutePreviewBusy] = useState(false)
  const [routePreviewError, setRoutePreviewError] = useState('')
  const fieldClass = 'rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] text-text focus-visible:border-green focus-visible:outline-none disabled:opacity-60'

  function openCreate(): void {
    const template = state.tracks.find((track) => track.id === 'frontend') ?? state.tracks[0]
    if (!template) return
    setEditor({
      mode: 'create', original: null,
      draft: { id: '', label: '', workflowDefault: 'default', workflowAny: true, workflowAllowed: '', policyProfile: clonePolicy(template.policyProfile) },
    })
    setError(null)
    setDeleteConfirm(false)
    setRoutePreview(null)
    setRoutePreviewError('')
  }

  function openEdit(track: WbTrackDefinition): void {
    setEditor({ mode: 'edit', original: track, draft: draftFromTrack(track) })
    setError(null)
    setDeleteConfirm(false)
    setRoutePreview(null)
    setRoutePreviewError('')
  }

  function updateDraft(patch: Partial<TrackEditorDraft>): void {
    setEditor((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current)
    setRoutePreview(null)
  }

  function effectiveDraft(draft: TrackEditorDraft): WbTrackDefinition {
    return {
      id: draft.id,
      label: draft.label.trim(),
      builtin: false,
      workflow: { default: draft.workflowDefault.trim(), allowed: allowedFromDraft(draft) },
      policyProfile: clonePolicy(draft.policyProfile),
    }
  }

  async function previewRoute(): Promise<void> {
    if (!editor || editor.original?.builtin || routePreviewBusy || routePrompt.trim() === '') return
    setRoutePreviewBusy(true)
    setRoutePreviewError('')
    try {
      setRoutePreview(await postRouterPreview(state.root, routePrompt.trim(), effectiveDraft(editor.draft)))
    } catch (cause) {
      setRoutePreview(null)
      setRoutePreviewError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRoutePreviewBusy(false)
    }
  }

  function allowedFromDraft(draft: TrackEditorDraft): '*' | string[] {
    if (draft.workflowAny) return '*'
    return [...new Set(draft.workflowAllowed.split(',').map((value) => value.trim()).filter(Boolean))]
  }

  async function readMutationError(response: Response): Promise<string> {
    let body: { error?: string; references?: string[]; blockers?: string[] } = {}
    try { body = await response.json() as typeof body } catch { /* no JSON */ }
    const details = [...(Array.isArray(body.references) ? body.references : []), ...(Array.isArray(body.blockers) ? body.blockers : [])]
    return [body.error ?? t('workbench.track_save_failed', { status: response.status }), ...details].join(' · ')
  }

  async function saveTrack(): Promise<void> {
    if (!editor || busy) return
    const draft = editor.draft
    const allowed = allowedFromDraft(draft)
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(draft.id) || draft.label.trim() === '' || draft.workflowDefault.trim() === '') {
      setError(t('workbench.track_fields_invalid'))
      return
    }
    if (editor.mode === 'create' && state.tracks.some((track) => track.id === draft.id)) {
      setError(t('workbench.track_id_duplicate'))
      return
    }
    if (Array.isArray(allowed) && (allowed.length === 0 || !allowed.includes(draft.workflowDefault.trim()))) {
      setError(t('workbench.track_allowed_invalid'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = editor.mode === 'create'
        ? await postTrackDefinition({
            root: state.root,
            revision: state.revision,
            track: {
              id: draft.id,
              label: draft.label.trim(),
              builtin: false,
              workflow: { default: draft.workflowDefault.trim(), allowed },
              policyProfile: clonePolicy(draft.policyProfile),
            },
          })
        : await patchTrackDefinition(state.root, state.revision, draft.id, {
            label: draft.label.trim(),
            workflowDefault: draft.workflowDefault.trim(),
            workflowAllowed: allowed,
            ...(editor.original?.builtin ? {} : { policyProfile: clonePolicy(draft.policyProfile) }),
          })
      if (!response.ok) {
        setError(await readMutationError(response))
        return
      }
      await state.reloadConfig()
      setEditor(null)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError))
    } finally {
      setBusy(false)
    }
  }

  async function removeTrack(): Promise<void> {
    if (!editor?.original || editor.original.builtin || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await deleteTrackDefinition(state.root, state.revision, editor.original.id)
      if (!response.ok) {
        setError(await readMutationError(response))
        return
      }
      await state.reloadConfig()
      setEditor(null)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : String(mutationError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-md border border-border bg-card px-3 py-[6px] text-[12.5px] font-bold text-text-2 transition-colors hover:bg-fill"
        data-testid="wb-track-settings-toggle"
        aria-expanded={open}
        aria-controls="wb-track-settings-panel"
        onClick={() => setOpen((value) => !value)}
      >
        轨道设置
      </button>
      {open && createPortal(
        <section
          id="wb-track-settings-panel"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim/60 p-4 backdrop-blur-[2px]"
          data-testid="wb-track-settings-panel"
          aria-label="工作轨道"
          role="dialog"
          aria-modal="true"
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}
        >
          <div className="max-h-[calc(100vh-32px)] w-[min(920px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-extrabold tracking-[-0.02em] text-text">工作轨道</h3>
              <p className="mt-1 text-sm text-text-3">为不同类型的工作选择默认流程与 Skill。</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={ADD_CLS} data-testid="wb-track-create" onClick={openCreate}>新增轨道</button>
              <button type="button" className="grid size-9 place-items-center rounded-lg border border-border text-lg text-text-3 hover:bg-fill hover:text-text" aria-label="关闭轨道设置" onClick={() => setOpen(false)}>×</button>
            </div>
          </div>
          {editor && (
            <form
              className="mb-3 rounded-xl border border-green-b bg-green-t/35 p-3"
              data-testid="wb-track-editor"
              onSubmit={(event) => { event.preventDefault(); void saveTrack() }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <b className="text-[13px] text-text">{editor.mode === 'create' ? t('workbench.track_create_title') : t('workbench.track_edit_title')}</b>
                <button type="button" className="text-xs text-text-3" onClick={() => setEditor(null)}>{t('workbench.track_cancel')}</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-[11.5px] font-bold text-text-2">
                  轨道标识
                  <input aria-label="Track ID" className={fieldClass} value={editor.draft.id} disabled={editor.mode === 'edit'} onChange={(event) => updateDraft({ id: event.target.value })} />
                </label>
                <label className="grid gap-1 text-[11.5px] font-bold text-text-2">
                  显示名称
                  <input aria-label="显示名称" className={fieldClass} value={editor.draft.label} onChange={(event) => updateDraft({ label: event.target.value })} />
                </label>
                <label className="grid gap-1 text-[11.5px] font-bold text-text-2">
                  默认流程
                  <input aria-label="默认 Workflow" className={fieldClass} value={editor.draft.workflowDefault} onChange={(event) => updateDraft({ workflowDefault: event.target.value })} />
                </label>
                <label className="flex items-center gap-2 self-end rounded-md border border-border px-2 py-1.5 text-[11.5px] font-bold text-text-2">
                  <input type="checkbox" checked={editor.draft.workflowAny} onChange={(event) => updateDraft({ workflowAny: event.target.checked })} />
                  适用于全部流程
                </label>
                {!editor.draft.workflowAny && (
                  <label className="grid gap-1 text-[11.5px] font-bold text-text-2 sm:col-span-2">
                    允许使用的流程
                    <input className={fieldClass} value={editor.draft.workflowAllowed} onChange={(event) => updateDraft({ workflowAllowed: event.target.value })} />
                  </label>
                )}
                {!editor.original?.builtin && (
                  <label className="grid gap-1 text-[11.5px] font-bold text-text-2 sm:col-span-2">
                    规则模板
                    <select
                      aria-label="Policy 模板"
                      className={fieldClass}
                      defaultValue=""
                      onChange={(event) => {
                        const template = state.tracks.find((track) => track.id === event.target.value && track.builtin)
                        if (template) updateDraft({ policyProfile: clonePolicy(template.policyProfile) })
                      }}
                    >
                      <option value="">{t('workbench.track_policy_keep')}</option>
                      {state.tracks.filter((track) => track.builtin).map((track) => <option key={track.id} value={track.id}>{track.id}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {!editor.original?.builtin && (
                <details className="mt-3 rounded-md border border-border bg-card/60 p-2">
                  <summary className="cursor-pointer text-xs font-bold text-text-2">自动分配与执行规则</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-[11px] text-text-2">初始复核状态
                      <select aria-label="reviewSeed" className={fieldClass} value={editor.draft.policyProfile.reviewSeed} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, reviewSeed: event.target.value as 'pending' | 'skipped' } })}>
                        <option value="pending">等待复核</option><option value="skipped">无需复核</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-[11px] text-text-2">覆盖检查
                      <select aria-label="coverageProfile" className={fieldClass} value={editor.draft.policyProfile.coverageProfile} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, coverageProfile: event.target.value as 'none' | 'pm' | 'frontend' | 'backend' } })}>
                        <option value="none">不检查</option><option value="pm">产品</option><option value="frontend">前端</option><option value="backend">后端</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-text-2"><input aria-label="automationEligible" type="checkbox" checked={editor.draft.policyProfile.automationEligible} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, automationEligible: event.target.checked } })} />允许手动 AFK</label>
                    <label className="flex items-center gap-2 text-[11px] text-text-2"><input aria-label="autoEnqueueOnSpecComplete" type="checkbox" checked={editor.draft.policyProfile.autoEnqueueOnSpecComplete ?? false} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, autoEnqueueOnSpecComplete: event.target.checked } })} />规格完成后自动进入 AFK</label>
                    <label className="flex items-center gap-2 text-[11px] text-text-2"><input aria-label="skills.matrix" type="checkbox" checked={editor.draft.policyProfile.skills.matrix} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, skills: { ...editor.draft.policyProfile.skills, matrix: event.target.checked } } })} />使用轨道 Skill</label>
                    <label className="grid gap-1 text-[11px] text-text-2">Skill 来源<input aria-label="skills.profile" className={fieldClass} value={editor.draft.policyProfile.skills.profile} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, skills: { ...editor.draft.policyProfile.skills, profile: event.target.value } } })} /></label>
                    <label className="flex items-center gap-2 text-[11px] text-text-2"><input aria-label="routing.enabled" type="checkbox" checked={editor.draft.policyProfile.routing.enabled} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, routing: event.target.checked ? { enabled: true, pattern: '', priority: 0 } : { enabled: false } } })} />启用自动分配</label>
                    {editor.draft.policyProfile.routing.enabled && <>
                      <label className="grid gap-1 text-[11px] text-text-2">匹配规则<input aria-label="routing.pattern" className={fieldClass} value={editor.draft.policyProfile.routing.pattern} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, routing: { ...editor.draft.policyProfile.routing as { enabled: true; pattern: string; priority: number }, pattern: event.target.value } } })} /></label>
                      <label className="grid gap-1 text-[11px] text-text-2">排除规则（可选）<input aria-label="routing.excludePattern" className={fieldClass} value={editor.draft.policyProfile.routing.excludePattern ?? ''} onChange={(event) => {
                        const routing = editor.draft.policyProfile.routing as { enabled: true; pattern: string; excludePattern?: string; priority: number }
                        const excludePattern = event.target.value
                        updateDraft({
                          policyProfile: {
                            ...editor.draft.policyProfile,
                            routing: excludePattern === ''
                              ? { enabled: true, pattern: routing.pattern, priority: routing.priority }
                              : { ...routing, excludePattern },
                          },
                        })
                      }} /></label>
                      <label className="grid gap-1 text-[11px] text-text-2">优先级<input aria-label="routing.priority" type="number" min="0" className={fieldClass} value={editor.draft.policyProfile.routing.priority} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, routing: { ...editor.draft.policyProfile.routing as { enabled: true; pattern: string; priority: number }, priority: Number(event.target.value) } } })} /></label>
                    </>}
                  </div>
                </details>
              )}
              {!editor.original?.builtin && (
                <section className="mt-3 rounded-md border border-border bg-card/70 p-2" data-testid="wb-track-route-impact">
                  <div className="mb-2">
                    <b className="text-xs text-text">{t('workbench.track_route_preview_title')}</b>
                    <p className="mt-0.5 text-[11px] text-text-3">{t('workbench.track_route_preview_note')}</p>
                  </div>
                  <div className="flex gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">{t('workbench.track_route_prompt')}</span>
                      <input
                        className={`${fieldClass} w-full`}
                        data-testid="wb-track-route-prompt"
                        value={routePrompt}
                        placeholder={t('workbench.track_route_prompt_placeholder')}
                        onChange={(event) => { setRoutePrompt(event.target.value); setRoutePreview(null) }}
                      />
                    </label>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-bold text-text-2 disabled:opacity-50"
                      data-testid="wb-track-route-preview"
                      disabled={routePreviewBusy || routePrompt.trim() === ''}
                      onClick={() => void previewRoute()}
                    >
                      {routePreviewBusy ? t('workbench.track_route_previewing') : t('workbench.track_route_preview')}
                    </button>
                  </div>
                  {routePreviewError !== '' && <p className="mt-2 text-xs text-red" role="alert">{routePreviewError}</p>}
                  {routePreview && (
                    <div className="mt-2 text-[11.5px] text-text-2" data-testid="wb-track-route-result">
                      <p className="font-semibold text-text">
                        {routePreview.suppressed_reason
                          ? t('workbench.track_route_suppressed', { reason: routePreview.suppressed_reason })
                          : routePreview.winner
                            ? t('workbench.track_route_winner', { label: routePreview.winner.track.label, score: routePreview.winner.score })
                            : t('workbench.track_route_no_winner')}
                      </p>
                      <ul className="mt-1 grid list-none gap-1 p-0 sm:grid-cols-2">
                        {routePreview.candidates.map((candidate) => (
                          <li key={candidate.track.id} className="flex justify-between gap-2 rounded bg-fill px-2 py-1">
                            <span>{candidate.track.label}</span>
                            <code>匹配度 {candidate.score} · 优先级 {candidate.priority}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}
              {error && <p className="mt-3 rounded-md border border-red-b bg-red-t p-2 text-xs text-red-d" role="alert" data-testid="wb-track-editor-error">{error}</p>}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {editor.mode === 'edit' && !editor.original?.builtin && (
                  deleteConfirm
                    ? <button type="button" className="rounded-md border border-red-b px-3 py-1.5 text-xs font-bold text-red-d" data-testid="wb-track-delete-confirm" onClick={() => void removeTrack()} disabled={busy}>{t('workbench.track_delete_confirm')}</button>
                    : <button type="button" className="mr-auto rounded-md border border-red-b px-3 py-1.5 text-xs font-bold text-red-d" data-testid="wb-track-editor-delete" onClick={() => setDeleteConfirm(true)}>{t('workbench.track_delete')}</button>
                )}
                <button type="submit" className="rounded-md bg-btn-bg px-4 py-1.5 text-xs font-bold text-btn-fg disabled:opacity-50" data-testid="wb-track-editor-save" disabled={busy}>{busy ? t('workbench.track_saving') : t('workbench.track_save')}</button>
              </div>
            </form>
          )}
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
            {state.tracks.map((track) => {
              const routing = track.policyProfile.routing
              const profile = track.policyProfile.skills.profile
              return (
                <li
                  key={track.id}
                  className="rounded-2xl border border-border bg-bg p-4 text-[12.5px] text-text-2 shadow-sm transition hover:border-border-2 hover:shadow-md"
                  data-testid={`wb-track-setting-${track.id}`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    {track.builtin && <LockKeyhole className="h-3.5 w-3.5 text-text-3" aria-label={t('workbench.track_builtin_lock')} />}
                    <b className="text-[15px] text-text">{trackDisplayName(track)}</b>
                    {track.builtin && <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] text-text-3">系统轨道</span>}
                    <button
                      type="button"
                      className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-bold text-text-3 disabled:cursor-not-allowed disabled:opacity-55"
                      data-testid={`wb-track-edit-${track.id}`}
                      onClick={() => openEdit(track)}
                    >
                      {t('workbench.track_edit')}
                    </button>
                  </div>
                  <dl className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-2 border-t border-border pt-3">
                    <dt className="text-text-3">适用流程</dt>
                    <dd className="m-0 font-semibold text-text">{track.workflow.default}{Array.isArray(track.workflow.allowed) ? ` · ${track.workflow.allowed.join('、')}` : ' · 全部'}</dd>
                    <dt className="text-text-3">自动分配</dt>
                    <dd className="m-0 font-semibold text-text">{routing.enabled ? '已启用' : '未启用'}</dd>
                    <dt className="text-text-3">AFK 接管</dt>
                    <dd className="m-0 font-semibold text-text">{track.policyProfile.autoEnqueueOnSpecComplete ? 'Spec 完成后自动排队' : '仅按需执行'}</dd>
                    <dt className="text-text-3">默认技能</dt>
                    <dd className="m-0 font-semibold text-text">
                      {track.policyProfile.skills.matrix
                        ? profile === track.id
                          ? '使用本轨道配置'
                          : `沿用“${trackDisplayName(state.tracks.find((candidate) => candidate.id === profile) ?? track)}”轨道`
                        : '不注入默认 Skill'}
                    </dd>
                  </dl>
                </li>
              )
            })}
          </ul>
          </div>
        </section>
      , document.body)}
    </div>
  )
}

export function TrackSelector({ state }: { state: MandatoryState }): JSX.Element {
  const { t } = useT()

  function onTrackKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const last = state.matrixTracks.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = last
    if (next === null || next < 0) return
    event.preventDefault()
    const candidate = state.matrixTracks[next]
    if (!candidate) return
    state.setTrack(candidate.id)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons?.[next]?.focus()
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold text-text-3">
        运行轨道
        <span className="grid h-6 w-6 place-items-center rounded-full text-text-3" title="轨道是项目级运行配置：为任务选择角色、路由与默认 Skill，不改变 Workflow 的阶段。所有 Workflow 都可以使用同一组轨道。" aria-label="运行轨道说明">
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </span>
      {state.table === null ? (
        <span className={NOTE_CLS} role="status" data-testid="wb-track-loading">{t('workbench.track_loading')}</span>
      ) : state.configError !== null ? (
        <span className="text-[12.5px] text-red" role="alert" data-testid="wb-track-load-error">
          {t('workbench.track_load_error')}
        </span>
      ) : state.matrixTracks.length === 0 ? (
        <span className={NOTE_CLS} role="status" data-testid="wb-track-empty">{t('workbench.track_empty')}</span>
      ) : (
        <div
          className="inline-flex flex-wrap gap-1 rounded-xl bg-fill p-1 shadow-inner"
          role="radiogroup"
          aria-label={t('workbench.mand_track_group')}
          data-testid="wb-track-tabs"
        >
          {state.matrixTracks.map((candidate, index) => {
            const selected = candidate.id === state.track
            const profile = candidate.policyProfile.skills.profile
            return (
              <button
                key={candidate.id}
                type="button"
                role="radio"
                className="cursor-pointer rounded-lg border-0 bg-transparent px-4 py-2 text-[12.5px] font-bold text-text-3 transition-all not-aria-checked:hover:text-text-2 aria-checked:bg-card aria-checked:text-accent-d aria-checked:shadow-sm"
                aria-checked={selected}
                title={`${candidate.label}${profile !== candidate.id ? `；沿用 ${state.tracks.find((track) => track.id === profile)?.label ?? profile} 轨道 Skill` : ''}`}
                tabIndex={selected ? 0 : -1}
                data-testid={`wb-track-${candidate.id}`}
                onClick={() => state.setTrack(candidate.id)}
                onKeyDown={(event) => onTrackKeyDown(event, index)}
              >
                {candidate.builtin && <span className="sr-only">系统轨道 </span>}
                {trackDisplayName(candidate)}
                {profile !== candidate.id && <span className="sr-only">，沿用 {trackDisplayName(state.tracks.find((track) => track.id === profile) ?? candidate)} 轨道技能</span>}
              </button>
            )
          })}
        </div>
      )}
      {state.table !== null && state.tracks.length > 0 ? <TrackSettings state={state} /> : null}
    </div>
  )
}
