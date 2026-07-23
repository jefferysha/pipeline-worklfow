import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  Plus,
  Play,
  Search,
  Terminal,
  Workflow,
  X,
} from 'lucide-react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import { isPhase } from '../types'
import type { View } from '../shell/Nav'
import { DEFAULT_RULES, type WorkflowRules } from '../model/workflowModel'
import { schedulerHealth, selectProgress, type ProgressRow, type ProgressState } from '../model/progressModel'
import { fetchAutomationSettings, postAfkEnqueue, postAfkRetry, postAutomationSettings, type WbAutomationSettings } from '../api/client'
import { shellQuote } from '../shared/shellQuote'
import { shortTime } from '../model/time'
import { OperationsPanel } from './OperationsPanel'

gsap.registerPlugin(useGSAP)

/**
 * AfkView —— 无人值守（AFK）指挥面（2026-07-15 外壳 IA 重构：原进度页那枚「调度 chip」升级成
 * 独立视图）。它既映射后端已算好的自动化状态，也提供真实的 enqueue/retry 写入口；失败任务若有
 * worktree，仍保留终端接管命令。状态变更只调用 server 既有端点，资格与 CAS 判断留在后端。
 *
 * 数据口径全部复用 model/progressModel（不在视图层摸 automation 原始字段，T6 纪律）：
 *   · selectProgress(snapshot, root, rulesByKey) → 各 workflow 组的行 + 五态判定；
 *   · inSandbox = 行处于 running/queued/failed（automation 三桶，schedulerHealth 同折叠口径——
 *     running 含 scheduled、failed 含 conflict）；按此三态分栏；
 *   · schedulerHealth(counts) → 汇总灯 + 计数；并发上限走 fetchAutomationSettings(root).max_parallel。
 *
 * 每行带一条迷你流水线轨（MiniTrack，参照 shell/ProjectsView 的三态节点+连线做法，但这里是
 * 「一条 change 在整条流水线里走到哪一步」）：相位序取该 change 所属 workflow 的 rules.steps
 * （命中 rulesByKey 用其 steps，否则 DEFAULT_RULES；剔末端 archive），change.phase 命中处 = current
 * 高亮、之前 = done、之后 = todo；失败态用语义红点出卡住的当前步。轨纯装饰（aria-hidden——相位
 * 语义由行内 afk.at_phase 文本承载），把「实现 · 沙箱」这种纯文字升级成「看得到在整条流水线哪一步」。
 *
 * 契约：颜色只走 token；状态经 data-* 与 aria；testid=afk-view / afk-sec-* / afk-row-* /
 * afk-track-* / afk-flow-* / afk-cmd-* / afk-empty / afk-limit。
 */
interface AfkViewProps {
  snapshot: Snapshot | null
  /** 当前单项目 root（App 保证 view='afk' 时为真实项目 root，非空）。 */
  currentRoot: string
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  /** 「看它的流水线」跳转（进度页恒同 currentRoot 语境）。 */
  onView: (v: View) => void
  /** 精确打开 Change 审计；缺省时保留旧的仅切换进度视图行为。 */
  onOpenChange?: (name: string) => void
  /** 命令 chip 拷贝反馈 toast。 */
  onToast?: (msg: string) => void
}

type Tr = (key: string, vars?: Record<string, string | number>) => string

/** 沙箱谓词：行处于自动化三桶之一（同 ProgressView inSandbox / progressModel schedulerHealth 口径）。 */
function inSandbox(state: ProgressState): boolean {
  return state === 'running' || state === 'queued' || state === 'failed'
}

function fieldStr(c: ChangeSnapshot, key: string): string {
  const v = c.fields[key]
  return typeof v === 'string' ? v : ''
}

/** 步 id → 展示名：自定义步优先用户 label，缺键/空回退 step id；default 相走 phases.* i18n
 *  （同 ProgressView stepLabel 口径）。 */
function phaseLabel(step: string, labelByStep: Record<string, string> | undefined, t: Tr): string {
  const custom = labelByStep?.[step]
  if (custom) return custom
  return isPhase(step) ? t(`phases.${step}`) : step
}

interface AfkRow {
  row: ProgressRow
  rules: WorkflowRules | undefined
}

