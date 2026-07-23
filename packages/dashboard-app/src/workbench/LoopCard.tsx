import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, CircleAlert } from 'lucide-react'
import { fetchLoopsSnapshot, postLoopLevel, postLoopUpdate, type WbLoopRow } from '../api/client'
import { useT } from '../i18n'
import { Dialog } from '../shell/Dialog'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * LoopCard（T16，计划 2026-07-11-v5-interaction-rebuild）——「自动运行(Loop)」卡并入编排页。
 * 交互真相源 design-demos/v5-progress-workbench.html #wbLoopCard（滑杆轨道 fill-2/填充 accent/
 * 推荐三角刻度）；决议 #3 裁减口径：健康度环/台账/漂移检测一律不做 UI。
 *
 * 写回交互拍板（任务书「dirty 汇总进保存钮或即时保存，选一致的交互并注释」）：
 *   · 除自主级别外的**全部参数**（含启用开关）走「dirty 汇总 → 卡头保存钮」一次 POST
 *     /api/loops/update——demo 同款（demo 的 lpEnable 开关也只是 markDirty，落盘走 wbSave），
 *     且与 patch 语义天然匹配（一次保存 = 一个精确 patch，不夹带未改字段）；
 *   · 自主级别是唯一例外：它不是 loops.yaml 文本手术的合法字段（update 端点旁路禁区），
 *     必须走 POST /api/loops/level 毕业制裁决——所以点击即发、即时生效；升档先过确认 Dialog
 *     （沿 LoopsPanel Task 13「风险不对称」纪律：升档确认、降档直发），server 拒绝时
 *     plan.reason/blockers 原文展示。
 *
 * 状态托管：快照读取住在 useLoops（WorkbenchView 持有）——右栏摘要「自动运行」行与本卡吃同
 * 一份 rows（useHooksConfig 的同一条「数据住共同祖先」纪律）。草稿（draft）住本卡：row 对象
 * 换新（首载/切 loop/保存后 reload）即以 server 真值重置草稿。摘要行显示已保存真值，不吃草稿。
 *
 * v10b 全量迁移（Phase 2 / W2）：手写全局类（wb-/lp-/loop-reject）退役，样式改 tailwind v4
 * 原子类就地承载——颜色一律 token 语义类或 var(--*)（禁新硬编码色值；派生色沿 color-mix 从
 * 既有 token 计算的决议 #9 口径），状态由 data 属性与 aria 承载（测试不再断言视觉类名）。
 */

/**
 * kernel loops/types.ts::LOOP_RUNNERS 的纯数据镜像（T17 决议#14：runner 下拉双选项）。
 * dashboard 是浏览器 bundle，直接 import @pipeline-lite/kernel 会拉进 node:fs 代码破坏构建
 * （types.ts TRANSITIONS 镜像的同一条纪律）——单源守卫见 LoopCard.test.tsx 的镜像相等断言。
 * 注意 LoopEntry.runner 是自由字符串（历史登记存在 'cron'/'cron-session'）：现值不在清单内时
 * 下拉额外渲染该真值选项，不谎报为双选项之一。
 */
export const LOOP_RUNNERS = ['claude-code', 'codex'] as const

/**
 * v10b 迁移：三张工作台卡（LoopCard/AutomationCard/SecretsCard）共用的卡壳/表单原子类词汇
 * ——旧 .card/.wb-editor-head/.wb-input/.wb-note/.wb-ed-sec/.wb-status/.lp-policy 家族的对位。
 * AutomationCard 已 import LpSlider，同源消费本表；不入 components/ui（那里不许动）。
 */
export const WB_TW = {
  /** 旧 .card + .wb-loop 卡壳——按旧 `.wb8-pane > .card` 剥皮语义收平（Phase 4 视觉验收 #3）：
   *  三卡（Loop/AFK/凭证）只在 sheet pane 内渲染，pane 自带外卡壳与内边距，卡根不再套第二层
   *  border/bg-card/shadow/圆角/外边距（卡内卡）；区块分隔由 WB_TW.sec 的 border-t 承担。 */
  card: '',
  /** 旧 .wb-editor-head + .lp-head 卡头行（row-gap 4px 是 lp-head 覆写）。 */
  head: 'flex flex-wrap items-center gap-x-[9px] gap-y-1',
  headB: 'text-[13px] text-text',
  /** 旧 .lp-head-sub 卡头副题（basis-full 独占一行）。 */
  headSub: 'mt-px basis-full text-xs font-normal text-text-3',
  /** 旧 .wb-input（hover/focus/disabled 三态；focus 环走 --ring-blue token）。 */
  input:
    'h-[34px] w-full rounded-[9px] border border-border bg-card px-[11px] text-[13.5px] text-text transition-[border-color,box-shadow] duration-[120ms] hover:border-border-2 focus:border-(--accent) focus:shadow-[0_0_0_3px_var(--ring-blue)] focus:outline-none disabled:cursor-not-allowed disabled:bg-fill disabled:text-text-3',
  /** 旧 .wb-note。 */
  note: 'text-xs leading-[1.55] text-text-3',
  /** 旧 .wb-flabel（margin 由调用点自补——旧表在不同容器里分别清零/覆写过）。 */
  flabel: 'block text-xs font-semibold text-text-3',
  /** 旧 .wb-ed-sec；相邻分区的顶界/间距用 [data-sec] + & 变体对位旧 `+` 组合子语义。 */
  sec: 'pt-3.5 pb-1 [[data-sec]+&]:mt-3 [[data-sec]+&]:border-t [[data-sec]+&]:border-border',
  /** 旧 .wb-ed-sec-h 与其内 .hint。 */
  secH: 'mb-2.5 flex items-center gap-1.5 text-[13px] font-bold',
  hint: 'text-xs font-normal text-text-3',
  /** 旧 .wb-status--dirty / --ok 状态 pill。 */
  statusDirty:
    'inline-flex items-center gap-1.5 rounded-full border border-dashed border-border-2 bg-fill px-2.5 py-1 text-[11px] font-bold text-text-2',
  statusOk: 'inline-flex items-center gap-1.5 rounded-full bg-green-t px-2.5 py-1 text-[11px] font-bold text-green',
  /** 旧 .wb-save-errors + .lp-errors（li 单列）。 */
  saveErrors: 'mt-3 mb-3.5 list-none rounded-md border border-red-b bg-red-t px-3 py-2.5',
  saveErrorsLi: 'font-mono text-[12.5px] leading-[1.6] text-red-d',
  /** 旧 .lp-policy 弹性参数行（SecretsCard 的 .sc-row 同族）。 */
  policyRow: 'mt-2.5 flex flex-wrap items-center gap-3 border-t border-dashed border-border pt-3',
  /** 旧 .view__note / .view__note--error（错误态另配 data-tone="error"）。 */
  loading: 'p-5 text-[13px] text-text-3',
  loadError: 'p-5 text-[13px] text-red',
  /** shadcn Button 的项目微调：solid 配 <Button size="sm">、ghost 配 <Button variant="ghost" size="sm">。 */
  btnSolid: 'px-4 text-[12.5px] font-bold',
  btnGhost: 'border border-border px-4 text-[12.5px] font-semibold text-text-2 hover:border-text-3 hover:bg-transparent hover:text-text',
  /** shadcn Switch 的项目微调：开=accent 蓝（旧 .switch[aria-checked=true] 口径，非 shadcn 默认绿）。 */
  switch: 'data-[state=checked]:bg-(--accent)',
} as const

