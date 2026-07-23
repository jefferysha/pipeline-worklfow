import { useEffect, useRef, useState } from 'react'
import { postLoopLevel, postLoopUpdate, type WbLoopRow } from '../api/client'
import { useT } from '../i18n'
import { Dialog } from '../shell/Dialog'
import { LpSlider, WB_TW, type LoopsState } from './LoopCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChartNoAxesColumn, CircleAlert, Pencil } from 'lucide-react'

/**
 * GovernanceRail（P3 任务 B）——编排画布右侧常驻的「治理轨 · Loop」三件套。
 * 视觉真相源 design-demos/v11b-prod-lanes.html 的 `.rail`（三张 .gcard：自治级 / 就绪分 /
 * 熔断·token 预算）；真假边界真相源 design-demos/v11-workbench-orchestration-spec.md §1.1
 * 能力矩阵的 Loop 四行。数据面复用 LoopCard 的 useLoops/LoopsState（宿主 WorkbenchView 持有
 * 同一份 rows——「数据住共同祖先」纪律），本组件不自拉快照。
 *
 * ── 与 LoopCard 的分工（P3 阶段两者并存，LoopCard P4 才退役）──
 * LoopCard = sheet 里的**全量表单**（15 个字段的完整编辑面，含 goal/kill_criteria/human_gates…）；
 * 本轨 = 画布上的**治理摘要 + 三个高频治理动作**。本文件**只 import** LoopCard 的既有导出
 * （LoopsState/LpSlider/WB_TW），不改它一行。
 *
 * ── 诚实门（本组件最容易做错的三处，逐条钉死）──
 * ① **就绪分是 📊 只读派生**：8 维加权纯函数，阈值 70/90 与权重硬编码在 kernel/src/loops/drift.ts，
 *    **无任何写端点**。所以本卡**零可写控件**——定稿 demo 里那 4 个「勾底层字段抬分」的 checkbox
 *    （`.drivers` / `toggleDriver`）是**演示用的假控件**（demo 的 readiness() 是 `sc=32` 起步的
 *    捏造算式，不是后端那个 8 维函数），**刻意不复刻**。真实的抬分路径是改 goal/kill_criteria/
 *    预算——那些字段的编辑面在 LoopCard 的完整表单里，本卡只附一句说明指路。
 * ② **熔断态 ok/warn/tripped 是 📊 只读派生**：纯按当日 token 花费算（80% warn 线硬编码，
 *    kernel budget.ts/enforce.ts），**无 arm/trip/reset 端点**。所以只画只读态灯，**绝不做
 *    arm/reset 按钮**。可写的只有 token 预算**阈值**（POST /api/loops/update）。
 * ③ **自治级晋升门以 server 为准**：真正的裁决是 kernel graduation.ts::decideGraduation，它吃
 *    readiness/drift/breaker/failStreak/**runs** 五路输入。/api/loops/snapshot 现在透出同一份
 *    graduation verdict，本卡在点击前完整展示输入与 blockers；旧 server 缺该字段时才回落到
 *    readiness 单向必要条件提示。因此本卡：
 *      · **不 disable 任何级别按钮**（disable = 前端替 server 下判决 = 假装权威）；升档过确认
 *        Dialog、降档直发（见下「风险不对称」），确认后就真发，server 拒绝时把 plan.reason/
 *        blockers **原文**摆出来（wb-gov-level-error）。
 *      · 预判提示**只做单向**，且这个单向是**逻辑上站得住**的：仅当「就绪分已知 && 低于该级门槛」
 *        时才提示会被拒——graduation.ts 里 `score < minScore` 是**无条件** push blocker，而
 *        `canGraduate` 要求 blockers 为空，故**单条已知不满足的必要条件即可确证被拒**，措辞不必
 *        含糊（写成「可能/预计」反而是把确定的事说软了）。**永不**反向断言「可以升」——那要求
 *        五路 blocker 全不存在，而 drift/连败/runs 三路我根本没有，说「可以升」就是谎报。
 *        注意这**不是**把判决权拿回前端：按钮照样能点、照样真发，server 的裁决照样原文展示。
 *
 * ── 风险不对称：升档过确认、降档直发（LoopsPanel Task 13 / LoopCard 既有纪律）──
 * 升档 → 确认 Dialog；降档 → 直发无摩擦（降档是**降低**风险，不该加摩擦）。
 * 这条**不能**因为「server 有晋升门兜底」而省掉——恰恰相反：**server 的门只拦不够格的**，
 * 就绪分一旦够了，在治理轨上误点一下就直接进 **L3 无人值守**，此时 server 不会拦，「兜底」
 * 在这个场景根本不成立；且同一动作在 sheet 的 LoopCard 里要确认、在本轨不用 =
 * inconsistent vocabulary（product register 明禁），用户会以为两处是不同的东西。
 * 文案复用 LoopsPanel/LoopCard 既有 `loops.promote_*` 键——同一决策同一话术，零新增键。
 *
 * ── 其余口径 ──
 * · 无 loop → 空态照 LoopCard 既有 lp-empty 的「去终端生成」引导（复用其 i18n 键，不自造文案；
 *   窄轨里省去 prompt 示例块与复制钮——那是 sheet 里教学位的活）。
 * · 数据未就绪（score/spent 非有限数）→ 回落 '—'，**不谎报数字**、不拿 0 冒充。
 * · 阈值/门槛常量走 kernel 纯数据镜像（dashboard 是浏览器 bundle，直接 import
 *   @pipeline-lite/kernel 会拉进 node:fs 破坏构建——同 LoopCard::LOOP_RUNNERS 的既有纪律）；
 *   镜像导出供测试做跨边界单源相等断言。
 * · 样式：tailwind v4 原子类 + token 语义类（无 dark:/无裸 shadow/无 side-stripe 彩色边框）；
 *   状态走 data-* 属性与 aria；名称零截断（无 truncate/ellipsis）；base ≥14px、徽章 ≥11.5px。
 */

