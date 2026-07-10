import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { getToken } from '../api/client'
import { useT } from '../i18n'
import { DEFAULT_RULES, invalidateWorkflowRules, rulesKey, useWorkflowRulesMulti } from '../model/workflowModel'
import { Dialog } from '../shell/Dialog'
import { EVENT_BY_EDGE, PHASES, REVIEW_PHASES, TRANSITIONS, isPhase } from '../types'
import { revealDialog, revealList } from '../workflow/motion'
import { HookTimeline, useHooksConfig } from './HookTimeline'
import { StepEditor } from './StepEditor'
import { StepperRail, type StepperStep } from './StepperRail'

gsap.registerPlugin(useGSAP)

/**
 * WorkbenchView（T12，计划 2026-07-11-v5-interaction-rebuild）—— 工作台骨架：
 * workflow 下拉切换 + 线性 stepper 阶段卡（StepperRail）+ 右栏摘要卡/流程预览/GSAP 预演。
 * 交互真相源 design-demos/v5-progress-workbench.html workbench 段（六轮验收定稿）；
 * 视觉 token 沿 v4 不变（styles.ts wb- 区块）。
 *
 * React 重写纪律（决议 #1 前置）：不搬 @xyflow 概念——layout.ts/画布坐标全不复用；数据读写走
 * 既有 GET /api/workflows(+/:name) 与 model/workflowModel（下拉菜单的阶段计数经
 * useWorkflowRulesMulti 按 rulesKey(root,name) 索引，不自己拼缓存键）。
 *
 * 骨架范围（后续任务挂载点，见 JSX 内注释）：
 *   · 阶段编辑区 = T13（已挂载 <StepEditor>：基本/产出物/guards 中文化，Inputs UI 按决议不渲染）；
 *     技能链 T14 / Hook 时序线 T15 继续在 StepEditor 内分区挂载；
 *   · 「+ 添加阶段」按钮仍禁用态占位（阶段增删不在 T13 范围）；
 *   · 摘要卡「钩子」行 '—' 占位（T5 数据面 + T15 接线后出真数）；
 *   · 「自动运行(Loop)」卡 = T16。
 * 过渡期与旧 WorkflowEditorView 并存（不挂导航，T17 切换、T18 退役旧视图）。
 *
 * T13 编辑真写回：def 本身就是编辑草稿（StepEditor 每次编辑交回完整 step，这里按 id 换入）；
 * 脏守卫沿 WorkflowCanvas Task 15 四件套先例——快照存 ref（defSnapshotRef，load/save 成功时
 * 写入一次）、dirty 每次渲染由「当前 def vs 快照」重算（故意不 useMemo，ref 变化对记忆化不可
 * 见）、守卫函数不 useCallback（会冻结 dirty 快照）、保存成功推进快照即清脏。保存走既有
 * POST /api/workflows/:name，成功后 invalidateWorkflowRules(root,name)（spec §2.1 缓存失效
 * 纪律）；kernel validate 拒绝时 errors[] 原文逐条上抛展示。default = manifest 镜像只读态
 * （server 端 400 已挡，前端 readonly + 只读 pill 预示，不渲染保存钮）。
 */

// ── kernel WorkflowDef 的 JSON 形状（跨 HTTP 边界手抄，同 StepDetailPanel.tsx 惯例；
//    该文件 T18 退役后本处即唯一真相源，T13-T16 从这里 import）──
export interface WbFieldRef { field: string; type: 'string' | 'file_path' | 'boolean' }
export interface WbSkillRef { id: string; depends_on?: string[] }
export type WbGuardConfig = { type: 'tasks-at-least'; n: number } | { type: 'nonempty-output' }
export interface WbStepDef {
  id: string
  label: string
  gate: 'review' | 'confirm' | null
  skills: WbSkillRef[]
  inputs: WbFieldRef[]
  outputs: WbFieldRef[]
  guards: WbGuardConfig[]
  transitions: { event: string; to: string }[]
}
export interface WbWorkflowDef { name: string; steps: WbStepDef[] }