/**
 * 工作台各页签共用的「▸ 高级设置」折叠区（IA 精简：每个页签只把高频核心直接展开，次要/
 * 只读诊断/解释性内容一键收进本折叠，默认收起）。shadcn Collapsible（radix，闭合即卸载内容——
 * 恒不撑视觉高度）；触发钮文案随开合切 advanced_show/advanced_hide，▸ 图标随开态旋转 90°。
 * 测试锚点走 testid（各页签唯一：lp-adv/afk-adv/sc-adv/skh-adv/wb-stage-adv）——折叠区内的
 * 既有 testid 全保留，用例需先点 testid 展开再断言（内容闭合态不在 DOM）。
 */
export function WbAdvanced({ testid, children }: { testid: string; children: ReactNode }): JSX.Element {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3.5 border-t border-border pt-2.5">
      <CollapsibleTrigger
        data-testid={testid}
        className="flex w-full cursor-pointer items-center gap-1 rounded-md text-xs font-semibold text-text-3 transition-colors hover:text-text-2"
      >
        <ChevronRight aria-hidden="true" className={cn('size-3.5 flex-none transition-transform duration-150', open && 'rotate-90')} />
        {open ? t('workbench.advanced_hide') : t('workbench.advanced_show')}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** 旧 .loop-reject 错误反馈块（语义=错误，由 data-tone="error" 承载，调用点自补 margin）。 */
const ERR_BLOCK_TW = 'rounded-[7px] bg-red-t px-[11px] py-2 text-[11.5px] font-semibold text-red'
/** 旧 .wb-chip（mono 值 chip）。 */
const CHIP_TW = 'inline-flex h-6 items-center gap-1 rounded-[7px] border border-border bg-fill px-[9px] font-mono text-xs text-text-2'
/** 旧 .badge 底座（--run/--pending/lp-draft-badge 的差异色由调用点条件类补）。 */
const BADGE_TW = 'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold'

// ── 草稿形状：/api/loops/update 可 patch 字段的编辑面（kernel loops/update.ts 全集，
//    autonomy_level 除外——见头注释）──
interface LoopDraft {
  status: string
  goal: string
  design_doc: string
  /** row.change_prefix null ↔ 草稿空串；保存时空串写回 null（kernel checkedValue 允许）。 */
  change_prefix: string
  risk: string
  runner: string
  cadence: string
  max_runs_per_day: number
  max_in_flight: number
  max_tokens_per_day: number | null
  on_exceed: string
  human_gates: string[]
  kill_criteria: string[]
  allowlist: string[]
  denylist: string[]
}

function draftOf(row: WbLoopRow): LoopDraft {
  return {
    status: row.status,
    goal: row.goal,
    design_doc: row.design_doc,
    change_prefix: row.change_prefix ?? '',
    risk: row.risk,
    runner: row.runner,
    cadence: row.cadence,
    max_runs_per_day: row.budget_decl.max_runs_per_day,
    max_in_flight: row.budget_decl.max_in_flight,
    max_tokens_per_day: row.budget_decl.max_tokens_per_day ?? null,
    on_exceed: row.budget_decl.on_exceed,
    human_gates: [...row.human_gates],
    kill_criteria: [...row.kill_criteria],
    allowlist: [...row.allowlist],
    denylist: [...row.denylist],
  }
}

/** 草稿 vs 基线 → 精确 patch（只带被改字段——验收②「不夹带未改字段」）。 */
function computePatch(draft: LoopDraft, base: LoopDraft): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const k of ['status', 'goal', 'design_doc', 'risk', 'runner', 'cadence', 'on_exceed'] as const) {
    if (draft[k] !== base[k]) patch[k] = draft[k]
  }
  if (draft.change_prefix !== base.change_prefix) {
    patch.change_prefix = draft.change_prefix === '' ? null : draft.change_prefix
  }
  for (const k of ['max_runs_per_day', 'max_in_flight'] as const) {
    if (draft[k] !== base[k]) patch[k] = draft[k]
  }
  // token 上限：null=未声明预算——滑杆一经拖动即为数字；「拖回未设置」不存在（demo 同款），
  // 所以 null→null 恒不进 patch，数字变化才进。
  if (draft.max_tokens_per_day !== base.max_tokens_per_day && draft.max_tokens_per_day !== null) {
    patch.max_tokens_per_day = draft.max_tokens_per_day
  }
  for (const k of ['human_gates', 'kill_criteria', 'allowlist', 'denylist'] as const) {
    if (JSON.stringify(draft[k]) !== JSON.stringify(base[k])) patch[k] = draft[k]
  }
  return patch
}

// ── T7（loop 卡审阅面重构）：字段生产者徽章——静态前端硬编码规则,不做「谁实际写了这个值」
//    的运行时追踪(agent 生成协议本轮不落地,见计划范围外登记)。逐字段对齐
//    docs/ux/2026-07-11-config-experience-analysis.md §2.1「应然生产者」列:两值并列时
//    （如「系统推导 + 人确认」）取首个产出实质内容的一方——人确认/人可调是几乎每个字段
//    收尾都有的动作,不单独成类,否则三色徽章会退化成「全员人拍板」。
//    allowlist 不在此表:它是全表唯一「应然生产者=暂不呈现为需决策字段」的例外（零消费、
//    「执行面另落」）,不装成三色徽章之一,渲染时走独立 reserved disclaimer。──
type ProvKind = 'agent' | 'sys' | 'human'

const FIELD_PROV: Record<Exclude<keyof LoopDraft, 'allowlist'>, ProvKind> = {
  status: 'human', // 「人拍板——已是正确交互模型(tap 不是打字)」
  goal: 'agent', // 「agent 生成」
  design_doc: 'agent', // 「agent 生成」
  change_prefix: 'sys', // 「系统推导 + 人确认」——从 id 派生默认建议值
  risk: 'agent', // 「agent 生成」
  runner: 'sys', // 「系统推导 + 人确认」——从既有 runner 真值/历史默认预填；徽章仅显示中性「系统推导」，
  //                当前不与就绪三灯凭证探测联动（P2-F2：readiness 反向建议「只给凭证已配的 runner 推荐标记」
  //                是更大工程，登记为 backlog，见 docs/ux/…-config-experience-analysis.md §2.1 远期项，本轮不接线）
  cadence: 'agent', // 「agent 生成建议 + 人确认」
  max_runs_per_day: 'sys', // 「系统给安全默认 + 人拍板上限」
  max_in_flight: 'sys', // 「系统预填推荐值 + 人可调」
  max_tokens_per_day: 'sys', // 「系统推导 + 人确认」
  on_exceed: 'sys', // 「系统给死默认，不作为决策项呈现」
  human_gates: 'agent', // 「agent 生成候选 + 人勾选」
  kill_criteria: 'sys', // 「系统给候选清单 + 人勾选」
  denylist: 'sys', // 「系统推导候选 + 人勾选/追加」——另加「真硬消费」disclaimer，见 render 处
}