// ── kernel 常量的纯数据镜像（单源守卫见 GovernanceRail.test.tsx 的跨边界相等断言）──
/** kernel loops/drift.ts::READY_THRESHOLD 镜像——≥70 mostly-ready；升 L2 的就绪门槛。 */
export const READY_THRESHOLD = 70
/** kernel loops/drift.ts::READY_STRONG 镜像——≥90 ready；升 L3 的就绪门槛。 */
export const READY_STRONG = 90
/** kernel loops/graduation.ts::MIN_L2_RUNS_FOR_L3 镜像——升 L3 另需 ≥5 轮 L2 运行（**前端无此数据，只用于文案**）。 */
export const MIN_L2_RUNS_FOR_L3 = 5
/** kernel loops/enforce.ts::BUDGET_WARN_RATIO 镜像——0.8 减速线（熔断 warn 态的硬编码比例）。 */
export const BUDGET_WARN_RATIO = 0.8

const LEVELS = ['L1', 'L2', 'L3'] as const
type Level = (typeof LEVELS)[number]

/**
 * 升到该级所需的最低就绪分（graduation.ts 的 `minScore = current==='L1' ? READY_THRESHOLD : READY_STRONG`
 * 按**目标级**改写的等价表达：升 L2 需 ≥70、升 L3 需 ≥90）。L1 是最低档，无就绪门。
 * 注意这**只是晋升门的其中一路条件**——drift/breaker/failStreak/runs 四路前端拿不到，见文件头诚实门③。
 */
const LEVEL_MIN_SCORE: Record<Level, number> = { L1: 0, L2: READY_THRESHOLD, L3: READY_STRONG }

const LEVEL_SHORT_KEY: Record<Level, string> = {
  L1: 'workbench.gov_lv1_s',
  L2: 'workbench.gov_lv2_s',
  L3: 'workbench.gov_lv3_s',
}

// ── token 预算滑杆网格：与 LoopCard 的 lp-sld-tokens 逐参数同口径（10k-500k / 步进 10k / 推荐 100k）
//    ——同一个字段在两处 UI 必须是同一张网格，否则两卡互相「取整弹回」。 ──
const TOKENS_K_MIN = 10
const TOKENS_K_MAX = 500
const TOKENS_K_STEP = 10
const RECO_TOKENS_K = 100

/**
 * 滑杆停拖 → 落盘的去抖窗口（ms）。原生 range 在拖拽中会连发 change，逐拍直发
 * POST /api/loops/update 等于对 loops.yaml 连做几十次「文本手术 + 整文档 schema 重校验 + CAS」
 * ——既打 server 也会让 CAS 互相打架。故：值即时回显（不卡手），落盘等停手。
 * 测试侧注意：断言 POST body 需 `await waitFor(...)`（默认 1000ms 窗口 > 350ms，足够）。
 */
