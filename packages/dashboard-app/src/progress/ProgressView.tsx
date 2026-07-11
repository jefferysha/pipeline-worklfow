import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import { isPhase } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import { plannedTransition, type PlannedTransition } from '../model/events'
import { getToken, postTransition } from '../api/client'
import { TaskDetail } from '../shared/TaskDetail'
import { useAfkLog } from './useAfkLog'
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
 * T11（本任务）在骨架之上补齐交互面（对照 demo 进度段 prg-row--open/prg-detail/prg-dfoot）：
 *   · 行点击/Enter/Space 展开阶段 sheet（共享 TaskDetail variant='tabs'，行内按钮点击不触发展开）；
 *   · 动作真接线（决议 #13：文案以 demo v5 prg-dfoot 为唯一口径）：终止=POST /api/afk/:name/cancel
 *     （仅 automation==='running' 可点，cancel-gate 纪律）、重试=…/retry（failed 行）、
 *     放弃=…/dismiss（决议 #4：failed/conflict→off 现场保留）、放行/打回=POST transition（gate 行，
 *     前进/回退边各取第一条）；乐观更新（本地 patch 叠加 snapshot，成功后 onRefresh resync、
 *     新快照到达即清 patch；失败回滚 + toast）+ 行级 busy 守卫；
 *   · running 行详情：当前阶段 pane 尾部日志区（useAfkLog 2.5s 轮询 + 跟随开关）+「沙箱内阶段」
 *     行（T4 automation_current_phase 字段）；
 *   · 「等 agent 补产出」/「排队」行：无动作，只有说明（+「在终端继续」）。
 * 不挂导航（T17 切换）。
 *
 * GSAP（全包 gsap.matchMedia，reduce 分支直达终态）：箭头带入场 stagger 点亮、
 * 执行中段光泽 repeat:-1 循环扫过、失败段一次性抖动（决策 C，沿 motion.ts 词汇
 * 150-250ms）。依赖键 = 可见行指纹：筛选/折叠/数据变化都会 revert 重建——光泽循环
 * 随行卸载必 kill（T11 同款「循环动画随视图收敛」纪律），不留孤儿 timeline。
 */

export interface ProgressViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** D5 项目切换器语义：非空=只看该项目；空串=全部项目聚合（同 InboxView 契约）。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集，键=rulesKey(root,wf)（useWorkflowRulesMulti 契约）。 */
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  /** 动作结果 toast（成功/失败都走这里；App 注入 showFlash，同 InboxView onToast 契约）。 */
  onToast?: (msg: string) => void
  /** 动作成功后 resync（App 注入 useSnapshot().refresh；T17 接线）。 */
  onRefresh?: () => void | Promise<void>
}

/** 行级键（busy/展开/乐观 patch 共用）：name 字符集受 server 校验限死 [a-zA-Z0-9_-]，'@' 不会撞。 */
function rowKeyOf(root: string, name: string): string {
  return `${name}@${root}`
}

/** 乐观 patch：动作发出即叠加到 snapshot 投影上，成功等 SSE/refresh 落地，失败回滚。 */
interface RowPatch {
  phase?: string
  fields?: Record<string, string>
}

/** 非 2xx 响应尽量读出 server 的 { error } 文案（同 useAfkLog.ts 的局部拷贝先例：单处消费，
 *  不值得为一行 JSON 解析新增跨模块依赖）。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body && typeof body.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
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

// ── running 行详情内日志区（demo prg-logwrap 对位）──

/**
 * afk-demo 型 running 行的日志尾部：useAfkLog（既有 2.5s 轮询迁移消费——status 传 automation
 * 原始值，仅 'running' 时轮询）+ 跟随开关 +「沙箱内阶段」行（T4 automation_current_phase，
 * 沙箱里 [TRANSITION] 已推进但 host 阶段要等 run 结算）。经 TaskDetail curStageExtra 插槽
 * 挂在当前阶段 pane 尾部（决议 #13：组件零业务，日志语义归本宿主）。
 */
