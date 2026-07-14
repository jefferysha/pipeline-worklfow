import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { fetchWorkflow, fetchWorkflowNames, getHistory, postWorkflowDef, type ChangeHistoryEntry } from '../api/client'
import { useT } from '../i18n'
import { changeWorkflowName } from '../model/progressModel'
import { DEFAULT_RULES, invalidateWorkflowRules, rulesKey, useWorkflowRulesMulti } from '../model/workflowModel'
import { Dialog } from '../shell/Dialog'
import { EVENT_BY_EDGE, PHASES, REVIEW_PHASES, TRANSITIONS, isPhase, type ChangeSnapshot, type Snapshot } from '../types'
import { revealDialog, revealList } from '../shared/motion'
import { AutomationCard } from './AutomationCard'
import { SecretsCard } from './SecretsCard'
import { SkillHealthPanel } from './SkillHealthPanel'
import { HookTimeline, LOCKED_IDS, useHooksConfig } from './HookTimeline'
import { LoopCard, useLoops } from './LoopCard'
import { StepEditor } from './StepEditor'
import { StepperRail, type GateHookInfo, type StepperStep } from './StepperRail'

gsap.registerPlugin(useGSAP)

/**
 * WorkbenchView（T12，计划 2026-07-11-v5-interaction-rebuild）—— 工作台骨架：
 * workflow 下拉切换 + 线性 stepper 阶段卡（StepperRail）+ 右栏摘要卡/流程预览/GSAP 预演。
 * 交互真相源 design-demos/v5-progress-workbench.html workbench 段（六轮验收定稿）；
 * 视觉 token 沿 v4 不变（styles.ts wb- 区块）。
 *
 * React 重写纪律（决议 #1 前置）：不搬 旧画布库概念——layout.ts/画布坐标全不复用；数据读写走
 * 既有 GET /api/workflows(+/:name) 与 model/workflowModel（下拉菜单的阶段计数经
 * useWorkflowRulesMulti 按 rulesKey(root,name) 索引，不自己拼缓存键）。
 *
 * 骨架范围（后续任务挂载点，见 JSX 内注释）：
 *   · 阶段编辑区 = T13（已挂载 <StepEditor>：基本/产出物/guards 中文化，Inputs UI 按决议不渲染）；
 *     技能链 T14 / Hook 时序线 T15 继续在 StepEditor 内分区挂载；
 *   · 「+ 添加阶段」= 验收反馈#4（补齐 T13 遗留缺口）：自定义 workflow 非只读态可点，
 *     打开 Dialog 插入新 step；default 仍禁用（阶段结构由运行时固定），见 confirmAddStage；
 *   · 摘要卡「钩子」行 '—' 占位（T5 数据面 + T15 接线后出真数）；
 *   · 「自动运行(Loop)」卡 = T16。
 * 过渡期与旧 旧 workflow 列表页 并存（不挂导航，T17 切换、T18 退役旧视图）。
 *
 * T13 编辑真写回：def 本身就是编辑草稿（StepEditor 每次编辑交回完整 step，这里按 id 换入；
 * 验收反馈#4 的插入新 step 是同一份草稿上的另一种编辑，走的还是这一条链路）；
 * 脏守卫沿 旧画布编辑器 Task 15 四件套先例——快照存 ref（defSnapshotRef，load/save 成功时
 * 写入一次）、dirty 每次渲染由「当前 def vs 快照」重算（故意不 useMemo，ref 变化对记忆化不可
 * 见）、守卫函数不 useCallback（会冻结 dirty 快照）、保存成功推进快照即清脏。保存走既有
 * POST /api/workflows/:name，成功后 invalidateWorkflowRules(root,name)（spec §2.1 缓存失效
 * 纪律）；kernel validate 拒绝时 errors[] 原文逐条上抛展示。default = manifest 镜像只读态
 * （server 端 400 已挡，前端 readonly + 只读 pill 预示，不渲染保存钮）。
 *
 * v8-E（意见⑥，设计真相源 design-demos/v8-trellis-encore.html #view-workbench）：
 *   · StepperRail = v8 阶段卡横排（流动虚线连接件+门形节点，见 StepperRail.tsx 头注释）；
 *   · 主列 sheet 页签化：阶段编辑(StepEditor+HookTimeline)/自动运行/AFK 执行/凭证/技能健康
 *     五页恒挂载切显隐（数据面行为与平铺时代一致）；墨线 ink GSAP 滑动+pane crossfade
 *     （reduced 直切）；点阶段卡驱动 sheet 切回「阶段编辑」；
 *   · 右栏瘦身：只留 工作流摘要/安全门说明/最近流转——Hook 时序线并入「阶段编辑」页签、
 *     矩阵入口卡+SkillHealthPanel 并入「技能健康」页签。
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

// ── v6 计划 T11：流程带真实计数 / running 脉冲——按 (root, workflow) 对 snapshot 二次分组
//    （不新增端点，复用 App 已经 useSnapshot() 拉到的同一份数据；见 WorkbenchViewProps.snapshot
//    头注释）。fieldStr 同 progressModel.ts/ProgressView.tsx/InboxView.tsx 等既有私有小工具
//    同款惯例（本仓不为一行判断抽公共模块），非字符串 fields 值一律当未设。 ──
function fieldStr(c: ChangeSnapshot, key: string): string {
  const v = c.fields[key]
  return typeof v === 'string' ? v : ''
}

/** 单阶段的 ambient 真实信号：count=真实 change 数，running=其中是否有 automation==='running'。 */
export interface StageAmbient {
  count: number
  running: boolean
}