const BUDGET_COMMIT_MS = 350

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** 有限数才算「数据就绪」；否则回落 '—'（不拿 0 冒充——0 分与「没数据」是两回事）。 */
const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** token 计数 → 「{n}k」（demo 同款单位）；非有限数 → '—'。 */
function fmtK(v: unknown): string {
  const n = finiteOrNull(v)
  return n === null ? '—' : `${Math.round(n / 1000)}k`
}

/** row 的 token 上限 → 滑杆 k 档位（LoopCard tokensK 同式）；未声明预算 → 停在推荐位（显示仍是「未设置」）。 */
function tokensKOf(row: WbLoopRow): number {
  const max = row.budget_decl?.max_tokens_per_day
  return max === null || max === undefined ? RECO_TOKENS_K : clamp(Math.round(max / 10000) * 10, TOKENS_K_MIN, TOKENS_K_MAX)
}

// ── 视觉底座（demo .rail/.gcard/.gh/.minibadge 对位，全 token 语义类）──
const RAIL_TW = 'flex w-full flex-col gap-3.5'
/** demo .gcard：card 底 + border + 14px 圆角 + shadow-sm（卡片级阴影，非裸 shadow）。 */
const GCARD_TW = 'rounded-[14px] border border-border bg-card px-4 py-[15px] shadow-sm'
/** demo .gcard .gh：卡头（标题 + 能力徽章分列两端）。 */
const GH_TW = 'mb-[11px] flex items-center justify-between gap-2'
const GH_B_TW = 'text-[14.5px] font-[750] text-text'
/** demo .minibadge（11.5px = 徽章字号下限）。 */
const MINIBADGE_TW = 'inline-block rounded-full border px-2 py-0.5 text-[11.5px] font-extrabold whitespace-nowrap'
/** demo .tag.rw（🟢 可写）/ .tag.derived（📊 只读派生）。 */
const TAG_RW_TW = 'border-green-b bg-green-t text-green-d'
const TAG_DERIVED_TW = 'border-accent-b bg-accent-t text-accent-d'
/** demo .gradnote：卡内解释行（12px < base 14px 的下限？——note 是解释性副文，沿 WB_TW.note 的既有 12px 口径）。 */
const GNOTE_TW = 'mt-2.5 text-xs leading-[1.55] text-text-3'
/** demo .gradnote.block：⛔ 拦截/失败块（语义=错误，由 data-tone="error" 承载）。 */
const GNOTE_ERR_TW = 'mt-2.5 rounded-[9px] border border-red-b bg-red-t px-2.5 py-2 text-xs leading-[1.55] font-semibold text-red-d'
/** 单向预判提示（见文件头诚实门③）：amber 语义 = 「事前提醒」，区别于 server 原文判决的 red。 */
const GNOTE_HINT_TW = 'mt-2.5 rounded-[9px] border border-amb-b bg-amb-t px-2.5 py-2 text-xs leading-[1.55] font-semibold text-amb-d'

/** demo .band.ready/.mostly/.notready —— server 的 ReadinessBand 枚举 → 档位 chip 配色。 */
const BAND_TW: Record<string, string> = {
  ready: 'bg-green-t text-green-d',
  'mostly-ready': 'bg-amb-t text-amb-d',
  'not-ready': 'bg-red-t text-red-d',
}
const BAND_KEY: Record<string, string> = {
  ready: 'workbench.gov_band_ready',
  'mostly-ready': 'workbench.gov_band_mostly',
  'not-ready': 'workbench.gov_band_not',
}
/** demo rdBar 填充色随档位（ready 绿 / mostly amber / not-ready 红）。demo 的 #d4a017 裸色改走 --amb-d token。 */
const BAR_TW: Record<string, string> = {
  ready: 'bg-green',
  'mostly-ready': 'bg-amb-d',
  'not-ready': 'bg-red',
}
/** demo .lamp.ok/.warn/.tripped —— 熔断态只读态灯（无 arm/reset，见诚实门②）。 */
const LAMP_TW: Record<string, string> = {
  ok: 'bg-green',
  warn: 'bg-amb-d',
  tripped: 'bg-red',
}

