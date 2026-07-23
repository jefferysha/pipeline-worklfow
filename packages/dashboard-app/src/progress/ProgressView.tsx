import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import { isPhase } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import { plannedTransition, type PlannedTransition } from '../model/events'
import { fetchSessionLinks, postAfkCommand, postTransition, type SessionLink } from '../api/client'
import { TaskDetail } from '../shared/TaskDetail'
import { Switch } from '@/components/ui/switch'
import { diagnoseFailureWithCause } from '../shared/failureDiagnosis'
import { shellQuote } from '../shared/shellQuote'
import { gateEvidence, VERIFY_STATUS_FIELDS, type EvidenceChip } from '../inbox/evidence'
import { changeWorkflow, decisionKind } from '../inbox/inbox'
import { useAfkLog } from './useAfkLog'
import {
  WorkflowCanvas,
  type CanvasArchivedChange,
  type CanvasChange,
  type CanvasDotTone,
  type CanvasGroup,
  type CanvasStep,
} from './WorkflowCanvas'
import {
  missingGateArtifacts,
  selectProgress,
  type ProgressRow,
  type ProgressRules,
  type ProgressState,
} from '../model/progressModel'
import './progress.css'
import { CreateChangeDialog } from './CreateChangeDialog'
import { ChevronDown, Plus, Square } from 'lucide-react'

gsap.registerPlugin(useGSAP)

/**
 * ProgressView（v10c 单项目 · 画布即操作面）—— 2026-07-14 拆单项目重做（spec：
 * design-demos/v10c-per-project-spec.md）。进度页永远单项目（App 保证 currentRoot 非空；
 * 聚合与「全部项目」总览钻取归 ProjectsView）；画布卡片即操作面，下方按项目分组的重复在制
 * 列表整段退役——change 只挂在画布相位卡里，点开 = 右滑抽屉（TaskDetail + 全部动作）。
 * 数据层/动作逻辑沿现状：selectProgress、FlatRow 投影、rowSemantics、乐观 patch、
 * killAction/transitionAction、v9-J 会话链接批量预取、抽屉焦点陷阱/Esc/scrim/滚动锁、
 * RunLogPane 轮询。
 *
 *   · 吸顶工具条即页头：状态页签（全部/等你动手/运行中/等待中 + 计数，墨线 GSAP）——页签筛选
 *     作用于画布（未命中的 change 小卡淡出，不移除）。旧「调度」芯片已下线（#6：升级为独立 AFK
 *     视图，schedulerHealth/并发上限的展示归那处；本视图不再消费）。
 *   · 页签语义：等待中 = queued + agent；cancelled 仍归「等你动手」。计数=分类总数不随筛选变。
 *   · workflow 筛选收敛为单一下拉；筛选作用于画布分组，工作流数量增长时不挤占主工具栏。
 *   · 画布 WorkflowCanvas（v6 单项目 workflow 大卡）：一 workflow 一组，有在制的相位=站台卡、空相位=
 *     过路小站，连线纯 CSS；change 小卡完整 mono 名（禁 ellipsis）+ lucide sched 图标（沙箱
 *     机器人 Bot / 终端 Terminal）+ AFK/沙箱极轻 accent tint 区分；小卡点击=openDrawer。归档不
 *     失联：带归档的相位小站点开 = 站台线下方只读列出该相位归档 change。
 *
 * 判定徽章语义（rowSemantics 同源，抽屉徽章消费）：gate=「✓ 可以放行」绿 /「等你判断」红；
 * failed=「失败 ×N · 等你决定」红（cause=cancelled → 琥珀「已取消」）；running=蓝「{phase}
 * 运行中」；排队/等产出=中性。状态一律 data-*（data-state/data-pulse/data-sbx），测试断言
 * data/aria/testid 不断言视觉类名。
 *
 * GSAP（全包 gsap.matchMedia，reduce 分支直达终态）：工具条浮现 → 画布节点弹入（scale+
 * stagger）；墨线滑动、拍板 pulseRow、抽屉开合沿现状逻辑，选择器走 data-anim/data-testid。
 * 呼吸环/脉冲/流动虚线走纯 CSS（progress.css，reduced 停帧），组件内零 JS 循环。
 */

export interface ProgressViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** 单项目进度页：App 保证 view='progress' 时 currentRoot 恒为真实项目 root（非空）——
   *  聚合与「全部项目」总览钻取归 ProjectsView，本视图不再处理空串聚合分支。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集，键=rulesKey(root,wf)（useWorkflowRulesMulti 契约）。 */
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  /** 动作结果 toast（成功/失败都走这里；App 注入 showFlash）。 */
  onToast?: (msg: string) => void
  /** 动作成功后 resync（App 注入 useSnapshot().refresh）。 */
  onRefresh?: () => void | Promise<void>
  /** URL 深链路选中的 change；undefined = 宿主不控制，null = 关闭。 */
  selectedChange?: string | null
  /** 抽屉开合回传给宿主，用于同步可复制 URL。 */
  onSelectedChange?: (name: string | null) => void
}

/** 行级键（busy/抽屉/乐观 patch 共用）：name 字符集受 server 校验限死 [a-zA-Z0-9_-]，'@' 不会撞。 */
function rowKeyOf(root: string, name: string): string {
  return `${name}@${root}`
}

/** 乐观 patch：动作发出即叠加到 snapshot 投影上，成功等 SSE/refresh 落地，失败回滚。 */
interface RowPatch {
  phase?: string
  fields?: Record<string, string>
  /** Bug4：patch 施加时该 change 的真值基线——区分「server 尚未处理该动作（保留 patch）」vs
   *  「已推进（无论是否恰达 patch 目标都清）」，避免被无关项目的帧整清导致回弹抖动。 */
  base: { phase: string; fields: Record<string, string> }
}

/** patch 是否已在 snapshot 落地（真值恰达 patch 目标）。 */
function patchLanded(patch: RowPatch, change: ChangeSnapshot): boolean {
  if (patch.phase !== undefined && change.phase !== patch.phase) return false
  if (patch.fields) {
    for (const [k, v] of Object.entries(patch.fields)) if (fieldStr(change, k) !== v) return false
  }
  return true
}

/** patch 施加后真值是否已离开基线（server 已处理该动作，即便未恰达 patch 目标，也该让位真值）。 */
function patchMovedFromBase(patch: RowPatch, change: ChangeSnapshot): boolean {
  if (patch.phase !== undefined && change.phase !== patch.base.phase) return true
  if (patch.fields) {
    for (const k of Object.keys(patch.fields)) if (fieldStr(change, k) !== (patch.base.fields[k] ?? '')) return true
  }
  return false
}