function RunLogPane({ root, change }: { root: string; change: ChangeSnapshot }): JSX.Element {
  const { t } = useT()
  const { log, follow, setFollow } = useAfkLog(change.name, fieldStr(change, 'automation'), root)
  const sandboxPhase = fieldStr(change, 'automation_current_phase')
  return (
    <div className="prg-logwrap" data-testid={`prg-log-${change.name}`}>
      <div className="prg-logbar">
        <span className="prg-loglabel mono">{t('progress.log_label')}</span>
        <span className="prg-follow">
          {t('progress.follow_tail')}
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={follow}
            aria-label={t('progress.follow_tail')}
            data-testid={`prg-follow-${change.name}`}
            onClick={() => setFollow(!follow)}
          />
        </span>
      </div>
      <pre className="prg-log mono" data-testid={`prg-logtext-${change.name}`}>{log}</pre>
      {sandboxPhase !== '' && (
        <p className="prg-lognote" data-testid={`prg-sandbox-phase-${change.name}`}>
          {t('progress.sandbox_phase', { phase: sandboxPhase })}
        </p>
      )}
    </div>
  )
}

// ── 视图 ──

function emptyCounts(): ProgressCounts {
  return { gate: 0, agent: 0, running: 0, queued: 0, failed: 0 }
}

