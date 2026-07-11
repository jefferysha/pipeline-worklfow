import { useEffect, useState, type CSSProperties } from 'react'
import { fetchLoopsSnapshot, postLoopLevel, postLoopUpdate, type WbLoopRow } from '../api/client'
import { useT } from '../i18n'
import { Dialog } from '../shell/Dialog'

/**
 * LoopCard（T16，计划 2026-07-11-v5-interaction-rebuild）——「自动运行(Loop)」卡并入编排页。
 * 交互真相源 design-demos/v5-progress-workbench.html #wbLoopCard（滑杆轨道 fill-2/填充 accent/
 * 推荐三角刻度）；决议 #3 裁减口径：健康度环/台账/漂移检测一律不做 UI。
 *
 * 写回交互拍板（任务书「dirty 汇总进保存钮或即时保存，选一致的交互并注释」）：
 *   · 除自主级别外的**全部参数**（含启用开关）走「dirty 汇总 → 卡头保存钮」一次 POST
 *     /api/loops/update——demo 同款（demo 的 lpEnable 开关也只是 markDirty，落盘走 wbSave），
 *     且与 patch 语义天然匹配（一次保存 = 一个精确 patch，不夹带未改字段）；
 *   · 自主级别是唯一例外：它不是 loops.yaml 文本手术的合法字段（update 端点旁路禁区），
 *     必须走 POST /api/loops/level 毕业制裁决——所以点击即发、即时生效；升档先过确认 Dialog
 *     （沿 LoopsPanel Task 13「风险不对称」纪律：升档确认、降档直发），server 拒绝时
 *     plan.reason/blockers 原文展示。
 *
 * 状态托管：快照读取住在 useLoops（WorkbenchView 持有）——右栏摘要「自动运行」行与本卡吃同
 * 一份 rows（useHooksConfig 的同一条「数据住共同祖先」纪律）。草稿（draft）住本卡：row 对象
 * 换新（首载/切 loop/保存后 reload）即以 server 真值重置草稿。摘要行显示已保存真值，不吃草稿。
 */

/**
 * kernel loops/types.ts::LOOP_RUNNERS 的纯数据镜像（T17 决议#14：runner 下拉双选项）。
 * dashboard 是浏览器 bundle，直接 import @pipeline-lite/kernel 会拉进 node:fs 代码破坏构建
 * （types.ts TRANSITIONS 镜像的同一条纪律）——单源守卫见 LoopCard.test.tsx 的镜像相等断言。
 * 注意 LoopEntry.runner 是自由字符串（历史登记存在 'cron'/'cron-session'）：现值不在清单内时
 * 下拉额外渲染该真值选项，不谎报为双选项之一。
 */
export const LOOP_RUNNERS = ['claude-code', 'codex'] as const

// ── 草稿形状：/api/loops/update 可 patch 字段的编辑面（kernel loops/update.ts 全集，
//    autonomy_level 除外——见头注释）──
interface LoopDraft {
  status: string
  goal: string
  design_doc: string
  /** row.change_prefix null ↔ 草稿空串；保存时空串写回 null（kernel checkedValue 允许）。 */
  change_prefix: string
  risk: string
  runner: string
  cadence: string
  max_runs_per_day: number
  max_in_flight: number
  max_tokens_per_day: number | null
  on_exceed: string
  human_gates: string[]
  kill_criteria: string[]
  allowlist: string[]
  denylist: string[]
}

function draftOf(row: WbLoopRow): LoopDraft {
  return {
    status: row.status,
    goal: row.goal,
    design_doc: row.design_doc,
    change_prefix: row.change_prefix ?? '',
    risk: row.risk,
    runner: row.runner,
    cadence: row.cadence,
    max_runs_per_day: row.budget_decl.max_runs_per_day,
    max_in_flight: row.budget_decl.max_in_flight,
    max_tokens_per_day: row.budget_decl.max_tokens_per_day ?? null,
    on_exceed: row.budget_decl.on_exceed,
    human_gates: [...row.human_gates],
    kill_criteria: [...row.kill_criteria],
    allowlist: [...row.allowlist],
    denylist: [...row.denylist],
  }
}

