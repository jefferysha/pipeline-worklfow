import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import { DEFAULT_RULES, rulesKey, useWorkflowRulesMulti } from '../model/workflowModel'
import { EVENT_BY_EDGE, PHASES, REVIEW_PHASES, TRANSITIONS, isPhase } from '../types'
import { revealList } from '../workflow/motion'
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
 *   · 阶段编辑区 = T13（本任务只渲染占位卡 + 选中联动）；技能链 T14 / Hook 时序线 T15 挂其内；
 *   · 「+ 添加阶段」按钮禁用态占位（T13 接线 onAddStage）；
 *   · 摘要卡「钩子」行 '—' 占位（T5 数据面 + T15 接线后出真数）；
 *   · 「自动运行(Loop)」卡 = T16；保存/校验工具条 = T13。
 * 过渡期与旧 WorkflowEditorView 并存（不挂导航，T17 切换、T18 退役旧视图）。
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
  // 预演点亮数：前 lit 个预览节点/阶段卡处于点亮态（最后一个绿）。
  const [lit, setLit] = useState(0)
  const [playing, setPlaying] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<gsap.MatchMedia | null>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)

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
    if (wfName === 'default') {
      setDef(DEFAULT_DEF)
      setDefError(null)
      return
    }
    let cancelled = false
    setDef(null)
    setDefError(null)
    fetch(`/api/workflows/${encodeURIComponent(wfName)}?root=${encodeURIComponent(root)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<WbWorkflowDef>
      })
      .then((body) => {
        if (cancelled) return
        setDef(body)
        setDefError(null)
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
  useGSAP(() => {
    if (def && def.steps.length > 0) revealList('.wb-step')
  }, { scope: rootRef, dependencies: [def] })

  // ── 投影层 ──
  const stepName = useCallback(
    (s: WbStepDef): string => s.label || (isPhase(s.id) ? t(`phases.${s.id}`) : s.id),
    [t],
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
        linkEvent: fwd?.event ?? null,
      }
    })
  }, [def, stepName])

  const summary = useMemo(() => {
    if (!def) return null
    const skillIds = new Set<string>()
    for (const s of def.steps) for (const sk of s.skills) skillIds.add(sk.id)
    return {
      stages: def.steps.length,
      gates: def.steps.filter((s) => s.gate !== null).length,
      skills: skillIds.size,
    }
  }, [def])

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
                    onClick={() => {
                      setWfName(n)
                      setMenuOpen(false)
                    }}
                  >
                    <span>{n}</span>
                    {cnt != null && <span className="n">{t('workbench.wf_stages', { n: cnt })}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {/* T13 挂载点：校验状态 pill + 保存按钮（脏计数）落在这条工具条右侧 */}
      </div>

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
                <section className="card wb-editor" data-testid="wb-editor-placeholder">
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
                  {/* T13 挂载点：<StepEditor step={selectedStep} …/>（基本信息/产出物/guards）；
                      T14 技能链、T15 Hook 时序线在 StepEditor 内继续分区挂载。 */}
                  <p className="wb-ed-placeholder">{t('workbench.editor_placeholder', { name: stepName(selectedStep) })}</p>
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
              {/* T5/T15 挂载点：钩子计数（/api/hooks 配置）——数据面未接入前诚实占位，不谎报数字。 */}
              <div className="side-card__row">
                <span className="side-card__row-label">{t('workbench.sum_hooks')}</span>
                <span className="side-card__row-value" data-testid="wb-sum-hooks">—</span>
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
    </section>
  )
}
