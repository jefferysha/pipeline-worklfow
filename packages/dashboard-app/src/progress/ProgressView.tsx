import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import { isPhase } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import {
  PROGRESS_STATES,
  missingGateArtifacts,
  schedulerHealth,
  selectProgress,
  type ProgressCounts,
  type ProgressGroup,
  type ProgressRow,
  type ProgressRules,
  type ProgressState,
} from '../model/progressModel'

gsap.registerPlugin(useGSAP)

/**
 * ProgressView（T10，计划 2026-07-11-v5-interaction-rebuild）—— 进度视图骨架：
 * Linear 式「项目×workflow 整组一张卡」（轻组头可折叠 + 归档尾缀纯文本，决议 #5）、
 * 行内 chevron 铰接箭头带（clip-path，past/cur/fail/fut 四态 + 未到达复核门红点）、
 * 筛选条（项目下拉多选 checkbox + 清空；五态计数 chips + 全部，单选）、调度器健康灯
 * （busy 黄由既有红绿 token 在 oklch 空间取中派生，决议 #9 不引入新原色）。
 * 交互真相源 design-demos/v5-progress-workbench.html 进度段（六轮验收定稿）；
 * 状态判定全部消费 model/progressModel（T6 同源谓词），本视图零判定逻辑。
 *
 * 骨架范围：行 = 名字 + track 徽章 + 箭头带 + 状态徽章 + 快捷钮占位（终止/重试经
 * onAction prop 上抛，端点接线与行展开详情 = T11）；不挂导航（T17 切换）。
 *
 * GSAP（全包 gsap.matchMedia，reduce 分支直达终态）：箭头带入场 stagger 点亮、
 * 执行中段光泽 repeat:-1 循环扫过、失败段一次性抖动（决策 C，沿 motion.ts 词汇
 * 150-250ms）。依赖键 = 可见行指纹：筛选/折叠/数据变化都会 revert 重建——光泽循环
 * 随行卸载必 kill（T11 同款「循环动画随视图收敛」纪律），不留孤儿 timeline。
 */

export type ProgressQuickAction = 'kill' | 'retry'

export interface ProgressViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** D5 项目切换器语义：非空=只看该项目；空串=全部项目聚合（同 InboxView 契约）。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集，键=rulesKey(root,wf)（useWorkflowRulesMulti 契约）。 */
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  /** 快捷钮占位回调（终止=kill 仅执行中行、重试=retry 仅失败行）；端点接线留 T11。 */
  onAction?: (action: ProgressQuickAction, root: string, name: string) => void
}

/** root → 尾段项目名（同 inbox.ts projectName 口径，这里入参是裸 root 串）。 */
function rootBasename(root: string): string {
  const parts = root.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? root
}

function fieldStr(c: ChangeSnapshot, key: string): string {
  const v = c.fields[key]
  return typeof v === 'string' ? v : ''
}

// ── 箭头带（chevron 铰接段）──

interface ChevronFlowProps {
  workflow: string
  rules: ProgressRules | undefined
  change: ChangeSnapshot
  state: ProgressState
  stateLabel: string
  t: (key: string, vars?: Record<string, string | number>) => string
}

/** 步 id → 展示名：default 七相走 phases.* i18n，自定义步 id 原样（rules 不携带 label）。 */
function stepLabel(step: string, t: ChevronFlowProps['t']): string {
  return isPhase(step) ? t(`phases.${step}`) : step
}

/**
 * chevron 箭头带：段数 = workflow 步数，past（✓ 绿 tint）/cur（accent 实底）/fail（红实底）/
 * fut（fill 灰）四态；未到达的复核门段右上角红点（prg-seg--gate）；执行中当前段挂光泽层
 * （GSAP x 位移循环，无 GSAP/reduced-motion 时保持透明）。rules 缺失或当前阶段不在步序里
 * （G17 底线：卡不消失）→ 退化为单段 cur，aria-label 不含「第 N/M」。
 */
