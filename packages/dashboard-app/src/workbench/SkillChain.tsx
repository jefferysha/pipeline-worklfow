import { useEffect, useRef, useState } from 'react'
import { getToken, type WbSkillEntry } from '../api/client'
import { useT } from '../i18n'
import { MANDATORY_SKILLS, MATRIX_TRACKS } from './data'
import { SkillTransferModal } from './SkillTransferModal'
import type { WbSkillRef, WbStepDef } from './WorkbenchView'

/**
 * SkillChain（T14，计划 2026-07-11-v5-interaction-rebuild）—— StepEditor 技能区，
 * 挂在「基本」与「产出物」两区之间。交互真相源 design-demos/v5-progress-workbench.html
 * 的 wb-chain / wb-skpanel / wb-tracks 区块。两种模式按 workflow 名分岔：
 *
 * · 自定义 workflow：step.skills 的依赖链可视化（chip ➝ chip 拓扑序、无依赖并列独立行）
 *   + 「+ 添加」面板（候选来自 GET /api/skills/registry，可选「依赖于」下拉列当前 step
 *   已有 skills）+ 移除级联（清掉引用被删技能的 depends_on）。所有编辑经 onChange 交回
 *   WorkbenchView 的 def 草稿（T13 唯一真相源），最终走 POST /api/workflows/:name 真写
 *   回 yaml——循环依赖/未知技能由 kernel validate 在保存时拒绝并原文上抛（T13 已接线，
 *   见 WorkbenchView.readSaveErrors），本组件不自造 DAG 校验逻辑（skillDag.ts 纪律）。
 *
 * · default workflow（决议 #6 穿梭框能力迁移）：轨道 tab（pm/frontend/backend）× 当前
 *   阶段的 manifest 强制技能（数据 GET /api/config，探测逻辑自 旧设置视图 直接迁移：
 *   探测成功 = 可编辑，编辑经 SkillTransferModal 穿梭框 + POST /api/config/mandatory-skills
 *   真写 templates/manifest.yaml；探测不到（旧 server / 网络失败）= 只读预览，静态镜像
 *   workbench/data.ts::MANDATORY_SKILLS 兜底，不谎报能力。in-flight 保存守卫（savingKeyRef）
 *   同样自 旧设置视图 迁移——同 cell 在途保存时重复保存/取消整体 no-op。
 *   注意：default 模式忽略 readonly prop——workflow 定义只读（server 400 已挡）不等于
 *   manifest 强制技能矩阵只读，两者是不同的数据面。
 *
 * 链可视化算法沿 demo chainsHTML：单线 walk（每节点取第一个未用后继），多依赖节点只在首链
 * 出现一次；悬空依赖（指向 step 外/未参与首链）以幽灵 chip 呈现在链头。这只是展示投影——
 * 解锁判定的唯一权威在 kernel skillDag.ts::isSkillUnlocked，前端不复刻其语义。
 */

// 同 kernel validate.ts IDENT_RE / StepEditor FIELD_RE 一条规则：自定义 workflow 的 skill id
// 字符集越界（如外部技能的 `plugin:skill` 冒号名）会被 kernel validate 在保存时拒绝——
// 添加面板对这类候选直接禁用并给原因，不让用户「加了却存不进去」。
const SKILL_ID_RE = /^[a-zA-Z0-9_-]+$/

interface ErrorBody {
  error?: string
}

/** 非 2xx 响应尽量读出 server 的 { error } 文案（同 WorkbenchView.readErrorDetail 的既有模式）。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

// ── 依赖链投影（demo chainsHTML 的 React 移植，depends_on 数组化）──

interface ChainRow {
  /** 链头悬空依赖（指向 step 外的 skill id / 分叉未随首链走掉的父节点），null = 干净链头。 */
  ghost: string | null
  ids: string[]
}

interface ChainProjection {
  chains: ChainRow[]
  solos: string[]
}

function buildChains(skills: readonly WbSkillRef[]): ChainProjection {
  const byId = new Set(skills.map((s) => s.id))
  const inListDeps = (s: WbSkillRef): string[] => (s.depends_on ?? []).filter((d) => byId.has(d))
  const kids = new Map<string, string[]>()
  for (const s of skills) {
    for (const dep of inListDeps(s)) {
      const list = kids.get(dep) ?? []
      list.push(s.id)
      kids.set(dep, list)
    }
  }
  const used = new Set<string>()
  function walk(start: string): string[] {
    const ch = [start]
    used.add(start)
    let cur = start
    for (;;) {
      const next = (kids.get(cur) ?? []).find((k) => !used.has(k))
      if (!next) return ch
      ch.push(next)
      used.add(next)
      cur = next
    }
  }
  const chains: ChainRow[] = []
  const solos: string[] = []
  // 第一遍（声明序）：完全未声明依赖的节点起链；长度 1 且无后继 = 无依赖独立项。
  // （只声明了悬空依赖的节点不算「无依赖」——留给第二遍以幽灵 chip 呈现它挂在谁下面。）
  for (const s of skills) {
    if (used.has(s.id) || (s.depends_on ?? []).length > 0) continue
    const ch = walk(s.id)
    if (ch.length === 1) solos.push(s.id)
    else chains.push({ ghost: null, ids: ch })
  }
  // 第二遍：剩余节点（悬空依赖/分叉支/循环）——链头带幽灵 chip 指明它挂在谁下面。
  for (const s of skills) {
    if (used.has(s.id)) continue
    chains.push({ ghost: s.depends_on?.[0] ?? null, ids: walk(s.id) })
  }
  return { chains, solos }
}