type AfkTool = 'enqueue' | 'starter' | 'run'

type TrackState = 'done' | 'current' | 'todo'

/**
 * 迷你流水线轨 —— 单条 change 在整条流水线里走到哪一步（参照 shell/ProjectsView 的 MiniTrack：
 * 三态节点 + 连线、当前步高亮）。相位序取该 change workflow 的 rules.steps（命中 rulesByKey 用其
 * steps，否则 DEFAULT_RULES），剔末端 archive（终态，不入轨）；change.phase 命中处 = current，
 * 之前 = done、之后 = todo；phase 不在序里（异常）→ 全 todo。失败态（failed=true）当前步走语义红
 * 点出卡住的那一步。纯装饰（aria-hidden——相位语义已由行内 afk.at_phase 文本承载），节点带
 * data-phase/data-state 供测试与 hover title（相位展示名同 phaseLabel 口径）。
 */
function MiniTrack({
  change,
  rules,
  failed,
  t,
}: {
  change: ChangeSnapshot
  rules: WorkflowRules | undefined
  failed: boolean
  t: Tr
}): JSX.Element {
  const steps = (rules?.steps ?? DEFAULT_RULES.steps).filter((s) => s !== 'archive')
  const currentIndex = steps.indexOf(change.phase)
  return (
    <span
      aria-hidden="true"
      data-testid={`afk-track-${change.name}`}
      data-phase={change.phase}
      className="mt-1.5 flex items-center gap-0"
    >
      {steps.map((step, i) => {
        const state: TrackState =
          currentIndex === -1
            ? 'todo'
            : i < currentIndex
              ? 'done'
              : i === currentIndex
                ? 'current'
                : 'todo'
        const reached = state !== 'todo'
        const dotCls =
          state === 'current'
            ? failed
              ? 'h-2 w-2 bg-red'
              : 'h-2 w-2 bg-(--accent)'
            : state === 'done'
              ? 'h-[7px] w-[7px] bg-border-2'
              : 'h-[7px] w-[7px] border border-border bg-transparent'
        return (
          <span key={step} className="flex flex-none items-center">
            {i > 0 && <span className={`h-px w-3 flex-none ${reached ? 'bg-border-2' : 'bg-border'}`} />}
            <span
              data-phase={step}
              data-state={state}
              data-error={state === 'current' && failed ? 'true' : undefined}
              title={phaseLabel(step, rules?.labelByStep, t)}
              className={`flex-none rounded-full ${dotCls}`}
            />
          </span>
        )
      })}
    </span>
  )
}

