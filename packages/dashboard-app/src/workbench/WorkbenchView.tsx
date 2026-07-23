import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ChevronDown, Layers3 } from 'lucide-react'
import { deleteWorkflowDef, fetchWorkflow, fetchWorkflowNames, getHistory, postWorkflowDef, type ChangeHistoryEntry } from '../api/client'
import { useT } from '../i18n'
import { changeWorkflowName } from '../model/progressModel'
import { DEFAULT_RULES, invalidateWorkflowRules, rulesKey, useWorkflowRulesMulti } from '../model/workflowModel'
import { Dialog } from '../shell/Dialog'
import { EVENT_BY_EDGE, PHASES, REVIEW_PHASES, TRANSITIONS, isPhase, type ChangeSnapshot, type Snapshot } from '../types'
import { revealDialog, revealList } from '../shared/motion'
import './workbench.css'
import { LOCKED_IDS, useHooksConfig } from './HookTimeline'
import { useLoops } from './LoopCard'
import { LaneMandatorySkills, TrackSelector, useMandatorySkills } from './mandatorySkills'
import { WorkbenchSideRail } from './WorkbenchSideRail'
import { type BoardLane, type LanePatch } from './OrchestrationBoard'
import { ExecutionTimelineComposer } from './ExecutionTimelineComposer'
import { SkillOrchestrationDialog } from './SkillOrchestrationDialog'

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
export interface WbTrackPredicate { kind: 'track-in' | 'track-not-in'; values: string[] }
export type WbGuardConfig = (
  | { type: 'tasks-at-least'; n: number }
  | { type: 'nonempty-output' }
  | { type: 'field-nonempty'; field: string }
  | { type: 'file-exists'; path: { kind: 'field'; field: string } }
  | { type: 'field-equals'; field: string; value: string }
  | { type: 'field-in'; field: string; values: [string, ...string[]] }
  | { type: 'full-direct-override' }
  | { type: 'build-head-unchanged'; field: 'build_sha' }
) & { when?: WbTrackPredicate }
export type WbActionConfig =
  | { type: 'freeze-build-sha' }
  | { type: 'mark-verification-passed' }
  | { type: 'mark-verification-failed' }
  | { type: 'archive-run' }
export interface WbArtifactConfig {
  field: string
  type: 'file_path'
  producerPolicy: 'effective-step-skills' | 'effective-phase-skills'
  requiredWhen?: WbTrackPredicate
}
export interface WbTransition {
  event: string
  to: string
  guards?: WbGuardConfig[]
  actions?: WbActionConfig[]
}
export interface WbStepDef {
  id: string
  label: string
  gate: 'review' | 'confirm' | null
  prompt?: string
  skills: WbSkillRef[]
  inputs: WbFieldRef[]
  outputs: WbFieldRef[]
  artifacts?: WbArtifactConfig[]
  guards: WbGuardConfig[]
  transitions: WbTransition[]
}
export interface WbWorkflowDef { name: string; openspecContract?: 'required'; steps: WbStepDef[] }

/**
 * 'default' workflow 的本地投影（零网络，同 workflowModel.buildDefaultRules 的构造思路，
 * 但保留 StepDef 全形状供 stepper/摘要消费）：runtime 不落盘 default 定义文件，server 的
 * GET /api/workflows 列表也不含它，所以从 types.ts 的 manifest 镜像常量合成。
 * skills 为空——default 的强制技能来自 manifest 矩阵，不在 workflow 定义里（T14 语境）。
 * inputs/outputs/artifacts/guards 则必须逐字段镜像 templates/workflows/default.yaml；此前把它们
 * 全部写成空数组，会让工作台谎报「无产出」，也让默认流程的守卫摘要失真。
 */
function buildDefaultDef(): WbWorkflowDef {
  const shape: Record<(typeof PHASES)[number], Pick<WbStepDef, 'label' | 'inputs' | 'outputs' | 'artifacts' | 'guards'>> = {
    open: { label: '立项', inputs: [], outputs: [], guards: [] },
    explore: {
      label: '调研', inputs: [], outputs: [{ field: 'design_doc', type: 'file_path' }],
      artifacts: [{ field: 'design_doc', type: 'file_path', producerPolicy: 'effective-phase-skills' }], guards: [],
    },
    spec: {
      label: '规格', inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [{ field: 'plan', type: 'file_path' }],
      artifacts: [{ field: 'plan', type: 'file_path', producerPolicy: 'effective-phase-skills', requiredWhen: { kind: 'track-not-in', values: ['pm'] } }],
      guards: [{ type: 'tasks-at-least', n: 3 }],
    },
    build: {
      label: '实现', inputs: [{ field: 'design_doc', type: 'file_path' }, { field: 'plan', type: 'file_path' }],
      outputs: [{ field: 'build_sha', type: 'string' }], guards: [],
    },
    verify: {
      label: '验证', inputs: [{ field: 'build_sha', type: 'string' }], outputs: [{ field: 'verification_report', type: 'file_path' }],
      artifacts: [{ field: 'verification_report', type: 'file_path', producerPolicy: 'effective-phase-skills' }], guards: [],
    },
    ship: { label: '交付', inputs: [], outputs: [], guards: [] },
    archive: { label: '归档', inputs: [], outputs: [], guards: [] },
  }
  return {
    name: 'default',
    openspecContract: 'required',
    steps: PHASES.map((p) => {
      const projected = shape[p]
      return {
        id: p,
        ...projected,
        gate: (REVIEW_PHASES as readonly string[]).includes(p) ? ('review' as const) : null,
        skills: [],
        transitions: TRANSITIONS[p]
          .filter((to) => to !== p) // archive→archive 自环不是可操作出边
          .map((to) => ({ event: EVENT_BY_EDGE[`${p}->${to}`]!, to })),
      }
    }),
  }
}
const DEFAULT_DEF: WbWorkflowDef = buildDefaultDef()

const GOVERNED_PHASE_SKILLS: Readonly<Record<string, readonly string[]>> = {
  // Persist the exact bare names shipped in this plugin. Legacy namespaces remain readable for
  // old custom workflow files, but new workflows must be executable after `pipeline setup --codex`
  // or `pipeline setup --claude` without another plugin being installed.
  open: ['pipeline-open', 'openspec-propose'],
  explore: ['pipeline-explore', 'brainstorming'],
  spec: ['pipeline-spec', 'openspec-propose', 'writing-plans'],
  build: ['pipeline-build'],
  verify: ['pipeline-verify', 'verification-before-completion'],
  ship: ['pipeline-ship', 'openspec-apply-change'],
  archive: ['pipeline-archive'],
}

/**
 * A UI-created workflow is governed by default.  It deliberately does not shallow-copy the runtime
 * default definition: that definition gets skills from the manifest and has default-only artifact
 * producer policies, whereas a persisted custom workflow must carry its own concrete skills.
 */
function governedWorkflow(name: string): WbWorkflowDef {
  const base = buildDefaultDef()
  return {
    name,
    openspecContract: 'required',
    steps: base.steps.map((step) => ({
      ...step,
      skills: GOVERNED_PHASE_SKILLS[step.id].map((id) => ({ id })),
      artifacts: step.artifacts?.map(({ requiredWhen: _ignored, ...artifact }) => ({
        ...artifact,
        producerPolicy: 'effective-step-skills',
        // A governed custom workflow has a complete OpenSpec plan for every track; preserving the
        // default PM exclusion here would create a misleading split between its artifact and ledger rules.
      })),
    })),
  }
}