/** 非 2xx 响应尽量读出 server 的 { error } 文案（同 useAfkLog.ts 的局部拷贝先例）。 */
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

type Tr = (key: string, vars?: Record<string, string | number>) => string

/**
 * 步 id → 展示名：自定义步优先用用户设置的 label（rules.labelByStep），缺键/空 label 回退
 * step id；default 七相（labelByStep 缺省）走 phases.* i18n——行为逐字沿旧 ChevronFlow（观察项①）。
 */
function stepLabel(step: string, labelByStep: Record<string, string> | undefined, t: Tr): string {
  const custom = labelByStep?.[step]
  if (custom) return custom
  return isPhase(step) ? t(`phases.${step}`) : step
}

// ── 行语义（自 InboxView 搬运，该文件随收件箱退役删除；判定口径逐字保留）──

/** 行/抽屉共用的结论式语义（demo v5 三情形口径）：badge 一句结论 + lead 一句人话（lead 自
 *  v10b 起不再在行内渲染——处置指引在抽屉 TaskDetail，函数形状保留供 tone/badge 同源判定）。 */
interface RowSemantics {
  tone: 'green' | 'red'
  badgeText: string
  lead: string
}

/**
 * 行语义判定（搬运自 InboxView rowSemantics，T9 demo v5 三情形口径）：
 *   · failed（automation ∈ {failed, conflict}）→「失败 ×N · 等你决定」；
 *   · gate 且证据里有未过判定（verify 三轨白名单——产物没产出不等于验证没过，Important-1
 *     教训沿用）或根本没有任何自动证据（自定义门/纯人判）→「等你判断」；
 *   · gate 且证据齐 →「✓ 可以放行」。
 * 纯函数（t 注入），行体与抽屉头部 badge 同源消费，两处不漂移。
 */
function rowSemantics(change: ChangeSnapshot, state: ProgressState, evidence: EvidenceChip[], t: Tr): RowSemantics {
  if (state === 'failed') {
    const attempts = fieldStr(change, 'automation_attempts')
    const err = fieldStr(change, 'automation_last_error') || t('detail.fail_generic')
    return {
      tone: 'red',
      badgeText: attempts !== '' ? t('inbox.badge_failed', { n: attempts }) : t('inbox.badge_failed_plain'),
      lead: attempts !== '' ? t('inbox.lead_failed', { err, n: attempts }) : t('inbox.lead_failed_plain', { err }),
    }
  }
  const hasJudgment = evidence.some((c) => !c.unset)
  if (!hasJudgment) {
    return { tone: 'red', badgeText: t('inbox.badge_judge'), lead: t('inbox.lead_judge', { wf: changeWorkflow(change) }) }
  }
  const kind = decisionKind(change)
  const failedTracks = evidence.filter(
    (c) => (VERIFY_STATUS_FIELDS as readonly string[]).includes(c.key) && c.tone !== 'pass',
  )
  if (kind === 'verify' && failedTracks.length > 0) {
    return {
      tone: 'red',
      badgeText: t('inbox.badge_judge'),
      lead: t('detail.why_gate', { names: failedTracks.map((c) => c.key.replace(/_result$/, '')).join('、') }),
    }
  }
  return {
    tone: 'green',
    badgeText: t('inbox.badge_pass'),
    lead: kind === 'verify' ? t('inbox.lead_verify_pass') : t(`inbox.awaiting.${kind}`),
  }
}

/** 一枚人话判定徽章的渲染数据：绿/红=rowSemantics 同源；蓝=运行中；琥珀=已取消；中性=排队/等产出。 */
interface RowBadge {
  tone: 'green' | 'red' | 'blue' | 'amb' | 'neutral'
  text: string
}

// ── running 行抽屉内日志区（testid 沿用 prg-log*；样式 tailwind 化）──

/**
 * afk 型 running 行的日志尾部：useAfkLog（2.5s 轮询——status 传 automation 原始值，仅
 * 'running' 时轮询）+ 跟随开关 +「沙箱内阶段」行（automation_current_phase）。挂在抽屉内
 * TaskDetail 之下；抽屉关闭即组件卸载，轮询随之停止（useAfkLog cleanup）。
 */