export function AfkView({ snapshot, currentRoot, rulesByKey, onView, onOpenChange, onToast }: AfkViewProps): JSX.Element {
  const { t } = useT()
  const rootRef = useRef<HTMLElement>(null)

  const sel = useMemo(() => selectProgress(snapshot, currentRoot, rulesByKey), [snapshot, currentRoot, rulesByKey])
  const rows = useMemo(() => {
    const out: AfkRow[] = []
    for (const g of sel.groups) {
      const rules = rulesByKey.get(g.key)
      for (const r of g.rows) if (inSandbox(r.state)) out.push({ row: r, rules })
    }
    return out
  }, [sel, rulesByKey])

  const health = schedulerHealth(sel.counts)
  const enqueueCandidates = useMemo(() => {
    const project = snapshot?.projects.find((item) => item.root === currentRoot && item.ok)
    return (project?.changes ?? []).filter((change) => {
      const automation = fieldStr(change, 'automation')
      return change.archived !== 'true' && (automation === '' || automation === 'off')
    })
  }, [snapshot, currentRoot])
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [retryPreviewName, setRetryPreviewName] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<AfkTool | null>(null)

  // 自动运行设置取真实后端配置；并发修改写回完整配置，避免覆盖重试、默认入队与镜像字段。
  const [automationSettings, setAutomationSettings] = useState<WbAutomationSettings | null>(null)
  useEffect(() => {
    setAutomationSettings(null)
    if (currentRoot === '') return
    let cancelled = false
    fetchAutomationSettings(currentRoot)
      .then((s) => {
        if (!cancelled) setAutomationSettings(s)
      })
      .catch(() => {
        /* fail-open */
      })
    return () => {
      cancelled = true
    }
  }, [currentRoot])

  async function updateMaxParallel(next: number): Promise<void> {
    if (automationSettings === null || next === automationSettings.max_parallel) return
    const previous = automationSettings
    const updated = { ...previous, max_parallel: next }
    setAutomationSettings(updated)
    setActionError('')
    try {
      await postAutomationSettings({ root: currentRoot, ...updated })
      onToast?.(`并发上限已更新为 ${next}`)
    } catch (error) {
      setAutomationSettings(previous)
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  // 入场：卡片弹入 stagger（gsap.matchMedia 全包，reduce 直显终态）。
  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add({ motion: '(prefers-reduced-motion: no-preference)' }, () => {
        gsap.from(root.querySelectorAll('[data-anim="afk-card"]'), {
          autoAlpha: 0,
          y: 8,
          duration: 0.28,
          ease: 'power2.out',
          stagger: 0.04,
        })
      })
    },
    { scope: rootRef, dependencies: [rows.length], revertOnUpdate: true },
  )

  /** 失败行有 worktree 才提供终端接管。无 worktree 时不能给 `afk enqueue`：失败态必须走
   *  retry 端点，enqueue 会被后端状态机诚实拒绝。 */
  function cmdFor(change: ChangeSnapshot): { label: string; cmd: string } | null {
    const worktree = fieldStr(change, 'automation_worktree')
    if (worktree !== '') return { label: t('progress.cmd_takeover'), cmd: `cd ${shellQuote(worktree)}` }
    return null
  }
  function copyCmd(cmd: string): void {
    void navigator.clipboard?.writeText(cmd).then(() => onToast?.(t('detail.copied', { value: cmd })))
  }
  async function runAction(key: string, name: string, action: () => Promise<void>, successKey: string): Promise<boolean> {
    setActionBusy(key)
    setActionError('')
    try {
      await action()
      onToast?.(t(successKey, { name }))
      return true
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setActionBusy(null)
    }
  }

  const priorityRows = useMemo(
    () => [...rows].sort((a, b) => {
      const priority: Record<ProgressState, number> = { failed: 0, running: 1, queued: 2, gate: 3, agent: 4 }
      return priority[a.row.state] - priority[b.row.state] || a.row.change.name.localeCompare(b.row.change.name)
    }),
    [rows],
  )
  const visibleRows = query.trim() === ''
    ? priorityRows
    : priorityRows.filter(({ row }) => {
        const needle = query.trim().toLowerCase()
        return row.change.name.toLowerCase().includes(needle)
          || row.change.phase.toLowerCase().includes(needle)
          || fieldStr(row.change, 'workflow').toLowerCase().includes(needle)
      })
  const selected = priorityRows.find(({ row }) => row.change.name === selectedName) ?? priorityRows[0] ?? null
  const selectedChange = selected?.row.change ?? null
  const selectedRules = selected?.rules
  const selectedState = selected?.row.state ?? null
  const selectedFailure = selectedChange === null || selectedState !== 'failed'
    ? ''
    : fieldStr(selectedChange, 'automation_error') || fieldStr(selectedChange, 'automation_reason') || `${phaseLabel(selectedChange.phase, selectedRules?.labelByStep, t)}阶段未通过`
  const selectedCmd = selectedChange && selectedState === 'failed' ? cmdFor(selectedChange) : null

  function stateLabel(state: ProgressState): string {
    if (state === 'failed') return '需要处理'
    if (state === 'running') return '运行中'
    if (state === 'queued') return '等待中'
    return state === 'gate' ? '等待确认' : '等待处理'
  }

  function fact(value: string, fallback = '未提供'): string {
    return value.trim() === '' ? fallback : value
  }

  return (
    <section ref={rootRef} data-testid="afk-view" data-page-frame="standard" className="mx-auto min-w-0 w-full max-w-[1088px] pt-7 pb-5">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4" data-anim="afk-card">
        <div>
          <h1 className="text-[30px] font-bold leading-none tracking-[-0.025em] text-text">自动运行</h1>
          <p className="mt-2 text-[13px] leading-5 text-text-3">无人值守推进任务，出现异常时再接管</p>
        </div>
        <div className="flex flex-1 items-center justify-end gap-3 max-[900px]:basis-full max-[900px]:justify-start">
          <label className="relative w-full max-w-[350px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-3" aria-hidden="true" />
            <span className="sr-only">搜索运行</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务或定时任务…" className="h-11 w-full rounded-xl border border-border bg-card pr-3 pl-10 text-sm text-text outline-none transition-shadow focus:border-(--accent) focus:ring-3 focus:ring-accent-t" />
          </label>
          <button
            type="button"
            data-testid="afk-new-run"
            className="inline-flex min-h-11 flex-none items-center gap-2 rounded-xl bg-(--accent) px-4 text-sm font-semibold text-white shadow-sm transition-transform active:scale-[.97] disabled:cursor-not-allowed disabled:bg-text-3 disabled:opacity-60 disabled:active:scale-100 motion-reduce:transform-none"
            disabled={enqueueCandidates.length === 0 && snapshot?.capabilities.operations !== true}
            title={enqueueCandidates.length > 0 || snapshot?.capabilities.operations === true ? undefined : '当前没有可开启自动运行的任务，服务也未接通定时任务能力'}
            onClick={() => setActiveTool(enqueueCandidates.length > 0 ? 'enqueue' : 'starter')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />{enqueueCandidates.length > 0 ? '开启自动运行' : '新建定时任务'}
          </button>
        </div>
      </header>

      {actionError !== '' && (
        <p className="mb-4 rounded-lg border border-red/30 bg-red/5 px-3 py-2 text-xs text-red" role="alert">
          {t('afk.action_error', { msg: actionError })}
        </p>
      )}

      {rows.length === 0 ? (
        <p
          className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center text-[13px] text-text-3"
          data-anim="afk-card"
          data-testid="afk-empty"
        >
          当前没有自动运行任务
        </p>
      ) : (
        <div className="grid min-h-[650px] min-w-0 grid-cols-[360px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm max-[760px]:grid-cols-1" data-anim="afk-card">
          <aside className="min-w-0 border-r border-border bg-card p-4 max-[760px]:border-r-0 max-[760px]:border-b" data-testid="afk-queue">
            <div className="flex items-center justify-between py-1">
              <h2 className="text-[17px] font-bold tracking-[-0.01em] text-text">运行队列</h2>
              {automationSettings !== null && (
                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-3">
                  并发
                  <select
                    className="h-8 rounded-lg border border-border bg-card px-2 font-mono text-xs font-semibold text-text outline-none focus:border-(--accent)"
                    data-testid="afk-limit-input"
                    value={automationSettings.max_parallel}
                    onChange={(event) => void updateMaxParallel(Number(event.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 rounded-xl bg-fill p-1 text-xs font-semibold" data-testid="afk-health" data-status={health.status}>
              <span className="rounded-lg bg-card px-2 py-2 text-center text-red shadow-sm">需要处理 {health.failed}</span>
              <span className="px-2 py-2 text-center text-text-2">运行中 {health.running}</span>
              <span className="px-2 py-2 text-center text-text-2">等待中 {health.queued}</span>
            </div>
            <ul className="mt-3 flex flex-col gap-1">
              {visibleRows.map(({ row, rules }) => {
                const change = row.change
                const active = change.name === selectedChange?.name
                return (
                  <li key={change.name} data-testid={`afk-sec-${row.state}`}>
                    <button
                      type="button"
                      className="group w-full rounded-xl border border-transparent px-3.5 py-3.5 text-left transition-[border-color,background-color,transform] hover:bg-fill active:scale-[.985] data-[selected=true]:border-accent-b data-[selected=true]:bg-accent-t motion-reduce:transform-none"
                      data-testid={`afk-row-${change.name}`}
                      data-state={row.state}
                      data-selected={active}
                      onClick={() => setSelectedName(change.name)}
                    >
                      <span className="flex items-center gap-2">
                        <strong className="min-w-0 flex-1 break-words font-mono text-[14px] font-bold text-text">{change.name}</strong>
                        <ChevronRight className="h-4 w-4 text-text-3 opacity-0 transition-opacity group-hover:opacity-100 group-data-[selected=true]:opacity-100" aria-hidden="true" />
                      </span>
                      <span className="mt-1.5 block break-words text-xs font-semibold text-text-2">项目 · {currentRoot.split('/').filter(Boolean).pop() ?? currentRoot}</span>
                      <span className="mt-1 block text-xs text-text-3">{phaseLabel(change.phase, rules?.labelByStep, t)} · {stateLabel(row.state)}</span>
                      <span><MiniTrack change={change} rules={rules} failed={row.state === 'failed'} t={t} /></span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {selectedChange && selectedState && (
            <main className="min-w-0 p-5 max-[760px]:p-4" data-testid="afk-detail">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-[18px] font-bold tracking-[-0.015em] text-text">{selectedChange.name}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${selectedState === 'failed' ? 'bg-red-t text-red-d' : selectedState === 'running' ? 'bg-green-t text-green-d' : 'bg-fill text-text-2'}`}>{stateLabel(selectedState)}</span>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-text-3">{phaseLabel(selectedChange.phase, selectedRules?.labelByStep, t)}阶段</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]" data-testid="afk-run-facts">
                    <span className="rounded-lg bg-fill px-2.5 py-1.5 font-semibold text-text-2">工作流 {fact(fieldStr(selectedChange, 'workflow'), 'default')}</span>
                    {fieldStr(selectedChange, 'autonomy_level') !== '' && <span className="rounded-lg bg-fill px-2.5 py-1.5 font-semibold text-text-2">自治 {fieldStr(selectedChange, 'autonomy_level')}</span>}
                    {fieldStr(selectedChange, 'skill_bundle_id') !== '' && <span className="max-w-full truncate rounded-lg bg-fill px-2.5 py-1.5 font-semibold text-text-2">技能 {fieldStr(selectedChange, 'skill_bundle_id')}</span>}
                    {fieldStr(selectedChange, 'automation_container') !== '' && <span className="max-w-full truncate rounded-lg bg-fill px-2.5 py-1.5 font-semibold text-text-2">容器 {fieldStr(selectedChange, 'automation_container')}</span>}
                  </div>
                </div>
                <div className="flex flex-none flex-col items-end gap-2">
                  <span className="text-xs text-text-3">{selectedChange.updated_at ? `更新于 ${shortTime(selectedChange.updated_at)}` : '更新时间未提供'}</span>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-text-2 hover:bg-fill" data-testid={`afk-flow-${selectedChange.name}`} onClick={() => onOpenChange ? onOpenChange(selectedChange.name) : onView('progress')}><Workflow className="h-3.5 w-3.5" aria-hidden="true" />查看流水线</button>
                    {selectedCmd && <button type="button" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-text-2 hover:bg-fill" data-testid={`afk-cmd-${selectedChange.name}`} title={selectedCmd.cmd} aria-label={`${selectedCmd.label}：${selectedCmd.cmd}`} onClick={() => copyCmd(selectedCmd.cmd)}><Terminal className="h-3.5 w-3.5" aria-hidden="true" />人工接管</button>}
                  </div>
                </div>
              </div>

              <section className="mt-5" aria-label="阶段进度">
                <h3 className="text-sm font-semibold text-text">阶段进度</h3>
                <div className="mt-4 min-w-0 overflow-x-auto pb-2 [scrollbar-width:thin]" data-testid="afk-stage-scroll">
                  <div className="flex min-w-[560px] items-start" data-testid="afk-stage-track">
                    {(selectedRules?.steps ?? DEFAULT_RULES.steps).map((step, index, all) => {
                    const current = all.indexOf(selectedChange.phase)
                    const done = current >= 0 && index < current
                    const here = index === current
                    return (
                      <div key={step} className="flex min-w-0 flex-1 items-start">
                        <div className="min-w-[56px] flex-none text-center">
                          <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold ${done ? 'border-green bg-green text-white' : here && selectedState === 'failed' ? 'border-red bg-card text-red' : here ? 'border-(--accent) bg-(--accent) text-white' : 'border-border-2 bg-card text-text-3'}`}>
                            {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                          </span>
                          <span className="mt-2 block text-xs font-semibold text-text">{phaseLabel(step, selectedRules?.labelByStep, t)}</span>
                          <span className={`mt-0.5 block text-[10px] ${here && selectedState === 'failed' ? 'text-red' : 'text-text-3'}`}>{done ? '已完成' : here ? stateLabel(selectedState) : '等待'}</span>
                        </div>
                        {index < all.length - 1 && <span className={`mt-3.5 h-px min-w-2 flex-1 ${index < current ? 'bg-green' : 'bg-border-2'}`} aria-hidden="true" />}
                      </div>
                    )
                    })}
                  </div>
                </div>
              </section>

              {selectedState === 'failed' && (
                <section className="mt-5 rounded-xl border border-red-b bg-red-t/45 px-4 py-3">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-red" aria-hidden="true" />
                    <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-text">验证未通过：{selectedFailure}</h3><p className="mt-1 text-xs leading-5 text-text-3">修复问题后，先查看本次重试会做什么，再重新运行验证。</p></div>
                    <button type="button" className="min-h-9 flex-none rounded-lg bg-(--accent) px-3 text-xs font-semibold text-white shadow-sm transition-transform active:scale-[.97] motion-reduce:transform-none" data-testid={`afk-retry-preview-${selectedChange.name}`} onClick={() => setRetryPreviewName(selectedChange.name)}>查看重试预览</button>
                  </div>
                </section>
              )}

              <section className="mt-4 rounded-xl border border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-text">运行活动</h3>
                <ul className="mt-3 divide-y divide-border text-xs">
                  <li className="flex gap-3 py-2"><Clock3 className="h-4 w-4 text-text-3" aria-hidden="true" /><span className="text-text-2">{selectedChange.updated_at ? shortTime(selectedChange.updated_at) : '时间未提供'}</span><strong className="text-text">{selectedState === 'failed' ? '验证失败' : stateLabel(selectedState)}</strong></li>
                </ul>
              </section>
            </main>
          )}

        </div>
      )}

      {(enqueueCandidates.length > 0 || snapshot?.capabilities.operations === true) && (
        <nav className="sticky bottom-3 z-30 mx-auto mt-4 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card/90 p-1.5 shadow-[0_10px_34px_rgba(15,23,42,.12)] backdrop-blur-2xl" aria-label="自动运行工具">
          {([
            ['enqueue', '开启自动运行', Plus, enqueueCandidates.length === 0, '让已有任务进入无人值守队列'],
            ['starter', '新建定时任务', Plus, snapshot?.capabilities.operations !== true, '按周期发现或生成任务'],
            ['run', '验证定时任务', Play, snapshot?.capabilities.operations !== true, '上线前检查任务选择与执行计划'],
          ] as const).map(([tool, label, Icon, disabled, title]) => (
            <button key={tool} type="button" title={title} data-testid={`afk-tool-${tool}`} data-active={activeTool === tool} className="inline-flex min-h-10 flex-none items-center gap-2 rounded-xl px-3 text-xs font-semibold text-text-2 transition-[background-color,transform] hover:bg-fill active:scale-[.97] data-[active=true]:bg-accent-t data-[active=true]:text-accent-d disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none" disabled={disabled} onClick={() => setActiveTool(tool)}><Icon className="h-4 w-4" aria-hidden="true" />{label}</button>
          ))}
        </nav>
      )}

      {activeTool !== null && (activeTool === 'enqueue' || snapshot?.capabilities.operations === true) && (
        <section data-testid="afk-tool-sheet" role="dialog" aria-modal="true" aria-label="自动运行工具" className="fixed inset-0 z-50 grid place-items-center bg-scrim p-5 max-[760px]:p-3">
          <div className="max-h-[82vh] w-full max-w-[760px] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(15,23,42,.28)]">
            <div className="mb-4 flex items-center justify-between gap-4 border-b border-border pb-3">
              <div><p className="text-[11px] font-semibold tracking-[.08em] text-text-3">自动运行</p><h2 className="mt-1 text-lg font-bold text-text">{activeTool === 'enqueue' ? '开启自动运行' : activeTool === 'starter' ? '新建定时任务' : '验证定时任务'}</h2></div>
              <button type="button" data-testid="afk-tool-close" aria-label="关闭工具" className="grid h-10 w-10 place-items-center rounded-full text-text-3 hover:bg-fill hover:text-text" onClick={() => setActiveTool(null)}><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            {activeTool === 'enqueue' ? (
              <section>
                <p className="text-sm leading-6 text-text-3">把已有任务交给无人值守队列。此操作不创建新任务，也不改变它的工作流；调度器只负责按并发上限推进。</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {enqueueCandidates.map((change) => {
                    const key = `enqueue:${change.name}`
                    return (
                      <button key={change.name} type="button" className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-bg px-4 py-3 text-left hover:border-(--accent) hover:bg-accent-t" data-testid={`afk-enqueue-${change.name}`} disabled={actionBusy !== null} onClick={() => void runAction(key, change.name, () => postAfkEnqueue(change.name, currentRoot), 'afk.enqueue_ok').then((ok) => { if (ok) setActiveTool(null) })}>
                        <span><strong className="block font-mono text-sm text-text">{change.name}</strong><span className="mt-1 block text-xs text-text-3">当前阶段 · {phaseLabel(change.phase, undefined, t)}</span></span>
                        <span className="text-xs font-semibold text-(--accent)">{actionBusy === key ? '开启中…' : '开启'}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : (
              <OperationsPanel root={currentRoot} onToast={onToast} onOpenChange={onOpenChange} activeTool={activeTool} compact />
            )}
          </div>
        </section>
      )}

      {retryPreviewName !== null && (
        <section
          role="dialog"
          aria-label="重试预览"
          data-testid="afk-retry-sheet"
          className="fixed right-5 bottom-5 left-[112px] z-40 rounded-2xl border border-border bg-card/95 p-5 shadow-[0_20px_55px_rgba(15,23,42,.18)] backdrop-blur-2xl max-[760px]:right-3 max-[760px]:bottom-3 max-[760px]:left-3"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-5">
            <div className="min-w-[260px] flex-1">
              <p className="text-[11px] font-semibold tracking-[.08em] text-text-3 uppercase">安全重试预览</p>
              <h2 className="mt-1 text-lg font-bold text-text">重新运行验证 · <span className="font-mono">{retryPreviewName}</span></h2>
              <p className="mt-1 text-xs leading-5 text-text-3">复用当前工作区与 Skill 快照，从验证阶段继续。不会自动合并，也不会修改 Workflow 配置。</p>
            </div>
            <dl className="grid min-w-[300px] grid-cols-3 gap-2 text-xs max-[760px]:min-w-0 max-[760px]:w-full">
              <div className="rounded-xl bg-fill px-3 py-2"><dt className="text-text-3">起点</dt><dd className="mt-1 font-semibold text-text">验证阶段</dd></div>
              <div className="rounded-xl bg-fill px-3 py-2"><dt className="text-text-3">代码合并</dt><dd className="mt-1 font-semibold text-text">保持关闭</dd></div>
              <div className="rounded-xl bg-fill px-3 py-2"><dt className="text-text-3">失败处理</dt><dd className="mt-1 font-semibold text-text">回到待处理</dd></div>
            </dl>
            <div className="ml-auto flex gap-2 max-[760px]:ml-0 max-[760px]:w-full">
              <button type="button" className="min-h-11 rounded-xl border border-border-2 bg-card px-4 text-sm font-semibold text-text-2 max-[760px]:flex-1" onClick={() => setRetryPreviewName(null)}>取消</button>
              <button
                type="button"
                data-testid={`afk-retry-confirm-${retryPreviewName}`}
                disabled={actionBusy !== null}
                className="min-h-11 rounded-xl bg-(--accent) px-5 text-sm font-semibold text-white disabled:opacity-50 max-[760px]:flex-1"
                onClick={() => {
                  const name = retryPreviewName
                  void runAction(`retry:${name}`, name, () => postAfkRetry(name, currentRoot), 'afk.retry_ok')
                    .then((ok) => { if (ok) setRetryPreviewName(null) })
                }}
              >{actionBusy === `retry:${retryPreviewName}` ? '提交中…' : '确认重试'}</button>
            </div>
          </div>
        </section>
      )}
    </section>
  )
}
