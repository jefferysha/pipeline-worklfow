import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import { isPhase } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import { plannedTransition, type PlannedTransition } from '../model/events'
import { shortTime } from '../model/time'
import { fetchAutomationSettings, postAfkCommand, postTransition } from '../api/client'
import { TaskDetail } from '../shared/TaskDetail'
import { Icon } from '../shell/Icon'
import { diagnoseFailureWithCause } from '../shared/failureDiagnosis'
import { gateEvidence, VERIFY_STATUS_FIELDS, type EvidenceChip } from '../inbox/evidence'
import { changeWorkflow, decisionKind } from '../inbox/inbox'
import { useAfkLog } from './useAfkLog'
import { PhaseRail, type RailMode } from './PhaseRail'
import {
  missingGateArtifacts,
  schedulerHealth,
  selectProgress,
  type ProgressRow,
  type ProgressRules,
  type ProgressState,
} from '../model/progressModel'

gsap.registerPlugin(useGSAP)

/**
 * ProgressView（v9-F1，进度统一面）—— 收件箱退役后的唯一操作面。设计真相源
 * design-demos/v9-flowdeck.html（定稿）：
 *   · 单列表看所有在制（不分组）——同一行体：左=名称钮+「项目 · 时间」+track chip；
 *     中=PhaseRail 列车轨（相位来自该 change 所属 workflow 的真实 steps，不硬编码七相）
 *     + 需操作行一句人话导语（gate 行再附小号证据 chip）；右=一枚人话判定徽章+行内动作。
 *   · 需要动手的行按语义分色 ring 并排前（真机验收 G：「失败就是红框,终止就是土色框」）：
 *     gate=绿（.prg9-row--need 现状）/失败=红（--need-fail）/人为终止=琥珀（--need-cxl）；
 *     观察行安静无动作。
 *   · 行内动作（真机验收 G：重试/放弃退出 UI 回终端）：gate=放行（绿实底带目标相位）/打回
 *     （transition 管线）；failed/cancelled=一枚「回终端」可拷命令 chip（fail 有 worktree
 *     现场→cd 接管，否则回落 pipeline afk run；点击=拷贝+toast；postAfkRetry/postAfkDismiss
 *     留在 api 层无 UI 消费方）；running=终止（cancel-gate 纪律：仅 automation==='running'
 *     可点，沿现状无二次确认）；排队/等产出=无动作。
 *   · 行名点击开右滑详情抽屉（scrim+GSAP x:103%→0，Esc/scrim/关闭钮，锁滚动）：
 *     TaskDetail variant='timeline'（动作与行内同组；fail/cxl 抽屉=回终端引导文案，承接面是
 *     TaskDetail 的 dt8-conn 命令卡）；running 行抽屉内挂 RunLogPane
 *     （useAfkLog 轮询，抽屉关随组件卸载即停）。
 *   · 旧的行内展开（prg-row--open/prg-detail 下方推开）与旧版分组/筛选条整体退役。
 *   · v9-H（demo v9.1 增补）：列表上方状态 sheet 页签「全部(默认)/等你动手/运行中/等待中」
 *     ——计数=各分类总数（不随当前筛选变），分类口径全走五态同源谓词（need=gate/failed 含
 *     cancelled 不单列；run=running 态含 scheduled 折叠；queue=queued 态）；切换=墨线滑动
 *     （wb8-ink 同姿势）+ 可见行入场轻编排（reduced 直切）。聚合语境（currentRoot=''）按项目
 *     分组渲染组头（folder+项目名+件数胶囊+右延细线，demo .pgroup/.pg-h），单项目语境不显
 *     组头，筛选后空组自然隐藏。行体 v2（真机反馈）：标题行内联——名称+track/workflow 全称
 *     chip/调度标识（▦ 沙箱=沙箱三桶 running/queued/failed 与调度灯同折叠；⌨ 终端=其余，
 *     demo .schip）+ 弱化 mono 时间，右端判定徽章；列车轨整宽独占第二行左侧，动作在轨道
 *     右侧垂直居中（demo .fl-top/.fl-body）。
 *
 * 判定徽章语义（rowSemantics/semBadge 自 InboxView 搬运——该视图由收件箱退役批删除）：
 * gate=「✓ 可以放行」绿 /「等你判断」红；failed=「失败 ×N · 等你决定」红（cause=cancelled
 * → 琥珀「已取消」）；running=蓝「{phase}运行中」；排队/等产出=中性。
 * 待拍板计数与导航徽标同口径 = inbox.ts selectInbox(...).length（App 既有接线，本视图不管）。
 *
 * GSAP（全包 gsap.matchMedia，reduce 分支直达终态）：行入场 stagger、rail 轨道生长+节点弹入
 * （demo animRails 对位）、拍板成功行 settle + 徽章回落 pulse。运行中流光/门呼吸走纯 CSS
 * （styles.ts v9-F1 块，[data-mode="run"|"gate"] 门控），组件内零 JS 循环。
 */