function RunLogPane({ root, change }: { root: string; change: ChangeSnapshot }): JSX.Element {
  const { t } = useT()
  const { log, follow, setFollow } = useAfkLog(change.name, fieldStr(change, 'automation'), root)
  const sandboxPhase = fieldStr(change, 'automation_current_phase')
  return (
    <div className="mt-4 border-t border-border pt-3" data-testid={`prg-log-${change.name}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-text-3">{t('progress.log_label')}</span>
        <span className="flex items-center gap-2 text-xs text-text-2">
          {t('progress.follow_tail')}
          <Switch
            checked={follow}
            onCheckedChange={setFollow}
            size="sm"
            aria-label={t('progress.follow_tail')}
            data-testid={`prg-follow-${change.name}`}
          />
        </span>
      </div>
      <pre
        className="max-h-[220px] overflow-auto rounded-lg border border-code-border bg-code-bg p-2.5 font-mono text-xs leading-relaxed text-text-2"
        data-testid={`prg-logtext-${change.name}`}
      >
        {log}
      </pre>
      {sandboxPhase !== '' && (
        <p className="mt-2 text-xs text-text-3" data-testid={`prg-sandbox-phase-${change.name}`}>
          {t('progress.sandbox_phase', { phase: sandboxPhase })}
        </p>
      )}
    </div>
  )
}

// ── 视图 ──

/** 统一列表的行投影：state/rules/need 一次算好，渲染与动效共用。 */
interface FlatRow {
  key: string
  row: ProgressRow
  rules: ProgressRules | undefined
  workflow: string
  /** 需要人动手（gate/failed，含 cancelled）——分色 ring 高亮（gate 绿/fail 红/cxl 琥珀）+ 排前 + 行内动作。 */
  need: boolean
  /** failed 且结构化/regex 判为 cancelled（人为终止非故障）→ 琥珀徽章 + warn 轨。 */
  cancelled: boolean
}

/** ProgressRow → FlatRow 投影（need/cancelled 一次算好）：live 行与 #2 归档只读行共用同一份
 *  判定——归档行渲染走 renderRow(fr, true) 时会强制只读/mute 轨，state 判定本身不因归档而变。 */
function toFlatRow(row: ProgressRow, rules: ProgressRules | undefined, workflow: string): FlatRow {
  const need = row.state === 'gate' || row.state === 'failed'
  const cancelled =
    row.state === 'failed' &&
    diagnoseFailureWithCause(fieldStr(row.change, 'automation_cause'), fieldStr(row.change, 'automation_last_error')).cause === 'cancelled'
  return { key: rowKeyOf(row.root, row.change.name), row, rules, workflow, need, cancelled }
}

/** 归档 change 展示序（画布相位小站折叠面）：updated_at 倒序、并列 name 升序。 */
function compareArchived(a: ChangeSnapshot, b: ChangeSnapshot): number {
  if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? 1 : -1
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

// ── 状态页签 + 调度标识（纯谓词，渲染与计数共用同一口径不漂移）──

/** 页签字典（顺序即渲染序，demo .tabs：全部/等你动手/运行中/等待中）。 */
const DECK_TABS = ['all', 'need', 'run', 'queue'] as const
type DeckTab = (typeof DECK_TABS)[number]

// #3 抽屉焦点陷阱（评审 P3 登记项，无障碍）：标准可聚焦元素白名单——同 WAI-ARIA APG focus-trap
// 惯用判据，disabled 的 button 天然不可聚焦故排除，tabindex="-1" 显式退出 tab 序也排除。
const DRAWER_FOCUSABLE_SEL = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/** 页签分类口径（五态同源谓词——不在视图层摸 automation 原始字段，T6 纪律）：
 *  need=现有 need 判定（gate/failed，失败/取消归此不单列）；run=running 态（progressModel
 *  已折叠 scheduled）；queue=等待中（v10b §4.1 语义微调：queued+agent——排队与等产出都在等
 *  系统/agent，修复 agent 行只在「全部」可见的孤儿态，demo waiting 口径）；all=全部。 */
function deckMatch(fr: FlatRow, tab: DeckTab): boolean {
  switch (tab) {
    case 'all':
      return true
    case 'need':
      return fr.need
    case 'run':
      return fr.row.state === 'running'
    case 'queue':
      return fr.row.state === 'queued' || fr.row.state === 'agent'
  }
}

/** 调度标识（demo 小卡调度符 ▦/⌨）：▦ 沙箱=自动化三桶（running/queued/failed 态，与调度灯
 *  schedulerHealth 同折叠口径——running 含 scheduled、failed 含 conflict）；其余（off/无/merged/
 *  paused 等活在终端的）=⌨ 终端。 */
function inSandbox(fr: FlatRow): boolean {
  return fr.row.state === 'running' || fr.row.state === 'queued' || fr.row.state === 'failed'
}

// ── tailwind 类词组（视觉词汇集中一处，行内/抽屉/画布不各写一份）──

/** 前进（放行）钮：绿实底（v8 主按钮 token）。 */
const BTN_GO_CLS =
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-semibold text-btn-fg hover:bg-btn-hover disabled:opacity-50'
/** 反向（打回/终止）钮：中性边 + 红字。 */
const BTN_NEG_CLS =
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-red-d hover:border-red-b hover:bg-red-t disabled:opacity-50'
/** 判定徽章 tone 配色（token 家族 -t 底 + -d 字）。 */
const BADGE_TONE_CLS: Record<RowBadge['tone'], string> = {
  green: 'bg-green-t text-green-d',
  red: 'bg-red-t text-red-d',
  blue: 'bg-accent-t text-accent-d',
  amb: 'bg-amb-t text-amb-d',
  neutral: 'bg-fill-2 text-text-2',
}

export function ProgressView({ snapshot, loading, error, currentRoot, rulesByKey, onToast, onRefresh, selectedChange, onSelectedChange }: ProgressViewProps): JSX.Element {
  const { t } = useT()
  const rootRef = useRef<HTMLElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  // #3 抽屉焦点陷阱：打开前记住触发元素（行名按钮/画布小卡），关闭时归还焦点。
  const triggerElRef = useRef<HTMLElement | null>(null)
  const [busyRows, setBusyRows] = useState<ReadonlySet<string>>(new Set())
  const [patches, setPatches] = useState<ReadonlyMap<string, RowPatch>>(new Map())
  // 详情抽屉：行名/画布小卡点击打开；Esc/scrim/关闭钮关闭。行离场（归档/换项目）→ 引用失配自动收起。
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  // 状态页签（默认全部）。
  const [deckTab, setDeckTab] = useState<DeckTab>('all')
  // 工作流筛选保持为单一 select，避免工作流增多后横向堆满筛选栏。
  const [wfFilter, setWfFilter] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)

  // Bug4：新 snapshot 到达即按 change **逐条**清乐观 patch——只清「已落地（真值达目标）或已离开
  // 施加基线（server 已推进）」的那条，保留其余项目仍在途、尚未反映的 patch。
  useEffect(() => {
    setPatches((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      let changed = false
      for (const [key, patch] of prev) {
        const at = key.indexOf('@')
        const name = key.slice(0, at)
        const root = key.slice(at + 1)
        const change = snapshot?.projects.find((p) => p.root === root)?.changes.find((c) => c.name === name)
        if (!change || patchLanded(patch, change) || patchMovedFromBase(patch, change)) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [snapshot])

  // 乐观投影：把在途动作的 patch 叠加到 snapshot 上，selectProgress 及所有下游（徽章/相位轨/
  // 画布/抽屉）自然消费同一份判定——不在视图层散落第二套状态判定（T6 同源谓词纪律）。
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

  // change 投影打平（单项目语境：base.groups 是当前项目的各 workflow 组）——画布 change 小卡、
  // 页签计数、GSAP 入场键、抽屉行查找共用同一份 FlatRow。列表已退役，无需再按需操作/时间排序。
  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = []
    for (const group of base.groups) {
      const rules = rulesByKey.get(group.key) as ProgressRules | undefined
      for (const row of group.rows) out.push(toFlatRow(row, rules, group.workflow))
    }
    return out
  }, [base, rulesByKey])
  const frByKey = useMemo(() => new Map(flatRows.map((fr) => [fr.key, fr])), [flatRows])

  // URL 首次进入 / 浏览器前进后退：等 snapshot 与 workflow 投影准备好，再按 root+name 精确开抽屉。
  // selectedChange=undefined 保持旧的非受控组件契约，既有独立测试与嵌入方不受影响。
  useEffect(() => {
    if (selectedChange === undefined) return
    if (selectedChange === null) {
      if (drawerKey !== null) setDrawerKey(null)
      return
    }
    const key = rowKeyOf(currentRoot, selectedChange)
    if (frByKey.has(key) && drawerKey !== key) setDrawerKey(key)
  }, [currentRoot, drawerKey, frByKey, selectedChange])

  // 页签计数=各分类总数（不随当前筛选变）。
  const deckCounts = useMemo(
    () => ({
      all: flatRows.length,
      need: flatRows.filter((fr) => deckMatch(fr, 'need')).length,
      run: flatRows.filter((fr) => deckMatch(fr, 'run')).length,
      queue: flatRows.filter((fr) => deckMatch(fr, 'queue')).length,
    }),
    [flatRows],
  )

  // v10b §4.2：出现过的 workflow 名（有活跃行的组；组序沿 selectProgress——root 升序、default
  // 恒前，按名去重聚合）。选中的 workflow 若随快照消失，effectiveWf 静默回落「全部」。
  const wfNames = useMemo(() => {
    const names: string[] = []
    for (const g of base.groups) if (g.rows.length > 0 && !names.includes(g.workflow)) names.push(g.workflow)
    return names
  }, [base])
  const effectiveWf = wfFilter !== 'all' && wfNames.includes(wfFilter) ? wfFilter : 'all'

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

  /** Bug4：从当前（未 patch 的）snapshot 取某 change 的真值基线，供 patch 落地/让位判定。 */
  function baseOf(root: string, name: string): RowPatch['base'] {
    const change = snapshot?.projects.find((p) => p.root === root)?.changes.find((c) => c.name === name)
    const fields: Record<string, string> = {}
    if (change) for (const k of Object.keys(change.fields)) fields[k] = fieldStr(change, k)
    return { phase: change?.phase ?? '', fields }
  }

  /** 拍板成功的即时反馈：画布 change 小卡 settle + 抽屉徽章回落 pulse。reduced-motion /
   *  无 matchMedia → 不放（状态变化本身即反馈）。 */
  function pulseRow(name: string): void {
    if (typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const root = rootRef.current
    if (!root) return
    const cardEl = root.querySelector(`[data-testid="prg-cv-chg-${name}"]`)
    const bdg = root.querySelector('[data-testid="prg9-dw-badge"]')
    if (cardEl) gsap.fromTo(cardEl, { scale: 0.985 }, { scale: 1, duration: 0.3, ease: 'back.out(2)', clearProps: 'transform' })
    if (bdg) gsap.fromTo(bdg, { scale: 1.25 }, { scale: 1, duration: 0.35, ease: 'back.out(2)', clearProps: 'transform' })
  }

  /**
   * running 行终止（cancel-gate 纪律：仅 automation==='running' 可点）。cancel 无即时状态
   * 变化（标记文件落地后由 automation 结算），不 patch 只 toast+resync。重试/放弃已随
   * 「回终端」纪律退出 UI（真机验收 G）——fail/cxl 行给终端命令 chip（cmdChipOf），
   * 对应端点 postAfkRetry/postAfkDismiss 保留在 api 层、此处不再有消费方与乐观 patch 分支。
   */
  async function killAction(root: string, name: string): Promise<void> {
    const key = rowKeyOf(root, name)
    if (busyRows.has(key)) return
    setBusy(key, true)
    const label = t('progress.act_kill')
    try {
      const res = await postAfkCommand(name, root, 'cancel')
      if (!res.ok) {
        throw new Error((await readErrorDetail(res)) || t('progress.act_fail_http', { status: res.status }))
      }
      onToast?.(t('progress.act_ok', { name, label }))
      pulseRow(name)
      await onRefresh?.()
    } catch (err) {
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
    setPatch(key, { base: baseOf(root, name), phase: planned.to })
    try {
      await postTransition(name, root, planned.event)
      onToast?.(t('progress.act_ok', { name, label }))
      pulseRow(name)
      await onRefresh?.()
    } catch (err) {
      setPatch(key, null)
      onToast?.(t('progress.act_fail', { label, msg: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(key, false)
    }
  }

  // v9-J：failed 行「回终端」chip 批量预取（产品决策=批量端点而非逐行发请求，也不是等用户点开
  // 抽屉才有数据——行内 chip 在需要时批量出现，一次查全部失败行）。依赖键=当前 failed 行
  // key+automation_worktree 值拼串（同 animKey 写法）：键不变（哪怕 SSE 帧刷新了其它无关字段）
  // 就不重打请求；失败行成员真正增减，或某行 automation_worktree 换了新沙箱现场（codex review
  // P2：自动重试重新分配 worktree 后，旧一批预取结果若命中 found:false 会一直卡在静态兜底命令，
  // 直到这里重拉才能看到新现场的真恢复命令）才重拉。已知残留（如实登记不追）：worktree 不变、
  // 用户手动在同一目录另起新终端会话这种更罕见场景不在本次修复范围，不为它引入轮询这种更重的
  // 机制。
  const failedRowsKey = flatRows
    .filter((fr) => fr.row.state === 'failed')
    .map((fr) => `${fr.key}:${fieldStr(fr.row.change, 'automation_worktree')}`)
    .sort()
    .join('|')
  const [sessionLinks, setSessionLinks] = useState<ReadonlyMap<string, SessionLink>>(new Map())
  useEffect(() => {
    if (failedRowsKey === '') {
      setSessionLinks(new Map())
      return
    }
    let cancelled = false
    const failedRows = flatRows.filter((fr) => fr.row.state === 'failed')
    // codex review 第四轮 P2：重新拉取前先清掉这批行在 sessionLinks 里的旧条目——否则 worktree
    // 换了新现场后，在新请求落地之前（网络异常挂起时可能无限久）会一直吐出上一批可能已经指向
    // 错误/过期 worktree 的 resumeCmd，用户按下去接管的其实是不相关的旧会话。清空期间 cmdChipOf
    // 落回静态兜底命令——诚实缺省优先于展示可能张冠李戴的假信息。成功回调仍是整表替换（沿用
    // new Map(Object.entries(result))），顺带清理「已不再 failed」的陈旧条目，无需额外处理。
    setSessionLinks((prev) => {
      const next = new Map(prev)
      for (const fr of failedRows) next.delete(fr.key)
      return next
    })
    fetchSessionLinks(failedRows.map((fr) => ({ root: fr.row.root, name: fr.row.change.name })))
      .then((result) => {
        if (!cancelled) setSessionLinks(new Map(Object.entries(result)))
      })
      .catch(() => {
        /* fail-open：接口失败静默不设表，chip 落回现状静态命令（cmdChipOf 的既有兜底分支） */
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 蓄意只随 failedRowsKey 重拉，见上注释
  }, [failedRowsKey])

  // ── GSAP 入场（spec §4.6）：工具条浮现 → 画布节点弹入（scale+stagger，全包 matchMedia，
  //    reduce 直达终态）。依赖键 = change 成员指纹（仅排序后的 name 集合）：增删 change 才重放
  //    入场；单条状态变化（SSE 帧常态）不整画布重播 stagger——否则任一帧都会盖掉 pulseRow 的
  //    单条强调（评审 P2-6）。循环动效（呼吸环/脉冲/流动虚线）与站台连接段全是纯 CSS
  //    （progress.css，reduced-motion 停帧），不在这里放 JS 循环；画布站点（小站/站台卡）
  //    统一挂 [data-anim="prg-node"]，弹入 stagger 直接吃新结构。──
  const animKey = flatRows.map((fr) => fr.row.change.name).sort().join('|')
  useGSAP(
    () => {
      const el = rootRef.current
      if (!el) return
      // 环境不支持 matchMedia（jsdom/极老内核）：静态呈现即终态，不放任何动画。
      if (typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          const chrome = el.querySelectorAll<HTMLElement>('[data-anim="prg-chrome"]')
          const nodes = el.querySelectorAll<HTMLElement>('[data-anim="prg-node"]')
          if (reduce) {
            // 直达终态：工具条/画布节点全可见原位（CSS 循环由 media query 自停）。
            gsap.set(chrome, { autoAlpha: 1, y: 0 })
            gsap.set(nodes, { autoAlpha: 1, scale: 1 })
            return
          }
          if (chrome.length > 0) {
            gsap.fromTo(chrome, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.07, clearProps: 'all' })
          }
          if (nodes.length > 0) {
            gsap.fromTo(
              nodes,
              { autoAlpha: 0, scale: 0.9 },
              { autoAlpha: 1, scale: 1, duration: 0.32, ease: 'back.out(1.8)', stagger: 0.04, delay: 0.08, clearProps: 'all' },
            )
          }
        },
      )
    },
    { scope: rootRef, dependencies: [animKey], revertOnUpdate: true },
  )

  // ── 状态页签墨线滑动。墨线不挂 revertOnUpdate——revert 会把墨线 inline left/width 打回缺省
  //    （left:0 width:0），每次切换都从最左飞入；gsap.to 天然从当前位置延续滑动，overwrite:'auto'
  //    收编快速连点。reduced 墨线直落位。deps 含 animKey：change 成员变化后页签宽度（计数位数）
  //    可能变，墨线要补一次落位。──
  useGSAP(
    () => {
      const el = rootRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          const ink = el.querySelector<HTMLElement>('[data-anim="prg-ink"]')
          const onTab = el.querySelector<HTMLElement>(`[data-testid="prg9t-tab-${deckTab}"]`)
          if (ink && onTab?.parentElement) {
            const tr = onTab.getBoundingClientRect()
            const pr = onTab.parentElement.getBoundingClientRect()
            const left = tr.left - pr.left + 6
            const width = Math.max(tr.width - 12, 0)
            if (reduce) gsap.set(ink, { left, width })
            else gsap.to(ink, { left, width, duration: 0.28, ease: 'expo.out', overwrite: 'auto' })
          }
        },
      )
    },
    { scope: rootRef, dependencies: [deckTab, animKey] },
  )

  // ── 抽屉开合：滚动锁 + Esc + GSAP 右滑入场/滑出退场（reduce 直达终态）──
  const drawerRow = drawerKey !== null ? (flatRows.find((fr) => fr.key === drawerKey) ?? null) : null
  const drawerOpen = drawerRow !== null

  /** 退场补间：滑回场外 x:103%（~.24s power3.in）+ scrim 淡出，onComplete 才卸载；
   *  reduced/无 matchMedia 直接卸载。closingRef 双守门：退场中再点退路不重复补间、
   *  退场中点行名不重开。 */
  const closingRef = useRef(false)
  const closeDrawer = useCallback((): void => {
    if (closingRef.current) return
    const drawer = drawerRef.current
    const scrim = scrimRef.current
    const motion =
      typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!motion || !drawer || !scrim) {
      setDrawerKey(null)
      onSelectedChange?.(null)
      return
    }
    closingRef.current = true
    gsap.to(scrim, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' })
    gsap.to(drawer, {
      xPercent: 103,
      duration: 0.24,
      ease: 'power3.in',
      onComplete: () => {
        closingRef.current = false
        setDrawerKey(null)
        onSelectedChange?.(null)
      },
    })
  }, [onSelectedChange])
  /** #3：trigger 优先取调用点显式传入的元素（行名按钮/画布小卡 click 事件的 e.currentTarget
   *  ——jsdom 下 fireEvent.click 不会像真实浏览器那样把焦点先移到被点元素，
   *  document.activeElement 在合成点击时仍是先前焦点，故不能只靠它；真实浏览器场景下两者
   *  通常一致）；未传时退化取当前 document.activeElement，保底不留 undefined。 */
  const openDrawer = useCallback((key: string, trigger?: HTMLElement | null): void => {
    if (closingRef.current) return
    triggerElRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setDrawerKey(key)
    const separator = key.indexOf('@')
    onSelectedChange?.(separator === -1 ? key : key.slice(0, separator))
  }, [onSelectedChange])

  useEffect(() => {
    if (!drawerOpen) return
    document.documentElement.classList.add('prg9-lock')
    /** #3 焦点陷阱：Tab/Shift+Tab 在抽屉内可聚焦元素集合里循环——首/末边界手动拦截+
     *  focus()（jsdom 无原生 tab 序移动，中间元素交给浏览器默认行为处理，这里只收口两端
     *  绕出抽屉的情形）；焦点若已经跑到抽屉外（比如脚本式 .focus() 或极端时序竞态），
     *  按 Tab 方向拉回对应一端，不放它留在外面。 */
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        closeDrawer()
        return
      }
      if (e.key !== 'Tab') return
      const drawer = drawerRef.current
      if (!drawer) return
      const focusables = Array.from(drawer.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SEL))
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      const inside = active instanceof HTMLElement && drawer.contains(active)
      if (!inside) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      // 卸载兜底重置：抽屉若因数据变化直接消失（行被归档等），退场守门不悬挂；同一时机把焦点
      // 还给触发它的元素（#3：drawerOpen true→false 的唯一收口点，覆盖 closeDrawer 的两条退场
      // 分支 + 数据消失直接卸载的兜底路径）。元素可能已随数据变化被移出 DOM——isConnected 判假
      // 就静默跳过，不勉强 focus 也不抛错。
      closingRef.current = false
      document.documentElement.classList.remove('prg9-lock')
      document.removeEventListener('keydown', onKey)
      const trigger = triggerElRef.current
      if (trigger?.isConnected) trigger.focus()
    }
  }, [drawerOpen, closeDrawer])

  // #3：抽屉打开后焦点移入抽屉内关闭钮（TaskDetail 渲染的 detail-close，抽屉内唯一关闭钮）——
  // 与滚动锁/Esc 的 effect 分开一个更聚焦：依赖 [drawerOpen]，抽屉挂载与本效果同一次 commit，
  // drawerRef.current 此时已就位（DOM 已提交，effect 才跑），不需要额外等一帧。
  useEffect(() => {
    if (!drawerOpen) return
    const closeBtn = drawerRef.current?.querySelector<HTMLElement>('[data-testid="detail-close"]')
    closeBtn?.focus()
  }, [drawerOpen])

  useGSAP(
    () => {
      const drawer = drawerRef.current
      const scrim = scrimRef.current
      if (!drawer || !scrim) return
      if (typeof window.matchMedia !== 'function') {
        // 无 matchMedia：直达可见（CSS 缺省停在场外 translateX(103%)，这里必须归零）。
        gsap.set(drawer, { x: 0, xPercent: 0 })
        gsap.set(scrim, { autoAlpha: 1 })
        return
      }
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          if (reduce) {
            gsap.set(drawer, { x: 0, xPercent: 0 })
            gsap.set(scrim, { autoAlpha: 1 })
            return
          }
          gsap.fromTo(scrim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' })
          gsap.fromTo(drawer, { x: 0, xPercent: 103 }, { xPercent: 0, duration: 0.3, ease: 'expo.out' })
        },
      )
    },
    { scope: rootRef, dependencies: [drawerKey] },
  )

  // ── change 投影：徽章/状态点（抽屉徽章 + 画布小卡共用同源判定）──

  /** 当前相位展示名（自定义步用 labelByStep，default 走 phases.* i18n）——抽屉徽章 running 文案用。 */
  function phaseLabelOf(fr: FlatRow): string {
    return stepLabel(fr.row.change.phase, fr.rules?.labelByStep, t)
  }

  /** 一枚人话判定徽章（gate/failed 复用 rowSemantics 同源判定；行内导语已退役，§4.5）。 */
  function judge(fr: FlatRow, evidence: EvidenceChip[], phaseLabel: string): RowBadge {
    const c = fr.row.change
    switch (fr.row.state) {
      case 'gate': {
        const sem = rowSemantics(c, 'gate', evidence, t)
        return { tone: sem.tone, text: sem.badgeText }
      }
      case 'failed': {
        if (fr.cancelled) return { tone: 'amb', text: t('progress.badge_cancelled') }
        const sem = rowSemantics(c, 'failed', [], t)
        return { tone: 'red', text: sem.badgeText }
      }
      case 'running':
        return { tone: 'blue', text: t('progress.badge_running', { phase: phaseLabel }) }
      case 'queued':
        return { tone: 'neutral', text: t('progress.state_queued') }
      case 'agent': {
        const missing = missingGateArtifacts(c, fr.rules)
        return {
          tone: 'neutral',
          text: missing.length > 0 ? t('progress.state_agent_missing', { fields: missing.join(' ') }) : t('progress.state_agent'),
        }
      }
    }
  }

  /** 状态点语义（画布小卡/站点共用同一判定，rowSemantics 同源，不另起第二套五态映射）。
   *  #4 颜色收敛：state 仍分档承载语义（testid/aria/data-state 消费），tone 只走信号最小集——
   *  失败 red、门/取消 amber、运行中 accent(blue)、其余（等产出/排队等）中性 gray。 */
  function dotOf(fr: FlatRow): { state: string; tone: CanvasDotTone } {
    switch (fr.row.state) {
      case 'gate': {
        const sem = rowSemantics(fr.row.change, 'gate', gateEvidence(fr.row.change, fr.rules), t)
        return { state: sem.tone === 'green' ? 'gateok' : 'gatejudge', tone: 'amb' }
      }
      case 'failed':
        return fr.cancelled ? { state: 'cancelled', tone: 'amb' } : { state: 'failed', tone: 'red' }
      case 'running':
        return { state: 'running', tone: 'blue' }
      case 'queued':
        return { state: 'queued', tone: 'gray' }
      case 'agent':
        return { state: 'agent', tone: 'gray' }
    }
  }

  /** testid 由调用点给：行内 prg9-badge-{name}、抽屉 prg9-dw-badge——同名双挂会撞 getByTestId。 */
  function badgeEl(fr: FlatRow, b: RowBadge, testid: string): JSX.Element {
    return (
      <span
        className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-md px-2 py-[1.5px] text-xs font-semibold ${BADGE_TONE_CLS[b.tone]}`}
        data-tone={b.tone}
        data-testid={testid}
        title={fr.row.state === 'agent' ? t('progress.state_agent_hint') : undefined}
      >
        {(b.tone === 'red' || b.tone === 'blue' || b.tone === 'amb') && (
          <span className="h-1.5 w-1.5 rounded-full bg-current" data-pulse={b.tone === 'blue' || undefined} aria-hidden="true" />
        )}
        {b.text}
      </span>
    )
  }

  /** fail/cxl 行「回终端」命令 chip 数据（真机验收 G）：v9-J 批量预取命中真恢复会话
   *  （session-link found + resumeCmd 非 null）→ 优先给真恢复命令，直接可拷贝执行接回原会话；
   *  否则落回现状：cxl=重跑命令（人为终止后重新入队）；fail 有 worktree 现场→cd 接管（与
   *  TaskDetail 的 worktreeCmd 同款 shellQuote 转义，codex review P2-2 同族），缺现场回落
   *  重跑命令。 */
  function cmdChipOf(fr: FlatRow): { label: string; cmd: string } {
    const link = sessionLinks.get(fr.key)
    if (link?.found && link.resumeCmd) return { label: t('progress.cmd_resume'), cmd: link.resumeCmd }
    // #6 按名重跑走 `pipeline afk enqueue <name>`：afk run 忽略 name、跑整轮；enqueue 才是唯一能把
    // 该 change 按名重新摆进 AFK 队列的命令（server afk.ts::enqueueAfkRun 同源），是正确的按名重跑。
    const rerun = `pipeline afk enqueue ${shellQuote(fr.row.change.name)}`
    if (fr.cancelled) return { label: t('progress.cmd_rerun_cxl'), cmd: rerun }
    const worktree = fieldStr(fr.row.change, 'automation_worktree')
    if (worktree !== '') return { label: t('progress.cmd_takeover'), cmd: `cd ${shellQuote(worktree)}` }
    return { label: t('progress.cmd_rerun'), cmd: rerun }
  }

  /** 命令 chip 点击=拷贝+toast（沿 TaskDetail copy 姿势：clipboard 可选链，成功才报）。 */
  function copyCmd(cmd: string): void {
    void navigator.clipboard?.writeText(cmd).then(() => {
      onToast?.(t('detail.copied', { value: cmd }))
    })
  }

  /**
   * change 动作（画布卡点开 → 抽屉动作条消费）：gate=放行（带目标相位）/打回；failed/cancelled=
   * 「回终端」命令 chip（v9-J 批量预取命中真恢复会话优先，否则重跑/接管兜底——诚实缺省）；
   * running=终止（仅 automation==='running' 可点）；排队/等产出=无动作 → undefined。
   * 2+ 条同向出边一条不落（旧 InboxView 纪律回归）：前进边逐条渲染（首选边保持「放行进入
   * {目标相位}」，其余以事件名呈现 inbox.act_forward）；回退边逐条渲染，一律带目标相位
   * （inbox.act_backward——多回退边只写「打回」无从分辨去处）。
   * dw 参数保留 testid 前缀契约（抽屉挂 prg9-dw-）——列表退役后仅抽屉调用（dw=true）。
   */
  function actionsFor(fr: FlatRow, dw = false): ReactNode | undefined {
    const name = fr.row.change.name
    const busy = busyRows.has(fr.key)
    const tid = (act: string): string => `prg9-${dw ? 'dw-' : ''}${act}-${name}`
    switch (fr.row.state) {
      case 'gate': {
        const rules = fr.rules
        if (!rules) return undefined
        const edges = (rules.transitions[fr.row.change.phase] ?? [])
          .map((e) => plannedTransition(rules, fr.row.change.phase, e.to))
          .filter((p): p is PlannedTransition => p !== null)
        const forwards = edges.filter((p) => !p.backward)
        const backwards = edges.filter((p) => p.backward)
        if (forwards.length === 0 && backwards.length === 0) return undefined
        return (
          <>
            {forwards.map((p, i) => (
              <button
                key={`fw-${p.event}`}
                type="button"
                className={BTN_GO_CLS}
                data-testid={i === 0 ? tid('pass') : tid(`fw-${p.event}`)}
                disabled={busy}
                onClick={() => void transitionAction(fr.row.root, name, p)}
              >
                {i === 0
                  ? <>→ {t('progress.act_pass_to', { to: stepLabel(p.to, rules.labelByStep, t) })}</>
                  : t('inbox.act_forward', { to: p.event })}
              </button>
            ))}
            {backwards.map((p, i) => (
              <button
                key={`bw-${p.event}`}
                type="button"
                className={BTN_NEG_CLS}
                data-testid={i === 0 ? tid('reject') : tid(`bw-${p.event}`)}
                disabled={busy}
                onClick={() => void transitionAction(fr.row.root, name, p)}
              >
                {t('inbox.act_backward', { to: stepLabel(p.to, rules.labelByStep, t) })}
              </button>
            ))}
          </>
        )
      }
      case 'failed': {
        // 真机验收 G：重试/放弃不在进度上点——给一枚可拷贝的终端命令 chip（抽屉动作条内，作为
        // 显眼的一键恢复 CTA；TaskDetail 另有完整连接现场命令卡兜底更多字段）。
        const chip = cmdChipOf(fr)
        return (
          <button
            type="button"
            className="inline-flex max-w-full items-center gap-2 rounded-[7px] border border-code-border bg-code-bg px-2.5 py-[5px] text-left text-xs text-text-2 hover:border-(--accent)"
            data-testid={tid('cmd')}
            title={chip.cmd}
            aria-label={`${chip.label}：${chip.cmd}`}
            onClick={() => copyCmd(chip.cmd)}
          >
            {chip.label}
            <span className="truncate font-mono">{chip.cmd}</span>
          </button>
        )
      }
      case 'running':
        return (
          <button
            type="button"
            className={BTN_NEG_CLS}
            data-testid={tid('kill')}
            disabled={busy || fieldStr(fr.row.change, 'automation') !== 'running'}
            onClick={() => void killAction(fr.row.root, name)}
          >
            <Square className="h-3 w-3" aria-hidden="true" /> {t('progress.act_kill')}
          </button>
        )
      default:
        return undefined
    }
  }

  /** 抽屉动作条：与行内同组；fail/cxl 的引导承接面是 TaskDetail 连接现场命令卡（注释句
   *  acts_terminal_note 已退役，§4.5）；等产出仅在有欠账时点名缺什么（note_queued/note_agent
   *  两句无动作注释随 §4.5 退役——排队/等产出本身无动作，无需一句话解释）。 */
  function drawerActionsFor(fr: FlatRow): ReactNode | undefined {
    const acts = actionsFor(fr, true)
    if (acts) return acts
    if (fr.row.state === 'agent') {
      const missing = missingGateArtifacts(fr.row.change, fr.rules)
      if (missing.length > 0) {
        return (
          <span className="text-xs text-text-3" data-testid={`prg9-note-${fr.row.change.name}`}>
            {t('progress.note_agent_missing', { fields: missing.join(' ') })}
          </span>
        )
      }
    }
    return undefined
  }

  // ── 画布投影（画布 v3 · 单项目）：base.groups 是当前项目的各 workflow 组，一组一条站台线
  //    （无跨项目合并）。stepIds = rules.steps（缺失回退在制行出现过的 phase 序）+ 追加在制相位
  //    +追加归档相位（G17 底线卡不消失 + 归档不失联：每条归档 change 都落到它相位的小站）。
  //    change 小卡 = FlatRow 同源判定（状态点 tone / 沙箱谓词 / 页签未命中淡出 / 抽屉选中）。
  //    归档 change 只读投影按相位挂到 CanvasStep.archivedChanges（小站点开只读列出）。空组
  //    （零在制）不占画布。──
  const canvasGroups: CanvasGroup[] = useMemo(() => {
    const out: CanvasGroup[] = []
    for (const group of base.groups) {
      if (group.rows.length === 0) continue
      if (effectiveWf !== 'all' && group.workflow !== effectiveWf) continue
      const rules = rulesByKey.get(group.key) as ProgressRules | undefined
      const stepIds: string[] = rules ? [...rules.steps] : []
      for (const row of group.rows) if (!stepIds.includes(row.change.phase)) stepIds.push(row.change.phase)
      for (const row of group.archived) if (!stepIds.includes(row.change.phase)) stepIds.push(row.change.phase)
      if (stepIds.length === 0) continue
      const archivedByPhase = new Map<string, ProgressRow[]>()
      for (const row of group.archived) {
        archivedByPhase.set(row.change.phase, [...(archivedByPhase.get(row.change.phase) ?? []), row])
      }
      const projName = rootBasename(group.root)
      const steps: CanvasStep[] = stepIds.map((id) => {
        const arch = [...(archivedByPhase.get(id) ?? [])].sort((a, b) => compareArchived(a.change, b.change))
        const archivedChanges: CanvasArchivedChange[] = arch.map((row) => {
          const fr = toFlatRow(row, rules, group.workflow)
          const ds = dotOf(fr)
          return { key: fr.key, name: row.change.name, tone: ds.tone, state: ds.state }
        })
        return {
          id,
          label: stepLabel(id, rules?.labelByStep, t),
          gate: rules?.gateByStep[id] ?? null,
          archived: archivedChanges.length,
          archivedChanges,
        }
      })
      const changes: CanvasChange[] = group.rows.map((row) => {
        const fr = frByKey.get(rowKeyOf(row.root, row.change.name))!
        const ds = dotOf(fr)
        const status = judge(fr, row.state === 'gate' ? gateEvidence(row.change, fr.rules) : [], phaseLabelOf(fr))
        return {
          key: fr.key,
          name: row.change.name,
          phase: row.change.phase,
          state: ds.state,
          tone: ds.tone,
          running: row.state === 'running',
          sandbox: inSandbox(fr),
          dimmed: deckTab !== 'all' && !deckMatch(fr, deckTab),
          selected: drawerKey === fr.key,
          statusLabel: status.text,
        }
      })
      out.push({ key: `${group.root}::${group.workflow}`, projName, workflow: group.workflow, steps, changes })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dotOf/t 随组件重建，实际输入已全列
  }, [base, rulesByKey, frByKey, effectiveWf, deckTab, drawerKey])

  return (
    <section className="relative mx-auto w-full max-w-[1088px] pt-7 pb-5" data-testid="progress-view" ref={rootRef}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4" data-anim="prg-chrome" data-testid="prg-hero">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[30px] font-bold leading-none tracking-[-0.025em] text-text">进度</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-text-3">
              <span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden="true" />
              {t('progress.realtime_sync')}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-text-3">沿工作流查看每个任务所处阶段，需要处理的事项会优先显示</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-(--accent) px-4 text-sm font-semibold text-white shadow-sm transition-[transform,box-shadow] hover:shadow-md active:translate-y-px motion-reduce:transform-none"
          data-testid="progress-new-change"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {t('change_create.create')}
        </button>
      </div>

      {flatRows.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4" data-anim="prg-chrome" data-testid="prg-filterbar">
            <div
              className="inline-flex items-center gap-1 rounded-xl bg-fill p-1"
              role="tablist"
              aria-label={t('progress.tabs_label')}
              data-testid="prg9t-tabs"
            >
              {DECK_TABS.map((tabId) => (
                <button
                  key={tabId}
                  type="button"
                  role="tab"
                  className="group flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-text-3 transition-colors hover:text-text aria-selected:bg-card aria-selected:text-text aria-selected:shadow-sm"
                  aria-selected={deckTab === tabId}
                  data-testid={`prg9t-tab-${tabId}`}
                  onClick={() => setDeckTab(tabId)}
                >
                  {t(`progress.tab_${tabId}`)}
                  <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-card px-1.5 font-mono text-[11px] leading-[18px] text-text-3 group-aria-selected:bg-(--accent) group-aria-selected:text-white" data-testid={`prg9t-n-${tabId}`}>
                    {deckCounts[tabId]}
                  </span>
                </button>
              ))}
            </div>

            {wfNames.length > 0 && (
              <label className="relative max-[760px]:basis-full">
                <span className="sr-only">按工作流筛选</span>
                <select
                  className="h-10 min-w-[180px] appearance-none rounded-xl border border-border bg-card py-2 pr-9 pl-3 text-[13px] font-semibold text-text outline-none transition-shadow focus:border-(--accent) focus:ring-3 focus:ring-accent-t max-[760px]:w-full"
                  data-testid="prg-workflow-select"
                  value={effectiveWf}
                  onChange={(event) => setWfFilter(event.target.value)}
                >
                  <option value="all">{t('progress.wf_all')}</option>
                  {wfNames.map((wf) => <option key={wf} value={wf}>{wf}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-text-3" aria-hidden="true" />
              </label>
            )}
        </div>
      )}

      {error && <p className="py-2 text-[13px] text-red-d" data-testid="prg-error">{error}</p>}
      {loading && !snapshot && <p className="py-2 text-[13px] text-text-3">{t('common.loading')}</p>}

      {snapshot && flatRows.length > 0 && (
        <WorkflowCanvas groups={canvasGroups} onOpen={openDrawer} />
      )}

      {snapshot && flatRows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border-2 p-5 text-[13px] text-text-3" data-testid="prg-empty">
          {t('progress.empty')}
        </div>
      )}

      {createOpen && (
        <CreateChangeDialog
          root={currentRoot}
          onClose={() => setCreateOpen(false)}
          onCreated={async (name) => {
            // 先锁定 URL/宿主选择，再刷新 snapshot；受控 effect 会在新 change 真正进入投影后开抽屉。
            onSelectedChange?.(name)
            await onRefresh?.()
          }}
          onToast={onToast}
        />
      )}

      {drawerRow && (
        <>
          <div className="fixed inset-0 z-40 bg-scrim" data-testid="prg9-scrim" ref={scrimRef} onClick={closeDrawer} />
          <aside
            className="fixed top-0 right-0 bottom-0 z-50 flex w-[560px] max-w-[94vw] flex-col border-l border-border-2 bg-card shadow-lg"
            data-anim="prg-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={drawerRow.row.change.name}
            data-testid="prg9-drawer"
            ref={drawerRef}
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <TaskDetail
                root={drawerRow.row.root}
                change={drawerRow.row.change}
                rules={drawerRow.rules}
                badge={badgeEl(drawerRow, judge(drawerRow, drawerRow.row.state === 'gate' ? gateEvidence(drawerRow.row.change, drawerRow.rules) : [], phaseLabelOf(drawerRow)), 'prg9-dw-badge')}
                actions={drawerActionsFor(drawerRow)}
                collapseTechnical
                onClose={closeDrawer}
                onToast={onToast}
              />
              {drawerRow.row.state === 'running' && <RunLogPane root={drawerRow.row.root} change={drawerRow.row.change} />}
            </div>
          </aside>
        </>
      )}
    </section>
  )
}
