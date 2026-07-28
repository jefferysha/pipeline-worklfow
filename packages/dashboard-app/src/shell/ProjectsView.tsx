import { useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useT } from '../i18n'
import type { WorkflowRules } from '../model/workflowModel'
import { PageHeader } from '../shared/PageHeader'
import type { Snapshot } from '../types'
import { buildProjectRows, compareProjectRows, type PhaseCell, type ProjectRow } from './projectsModel'

gsap.registerPlugin(useGSAP)

/**
 * ProjectsView —— v10 重设计（2026-07-14）：项目总览从「一模一样的空卡阵」改成「按需关注排序的
 * 紧凑列表」。用户否决卡阵（15 张空卡无信息层级）；新版一行一项目，把「需你动手」的项目顶到最上
 * 并高亮，其余安静排在下面，读不到的收进底部可折叠区。
 *
 * 每行：状态点 + mono 项目名（title 全路径、不截断）+ 一条自解释迷你相位轨（主信息=「当前 {相位名}」
 * 文字，frontier 落点相位；空项目=「未开始」；裸点轨降为宽屏辅助）+ 右侧健康摘要
 * （流程中 N·动手 N·运行 N；动手>0 用 red-d、运行>0 用 green-d 强调）。整行可点 = onOpenProject。
 *
 * 分区口径：
 *   · 「需要你动手」= gate+failed 计数>0（need>0）——置顶、accent 点 + 整行极轻 tint（禁 side-stripe）；
 *   · 「其余」= 可达但 need==0——安静，无 tint；
 *   · 「读不到」= ok=false——底部可折叠区（默认折叠，展开只读列名不可点）。
 *   排序：两个可达分区内均按 need desc → running desc → wip desc → 名称 asc。
 *
 * 迷你相位轨：相位序取该项目主 workflow（非归档 change 里出现最多的 workflow 名，命中 rulesByKey
 * 则用其 steps，否则 DEFAULT_RULES；剔除末端 archive 步）；frontier = 有落点的最靠后相位下标，
 * frontier 前的空相位=done，落点相位=current，frontier 后=todo。空项目（0 change）→ 全 todo。
 * 自解释（#3b）：轨旁主渲染「当前 {frontier 相位名}」文字（projects.mini_at），空项目→「未开始」，
 * 让人不用猜裸点含义；裸点轨保留但降为宽屏辅助（aria-hidden 纯装饰，仍带 data-phase/state 供测试）。
 *
 * 配色一律走 token（accent/green-d/red-d family + border/fill/text 各档），状态承载走 data-* 与 aria，
 * 不断言视觉类名；GSAP 入场沿项目现有 matchMedia 双分支姿势（reduce 直达终态），选择器走 data-anim。
 */
export interface ProjectsViewProps {
  snapshot: Snapshot | null
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  /** 点行钻进单项目进度页（App 侧 = setCurrentRoot(root) + setView('progress')）。 */
  onOpenProject: (root: string) => void
}

/**
 * 迷你相位轨 —— 自解释版（#3b）：主信息 = 一行「当前 {相位名}」文字（frontier=最靠后的落点相位），
 * 让人不用猜裸点含义；空项目（无落点）显示「未开始」。裸点轨保留但降为宽屏辅助（aria-hidden 纯装饰，
 * 仍带 data-phase/data-state/data-count 供测试与 hover title）。
 */
function MiniTrack({
  rowId,
  cells,
  t,
}: {
  rowId: string
  cells: PhaseCell[]
  t: (k: string, vars?: Record<string, string | number>) => string
}): JSX.Element {
  // frontier = 最靠后的落点相位（有件 → current）；无落点 = 空项目/未起步 → 「未开始」。
  let current: PhaseCell | undefined
  for (const cell of cells) if (cell.count > 0) current = cell
  const atLabel = current ? t('projects.mini_at', { phase: current.label }) : t('projects.mini_none')
  return (
    <span
      data-testid={`${rowId}-track`}
      className="col-start-2 col-end-4 row-start-2 flex w-full min-w-0 flex-1 items-center gap-3 overflow-hidden sm:w-auto"
    >
      <span
        data-testid={`${rowId}-at`}
        data-started={current ? 'true' : 'false'}
        className="flex-none whitespace-nowrap text-[14px] font-medium text-text-2"
      >
        {atLabel}
      </span>
      <span aria-hidden="true" className="hidden flex-none items-center gap-0 min-[560px]:flex">
        {cells.map((cell, i) => {
          const reached = cell.state !== 'todo'
          const dotCls =
            cell.state === 'current'
              ? 'h-2 w-2 bg-(--accent)'
              : cell.state === 'done'
                ? 'h-[7px] w-[7px] bg-border-2'
                : 'h-[7px] w-[7px] border border-border bg-transparent'
          return (
            <span key={cell.phase} className="flex flex-none items-center">
              {i > 0 && <span className={`h-px w-3 flex-none ${reached ? 'bg-border-2' : 'bg-border'}`} />}
              <span
                data-phase={cell.phase}
                data-state={cell.state}
                data-count={cell.count}
                title={cell.count > 0 ? `${cell.label} · ${cell.count}` : cell.label}
                className={`flex-none rounded-full ${dotCls}`}
              />
            </span>
          )
        })}
      </span>
    </span>
  )
}