export interface ProgressViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** D5 项目切换器语义：非空=只看该项目；空串=全部项目聚合。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集，键=rulesKey(root,wf)（useWorkflowRulesMulti 契约）。 */
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  /** 动作结果 toast（成功/失败都走这里；App 注入 showFlash）。 */
  onToast?: (msg: string) => void
  /** 动作成功后 resync（App 注入 useSnapshot().refresh）。 */
  onRefresh?: () => void | Promise<void>
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

/** 行/抽屉共用的结论式语义（demo v5 三情形口径）：badge 一句结论 + lead 一句人话。 */
interface RowSemantics {
  tone: 'green' | 'red'
  badgeText: string
  lead: string
}

/**
 * 行语义判定（搬运自 InboxView rowSemantics，T9 demo v5 三情形口径）：
 *   · failed（automation ∈ {failed, conflict}）→「失败 ×N · 等你决定」+「重试还是放弃？」；
 *   · gate 且证据里有未过判定（verify 三轨白名单——产物没产出不等于验证没过，Important-1
 *     教训沿用）或根本没有任何自动证据（自定义门/纯人判）→「等你判断」；
 *   · gate 且证据齐 →「✓ 可以放行」，lead 按决定类型细分。
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
  /** 需操作行的一句人话导语（观察行无）。 */
  lead?: string
}

// ── running 行抽屉内日志区（旧行内展开迁入抽屉；testid/样式沿用 prg-log*）──

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

/** 统一列表的行投影：state/rules/mode/need 一次算好，渲染与动效共用。 */
interface FlatRow {
  key: string
  row: ProgressRow
  rules: ProgressRules | undefined
  workflow: string
  /** 需要人动手（gate/failed，含 cancelled）——分色 ring 高亮（gate 绿/fail 红/cxl 琥珀）+ 排前 + 行内动作。 */
  need: boolean
  mode: RailMode
  /** failed 且结构化/regex 判为 cancelled（人为终止非故障）→ 琥珀徽章 + cxl 轨。 */
  cancelled: boolean
}

/** 行序：需操作行在前；组内 updated_at 倒序，并列 name 升序（同 selectInbox 时间轴口径）。 */
function compareFlat(a: FlatRow, b: FlatRow): number {
  if (a.need !== b.need) return a.need ? -1 : 1
  const ua = a.row.change.updated_at
  const ub = b.row.change.updated_at
  if (ua !== ub) return ua < ub ? 1 : -1
  const na = a.row.change.name
  const nb = b.row.change.name
  return na < nb ? -1 : na > nb ? 1 : 0
}

// ── v9-H：状态 sheet 页签 + 调度标识（纯谓词，渲染与计数共用同一口径不漂移）──

/** 页签字典（顺序即渲染序，demo .deck-tabs：全部/等你动手/运行中/等待中）。 */
const DECK_TABS = ['all', 'need', 'run', 'queue'] as const
type DeckTab = (typeof DECK_TABS)[number]

/** 页签分类口径（五态同源谓词——不在视图层摸 automation 原始字段，T6 纪律）：
 *  need=现有 need 判定（gate/failed，失败/取消归此不单列，与 demo 一致）；
 *  run=running 态（progressModel 已折叠 scheduled）；queue=queued 态；all=全部。 */
function deckMatch(fr: FlatRow, tab: DeckTab): boolean {
  switch (tab) {
    case 'all':
      return true
    case 'need':
      return fr.need
    case 'run':
      return fr.row.state === 'running'
    case 'queue':
      return fr.row.state === 'queued'
  }
}

/** 调度标识（demo .schip/.schip.sbx）：▦ 沙箱=自动化三桶（running/queued/failed 态，与调度灯
 *  schedulerHealth 同折叠口径——running 含 scheduled、failed 含 conflict）；其余（off/无/merged/
 *  paused 等活在终端的）=⌨ 终端。 */