// ── default 模式：manifest 强制技能矩阵的模块级探测缓存 ──
// StepEditor 按 (workflow, step) 复合 key 挂载，切阶段即重挂——探测结果放模块级，
// 避免每次切阶段都重打一发 GET /api/config（旧设置视图 的 fetchedConfigRef 等价物，
// 但要跨 remount 存活）。保存成功后同步写缓存，重挂读到的就是新值。
interface MandatoryConfig {
  capable: boolean
  table: Record<string, string[]>
}

let cfgCache: MandatoryConfig | null = null
let cfgInflight: Promise<MandatoryConfig> | null = null

/** 测试钩子 + 未来手动刷新入口：清空 config 探测缓存（同 invalidateWorkflowRules 的命名惯例）。 */
export function invalidateMandatoryConfig(): void {
  cfgCache = null
  cfgInflight = null
}

function loadMandatoryConfig(): Promise<MandatoryConfig> {
  if (cfgCache) return Promise.resolve(cfgCache)
  cfgInflight ??= fetch('/api/config', { headers: { Accept: 'application/json' } })
    .then(async (res) => {
      // r.ok 检查必须在 r.json() 之前（SkillTransferModal 同一条既有教训：server 错误
      // 也是 JSON 信封，非 2xx 时 json() 照样 resolve，不先查 ok 就探测不到「不可写」）。
      if (!res.ok) return { capable: false, table: MANDATORY_SKILLS }
      const body = (await res.json()) as { mandatory_skills?: Record<string, string[]> }
      return { capable: true, table: body.mandatory_skills ?? {} }
    })
    .catch((): MandatoryConfig => ({ capable: false, table: MANDATORY_SKILLS }))
    .then((r) => {
      cfgCache = r
      cfgInflight = null
      return r
    })
  return cfgInflight
}

/** POST /api/config/mandatory-skills 的成功响应体形状（自 旧设置视图 迁移）。 */
interface MandatorySkillsPostResponse {
  ok?: boolean
  error?: string
  skills?: string[]
}

export interface SkillChainProps {
  step: WbStepDef
  /** 所属 workflow 名：'default' 走 manifest 强制技能矩阵模式，其余为 step.skills DAG 编辑。 */
  workflow?: string
  /** 自定义 workflow 只读镜像：隐藏移除 × 与添加面板（default 模式忽略此项，见头注释）。 */
  readonly?: boolean
  onChange: (updated: WbStepDef) => void
}