function ChevronFlow({ workflow, rules, change, state, stateLabel, t }: ChevronFlowProps): JSX.Element {
  const steps = rules?.steps ?? []
  const curIdx = steps.indexOf(change.phase)
  const phaseLabel = stepLabel(change.phase, t)
  if (curIdx < 0) {
    return (
      <div
        className="prg-flow"
        data-testid={`prg-flow-${change.name}`}
        aria-label={t('progress.flow_label_norules', { workflow, phase: phaseLabel, state: stateLabel })}
      >
        <span className="prg-seg prg-seg--cur">
          <span className="prg-seg__t">{phaseLabel}</span>
        </span>
      </div>
    )
  }
  return (
    <div
      className="prg-flow"
      data-testid={`prg-flow-${change.name}`}
      aria-label={t('progress.flow_label', {
        workflow,
        phase: phaseLabel,
        n: curIdx + 1,
        m: steps.length,
        state: stateLabel,
      })}
    >
      {steps.map((step, i) => {
        const classes = ['prg-seg']
        let prefix = ''
        if (i < curIdx) {
          classes.push('prg-seg--past')
          prefix = '✓ '
        } else if (i === curIdx) {
          if (state === 'failed') {
            classes.push('prg-seg--fail')
            prefix = '× '
          } else {
            classes.push('prg-seg--cur')
            if (state === 'running') classes.push('prg-seg--run')
          }
        } else {
          classes.push('prg-seg--fut')
          if (rules?.gateByStep[step] === 'review') classes.push('prg-seg--gate')
        }
        return (
          <span key={step} className={classes.join(' ')}>
            <span className="prg-seg__t">{prefix}{stepLabel(step, t)}</span>
            {i === curIdx && state === 'running' && <i className="prg-gloss" aria-hidden="true" />}
          </span>
        )
      })}
    </div>
  )
}

// ── 视图 ──

function emptyCounts(): ProgressCounts {
  return { gate: 0, agent: 0, running: 0, queued: 0, failed: 0 }
}