function inSandbox(fr: FlatRow): boolean {
  return fr.row.state === 'running' || fr.row.state === 'queued' || fr.row.state === 'failed'
}

export function ProgressView({ snapshot, loading, error, currentRoot, rulesByKey, onToast, onRefresh }: ProgressViewProps): JSX.Element {
  const { t } = useT()
  const rootRef = useRef<HTMLElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const [busyRows, setBusyRows] = useState<ReadonlySet<string>>(new Set())
  const [patches, setPatches] = useState<ReadonlyMap<string, RowPatch>>(new Map())
  // 详情抽屉：行名点击打开；Esc/scrim/关闭钮关闭。行离场（归档/换项目）→ 引用失配自动收起。
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  // v9-H：状态 sheet 页签（demo .deck-tabs——默认全部）。
  const [deckTab, setDeckTab] = useState<DeckTab>('all')

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

  // 乐观投影：把在途动作的 patch 叠加到 snapshot 上，selectProgress 及所有下游（徽章/列车轨/
  // 抽屉）自然消费同一份判定——不在视图层散落第二套状态判定（T6 同源谓词纪律）。
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

  // 单列表投影：分组打平（数据源沿 selectProgress；归档排除行为保持现状——archivedCount 汇总
  // 到列表尾缀），排序=需操作行在前、组内 updated_at 倒序。
  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = []
    for (const group of base.groups) {
      const rules = rulesByKey.get(group.key) as ProgressRules | undefined
      for (const row of group.rows) {
        const need = row.state === 'gate' || row.state === 'failed'
        const cancelled =
          row.state === 'failed' &&
          diagnoseFailureWithCause(fieldStr(row.change, 'automation_cause'), fieldStr(row.change, 'automation_last_error')).cause === 'cancelled'
        const mode: RailMode =
          row.state === 'running'
            ? 'run'
            : row.state === 'gate'
              ? 'gate'
              : row.state === 'failed'
                ? (cancelled ? 'cxl' : 'fail')
                : row.state === 'queued'
                  ? 'queue'
                  : 'idle'
        out.push({ key: rowKeyOf(row.root, row.change.name), row, rules, workflow: group.workflow, need, mode, cancelled })
      }
    }
    out.sort(compareFlat)
    return out
  }, [base, rulesByKey])

  const archivedTotal = useMemo(() => base.groups.reduce((n, g) => n + g.archivedCount, 0), [base])
  const health = schedulerHealth(base.counts)

  // v9-H：页签计数=各分类总数（不随当前筛选变，demo updateDeckCounts 对位）。
  const deckCounts = useMemo(
    () => ({
      all: flatRows.length,
      need: flatRows.filter((fr) => deckMatch(fr, 'need')).length,
      run: flatRows.filter((fr) => deckMatch(fr, 'run')).length,
      queue: flatRows.filter((fr) => deckMatch(fr, 'queue')).length,
    }),
    [flatRows],
  )
  const visibleRows = useMemo(() => flatRows.filter((fr) => deckMatch(fr, deckTab)), [flatRows, deckTab])

  // v9-H：聚合语境（currentRoot=''）按项目分组。组序=各组首行在全局序（需动手置前+updated_at
  // 倒序）中的先后——最紧急/最新的项目组自然靠前；组内序=全局序在组内的投影（口径不变）；
  // 筛选后空组不产生条目（demo applyDeckFilter 空组隐藏的数据层等价）。
  const projGroups = useMemo(() => {
    const out: { root: string; rows: FlatRow[] }[] = []
    const idx = new Map<string, number>()
    for (const fr of visibleRows) {
      let i = idx.get(fr.row.root)
      if (i === undefined) {
        i = out.length
        idx.set(fr.row.root, i)
        out.push({ root: fr.row.root, rows: [] })
      }
      out[i]!.rows.push(fr)
    }
    return out
  }, [visibleRows])

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

  /** 拍板成功的即时反馈（demo 收拢+徽标回落的行级对位）：行 settle + 徽章回落 pulse。
   *  reduced-motion / 无 matchMedia → 不放（状态变化本身即反馈）。 */
  function pulseRow(name: string): void {
    if (typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const root = rootRef.current
    if (!root) return
    const rowEl = root.querySelector(`[data-testid="prg9-row-${name}"]`)
    const bdg = root.querySelector(`[data-testid="prg9-badge-${name}"]`)
    if (rowEl) gsap.fromTo(rowEl, { scale: 0.985 }, { scale: 1, duration: 0.3, ease: 'back.out(2)', clearProps: 'transform' })
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

  // 验收反馈②-④沿用：可见范围恰好单 root 时才取并发上限一起显示——多项目聚合语境下
  // 「上限」没有单一数字，不显示比显示误导性数字更诚实。
  const singleRoot = useMemo(() => {
    const roots = [...new Set(base.groups.map((g) => g.root))]
    return roots.length === 1 ? roots[0]! : null
  }, [base])
  const [autoMaxParallel, setAutoMaxParallel] = useState<number | null>(null)
  useEffect(() => {
    setAutoMaxParallel(null)
    if (!singleRoot) return
    let cancelled = false
    fetchAutomationSettings(singleRoot)
      .then((s) => {
        if (!cancelled) setAutoMaxParallel(s.max_parallel)
      })
      .catch(() => {
        /* fail-open：接口失败静默不显示，不出错误 UI */
      })
    return () => {
      cancelled = true
    }
  }, [singleRoot])

  // ── GSAP：行入场 stagger + rail 轨道生长/节点弹入（demo animRails 对位；全包 matchMedia）──
  // 依赖键 = 行成员指纹（仅排序后的 name 集合）：增删行才重放入场；单行状态变化（SSE 帧常态）
  // 不整列表重播 stagger——否则任一帧都会盖掉 pulseRow 的单行强调（评审 P2-6）。
  // 循环动效（流光/门呼吸）走纯 CSS（[data-mode] 门控 + reduced-motion 停帧），不在这里放 JS 循环。
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
          const rows = el.querySelectorAll<HTMLElement>('.prg9-row')
          if (reduce) {
            // 直达终态：行全可见、页签条/组头/轨道名原位（CSS 循环由 media query 自停）。
            gsap.set(rows, { autoAlpha: 1, y: 0 })
            gsap.set(el.querySelectorAll('.prg9t-tabs, .prg9g-head'), { autoAlpha: 1, y: 0 })
            gsap.set(el.querySelectorAll('.prg9-rail .rl-name'), { autoAlpha: 1 })
            return
          }
          // v9-H：页签条+组头先浮现（demo enterChoreo 的 .deck-tabs/.pg-h 同参）。
          const chrome = el.querySelectorAll<HTMLElement>('.prg9t-tabs, .prg9g-head')
          if (chrome.length > 0) {
            gsap.fromTo(chrome, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.07, clearProps: 'all' })
          }
          // 行入场 stagger（demo enterChoreo 同参）。
          gsap.fromTo(rows, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power3.out', stagger: 0.06 })
          // rail 轨道生长 + 节点弹入 + 名称浮现（demo animRails 逐字对位；行间再错开一拍）。
          Array.from(el.querySelectorAll<HTMLElement>('.prg9-rail')).forEach((rail, ri) => {
            gsap.from(rail.querySelectorAll('.rl-track'), {
              scaleX: 0, transformOrigin: 'left center', duration: 0.3, stagger: 0.05, delay: 0.1 + ri * 0.05, ease: 'power2.out', clearProps: 'transform',
            })
            gsap.from(rail.querySelectorAll('.rl-node'), {
              scale: 0, duration: 0.3, stagger: 0.05, delay: 0.15 + ri * 0.05, ease: 'back.out(2.2)', clearProps: 'transform',
            })
            gsap.fromTo(rail.querySelectorAll('.rl-name'), { autoAlpha: 0, y: 4 }, {
              autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.04, delay: 0.2 + ri * 0.05, ease: 'power2.out',
            })
          })
        },
      )
    },
    { scope: rootRef, dependencies: [animKey], revertOnUpdate: true },
  )

  // ── v9-H：状态 sheet 墨线滑动 + 切换后可见行/组头入场轻编排（demo placeDeckInk/
  //    applyDeckFilter 对位）。墨线姿势沿 WorkbenchView wb8-ink：不挂 revertOnUpdate——revert
  //    会把墨线 inline left/width 打回样式表缺省（left:0 width:0），每次切换都从最左飞入；
  //    gsap.to 天然从当前位置延续滑动，overwrite:'auto' 收编快速连点。首帧只落墨线不放行编排
  //    （prevDeckRef 守门）；reduced 墨线直落位、行直切不编排。deps 含 animKey：行成员变化后
  //    页签宽度（计数位数）可能变，墨线要补一次落位。──
  const prevDeckRef = useRef<DeckTab | null>(null)
  useGSAP(
    () => {
      const el = rootRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          const ink = el.querySelector<HTMLElement>('.prg9t-ink')
          const onTab = el.querySelector<HTMLElement>(`[data-testid="prg9t-tab-${deckTab}"]`)
          if (ink && onTab?.parentElement) {
            const tr = onTab.getBoundingClientRect()
            const pr = onTab.parentElement.getBoundingClientRect()
            const left = tr.left - pr.left + 6
            const width = Math.max(tr.width - 12, 0)
            if (reduce) gsap.set(ink, { left, width })
            else gsap.to(ink, { left, width, duration: 0.28, ease: 'expo.out', overwrite: 'auto' })
          }
          const first = prevDeckRef.current === null
          const changed = prevDeckRef.current !== null && prevDeckRef.current !== deckTab
          prevDeckRef.current = deckTab
          if (reduce || first || !changed) return
          // 切换后可见行+组头轻入场（demo applyDeckFilter 的 G.from(visCards) 对位）；
          // overwrite:'auto' 收编仍在途的首屏入场补间，clearProps 终态自清不残留 inline。
          const targets = el.querySelectorAll<HTMLElement>('.prg9-row, .prg9g-head')
          if (targets.length > 0) {
            gsap.fromTo(
              targets,
              { autoAlpha: 0, y: 8 },
              { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out', stagger: 0.04, overwrite: 'auto', clearProps: 'all' },
            )
          }
        },
      )
    },
    { scope: rootRef, dependencies: [deckTab, animKey] },
  )

  // ── 抽屉开合：滚动锁 + Esc + GSAP 右滑入场/滑出退场（reduce 直达终态）──
  const drawerRow = drawerKey !== null ? (flatRows.find((fr) => fr.key === drawerKey) ?? null) : null
  const drawerOpen = drawerRow !== null

  /** 退场补间（demo 语义补拍，评审 P2-8）：滑回场外 x:103%（~.24s power3.in）+ scrim 淡出，
   *  onComplete 才卸载；reduced/无 matchMedia 直接卸载。closingRef 双守门：退场中再点退路不
   *  重复补间、退场中点行名不重开。 */
  const closingRef = useRef(false)
  const closeDrawer = useCallback((): void => {
    if (closingRef.current) return
    const drawer = drawerRef.current
    const scrim = scrimRef.current
    const motion =
      typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!motion || !drawer || !scrim) {
      setDrawerKey(null)
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
      },
    })
  }, [])
  const openDrawer = useCallback((key: string): void => {
    if (closingRef.current) return
    setDrawerKey(key)
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    document.documentElement.classList.add('prg9-lock')
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      // 卸载兜底重置：抽屉若因数据变化直接消失（行被归档等），退场守门不悬挂。
      closingRef.current = false
      document.documentElement.classList.remove('prg9-lock')
      document.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen, closeDrawer])

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

  // ── 行体投影：徽章/导语/证据/列车轨 ──

  interface RailView {
    labels: string[]
    idx: number
    phaseLabel: string
  }

  /** 相位列表来自该行 workflow 的真实 steps；rules 缺失或当前阶段不在步序（G17 底线：卡不
   *  消失）→ 退化为单相轨。 */
  function railOf(fr: FlatRow): RailView {
    const steps = fr.rules?.steps ?? []
    const curIdx = steps.indexOf(fr.row.change.phase)
    const phaseLabel = stepLabel(fr.row.change.phase, fr.rules?.labelByStep, t)
    if (!fr.rules || curIdx < 0) return { labels: [phaseLabel], idx: 0, phaseLabel }
    return { labels: steps.map((s) => stepLabel(s, fr.rules?.labelByStep, t)), idx: curIdx, phaseLabel }
  }

  /** 一枚人话判定徽章 + 需操作行导语（gate/failed 复用 rowSemantics 同源判定）。 */
  function judge(fr: FlatRow, evidence: EvidenceChip[], phaseLabel: string): RowBadge {
    const c = fr.row.change
    switch (fr.row.state) {
      case 'gate': {
        const sem = rowSemantics(c, 'gate', evidence, t)
        return { tone: sem.tone, text: sem.badgeText, lead: sem.lead }
      }
      case 'failed': {
        if (fr.cancelled) return { tone: 'amb', text: t('progress.badge_cancelled'), lead: t('failure.hint_cancelled') }
        const sem = rowSemantics(c, 'failed', [], t)
        return { tone: 'red', text: sem.badgeText, lead: sem.lead }
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

  /** testid 由调用点给：行内 prg9-badge-{name}、抽屉 prg9-dw-badge——同名双挂会撞 getByTestId。 */
  function badgeEl(fr: FlatRow, b: RowBadge, testid: string): JSX.Element {
    const cls =
      b.tone === 'green' ? 'badge badge--green' : b.tone === 'red' ? 'badge badge--red' : `badge prg9-bdg prg9-bdg--${b.tone}`
    return (
      <span
        className={cls}
        data-testid={testid}
        title={fr.row.state === 'agent' ? t('progress.state_agent_hint') : undefined}
      >
        {(b.tone === 'red' || b.tone === 'blue' || b.tone === 'amb') && <span className="dot" aria-hidden="true" />}
        {b.text}
      </span>
    )
  }

  /** fail/cxl 行「回终端」命令 chip 数据（真机验收 G）：cxl=重跑命令（人为终止后重新入队）；
   *  fail 有 worktree 现场→cd 接管（与 TaskDetail dt8-conn 的 worktreeCmd 同款带引号），
   *  缺现场回落重跑命令。 */
  function cmdChipOf(fr: FlatRow): { label: string; cmd: string } {
    const rerun = `pipeline afk run ${fr.row.change.name}`
    if (fr.cancelled) return { label: t('progress.cmd_rerun_cxl'), cmd: rerun }
    const worktree = fieldStr(fr.row.change, 'automation_worktree')
    if (worktree !== '') return { label: t('progress.cmd_takeover'), cmd: `cd "${worktree}"` }
    return { label: t('progress.cmd_rerun'), cmd: rerun }
  }

  /** 命令 chip 点击=拷贝+toast（沿 TaskDetail copy 姿势：clipboard 可选链，成功才报）。 */
  function copyCmd(cmd: string): void {
    void navigator.clipboard?.writeText(cmd).then(() => {
      onToast?.(t('detail.copied', { value: cmd }))
    })
  }

  /**
   * 行内动作（行体与抽屉同组共用）：gate=放行（带目标相位）/打回；failed/cancelled=行内
   * 「回终端」命令 chip（抽屉侧不双挂——drawerActionsFor 给引导文案，承接面是 TaskDetail
   * 的 dt8-conn 命令卡）；running=终止（仅 automation==='running' 可点）；排队/等产出=
   * 无动作 → undefined。
   * 2+ 条同向出边一条不落（旧 InboxView 纪律回归）：前进边逐条渲染（首选边保持「放行进入
   * {目标相位}」，其余以事件名呈现 inbox.act_forward）；回退边逐条渲染，一律带目标相位
   * （inbox.act_backward——多回退边只写「打回」无从分辨去处）。
   * dw=true 时 testid 挂 prg9-dw- 前缀——行内与抽屉双挂同名 testid 会撞 getByTestId。
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
                className="prg9-btn prg9-btn--go"
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
                className="prg9-btn prg9-btn--neg"
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
        // 真机验收 G：重试/放弃不再在进度面上点——行内给一枚可拷贝的终端命令 chip；
        // 抽屉不双挂（引导文案在 drawerActionsFor，连接现场的完整命令卡在 TaskDetail）。
        if (dw) return undefined
        const chip = cmdChipOf(fr)
        return (
          <button
            type="button"
            className="prg9-cmdchip"
            data-testid={tid('cmd')}
            title={chip.cmd}
            aria-label={`${chip.label}：${chip.cmd}`}
            onClick={() => copyCmd(chip.cmd)}
          >
            {chip.label}
            <span className="prg9-cc mono">{chip.cmd}</span>
          </button>
        )
      }
      case 'running':
        return (
          <button
            type="button"
            className="prg9-btn prg9-btn--neg"
            data-testid={tid('kill')}
            disabled={busy || fieldStr(fr.row.change, 'automation') !== 'running'}
            onClick={() => void killAction(fr.row.root, name)}
          >
            ⏹ {t('progress.act_kill')}
          </button>
        )
      default:
        return undefined
    }
  }

  /** 抽屉动作条：与行内同组；fail/cxl=回终端引导文案（重试/放弃退出 UI，连接现场的命令
   *  卡由 TaskDetail「自己上手修」承接）；排队/等产出无动作 → 一句说明（沿旧 note_* 口径）。 */
  function drawerActionsFor(fr: FlatRow): ReactNode | undefined {
    const acts = actionsFor(fr, true)
    if (acts) return acts
    const name = fr.row.change.name
    if (fr.row.state === 'failed') {
      return (
        <span className="prg-dfoot-note" data-testid={`prg9-note-${name}`}>
          {t('progress.acts_terminal_note')}
        </span>
      )
    }
    if (fr.row.state === 'agent') {
      const missing = missingGateArtifacts(fr.row.change, fr.rules)
      return (
        <span className="prg-dfoot-note" data-testid={`prg9-note-${name}`}>
          {missing.length > 0 ? t('progress.note_agent_missing', { fields: missing.join(' ') }) : t('progress.note_agent')}
        </span>
      )
    }
    if (fr.row.state === 'queued') {
      return (
        <span className="prg-dfoot-note" data-testid={`prg9-note-${name}`}>
          {t('progress.note_queued')}
        </span>
      )
    }
    return undefined
  }

  const doctorText =
    t('progress.doctor_counts', { running: health.running, queued: health.queued, failed: health.failed }) +
    (autoMaxParallel !== null ? ` ${t('progress.doctor_limit', { n: autoMaxParallel })}` : '')

  /** 单行行体渲染（行体 v2，demo .fl-top/.fl-body）：标题行内联——名称 + track/workflow 全称
   *  chip/调度标识 + 弱化 mono 时间，右端判定徽章（+失败短成因）；第二行=列车轨整宽+导语在左，
   *  动作在轨道右侧垂直居中。聚合分组与单项目平铺两个渲染分支共用；key 挂在返回的 article 上
   *  （两分支都是数组 map 的直子元素）。fail/cxl 的「回终端」命令 chip 走 actionsFor 现状不动。 */
  function renderRow(fr: FlatRow): JSX.Element {
    const { row } = fr
    const name = row.change.name
    const rail = railOf(fr)
    const evidence = row.state === 'gate' ? gateEvidence(row.change, fr.rules) : []
    const b = judge(fr, evidence, rail.phaseLabel)
    // 行内小号证据 chip（gate 行）：只出判定型（非 copyable 非占位）——路径产物归抽屉。
    const inlineChips = evidence.filter((ch) => !ch.copyable && !ch.unset)
    const acts = actionsFor(fr)
    // 失败行短成因（W3/F-b 沿用）：automation_cause 直判优先，空串回落 last_error regex。
    const lastError = row.state === 'failed' ? fieldStr(row.change, 'automation_last_error') : ''
    const failCause = row.state === 'failed' ? fieldStr(row.change, 'automation_cause') : ''
    const showCause = row.state === 'failed' && !fr.cancelled && (lastError !== '' || failCause !== '')
    // 真机验收 G：need 行 ring 分色——gate 保持绿（--need 现状），失败红（--need-fail），
    // 人为终止琥珀（--need-cxl）；tone 类叠加在 --need 之上（排序/入场语义不变，CSS 后写覆盖）。
    const toneCls = fr.need && row.state === 'failed' ? (fr.cancelled ? ' prg9-row--need-cxl' : ' prg9-row--need-fail') : ''
    const sandbox = inSandbox(fr)
    return (
      <article key={fr.key} className={`prg9-row${fr.need ? ' prg9-row--need' : ''}${toneCls}`} data-testid={`prg9-row-${name}`}>
        <div className="prg9v2-top">
          <button
            type="button"
            className="prg9-name"
            data-testid={`prg9-name-${name}`}
            onClick={() => openDrawer(fr.key)}
          >
            {name}
          </button>
          <span className="prg9s-tags">
            {row.change.track && <span className="card__track mono">{row.change.track}</span>}
            <span className="prg9s-wf" data-testid={`prg9s-wf-${name}`}>
              {t('progress.wf_label', { wf: fr.workflow })}
            </span>
            <span className={`prg9s-schip${sandbox ? ' prg9s-schip--sbx' : ''}`} data-testid={`prg9s-sched-${name}`}>
              {t(sandbox ? 'progress.sched_sandbox' : 'progress.sched_terminal')}
            </span>
          </span>
          {row.change.updated_at !== '' && <span className="prg9v2-time">{shortTime(row.change.updated_at)}</span>}
          <span className="prg9v2-sp" aria-hidden="true" />
          <span className="prg9-judge">
            {badgeEl(fr, b, `prg9-badge-${name}`)}
            {showCause && (
              <span className="prg-cause" data-testid={`prg9-cause-${name}`} title={lastError || undefined}>
                {t(`failure.short_${diagnoseFailureWithCause(failCause, lastError).cause}`)}
              </span>
            )}
          </span>
        </div>
        <div className="prg9v2-body">
          <div className="prg9v2-mid">
            <PhaseRail
              phases={rail.labels}
              currentIndex={rail.idx}
              mode={fr.mode}
              ariaLabel={t(`progress.rail_aria_${fr.mode}`, { m: rail.labels.length, phase: rail.phaseLabel })}
              testid={`prg9-rail-${name}`}
            />
            {b.lead && (
              <p className="prg9-lead" data-testid={`prg9-lead-${name}`}>
                {b.lead}
                {inlineChips.map((chip) => (
                  <span
                    key={chip.key}
                    className={`ev__chip ev__chip--${chip.tone} prg9-ev`}
                    data-testid={`prg9-ev-${name}-${chip.key}`}
                  >
                    {chip.key}={chip.value}
                  </span>
                ))}
              </p>
            )}
          </div>
          {acts && <div className="prg9-acts prg9v2-acts">{acts}</div>}
        </div>
      </article>
    )
  }

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

      {flatRows.length > 0 && (
        <div className="prg9t-tabs" role="tablist" aria-label={t('progress.tabs_label')} data-testid="prg9t-tabs">
          {DECK_TABS.map((tabId) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              className="prg9t-tab"
              aria-selected={deckTab === tabId}
              data-testid={`prg9t-tab-${tabId}`}
              onClick={() => setDeckTab(tabId)}
            >
              {t(`progress.tab_${tabId}`)}
              <span className="prg9t-n">{deckCounts[tabId]}</span>
            </button>
          ))}
          <span className="prg9t-ink" aria-hidden="true" />
        </div>
      )}

      <div className="prg9-stack" data-testid="prg9-stack">
        {currentRoot === ''
          ? projGroups.map((g) => (
              <section className="prg9g-group" key={g.root} data-testid={`prg9g-group-${rootBasename(g.root)}`}>
                <header className="prg9g-head" data-testid={`prg9g-head-${rootBasename(g.root)}`}>
                  <Icon name="folder" />
                  <span className="prg9g-name">{rootBasename(g.root)}</span>
                  <span className="prg9g-n" data-testid={`prg9g-n-${rootBasename(g.root)}`}>{g.rows.length}</span>
                  <span className="prg9g-rule" aria-hidden="true" />
                </header>
                <div className="prg9g-stack">{g.rows.map((fr) => renderRow(fr))}</div>
              </section>
            ))
          : visibleRows.map((fr) => renderRow(fr))}
      </div>

      {snapshot && flatRows.length === 0 && (
        <div className="prg-empty" data-testid="prg-empty">{t('progress.empty')}</div>
      )}
      {archivedTotal > 0 && (
        <p className="prg9-fold" data-testid="prg9-fold">{t('progress.fold_archived', { n: archivedTotal })}</p>
      )}
      <p className="prg-foot">{t('progress.foot')}</p>

      {drawerRow && (
        <>
          <div className="prg9-scrim" data-testid="prg9-scrim" ref={scrimRef} onClick={closeDrawer} />
          <aside
            className="prg9-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={drawerRow.row.change.name}
            data-testid="prg9-drawer"
            ref={drawerRef}
          >
            <div className="prg9-dw-body">
              <TaskDetail
                root={drawerRow.row.root}
                change={drawerRow.row.change}
                rules={drawerRow.rules}
                variant="timeline"
                badge={badgeEl(drawerRow, judge(drawerRow, drawerRow.row.state === 'gate' ? gateEvidence(drawerRow.row.change, drawerRow.rules) : [], railOf(drawerRow).phaseLabel), 'prg9-dw-badge')}
                actions={drawerActionsFor(drawerRow)}
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