const PROV_LABEL_KEY: Record<ProvKind, string> = {
  agent: 'workbench.lp_prov_agent',
  sys: 'workbench.lp_prov_sys',
  human: 'workbench.lp_prov_human',
}

/** 徽章三色直接指派既有 token（agent=accent 三件套、sys=fill-2 中性、human=ink 深底铭牌）。 */
const PROV_BASE_TW = 'inline-flex h-[18px] flex-none items-center whitespace-nowrap rounded-[6px] px-[7px] text-[10.5px] font-bold'
const PROV_KIND_TW: Record<ProvKind, string> = {
  agent: 'border border-accent-b bg-accent-t text-accent-d',
  sys: 'bg-fill-2 text-text-2',
  human: 'bg-ink text-ink-fg',
}
/** allowlist 专用「运行时硬约束」徽章：H5 已在 L3 写入与合并两道边界真实消费。 */
const PROV_ENFORCED_TW = cn(PROV_BASE_TW, 'border border-green-b bg-green-t text-green-d')

/** 字段生产者徽章（T7）——纯展示，无点击语义；field 取 LoopDraft 键名做 data-testid 锚点。 */
function ProvBadge({ field }: { field: keyof typeof FIELD_PROV }): JSX.Element {
  const { t } = useT()
  const kind = FIELD_PROV[field]
  return (
    <span className={cn(PROV_BASE_TW, PROV_KIND_TW[kind])} data-kind={kind} data-testid={`lp-prov-${field}`}>
      {t(PROV_LABEL_KEY[kind])}
    </span>
  )
}

// ── useLoops：/api/loops/snapshot 的读取与选中态托管（WorkbenchView 调用）──
export interface LoopsState {
  /** 当前 root 的 loop 行；null = 加载中/加载失败（loadError 区分）。 */
  rows: WbLoopRow[] | null
  loadError: string | null
  selected: WbLoopRow | null
  select: (id: string) => void
  reload: () => void
}