export function ProgressView({ snapshot, loading, error, currentRoot, rulesByKey, onAction }: ProgressViewProps): JSX.Element {
  const { t } = useT()
  const rootRef = useRef<HTMLElement>(null)
  const ddRef = useRef<HTMLDivElement>(null)
  const [projSel, setProjSel] = useState<readonly string[]>([])
  const [stateSel, setStateSel] = useState<ProgressState | 'all'>('all')
  const [ddOpen, setDdOpen] = useState(false)
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set())

  const base = useMemo(() => selectProgress(snapshot, currentRoot, rulesByKey), [snapshot, currentRoot, rulesByKey])

  // 项目下拉的候选集来自全量分组（不受当前勾选影响，勾掉的项目仍在菜单里可勾回）。
  const rootOptions = useMemo(() => [...new Set(base.groups.map((g) => g.root))], [base])

  // 项目多选（空=全部）先收敛范围；chips 计数在这个范围上重算（「联动」语义：换项目范围，
  // 计数跟着变），状态单选再过滤行。计数与行数恒等的不变式由 T6 构造保证，这里只是重分桶。
  const projGroups = useMemo(
    () => (projSel.length === 0 ? base.groups : base.groups.filter((g) => projSel.includes(g.root))),
    [base, projSel],
  )
  const counts = useMemo(() => {
    const acc = emptyCounts()
    for (const g of projGroups) for (const row of g.rows) acc[row.state] += 1
    return acc
  }, [projGroups])
  const total = PROGRESS_STATES.reduce((n, s) => n + counts[s], 0)
  const health = schedulerHealth(counts)

  interface VisibleGroup {
    group: ProgressGroup
    rows: ProgressRow[]
    open: boolean
  }
  const visibleGroups: VisibleGroup[] = useMemo(
    () =>
      projGroups
        .map((group) => ({
          group,
          rows: stateSel === 'all' ? group.rows : group.rows.filter((r) => r.state === stateSel),
          open: !closedGroups.has(group.key),
        }))
        .filter((g) => g.rows.length > 0),
    [projGroups, stateSel, closedGroups],
  )

  // 下拉外点关闭（捕获阶段不必要；冒泡足够——菜单内点击 contains 命中不关）。
  useEffect(() => {
    if (!ddOpen) return
    function onDocClick(e: MouseEvent): void {
      if (ddRef.current && e.target instanceof Node && !ddRef.current.contains(e.target)) setDdOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [ddOpen])

  // ── GSAP：入场 stagger / 执行中光泽循环 / 失败段抖动（全包 matchMedia）──
  // 依赖键 = 展开组的可见行指纹（名字+状态）：数据/筛选/折叠变化 → revertOnUpdate 先杀掉
  // 上一轮全部补间（含 repeat:-1 光泽——matchMedia 创建于 useGSAP context 内，revert 连带清理），
  // 再按新 DOM 重建，不会给已卸载的行留孤儿循环。
  const animKey = visibleGroups
    .filter((g) => g.open)
    .map((g) => `${g.group.key}:${g.rows.map((r) => `${r.change.name}=${r.state}`).join(',')}`)
    .join('|')
  useGSAP(
    () => {
      const el = rootRef.current
      if (!el) return
      // 环境不支持 matchMedia（jsdom/极老内核）：静态呈现即终态，不放任何动画——
      // 段落 CSS 缺省全可见、光泽层缺省 opacity:0，与 reduce 分支同一结局。
      if (typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          const flows = Array.from(el.querySelectorAll<HTMLElement>('.prg-flow'))
          if (reduce) {
            // 直达终态：段全可见、光泽层保持透明、无循环无抖动。
            for (const flow of flows) gsap.set(flow.querySelectorAll('.prg-seg'), { autoAlpha: 1, scaleX: 1 })
            gsap.set(el.querySelectorAll('.prg-gloss'), { autoAlpha: 0 })
            return
          }
          // 入场：每条箭头带内段级 stagger 点亮，行间再错开一拍（demo 同参）。
          flows.forEach((flow, i) => {
            gsap.fromTo(
              flow.querySelectorAll('.prg-seg'),
              { autoAlpha: 0, scaleX: 0.9, transformOrigin: 'left center' },
              { autoAlpha: 1, scaleX: 1, duration: 0.34, ease: 'power2.out', stagger: 0.045, delay: i * 0.07 },
            )
          })
          // 执行中段：光泽扫过循环（repeat:-1，随 revert 必杀）。
          for (const gloss of Array.from(el.querySelectorAll<HTMLElement>('.prg-gloss'))) {
            const seg = gloss.parentElement
            gsap
              .timeline({ repeat: -1, repeatDelay: 1.2 })
              .fromTo(
                gloss,
                { x: -48, autoAlpha: 1 },
                { x: () => (seg?.offsetWidth ?? 120) + 48, duration: 1.05, ease: 'power1.inOut' },
              )
          }
          // 失败段：一次性抖动（决策 C；motion.ts 词汇 150-250ms，状态反馈非装饰）。
          for (const failSeg of Array.from(el.querySelectorAll<HTMLElement>('.prg-seg--fail'))) {
            gsap.to(failSeg, {
              keyframes: [{ x: -3 }, { x: 3 }, { x: -2 }, { x: 0 }],
              duration: 0.22,
              ease: 'power1.out',
              delay: 0.38, // 入场落定后再抖，两个动效不打架
            })
          }
        },
      )
    },
    { scope: rootRef, dependencies: [animKey], revertOnUpdate: true },
  )

  // ── 投影：状态徽章文案（人话；「等 agent」点名欠的产出字段）──
  function badgeLabel(row: ProgressRow, rules: ProgressRules | undefined): string {
    switch (row.state) {
      case 'gate':
        return fieldStr(row.change, 'automation') === 'paused' ? t('progress.state_gate_paused') : t('progress.state_gate')
      case 'agent': {
        const missing = missingGateArtifacts(row.change, rules)
        return missing.length > 0
          ? t('progress.state_agent_missing', { fields: missing.join(' ') })
          : t('progress.state_agent')
      }
      case 'running':
        return t('progress.state_running')
      case 'queued':
        return t('progress.state_queued')
      case 'failed': {
        const attempts = Number(fieldStr(row.change, 'automation_attempts') || '0')
        return attempts > 0 ? t('progress.failed_times', { n: attempts }) : t('progress.state_failed')
      }
    }
  }

  function toggleGroup(key: string): void {
    setClosedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleProj(root: string): void {
    setProjSel((prev) => (prev.includes(root) ? prev.filter((r) => r !== root) : [...prev, root]))
  }

  const doctorText =
    health.running + health.queued + health.failed > 0
      ? `${t(`progress.doctor_${health.status}`)} · ${t('progress.doctor_counts', {
          running: health.running,
          queued: health.queued,
          failed: health.failed,
        })}`
      : t(`progress.doctor_${health.status}`)

  const projBtnValue =
    projSel.length === 0 ? t('progress.filter_all') : projSel.map(rootBasename).join(', ')

  const chipStates: readonly (ProgressState | 'all')[] = ['all', ...PROGRESS_STATES]

  return (
    <section className="view progress" data-testid="progress-view" ref={rootRef}>
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('progress.title')}</h1>
          <p className="view__subtitle">{t('progress.subtitle')}</p>
        </div>
        <span className="prg-doctor" data-testid="prg-doctor">
          <i className={`prg-doctor__d prg-doctor__d--${health.status}`} aria-hidden="true" />
          {doctorText}
        </span>
      </header>

      {error && <p className="prg-note prg-note--error" data-testid="prg-error">{error}</p>}
      {loading && !snapshot && <p className="prg-note">{t('common.loading')}</p>}

      <div className="prg-filters">
        <div className="prg-dd" ref={ddRef}>
          <button
            type="button"
            className="prg-ddbtn"
            data-testid="prg-proj-btn"
            aria-haspopup="true"
            aria-expanded={ddOpen}
            onClick={() => setDdOpen((v) => !v)}
          >
            {t('progress.filter_project')}
            <span className="prg-ddval">{projBtnValue}</span>
            <span className="prg-ddcaret" aria-hidden="true">▾</span>
          </button>
          {ddOpen && (
            <div className="prg-ddmenu" data-testid="prg-proj-menu">
              {rootOptions.map((root) => (
                <label key={root} className="prg-ddopt">
                  <input
                    type="checkbox"
                    aria-label={rootBasename(root)}
                    checked={projSel.includes(root)}
                    onChange={() => toggleProj(root)}
                  />
                  <span className="mono">{rootBasename(root)}</span>
                </label>
              ))}
              <div className="prg-ddfoot">
                <button type="button" className="prg-ddclear" data-testid="prg-proj-clear" onClick={() => setProjSel([])}>
                  {t('progress.filter_clear')}
                </button>
              </div>
            </div>
          )}
        </div>
        <i className="prg-fdiv" aria-hidden="true" />
        <div className="prg-schips" role="group" aria-label={t('progress.filter_state_label')}>
          {chipStates.map((s) => {
            const on = stateSel === s
            const n = s === 'all' ? total : counts[s]
            return (
              <button
                key={s}
                type="button"
                className={`prg-schip${on ? ' on' : ''}`}
                data-testid={`prg-chip-${s}`}
                aria-pressed={on}
                onClick={() => setStateSel(on && s !== 'all' ? 'all' : s)}
              >
                {s === 'failed' && <i className="prg-sx" aria-hidden="true">×</i>}
                {s !== 'all' && s !== 'failed' && <i className={`prg-sdot prg-sdot--${s}`} aria-hidden="true" />}
                {s === 'all' ? t('progress.chip_all') : t(`progress.state_${s}`)} <span className="n mono">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {visibleGroups.map(({ group, rows, open }) => {
        const groupRules = rulesByKey.get(group.key) as ProgressRules | undefined
        const projName = rootBasename(group.root)
        const meta = groupRules
          ? t('progress.group_meta', { steps: groupRules.steps.length, rows: group.rows.length })
          : t('progress.group_meta_noflow', { rows: group.rows.length })
        return (
          <div key={group.key} className={`prg-group card${open ? '' : ' prg-group--closed'}`}>
            <button
              type="button"
              className="prg-ghead"
              data-testid={`prg-ghead-${projName}-${group.workflow}`}
              aria-expanded={open}
              onClick={() => toggleGroup(group.key)}
            >
              <span className="prg-ghead__name mono">{projName}</span>
              <span className="g-phase">{group.workflow}</span>
              <span className="prg-ghead__meta">
                {meta}
                {group.archivedCount > 0 && ` ${t('progress.group_archived', { n: group.archivedCount })}`}
              </span>
              <span className="prg-ghead__caret" aria-hidden="true">▾</span>
            </button>
            {open && (
              <div className="prg-rows">
                {rows.map((row) => (
                  <div key={row.change.name} className="prg-row" data-testid={`prg-row-${row.change.name}`}>
                    {/* 骨架期纯展示行；点行展开详情（role/tabIndex/aria-expanded）T11 接线 */}
                    <div className="prg-row__main">
                      <div className="prg-name">
                        <span className="prg-name__t mono">{row.change.name}</span>
                        <span className="card__track mono">{row.change.track}</span>
                      </div>
                      <ChevronFlow
                        workflow={group.workflow}
                        rules={groupRules}
                        change={row.change}
                        state={row.state}
                        stateLabel={badgeLabel(row, groupRules)}
                        t={t}
                      />
                      <div className="prg-state">
                        <span className={`prg-badge prg-badge--${row.state}`} data-testid={`prg-badge-${row.change.name}`}>
                          {(row.state === 'gate' || row.state === 'running') && <span className="prg-badge__dot" aria-hidden="true" />}
                          {badgeLabel(row, groupRules)}
                        </span>
                        {row.state === 'running' && (
                          <button
                            type="button"
                            className="prg-btn prg-btn--danger"
                            data-testid={`prg-kill-${row.change.name}`}
                            onClick={() => onAction?.('kill', row.root, row.change.name)}
                          >
                            ⏹ {t('progress.act_kill')}
                          </button>
                        )}
                        {row.state === 'failed' && (
                          <button
                            type="button"
                            className="prg-btn"
                            data-testid={`prg-retry-${row.change.name}`}
                            onClick={() => onAction?.('retry', row.root, row.change.name)}
                          >
                            ↻ {t('progress.act_retry')}
                          </button>
                        )}
                        <span className="prg-caret" aria-hidden="true">▾</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {snapshot && visibleGroups.length === 0 && (
        <div className="prg-empty" data-testid="prg-empty">{t('progress.empty')}</div>
      )}

      <p className="prg-foot">{t('progress.foot')}</p>
    </section>
  )
}