export function SkillChain({ step, workflow = '', readonly = false, onChange }: SkillChainProps): JSX.Element {
  const { t } = useT()
  const isDefault = workflow === 'default'

  // ── 自定义模式：添加面板态 ──
  const [panelOpen, setPanelOpen] = useState(false)
  const [registry, setRegistry] = useState<WbSkillEntry[] | null>(null)
  const [regError, setRegError] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<string | null>(null)
  const [dep, setDep] = useState('')

  // ── default 模式：矩阵态（探测/轨道/穿梭框/保存）──
  const [track, setTrack] = useState<string>(MATRIX_TRACKS[0])
  const [cfg, setCfg] = useState<MandatoryConfig | null>(cfgCache)
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // 自 旧设置视图 迁移的 in-flight 保存守卫：ref 而非 state——只在回调里同步读，
  // 不参与渲染，保证判断即时生效。
  const savingKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isDefault || cfg !== null) return
    let cancelled = false
    void loadMandatoryConfig().then((r) => {
      if (!cancelled) setCfg(r)
    })
    return () => {
      cancelled = true
    }
  }, [isDefault, cfg])

  // ── 自定义模式动作 ──

  function togglePanel(): void {
    setPanelOpen((v) => !v)
    if (registry === null && regError === null) {
      fetch('/api/skills/registry', { headers: { Accept: 'application/json' } })
        .then(async (r) => {
          if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
          return r.json() as Promise<{ skills: WbSkillEntry[] }>
        })
        .then((body) => setRegistry(body.skills))
        .catch((err: unknown) => {
          setRegError(t('workbench.sk_registry_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') }))
        })
    }
  }

  function removeSkill(id: string): void {
    onChange({
      ...step,
      skills: step.skills
        .filter((s) => s.id !== id)
        .map((s) => {
          // 级联：清掉指向被删技能的 depends_on（验收④）；清空后落为无键，serialize 不写空数组行。
          if (!s.depends_on?.includes(id)) return s
          const rest = s.depends_on.filter((d) => d !== id)
          if (rest.length === 0) {
            const { depends_on: _dropped, ...bare } = s
            return bare
          }
          return { ...s, depends_on: rest }
        }),
    })
  }

  function confirmAdd(): void {
    if (!candidate) return
    const ref: WbSkillRef = dep ? { id: candidate, depends_on: [dep] } : { id: candidate }
    onChange({ ...step, skills: [...step.skills, ref] })
    setPanelOpen(false)
    setCandidate(null)
    setDep('')
  }

  // ── default 模式动作（探测/保存逻辑自 旧设置视图 saveCellWith/requestSave/requestCancel 迁移）──

  const phase = step.id
  function effectiveSkills(tr: string): string[] {
    const table = cfg?.table ?? MANDATORY_SKILLS
    return table[`${phase}.${tr}`] ?? table[`${phase}._all`] ?? []
  }

  async function saveMandatory(skills: string[]): Promise<void> {
    const cellKey = `${phase}.${track}`
    savingKeyRef.current = cellKey
    setSaveError(null)
    try {
      const res = await fetch('/api/config/mandatory-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ phase, track, skills }),
      })
      let body: MandatorySkillsPostResponse = {}
      try {
        body = (await res.json()) as MandatorySkillsPostResponse
      } catch {
        /* 无 JSON 体：走下方通用错误文案 */
      }
      if (!res.ok) {
        throw new Error(body.error || t('workbench.sk_save_failed', { status: res.status }))
      }
      const saved = Array.isArray(body.skills) ? body.skills : skills
      setCfg((prev) => {
        const next: MandatoryConfig = { capable: prev?.capable ?? true, table: { ...(prev?.table ?? {}), [cellKey]: saved } }
        cfgCache = next // 模块缓存同步推进——切阶段重挂读到的就是保存后的矩阵
        return next
      })
      setEditing(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      if (savingKeyRef.current === cellKey) savingKeyRef.current = null
    }
  }

  function requestSave(skills: string[]): void {
    if (savingKeyRef.current === `${phase}.${track}`) return
    void saveMandatory(skills)
  }

  function requestCancel(): void {
    if (savingKeyRef.current === `${phase}.${track}`) return
    setEditing(false)
    setSaveError(null)
  }

  // ── default 模式渲染 ──
  if (isDefault) {
    const skills = effectiveSkills(track)
    // archive 无强制技能（manifest 约定，POST 端点亦拒 archive）——不给编辑钮。
    const canEdit = cfg?.capable === true && phase !== 'archive'
    return (
      <div className="wb-ed-sec" data-testid="wb-sk-sec">
        <div className="wb-ed-sec-h">
          {t('workbench.sk_sec')}
          <span className="hint">{t('workbench.sk_hint_default', { phase })}</span>
        </div>
        {cfg === null ? (
          <p className="wb-note">{t('common.loading')}</p>
        ) : (
          <>
            <div className="wb-tracks" data-testid="wb-sk-tracks">
              {MATRIX_TRACKS.map((tr) => {
                const n = effectiveSkills(tr).length
                return (
                  <button
                    key={tr}
                    type="button"
                    className={`wb-track${tr === track ? ' on' : ''}`}
                    aria-pressed={tr === track}
                    data-testid={`wb-sk-track-${tr}`}
                    onClick={() => setTrack(tr)}
                  >
                    {tr}
                    {n > 0 && <b>{n}</b>}
                  </button>
                )
              })}
            </div>
            <div className="wb-chips" data-testid="wb-sk-mand">
              {skills.length === 0 && <span className="wb-empty">{t('workbench.sk_empty_default')}</span>}
              {skills.map((s) => (
                <span key={s} className="wb-chip" title={s}>
                  {s}
                </span>
              ))}
            </div>
            <div className="wb-sk-actions">
              {canEdit && (
                <button type="button" className="wb-addchip" data-testid="wb-sk-edit" onClick={() => { setEditing(true); setSaveError(null) }}>
                  {t('workbench.sk_edit')}
                </button>
              )}
              {cfg.capable === false && (
                <p className="wb-note" data-testid="wb-sk-cfg-ro">{t('workbench.sk_cfg_readonly')}</p>
              )}
            </div>
            {saveError && (
              <p className="view__note view__note--error wb-sk-err" data-testid="wb-sk-save-error">{saveError}</p>
            )}
            {editing && <SkillTransferModal selected={skills} onSave={requestSave} onCancel={requestCancel} />}
          </>
        )}
        <p className="wb-note wb-sec-note">{t('workbench.sk_mand_note')}</p>
      </div>
    )
  }

  // ── 自定义模式渲染 ──
  const { chains, solos } = buildChains(step.skills)
  const have = new Set(step.skills.map((s) => s.id))
  const candidates = (registry ?? []).map((e) => e.name).filter((id) => !have.has(id))

  const chip = (id: string): JSX.Element => (
    <span key={id} className="wb-chip" title={id}>
      {id}
      {!readonly && (
        <button type="button" className="wb-x" aria-label={t('workbench.sk_remove', { id })} onClick={() => removeSkill(id)}>
          ×
        </button>
      )}
    </span>
  )

  return (
    <div className="wb-ed-sec" data-testid="wb-sk-sec">
      <div className="wb-ed-sec-h">
        {t('workbench.sk_sec')}
        <span className="hint">{t('workbench.sk_hint_custom')}</span>
      </div>
      <div data-testid="wb-sk-chains">
        {step.skills.length === 0 && (
          <div className="wb-chain">
            <span className="wb-empty">{t('workbench.sk_empty_custom')}</span>
          </div>
        )}
        {chains.map((c) => (
          <div key={c.ids[0]} className="wb-chain" data-testid="wb-sk-chain">
            <span className="wb-chain-k">{t('workbench.sk_chain_k')}</span>
            {c.ghost && (
              <>
                <span className="wb-chip wb-chip--ghost">{c.ghost}</span>
                <span className="wb-arr" aria-hidden="true">➝</span>
              </>
            )}
            {c.ids.map((id, i) => (
              <span key={id} className="wb-chain-seg">
                {i > 0 && <span className="wb-arr" aria-hidden="true">➝</span>}
                {chip(id)}
              </span>
            ))}
          </div>
        ))}
        {solos.length > 0 && (
          <div className="wb-chain" data-testid="wb-sk-solo">
            <span className="wb-chain-k">{t('workbench.sk_solo_k')}</span>
            {solos.map(chip)}
          </div>
        )}
      </div>
      {!readonly && (
        <div className="wb-sk-actions">
          {/* aria-label 与产出物区的「+ 添加」区分开——同卡两个裸名 '+ 添加' 对读屏是歧义。 */}
          <button
            type="button"
            className="wb-addchip"
            data-testid="wb-sk-add"
            aria-label={t('workbench.sk_add_aria')}
            aria-expanded={panelOpen}
            onClick={togglePanel}
          >
            {t('workbench.sk_add')}
          </button>
        </div>
      )}
      {!readonly && panelOpen && (
        <div className="wb-skpanel" data-testid="wb-sk-panel">
          <div className="wb-skp-h">
            {t('workbench.sk_panel_title')}
            <span className="hint">{t('workbench.sk_panel_hint')}</span>
          </div>
          <div className="wb-skp-list">
            {regError && <span className="view__note view__note--error">{regError}</span>}
            {!regError && registry === null && <span className="wb-empty">{t('common.loading')}</span>}
            {!regError && registry !== null && candidates.length === 0 && (
              <span className="wb-empty">{t('workbench.sk_panel_empty')}</span>
            )}
            {candidates.map((id) => {
              const legal = SKILL_ID_RE.test(id)
              return (
                <button
                  key={id}
                  type="button"
                  className={`wb-skopt${id === candidate ? ' on' : ''}`}
                  data-testid={`wb-sk-opt-${id}`}
                  disabled={!legal}
                  title={legal ? id : t('workbench.sk_illegal_hint')}
                  onClick={() => setCandidate(id)}
                >
                  {id}
                </button>
              )
            })}
          </div>
          <div className="wb-skp-foot">
            <label>
              {t('workbench.sk_dep_label')}
              <select
                className="wb-input wb-skp-dep"
                data-testid="wb-sk-dep"
                aria-label={t('workbench.sk_dep_label')}
                value={dep}
                onChange={(e) => setDep(e.target.value)}
              >
                <option value="">{t('workbench.sk_dep_none')}</option>
                {step.skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </label>
            <span className="wb-spacer" />
            <button
              type="button"
              className="btn btn--ghost"
              data-testid="wb-sk-cancel"
              onClick={() => {
                setPanelOpen(false)
                setCandidate(null)
                setDep('')
              }}
            >
              {t('workbench.sk_cancel')}
            </button>
            <button type="button" className="btn" data-testid="wb-sk-confirm" disabled={!candidate} onClick={confirmAdd}>
              {t('workbench.sk_confirm')}
            </button>
          </div>
        </div>
      )}
      <p className="wb-note wb-sec-note">{t('workbench.sk_dag_note')}</p>
    </div>
  )
}