/**
 * 该 workflow 下每阶段的真实 change 计数与 running 标记（v6 T11 一句话目标：「数据来自当前
 * /api/snapshot 已加载的项目状态，前端按 rulesKey(root, workflow) 分组统计，不新增端点」）。
 * 纯函数、零 IO：只认 snapshot 里 root 精确匹配的项目（且 project.ok，同 selectProgress 对
 * 不可达项目的既有处理）+ changeWorkflowName(c)===workflow 过滤。archived change 排除
 * （对齐决议 #5「archive 排除进度」口径——已归档不算这条流程带上的「真实在办」，避免 archive
 * 阶段桶因历史归档堆积而失真）。running 判据 automation==='running'（不折叠 scheduled，
 * 逐字对齐计划 T11 TDD 测试要求④「仅在该阶段存在 automation==='running' 的 change 时显示」）。
 */
export function stageCounts(
  snapshot: Snapshot | null | undefined,
  root: string,
  workflow: string,
): Record<string, StageAmbient> {
  const out: Record<string, StageAmbient> = {}
  const project = snapshot?.projects.find((p) => p.root === root)
  if (!project?.ok) return out
  for (const c of project.changes) {
    if (c.archived === 'true') continue
    if (changeWorkflowName(c) !== workflow) continue
    const bucket = out[c.phase] ?? { count: 0, running: false }
    bucket.count += 1
    if (fieldStr(c, 'automation') === 'running') bucket.running = true
    out[c.phase] = bucket
  }
  return out
}

// 验收反馈#4（补齐 T13 遗留缺口）：新 step 的 id/skill id/event 名同一条字符集规则
// （kernel validate.ts IDENT_RE、StepEditor.tsx FIELD_RE 同款——G16 纪律，越界=「保存成功、
// 下次打不开」，客户端先挡一道）。
const STAGE_ID_RE = /^[a-zA-Z0-9_-]+$/

/** 阶段名称 → 阶段 ID 的自动 slug 化（小写、非法字符段折叠成单个 -、首尾去 -）；
 *  用户一旦手改 ID 字段即视为「已接管」，后续改名称不再覆盖（见 Dialog 内 idTouched）。 */
function slugifyStageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

interface ErrorBody { error?: string }

/** 非 2xx 响应尽量读出 server 的 { error } 文案（同 旧 workflow 列表页（T18 已退役） 的既有模式）。 */
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
  /**
   * T17（T15 登记的接线口）：Hook 开关写回失败的提示出口。挂在 App 上时传 showFlash('error')
   * ——失败回滚提示走全局 flash；缺省（独立渲染/测试）沿 T15 行为，HookTimeline 行内 role=alert。
   */
  onToggleError?: (msg: string) => void
  /**
   * v6 计划 T11：流程带真实计数/running 脉冲的数据源——App 已经 useSnapshot() 拉到的同一份
   * 快照，逐层下传（同 InboxView/ProgressView 既有接线方式，不在本组件内独立开第二条
   * useSnapshot()/SSE 订阅）。可选：未传（独立渲染/既有测试）时 stageCounts 回落全零，
   * 流程带只是不显计数气泡与脉冲，不影响其余功能——不破坏任何未接线该 prop 的既有消费方。
   */
  snapshot?: Snapshot | null
}