// ── v10b 全量迁移（2026-07-14）：tailwind 原子类合集——原 styles.ts 的 .btn/.wb-status/
//    .side-card*/.wb8-pane/.view__note 等区块等值搬运。颜色只走 token 语义类（bg-card/
//    text-text-2/border-border/绿红琥珀 family）或 var(--*)，零硬编码色值；状态由
//    data-state/aria-*/data-on 承载，样式用对应变体挂。 ──
const BTN_SOLID =
  'cursor-pointer rounded-md bg-btn-bg px-4 py-2 text-[12.5px] font-bold text-btn-fg transition-colors hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50'
const BTN_GHOST =
  'cursor-pointer rounded-md border border-border bg-transparent px-4 py-2 text-[12.5px] font-semibold text-text-2 transition-colors hover:border-text-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
const BTN_DANGER =
  'cursor-pointer rounded-md border border-red-b bg-transparent px-4 py-2 text-[12.5px] font-bold text-red-d transition-colors hover:bg-red-t disabled:cursor-not-allowed disabled:opacity-50'
const PILL = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold'
const NOTE = 'text-xs leading-[1.55] text-text-3'
const ERR_NOTE = 'p-5 text-[13px] text-red'
const SIDE_CARD = 'rounded-lg border border-border bg-card shadow-sm'
const SIDE_HEAD = 'flex items-center gap-2 border-b border-border px-3.5 py-[11px] text-text-3'
const SIDE_HEAD_B = 'text-[13px] font-bold text-text'
const SIDE_BODY = 'px-3.5 pt-[2px] pb-1'
const SIDE_ROW = 'flex items-center gap-[9px] py-[9px] text-[12.5px] text-text-2'
const SIDE_ROW_LABEL = 'min-w-0 flex-1 truncate font-[550]'
const SIDE_ROW_VALUE = 'flex-none font-mono text-sm font-[750] text-accent-d'
// 添加阶段 Dialog 的字段输入（原 .input/.input--error；错误态由 aria-invalid 承载）。
const FIELD_INPUT =
  'rounded-[7px] border border-border bg-bg px-2.5 py-[7px] text-[12.5px] font-normal text-text transition-[border-color,box-shadow] placeholder:text-text-3 focus-visible:border-green focus-visible:ring-[3px] focus-visible:ring-green-t focus-visible:outline-none aria-invalid:border-red aria-invalid:focus-visible:border-red aria-invalid:focus-visible:ring-red-t'

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

/** v11 P2：技能拖动落位描述（画布只报「谁、从哪、到哪、落在谁前后」，语义落地在下面的纯函数）。 */
export interface SkillMove {
  skillId: string
  fromStage: string
  toStage: string
  /** 落在这个技能之前/之后；null = 落到目标列末尾。 */
  refSkillId: string | null
  after: boolean
}

/** 在 list 里按「参照物 + 前/后」插入 item；refId 为 null 或找不到时追加到末尾。 */
function insertRef<T extends { id: string }>(list: readonly T[], item: T, refId: string | null, after: boolean): T[] {
  const out = [...list]
  let ix = out.length
  if (refId !== null) {
    const p = out.findIndex((k) => k.id === refId)
    if (p >= 0) ix = after ? p + 1 : p
  }
  out.splice(ix, 0, item)
  return out
}

/**
 * 从某技能的 depends_on 里剔掉一个 id；剔空后**删键而不是留空数组**
 * （SkillChain.tsx:326-342 既有纪律：空数组会被 serialize 写出无意义的空行）。
 */
function dropDep(k: WbSkillRef, depId: string): WbSkillRef {
  if (!k.depends_on?.includes(depId)) return k
  const rest = k.depends_on.filter((d) => d !== depId)
  if (rest.length > 0) return { ...k, depends_on: rest }
  const { depends_on: _dropped, ...bare } = k
  return bare
}

/**
 * v11 P2：阶段列拖动重排 + 转换边线性重连。
 * 纯函数 + 直接单测，理由同 removeStageFromDef：这是会破坏 def 结构完整性的操作。
 *
 * 语义（与 confirmAddStage 的「线性主脊」口径同源）：
 * · **只重连「线性 forward 边」**——即某 step 那条指向「旧序里紧邻的下一个 step」的边。
 *   分支边（如 review 的 rejected→draft）原样不动：它按 id 指向的目标仍然存在，重排不该改它的语义。
 * · 线性边的**事件名保留原样**（不重命名）：事件名是 CLI/kernel 也在消费的标识，重排不是改名的理由。
 * · 旧序里是末端（无线性边）的 step，若新序里不再是末端 → **必须补一条** `${id}-complete` 边
 *   （同 confirmAddStage 的命名约定）；否则中间 step 零出边，kernel validate 只许最后一个 step 零边，保存当场拒。
 * · 新序里成了末端的 step → **删掉**它的线性边（同上，末端零边才合法）。
 */
export function reorderStagesInDef(def: WbWorkflowDef, fromId: string, toId: string, after: boolean): WbWorkflowDef {
  if (fromId === toId) return def
  const steps = def.steps
  if (!steps.some((s) => s.id === fromId) || !steps.some((s) => s.id === toId)) return def

  // 按**旧序**记下每个 step 的线性边在其 transitions 数组里的下标——必须先算，重排后就认不出来了。
  const linearIx = new Map<string, number>()
  steps.forEach((s, i) => {
    const next = steps[i + 1]
    if (!next) return
    const ix = s.transitions.findIndex((tr) => tr.to === next.id)
    if (ix >= 0) linearIx.set(s.id, ix)
  })

  const arr = [...steps]
  const moved = arr.splice(arr.findIndex((s) => s.id === fromId), 1)[0]!
  const anchor = arr.findIndex((s) => s.id === toId)
  arr.splice(after ? anchor + 1 : anchor, 0, moved)

  return {
    ...def,
    steps: arr.map((s, i) => {
      const next = arr[i + 1]
      const ix = linearIx.get(s.id)
      if (ix === undefined) {
        // 旧序无线性边（原末端）；新序里若不再是末端，补一条，避免中间 step 零出边
        return next ? { ...s, transitions: [...s.transitions, { event: `${s.id}-complete`, to: next.id }] } : s
      }
      if (!next) {
        // 新序成了末端 → 删线性边
        return { ...s, transitions: s.transitions.filter((_, k) => k !== ix) }
      }
      return { ...s, transitions: s.transitions.map((tr, k) => (k === ix ? { ...tr, to: next.id } : tr)) }
    }),
  }
}

/**
 * v11 P2：技能拖动落位（列内排序 or 跨列搬）。
 *
 * · **列内排序**：depends_on 按 id 解析、与视觉顺序无关，故依赖**全部保留**，只动数组次序。
 * · **跨列搬**：技能离开源列后，两侧的依赖都会变成**跨 step 引用**——那是 kernel 的校验期错误
 *   （kernel/src/workflow/types.ts:SkillRef 注释明写「跨 step 引用是校验期错误」），故必须清：
 *   ① 源列里依赖被搬技能的，剔掉这条依赖；② 被搬技能自己的 depends_on 整个丢弃（它依赖的是源列的技能）。
 * · **目标列已有同名技能** → 整个操作 no-op（技能在阶段内唯一；同 demo moveSkill 的既定语义）。
 */