/**
 * 'default' workflow 的本地投影（零网络，同 workflowModel.buildDefaultRules 的构造思路，
 * 但保留 StepDef 全形状供 stepper/摘要消费）：runtime 不落盘 default 定义文件，server 的
 * GET /api/workflows 列表也不含它，所以从 types.ts 的 manifest 镜像常量合成。
 * skills/outputs 为空——default 的强制技能来自 manifest 矩阵，不在 workflow 定义里（T14 语境）。
 */
function buildDefaultDef(): WbWorkflowDef {
  return {
    name: 'default',
    steps: PHASES.map((p) => ({
      id: p,
      label: '',
      gate: (REVIEW_PHASES as readonly string[]).includes(p) ? ('review' as const) : null,
      skills: [],
      inputs: [],
      outputs: [],
      guards: [],
      transitions: TRANSITIONS[p]
        .filter((to) => to !== p) // archive→archive 自环不是可操作出边
        .map((to) => ({ event: EVENT_BY_EDGE[`${p}->${to}`]!, to })),
    })),
  }
}
const DEFAULT_DEF: WbWorkflowDef = buildDefaultDef()

interface ErrorBody { error?: string }

/** 非 2xx 响应尽量读出 server 的 { error } 文案（同 WorkflowEditorView.tsx 的既有模式）。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

/**
 * 保存端点的非 2xx 错误映射（T13）：POST /api/workflows/:name 有两种失败体——
 * kernel validate 拒绝 = { ok:false, errors: string[] }（循环依赖/非法字符等，逐条原文上抛），
 * name/root 守卫 = { ok:false, error: string }（单条）。都读不出来时回落状态码占位。
 */
async function readSaveErrors(res: Response): Promise<string[]> {
  try {
    const body = (await res.json()) as { error?: unknown; errors?: unknown }
    if (Array.isArray(body?.errors)) {
      const errors = body.errors.filter((e): e is string => typeof e === 'string')
      if (errors.length > 0) return errors
    }
    if (typeof body?.error === 'string') return [body.error]
  } catch {
    /* 无 JSON 体 */
  }
  return [`(${res.status})`]
}

export interface WorkbenchViewProps {
  root: string
}