/** 草稿 vs 基线 → 精确 patch（只带被改字段——验收②「不夹带未改字段」）。 */
function computePatch(draft: LoopDraft, base: LoopDraft): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const k of ['status', 'goal', 'design_doc', 'risk', 'runner', 'cadence', 'on_exceed'] as const) {
    if (draft[k] !== base[k]) patch[k] = draft[k]
  }
  if (draft.change_prefix !== base.change_prefix) {
    patch.change_prefix = draft.change_prefix === '' ? null : draft.change_prefix
  }
  for (const k of ['max_runs_per_day', 'max_in_flight'] as const) {
    if (draft[k] !== base[k]) patch[k] = draft[k]
  }
  // token 上限：null=未声明预算——滑杆一经拖动即为数字；「拖回未设置」不存在（demo 同款），
  // 所以 null→null 恒不进 patch，数字变化才进。
  if (draft.max_tokens_per_day !== base.max_tokens_per_day && draft.max_tokens_per_day !== null) {
    patch.max_tokens_per_day = draft.max_tokens_per_day
  }
  for (const k of ['human_gates', 'kill_criteria', 'allowlist', 'denylist'] as const) {
    if (JSON.stringify(draft[k]) !== JSON.stringify(base[k])) patch[k] = draft[k]
  }
  return patch
}

// ── useLoops：/api/loops/snapshot 的读取与选中态托管（WorkbenchView 调用）──
export interface LoopsState {
  /** 当前 root 的 loop 行；null = 加载中/加载失败（loadError 区分）。 */
  rows: WbLoopRow[] | null
  loadError: string | null
  selected: WbLoopRow | null
  select: (id: string) => void
  reload: () => void
}