export function moveSkillInDef(def: WbWorkflowDef, move: SkillMove): WbWorkflowDef {
  const { skillId, fromStage, toStage, refSkillId, after } = move
  const fromStep = def.steps.find((s) => s.id === fromStage)
  const toStep = def.steps.find((s) => s.id === toStage)
  if (!fromStep || !toStep) return def
  const moved = fromStep.skills.find((k) => k.id === skillId)
  if (!moved) return def
  if (fromStage !== toStage && toStep.skills.some((k) => k.id === skillId)) return def

  if (fromStage === toStage) {
    return {
      ...def,
      steps: def.steps.map((s) =>
        s.id !== fromStage ? s : { ...s, skills: insertRef(s.skills.filter((k) => k.id !== skillId), moved, refSkillId, after) },
      ),
    }
  }

  const { depends_on: _crossLaneDepsDropped, ...bare } = moved
  return {
    ...def,
    steps: def.steps.map((s) => {
      if (s.id === fromStage) {
        return { ...s, skills: s.skills.filter((k) => k.id !== skillId).map((k) => dropDep(k, skillId)) }
      }
      if (s.id === toStage) return { ...s, skills: insertRef(s.skills, bare, refSkillId, after) }
      return s
    }),
  }
}

/**
 * v11 P2：设/改/清一条 depends_on。
 * `depends_on` 是 string[]（可多依赖），故这里按「哪一条」精确改，不整体覆写——
 * 覆写会把用户在 YAML 里配的其它依赖静默抹掉。
 *   · prevDep === null && dep !== null → 追加一条（已存在则不重复加）
 *   · prevDep !== null && dep !== null → 把 prevDep 那条替换成 dep（保持其位置）
 *   · dep === null                     → 清掉 prevDep 那条（剔空则删键）
 * 环检测不在这里做：kernel validate 保存时拒并把原文上抛（SkillChain.tsx:24-25 既有纪律）。
 */
export function setSkillDepInDef(
  def: WbWorkflowDef,
  stageId: string,
  skillId: string,
  dep: string | null,
  prevDep: string | null,
): WbWorkflowDef {
  return {
    ...def,
    steps: def.steps.map((s) => {
      if (s.id !== stageId) return s
      return {
        ...s,
        skills: s.skills.map((k) => {
          if (k.id !== skillId) return k
          if (dep === null) return prevDep === null ? k : dropDep(k, prevDep)
          const cur = k.depends_on ?? []
          if (prevDep === null) return cur.includes(dep) ? k : { ...k, depends_on: [...cur, dep] }
          if (!cur.includes(prevDep)) return k
          // 替换：保持原位置；若 dep 已在别处存在，替换即等于删除 prevDep（不产生重复项）
          const next = cur.map((d) => (d === prevDep ? dep : d)).filter((d, i, a) => a.indexOf(d) === i)
          return { ...k, depends_on: next }
        }),
      }
    }),
  }
}

/**
 * v11 P4：删技能 + 依赖级联清理。
 * 纯函数直接单测：删技能会让别的技能的 depends_on 指向不存在的 id——kernel validate 的校验期错误。
 * 逐字对齐 SkillChain.tsx:326-342 的既有 removeSkill 语义（含「剔空后删键而非留空数组」）。
 */
export function removeSkillFromDef(def: WbWorkflowDef, stageId: string, skillId: string): WbWorkflowDef {
  const step = def.steps.find((s) => s.id === stageId)
  if (!step?.skills.some((k) => k.id === skillId)) return def
  return {
    ...def,
    steps: def.steps.map((s) =>
      s.id !== stageId ? s : { ...s, skills: s.skills.filter((k) => k.id !== skillId).map((k) => dropDep(k, skillId)) },
    ),
  }
}

/** v11 P4：加技能（追加到列尾，无依赖）。已存在则 no-op——技能在阶段内唯一。 */
export function addSkillToDef(def: WbWorkflowDef, stageId: string, skillId: string): WbWorkflowDef {
  const step = def.steps.find((s) => s.id === stageId)
  if (!step || step.skills.some((k) => k.id === skillId)) return def
  return { ...def, steps: def.steps.map((s) => (s.id !== stageId ? s : { ...s, skills: [...s.skills, { id: skillId }] })) }
}

/**
 * v11 P4：nonempty-output guard 开关。
 * 逐字对齐 StepEditor.tsx:70-78 的 toggleNonempty：只增删 `{type:'nonempty-output'}` 这一种 guard，
 * `tasks-at-least` 等其它 guard 原样保留（本视图不提供其编辑，但保存要原样带回，不能顺手抹掉）。
 */
export function setLaneGuardInDef(def: WbWorkflowDef, stageId: string, nonempty: boolean): WbWorkflowDef {
  return {
    ...def,
    steps: def.steps.map((s) => {
      if (s.id !== stageId) return s
      const has = s.guards.some((g) => g.type === 'nonempty-output')
      if (has === nonempty) return s
      return {
        ...s,
        guards: nonempty ? [...s.guards, { type: 'nonempty-output' as const }] : s.guards.filter((g) => g.type !== 'nonempty-output'),
      }
    }),
  }
}

/**
 * v11 P1：删阶段 + 转换边重连（confirmAddStage :415-457 的逆运算，同一条线性 stepper 语义）。
 * 纯函数：删阶段是本视图唯一会破坏 def 结构完整性的操作，故提出来直接单测（同 stageCounts 先例）。
 *
 * 为什么必须重连：删掉一个 step 会让指向它的转换边变成**悬空引用**，kernel validate 直接拒
 * （G16 纪律：越界 = 「保存成功、下次打不开」；这里更糟——保存当场就会报错）。
 *
 * 规则：
 * · 指向被删 step 的边 → 改指「被删 step 的线性后继」（= 它自己那条指向 steps 里下一个 step
 *   的 forward 边的 to）。这与 confirmAddStage 插入时「把前一步的 forward 改指新 step」正好互逆。
 * · 被删 step 无线性后继（它是末端）→ 指向它的边**直接删掉**，前一步成为新末端。
 *   kernel validate 只许最后一个 step 零边，故这是合法终态。
 * · 分支边（如 review 的 rejected→draft）若也指向被删 step，按同一规则处理——不替它编造新语义，
 *   只保证不留悬空 id。
 * · 重连后若边会指向自己（自环）→ **丢弃该边**。真实场景：删首阶段 draft 时，review 的
 *   `rejected→draft` 会被重连成 `rejected→review` = review 自指。自环不是可操作出边
 *   （同 buildDefaultDef :96 过滤 archive→archive 自环的既有口径），保留它只会在流程带上
 *   画出一条指向自己的假边。
 */