export function useLoops(root: string): LoopsState {
  const { t } = useT()
  const [rows, setRows] = useState<WbLoopRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // 换 root：立刻清行——上一项目的 loop 不能在新项目语境下多渲染一拍。
  useEffect(() => {
    setRows(null)
    setSelectedId(null)
    setLoadError(null)
  }, [root])

  useEffect(() => {
    let cancelled = false
    fetchLoopsSnapshot()
      .then((snap) => {
        if (cancelled) return
        const mine = snap.rows.filter((r) => r.root === root)
        setRows(mine)
        setLoadError(null)
        setSelectedId((cur) => (cur !== null && mine.some((r) => r.id === cur) ? cur : mine[0]?.id ?? null))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // 加载失败不挡工作台其余区块：卡内行内报错、摘要行回落 '—'。
        setLoadError(t('workbench.lp_load_error', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
      })
    return () => {
      cancelled = true
    }
  }, [root, tick, t])

  return {
    rows,
    loadError,
    selected: rows?.find((r) => r.id === selectedId) ?? null,
    select: setSelectedId,
    reload: () => setTick((n) => n + 1),
  }
}

// ── 滑杆刻度（demo 口径：推荐值 = 2h / 24 / 1 / 100k / skip）──
/** 节奏离散档（demo CADS 原样）；推荐 2h = 下标 4。 */
const CADS = ['5m', '15m', '30m', '1h', '2h', '6h', '1d'] as const
const RECO_CAD_IDX = 4
const RECO_RUNS = 24
const RECO_INFLIGHT = 1
/** token 滑杆以 k 为单位（10k-500k，步进 10k）；推荐 100k。 */
const RECO_TOKENS_K = 100

function cadenceMinutes(c: string): number {
  const m = c.match(/^(\d+)(m|h|d)$/)
  if (!m) return Number.NaN
  const n = Number(m[1])
  return m[2] === 'm' ? n : m[2] === 'h' ? n * 60 : n * 1440
}

/** 现值 → 离散档位下标：精确命中优先；解析得出分钟数取最近档；解析不了回落推荐档（显示仍是原值）。 */
function cadenceIndex(c: string): number {
  const exact = (CADS as readonly string[]).indexOf(c)
  if (exact !== -1) return exact
  const mins = cadenceMinutes(c)
  if (Number.isNaN(mins)) return RECO_CAD_IDX
  let best = 0
  for (let i = 1; i < CADS.length; i++) {
    if (Math.abs(cadenceMinutes(CADS[i]!) - mins) < Math.abs(cadenceMinutes(CADS[best]!) - mins)) best = i
  }
  return best
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** 推荐三角刻度的水平位置（demo 同款 calc：thumb 半宽 8px 内缩）。 */
function recoLeft(frac: number): string {
  return `calc(8px + (100% - 16px) * ${frac.toFixed(4)})`
}

interface SliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  display: string
  recoLabel: string
  /** 推荐刻度位置：'edge' = 贴左缘（在跑上限的推荐 1 落在最小值）。 */
  recoFrac: number | 'edge'
  onValue: (v: number) => void
  /** T7：字段生产者徽章（可选——仅 Loop 卡的 4 个预算滑杆传入；AutomationCard 不传，不渲染，
   *  零视觉/行为差异，见该组件既有测试回归）。 */
  prov?: JSX.Element
  /** 原生 input[type=range] 的步进粒度（可选，缺省 1）——必须等于受控 value 的真实语义网格，
   *  否则键盘方向键单步会落在网格外的中间值，被上层有损取整吞掉、DOM 弹回原值（键盘死锁 bug，
   *  见 token 预算滑杆调用点）。 */
  step?: number
}

/**
 * 滑杆样式（旧 .lp-range）——保持原生 input[type=range]（测试契约 fireEvent.change/toHaveValue/
 * step 属性 + 原生键盘语义都钉在原生控件上，shadcn/radix Slider 换不动），轨道 fill-2/填充
 * accent 经 --p 渐变、16px 白 thumb、focus 环 --ring-blue——全部 token，无新硬编码色值。
 */
const RANGE_TW = [
  'mt-2 block h-4 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none',
  '[&::-webkit-slider-runnable-track]:h-[5px] [&::-webkit-slider-runnable-track]:rounded-full',
  '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--accent)_var(--p,0%),var(--fill-2)_var(--p,0%))]',
  '[&::-webkit-slider-thumb]:-mt-[5.5px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border-2',
  '[&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:shadow-md',
  '[&:focus-visible::-webkit-slider-thumb]:border-(--accent) [&:focus-visible::-webkit-slider-thumb]:shadow-[0_0_0_3px_var(--ring-blue)]',
  '[&::-moz-range-track]:h-[5px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-fill-2',
  '[&::-moz-range-progress]:h-[5px] [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-(--accent)',
  '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border-2',
  '[&::-moz-range-thumb]:bg-card [&::-moz-range-thumb]:shadow-md',
].join(' ')

/**
 * 单条滑杆（轨道 fill-2 / 填充 accent 经 --p 渐变，推荐 ▽ 刻度）——demo .lp-sld 对位。
 * T21 起导出：「AFK 执行」卡（AutomationCard）复用同一滑杆组件与滑杆样式纪律。
 */
export function LpSlider({ id, label, value, min, max, display, recoLabel, recoFrac, onValue, prov, step }: SliderProps): JSX.Element {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label className={WB_TW.flabel} htmlFor={id}>{label}</label>
        {prov}
        <span className="ml-auto font-mono text-[12.5px] font-bold text-(--accent)" data-testid={`${id}-val`}>{display}</span>
      </div>
      <input
        type="range"
        className={RANGE_TW}
        id={id}
        data-testid={id}
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        aria-label={label}
        style={{ '--p': `${pct}%` } as CSSProperties}
        onChange={(e) => onValue(Number(e.target.value))}
      />
      <div className="relative mt-0.5 h-4" aria-hidden="true">
        <span
          className={cn('absolute top-0 whitespace-nowrap text-[10.5px] text-text-3', recoFrac !== 'edge' && '-translate-x-1/2')}
          style={recoFrac === 'edge' ? { left: '2px' } : { left: recoLeft(recoFrac) }}
        >
          {recoLabel}
        </span>
      </div>
    </div>
  )
}

// ── chips 行（human_gates / kill_criteria / allowlist / denylist 共用）──
/** 终止条件已知 id 的人话副标（demo lp-chip-d）；未知 id 无副标。 */
const KILL_DESC_KEYS: Record<string, string> = {
  'no-change-3': 'workbench.lp_kd_no_change_3',
  'budget-burn-2d': 'workbench.lp_kd_budget_burn_2d',
}

interface ChipRowProps {
  label: string
  values: string[]
  addAria: string
  /** 值 → 人话副标 i18n key（仅终止条件行提供）。 */
  descKeys?: Record<string, string>
  /** T7：字段生产者徽章（可选，渲染在 label 右侧）。 */
  prov?: JSX.Element
  /** T7：消费等级如实说明（可选，渲染在 chips 下方一行——denylist 真硬消费 / allowlist 预留
   *  字段零消费，红线要求逐字段如实标注，不是通用装饰）。 */
  note?: JSX.Element
  onChange: (next: string[]) => void
}

/** 旧 .lp-saferow：150px 标签列 + 弹性内容列；相邻行虚线顶界经 [data-saferow] + & 对位旧 `+` 组合子。 */
const SAFEROW_TW =
  'grid grid-cols-[150px_minmax(0,1fr)] items-start gap-3 py-2.5 last:pb-0.5 max-[720px]:grid-cols-1 max-[720px]:gap-1.5 [[data-saferow]+&]:border-t [[data-saferow]+&]:border-dashed [[data-saferow]+&]:border-border'

function LpChipRow({ label, values, addAria, descKeys, prov, note, onChange }: ChipRowProps): JSX.Element {
  const { t } = useT()
  // 「+ 添加」就地输入态（StepEditor commitAdd 同款：Enter 提交 / Esc 取消 / 失焦有值即提交）。
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function commit(cancel: boolean): void {
    const v = draft.trim()
    if (!cancel && v !== '' && !values.includes(v)) onChange([...values, v])
    setAdding(false)
    setDraft('')
  }

  return (
    <div className={SAFEROW_TW} data-saferow="">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={cn(WB_TW.flabel, 'mt-1')}>{label}</span>
        {prov}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {values.map((v) => (
            <span key={v} className={CHIP_TW}>
              {v}
              {descKeys?.[v] && <span className="font-sans text-[11.5px] text-text-3">{t(descKeys[v]!)}</span>}
              <button
                type="button"
                className="-mr-[3px] inline-grid size-4 cursor-pointer place-items-center rounded-[5px] border-0 bg-transparent p-0 text-[13px] leading-none text-text-3 transition-colors duration-[120ms] hover:bg-red-t hover:text-red-d"
                aria-label={t('workbench.lp_chip_remove', { v })}
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                ×
              </button>
            </span>
          ))}
          {adding ? (
            <input
              className={cn(WB_TW.input, 'h-[26px] w-[180px] font-mono text-xs')}
              aria-label={addAria}
              value={draft}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- 用户刚点了「+ 添加」，焦点进输入框是这次点击的直接延续
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commit(false)
                } else if (e.key === 'Escape') {
                  commit(true)
                }
              }}
              onBlur={() => commit(false)}
            />
          ) : (
            <button
              type="button"
              className="h-6 cursor-pointer rounded-[7px] border border-dashed border-border-2 bg-transparent px-[9px] text-xs font-semibold text-text-3 transition-colors duration-[120ms] hover:bg-fill hover:text-text-2"
              aria-label={addAria}
              onClick={() => setAdding(true)}
            >
              {t('workbench.lp_chip_add')}
            </button>
          )}
        </div>
        {note && <p className={cn(WB_TW.note, 'mt-1.5')}>{note}</p>}
      </div>
    </div>
  )
}

// ── 主卡 ──
const LEVELS = ['L1', 'L2', 'L3'] as const

export interface LoopCardProps {
  root: string
  loops: LoopsState
}