export interface GovernanceRailProps {
  root: string
  /** 从 './LoopCard' import 的既有 useLoops 返回类型——宿主已持有，本组件不重复拉快照。 */
  loops: LoopsState
}

/** 轨头（三分支：加载/空态/正常都挂它，位置恒定不跳）。 */
function RailHead(): JSX.Element {
  const { t } = useT()
  return (
    <div className="mx-0.5 mt-0.5 flex items-center gap-2.5">
      <span className="grid size-[23px] flex-none place-items-center rounded-[7px] bg-ink font-mono text-[12.5px] font-extrabold text-ink-fg" aria-hidden="true">
        L
      </span>
      <b className="text-[15.5px] font-[750] text-text">{t('workbench.gov_title')}</b>
      <span className="ml-auto font-mono text-[11.5px] text-text-3">{t('workbench.gov_per_root')}</span>
    </div>
  )
}

export function GovernanceRail({ root, loops }: GovernanceRailProps): JSX.Element {
  const { t } = useT()
  const row = loops.selected

  const [levelBusy, setLevelBusy] = useState(false)
  const [levelError, setLevelError] = useState<string | null>(null)
  /** 待确认的升档目标（null = 无弹窗）——只有升档会落到这里，降档直发。 */
  const [confirmLevel, setConfirmLevel] = useState<Level | null>(null)
  /** token 上限草稿（k 单位）；null = 未拖动，跟随 server 真值。 */
  const [tokK, setTokK] = useState<number | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // row 换新（首载/切 loop/写回后 reload）→ 丢弃草稿与上一轮错误，以 server 真值为准。
  // 待确认的升档也一并撤掉：那个弹窗是针对**旧行**问的话（「就绪分带 X、预算 Y，确认升 L3？」），
  // 换行后它的前提已经不成立，留着就会拿旧事实骗用户点确认。
  useEffect(() => {
    setTokK(null)
    setLevelError(null)
    setBudgetError(null)
    setConfirmLevel(null)
  }, [row])

  // 卸载/换行时清掉在飞的去抖计时器（否则 unmount 后仍会发一发 POST）。
  useEffect(
    () => () => {
      if (commitTimer.current !== null) clearTimeout(commitTimer.current)
    },
    [row],
  )

  /**
   * 级别按钮的入口：**风险不对称**分流（见文件头）——升档先出确认 Dialog，降档直发。
   * 注意这里**不做任何门控判定**：够不够格是 server 的活（诚实门③），本函数只区分「升 vs 降」。
   */
  function requestLevel(target: Level): void {
    if (!row || levelBusy || target === row.autonomy_level) return
    if (LEVELS.indexOf(target) > LEVELS.indexOf(row.autonomy_level)) {
      setConfirmLevel(target)
    } else {
      void applyLevel(target)
    }
  }

  async function applyLevel(target: Level): Promise<void> {
    if (!row || levelBusy || target === row.autonomy_level) return
    setLevelBusy(true)
    setLevelError(null)
    try {
      await postLoopLevel({ root, id: row.id, target })
      loops.reload()
    } catch (err) {
      // server 的 plan.reason / blockers 原文——不翻译、不改写、不吞并（诚实门③：它才是权威）。
      setLevelError(t('workbench.lp_level_fail', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
    } finally {
      setLevelBusy(false)
    }
  }

  async function commitTokens(k: number): Promise<void> {
    if (!row) return
    const next = k * 1000
    // 与 server 真值相同 → 不发（LoopCard computePatch「不夹带未改字段」的同一条纪律）。
    if (next === (row.budget_decl?.max_tokens_per_day ?? null)) return
    setBudgetError(null)
    try {
      await postLoopUpdate({ root, id: row.id, patch: { max_tokens_per_day: next } })
      loops.reload()
    } catch (err) {
      // 写回失败必须现形：否则用户以为阈值改了、其实没落盘（静默吞错 = 谎报已保存）。
      setBudgetError(t('workbench.gov_budget_fail', { msg: err instanceof Error ? err.message : t('workbench.lp_network_error') }))
    }
  }

  function onTokens(v: number): void {
    setTokK(v) // 即时回显
    if (commitTimer.current !== null) clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => void commitTokens(v), BUDGET_COMMIT_MS) // 停手落盘
  }

  // ── 加载 / 错误 / 空态三分支（轨头恒在）──
  if (loops.loadError) {
    return (
      <aside className={RAIL_TW} data-testid="wb-gov-rail">
        <RailHead />
        <div className={GCARD_TW}>
          <p className={WB_TW.loadError} data-tone="error" data-testid="wb-gov-load-error">
            {loops.loadError}
          </p>
        </div>
      </aside>
    )
  }
  if (loops.rows === null) {
    return (
      <aside className={RAIL_TW} data-testid="wb-gov-rail">
        <RailHead />
        <div className={GCARD_TW}>
          <p className={WB_TW.loading}>{t('common.loading')}</p>
        </div>
      </aside>
    )
  }
  if (!row) {
    // 空态照 LoopCard 既有 lp-empty 的「去终端生成」口径（复用其 i18n 键，不自造文案）：
    // 配置的生产者是 agent/系统，不是人从空白手填——不渲染任何编辑控件，不谎报可配。
    return (
      <aside className={RAIL_TW} data-testid="wb-gov-rail">
        <RailHead />
        <div className={GCARD_TW} data-testid="wb-gov-empty">
          <p className="mb-1 text-[14px] font-bold text-text">{t('workbench.lp_empty_title')}</p>
          <p className={WB_TW.note}>{t('workbench.lp_empty_go')}</p>
        </div>
      </aside>
    )
  }

  const curIdx = LEVELS.indexOf(row.autonomy_level)
  const score = finiteOrNull(row.readiness?.score)
  const band = typeof row.readiness?.band === 'string' && row.readiness.band !== '' ? row.readiness.band : null
  const breaker = typeof row.budget?.breaker === 'string' ? row.budget.breaker : null
  // 已知档位 → 人话；server 给了没见过的档位 → 原样透传（不装作认识）；没数据 → '—'。
  // 档位 chip 与升档确认 Dialog 共用同一条本地化路径——同一事实在两处必须是同一句话。
  const bandText = band === null ? '—' : BAND_KEY[band] ? t(BAND_KEY[band]) : band

  // 单向预判（诚实门③）：只在「就绪分已知 && 低于下一档门槛」时提示会被拒；条件满足时**不说任何话**
  //   ——drift/连败/runs 三路输入前端没有，说「可以升」就是谎报。
  const nextLv = curIdx >= 0 && curIdx < LEVELS.length - 1 ? LEVELS[curIdx + 1]! : null
  const nextNeed = nextLv === null ? 0 : LEVEL_MIN_SCORE[nextLv]
  const predictBlocked = nextLv !== null && score !== null && score < nextNeed

  const rowUnset = row.budget_decl?.max_tokens_per_day === null || row.budget_decl?.max_tokens_per_day === undefined
  const effTokK = tokK ?? tokensKOf(row)
  const tokDisplay = tokK === null && rowUnset ? t('workbench.lp_tokens_unset') : `${effTokK}k`
  const ledger = row.ledger
  // 账本存在时，它才是结算真相源：actual + estimated 都已消耗预算；legacy budget.spentToday
  // 只作旧 server 的兼容回退，不能继续遮住估扣或被新快照覆盖成较小的数字。
  const authoritativeSpent = ledger
    ? finiteOrNull(ledger.settled_tokens_actual) !== null && finiteOrNull(ledger.settled_tokens_estimated) !== null
      ? ledger.settled_tokens_actual + ledger.settled_tokens_estimated
      : null
    : row.budget?.spentToday
  const ledgerHealth = ledger?.health ?? 'missing'
  const ledgerEnforced = ledger?.admission_enforced === true && ledger?.inflight_enforced === true
  const graduation = row.graduation ?? null

  return (
    <aside className={RAIL_TW} data-testid="wb-gov-rail">
      <RailHead />

      {/* ── ① 自治级 L1/L2/L3 —— 🟢 POST /api/loops/level（逐级晋升门，裁决权在 server）── */}
      <section className={GCARD_TW} data-testid="wb-gov-level">
        <div className={GH_TW}>
          <b className={GH_B_TW}>{t('workbench.gov_level_title')}</b>
          <span className={cn(MINIBADGE_TW, TAG_RW_TW, 'inline-flex items-center gap-1')}><Pencil className="size-3" aria-hidden="true" />{t('workbench.gov_tag_rw')}</span>
        </div>
        <div className="flex gap-[7px]" role="radiogroup" aria-label={t('workbench.lp_level')}>
          {LEVELS.map((lv) => {
            const on = row.autonomy_level === lv
            return (
              <button
                key={lv}
                type="button"
                className={cn(
                  'flex-1 cursor-pointer rounded-[10px] border px-1.5 py-2 text-center transition-[border-color,background-color] duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60',
                  on ? 'border-green bg-green-t' : 'border-border-2 bg-fill hover:border-text-3',
                )}
                role="radio"
                aria-checked={on}
                data-testid={`wb-gov-lv-${lv}`}
                // 恒不因「预判会被拒」而 disable——那是 server 的判决权（诚实门③）。只在写回在途时禁双发。
                disabled={levelBusy}
                onClick={() => requestLevel(lv)}
              >
                <b className={cn('block font-mono text-base font-extrabold', on ? 'text-green-d' : 'text-text-2')}>{lv}</b>
                <small className="mt-0.5 block text-[11.5px] whitespace-nowrap text-text-3">{t(LEVEL_SHORT_KEY[lv])}</small>
              </button>
            )
          })}
        </div>
        <p className={GNOTE_TW} data-testid="wb-gov-grad-note">
          {t('workbench.gov_grad_note', { t1: READY_THRESHOLD, t2: READY_STRONG, runs: MIN_L2_RUNS_FOR_L3 })}
        </p>
        {graduation !== null && (
          <div
            className={cn('mt-2.5 rounded-[10px] border px-3 py-2.5 text-xs', graduation.canGraduate ? 'border-green-b bg-green-t' : 'border-amb-b bg-amb-t')}
            data-can-graduate={String(graduation.canGraduate)}
            data-testid="wb-gov-graduation"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-text">{graduation.canGraduate ? t('workbench.gov_preflight_ready') : t('workbench.gov_preflight_blocked')}</b>
              <span className="font-mono text-text-2">{graduation.current} → {graduation.recommended}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-text-2">runs {graduation.runs} · drift {graduation.driftCount} · fail_streak {graduation.failStreak} · breaker {graduation.breaker}</p>
            {graduation.blockers.length > 0 && (
              <ul className="mt-2 space-y-1 pl-4 text-text-2">
                {graduation.blockers.map((blocker) => <li key={blocker} className="list-disc">{blocker}</li>)}
              </ul>
            )}
            {graduation.demotionSignals.length > 0 && <p className="mt-2 text-red-d">{t('workbench.gov_preflight_demote')}: {graduation.demotionSignals.join('；')}</p>}
          </div>
        )}
        {graduation === null && predictBlocked && nextLv !== null && score !== null && (
          <p className={GNOTE_HINT_TW} data-tone="hint" data-testid="wb-gov-level-hint">
            {t('workbench.gov_level_hint', { score, need: nextNeed, target: nextLv })}
          </p>
        )}
        {levelError !== null && (
          <p className={GNOTE_ERR_TW} data-tone="error" data-testid="wb-gov-level-error">
            <CircleAlert className="mr-1 inline size-3.5" aria-hidden="true" />{levelError}
          </p>
        )}
      </section>

      {/* ── ② 就绪分 —— 📊 只读派生（零可写控件；demo 的 .drivers checkbox 是假控件，见诚实门①）── */}
      <section className={GCARD_TW} data-testid="wb-gov-readiness">
        <div className={GH_TW}>
          <b className={GH_B_TW}>{t('workbench.gov_readiness_title')}</b>
          <span className={cn(MINIBADGE_TW, TAG_DERIVED_TW, 'inline-flex items-center gap-1')}><ChartNoAxesColumn className="size-3" aria-hidden="true" />{t('workbench.gov_tag_derived')}</span>
        </div>
        <div className="flex items-baseline gap-2.5">
          <b className="font-mono text-[32px] leading-none font-extrabold text-text" data-testid="wb-gov-readiness-score">
            {score === null ? '—' : score}
          </b>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[13px] font-extrabold whitespace-nowrap',
              band !== null && BAND_TW[band] ? BAND_TW[band] : 'bg-fill-2 text-text-3',
            )}
            data-band={band ?? 'unknown'}
            data-testid="wb-gov-readiness-band"
          >
            {bandText}
          </span>
        </div>
        <div className="mt-2.5 h-2.5 overflow-hidden rounded-md bg-fill-2" aria-hidden="true">
          <div
            className={cn('h-full rounded-md transition-[width] duration-500 motion-reduce:transition-none', band !== null && BAR_TW[band] ? BAR_TW[band] : 'bg-border-2')}
            style={{ width: `${clamp(score ?? 0, 0, 100)}%` }}
          />
        </div>
        <p className={GNOTE_TW}>{t('workbench.gov_readiness_note', { t1: READY_THRESHOLD, t2: READY_STRONG })}</p>
      </section>

      {/* ── ③ 熔断 · token 预算 —— 阈值 🟢 可写；熔断态 📊 只读派生（无 arm/reset，见诚实门②）── */}
      <section className={GCARD_TW} data-testid="wb-gov-budget">
        <div className={GH_TW}>
          <b className={GH_B_TW}>{t('workbench.gov_budget_title')}</b>
          <span className={cn(MINIBADGE_TW, TAG_RW_TW, 'inline-flex items-center gap-1')}><Pencil className="size-3" aria-hidden="true" />{t('workbench.gov_tag_budget_rw')}</span>
        </div>
        {/* LpSlider 是 LoopCard 的既有导出（原生 input[type=range] + 推荐 ▽ 刻度）——同一控件同一网格。 */}
        <LpSlider
          id="wb-gov-budget-slider"
          label={t('workbench.lp_sld_tokens')}
          value={effTokK}
          min={TOKENS_K_MIN}
          max={TOKENS_K_MAX}
          step={TOKENS_K_STEP}
          display={tokDisplay}
          recoLabel={t('workbench.lp_reco', { v: `${RECO_TOKENS_K}k` })}
          recoFrac={(RECO_TOKENS_K - TOKENS_K_MIN) / (TOKENS_K_MAX - TOKENS_K_MIN)}
          onValue={onTokens}
        />
        {budgetError !== null && (
          <p className={GNOTE_ERR_TW} data-tone="error" data-testid="wb-gov-budget-error">
            <CircleAlert className="mr-1 inline size-3.5" aria-hidden="true" />{budgetError}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2.5 rounded-[10px] bg-fill px-3 py-2.5" data-testid="wb-gov-breaker" data-breaker={breaker ?? 'unknown'}>
          <span
            className={cn('size-[11px] flex-none rounded-full', breaker !== null && LAMP_TW[breaker] ? LAMP_TW[breaker] : 'bg-border-2')}
            aria-hidden="true"
          />
          <span className="text-[13px] text-text-2">
            {t('workbench.gov_breaker_label')}{' '}
            {/* 态名是 server 枚举标识符（ok/warn/tripped），mono 原样呈现不翻译——同 runner id 的既有口径 */}
            <b className="font-mono tracking-[0.04em] uppercase" data-testid="wb-gov-breaker-state">
              {breaker ?? '—'}
            </b>
          </span>
          <span className={cn(MINIBADGE_TW, TAG_DERIVED_TW, 'ml-auto inline-flex items-center gap-1')}><ChartNoAxesColumn className="size-3" aria-hidden="true" />{t('workbench.gov_tag_derived_short')}</span>
        </div>
        <p className={cn(GNOTE_TW, 'mt-2')} data-testid="wb-gov-spent">
          {t('workbench.gov_spent', { spent: fmtK(authoritativeSpent), warn: Math.round(BUDGET_WARN_RATIO * 100) })}
        </p>
      </section>

      {/* ── ④ durable ledger + starter wiring —— 生产运行真相，不从预算摘要或 loops.yaml 猜。── */}
      <section className={GCARD_TW} data-health={ledgerHealth} data-testid="wb-gov-ledger">
        <div className={GH_TW}>
          <b className={GH_B_TW}>{t('workbench.gov_facts_title')}</b>
          <span className={cn(MINIBADGE_TW, TAG_DERIVED_TW)}>{t('workbench.gov_facts_tag')}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[12px] leading-[1.45] text-text-2">
          <div className="rounded-[9px] bg-fill px-2.5 py-2">
            <span className="block text-[11px] font-semibold text-text-3">{t('workbench.gov_ledger_health')}</span>
            <b className="mt-0.5 block text-[13px] text-text">
              {ledgerHealth === 'ok'
                ? t('workbench.gov_ledger_health_ok')
                : ledgerHealth === 'degraded'
                  ? t('workbench.gov_ledger_health_degraded')
                  : t('workbench.gov_ledger_health_missing')}
            </b>
          </div>
          <div className="rounded-[9px] bg-fill px-2.5 py-2" data-testid="wb-gov-ledger-inflight">
            <span className="block text-[11px] font-semibold text-text-3">{t('workbench.gov_ledger_inflight')}</span>
            <b className="mt-0.5 block font-mono text-[13px] text-text">
              {ledger ? `${ledger.activated_in_flight} / ${ledger.in_flight}` : '—'}
            </b>
          </div>
        </div>

        <div className="mt-2 space-y-1.5 rounded-[10px] border border-border bg-fill/45 px-3 py-2.5 text-[12px] leading-[1.5] text-text-2">
          <p data-testid="wb-gov-ledger-usage">
            {t('workbench.gov_ledger_usage', {
              actual: fmtK(ledger?.settled_tokens_actual),
              estimated: fmtK(ledger?.settled_tokens_estimated),
            })}
          </p>
          <p data-testid="wb-gov-ledger-reserved">
            {t('workbench.gov_ledger_reserved', { tokens: fmtK(ledger?.reserved_tokens) })}
          </p>
          <p data-testid="wb-gov-ledger-last">
            {t('workbench.gov_ledger_last', { result: ledger?.last_result ?? '—' })}
          </p>
          <p className={ledgerEnforced ? 'text-green-d' : 'text-amb-d'} data-testid="wb-gov-ledger-enforcement">
            {ledgerEnforced ? t('workbench.gov_ledger_enforced') : t('workbench.gov_ledger_unconfirmed')}
          </p>
          {ledger?.health === 'degraded' && (
            <p className="font-semibold text-red-d">
              {t('workbench.gov_ledger_bad', { n: ledger.rejected_records })}
            </p>
          )}
        </div>

        <div className="mt-3 border-t border-border pt-3" data-testid="wb-gov-wiring">
          <p className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-text-3 uppercase">
            {t('workbench.gov_wiring_title')}
          </p>
          <div className="flex flex-wrap gap-1.5 font-mono text-[11.5px]">
            <span className="rounded-md bg-fill-2 px-2 py-1 text-text-2">
              {t('workbench.gov_wiring_template', {
                template: row.template_id ? `${row.template_id}${row.template_version ? `@v${row.template_version}` : ''}` : '—',
              })}
            </span>
            <span className="rounded-md bg-fill-2 px-2 py-1 text-text-2">
              {t('workbench.gov_wiring_workflow', { workflow: row.workflow_id ?? '—' })}
            </span>
            <span className={cn('rounded-md px-2 py-1', row.skill_bundle_id ? 'bg-green-t text-green-d' : 'bg-amb-t text-amb-d')}>
              {t('workbench.gov_wiring_bundle', {
                bundle: row.skill_bundle_id ?? t('workbench.gov_wiring_unwired'),
              })}
            </span>
          </div>
        </div>
      </section>

      {/* ── 升档确认（风险不对称，见文件头）——文案全复用 LoopsPanel/LoopCard 既有 loops.promote_* 键：
          同一决策同一话术，零新增键。降档不经过这里（直发）。 ── */}
      {confirmLevel !== null && (
        <Dialog
          title={t('loops.promote_confirm_title', { level: confirmLevel })}
          onClose={() => setConfirmLevel(null)}
          testid="wb-gov-promote-confirm"
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                className={WB_TW.btnGhost}
                data-testid="wb-gov-promote-cancel"
                onClick={() => setConfirmLevel(null)}
              >
                {t('loops.promote_confirm_no')}
              </Button>
              <Button
                size="sm"
                className={WB_TW.btnSolid}
                data-testid="wb-gov-promote-ok"
                onClick={() => {
                  // 乐观关闭再真 POST（LoopCard confirmPromoteNow 的既有先例）
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
              // 就绪档位走与 chip 同一条本地化路径；数据未就绪时是 '—'，不谎报
              band: bandText,
              budget: row.budget?.hasBudget
                ? t('loops.budget_summary', {
                    spent: row.budget.spentToday,
                    max: row.budget.maxTokensPerDay ?? 0,
                    remaining: row.budget.remaining ?? 0,
                  })
                : t('loops.no_budget'),
              level: confirmLevel,
            })}
          </p>
        </Dialog>
      )}
    </aside>
  )
}