export function removeStageFromDef(def: WbWorkflowDef, laneId: string): WbWorkflowDef {
  const idx = def.steps.findIndex((s) => s.id === laneId)
  if (idx < 0) return def
  const victim = def.steps[idx]!
  const nextStep = def.steps[idx + 1]
  const successorId = nextStep && victim.transitions.some((tr) => tr.to === nextStep.id) ? nextStep.id : null
  return {
    ...def,
    steps: def.steps
      .filter((s) => s.id !== laneId)
      .map((s) => ({
        ...s,
        transitions: s.transitions.flatMap((tr) => {
          if (tr.to !== laneId) return [tr]
          if (successorId === null || successorId === s.id) return []
          return [{ ...tr, to: successorId }]
        }),
      })),
  }
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
  if (res.status === 401) return ['当前页面的保存凭证已失效，请刷新页面后重试。']
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
  // v3 Studio：Workflow 本身的生命周期动作。新建/复制共用一张命名 Dialog；删除单独
  // 保留引用扫描结果，409 时让用户看到究竟是 track、loop 还是 policy template 在引用。
  const [workflowCreateMode, setWorkflowCreateMode] = useState<'new' | 'copy' | null>(null)
  const [workflowDraftName, setWorkflowDraftName] = useState('')
  const [workflowOpBusy, setWorkflowOpBusy] = useState(false)
  const [workflowOpErrors, setWorkflowOpErrors] = useState<string[]>([])
  const [workflowDeleteOpen, setWorkflowDeleteOpen] = useState(false)
  const [workflowDeleteBusy, setWorkflowDeleteBusy] = useState(false)
  const [workflowDeleteError, setWorkflowDeleteError] = useState<{
    message: string
    references: Array<{ kind?: string; source?: string }>
    blockers: Array<{ source?: string; detail?: string }>
  } | null>(null)
  const workflowNameRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [skillEditorOpen, setSkillEditorOpen] = useState(false)
  // T13 脏状态四件套之一（旧画布编辑器 Task 15 先例）：「最近一次加载/保存成功」的 def 快照
  // 存 ref 不进 state——快照只在 load/save 成功那一刻写入，本身不需要触发渲染；dirty 每次渲染
  // 从「当前 def vs 快照」重算（见下方声明处注释：故意不 useMemo，ref 变化对记忆化不可见）。
  const defSnapshotRef = useRef<string | null>(null)
  // T15：/api/hooks 读写状态托管在这里（不在 HookTimeline 内）——阶段卡 hooksCount 真数、
  // 摘要卡「钩子」行、时序线开关三个消费方吃同一份矩阵。per-root 配置，与 workflow 草稿无关。
  const hooksConfig = useHooksConfig(root, onToggleError)
  // v11 P1：default 的 manifest 强制技能矩阵（phase.track）。状态托管在本视图——一份 /api/config
  // 供全部泳道共用（每列自己拉 = 7 次重复请求 + 写入后各列状态分叉）。与 SkillChain 共享同一份
  // 模块级缓存（mandatorySkills.tsx 的 cfgCache），故画布改完 sheet 里那份也是新值。
  const mandatory = useMandatorySkills(root)
  // v6 T8→T9：就绪三灯重拉信号——凭证卡保存/删除成功后 +1(显式动作,不轮询)。
  const [rdNonce, setRdNonce] = useState(0)
  // v11 P4：页签状态（WB_TABS / tab / prevTabRef）随五页签 sheet 一并退役——
  // 画布是唯一主列，没有「切页」这个动作了。
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

  // ── v11 P1：编排画布的就地编辑写回口 ──
  // 画布只回传「被改的字段」（LanePatch），未触碰字段由这里从原 step 保留。
  // （P4：StepEditor 的「全量 WbStepDef 回传」口径随其卸载一并退役，updateStep 已无消费方。）
  // outputs 在画布侧是 string[]（字段名序，因为画布只渲染名字），这里转回 WbFieldRef[]：
  // 已存在的字段**保留原 type**（否则删掉再加会把 file_path/boolean 悄悄降级成 string——
  // StepEditor.tsx:99-101 已登记过这条既有缺陷，这里不复制它），新增字段默认 'string'
  // （与 StepEditor commitAdd 同款缺省，kernel FieldRef 三型里最通用的一档）。
  function editLane(laneId: string, patch: LanePatch): void {
    setDef((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((s) => {
          if (s.id !== laneId) return s
          const next: WbStepDef = { ...s }
          if (patch.label !== undefined) next.label = patch.label
          if (patch.gate !== undefined) next.gate = patch.gate
          if (patch.outputs !== undefined) {
            const byField = new Map(s.outputs.map((o) => [o.field, o]))
            next.outputs = patch.outputs.map((f) => byField.get(f) ?? { field: f, type: 'string' as const })
          }
          return next
        }),
      }
    })
  }

  function replaceStep(updated: WbStepDef): void {
    setDef((prev) => prev === null
      ? prev
      : { ...prev, steps: prev.steps.map((step) => step.id === updated.id ? updated : step) })
  }

  function removeStage(laneId: string): void {
    setDef((prev) => (prev ? removeStageFromDef(prev, laneId) : prev))
    // 选中项跟着走：删掉的正是当前选中阶段时，落到第一个幸存阶段（避免选中一个不存在的 id）。
    setStageId((cur) => {
      if (cur !== laneId) return cur
      const rest = def?.steps.filter((s) => s.id !== laneId) ?? []
      return rest[0]?.id ?? null
    })
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
  // 其它分支 transition（如 review 的 rejected→draft）原样不动。插在末尾时，原末端阶段不再
  // 是终点，必须补一条线性完成边指向新阶段；否则页面能画出多个阶段，却永远无法保存（kernel
  // 只允许最后一个 step 没有 transitions）。非末尾插入若找不到原线性边，则不猜测分支语义。
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
      } else if (prevStep && !nextStep) {
        steppedSteps = steps.map((s, i) =>
          i === insertIndex - 1
            ? { ...s, transitions: [...s.transitions, { event: `${s.id}-complete`, to: id }] }
            : s,
        )
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

  const workflowName = workflowDraftName.trim()
  const workflowNameInvalid = workflowName.length > 0 && !/^[\p{L}\p{N}\p{M}_-]+$/u.test(workflowName)
  const workflowNameDuplicate = workflowName.length > 0 && (workflowName === 'default' || (names ?? []).includes(workflowName))
  const canSubmitWorkflow = workflowName.length > 0 && !workflowNameInvalid && !workflowNameDuplicate && !workflowOpBusy

  function openWorkflowCreate(mode: 'new' | 'copy'): void {
    setMenuOpen(false)
    setWorkflowCreateMode(mode)
    setWorkflowDraftName(mode === 'copy' ? `${wfName ?? 'workflow'}-copy` : '')
    setWorkflowOpErrors([])
  }

  function closeWorkflowCreate(): void {
    if (workflowOpBusy) return
    setWorkflowCreateMode(null)
    setWorkflowDraftName('')
    setWorkflowOpErrors([])
  }

  async function confirmWorkflowCreate(): Promise<void> {
    if (!canSubmitWorkflow || !workflowCreateMode) return
    if (workflowCreateMode === 'copy' && !def) return
    const nextDef = workflowCreateMode === 'copy'
      ? wfName === 'default'
        ? governedWorkflow(workflowName)
        : { ...def!, name: workflowName, steps: def!.steps.map((step) => ({
          ...step,
          skills: step.skills.map((skill) => ({ ...skill, depends_on: skill.depends_on ? [...skill.depends_on] : undefined })),
          inputs: step.inputs.map((field) => ({ ...field })),
          outputs: step.outputs.map((field) => ({ ...field })),
          guards: step.guards.map((guard) => ({ ...guard })),
          transitions: step.transitions.map((transition) => ({ ...transition })),
        })) }
      : governedWorkflow(workflowName)
    setWorkflowOpBusy(true)
    setWorkflowOpErrors([])
    try {
      const res = await postWorkflowDef(workflowName, { root, ...nextDef })
      if (!res.ok) {
        setWorkflowOpErrors(await readSaveErrors(res))
        return
      }
      invalidateWorkflowRules(root, workflowName)
      setNames((prev) => [...new Set([...(prev ?? []), workflowName])].sort())
      setWorkflowCreateMode(null)
      setWorkflowDraftName('')
      // 走现有 load effect 再读磁盘真值；不把刚 POST 的对象伪装成 server 回读结果。
      switchTo(workflowName)
    } catch (err) {
      setWorkflowOpErrors([err instanceof Error ? err.message : t('workbench.network_error')])
    } finally {
      setWorkflowOpBusy(false)
    }
  }

  function openWorkflowDelete(): void {
    if (!wfName || wfName === 'default') return
    setWorkflowDeleteError(null)
    setWorkflowDeleteOpen(true)
  }

  function closeWorkflowDelete(): void {
    if (workflowDeleteBusy) return
    setWorkflowDeleteOpen(false)
    setWorkflowDeleteError(null)
  }

  async function confirmWorkflowDelete(): Promise<void> {
    if (!wfName || wfName === 'default' || workflowDeleteBusy) return
    const deleting = wfName
    setWorkflowDeleteBusy(true)
    setWorkflowDeleteError(null)
    try {
      const res = await deleteWorkflowDef(deleting, root)
      if (!res.ok) {
        let body: {
          error?: string
          code?: string
          references?: Array<{ kind?: string; source?: string }>
          blockers?: Array<{ source?: string; detail?: string }>
        } = {}
        try { body = await res.json() as typeof body } catch { /* no JSON body */ }
        setWorkflowDeleteError({
          message: body.error ?? (body.code === 'WORKFLOW_REFERENCED'
            ? t('workbench.workflow_delete_referenced')
            : t('workbench.workflow_delete_failed', { status: res.status })),
          references: Array.isArray(body.references) ? body.references : [],
          blockers: Array.isArray(body.blockers) ? body.blockers : [],
        })
        return
      }
      invalidateWorkflowRules(root, deleting)
      const remaining = (names ?? []).filter((name) => name !== deleting)
      setNames(remaining)
      setWorkflowDeleteOpen(false)
      setWorkflowDeleteError(null)
      switchTo(remaining[0] ?? 'default')
    } catch (err) {
      setWorkflowDeleteError({
        message: err instanceof Error ? err.message : t('workbench.network_error'),
        references: [],
        blockers: [],
      })
    } finally {
      setWorkflowDeleteBusy(false)
    }
  }

  // ── stepper 入场（沿 motion.ts 既有词汇；reduced-motion 由 revealList 自身处理）──
  // T13 起 def 就是编辑草稿：依赖收敛为 def?.name（只在切换 workflow/首次载入时重播），
  // 依赖整个 def 会让每次击键都重播全排卡入场——装饰性噪音，不是真实状态变化
  //（旧 workflow 列表页 列表入场依赖 Boolean(names) 的同一条既有纪律）。
  // v6 T11：选择器随 StepperRail 重写从卡片 .wb-step 换成流程带段 .wb-flow-seg（testid
  // `wb-step-{id}` 不变，变的只是承载视觉入场动画的 CSS 类）。
  // v8-E：再随阶段卡横排换 .wb8-stage（同一条纪律——入场动画只认视觉承载类，行为契约不动）。
  // v10b 迁移：视觉类退役，GSAP 承载改挂 data-anim="wb-stage"（选择器换 data 属性纪律）。
  useGSAP(() => {
    if (!def || def.steps.length === 0) return
    const el = rootRef.current
    if (!el) return
    const stages = Array.from(el.querySelectorAll<HTMLElement>('[data-anim="wb-stage"]'))
    // v11 编排画布不再渲染旧 StepperRail 动画锚点；空集合是正常态，不能交给 GSAP
    // 当成缺失 target 告警。若兼容视图仍提供锚点，则继续沿用同一入场动效。
    if (stages.length > 0) revealList(stages)
  }, { scope: rootRef, dependencies: [def?.name] })

  // v11 P4：页签墨线与 pane crossfade 的 useGSAP 随五页签退役——它按 [data-testid="wb-tab-*"]
  // 与 [data-testid="wb-pane-*"] 寻址，页签没了就恒 null，留着是永远空转的死补间。

  // T13：脏切换确认 Dialog 入场（共享 <Dialog> 不对外暴露内部节点，scope 选择器文本寻址——
  // 旧画布编辑器 Task 15 返回确认弹窗的同款既有写法）。v10b 迁移：内容节点寻址从 .dialog
  // 类换 [role="dialog"]（Dialog 的 ARIA 契约，比视觉类名稳——shell 迁移改类名也不受影响）。
  useGSAP(() => {
    if (pendingSwitch !== null) {
      revealDialog(
        '[data-testid="wb-switch-confirm"]',
        '[data-testid="wb-switch-confirm"] [role="dialog"]',
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

  // v11 P0：某阶段的「强制常开安全门」数（gate/interactive-skill-gate）——LOCKED_IDS 仍是唯一
  // 真相源，但数量从真实 hookMetas 派生而非写死 2：server 端增删安全门时前端跟着变，
  // 且 hookMetas 未就绪时回落 undefined（与 hookCountOf 同款诚实占位，不谎报数字）。
  const hookLockedOf = useCallback(
    (): number | undefined =>
      hookMetas === null ? undefined : hookMetas.filter((h) => !h.configurable && LOCKED_IDS.has(h.id)).length,
    [hookMetas],
  )

  // v11 P0：编排画布泳道投影。与旧 stepperSteps 的差别只在「零截断硬约束」所需的全量数据——
  // 技能给全名 id 序（不短名化、不计数化），产出给字段名序（不只给 count），由画布完整渲染。
  //
  // 诚实门：default 的 skills 传 undefined 而非空数组——buildDefaultDef() 把 skills 恒置为
  // []，但那只是「workflow 定义里没有」，不是「这个阶段没有强制技能」：default 的真实强制技能
  // 在 manifest 的 phase.track 矩阵（GET /api/config）里。传 [] 会让画布渲染「（空）」= 谎报。
  // 该矩阵连同 track tab 由 P1 接入（spec §5），届时这里改喂真集合。
  const boardLanes: BoardLane[] = useMemo(() => {
    if (!def) return []
    return def.steps.map((s, i) => {
      const next = def.steps[i + 1]
      const fwd = next ? s.transitions.find((tr) => tr.to === next.id) : undefined
      const amb = ambientByStage[s.id]
      return {
        id: s.id,
        name: stepName(s),
        gate: s.gate,
        skills: readonlyWf ? undefined : [...new Set(s.skills.map((sk) => sk.id))],
        // v11 P2：依赖数据面。**只投同列内的依赖**——跨 step 引用是 kernel 的校验期错误
        // （kernel/src/workflow/types.ts:SkillRef），把它画成 chip 等于把一个非法态渲染成
        // 正常态；投影层在此过滤掉，画布只看到合法依赖。
        skillDeps: readonlyWf
          ? undefined
          : Object.fromEntries(
              s.skills.map((sk) => {
                const inLane = new Set(s.skills.map((k) => k.id))
                return [sk.id, (sk.depends_on ?? []).filter((d) => inLane.has(d))]
              }),
            ),
        outputs: s.outputs.map((o) => o.field),
        // v11 P4：nonempty-output guard 的当前态（画布产出区那个开关的 checked 来源）。
        // default 传 undefined → 画布不渲染该开关（其 guards 由 kernel 硬编码，无写端点）。
        nonemptyGuard: readonlyWf ? undefined : s.guards.some((g) => g.type === 'nonempty-output'),
        hooksCount: hookCountOf(s.id),
        hooksLocked: hookLockedOf(),
        linkEvent: fwd?.event ?? null,
        count: amb?.count ?? 0,
        running: amb?.running ?? false,
      }
    })
  }, [def, stepName, hookCountOf, hookLockedOf, ambientByStage, readonlyWf])
  const selectedStep = def?.steps.find((step) => step.id === stageId) ?? null

  // v6 T11：running 脉冲——光泽扫过循环，惯例逐字对齐 ProgressView.tsx 的执行中段光泽实现
  // （matchMedia 全包 + reduce 直达终态 + repeat:-1 循环，见该文件 :399-450）。依赖键=当前
  // running 阶段 id 指纹：running 集合变化（snapshot 新帧/切 workflow）才重建，避免每次渲染
  // 都杀掉重放循环补间；revertOnUpdate 保证依赖变化时上一轮补间必被清理，不留孤儿循环。
  const runningKey = boardLanes.filter((s) => s.running).map((s) => s.id).join(',')
  useGSAP(
    () => {
      const el = rootRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          const reduce = Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)
          // v8-E：承载元素随阶段卡横排从 .wb-flow-gloss 换 .wb8-gloss（testid wb-flow-gloss-* 不变）；
          // v10b 迁移后承载改挂 data-anim="wb-gloss"（选择器换 data 属性纪律）。
          const glosses = Array.from(el.querySelectorAll<HTMLElement>('[data-anim="wb-gloss"]'))
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

  const currentStages = def?.steps.length ?? (wfName ? stagesCountOf(wfName) : null)

  return (
    <section data-testid="workbench-view" data-page-frame="standard" ref={rootRef} className="mx-auto w-full max-w-[1088px] pt-7 pb-5">
      <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="relative">
          <button
            className="group inline-flex min-h-14 min-w-[280px] cursor-pointer items-center gap-3 rounded-xl border border-accent-b bg-accent-t/45 px-3.5 text-left transition hover:border-(--accent) hover:bg-accent-t"
            data-testid="wb-wf-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-(--accent) text-white shadow-sm"><Layers3 className="h-4.5 w-4.5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold tracking-[.08em] text-accent-d uppercase">当前工作流</span>
              <span className="mt-0.5 block truncate text-[17px] font-extrabold tracking-[-0.01em] text-text">{wfName ?? '…'}</span>
            </span>
            {currentStages != null && <span className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-text-2 shadow-sm">{t('workbench.wf_stages', { n: currentStages })}</span>}
            <ChevronDown className="h-4 w-4 flex-none text-text-3 transition-transform group-aria-expanded:rotate-180" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              className="absolute top-[calc(100%+6px)] left-0 z-40 min-w-[238px] rounded-lg border border-border bg-card p-1.5 shadow-md"
              role="menu"
              aria-label={t('workbench.wf_menu_label')}
            >
              {menuNames.map((n) => {
                const cnt = stagesCountOf(n)
                return (
                  <button
                    key={n}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left font-mono text-[13px] text-text-2 transition-colors hover:bg-fill data-on:bg-fill-2 data-on:font-semibold data-on:text-text"
                    role="menuitem"
                    data-on={n === wfName ? '' : undefined}
                    data-testid={`wb-wf-item-${n}`}
                    onClick={() => requestSwitch(n)}
                  >
                    <span>{n}</span>
                    {cnt != null && <span className="ml-auto font-sans text-xs text-text-3">{t('workbench.wf_stages', { n: cnt })}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('workbench.workflow_actions')}>
          <button className={BTN_GHOST} data-testid="wb-workflow-new" onClick={() => openWorkflowCreate('new')}>
            {t('workbench.workflow_new')}
          </button>
          <button
            className={BTN_GHOST}
            data-testid="wb-workflow-copy"
            onClick={() => openWorkflowCreate('copy')}
            disabled={!def}
            title={readonlyWf ? '保留系统默认流程的阶段与 Skill，创建一个可编辑副本' : '基于当前配置创建另一条工作流'}
          >
            {readonlyWf ? '创建可编辑副本' : '另存副本'}
          </button>
          {!readonlyWf && (
            <>
              <button
                className={BTN_DANGER}
                data-testid="wb-workflow-delete"
                onClick={openWorkflowDelete}
                disabled={!wfName}
              >
                {t('workbench.workflow_delete')}
              </button>
            </>
          )}
          <button hidden tabIndex={-1} aria-hidden="true" data-testid="wb-governance-open" onClick={() => setAdvancedOpen(true)} disabled={!def}>运行治理</button>
        </div>
        <span className="flex-1" />
        {/* T13：工具条右侧——default 只读 pill；自定义 workflow 的 未保存 chip / 保存态 / 保存钮。 */}
        {readonlyWf ? (
          <span className={`${PILL} bg-fill-2 text-text-3`} data-testid="wb-ro-pill">{t('workbench.readonly_pill')}</span>
        ) : (
          <>
            {dirty && (
              <span className={`${PILL} border border-dashed border-border-2 bg-fill text-text-2`} data-testid="wb-dirty">
                {t('workbench.dirty_badge')}
              </span>
            )}
            {saveStatus.kind === 'ok' && !dirty && (
              <span className={`${PILL} bg-green-t text-green`} data-testid="wb-save-ok">{t('workbench.save_success')}</span>
            )}
            {saveStatus.kind === 'error' && (
              <span className={`${PILL} bg-red-t text-red`} data-testid="wb-save-error">{t('workbench.save_error_pill')}</span>
            )}
            {/* 非 dirty 保存钮 disabled（上轮 minor 收口项）：没有可保存的东西就不给可点的实底钮。 */}
            <button className={BTN_SOLID} data-testid="wb-save" onClick={save} disabled={!dirty || saving}>
              {t('workbench.save')}
            </button>
          </>
        )}
        {def?.openspecContract === 'required' && (
          <span className={`${PILL} border border-accent-b bg-accent-t text-accent-d`} data-testid="wb-openspec-contract">
            {t('workbench.openspec_contract')}
          </span>
        )}
      </div>

      {/* kernel validate / server 拒绝的错误原文逐条展示（循环依赖、非法字符、未知 to 等）。 */}
      {saveStatus.kind === 'error' && (
        <ul className="mb-3.5 list-none rounded-md border border-red-b bg-red-t px-3 py-2.5" data-testid="wb-save-errors">
          {saveStatus.errors.map((e) => (
            <li key={e} className="font-mono text-[12.5px] leading-[1.6] text-red-d">{e}</li>
          ))}
        </ul>
      )}

      {namesError && <p className={ERR_NOTE}>{namesError}</p>}
      {defError && <p className={ERR_NOTE}>{defError}</p>}

      {def && (
        <>
          <div className="mb-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm" data-testid="wb-track-context">
            <TrackSelector state={mandatory} />
          </div>
          <ExecutionTimelineComposer
            workflowName={def.name}
            lanes={boardLanes}
            selectedId={stageId}
            readonly={readonlyWf}
            hooks={hooksConfig}
            skillRegistry={mandatory.registry}
            selectedSkillZone={readonlyWf && stageId ? <LaneMandatorySkills phase={stageId} state={mandatory} readonly /> : undefined}
            prompt={selectedStep?.prompt ?? ''}
            onSelect={setStageId}
            onSkillMove={readonlyWf ? undefined : (move) => setDef((prev) => (prev ? moveSkillInDef(prev, move) : prev))}
            onSkillRemove={readonlyWf ? undefined : (laneId, skillId) => setDef((prev) => (prev ? removeSkillFromDef(prev, laneId, skillId) : prev))}
            onLaneEdit={readonlyWf ? undefined : editLane}
            onLaneGuard={readonlyWf ? undefined : (laneId, enabled) => setDef((prev) => (prev ? setLaneGuardInDef(prev, laneId, enabled) : prev))}
            onRemoveStage={readonlyWf ? undefined : removeStage}
            onAddStage={readonlyWf ? undefined : () => setAddStageOpen(true)}
            onStageReorder={readonlyWf ? undefined : (fromId, toId, after) => setDef((prev) => (prev ? reorderStagesInDef(prev, fromId, toId, after) : prev))}
            onPromptChange={readonlyWf || !selectedStep ? undefined : (prompt) => {
              if (prompt === '') {
                const { prompt: _prompt, ...withoutPrompt } = selectedStep
                replaceStep(withoutPrompt)
              } else {
                replaceStep({ ...selectedStep, prompt })
              }
            }}
            onOpenSkillEditor={readonlyWf ? undefined : () => setSkillEditorOpen(true)}
          />
        </>
      )}
      {!def && !defError && <p className="p-5 text-[13px] text-text-3">{t('common.loading')}</p>}

      {advancedOpen && (
        <Dialog
          title="运行治理"
          onClose={() => setAdvancedOpen(false)}
          testid="wb-advanced-orchestration"
          panelClassName="w-[min(900px,94vw)]"
          variant="workspace"
          actions={
            <button className={BTN_GHOST} onClick={() => setAdvancedOpen(false)}>关闭</button>
          }
        >
        <aside
          // 运行治理是独立工作区，不再沿用主画布的窄侧栏尺寸。单列内容控制在舒适阅读宽度并
          // 水平居中；此前把单个 WorkbenchSideRail 放进双列 grid，只会制造一个永远为空的
          // 第二列，导致所有治理能力挤在左侧、右半屏完全空白。
          className="mx-auto w-full max-w-[820px]"
          data-testid="wb-side-col"
        >
          {/* ── v11 P4：右栏 = 治理轨（P3 三卡）+「完整治理设置」Dialog（挂 LoopCard 原件）
              +「机器配置」折叠区（AFK/凭证/技能健康），下接既有摘要卡等内容。
              五页签退役后这些能力全部在此可达——合并的是 IA，不是能力。 ── */}
          <WorkbenchSideRail
            root={root}
            loops={loops}
            rdNonce={rdNonce}
            onSecretsChanged={() => setRdNonce((n) => n + 1)}
          >
          <div className={SIDE_CARD}>
            <div className={SIDE_HEAD}><b className={SIDE_HEAD_B}>{t('workbench.summary_title')}</b></div>
            {/* divide-y = 原 .side-card__row + .side-card__row 相邻分隔线的等值搬运 */}
            <div className={`${SIDE_BODY} divide-y divide-border`}>
              <div className={SIDE_ROW}>
                <span className={SIDE_ROW_LABEL}>{t('workbench.sum_stages')}</span>
                <span className={SIDE_ROW_VALUE} data-testid="wb-sum-stages">{summary?.stages ?? '—'}</span>
              </div>
              <div className={SIDE_ROW}>
                <span className={SIDE_ROW_LABEL}>{t('workbench.sum_gates')}</span>
                <span className={SIDE_ROW_VALUE} data-testid="wb-sum-gates">{summary?.gates ?? '—'}</span>
              </div>
              <div className={SIDE_ROW}>
                <span className={SIDE_ROW_LABEL}>{t('workbench.sum_skills')}</span>
                <span className={SIDE_ROW_VALUE} data-testid="wb-sum-skills">{summary?.skills ?? '—'}</span>
              </div>
              {/* T15：钩子行出真数——「全部阶段都启用」的 hook 数（口径见 summary 计算处注释）；
                  /api/hooks 加载中/失败仍回落 '—' 占位，不谎报数字。 */}
              <div className={SIDE_ROW}>
                <span className={SIDE_ROW_LABEL}>{t('workbench.sum_hooks')}</span>
                <span className={SIDE_ROW_VALUE} data-testid="wb-sum-hooks">{summary?.hooks ?? '—'}</span>
              </div>
              {/* T16：「自动运行」行——显示已保存真值（选中 loop 的启停 + 今日轮次/上限），
                  不吃 Loop 卡未保存草稿；加载中/失败回落 '—'、无 loop 显「未配置」。 */}
              <div className={SIDE_ROW}>
                <span className={SIDE_ROW_LABEL}>{t('workbench.lp_sum')}</span>
                <span className={SIDE_ROW_VALUE} data-testid="wb-sum-loop">
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
          <div className={SIDE_CARD} data-testid="wb-side-safegate">
            <div className={SIDE_HEAD}><b className={SIDE_HEAD_B}>{t('workbench.sg_title')}</b></div>
            <div className={SIDE_BODY}>
              <p className={NOTE}>{t('workbench.sg_locked_body')}</p>
              <p className={NOTE}>{t('workbench.sg_pending_body')}</p>
            </div>
          </div>

          {/* v6 T13：最近流转——真实 history 事件回放（GSAP 假预演退役,决议#10/#5:legacy 如实
              标注不可用、archived 不入列;决议#11 量级 <50,逐 change 只读端点合并,不新增聚合端点;
              G22 纪律:无轮询,只随 (root,workflow,changes) 指纹变化拉取）。 */}
          <div className={SIDE_CARD} data-testid="wb-recent">
            <div className={SIDE_HEAD}>
              <b className={SIDE_HEAD_B}>{t('workbench.recent_title')}</b>
              <span className="ml-auto text-xs font-normal text-text-3">{t('workbench.recent_note')}</span>
            </div>
            <div className={SIDE_BODY}>
              {recent === null && <p className={NOTE}>{t('common.loading')}</p>}
              {recent !== null && recent.length === 0 && (
                <p className={NOTE} data-testid="wb-recent-empty">{t('workbench.recent_empty')}</p>
              )}
              {recent !== null && recent.length > 0 && (
                <ul className="flex list-none flex-col gap-[7px]" data-testid="wb-recent-list">
                  {recent.map((e, i) => (
                    <li key={`${e.change}-${e.ts}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs leading-[1.45]">
                      <span className="flex-none text-[10.5px] text-text-3">{e.ts.slice(5, 16).replace('T', ' ')}</span>
                      <span className="flex-none text-[11px] text-text-2">{e.change}</span>
                      <span className="text-text">
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
                <p className={NOTE} data-testid="wb-recent-legacy">{t('workbench.recent_legacy', { n: recentSilent })}</p>
              )}
            </div>
          </div>
          </WorkbenchSideRail>
        </aside>
        </Dialog>
      )}

      {skillEditorOpen && boardLanes.find((lane) => lane.id === stageId) && (
        <SkillOrchestrationDialog
          lane={boardLanes.find((lane) => lane.id === stageId)!}
          registry={mandatory.registry}
          onClose={() => setSkillEditorOpen(false)}
          onAdd={(laneId, skillId) => setDef((prev) => (prev ? addSkillToDef(prev, laneId, skillId) : prev))}
          onRemove={(laneId, skillId) => setDef((prev) => (prev ? removeSkillFromDef(prev, laneId, skillId) : prev))}
          onMove={(move) => setDef((prev) => (prev ? moveSkillInDef(prev, move) : prev))}
          onDependencyChange={(laneId, skillId, dep, prevDep) => setDef((prev) => (prev ? setSkillDepInDef(prev, laneId, skillId, dep, prevDep) : prev))}
        />
      )}

      {/* T13 脏守卫：切 workflow 前的未保存确认（经共享 Dialog——Esc/困笼/焦点归位一并到位）。 */}
      {pendingSwitch !== null && (
        <Dialog
          title={t('workbench.switch_confirm_title')}
          onClose={() => setPendingSwitch(null)}
          testid="wb-switch-confirm"
          actions={
            <>
              <button className={BTN_GHOST} onClick={() => setPendingSwitch(null)}>{t('workbench.switch_cancel')}</button>
              <button className={BTN_DANGER} onClick={confirmSwitch}>{t('workbench.switch_discard')}</button>
            </>
          }
        >
          <p className="mb-4 text-[12.5px] leading-[1.6] text-text-2">{t('workbench.switch_confirm_body', { name: wfName ?? '' })}</p>
        </Dialog>
      )}

      {workflowCreateMode !== null && (
        <Dialog
          title={workflowCreateMode === 'copy' ? t('workbench.workflow_copy_title') : t('workbench.workflow_new_title')}
          onClose={closeWorkflowCreate}
          testid={workflowCreateMode === 'copy' ? 'wb-workflow-copy-dialog' : 'wb-workflow-create-dialog'}
          initialFocusRef={workflowNameRef}
        >
          <form onSubmit={(event) => { event.preventDefault(); void confirmWorkflowCreate() }}>
            <p className="mb-4 text-[12.5px] leading-[1.6] text-text-2">
              {workflowCreateMode === 'copy'
                ? t('workbench.workflow_copy_body', { name: wfName ?? '' })
                : t('workbench.workflow_new_body')}
            </p>
            <div className="flex flex-col gap-[5px] text-[12.5px] font-semibold text-text-2">
              <label htmlFor="wb-workflow-name" data-wb-field-label="">{t('workbench.workflow_name_label')}</label>
              <input
                ref={workflowNameRef}
                id="wb-workflow-name"
                className={FIELD_INPUT}
                value={workflowDraftName}
                aria-invalid={workflowNameInvalid || workflowNameDuplicate}
                onChange={(event) => { setWorkflowDraftName(event.target.value); setWorkflowOpErrors([]) }}
              />
              {workflowNameInvalid && <span className="text-xs text-red">{t('workbench.workflow_name_invalid')}</span>}
              {workflowNameDuplicate && <span className="text-xs text-red">{t('workbench.workflow_name_duplicate')}</span>}
            </div>
            {workflowOpErrors.length > 0 && (
              <ul className="mt-3 rounded-md border border-red-b bg-red-t p-2.5" role="alert">
                {workflowOpErrors.map((error) => <li key={error} className="text-xs text-red-d">{error}</li>)}
              </ul>
            )}
            <div className="mt-[18px] flex justify-end gap-2 border-t border-border pt-3.5">
              <button type="button" className={BTN_GHOST} onClick={closeWorkflowCreate}>{t('workbench.workflow_cancel')}</button>
              <button
                type="submit"
                className={BTN_SOLID}
                data-testid={workflowCreateMode === 'copy' ? 'wb-workflow-copy-confirm' : 'wb-workflow-create-confirm'}
                disabled={!canSubmitWorkflow}
              >
                {workflowOpBusy ? t('workbench.workflow_working') : t('workbench.workflow_confirm')}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {workflowDeleteOpen && wfName && (
        <Dialog
          title={t('workbench.workflow_delete_title', { name: wfName })}
          onClose={closeWorkflowDelete}
          testid="wb-workflow-delete-dialog"
          actions={
            <>
              <button className={BTN_GHOST} onClick={closeWorkflowDelete}>{t('workbench.workflow_cancel')}</button>
              <button className={BTN_DANGER} data-testid="wb-workflow-delete-confirm" onClick={() => void confirmWorkflowDelete()} disabled={workflowDeleteBusy}>
                {workflowDeleteBusy ? t('workbench.workflow_working') : t('workbench.workflow_delete_confirm')}
              </button>
            </>
          }
        >
          <p className="mb-3 text-[12.5px] leading-[1.6] text-text-2">
            {t('workbench.workflow_delete_body', { name: wfName })}
          </p>
          {dirty && <p className="mb-3 rounded-md bg-amber-t p-2.5 text-xs text-amber-d">{t('workbench.workflow_delete_dirty')}</p>}
          {workflowDeleteError && (
            <div className="rounded-md border border-red-b bg-red-t p-3" role="alert" data-testid="wb-workflow-delete-error">
              <p className="text-xs font-bold text-red-d">{workflowDeleteError.message}</p>
              {(workflowDeleteError.references.length > 0 || workflowDeleteError.blockers.length > 0) && (
                <ul className="mt-2 list-disc space-y-1 pl-4 font-mono text-[11.5px] text-red-d">
                  {workflowDeleteError.references.map((reference, index) => (
                    <li key={`reference-${index}`}>{reference.kind ?? 'reference'} · {reference.source ?? '?'}</li>
                  ))}
                  {workflowDeleteError.blockers.map((blocker, index) => (
                    <li key={`blocker-${index}`}>{blocker.source ?? 'scan'} · {blocker.detail ?? '?'}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                「阶段名称」字段同款的显式配对，errors 放 label 之外不影响可访问名）。
                字段标签配色（亮 ink/暗 green 三段式）由 data-wb-field-label 承载，
                规则在 ./workbench.css（dark: 变体覆不住系统跟随分支，见该文件注释）。 */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-[5px] text-[12.5px] font-semibold text-text-2">
                <label
                  className="text-[10.5px] font-bold tracking-[.03em] uppercase"
                  data-wb-field-label=""
                  htmlFor="wb-add-stage-name-input"
                >
                  {t('workbench.add_stage_name_label')}
                </label>
                <input
                  ref={addStageNameRef}
                  id="wb-add-stage-name-input"
                  className={FIELD_INPUT}
                  data-testid="wb-add-stage-name"
                  value={stageDraftName}
                  onChange={(e) => {
                    const v = e.target.value
                    setStageDraftName(v)
                    if (!stageIdTouched) setStageDraftId(slugifyStageName(v))
                  }}
                />
              </div>
              <div className="flex flex-col gap-[5px] text-[12.5px] font-semibold text-text-2">
                <label
                  className="text-[10.5px] font-bold tracking-[.03em] uppercase"
                  data-wb-field-label=""
                  htmlFor="wb-add-stage-id-input"
                >
                  {t('workbench.add_stage_id_label')}
                </label>
                <input
                  id="wb-add-stage-id-input"
                  className={`${FIELD_INPUT} font-mono`}
                  aria-invalid={stageIdError ? true : undefined}
                  data-testid="wb-add-stage-id"
                  value={stageDraftId}
                  onChange={(e) => {
                    setStageDraftId(e.target.value)
                    setStageIdTouched(true)
                  }}
                />
                {stageIdError && (
                  <span className="text-[11px] font-semibold text-red" data-testid="wb-add-stage-id-error">{stageIdError}</span>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={BTN_GHOST} onClick={closeAddStage}>
                {t('workbench.add_stage_cancel')}
              </button>
              <button type="submit" className={BTN_SOLID} data-testid="wb-add-stage-confirm" disabled={!canSubmitStage}>
                {t('workbench.add_stage_confirm')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  )
}