export function WorkbenchView({ root, onToggleError, snapshot = null }: WorkbenchViewProps): JSX.Element {
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
  // 验收反馈#4（补齐 T13 遗留缺口）：「+ 添加阶段」Dialog 的本地草稿态——不进 def，
  // 只在确认那一刻才把完整新 step 写进草稿（def 仍是唯一真相源，见下方 confirmAddStage）。
  const [addStageOpen, setAddStageOpen] = useState(false)
  const [stageDraftName, setStageDraftName] = useState('')
  const [stageDraftId, setStageDraftId] = useState('')
  // ID 字段一旦被用户直接编辑过，名称字段的自动 slug 化就不再覆盖它（同 GitHub repo
  // 名→slug 惯例）；Dialog 每次关闭都重置，见 closeAddStage。
  const [stageIdTouched, setStageIdTouched] = useState(false)
  const addStageNameRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  // T13 脏状态四件套之一（旧画布编辑器 Task 15 先例）：「最近一次加载/保存成功」的 def 快照
  // 存 ref 不进 state——快照只在 load/save 成功那一刻写入，本身不需要触发渲染；dirty 每次渲染
  // 从「当前 def vs 快照」重算（见下方声明处注释：故意不 useMemo，ref 变化对记忆化不可见）。
  const defSnapshotRef = useRef<string | null>(null)
  // T15：/api/hooks 读写状态托管在这里（不在 HookTimeline 内）——阶段卡 hooksCount 真数、
  // 摘要卡「钩子」行、时序线开关三个消费方吃同一份矩阵。per-root 配置，与 workflow 草稿无关。
  const hooksConfig = useHooksConfig(root, onToggleError)
  // v6 T8→T9：就绪三灯重拉信号——凭证卡保存/删除成功后 +1(显式动作,不轮询)。
  const [rdNonce, setRdNonce] = useState(0)
  // ── v8-E（意见⑥）：主列 sheet 页签化——五页：阶段编辑(StepEditor+HookTimeline)/自动运行
  //    (LoopCard)/AFK 执行(AutomationCard)/凭证(SecretsCard)/技能健康(SkillHealthPanel+矩阵
  //    入口卡)。全部 pane 恒挂载（各卡数据面在挂载时自取,与页签化前行为一致；测试也依赖
  //    恒挂载可寻址），显隐只切 .on 类；点阶段卡 → 选中 + 切回「阶段编辑」页。──
  const WB_TABS = ['stage', 'loop', 'afk', 'secrets', 'health'] as const
  type WbTab = (typeof WB_TABS)[number]
  const [tab, setTab] = useState<WbTab>('stage')
  // 首帧不放 pane 入场动画（只有真实切页才 crossfade）——ref 存上一次页签。
  const prevTabRef = useRef<WbTab | null>(null)

  // ── v6 T13：最近流转数据面——当前 (root, workflow) 分组内非 archived change 的 history
  //    合并降序。无轮询(G22 纪律)：只随分组指纹(recentNames)变化拉取；单 change 读失败按
  //    空记录收敛(best-effort，不挡卡片其余行)。
  const [recent, setRecent] = useState<Array<ChangeHistoryEntry & { change: string }> | null>(null)
  // 无记录 change 数——legacy「早期记录不可用」的如实标注(决议#10)。
  const [recentSilent, setRecentSilent] = useState(0)
  const recentNames = useMemo(() => {
    const project = snapshot?.projects.find((p) => p.root === root)
    if (!project?.ok || !wfName) return [] as string[]
    return project.changes
      .filter((c) => c.archived !== 'true' && changeWorkflowName(c) === wfName)
      .map((c) => c.name)
  }, [snapshot, root, wfName])
  useEffect(() => {
    let cancelled = false
    if (recentNames.length === 0) {
      setRecent([])
      setRecentSilent(0)
      return
    }
    setRecent(null)
    void Promise.all(
      recentNames.map((n) =>
        getHistory(n, root)
          .then((es) => ({ n, es }))
          .catch(() => ({ n, es: [] as ChangeHistoryEntry[] })),
      ),
    ).then((all) => {
      if (cancelled) return
      const merged = all.flatMap(({ n, es }) => es.map((e) => ({ ...e, change: n })))
      merged.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
      setRecent(merged.slice(0, 12))
      setRecentSilent(all.filter((x) => x.es.length === 0).length)
    })
    return () => {
      cancelled = true
    }
  }, [recentNames, root])
  // T16：/api/loops/snapshot 的读取托管在这里（useHooksConfig 的同一条「数据住共同祖先」
  // 纪律）——Loop 卡与右栏摘要「自动运行」行吃同一份 rows。
  const loops = useLoops(root)

  // ── workflow 名列表（自定义名；default 恒在菜单尾部本地补上）——client 既有 fetchWorkflowNames
  //    接缝（错误经 ApiError：server {error} 文案两侧同读；无信封/网络错误的兜底文案随 client 口径）──
  useEffect(() => {
    let cancelled = false
    fetchWorkflowNames(root)
      .then((names) => {
        if (cancelled) return
        setNames(names)
        setNamesError(null)
        setWfName((cur) => cur ?? names[0] ?? 'default')
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
    fetchWorkflow(wfName, root)
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
  // 不换 def 引用，[def] 依赖的记忆化会继续供 save 之前缓存的 true——旧画布编辑器 Task 15
  // 声明处注释的同一条 React 记忆化限制）。JSON.stringify 在编辑器量级的 def 上开销可忽略。
  const dirty = !readonlyWf && def !== null && defSnapshotRef.current !== null && JSON.stringify(def) !== defSnapshotRef.current

  // StepEditor 的写回口：按 id 换入编辑后的完整 step（def 是唯一草稿真相源，
  // stepper/摘要/流程预览全部由它派生，编辑即联动）。
  function updateStep(updated: WbStepDef): void {
    setDef((prev) => (prev ? { ...prev, steps: prev.steps.map((s) => (s.id === updated.id ? updated : s)) } : prev))
  }

  // ── 验收反馈#4（补齐 T13 遗留缺口）：「+ 添加阶段」Dialog 的校验与插入 ──
  const stageIdTrimmed = stageDraftId.trim()
  const stageIdInvalid = stageIdTrimmed.length > 0 && !STAGE_ID_RE.test(stageIdTrimmed)
  const stageIdDup = stageIdTrimmed.length > 0 && !stageIdInvalid && (def?.steps.some((s) => s.id === stageIdTrimmed) ?? false)
  const stageIdError = stageIdInvalid
    ? t('workbench.add_stage_id_invalid')
    : stageIdDup
      ? t('workbench.add_stage_id_dup')
      : null
  const canSubmitStage = stageIdTrimmed.length > 0 && !stageIdInvalid && !stageIdDup

  function closeAddStage(): void {
    setAddStageOpen(false)
    setStageDraftName('')
    setStageDraftId('')
    setStageIdTouched(false)
  }

  // 插入语义（线性 stepper，spec 决议）：插在「当前选中阶段」之后；未选中（或选中项已不在
  // steps 里）则追加到末尾。转换边只处理线性的那一条——插入点前一个 step 若有 transition
  // 指向「原下一个 step」，把它的 to 改指新 step、新 step 补一条 `${id}-complete` 转到原后继；
  // 其它分支 transition（如 review 的 rejected→draft）原样不动。插在末尾、或前一步压根没有
  // 指向原下一个 step 的转换边时，新 step 不加任何 transitions——不替它编造线性语义之外的边，
  // 也不会产出中间 step 零 transitions 的悬空态（kernel validate 只许最后一个 step 零边）。
  function confirmAddStage(): void {
    if (!canSubmitStage || !def) return
    const id = stageIdTrimmed
    const label = stageDraftName.trim()
    setDef((prev) => {
      if (!prev) return prev
      const steps = prev.steps
      const selIdx = stageId ? steps.findIndex((s) => s.id === stageId) : -1
      const insertIndex = selIdx >= 0 ? selIdx + 1 : steps.length
      const prevStep = insertIndex > 0 ? steps[insertIndex - 1] : undefined
      const nextStep = steps[insertIndex] // 插入前的「原下一个 step」，末尾插入时为 undefined

      let newTransitions: WbStepDef['transitions'] = []
      let steppedSteps = steps
      if (prevStep && nextStep) {
        const fwdIdx = prevStep.transitions.findIndex((tr) => tr.to === nextStep.id)
        if (fwdIdx >= 0) {
          newTransitions = [{ event: `${id}-complete`, to: nextStep.id }]
          steppedSteps = steps.map((s, i) =>
            i === insertIndex - 1
              ? { ...s, transitions: s.transitions.map((tr, ti) => (ti === fwdIdx ? { ...tr, to: id } : tr)) }
              : s,
          )
        }
      }

      const newStep: WbStepDef = {
        id, label, gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: newTransitions,
      }
      const finalSteps = [...steppedSteps]
      finalSteps.splice(insertIndex, 0, newStep)
      return { ...prev, steps: finalSteps }
    })
    setStageId(id)
    closeAddStage()
  }

  async function save(): Promise<void> {
    if (!def || !wfName || readonlyWf || !dirty || saving) return
    setSaving(true)
    setSaveStatus({ kind: 'idle' })
    try {
      const res = await postWorkflowDef(wfName, { ...def, root })
      if (!res.ok) {
        setSaveStatus({ kind: 'error', errors: await readSaveErrors(res) })
        return
      }
      // spec §2.1：保存成功必须失效 (root,name) 规则缓存——收件箱/进度的下一个消费方才能
      // 看到新 gate/新阶段（旧画布编辑器 评审 P0-4 的同一条纪律，接线不遗漏）。
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

  // 真切换收口：把 def/defError 的清空或预置与 setWfName 摆进同一次事件批次，不等下面
  // useEffect 异步跟进——消除真机下拉标签先变、阶段卡隔一帧才变的瞬态错位。下面 useEffect
  // 仍会再跑一遍（default 分支重复赋值是幂等的，非 default 分支照常负责真正发起 fetchWorkflow）。
  function switchTo(name: string): void {
    setWfName(name)
    setDef(name === 'default' ? DEFAULT_DEF : null)
    setDefError(null)
  }

  // 菜单项点击的切换入口。脏状态四件套之三：禁止 useCallback 包裹（冻结 dirty 快照——
  // 旧看板视图/InboxView closePending 的 busy 冻结教训同款），每次渲染的新鲜闭包正是这里
  // 读到最新 dirty 的机制。
  function requestSwitch(name: string): void {
    setMenuOpen(false)
    if (name === wfName) return
    if (dirty) {
      setPendingSwitch(name)
    } else {
      switchTo(name)
    }
  }

  function confirmSwitch(): void {
    if (pendingSwitch !== null) switchTo(pendingSwitch)
    setPendingSwitch(null)
  }

  // ── stepper 入场（沿 motion.ts 既有词汇；reduced-motion 由 revealList 自身处理）──
  // T13 起 def 就是编辑草稿：依赖收敛为 def?.name（只在切换 workflow/首次载入时重播），
  // 依赖整个 def 会让每次击键都重播全排卡入场——装饰性噪音，不是真实状态变化
  //（旧 workflow 列表页 列表入场依赖 Boolean(names) 的同一条既有纪律）。
  // v6 T11：选择器随 StepperRail 重写从卡片 .wb-step 换成流程带段 .wb-flow-seg（testid
  // `wb-step-{id}` 不变，变的只是承载视觉入场动画的 CSS 类）。
  // v8-E：再随阶段卡横排换 .wb8-stage（同一条纪律——入场动画只认视觉承载类，行为契约不动）。
  useGSAP(() => {
    if (def && def.steps.length > 0) revealList('.wb8-stage')
  }, { scope: rootRef, dependencies: [def?.name] })

  // ── v8-E：sheet 页签墨线滑动 + pane 切换 crossfade（demo placeInk/stab click 对位）——
  //    useGSAP+matchMedia 全包：reduced 墨线直落位、pane 直切不 crossfade；首帧只落墨线不放
  //    pane 动画。依赖含 def?.name：def 首载后 sheet 才在 DOM 里，墨线要补一次落位。
  //    不挂 revertOnUpdate（评审 P2-7）：revert 会把墨线 inline left/width 打回样式表缺省
  //    （left:0），每次切页签都从最左飞入——去掉后 gsap.to 天然从当前位置延续滑动；ink 补间
  //    加 overwrite:'auto' 收编快速连点/媒体查询翻转时的旧补间，pane crossfade 自带 clearProps
  //    自清，无需整体 revert。──
  useGSAP(
    () => {
      const el = rootRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          const ink = el.querySelector<HTMLElement>('.wb8-ink')
          const onTab = el.querySelector<HTMLElement>(`[data-testid="wb-tab-${tab}"]`)
          if (ink && onTab?.parentElement) {
            const tr = onTab.getBoundingClientRect()
            const pr = onTab.parentElement.getBoundingClientRect()
            const left = tr.left - pr.left + 6
            const width = Math.max(tr.width - 12, 0)
            if (reduce) gsap.set(ink, { left, width })
            else gsap.to(ink, { left, width, duration: 0.28, ease: 'expo.out', overwrite: 'auto' })
          }
          const first = prevTabRef.current === null
          const changed = prevTabRef.current !== null && prevTabRef.current !== tab
          prevTabRef.current = tab
          if (reduce || first || !changed) return
          const pane = el.querySelector<HTMLElement>(`[data-testid="wb-pane-${tab}"]`)
          if (pane) gsap.fromTo(pane, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power3.out', clearProps: 'all' })
        },
      )
    },
    { scope: rootRef, dependencies: [tab, def?.name] },
  )

  // T13：脏切换确认 Dialog 入场（共享 <Dialog> 不对外暴露内部节点，scope 选择器文本寻址——
  // 旧画布编辑器 Task 15 返回确认弹窗的同款既有写法）。
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

  // v6 计划 T11：当前 workflow 下每阶段的真实计数/running（stageCounts 纯函数，见文件头）。
  const ambientByStage = useMemo(
    () => (wfName ? stageCounts(snapshot, root, wfName) : {}),
    [snapshot, root, wfName],
  )

  const stepperSteps: StepperStep[] = useMemo(() => {
    if (!def) return []
    return def.steps.map((s, i) => {
      const next = def.steps[i + 1]
      const fwd = next ? s.transitions.find((tr) => tr.to === next.id) : undefined
      const amb = ambientByStage[s.id]
      return {
        id: s.id,
        name: stepName(s),
        gate: s.gate,
        skills: [...new Set(s.skills.map((sk) => sk.id))],
        outputsCount: s.outputs.length,
        hooksCount: hookCountOf(s.id),
        linkEvent: fwd?.event ?? null,
        count: amb?.count ?? 0,
        running: amb?.running ?? false,
      }
    })
  }, [def, stepName, hookCountOf, ambientByStage])

  // v6 计划 T11：门徽章 popover 静态内容——gate.sh + interactive-skill-gate.sh 对任意复核门
  // 恒强制拦截（决议 #2），与具体阶段无关，故只需算一次；HookTimeline.tsx 的 LOCKED_IDS 是
  // 唯一真相源（不在本文件重复写 id 字符串），name/desc 复用其既有 hk_name_/hk_desc_ 系列
  // 词典（T15 已建）。缺翻译时 t() 回落 key 本身，同 HookTimeline.tsx 同款兜底判断。
  const gateHooks: GateHookInfo[] = useMemo(
    () =>
      [...LOCKED_IDS].map((id) => {
        const nameKey = `workbench.hk_name_${id}`
        const descKey = `workbench.hk_desc_${id}`
        const name = t(nameKey)
        const desc = t(descKey)
        return { id, name: name === nameKey ? id : name, desc: desc === descKey ? '' : desc }
      }),
    [t],
  )

  // v6 T11：running 脉冲——光泽扫过循环，惯例逐字对齐 ProgressView.tsx 的执行中段光泽实现
  // （matchMedia 全包 + reduce 直达终态 + repeat:-1 循环，见该文件 :399-450）。依赖键=当前
  // running 阶段 id 指纹：running 集合变化（snapshot 新帧/切 workflow）才重建，避免每次渲染
  // 都杀掉重放循环补间；revertOnUpdate 保证依赖变化时上一轮补间必被清理，不留孤儿循环。
  const runningKey = stepperSteps.filter((s) => s.running).map((s) => s.id).join(',')
  useGSAP(
    () => {
      const el = rootRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          // v8-E：承载元素随阶段卡横排从 .wb-flow-gloss 换 .wb8-gloss（testid wb-flow-gloss-* 不变）。
          const glosses = Array.from(el.querySelectorAll<HTMLElement>('.wb8-gloss'))
          if (glosses.length === 0) return // 常见态（无 running 阶段）：不喂空数组给 gsap.set，避免控制台噪音
          if (reduce) {
            gsap.set(glosses, { autoAlpha: 0 })
            return
          }
          for (const gloss of glosses) {
            const seg = gloss.parentElement
            const glossW = gloss.offsetWidth || 46
            gsap
              .timeline({ repeat: -1, repeatDelay: 0.5 })
              .fromTo(
                gloss,
                { x: -glossW, autoAlpha: 0.9 },
                { x: () => (seg?.offsetWidth ?? 160) + glossW, duration: 1.1, ease: 'power1.inOut' },
              )
          }
        },
      )
    },
    { scope: rootRef, dependencies: [runningKey], revertOnUpdate: true },
  )

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
                // v8-E：点阶段卡 = 选中 + 驱动下方 sheet 切回「阶段编辑」页（demo stage click 同款）。
                onSelect={(id) => {
                  setStageId(id)
                  setTab('stage')
                }}
                label={t('workbench.rail_label', { name: def.name })}
                // 验收反馈#4（补齐 T13 遗留缺口）：default 只读态不传 handler——StepperRail
                // 按既有 disabled={!onAddStage} 语义自动落回禁用态 + title 提示，本组件零改动。
                onAddStage={readonlyWf ? undefined : () => setAddStageOpen(true)}
                gateHooks={gateHooks}
              />

              {/* ── v8-E（意见⑥）：sheet 页签容器——主列不再平铺。五 pane 恒挂载（各卡数据面
                  行为与平铺时代一致），显隐切 .on；墨线/crossfade 由上方 useGSAP 驱动。 ── */}
              <div className="wb8-sheet" data-testid="wb-sheet">
                <div className="wb8-tabs" role="tablist" aria-label={t('workbench.tabs_label')}>
                  {WB_TABS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      className="wb8-tab"
                      aria-selected={tab === k}
                      data-testid={`wb-tab-${k}`}
                      onClick={() => setTab(k)}
                    >
                      {t(`workbench.tab_${k}`)}
                      {k === 'stage' && selectedStep && <span className="n">{selectedStep.id}</span>}
                    </button>
                  ))}
                  <span className="wb8-ink" aria-hidden="true" />
                </div>
                <div className="wb8-sheet-body">
                  {/* 页 1：阶段编辑——StepEditor（内含 SkillChain）+ Hook 时序线（v6 T12 曾挪右栏，
                      v8-E 收进本页签：per-root 数据面不吃 workflow 只读态，开关仍按当前选中阶段读写）。 */}
                  <div className={`wb8-pane${tab === 'stage' ? ' on' : ''}`} role="tabpanel" data-testid="wb-pane-stage">
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
                        {/* T13：阶段编辑表单（T14 技能链在 StepEditor 内继续分区挂载）。
                            key 按 (workflow, step) 复合——切阶段/切 workflow 时「+ 添加」输入态随卸载复位。 */}
                        <StepEditor
                          key={`${def.name}:${selectedStep.id}`}
                          step={selectedStep}
                          workflow={def.name}
                          readonly={readonlyWf}
                          onChange={updateStep}
                        />
                      </section>
                    )}
                    {selectedStep && <HookTimeline phase={selectedStep.id} config={hooksConfig} />}
                  </div>
                  {/* 页 2：自动运行(Loop)（per-root 数据面，不吃 workflow 只读态）。 */}
                  <div className={`wb8-pane${tab === 'loop' ? ' on' : ''}`} role="tabpanel" data-testid="wb-pane-loop">
                    <LoopCard root={root} loops={loops} />
                  </div>
                  {/* 页 3：AFK 执行——per-root .pipeline/automation.json（并发/重试/默认入队/沙箱镜像）。 */}
                  <div className={`wb8-pane${tab === 'afk' ? ' on' : ''}`} role="tabpanel" data-testid="wb-pane-afk">
                    <AutomationCard root={root} refreshToken={rdNonce} />
                  </div>
                  {/* 页 4：凭证(机器级)——保存/删除成功即刷新 AFK 页就绪三灯（rdNonce 接线不变）。 */}
                  <div className={`wb8-pane${tab === 'secrets' ? ' on' : ''}`} role="tabpanel" data-testid="wb-pane-secrets">
                    <SecretsCard onChanged={() => setRdNonce((n) => n + 1)} />
                  </div>
                  {/* 页 5：技能健康——SkillHealthPanel + manifest 技能矩阵入口卡（v6 T12 曾在右栏，
                      v8-E 收进本页签；入口仍走 requestSwitch 含脏守卫）。 */}
                  <div className={`wb8-pane${tab === 'health' ? ' on' : ''}`} role="tabpanel" data-testid="wb-pane-health">
                    <SkillHealthPanel />
                    <div className="side-card wb8-mx" data-testid="wb-mx-card">
                      <div className="side-card__head"><b>{t('workbench.mx_title')}</b></div>
                      <div className="side-card__body">
                        <p className="wb-note">{t('workbench.mx_body')}</p>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          data-testid="wb-mx-open"
                          disabled={wfName === 'default'}
                          title={wfName === 'default' ? t('workbench.mx_open_here') : undefined}
                          onClick={() => requestSwitch('default')}
                        >
                          {t('workbench.mx_open')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
              {/* T16：「自动运行」行——显示已保存真值（选中 loop 的启停 + 今日轮次/上限），
                  不吃 Loop 卡未保存草稿；加载中/失败回落 '—'、无 loop 显「未配置」。 */}
              <div className="side-card__row">
                <span className="side-card__row-label">{t('workbench.lp_sum')}</span>
                <span className="side-card__row-value" data-testid="wb-sum-loop">
                  {loops.rows === null
                    ? '—'
                    : loops.selected === null
                      ? t('workbench.lp_sum_none')
                      : t(loops.selected.status === 'active' ? 'workbench.lp_sum_on' : 'workbench.lp_sum_off', {
                          n: loops.selected.budget.runsToday,
                          max: loops.selected.budget_decl.max_runs_per_day,
                        })}
                </span>
              </div>
            </div>
          </div>

          {/* v8-E 右栏瘦身（意见⑥）：Hook 时序卡（v6 T12 曾在此）并入「阶段编辑」页签、
              矩阵入口卡与 SkillHealthPanel 并入「技能健康」页签——右栏只留 摘要/安全门说明/最近流转。 */}

          {/* v6 T12：安全门说明卡（决议#2 的人话版，静态）——强制常开是安全边界，不提供开关。 */}
          <div className="side-card" data-testid="wb-side-safegate">
            <div className="side-card__head"><b>{t('workbench.sg_title')}</b></div>
            <div className="side-card__body">
              <p className="wb-note">{t('workbench.sg_locked_body')}</p>
              <p className="wb-note">{t('workbench.sg_pending_body')}</p>
            </div>
          </div>

          {/* v6 T13：最近流转——真实 history 事件回放（GSAP 假预演退役,决议#10/#5:legacy 如实
              标注不可用、archived 不入列;决议#11 量级 <50,逐 change 只读端点合并,不新增聚合端点;
              G22 纪律:无轮询,只随 (root,workflow,changes) 指纹变化拉取）。 */}
          <div className="side-card" data-testid="wb-recent">
            <div className="side-card__head">
              <b>{t('workbench.recent_title')}</b>
              <span className="side-card__head-action wb-ed-note">{t('workbench.recent_note')}</span>
            </div>
            <div className="side-card__body">
              {recent === null && <p className="wb-note">{t('common.loading')}</p>}
              {recent !== null && recent.length === 0 && (
                <p className="wb-note" data-testid="wb-recent-empty">{t('workbench.recent_empty')}</p>
              )}
              {recent !== null && recent.length > 0 && (
                <ul className="wb-rt-list" data-testid="wb-recent-list">
                  {recent.map((e, i) => (
                    <li key={`${e.change}-${e.ts}-${i}`} className="wb-rt-item">
                      <span className="wb-rt-ts mono">{e.ts.slice(5, 16).replace('T', ' ')}</span>
                      <span className="wb-rt-chg mono">{e.change}</span>
                      <span className="wb-rt-what">
                        {e.kind === 'transition'
                          ? `${e.from ?? '?'} → ${e.to ?? '?'}`
                          : e.field
                            ? t('workbench.recent_set', { field: e.field })
                            : (e.raw ?? e.kind)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {recent !== null && recentSilent > 0 && (
                <p className="wb-note" data-testid="wb-recent-legacy">{t('workbench.recent_legacy', { n: recentSilent })}</p>
              )}
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

      {/* 验收反馈#4（补齐 T13 遗留缺口）：「+ 添加阶段」Dialog——阶段名称 + 阶段 ID（自动
          slug 化、可编辑覆盖）。<form>+onSubmit 让名称/ID 输入框回车即提交（NewChangeDialog
          既有先例）：自己渲染 dialog__actions 而不用 Dialog 的 actions prop，两个按钮和输入框
          才能同在一个 <form> 里。 */}
      {addStageOpen && (
        <Dialog
          title={t('workbench.add_stage_dialog_title')}
          onClose={closeAddStage}
          testid="wb-add-stage"
          initialFocusRef={addStageNameRef}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              confirmAddStage()
            }}
          >
            {/* htmlFor/id 显式配对而非 label 包裹（NewChangeDialog 的包裹写法在字段无错误态时
                够用，但错误 <span> 若嵌进同一个 <label>，label 的可访问名会把错误原文一起拼
                进去，getByLabelText 精确匹配就会在报错那一刻突然找不到控件——本 Dialog 的
                ID 字段必须能同时有错误态又能被 getByLabelText 稳定命中，改用 StepEditor.tsx
                「阶段名称」字段同款的显式配对，errors 放 label 之外不影响可访问名）。 */}
            <div className="dialog__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label className="field__label" htmlFor="wb-add-stage-name-input">
                  {t('workbench.add_stage_name_label')}
                </label>
                <input
                  ref={addStageNameRef}
                  id="wb-add-stage-name-input"
                  className="input"
                  data-testid="wb-add-stage-name"
                  value={stageDraftName}
                  onChange={(e) => {
                    const v = e.target.value
                    setStageDraftName(v)
                    if (!stageIdTouched) setStageDraftId(slugifyStageName(v))
                  }}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="wb-add-stage-id-input">
                  {t('workbench.add_stage_id_label')}
                </label>
                <input
                  id="wb-add-stage-id-input"
                  className={stageIdError ? 'input input--error' : 'input'}
                  style={{ fontFamily: 'var(--mono)' }}
                  data-testid="wb-add-stage-id"
                  value={stageDraftId}
                  onChange={(e) => {
                    setStageDraftId(e.target.value)
                    setStageIdTouched(true)
                  }}
                />
                {stageIdError && <span className="field__error" data-testid="wb-add-stage-id-error">{stageIdError}</span>}
              </div>
            </div>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={closeAddStage}>
                {t('workbench.add_stage_cancel')}
              </button>
              <button type="submit" className="btn" data-testid="wb-add-stage-confirm" disabled={!canSubmitStage}>
                {t('workbench.add_stage_confirm')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  )
}