/** 右侧健康摘要：流程中恒显；动手/运行仅在 >0 时出现（并各自语义色强调）。 */
function HealthSummary({
  rowId,
  wip,
  need,
  running,
  t,
}: {
  rowId: string
  wip: number
  need: number
  running: number
  t: (k: string) => string
}): JSX.Element {
  return (
    <span
      className="col-start-2 col-end-4 row-start-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[13px] tabular-nums sm:flex-none sm:flex-nowrap"
      data-testid={`${rowId}-summary`}
    >
      <span data-testid={`${rowId}-stat-wip`} data-value={wip} className="text-text-3">
        {t('projects.stat_wip')} <span className="font-semibold text-text-2">{wip}</span>
      </span>
      {need > 0 && (
        <span data-testid={`${rowId}-stat-need`} data-value={need} className="text-text-3">
          {t('projects.stat_need')} <span className="font-semibold text-red-d">{need}</span>
        </span>
      )}
      {running > 0 && (
        <span data-testid={`${rowId}-stat-running`} data-value={running} className="text-text-3">
          {t('projects.stat_running')} <span className="font-semibold text-green-d">{running}</span>
        </span>
      )}
    </span>
  )
}

/** 单个可达项目行（整行 button，可点钻进）。need 分区高亮 = accent 点 + 极轻 tint（无左边框）。 */
function ProjectRowButton({
  row,
  need,
  onOpen,
  t,
}: {
  row: ProjectRow
  /** 是否归「需要你动手」分区（决定高亮）。 */
  need: boolean
  onOpen: (root: string) => void
  t: (k: string, vars?: Record<string, string | number>) => string
}): JSX.Element {
  const rowId = `project-row-${row.basename}`
  return (
    <button
      type="button"
      data-anim="pv-item"
      data-testid={rowId}
      data-ok="true"
      data-need={need}
      aria-label={t('projects.open_aria', { name: row.basename })}
      onClick={() => onOpen(row.root)}
      className={`group grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 rounded-xl border px-4 py-4 text-left shadow-sm transition-[border-color,background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) active:scale-[.995] motion-reduce:transform-none sm:flex sm:flex-nowrap sm:gap-4 sm:px-5 ${
        need ? 'border-accent-b bg-accent-t hover:border-(--accent)' : 'border-border bg-card hover:border-border-2 hover:bg-fill'
      }`}
    >
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 h-2 w-2 flex-none rounded-full ${need ? 'bg-(--accent)' : 'border border-border-2 bg-transparent'}`}
      />
      <span
        className="col-start-2 row-start-1 min-w-0 truncate font-mono text-[16px] font-bold tracking-[-0.01em] text-text group-hover:text-(--accent) sm:min-w-[190px] sm:flex-none"
        title={row.root}
      >
        {row.basename}
      </span>
      <MiniTrack rowId={rowId} cells={row.cells} t={t} />
      <HealthSummary rowId={rowId} wip={row.wip} need={row.need} running={row.running} t={t} />
      <ChevronRight
        aria-hidden="true"
        className="col-start-3 row-start-1 h-4 w-4 flex-none text-text-3 opacity-70 transition-opacity group-hover:opacity-100 sm:opacity-0"
      />
    </button>
  )
}

/** 分区头：小标题 + 细分隔线（need 分区标题走 accent 色）。 */
function SectionHead({ label, tone }: { label: string; tone: 'need' | 'quiet' }): JSX.Element {
  return (
    <div data-anim="pv-item" className="mb-3 flex items-center gap-3">
      <span
        className={`text-[13px] font-bold ${tone === 'need' ? 'text-(--accent)' : 'text-text-3'}`}
      >
        {label}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}

export function ProjectsView({ snapshot, rulesByKey, onOpenProject }: ProjectsViewProps): JSX.Element {
  const { t } = useT()
  const rootRef = useRef<HTMLElement>(null)
  const [unreachableOpen, setUnreachableOpen] = useState(false)

  const rows = useMemo(() => buildProjectRows(snapshot, rulesByKey, t), [snapshot, rulesByKey, t])
  const { needRows, restRows, unreachable, needCount } = useMemo(() => {
    const reachable = rows.filter((r) => r.ok)
    const need = reachable.filter((r) => r.need > 0).sort(compareProjectRows)
    const rest = reachable.filter((r) => r.need === 0).sort(compareProjectRows)
    const unreach = rows.filter((r) => !r.ok)
    return { needRows: need, restRows: rest, unreachable: unreach, needCount: need.length }
  }, [rows])

  // 入场动画依赖键 = 行/分区成员指纹（增删项目才重放 stagger；展开读不到区不整列重播）。
  const animKey = rows.map((r) => `${r.ok ? '1' : '0'}${r.basename}`).sort().join('|')
  useGSAP(
    () => {
      const el = rootRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          const items = el.querySelectorAll<HTMLElement>('[data-anim="pv-item"]')
          if (items.length === 0) return
          if (reduce) {
            gsap.set(items, { autoAlpha: 1, y: 0 })
            return
          }
          gsap.fromTo(
            items,
            { autoAlpha: 0, y: 6 },
            { autoAlpha: 1, y: 0, duration: 0.28, ease: 'power2.out', stagger: 0.03, clearProps: 'all' },
          )
        },
      )
    },
    { scope: rootRef, dependencies: [animKey], revertOnUpdate: true },
  )

  return (
    <section ref={rootRef} data-testid="projects-view" data-page-frame="standard" aria-label={t('projects.title')} className="mx-auto w-full max-w-[1088px] pt-7 pb-5">
      <PageHeader
        title={t('projects.title')}
        description={<span data-testid="projects-summary">{t('projects.count_summary', { n: rows.length, need: needCount })}</span>}
      />

      {snapshot === null ? (
        <p className="text-[14px] text-text-3" role="status" aria-live="polite">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-col gap-7">
          {needRows.length > 0 && (
            <div data-testid="section-need">
              <SectionHead label={t('projects.section_need')} tone="need" />
              <div className="flex flex-col gap-2.5">
                {needRows.map((row) => (
                  <ProjectRowButton key={row.root} row={row} need onOpen={onOpenProject} t={t} />
                ))}
              </div>
            </div>
          )}

          {restRows.length > 0 && (
            <div data-testid="section-rest">
              <SectionHead label={t('projects.section_rest')} tone="quiet" />
              <div className="flex flex-col gap-2.5">
                {restRows.map((row) => (
                  <ProjectRowButton key={row.root} row={row} need={false} onOpen={onOpenProject} t={t} />
                ))}
              </div>
            </div>
          )}

          {unreachable.length > 0 && (
            <div data-testid="section-unreachable" data-anim="pv-item">
              <button
                type="button"
                data-testid="unreachable-toggle"
                aria-expanded={unreachableOpen}
                onClick={() => setUnreachableOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[13px] text-text-3 transition-colors hover:text-text-2"
              >
                {unreachableOpen ? (
                  <ChevronDown aria-hidden="true" className="h-4 w-4 flex-none" />
                ) : (
                  <ChevronRight aria-hidden="true" className="h-4 w-4 flex-none" />
                )}
                <span>{t('projects.unreachable_fold', { n: unreachable.length })}</span>
              </button>
              {unreachableOpen && (
                <div className="mt-2 flex flex-col gap-1">
                  {unreachable.map((row) => {
                    const rowId = `project-row-${row.basename}`
                    return (
                      <div
                        key={row.root}
                        data-testid={rowId}
                        data-ok="false"
                        aria-disabled="true"
                        className="flex items-center gap-3.5 rounded-md px-3.5 py-2.5 opacity-70"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 flex-none rounded-full border border-border-2 bg-transparent"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[14px] text-text-3" title={row.root}>
                          {row.basename}
                        </span>
                        <span className="flex-none text-[12px] font-semibold text-text-3">{t('projects.unreachable')}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