export function WorkbenchView({ root }: WorkbenchViewProps): JSX.Element {
  const { t } = useT()
  const [names, setNames] = useState<string[] | null>(null)
  const [namesError, setNamesError] = useState<string | null>(null)
  const [wfName, setWfName] = useState<string | null>(null)
  const [def, setDef] = useState<WbWorkflowDef | null>(null)
  const [defError, setDefError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [stageId, setStageId] = useState<string | null>(null)
  // T13 保存状态：error 时 errors[] 是 server/kernel validate 的原文（不翻译、不吞并）。
  const [saveStatus, setSaveStatus] = useState<{ kind: 'idle' | 'ok' } | { kind: 'error'; errors: string[] }>({ kind: 'idle' })
  const [saving, setSaving] = useState(false)
  // T13 脏守卫：dirty 时点了菜单里的另一个 workflow 名 → 先存这里弹确认，确认才真切。
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null)
  // 预演点亮数：前 lit 个预览节点/阶段卡处于点亮态（最后一个绿）。
  const [lit, setLit] = useState(0)
  const [playing, setPlaying] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<gsap.MatchMedia | null>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  // T13 脏状态四件套之一（WorkflowCanvas Task 15 先例）：「最近一次加载/保存成功」的 def 快照
  // 存 ref 不进 state——快照只在 load/save 成功那一刻写入，本身不需要触发渲染；dirty 每次渲染
  // 从「当前 def vs 快照」重算（见下方声明处注释：故意不 useMemo，ref 变化对记忆化不可见）。
  const defSnapshotRef = useRef<string | null>(null)
  // T15：/api/hooks 读写状态托管在这里（不在 HookTimeline 内）——阶段卡 hooksCount 真数、
  // 摘要卡「钩子」行、时序线开关三个消费方吃同一份矩阵。per-root 配置，与 workflow 草稿无关。
  const hooksConfig = useHooksConfig(root)

  // ── workflow 名列表（自定义名；default 恒在菜单尾部本地补上）──
  useEffect(() => {
    let cancelled = false
    fetch(`/api/workflows?root=${encodeURIComponent(root)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<{ names: string[] }>
      })
      .then((body) => {
        if (cancelled) return
        setNames(body.names)
        setNamesError(null)
        setWfName((cur) => cur ?? body.names[0] ?? 'default')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // 列表失败不挡工作台：default 仍可编排预览，错误行内呈现。
        setNames([])
        setNamesError(t('workbench.names_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') }))
        setWfName((cur) => cur ?? 'default')
      })
    return () => {
      cancelled = true
    }
  }, [root, t])

  // ── 选中 workflow 的完整定义（default 零网络投影；自定义名走既有端点）──
  useEffect(() => {
    if (!wfName) return
    setSaveStatus({ kind: 'idle' }) // 上一个 workflow 的保存态不跨名残留
    if (wfName === 'default') {
      setDef(DEFAULT_DEF)
      setDefError(null)
      defSnapshotRef.current = null // default 只读态：永不参与 dirty 判定
      return
    }
    let cancelled = false
    setDef(null)
    setDefError(null)
    defSnapshotRef.current = null
    fetch(`/api/workflows/${encodeURIComponent(wfName)}?root=${encodeURIComponent(root)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<WbWorkflowDef>
      })
      .then((body) => {
        if (cancelled) return
        setDef(body)
        setDefError(null)
        defSnapshotRef.current = JSON.stringify(body)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDefError(t('workbench.def_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') }))
      })
    return () => {
      cancelled = true
    }
  }, [root, wfName, t])

  // def 就绪/切换后：选中阶段若已不存在则回落第一阶段。
  useEffect(() => {
    if (!def) return
    setStageId((cur) => (cur && def.steps.some((s) => s.id === cur) ? cur : def.steps[0]?.id ?? null))
  }, [def])

  // ── T13 编辑真写回 ──
  const readonlyWf = wfName === 'default'
  // 脏状态四件套之二：每次渲染重算，不做 useMemo（save() 成功只更新 defSnapshotRef 这个 ref、
  // 不换 def 引用，[def] 依赖的记忆化会继续供 save 之前缓存的 true——WorkflowCanvas Task 15
  // 声明处注释的同一条 React 记忆化限制）。JSON.stringify 在编辑器量级的 def 上开销可忽略。
  const dirty = !readonlyWf && def !== null && defSnapshotRef.current !== null && JSON.stringify(def) !== defSnapshotRef.current

  // StepEditor 的写回口：按 id 换入编辑后的完整 step（def 是唯一草稿真相源，
  // stepper/摘要/流程预览全部由它派生，编辑即联动）。
  function updateStep(updated: WbStepDef): void {
    setDef((prev) => (prev ? { ...prev, steps: prev.steps.map((s) => (s.id === updated.id ? updated : s)) } : prev))
  }

  async function save(): Promise<void> {
    if (!def || !wfName || readonlyWf || !dirty || saving) return
    setSaving(true)
    setSaveStatus({ kind: 'idle' })
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(wfName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ...def, root }),
      })
      if (!res.ok) {
        setSaveStatus({ kind: 'error', errors: await readSaveErrors(res) })
        return
      }
      // spec §2.1：保存成功必须失效 (root,name) 规则缓存——收件箱/进度的下一个消费方才能
      // 看到新 gate/新阶段（WorkflowCanvas 评审 P0-4 的同一条纪律，接线不遗漏）。
      invalidateWorkflowRules(root, wfName)
      // 四件套之四：快照推进到「刚被 POST 的这份 def」（与请求体同源的闭包值），dirty 随
      // 下一次渲染重算自然清除。
      defSnapshotRef.current = JSON.stringify(def)
      setSaveStatus({ kind: 'ok' })
    } catch (err) {
      setSaveStatus({ kind: 'error', errors: [err instanceof Error ? err.message : t('workbench.network_error')] })
    } finally {
      setSaving(false)
    }
  }

  // 菜单项点击的切换入口。脏状态四件套之三：禁止 useCallback 包裹（冻结 dirty 快照——
  // BoardView/InboxView closePending 的 busy 冻结教训同款），每次渲染的新鲜闭包正是这里
  // 读到最新 dirty 的机制。
  function requestSwitch(name: string): void {
    setMenuOpen(false)
    if (name === wfName) return
    if (dirty) {
      setPendingSwitch(name)
    } else {
      setWfName(name)
    }
  }

  function confirmSwitch(): void {
    if (pendingSwitch !== null) setWfName(pendingSwitch)
    setPendingSwitch(null)
  }

  // ── 预演控制（GSAP）──
  const stopRehearsal = useCallback((resetLit: boolean) => {
    tlRef.current?.kill()
    tlRef.current = null
    mmRef.current?.revert() // revert 会顺带清掉 matchMedia context 里创建的补间残留（scale 等）
    mmRef.current = null
    setPlaying(false)
    if (resetLit) setLit(0)
  }, [])

  // 切换 workflow / 卸载时必须 kill 预演 timeline 并复位点亮态（T11 同款「循环动画随视图收敛」纪律）。
  useEffect(() => () => stopRehearsal(true), [wfName, stopRehearsal])

  function toggleRehearsal(): void {
    if (playing) {
      stopRehearsal(true) // 播放中再点 = 停止（demo 同款语义）
      return
    }
    if (!def || def.steps.length === 0) return
    stopRehearsal(true) // 清掉上一轮终态残留后重播
    const total = def.steps.length
    const gates = def.steps.map((s) => s.gate !== null)
    setPlaying(true)
    const mm = gsap.matchMedia()
    mmRef.current = mm
    let handled = false
    mm.add(
      { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
      (ctx) => {
        handled = true
        const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
        if (reduce) {
          // reduced-motion：不放动画，直达终态（节点全亮、末节点绿）。
          setLit(total)
          setPlaying(false)
          return
        }
        const track = trackRef.current
        const nodes = track ? Array.from(track.querySelectorAll<HTMLElement>('.wb-pv-node')) : []
        const dot = track?.querySelector<HTMLElement>('.wb-pv-dot') ?? null
        const tl = gsap.timeline({
          onComplete: () => {
            tlRef.current = null
            setPlaying(false)
          },
        })
        tlRef.current = tl
        const centers = nodes.map((n) => n.offsetLeft + n.offsetWidth / 2 - 4)
        nodes.forEach((node, i) => {
          tl.add(() => setLit(i + 1))
          tl.to(node, { keyframes: [{ scale: 1.06, duration: 0.18 }, { scale: 1, duration: 0.17 }], ease: 'power1.out' })
          if (gates[i]) tl.to({}, { duration: 0.6 }) // 复核门节点：停一拍，示意「这里等人」
          if (i < nodes.length - 1 && dot) {
            tl.set(dot, { x: centers[i], opacity: 1 })
            tl.to(dot, { x: centers[i + 1], duration: 0.5, ease: 'power1.inOut' })
          }
        })
        if (dot) tl.set(dot, { opacity: 0 })
      },
    )
    if (!handled) {
      // 环境不支持两个媒体条件任一（极老内核/无 matchMedia）：直达终态兜底，不卡在播放态。
      setLit(total)
      stopRehearsal(false)
    }
  }

  // ── stepper 入场（沿 motion.ts 既有词汇；reduced-motion 由 revealList 自身处理）──
  // T13 起 def 就是编辑草稿：依赖收敛为 def?.name（只在切换 workflow/首次载入时重播），
  // 依赖整个 def 会让每次击键都重播全排卡入场——装饰性噪音，不是真实状态变化
  //（WorkflowEditorView 列表入场依赖 Boolean(names) 的同一条既有纪律）。
  useGSAP(() => {
    if (def && def.steps.length > 0) revealList('.wb-step')
  }, { scope: rootRef, dependencies: [def?.name] })

  // T13：脏切换确认 Dialog 入场（共享 <Dialog> 不对外暴露内部节点，scope 选择器文本寻址——
  // WorkflowCanvas Task 15 返回确认弹窗的同款既有写法）。
  useGSAP(() => {
    if (pendingSwitch !== null) {
      revealDialog(
        '[data-testid="wb-switch-confirm"]',
        '[data-testid="wb-switch-confirm"] .dialog',
      )
    }
  }, { scope: rootRef, dependencies: [pendingSwitch] })

  // ── 投影层 ──
  const stepName = useCallback(
    (s: WbStepDef): string => s.label || (isPhase(s.id) ? t(`phases.${s.id}`) : s.id),
    [t],
  )

  // T15：某阶段的启用 hook 数（含强制常开——它们真的在跑）；数据面未就绪 → undefined，
  // 阶段卡隐藏该段、摘要回落 '—'（诚实占位纪律，同 T12 注释）。
  const { hooks: hookMetas, matrix: hookMatrix } = hooksConfig
  const hookCountOf = useCallback(
    (stageId: string): number | undefined =>
      hookMetas === null ? undefined : hookMetas.filter((h) => !(`${h.id}.${stageId}` in hookMatrix)).length,
    [hookMetas, hookMatrix],
  )

  const stepperSteps: StepperStep[] = useMemo(() => {
    if (!def) return []
    return def.steps.map((s, i) => {
      const next = def.steps[i + 1]
      const fwd = next ? s.transitions.find((tr) => tr.to === next.id) : undefined
      return {
        id: s.id,
        name: stepName(s),
        gate: s.gate,
        skills: [...new Set(s.skills.map((sk) => sk.id))],
        outputsCount: s.outputs.length,
        hooksCount: hookCountOf(s.id),
        linkEvent: fwd?.event ?? null,
      }
    })
  }, [def, stepName, hookCountOf])

  const summary = useMemo(() => {
    if (!def) return null
    const skillIds = new Set<string>()
    for (const s of def.steps) for (const sk of s.skills) skillIds.add(sk.id)
    return {
      stages: def.steps.length,
      gates: def.steps.filter((s) => s.gate !== null).length,
      skills: skillIds.size,
      // T15：钩子行是 workflow 级口径——「在本 workflow 全部阶段都启用」的 hook 数
      //（任一阶段被关即不计；阶段级差异看阶段卡上的真数）。数据面未就绪 → null 回落 '—'。
      hooks: hookMetas === null
        ? null
        : hookMetas.filter((h) => def.steps.every((s) => !(`${h.id}.${s.id}` in hookMatrix))).length,
    }
  }, [def, hookMetas, hookMatrix])

  // 下拉菜单的每名阶段计数：走 workflowModel 缓存（rulesKey 纪律），default 恒 DEFAULT_RULES。
  const { rules: rulesByKey } = useWorkflowRulesMulti(names && names.length > 0 ? [{ root, names }] : [])
  const menuNames = useMemo(() => [...(names ?? []), 'default'], [names])
  function stagesCountOf(name: string): number | null {
    if (name === 'default') return DEFAULT_RULES.steps.length
    return rulesByKey.get(rulesKey(root, name))?.steps.length ?? null
  }

  const selectedStep = def?.steps.find((s) => s.id === stageId) ?? null
  const currentStages = def?.steps.length ?? (wfName ? stagesCountOf(wfName) : null)
  const total = def?.steps.length ?? 0

  return (
    <section className="view workbench" data-testid="workbench-view" ref={rootRef}>
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('workbench.title')}</h1>
          <p className="view__subtitle">{t('workbench.subtitle')}</p>
        </div>
      </header>

      <div className="wb-toolbar">
        <div className="wb-wf">
          <button
            className="wb-wf-btn"
            data-testid="wb-wf-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="wb-wf-k">workflow</span>
            <span className="wb-wf-name">{wfName ?? '…'}</span>
            {currentStages != null && <span className="wb-wf-sub">{t('workbench.wf_stages', { n: currentStages })}</span>}
            <span className="wb-chev" aria-hidden="true">▾</span>
          </button>
          {menuOpen && (
            <div className="wb-wf-menu" role="menu" aria-label={t('workbench.wf_menu_label')}>
              {menuNames.map((n) => {
                const cnt = stagesCountOf(n)
                return (
                  <button
                    key={n}
                    className={`wb-wf-item${n === wfName ? ' on' : ''}`}
                    role="menuitem"
                    data-testid={`wb-wf-item-${n}`}
                    onClick={() => requestSwitch(n)}
                  >
                    <span>{n}</span>
                    {cnt != null && <span className="n">{t('workbench.wf_stages', { n: cnt })}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <span className="wb-spacer" />
        {/* T13：工具条右侧——default 只读 pill；自定义 workflow 的 未保存 chip / 保存态 / 保存钮。 */}
        {readonlyWf ? (
          <span className="wb-status wb-status--ro" data-testid="wb-ro-pill">{t('workbench.readonly_pill')}</span>
        ) : (
          <>
            {dirty && <span className="wb-status wb-status--dirty" data-testid="wb-dirty">{t('workbench.dirty_badge')}</span>}
            {saveStatus.kind === 'ok' && !dirty && (
              <span className="wb-status wb-status--ok" data-testid="wb-save-ok">{t('workbench.save_success')}</span>
            )}
            {saveStatus.kind === 'error' && (
              <span className="wb-status wb-status--error" data-testid="wb-save-error">{t('workbench.save_error_pill')}</span>
            )}
            {/* 非 dirty 保存钮 disabled（上轮 minor 收口项）：没有可保存的东西就不给可点的实底钮。 */}
            <button className="btn" data-testid="wb-save" onClick={save} disabled={!dirty || saving}>
              {t('workbench.save')}
            </button>
          </>
        )}
      </div>

      {/* kernel validate / server 拒绝的错误原文逐条展示（循环依赖、非法字符、未知 to 等）。 */}
      {saveStatus.kind === 'error' && (
        <ul className="wb-save-errors" data-testid="wb-save-errors">
          {saveStatus.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {namesError && <p className="view__note view__note--error">{namesError}</p>}
      {defError && <p className="view__note view__note--error">{defError}</p>}

      <div className="view-split">
        <div className="view-split__main">
          {def ? (
            <>
              <StepperRail
                steps={stepperSteps}
                selectedId={stageId}
                onSelect={setStageId}
                litCount={lit}
                label={t('workbench.rail_label', { name: def.name })}
              />
              {selectedStep && (
                <section className="card wb-editor" data-testid="wb-editor">
                  <div className="wb-editor-head">
                    <b>{t('workbench.editor_title')}</b>
                    <span className="g-phase" data-testid="wb-editor-stage">{selectedStep.id}</span>
                    {selectedStep.gate && (
                      <span className="badge badge--gate">
                        {selectedStep.gate === 'confirm' ? t('workbench.gate_badge_confirm') : t('workbench.gate_badge')}
                      </span>
                    )}
                    <span className="wb-ed-note">{t('workbench.editor_hint')}</span>
                  </div>
                  {/* T13：阶段编辑表单（T14 技能链 / T15 Hook 时序线在 StepEditor 内继续分区挂载）。
                      key 按 (workflow, step) 复合——切阶段/切 workflow 时「+ 添加」输入态随卸载复位。 */}
                  <StepEditor
                    key={`${def.name}:${selectedStep.id}`}
                    step={selectedStep}
                    workflow={def.name}
                    readonly={readonlyWf}
                    onChange={updateStep}
                    // T15：Hook 时序线 slot 注入——per-root 配置即时写回，不吃 readonly
                    //（default 只读锁的是 workflow def，不锁 hooks.json）。
                    hooksSlot={<HookTimeline phase={selectedStep.id} config={hooksConfig} />}
                  />
                </section>
              )}
              {/* T16 挂载点：「自动运行(Loop)」卡跟在阶段编辑卡之后 */}
            </>
          ) : (
            !defError && <p className="view__note">{t('common.loading')}</p>
          )}
        </div>

        <aside className="side-col">
          <div className="side-card">
            <div className="side-card__head"><b>{t('workbench.summary_title')}</b></div>
            <div className="side-card__body">
              <div className="side-card__row">
                <span className="side-card__row-label">{t('workbench.sum_stages')}</span>
                <span className="side-card__row-value" data-testid="wb-sum-stages">{summary?.stages ?? '—'}</span>
              </div>
              <div className="side-card__row">
                <span className="side-card__row-label">{t('workbench.sum_gates')}</span>
                <span className="side-card__row-value" data-testid="wb-sum-gates">{summary?.gates ?? '—'}</span>
              </div>
              <div className="side-card__row">
                <span className="side-card__row-label">{t('workbench.sum_skills')}</span>
                <span className="side-card__row-value" data-testid="wb-sum-skills">{summary?.skills ?? '—'}</span>
              </div>
              {/* T15：钩子行出真数——「全部阶段都启用」的 hook 数（口径见 summary 计算处注释）；
                  /api/hooks 加载中/失败仍回落 '—' 占位，不谎报数字。 */}
              <div className="side-card__row">
                <span className="side-card__row-label">{t('workbench.sum_hooks')}</span>
                <span className="side-card__row-value" data-testid="wb-sum-hooks">{summary?.hooks ?? '—'}</span>
              </div>
            </div>
          </div>

          <div className="side-card">
            <div className="side-card__head">
              <b>{t('workbench.preview_title')}</b>
              <span className="side-card__head-action wb-ed-note">{t('workbench.preview_note')}</span>
            </div>
            <div className="side-card__body">
              <div className="wb-pv-flow">
                <div className="wb-pv-track" ref={trackRef} data-testid="wb-pv-track">
                  {def?.steps.map((s, i) => (
                    <Fragment key={s.id}>
                      {i > 0 && (
                        <span
                          className={`wb-pv-line${i < lit ? ' lit' : ''}`}
                          data-testid={`wb-pv-line-${i - 1}`}
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`wb-pv-node${i < lit ? (i === total - 1 ? ' lit-g' : ' lit') : ''}`}
                        data-testid={`wb-pv-node-${s.id}`}
                      >
                        {stepName(s)}
                        {s.gate && <i className="wb-pv-gdot" data-testid={`wb-pv-gdot-${s.id}`} aria-hidden="true" />}
                      </span>
                    </Fragment>
                  ))}
                  <span className="wb-pv-dot" aria-hidden="true" />
                </div>
              </div>
              <button
                className="btn btn--ghost wb-play"
                data-testid="wb-play"
                onClick={toggleRehearsal}
                disabled={!def || def.steps.length === 0}
              >
                {playing ? t('workbench.stop') : t('workbench.play')}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* T13 脏守卫：切 workflow 前的未保存确认（经共享 Dialog——Esc/困笼/焦点归位一并到位）。 */}
      {pendingSwitch !== null && (
        <Dialog
          title={t('workbench.switch_confirm_title')}
          onClose={() => setPendingSwitch(null)}
          testid="wb-switch-confirm"
          actions={
            <>
              <button className="btn btn--ghost" onClick={() => setPendingSwitch(null)}>{t('workbench.switch_cancel')}</button>
              <button className="btn btn--danger" onClick={confirmSwitch}>{t('workbench.switch_discard')}</button>
            </>
          }
        >
          <p className="dialog__desc">{t('workbench.switch_confirm_body', { name: wfName ?? '' })}</p>
        </Dialog>
      )}
    </section>
  )
}