export function useLoops(root: string): LoopsState {
  const { t } = useT()
  const [rows, setRows] = useState<WbLoopRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // 换 root：立刻清行——上一项目的 loop 不能在新项目语境下多渲染一拍。
  useEffect(() => {
    setRows(null)
    setSelectedId(null)
    setLoadError(null)
  }, [root])

  useEffect(() => {
    let cancelled = false
    fetchLoopsSnapshot()
      .then((snap) => {
        if (cancelled) return
        const mine = snap.rows.filter((r) => r.root === root)
        setRows(mine)
        setLoadError(null)
        setSelectedId((cur) => (cur !== null && mine.some((r) => r.id === cur) ? cur : mine[0]?.id ?? null))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // 加载失败不挡工作台其余区块：卡内行内报错、摘要行回落 '—'。
        setLoadError(t('workbench.lp_load_error', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
      })
    return () => {
      cancelled = true
    }
  }, [root, tick, t])

  return {
    rows,
    loadError,
    selected: rows?.find((r) => r.id === selectedId) ?? null,
    select: setSelectedId,
    reload: () => setTick((n) => n + 1),
  }
}

// ── 滑杆刻度（demo 口径：推荐值 = 2h / 24 / 1 / 100k / skip）──
/** 节奏离散档（demo CADS 原样）；推荐 2h = 下标 4。 */
const CADS = ['5m', '15m', '30m', '1h', '2h', '6h', '1d'] as const
const RECO_CAD_IDX = 4
const RECO_RUNS = 24
const RECO_INFLIGHT = 1
/** token 滑杆以 k 为单位（10k-500k，步进 10k）；推荐 100k。 */
const RECO_TOKENS_K = 100

function cadenceMinutes(c: string): number {
  const m = c.match(/^(\d+)(m|h|d)$/)
  if (!m) return Number.NaN
  const n = Number(m[1])
  return m[2] === 'm' ? n : m[2] === 'h' ? n * 60 : n * 1440
}

/** 现值 → 离散档位下标：精确命中优先；解析得出分钟数取最近档；解析不了回落推荐档（显示仍是原值）。 */
function cadenceIndex(c: string): number {
  const exact = (CADS as readonly string[]).indexOf(c)
  if (exact !== -1) return exact
  const mins = cadenceMinutes(c)
  if (Number.isNaN(mins)) return RECO_CAD_IDX
  let best = 0
  for (let i = 1; i < CADS.length; i++) {
    if (Math.abs(cadenceMinutes(CADS[i]!) - mins) < Math.abs(cadenceMinutes(CADS[best]!) - mins)) best = i
  }
  return best
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** 推荐三角刻度的水平位置（demo 同款 calc：thumb 半宽 8px 内缩）。 */
function recoLeft(frac: number): string {
  return `calc(8px + (100% - 16px) * ${frac.toFixed(4)})`
}

interface SliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  display: string
  recoLabel: string
  /** 推荐刻度位置：'edge' = 贴左缘（在跑上限的推荐 1 落在最小值）。 */
  recoFrac: number | 'edge'
  onValue: (v: number) => void
}

/**
 * 单条滑杆（轨道 fill-2 / 填充 accent 经 --p 渐变，推荐 ▽ 刻度）——demo .lp-sld 对位。
 * T21 起导出：「AFK 执行」卡（AutomationCard）复用同一滑杆组件与 lp-slider 样式纪律。
 */
export function LpSlider({ id, label, value, min, max, display, recoLabel, recoFrac, onValue }: SliderProps): JSX.Element {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="lp-sld">
      <div className="lp-sld-top">
        <label className="wb-flabel" htmlFor={id}>{label}</label>
        <span className="lp-sld-val lp-mono" data-testid={`${id}-val`}>{display}</span>
      </div>
      <input
        type="range"
        className="lp-range"
        id={id}
        data-testid={id}
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        style={{ '--p': `${pct}%` } as CSSProperties}
        onChange={(e) => onValue(Number(e.target.value))}
      />
      <div className="lp-sld-marks" aria-hidden="true">
        <span
          className={`lp-sld-reco${recoFrac === 'edge' ? ' lp-sld-reco--edge' : ''}`}
          style={recoFrac === 'edge' ? { left: '2px' } : { left: recoLeft(recoFrac) }}
        >
          {recoLabel}
        </span>
      </div>
    </div>
  )
}

// ── chips 行（human_gates / kill_criteria / allowlist / denylist 共用）──
/** 终止条件已知 id 的人话副标（demo lp-chip-d）；未知 id 无副标。 */
const KILL_DESC_KEYS: Record<string, string> = {
  'no-change-3': 'workbench.lp_kd_no_change_3',
  'budget-burn-2d': 'workbench.lp_kd_budget_burn_2d',
}

interface ChipRowProps {
  label: string
  values: string[]
  addAria: string
  /** 值 → 人话副标 i18n key（仅终止条件行提供）。 */
  descKeys?: Record<string, string>
  onChange: (next: string[]) => void
}

function LpChipRow({ label, values, addAria, descKeys, onChange }: ChipRowProps): JSX.Element {
  const { t } = useT()
  // 「+ 添加」就地输入态（StepEditor commitAdd 同款：Enter 提交 / Esc 取消 / 失焦有值即提交）。
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function commit(cancel: boolean): void {
    const v = draft.trim()
    if (!cancel && v !== '' && !values.includes(v)) onChange([...values, v])
    setAdding(false)
    setDraft('')
  }

  return (
    <div className="lp-saferow">
      <span className="wb-flabel">{label}</span>
      <div className="wb-chips">
        {values.map((v) => (
          <span key={v} className="wb-chip">
            {v}
            {descKeys?.[v] && <span className="lp-chip-d">{t(descKeys[v]!)}</span>}
            <button type="button" className="wb-x" aria-label={t('workbench.lp_chip_remove', { v })} onClick={() => onChange(values.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            className="wb-input wb-chip-in"
            aria-label={addAria}
            value={draft}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- 用户刚点了「+ 添加」，焦点进输入框是这次点击的直接延续
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit(false)
              } else if (e.key === 'Escape') {
                commit(true)
              }
            }}
            onBlur={() => commit(false)}
          />
        ) : (
          <button type="button" className="wb-addchip" aria-label={addAria} onClick={() => setAdding(true)}>
            {t('workbench.lp_chip_add')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── 主卡 ──
const LEVELS = ['L1', 'L2', 'L3'] as const

/** 无 loop 空态的最小登记示例（YAML 是代码不进 i18n；与 kernel LOOPS_SCHEMA 必填面一致）。 */
const EMPTY_EXAMPLE = `version: 1
loops:
  - id: restyle-loop
    name: 样式迁移
    kind: executor
    goal: 把旧版卡片样式逐个迁移到新设计
    cadence: 2h
    risk: low
    runner: claude-code
    change_prefix: rl-
    phases: [build, verify]
    human_gates: [合并前]
    state: .superpowers/loops/progress.md
    design_doc: docs/restyle.md
    status: active
    budget:
      max_runs_per_day: 24
      max_in_flight: 1
      on_exceed: skip
    kill_criteria: [no-change-3]`

export interface LoopCardProps {
  root: string
  loops: LoopsState
}

export function LoopCard({ root, loops }: LoopCardProps): JSX.Element {
  const { t } = useT()
  const row = loops.selected
  const [draft, setDraft] = useState<LoopDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[] | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [levelError, setLevelError] = useState<string | null>(null)
  const [levelBusy, setLevelBusy] = useState(false)
  const [confirmLevel, setConfirmLevel] = useState<string | null>(null)

  // row 对象换新（首载/切 loop/保存后 reload）→ 草稿重置为 server 真值（rows 数组整体替换，
  // find 出的行引用随之变化——不会在编辑中途被无关渲染重置）。
  useEffect(() => {
    setDraft(row ? draftOf(row) : null)
    setSaveErrors(null)
    setLevelError(null)
  }, [row])

  const base = row ? draftOf(row) : null
  const patch = draft && base ? computePatch(draft, base) : {}
  const dirty = Object.keys(patch).length > 0

  function edit(part: Partial<LoopDraft>): void {
    setDraft((prev) => (prev ? { ...prev, ...part } : prev))
    setSaveOk(false)
  }

  async function save(): Promise<void> {
    if (!row || !dirty || saving) return
    setSaving(true)
    setSaveErrors(null)
    setSaveOk(false)
    try {
      await postLoopUpdate({ root, id: row.id, patch })
      setSaveOk(true)
      loops.reload() // 新行到达后草稿以 server 真值重置（见上方 effect）
    } catch (err) {
      // server 的 error/errors 原文（schema 校验/CAS 拒绝等），不翻译不吞并
      setSaveErrors([(err instanceof Error ? err.message : t('workbench.lp_network_error'))])
    } finally {
      setSaving(false)
    }
  }

  function requestLevel(target: string): void {
    if (!row || levelBusy || target === row.autonomy_level) return
    // 风险不对称（LoopsPanel Task 13 纪律）：升档过确认 Dialog，降档直发。
    if (LEVELS.indexOf(target as typeof LEVELS[number]) > LEVELS.indexOf(row.autonomy_level)) {
      setConfirmLevel(target)
    } else {
      void applyLevel(target)
    }
  }

  async function applyLevel(target: string): Promise<void> {
    if (!row) return
    setLevelBusy(true)
    setLevelError(null)
    try {
      await postLoopLevel({ root, id: row.id, target })
      loops.reload()
    } catch (err) {
      // 升档条件不满足时 server 的 plan.reason/blockers 原文展示（任务书要求）
      setLevelError(t('workbench.lp_level_fail', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
    } finally {
      setLevelBusy(false)
    }
  }

  // ── 加载/错误/空态三分支 ──
  if (loops.loadError) {
    return (
      <section className="card wb-loop" data-testid="wb-loop-card">
        <div className="wb-editor-head lp-head"><b>{t('workbench.lp_title')}</b></div>
        <p className="view__note view__note--error" data-testid="lp-load-error">{loops.loadError}</p>
      </section>
    )
  }
  if (loops.rows === null) {
    return (
      <section className="card wb-loop" data-testid="wb-loop-card">
        <div className="wb-editor-head lp-head"><b>{t('workbench.lp_title')}</b></div>
        <p className="view__note">{t('common.loading')}</p>
      </section>
    )
  }
  if (!row || !draft) {
    // 无 loop 的 root：空态教学（loops.yaml 最小登记示例）——不渲染任何控件，不谎报可配。
    return (
      <section className="card wb-loop" data-testid="wb-loop-card">
        <div className="wb-editor-head lp-head"><b>{t('workbench.lp_title')}</b></div>
        <div className="lp-empty" data-testid="lp-empty">
          <p className="lp-empty-t">{t('workbench.lp_empty_title')}</p>
          <p className="wb-note">{t('workbench.lp_empty_body')}</p>
          <pre className="lp-empty-yaml">{EMPTY_EXAMPLE}</pre>
        </div>
      </section>
    )
  }

  const active = draft.status === 'active'
  const tokensK = draft.max_tokens_per_day === null ? RECO_TOKENS_K : clamp(Math.round(draft.max_tokens_per_day / 10000) * 10, 10, 500)

  return (
    <section className="card wb-loop" data-testid="wb-loop-card">
      <div className="wb-editor-head lp-head">
        <b>{t('workbench.lp_title')}</b>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={active}
          aria-label={t('workbench.lp_enable')}
          data-testid="lp-enable"
          onClick={() => edit({ status: active ? 'paused' : 'active' })}
        />
        <span className={`badge ${active ? 'badge--run' : 'badge--pending'}`} data-testid="lp-pill">
          {t(active ? 'workbench.lp_running' : 'workbench.lp_paused')}
        </span>
        {loops.rows.length > 1 && (
          <select
            className="wb-input lp-loopsel"
            aria-label={t('workbench.lp_loop_select')}
            data-testid="lp-loop-select"
            value={row.id}
            // 切 loop 会以新行真值重置草稿——dirty 时禁切（轻量守卫，不另起确认弹窗）
            disabled={dirty}
            title={dirty ? t('workbench.lp_select_dirty') : undefined}
            onChange={(e) => loops.select(e.target.value)}
          >
            {loops.rows.map((r) => (
              <option key={r.id} value={r.id}>{r.id}</option>
            ))}
          </select>
        )}
        <span className="wb-spacer" />
        {dirty && <span className="wb-status wb-status--dirty" data-testid="lp-dirty">{t('workbench.lp_dirty')}</span>}
        {saveOk && !dirty && <span className="wb-status wb-status--ok" data-testid="lp-save-ok">{t('workbench.lp_save_ok')}</span>}
        <button className="btn" data-testid="lp-save" onClick={() => void save()} disabled={!dirty || saving}>
          {t('workbench.lp_save')}
        </button>
        <span className="lp-head-sub">{t('workbench.lp_head_sub')}</span>
      </div>

      {saveErrors && (
        <ul className="wb-save-errors lp-errors" data-testid="lp-save-errors">
          {saveErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {/* ── 目标 ── */}
      <div className="wb-ed-sec">
        <div className="wb-ed-sec-h">
          {t('workbench.lp_sec_goal')}
          <span className="hint">{t('workbench.lp_sec_goal_hint')}</span>
        </div>
        <label className="wb-flabel" htmlFor="lp-goal">{t('workbench.lp_goal')}</label>
        <input
          className="wb-input"
          id="lp-goal"
          data-testid="lp-goal"
          value={draft.goal}
          onChange={(e) => edit({ goal: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault() // Enter 守卫：保存只走卡头保存钮
          }}
        />
        <div className="lp-row3">
          <div>
            <label className="wb-flabel" htmlFor="lp-doc">{t('workbench.lp_doc')}</label>
            <input
              className="wb-input lp-mono"
              id="lp-doc"
              data-testid="lp-doc"
              value={draft.design_doc}
              onChange={(e) => edit({ design_doc: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
          </div>
          <div>
            <label className="wb-flabel" htmlFor="lp-prefix">{t('workbench.lp_prefix')}</label>
            <input
              className="wb-input lp-mono"
              id="lp-prefix"
              data-testid="lp-prefix"
              value={draft.change_prefix}
              onChange={(e) => edit({ change_prefix: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
            <p className="lp-eg">
              {t('workbench.lp_prefix_eg')}
              <b className="lp-mono" data-testid="lp-prefix-eg">{`${draft.change_prefix}0142-migrate-card`}</b>
            </p>
          </div>
          <div>
            <label className="wb-flabel" htmlFor="lp-risk">{t('workbench.lp_risk')}</label>
            <select className="wb-input" id="lp-risk" data-testid="lp-risk" value={draft.risk} onChange={(e) => edit({ risk: e.target.value })}>
              <option value="low">{t('workbench.lp_risk_low')}</option>
              <option value="medium">{t('workbench.lp_risk_medium')}</option>
              <option value="high">{t('workbench.lp_risk_high')}</option>
            </select>
          </div>
          {/* T17 决议#14：runner 下拉（LOOP_RUNNERS 双选项）——数据面 T20 已交付
              （PATCHABLE_SCALAR_FIELDS 含 runner），写回走同一 dirty→保存钮 patch 链路。
              runner id 是代码标识符（mono 呈现，不翻译）；历史自由字符串真值补渲染为第三选项。 */}
          <div>
            <label className="wb-flabel" htmlFor="lp-runner">{t('workbench.lp_runner')}</label>
            <select
              className="wb-input lp-mono"
              id="lp-runner"
              data-testid="lp-runner"
              value={draft.runner}
              onChange={(e) => edit({ runner: e.target.value })}
            >
              {!(LOOP_RUNNERS as readonly string[]).includes(draft.runner) && (
                <option value={draft.runner}>{draft.runner}</option>
              )}
              {LOOP_RUNNERS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 节奏与预算（四滑杆 + 超限策略 pill）── */}
      <div className="wb-ed-sec">
        <div className="wb-ed-sec-h">
          {t('workbench.lp_sec_budget')}
          <span className="hint">{t('workbench.lp_sec_budget_hint')}</span>
        </div>
        <div className="lp-slds">
          <LpSlider
            id="lp-sld-cadence"
            label={t('workbench.lp_sld_cadence')}
            value={cadenceIndex(draft.cadence)}
            min={0}
            max={CADS.length - 1}
            display={draft.cadence}
            recoLabel={t('workbench.lp_reco', { v: CADS[RECO_CAD_IDX]! })}
            recoFrac={RECO_CAD_IDX / (CADS.length - 1)}
            onValue={(v) => edit({ cadence: CADS[v]! })}
          />
          <LpSlider
            id="lp-sld-runs"
            label={t('workbench.lp_sld_runs')}
            value={clamp(draft.max_runs_per_day, 1, 100)}
            min={1}
            max={100}
            display={t('workbench.lp_val_runs', { n: draft.max_runs_per_day })}
            recoLabel={t('workbench.lp_reco', { v: RECO_RUNS })}
            recoFrac={(RECO_RUNS - 1) / 99}
            onValue={(v) => edit({ max_runs_per_day: v })}
          />
          <div>
            <LpSlider
              id="lp-sld-inflight"
              label={t('workbench.lp_sld_inflight')}
              value={clamp(draft.max_in_flight, 1, 4)}
              min={1}
              max={4}
              display={t('workbench.lp_val_inflight', { n: draft.max_in_flight })}
              recoLabel={t('workbench.lp_reco', { v: RECO_INFLIGHT })}
              recoFrac="edge"
              onValue={(v) => edit({ max_in_flight: v })}
            />
            {/* 验收反馈②-④：讲清楚这个上限只管本 loop 的自动化通道，且是软上限 */}
            <p className="wb-note lp-sld-note">{t('workbench.lp_sld_inflight_note')}</p>
          </div>
          <LpSlider
            id="lp-sld-tokens"
            label={t('workbench.lp_sld_tokens')}
            value={tokensK}
            min={10}
            max={500}
            display={draft.max_tokens_per_day === null ? t('workbench.lp_tokens_unset') : `${Math.round(draft.max_tokens_per_day / 1000)}k`}
            recoLabel={t('workbench.lp_reco', { v: `${RECO_TOKENS_K}k` })}
            recoFrac={(RECO_TOKENS_K - 10) / 490}
            onValue={(v) => edit({ max_tokens_per_day: Math.round(v / 10) * 10 * 1000 })}
          />
        </div>
        <div className="lp-policy">
          <span className="wb-flabel">{t('workbench.lp_policy')}</span>
          <div className="lp-pills" role="radiogroup" aria-label={t('workbench.lp_policy')}>
            {(['skip', 'pause'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`lp-opt${draft.on_exceed === p ? ' on' : ''}`}
                role="radio"
                aria-checked={draft.on_exceed === p}
                data-testid={`lp-exceed-${p}`}
                onClick={() => edit({ on_exceed: p })}
              >
                {t(p === 'skip' ? 'workbench.lp_policy_skip' : 'workbench.lp_policy_pause')}
              </button>
            ))}
          </div>
          <span className="wb-note">{t('workbench.lp_policy_note')}</span>
        </div>
      </div>

      {/* ── 自主与安全 ── */}
      <div className="wb-ed-sec">
        <div className="wb-ed-sec-h">
          {t('workbench.lp_sec_auto')}
          <span className="hint">{t('workbench.lp_sec_auto_hint')}</span>
        </div>
        <span className="wb-flabel">{t('workbench.lp_level')}</span>
        <div className="lp-lv" role="radiogroup" aria-label={t('workbench.lp_level')}>
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              className={`lp-lv-tile${row.autonomy_level === lv ? ' on' : ''}`}
              role="radio"
              aria-checked={row.autonomy_level === lv}
              data-testid={`lp-lv-${lv}`}
              disabled={levelBusy}
              onClick={() => requestLevel(lv)}
            >
              <span className="lp-lv-k">{t(`workbench.lp_lv${lv.slice(1)}_k`)}</span>
              <span className="lp-lv-d">{t(`workbench.lp_lv${lv.slice(1)}_d`)}</span>
            </button>
          ))}
        </div>
        {levelError && <p className="loop-reject lp-level-err" data-testid="lp-level-error">⛔ {levelError}</p>}

        <LpChipRow
          label={t('workbench.lp_gates')}
          values={draft.human_gates}
          addAria={t('workbench.lp_add_gate_aria')}
          onChange={(next) => edit({ human_gates: next })}
        />
        <LpChipRow
          label={t('workbench.lp_kill')}
          values={draft.kill_criteria}
          addAria={t('workbench.lp_add_kill_aria')}
          descKeys={KILL_DESC_KEYS}
          onChange={(next) => edit({ kill_criteria: next })}
        />
        <LpChipRow
          label={t('workbench.lp_allow')}
          values={draft.allowlist}
          addAria={t('workbench.lp_add_allow_aria')}
          onChange={(next) => edit({ allowlist: next })}
        />
        <LpChipRow
          label={t('workbench.lp_deny')}
          values={draft.denylist}
          addAria={t('workbench.lp_add_deny_aria')}
          onChange={(next) => edit({ denylist: next })}
        />
      </div>

      {/* 升档确认（沿 LoopsPanel 既有升档 Dialog 的文案键——同一决策同一话术） */}
      {confirmLevel !== null && (
        <Dialog
          title={t('loops.promote_confirm_title', { level: confirmLevel })}
          onClose={() => setConfirmLevel(null)}
          testid="lp-promote-confirm"
          actions={
            <>
              <button type="button" className="btn btn--ghost" data-testid="lp-promote-cancel" onClick={() => setConfirmLevel(null)}>
                {t('loops.promote_confirm_no')}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="lp-promote-submit"
                onClick={() => {
                  // 乐观关闭再真 POST（LoopsPanel confirmPromoteNow 的既有先例）
                  const target = confirmLevel
                  setConfirmLevel(null)
                  void applyLevel(target)
                }}
              >
                {t('loops.promote_confirm_yes')}
              </button>
            </>
          }
        >
          <p className="dialog__desc">
            {t('loops.promote_confirm_desc', {
              band: row.readiness.band,
              budget: row.budget.hasBudget
                ? t('loops.budget_summary', { spent: row.budget.spentToday, max: row.budget.maxTokensPerDay ?? 0, remaining: row.budget.remaining ?? 0 })
                : t('loops.no_budget'),
              level: confirmLevel,
            })}
          </p>
        </Dialog>
      )}
    </section>
  )
}