export function LoopCard({ root, loops }: LoopCardProps): JSX.Element {
  const { t } = useT()
  const row = loops.selected
  const [draft, setDraft] = useState<LoopDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[] | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [levelError, setLevelError] = useState<string | null>(null)
  const [levelBusy, setLevelBusy] = useState(false)
  const [confirmLevel, setConfirmLevel] = useState<string | null>(null)
  // ── loop-init L5：草稿审阅动作态（row.draft「agent 草稿·待审阅」标记 → 批准/驳回）。命名刻意
  //    避开既有编辑态 draft(LoopDraft dirty 草稿)——见文件头「命名两义」；这里是审阅动作的
  //    busy/错误态，与上方 saving/saveErrors 语义分离。审阅只发 status 写回，server 含 status 的
  //    写回成功后自动清 draft 标记，前端动作后显式重拉即见徽章消失（不自发清标记）。 ──
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  // T7：空态「去终端」引导的复制按钮反馈 + 三方关系条「匹配 changes」弹层开关（两者都是纯
  // UI 局部态，不入草稿——弹层内容读 row 真值，不随草稿输入重算，见下方渲染处）。
  const [promptCopied, setPromptCopied] = useState(false)
  const [showMatches, setShowMatches] = useState(false)

  // row 对象换新（首载/切 loop/保存后 reload）→ 草稿重置为 server 真值（rows 数组整体替换，
  // find 出的行引用随之变化——不会在编辑中途被无关渲染重置）。
  useEffect(() => {
    setDraft(row ? draftOf(row) : null)
    setSaveErrors(null)
    setLevelError(null)
    setReviewError(null)
  }, [row])

  const base = row ? draftOf(row) : null
  const patch = draft && base ? computePatch(draft, base) : {}
  const dirty = Object.keys(patch).length > 0

  function edit(part: Partial<LoopDraft>): void {
    setDraft((prev) => (prev ? { ...prev, ...part } : prev))
    setSaveOk(false)
  }

  async function save(): Promise<void> {
    if (!row || !dirty || saving) return
    setSaving(true)
    setSaveErrors(null)
    setSaveOk(false)
    try {
      await postLoopUpdate({ root, id: row.id, patch })
      setSaveOk(true)
      loops.reload() // 新行到达后草稿以 server 真值重置（见上方 effect）
    } catch (err) {
      // server 的 error/errors 原文（schema 校验/CAS 拒绝等），不翻译不吞并
      setSaveErrors([(err instanceof Error ? err.message : t('workbench.lp_network_error'))])
    } finally {
      setSaving(false)
    }
  }

  function requestLevel(target: string): void {
    if (!row || levelBusy || target === row.autonomy_level) return
    // 风险不对称（LoopsPanel Task 13 纪律）：升档过确认 Dialog，降档直发。
    if (LEVELS.indexOf(target as typeof LEVELS[number]) > LEVELS.indexOf(row.autonomy_level)) {
      setConfirmLevel(target)
    } else {
      void applyLevel(target)
    }
  }

  async function applyLevel(target: string): Promise<void> {
    if (!row) return
    setLevelBusy(true)
    setLevelError(null)
    try {
      await postLoopLevel({ root, id: row.id, target })
      loops.reload()
    } catch (err) {
      // 升档条件不满足时 server 的 plan.reason/blockers 原文展示（任务书要求）
      setLevelError(t('workbench.lp_level_fail', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
    } finally {
      setLevelBusy(false)
    }
  }

  // ── loop-init L5：草稿审阅动作——批准（status:'active'）/ 驳回（status:'paused'，现场保留）。
  //    复用既有 postLoopUpdate（与保存链路同形 body {root,id,patch}，只带 status 一键）；成功后
  //    显式重拉快照（loops.reload——即时重拉，非 setInterval 轮询，G22 纪律），server 已在含 status
  //    的写回成功后清 draft 标记，重拉即见徽章消失（前端不发清标记请求）。失败复用错误反馈条
  //    （data-tone="error"）呈现 server 原文。 ──
  async function reviewAction(status: 'active' | 'paused'): Promise<void> {
    if (!row || reviewBusy) return
    setReviewBusy(true)
    setReviewError(null)
    try {
      await postLoopUpdate({ root, id: row.id, patch: { status } })
      loops.reload() // 显式重拉：draft 标记已被 server 清，新快照到达即徽章消失
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : t('workbench.lp_network_error'))
    } finally {
      setReviewBusy(false)
    }
  }

  // ── 加载/错误/空态三分支 ──
  if (loops.loadError) {
    return (
      <section className={WB_TW.card} data-testid="wb-loop-card">
        <div className={WB_TW.head}><b className={WB_TW.headB}>{t('workbench.lp_title')}</b></div>
        <p className={WB_TW.loadError} data-tone="error" data-testid="lp-load-error">{loops.loadError}</p>
      </section>
    )
  }
  if (loops.rows === null) {
    return (
      <section className={WB_TW.card} data-testid="wb-loop-card">
        <div className={WB_TW.head}><b className={WB_TW.headB}>{t('workbench.lp_title')}</b></div>
        <p className={WB_TW.loading}>{t('common.loading')}</p>
      </section>
    )
  }
  if (!row || !draft) {
    // T7：无 loop 的 root——空态从「裸 YAML 教学块」换成「去终端」引导（Demo2-A 落地清单第 1 条）：
    // 配置的生产者应是 agent/系统，不是人从空白开始手填 15 个字段；不渲染任何编辑控件，不谎报可配。
    const prompt = t('workbench.lp_empty_prompt')
    return (
      <section className={WB_TW.card} data-testid="wb-loop-card">
        <div className={WB_TW.head}><b className={WB_TW.headB}>{t('workbench.lp_title')}</b></div>
        <div className="pt-2.5 pb-1" data-testid="lp-empty">
          <p className="mb-1 text-[13px] font-bold">{t('workbench.lp_empty_title')}</p>
          <p className={WB_TW.note}>{t('workbench.lp_empty_go')}</p>
          <div className="my-3 rounded-md border border-dashed border-border-2 bg-fill px-3.5 py-3" data-testid="lp-empty-prompt">
            <p className="mb-2.5 text-[12.5px] leading-[1.65] text-text-2">{prompt}</p>
            <Button
              variant="ghost"
              size="sm"
              className={cn(WB_TW.btnGhost, 'h-7 px-3 text-xs')}
              data-testid="lp-empty-copy"
              aria-label={t('workbench.lp_empty_copy_aria')}
              onClick={() => {
                void navigator.clipboard?.writeText(prompt).then(() => setPromptCopied(true))
              }}
            >
              {promptCopied ? t('workbench.lp_empty_copied') : t('workbench.lp_empty_copy')}
            </Button>
          </div>
          <p className={cn(WB_TW.note, 'mt-2')}>{t('workbench.lp_empty_note')}</p>
        </div>
      </section>
    )
  }

  const active = draft.status === 'active'
  // loop-init L5：row.draft =「agent 草稿·待你审阅」标记（≠ 上方编辑态 draft/dirty）——据此渲染
  //   卡头徽章 + 卡尾批准/驳回动作行。L4 保证恒为 boolean（缺标记 fail-open→false）。
  const isPendingReview = row.draft === true
  const tokensK = draft.max_tokens_per_day === null ? RECO_TOKENS_K : clamp(Math.round(draft.max_tokens_per_day / 10000) * 10, 10, 500)

  return (
    <section className={WB_TW.card} data-testid="wb-loop-card">
      <div className={WB_TW.head}>
        <b className={WB_TW.headB}>{t('workbench.lp_title')}</b>
        <Switch
          className={WB_TW.switch}
          checked={active}
          aria-label={t('workbench.lp_enable')}
          data-testid="lp-enable"
          onCheckedChange={() => edit({ status: active ? 'paused' : 'active' })}
        />
        <span
          className={cn(BADGE_TW, active ? 'bg-transparent pl-0 text-green' : 'bg-fill text-text-3')}
          data-state={active ? 'run' : 'paused'}
          data-testid="lp-pill"
        >
          {t(active ? 'workbench.lp_running' : 'workbench.lp_paused')}
        </span>
        <ProvBadge field="status" />
        {/* loop-init L5：草稿待审阅徽章——蓝底 color-mix 从 --accent 派生（决议 #9）；testid 走
            lp-draft-* 审阅语义，与既有编辑态无关。 */}
        {isPendingReview && (
          <span
            className={cn(BADGE_TW, 'bg-[color-mix(in_srgb,var(--accent)_14%,var(--card))] text-accent-d')}
            data-testid="lp-draft-badge"
          >
            {t('workbench.lp_draft_badge')}
          </span>
        )}
        {loops.rows.length > 1 && (
          <select
            className={cn(WB_TW.input, 'h-[26px] w-auto px-2 font-mono text-xs')}
            aria-label={t('workbench.lp_loop_select')}
            data-testid="lp-loop-select"
            value={row.id}
            // 切 loop 会以新行真值重置草稿——dirty 时禁切（轻量守卫，不另起确认弹窗）
            disabled={dirty}
            title={dirty ? t('workbench.lp_select_dirty') : undefined}
            onChange={(e) => loops.select(e.target.value)}
          >
            {loops.rows.map((r) => (
              <option key={r.id} value={r.id}>{r.id}</option>
            ))}
          </select>
        )}
        <span className="flex-1" />
        {dirty && <span className={WB_TW.statusDirty} data-state="dirty" data-testid="lp-dirty">{t('workbench.lp_dirty')}</span>}
        {saveOk && !dirty && <span className={WB_TW.statusOk} data-state="ok" data-testid="lp-save-ok">{t('workbench.lp_save_ok')}</span>}
        <Button size="sm" className={WB_TW.btnSolid} data-testid="lp-save" onClick={() => void save()} disabled={!dirty || saving}>
          {t('workbench.lp_save')}
        </Button>
        <span className={WB_TW.headSub}>{t('workbench.lp_head_sub')}</span>
      </div>

      {saveErrors && (
        <ul className={WB_TW.saveErrors} data-testid="lp-save-errors">
          {saveErrors.map((e) => (
            <li key={e} className={WB_TW.saveErrorsLi}>{e}</li>
          ))}
        </ul>
      )}

      {/* ── T7（A2 决策）：三方关系条——loop 是 root 级配置，不属于任何单个 workflow；
          change_prefix → 实际匹配的 changes（弹层，读 row 真值，不随草稿输入重算——保存前
          修改草稿不影响本条显示，保存并 reload 后才随新真值刷新）；phases → 阶段 chips 纯
          展示无点击语义。决议 #3 裁减口径：这是「数据关系澄清」，不是健康度评分——不画环、
          不给成功率角标。布局沿旧 .lp-policy 的 flex-wrap 分组纪律。 ── */}
      <div className={WB_TW.sec} data-sec="">
        <div className={WB_TW.secH}>
          {t('workbench.lp_rel_sec')}
          <span className={WB_TW.hint}>{t('workbench.lp_rel_sec_hint')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5" data-testid="lp-rel">
          <span
            className="max-w-[280px] overflow-hidden rounded-[7px] bg-fill-2 px-[9px] py-1 font-mono text-xs font-bold text-ellipsis whitespace-nowrap"
            data-testid="lp-rel-root"
            title={row.root}
          >
            {row.root}
          </span>
          <span className="text-[11.5px] text-text-3">{t('workbench.lp_rel_root_note')}</span>
          <span className="text-[13px] text-text-3" aria-hidden="true">➝</span>
          <button
            type="button"
            className="h-[26px] cursor-pointer rounded-full border border-border bg-fill px-2.5 font-mono text-xs text-text-2 transition-colors duration-[120ms] hover:border-(--accent) hover:bg-accent-t hover:text-accent-d"
            data-testid="lp-rel-prefix-btn"
            onClick={() => setShowMatches(true)}
          >
            {t('workbench.lp_rel_match_btn', {
              prefix: row.change_prefix ?? t('workbench.lp_rel_prefix_unset'),
              n: row.matched_changes.length,
            })}
          </button>
          <span className="text-border-2" aria-hidden="true">·</span>
          <span className="text-xs font-semibold text-text-3">{t('workbench.lp_rel_phases_label')}</span>
          {row.phases.length === 0 ? (
            <span className={WB_TW.note}>{t('workbench.lp_rel_phases_empty')}</span>
          ) : (
            row.phases.map((p) => (
              <span key={p} className={CHIP_TW} data-testid="lp-rel-phase-chip">{p}</span>
            ))
          )}
          <p className={cn(WB_TW.note, 'mt-1 basis-full')}>{t('workbench.lp_rel_note')}</p>
        </div>
      </div>

      {showMatches && (
        <Dialog
          title={t('workbench.lp_rel_dialog_title', { prefix: row.change_prefix ?? t('workbench.lp_rel_prefix_unset') })}
          onClose={() => setShowMatches(false)}
          testid="lp-rel-dialog"
          actions={
            <Button variant="ghost" size="sm" className={WB_TW.btnGhost} onClick={() => setShowMatches(false)}>
              {t('workbench.lp_rel_dialog_close')}
            </Button>
          }
        >
          {row.matched_changes.length === 0 ? (
            <p className="mb-4 text-[12.5px] leading-[1.6] text-text-2">{t('workbench.lp_rel_dialog_empty')}</p>
          ) : (
            <ul className="flex max-h-80 list-none flex-col gap-1.5 overflow-y-auto p-0 text-[12.5px]" data-testid="lp-rel-dialog-list">
              {row.matched_changes.map((c) => (
                <li key={c} className="font-mono">{c}</li>
              ))}
            </ul>
          )}
        </Dialog>
      )}

      {/* ── 目标 ── */}
      <div className={WB_TW.sec} data-sec="">
        <div className={WB_TW.secH}>
          {t('workbench.lp_sec_goal')}
          <span className={WB_TW.hint}>{t('workbench.lp_sec_goal_hint')}</span>
        </div>
        <div className="mb-[5px] flex items-center gap-2">
          <label className={WB_TW.flabel} htmlFor="lp-goal">{t('workbench.lp_goal')}</label>
          <ProvBadge field="goal" />
        </div>
        <input
          className={WB_TW.input}
          id="lp-goal"
          data-testid="lp-goal"
          value={draft.goal}
          onChange={(e) => edit({ goal: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault() // Enter 守卫：保存只走卡头保存钮
          }}
        />
        <div className="mt-3 grid grid-cols-3 gap-3.5 max-[720px]:grid-cols-1">
          <div>
            <div className="mb-[5px] flex items-center gap-2">
              <label className={WB_TW.flabel} htmlFor="lp-doc">{t('workbench.lp_doc')}</label>
              <ProvBadge field="design_doc" />
            </div>
            <input
              className={cn(WB_TW.input, 'font-mono')}
              id="lp-doc"
              data-testid="lp-doc"
              value={draft.design_doc}
              onChange={(e) => edit({ design_doc: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
          </div>
          <div>
            <div className="mb-[5px] flex items-center gap-2">
              <label className={WB_TW.flabel} htmlFor="lp-prefix">{t('workbench.lp_prefix')}</label>
              <ProvBadge field="change_prefix" />
            </div>
            <input
              className={cn(WB_TW.input, 'font-mono')}
              id="lp-prefix"
              data-testid="lp-prefix"
              value={draft.change_prefix}
              onChange={(e) => edit({ change_prefix: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
            <p className="mt-[5px] text-[11.5px] text-text-3">
              {t('workbench.lp_prefix_eg')}
              <b className="font-mono font-semibold text-text-2" data-testid="lp-prefix-eg">{`${draft.change_prefix}0142-migrate-card`}</b>
            </p>
          </div>
          <div>
            <div className="mb-[5px] flex items-center gap-2">
              <label className={WB_TW.flabel} htmlFor="lp-risk">{t('workbench.lp_risk')}</label>
              <ProvBadge field="risk" />
            </div>
            <select className={WB_TW.input} id="lp-risk" data-testid="lp-risk" value={draft.risk} onChange={(e) => edit({ risk: e.target.value })}>
              <option value="low">{t('workbench.lp_risk_low')}</option>
              <option value="medium">{t('workbench.lp_risk_medium')}</option>
              <option value="high">{t('workbench.lp_risk_high')}</option>
            </select>
          </div>
          {/* T17 决议#14：runner 下拉（LOOP_RUNNERS 双选项）——数据面 T20 已交付
              （PATCHABLE_SCALAR_FIELDS 含 runner），写回走同一 dirty→保存钮 patch 链路。
              runner id 是代码标识符（mono 呈现，不翻译）；历史自由字符串真值补渲染为第三选项。 */}
          <div>
            <div className="mb-[5px] flex items-center gap-2">
              <label className={WB_TW.flabel} htmlFor="lp-runner">{t('workbench.lp_runner')}</label>
              <ProvBadge field="runner" />
            </div>
            <select
              className={cn(WB_TW.input, 'font-mono')}
              id="lp-runner"
              data-testid="lp-runner"
              value={draft.runner}
              onChange={(e) => edit({ runner: e.target.value })}
            >
              {!(LOOP_RUNNERS as readonly string[]).includes(draft.runner) && (
                <option value={draft.runner}>{draft.runner}</option>
              )}
              {LOOP_RUNNERS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {/* 观察项②（决议#14① backlog）：非标准 runner 值软校验警告——纯提示，不拦截保存/
                不改值/不清第三选项。文案按 runnerFor.ts 真实归属语义（仅 'codex' 起 codex exec，
                其余一律走 claude-code 缺省路径）：它仍会执行，不谎称「不会执行」。警示色
                color-mix 从既有 --red/--text-2 派生（决议#9，禁新原色）。 */}
            {!(LOOP_RUNNERS as readonly string[]).includes(draft.runner) && (
              <p className="mt-[5px] text-xs leading-[1.55] text-[color-mix(in_srgb,var(--red)_68%,var(--text-2))]" data-testid="lp-runner-warn">
                ⚠ {t('workbench.lp_runner_warn', { runner: draft.runner })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* IA 精简：节奏与预算 + 自主与安全（4 滑杆/超限策略/3 自主级别/4 组安全 chips）是低频细则，
          整体收进「▸ 高级设置」默认折叠——核心第一屏只留 启停/关系/目标。折叠区内 testid 全保留。 */}
      <WbAdvanced testid="lp-adv">
      {/* ── 节奏与预算（四滑杆 + 超限策略 pill）── */}
      <div className={WB_TW.sec} data-sec="">
        <div className={WB_TW.secH}>
          {t('workbench.lp_sec_budget')}
          <span className={WB_TW.hint}>{t('workbench.lp_sec_budget_hint')}</span>
        </div>
        <div className="grid grid-cols-2 items-start gap-x-7 gap-y-2 max-[720px]:grid-cols-1">
          <LpSlider
            id="lp-sld-cadence"
            label={t('workbench.lp_sld_cadence')}
            prov={<ProvBadge field="cadence" />}
            value={cadenceIndex(draft.cadence)}
            min={0}
            max={CADS.length - 1}
            display={draft.cadence}
            recoLabel={t('workbench.lp_reco', { v: CADS[RECO_CAD_IDX]! })}
            recoFrac={RECO_CAD_IDX / (CADS.length - 1)}
            onValue={(v) => edit({ cadence: CADS[v]! })}
          />
          <LpSlider
            id="lp-sld-runs"
            label={t('workbench.lp_sld_runs')}
            prov={<ProvBadge field="max_runs_per_day" />}
            value={clamp(draft.max_runs_per_day, 1, 100)}
            min={1}
            max={100}
            display={t('workbench.lp_val_runs', { n: draft.max_runs_per_day })}
            recoLabel={t('workbench.lp_reco', { v: RECO_RUNS })}
            recoFrac={(RECO_RUNS - 1) / 99}
            onValue={(v) => edit({ max_runs_per_day: v })}
          />
          <div>
            <LpSlider
              id="lp-sld-inflight"
              label={t('workbench.lp_sld_inflight')}
              prov={<ProvBadge field="max_in_flight" />}
              value={clamp(draft.max_in_flight, 1, 4)}
              min={1}
              max={4}
              display={t('workbench.lp_val_inflight', { n: draft.max_in_flight })}
              recoLabel={t('workbench.lp_reco', { v: RECO_INFLIGHT })}
              recoFrac="edge"
              onValue={(v) => edit({ max_in_flight: v })}
            />
            {/* 验收反馈②-④：讲清楚这个上限只管本 loop 的自动化通道，且是软上限 */}
            <p className={cn(WB_TW.note, 'mt-1')}>{t('workbench.lp_sld_inflight_note')}</p>
          </div>
          <LpSlider
            id="lp-sld-tokens"
            label={t('workbench.lp_sld_tokens')}
            prov={<ProvBadge field="max_tokens_per_day" />}
            value={tokensK}
            min={10}
            max={500}
            step={10}
            display={draft.max_tokens_per_day === null ? t('workbench.lp_tokens_unset') : `${Math.round(draft.max_tokens_per_day / 1000)}k`}
            recoLabel={t('workbench.lp_reco', { v: `${RECO_TOKENS_K}k` })}
            recoFrac={(RECO_TOKENS_K - 10) / 490}
            onValue={(v) => edit({ max_tokens_per_day: v * 1000 })}
          />
        </div>
        <div className={WB_TW.policyRow}>
          <span className={WB_TW.flabel}>{t('workbench.lp_policy')}</span>
          <ProvBadge field="on_exceed" />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('workbench.lp_policy')}>
            {(['skip', 'pause'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={cn(
                  'h-7 cursor-pointer rounded-full border px-3 text-[12.5px] font-semibold transition-[border-color,background-color,color,box-shadow] duration-[120ms]',
                  draft.on_exceed === p
                    ? 'border-(--accent) bg-accent-t text-accent-d shadow-[0_0_0_3px_var(--ring-blue)]'
                    : 'border-border bg-fill text-text-2 hover:border-border-2',
                )}
                role="radio"
                aria-checked={draft.on_exceed === p}
                data-testid={`lp-exceed-${p}`}
                onClick={() => edit({ on_exceed: p })}
              >
                {t(p === 'skip' ? 'workbench.lp_policy_skip' : 'workbench.lp_policy_pause')}
              </button>
            ))}
          </div>
          <span className={WB_TW.note}>{t('workbench.lp_policy_note')}</span>
        </div>
      </div>

      {/* ── 自主与安全 ── */}
      <div className={WB_TW.sec} data-sec="">
        <div className={WB_TW.secH}>
          {t('workbench.lp_sec_auto')}
          <span className={WB_TW.hint}>{t('workbench.lp_sec_auto_hint')}</span>
        </div>
        <span className={cn(WB_TW.flabel, 'mb-[5px]')}>{t('workbench.lp_level')}</span>
        <div className="mt-0.5 mb-1 grid grid-cols-3 gap-2.5 max-[720px]:grid-cols-1" role="radiogroup" aria-label={t('workbench.lp_level')}>
          {LEVELS.map((lv) => {
            const on = row.autonomy_level === lv
            return (
              <button
                key={lv}
                type="button"
                className={cn(
                  'flex cursor-pointer flex-col gap-0.5 rounded-[11px] border px-3 pt-[11px] pb-3 text-left transition-[border-color,background-color,box-shadow] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60',
                  on ? 'border-(--accent) bg-accent-t shadow-[0_0_0_3px_var(--ring-blue)]' : 'border-border bg-fill hover:border-border-2',
                )}
                role="radio"
                aria-checked={on}
                data-testid={`lp-lv-${lv}`}
                disabled={levelBusy}
                onClick={() => requestLevel(lv)}
              >
                <span className={cn('text-[13px] font-[750]', on && 'text-accent-d')}>{t(`workbench.lp_lv${lv.slice(1)}_k`)}</span>
                <span className="text-[11.5px] leading-[1.45] text-text-3">{t(`workbench.lp_lv${lv.slice(1)}_d`)}</span>
              </button>
            )
          })}
        </div>
        {levelError && <p className={cn(ERR_BLOCK_TW, 'mt-2')} data-tone="error" data-testid="lp-level-error"><CircleAlert className="mr-1 inline size-3.5" aria-hidden="true" />{levelError}</p>}

        <LpChipRow
          label={t('workbench.lp_gates')}
          values={draft.human_gates}
          addAria={t('workbench.lp_add_gate_aria')}
          prov={<ProvBadge field="human_gates" />}
          onChange={(next) => edit({ human_gates: next })}
        />
        <LpChipRow
          label={t('workbench.lp_kill')}
          values={draft.kill_criteria}
          addAria={t('workbench.lp_add_kill_aria')}
          descKeys={KILL_DESC_KEYS}
          prov={<ProvBadge field="kill_criteria" />}
          onChange={(next) => edit({ kill_criteria: next })}
        />
        {/* H5 真相源：allowlist 同时约束 L3 写入面与自动合并面。空 allowlist = 零路径获准，
            不能继续展示 H5 之前的「预留字段/零消费」文案。 */}
        <LpChipRow
          label={t('workbench.lp_allow')}
          values={draft.allowlist}
          addAria={t('workbench.lp_add_allow_aria')}
          prov={
            <span className={PROV_ENFORCED_TW} data-kind="enforced" data-testid="lp-prov-allowlist">
              {t('workbench.lp_prov_reserved')}
            </span>
          }
          note={
            <>
              <b>{t('workbench.lp_allow_note_lead')}</b>
              {t('workbench.lp_allow_note_body')}
            </>
          }
          onChange={(next) => edit({ allowlist: next })}
        />
        {/* denylist 同样是真硬消费，但语义相反：它拒绝命中的黑名单路径；allowlist 拒绝
            白名单之外的路径。两者都不是仅存储的声明字段。 */}
        <LpChipRow
          label={t('workbench.lp_deny')}
          values={draft.denylist}
          addAria={t('workbench.lp_add_deny_aria')}
          prov={<ProvBadge field="denylist" />}
          note={
            <>
              <b>{t('workbench.lp_deny_note_lead')}</b>
              {t('workbench.lp_deny_note_body')}
            </>
          }
          onChange={(next) => edit({ denylist: next })}
        />
      </div>
      </WbAdvanced>

      {/* ── loop-init L5：草稿审阅动作行（卡尾）——row.draft 为真时渲染。批准=status:'active' /
          驳回=status:'paused'（转暂停，现场保留），复用 /api/loops/update；busy 期间双钮 disabled
          （对齐 levelBusy 先例，防双发）；失败走错误反馈条（data-tone="error"）。✓/✕ 图标同
          lp-runner-warn 的 ⚠ 先例置于 JSX，文案入 i18n 与 demo 逐字对齐。双钮绿/红底 color-mix
          从 --green/--red 派生（决议 #9）。这是审阅面动作，不是四动作模型第五种（决议 #13 边界，
          T7 已登记）。 ── */}
      {isPendingReview && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-border pt-3.5" data-testid="lp-draft-actions">
          <Button
            size="sm"
            className="border border-[color-mix(in_srgb,var(--green)_32%,var(--border))] bg-[color-mix(in_srgb,var(--green)_13%,var(--card))] px-4 text-[12.5px] font-bold text-green-d hover:border-green hover:bg-[color-mix(in_srgb,var(--green)_20%,var(--card))]"
            data-testid="lp-draft-approve"
            disabled={reviewBusy}
            onClick={() => void reviewAction('active')}
          >
            ✓ {t('workbench.lp_draft_approve')}
          </Button>
          <Button
            size="sm"
            className="border border-[color-mix(in_srgb,var(--red)_30%,var(--border))] bg-[color-mix(in_srgb,var(--red)_12%,var(--card))] px-4 text-[12.5px] font-bold text-red-d hover:border-red hover:bg-[color-mix(in_srgb,var(--red)_18%,var(--card))]"
            data-testid="lp-draft-reject"
            disabled={reviewBusy}
            onClick={() => void reviewAction('paused')}
          >
            ✕ {t('workbench.lp_draft_reject')}
          </Button>
          {reviewError && (
            <p className={cn(ERR_BLOCK_TW, 'mt-0.5 basis-full')} data-tone="error" data-testid="lp-draft-error"><CircleAlert className="mr-1 inline size-3.5" aria-hidden="true" />{reviewError}</p>
          )}
        </div>
      )}

      {/* 升档确认（沿 LoopsPanel 既有升档 Dialog 的文案键——同一决策同一话术） */}
      {confirmLevel !== null && (
        <Dialog
          title={t('loops.promote_confirm_title', { level: confirmLevel })}
          onClose={() => setConfirmLevel(null)}
          testid="lp-promote-confirm"
          actions={
            <>
              <Button variant="ghost" size="sm" className={WB_TW.btnGhost} data-testid="lp-promote-cancel" onClick={() => setConfirmLevel(null)}>
                {t('loops.promote_confirm_no')}
              </Button>
              <Button
                size="sm"
                className={WB_TW.btnSolid}
                data-testid="lp-promote-submit"
                onClick={() => {
                  // 乐观关闭再真 POST（LoopsPanel confirmPromoteNow 的既有先例）
                  const target = confirmLevel
                  setConfirmLevel(null)
                  void applyLevel(target)
                }}
              >
                {t('loops.promote_confirm_yes')}
              </Button>
            </>
          }
        >
          <p className="mb-4 text-[12.5px] leading-[1.6] text-text-2">
            {t('loops.promote_confirm_desc', {
              band: row.readiness.band,
              budget: row.budget.hasBudget
                ? t('loops.budget_summary', { spent: row.budget.spentToday, max: row.budget.maxTokensPerDay ?? 0, remaining: row.budget.remaining ?? 0 })
                : t('loops.no_budget'),
              level: confirmLevel,
            })}
          </p>
        </Dialog>
      )}
    </section>
  )
}
