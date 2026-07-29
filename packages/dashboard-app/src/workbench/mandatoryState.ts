import { useEffect, useRef, useState } from 'react'
import { fetchSkillsRegistry, postMandatorySkills, type WbSkillEntry, type WbTrackDefinition } from '../api/client'
import { formatApiError } from '../api/transport'
import { useT } from '../i18n'
import {
  clearMandatoryConfig,
  isValidMandatorySkillList,
  loadMandatoryConfig,
  peekMandatoryConfig,
  primeMandatoryConfig,
  type MandatoryConfig,
  type MatrixTrack,
} from './mandatoryConfig'

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
  const { t, lang } = useT()
  const [requestedTrack, setRequestedTrack] = useState<MatrixTrack | null>(null)
  const [cfg, setCfg] = useState<MandatoryConfig | null>(() => peekMandatoryConfig(root))
  const [registry, setRegistry] = useState<WbSkillEntry[] | null>(null)
  const [regFailed, setRegFailed] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  useEffect(() => {
    setSaveError(null)
    setSaveErrorKey(null)
  }, [lang])
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
      .then((skills) => {
        if (!cancelled) setRegistry(skills)
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
        if (rootRef.current === requestRoot) {
          setSaveError(
            lang === 'zh' && body.error
              ? body.error
              : t('workbench.mand_save_failed', { status: res.status }),
          )
          setSaveErrorKey(cellKey)
        }
        return
      }
      if (body.skills !== undefined && !isValidMandatorySkillList(body.skills)) {
        if (rootRef.current === requestRoot) {
          setSaveError(t('workbench.mand_save_invalid'))
          setSaveErrorKey(cellKey)
        }
        return
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
        setSaveError(formatApiError(e, t, { exposeServerDetail: lang === 'zh' }))
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
    clearMandatoryConfig(requestRoot)
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