export function ProgressView({ snapshot, loading, error, currentRoot, rulesByKey, onToast, onRefresh }: ProgressViewProps): JSX.Element {
  const { t } = useT()
  const rootRef = useRef<HTMLElement>(null)
  const ddRef = useRef<HTMLDivElement>(null)
  const [projSel, setProjSel] = useState<readonly string[]>([])
  const [stateSel, setStateSel] = useState<ProgressState | 'all'>('all')
  const [ddOpen, setDdOpen] = useState(false)
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set())
  // ── T11：行展开 / 行级 busy / 乐观 patch ──
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set())
  const [busyRows, setBusyRows] = useState<ReadonlySet<string>>(new Set())
  const [patches, setPatches] = useState<ReadonlyMap<string, RowPatch>>(new Map())

  // 新 snapshot 到达（SSE/refresh）即清乐观 patch：成功路径 onRefresh 拉回的快照已含真值；
  // 极端竞态（旧快照晚到）最多短暂回显旧态，下一帧自愈——不做逐字段比对的复杂对账。
  useEffect(() => {
    setPatches((prev) => (prev.size === 0 ? prev : new Map()))
  }, [snapshot])

  // 乐观投影：把在途动作的 patch 叠加到 snapshot 上，selectProgress 及所有下游（徽章/箭头带/
  // 详情）自然消费同一份判定——不在视图层散落第二套状态判定（T6 同源谓词纪律）。
  const patchedSnapshot = useMemo(() => {
    if (!snapshot || patches.size === 0) return snapshot
    return {
      ...snapshot,
      projects: snapshot.projects.map((p) => ({
        ...p,
        changes: p.changes.map((c) => {
          const patch = patches.get(rowKeyOf(p.root, c.name))
          if (!patch) return c
          return { ...c, phase: patch.phase ?? c.phase, fields: { ...c.fields, ...patch.fields } }
        }),
      })),
    }
  }, [snapshot, patches])

  const base = useMemo(() => selectProgress(patchedSnapshot, currentRoot, rulesByKey), [patchedSnapshot, currentRoot, rulesByKey])

  function setPatch(key: string, patch: RowPatch | null): void {
    setPatches((prev) => {
      const next = new Map(prev)
      if (patch) next.set(key, patch)
      else next.delete(key)
      return next
    })
  }

  function setBusy(key: string, busy: boolean): void {
    setBusyRows((prev) => {
      const next = new Set(prev)
      if (busy) next.add(key)
      else next.delete(key)
      return next
    })
  }

  /**
   * afk 三动作（终止=cancel / 重试=retry / 放弃=dismiss，决议 #13 文案口径 = demo v5）。
   * 乐观 patch：retry→queued+attempts 清零、dismiss→off（服务端 dismissAfkRun 同语义）；
   * cancel 无即时状态变化（标记文件落地后由 automation 结算），不 patch 只 toast+resync。
   */
  async function afkAction(kind: 'kill' | 'retry' | 'dismiss', root: string, name: string): Promise<void> {
    const key = rowKeyOf(root, name)
    if (busyRows.has(key)) return
    setBusy(key, true)
    const label = t(`progress.act_${kind}`)
    const patch: RowPatch | null =
      kind === 'retry'
        ? { fields: { automation: 'queued', automation_attempts: '0' } }
        : kind === 'dismiss'
          ? { fields: { automation: 'off' } }
          : null
    if (patch) setPatch(key, patch)
    try {
      const endpoint = kind === 'kill' ? 'cancel' : kind
      const res = await fetch(`/api/afk/${encodeURIComponent(name)}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ root }),
      })
      if (!res.ok) {
        throw new Error((await readErrorDetail(res)) || t('progress.act_fail_http', { status: res.status }))
      }
      onToast?.(t('progress.act_ok', { name, label }))
      await onRefresh?.()
    } catch (err) {
      if (patch) setPatch(key, null)
      onToast?.(t('progress.act_fail', { label, msg: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(key, false)
    }
  }

  /** 放行/打回（gate 行）：走同一 transition 校验管线；乐观 patch = phase 直接落到目标步。 */
  async function transitionAction(root: string, name: string, planned: PlannedTransition): Promise<void> {
    const key = rowKeyOf(root, name)
    if (busyRows.has(key)) return
    setBusy(key, true)
    const label = planned.backward ? t('progress.act_reject') : t('progress.act_pass')
    setPatch(key, { phase: planned.to })
    try {
      await postTransition(name, root, planned.event)
      onToast?.(t('progress.act_ok', { name, label }))
      await onRefresh?.()
    } catch (err) {
      setPatch(key, null)
      onToast?.(t('progress.act_fail', { label, msg: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(key, false)
    }
  }

  function toggleRow(key: string): void {
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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

  /**
   * 详情动作条（TaskDetail actions 插槽；决议 #13 props 化下放宿主，文案 = demo v5 prg-dfoot）：
   *   gate → ↩打回（回退边，红 tint）+ →放行（前进边，主按钮）；running → ⏹终止（仅
   *   automation==='running' 可点）；failed → ✕放弃 + ↻重试；agent/queued → 无动作只有说明。
   *   前进/回退边各取第一条（同 TaskDetail firstForward 的「第一条前进边」口径）。
   */
  function detailActions(row: ProgressRow, rules: ProgressRules | undefined): ReactNode {
    const name = row.change.name
    const key = rowKeyOf(row.root, name)
    const busy = busyRows.has(key)
    switch (row.state) {
      case 'gate': {
        if (!rules) return undefined
        const edges = (rules.transitions[row.change.phase] ?? [])
          .map((e) => plannedTransition(rules, row.change.phase, e.to))
          .filter((p): p is PlannedTransition => p !== null)
        const forward = edges.find((p) => !p.backward)
        const backward = edges.find((p) => p.backward)
        if (!forward && !backward) return undefined
        return (
          <>
            {backward && (
              <button
                type="button"
                className="prg-btn prg-btn--danger"
                data-testid={`prg-reject-${name}`}
                disabled={busy}
                onClick={() => void transitionAction(row.root, name, backward)}
              >
                ↩ {t('progress.act_reject')}
              </button>
            )}
            {forward && (
              <button
                type="button"
                className="prg-btn prg-btn--primary"
                data-testid={`prg-pass-${name}`}
                disabled={busy}
                onClick={() => void transitionAction(row.root, name, forward)}
              >
                → {t('progress.act_pass')}
              </button>
            )}
          </>
        )
      }
      case 'running':
        return (
          <button
            type="button"
            className="prg-btn prg-btn--danger"
            data-testid={`prg-dt-kill-${name}`}
            disabled={busy || fieldStr(row.change, 'automation') !== 'running'}
            onClick={() => void afkAction('kill', row.root, name)}
          >
            ⏹ {t('progress.act_kill')}
          </button>
        )
      case 'failed':
        return (
          <>
            <button
              type="button"
              className="prg-btn"
              data-testid={`prg-dismiss-${name}`}
              disabled={busy}
              onClick={() => void afkAction('dismiss', row.root, name)}
            >
              ✕ {t('progress.act_dismiss')}
            </button>
            <button
              type="button"
              className="prg-btn prg-btn--primary"
              data-testid={`prg-dt-retry-${name}`}
              disabled={busy}
              onClick={() => void afkAction('retry', row.root, name)}
            >
              ↻ {t('progress.act_retry')}
            </button>
          </>
        )
      case 'agent': {
        const missing = missingGateArtifacts(row.change, rules)
        return (
          <span className="prg-dfoot-note" data-testid={`prg-note-${name}`}>
            {missing.length > 0
              ? t('progress.note_agent_missing', { fields: missing.join(' ') })
              : t('progress.note_agent')}
          </span>
        )
      }
      case 'queued':
        return (
          <span className="prg-dfoot-note" data-testid={`prg-note-${name}`}>
            {t('progress.note_queued')}
          </span>
        )
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

  // 验收反馈②-②：讲清楚灯只统计「沙箱」范围（判据逐字对齐 server afk.ts computeSchedulerHealth，
  // 只取 running/queued/failed 三桶）——恒显三数（含 0），不再按活跃度切换「调度空闲/调度中」
  // 短词；状态仍由灯点颜色（.prg-doctor__d--{status}）传达，文案只负责讲清楚统计范围。
  const doctorText = t('progress.doctor_counts', {
    running: health.running,
    queued: health.queued,
    failed: health.failed,
  })

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
        <span className="prg-doctor" data-testid="prg-doctor" title={t('progress.doctor_hint')}>
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
                title={s === 'agent' ? t('progress.state_agent_hint') : undefined}
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
                {rows.map((row) => {
                  const rowKey = rowKeyOf(row.root, row.change.name)
                  const rowOpen = openRows.has(rowKey)
                  const rowBusy = busyRows.has(rowKey)
                  return (
                    <div
                      key={row.change.name}
                      className={`prg-row${rowOpen ? ' prg-row--open' : ''}`}
                      data-testid={`prg-row-${row.change.name}`}
                    >
                      {/* 点行展开详情；行内真按钮（终止/重试）点击不触发展开（closest('button') 旁路，
                          键盘 Enter/Space 同判据——按钮自身的 Enter 激活不该顺带 toggle 行）。 */}
                      <div
                        className="prg-row__main"
                        role="button"
                        tabIndex={0}
                        aria-expanded={rowOpen}
                        data-testid={`prg-rowmain-${row.change.name}`}
                        onClick={(e) => {
                          if (e.target instanceof Element && e.target.closest('button')) return
                          toggleRow(rowKey)
                        }}
                        onKeyDown={(e) => {
                          if (e.target instanceof Element && e.target.closest('button')) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleRow(rowKey)
                          }
                        }}
                      >
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
                          <span
                            className={`prg-badge prg-badge--${row.state}`}
                            data-testid={`prg-badge-${row.change.name}`}
                            title={row.state === 'agent' ? t('progress.state_agent_hint') : undefined}
                          >
                            {(row.state === 'gate' || row.state === 'running') && <span className="prg-badge__dot" aria-hidden="true" />}
                            {badgeLabel(row, groupRules)}
                          </span>
                          {row.state === 'running' && (
                            <button
                              type="button"
                              className="prg-btn prg-btn--danger"
                              data-testid={`prg-kill-${row.change.name}`}
                              disabled={rowBusy || fieldStr(row.change, 'automation') !== 'running'}
                              onClick={() => void afkAction('kill', row.root, row.change.name)}
                            >
                              ⏹ {t('progress.act_kill')}
                            </button>
                          )}
                          {row.state === 'failed' && (
                            <button
                              type="button"
                              className="prg-btn"
                              data-testid={`prg-retry-${row.change.name}`}
                              disabled={rowBusy}
                              onClick={() => void afkAction('retry', row.root, row.change.name)}
                            >
                              ↻ {t('progress.act_retry')}
                            </button>
                          )}
                          <span className="prg-caret" aria-hidden="true">▾</span>
                        </div>
                      </div>
                      {rowOpen && (
                        <div className="prg-detail" data-testid={`prg-detail-${row.change.name}`}>
                          <TaskDetail
                            root={row.root}
                            change={row.change}
                            rules={groupRules}
                            variant="tabs"
                            actions={detailActions(row, groupRules)}
                            curStageExtra={
                              row.state === 'running' ? <RunLogPane root={row.root} change={row.change} /> : undefined
                            }
                            onToast={onToast}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
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
