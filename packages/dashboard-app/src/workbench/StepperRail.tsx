import { Fragment, useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Icon } from '../shared/Icon'
import './workbench.css'

/**
 * StepperRail（v6 计划 T11：docs/superpowers/plans/2026-07-11-v6-recommended-implementation.md
 * §T11——不要与本文件此前 v5 交互重建 T12 头注释、或 translations.ts 里孤立出现的
 * 旧「T11/T13」编号混淆，那些是上一轮计划的编号，与本轮 v6 计划的 13 任务编号是两套体系）：
 * 工作台「流程带」——阶段横排从卡片+箭头连接件，重写为连续的鱼鳞状 chevron 段，再随 v8-E
 * 重写为阶段卡横排。方案 A「流程即真相」交互真相源 design-demos/v6-workbench-flow.html
 * `data-scheme="A"`（`renderBand`/`stageVMs`）。
 *
 * 相对旧版新增三件事（据点 stageVMs 的现实 ambient 化）：
 *   · 真实计数气泡：该阶段当前有多少个真实 change 停留于此（WorkbenchView 的 stageCounts 纯函数
 *     按 root+workflow 对 /api/snapshot 分桶投影而来，本组件零业务判断，只认 count 数字）；
 *   · running 脉冲：该阶段存在 automation==='running' 的 change 时显示光泽扫过（GSAP 挂在
 *     WorkbenchView 侧，本组件只负责在 running=true 时渲染承载元素 `[data-anim="wb-gloss"]`）；
 *   · 门徽章 popover：gate 阶段的徽章升级成可 hover/点击的触发器，展开显示拦截该阶段的 hook
 *     （gate.sh + interactive-skill-gate.sh 对任意复核门恒强制常开，决议 #2）——本棒用静态
 *     hook 元数据（`gateHooks` prop，WorkbenchView 用 HookTimeline.tsx 的 LOCKED_IDS + 既有
 *     i18n hk_name_/hk_desc_ 系列键拼出，不依赖 /api/hooks 是否已加载完成）；T12 起若要按阶段展示
 *     真实启停态，只需换 WorkbenchView 侧的取数逻辑，本组件 props 形状不用再动（留 slot）。
 *
 * 纯展示组件：不吃原始 WorkflowDef，只吃 WorkbenchView 投影好的 StepperStep 视图模型——
 * 名称回退（label→i18n phases→id）、技能去重、forward 边解析、真实计数/running 折叠都在
 * 投影层做完，本组件零业务判断。popover 展开/收起是纯 UI 交互态，留在本组件内部。
 *
 * 决议 #1 红线：无画布库——转换事件名连接件用普通文本 chip，不引入任何 SVG DAG/graph 渲染库。
 *
 * 阶段带展示契约：阶段卡横排。卡=序号圆(绿 tint mono)+阶段名 mono+
 * 技能 chips+◇/⚙/▤ 微元信息+复核门红徽章；
 * 选中卡=绿 ring+tint 底（aria-current=step 承载选中态）。段间连接件=CSS
 * repeating-linear-gradient 流动虚线+clip-path 箭头（motion-safe: 变体在 reduced-motion 下停
 * 动画，keyframes 见 ./workbench.css）；demo 语义：gated 连接件跟在门阶段**之后**（复核门拦的
 * 是「离开该阶段」的推进边），红虚线+菱形门节点。连接件仍按「边存在才画」诚实原则（linkEvent
 * null 不画，末尾不画）。行为契约零变化：testid（wb-step-/wb-flow-count-/wb-flow-gate-/
 * wb-flow-gatepop-/wb-flow-gloss-）、onSelect/aria-current/popover/添加阶段 全部保留。
 *
 * v10b 全量迁移（2026-07-14）：手写全局 CSS 类（wb8-/wb-）→ tailwind v4 原子类。状态由
 * aria-current/data-* 承载；GSAP 承载元素改挂 data-anim（wb-stage/wb-gloss）；颜色只走
 * token 语义类（bg-card/text-text-3/绿红 family），零硬编码色值；布局与行为不变。
 */
export interface StepperStep {
  id: string
  /** 展示名（label 优先，default 阶段走 i18n phases.*，兜底 id）——投影层已算好。 */
  name: string
  gate: 'review' | 'confirm' | null
  /** 去重后的技能 id 序（chips 只展示前 2 个短名 + 截断计数）。 */
  skills: string[]
  outputsCount: number
  /**
   * 该阶段的启用 hook 数（/api/hooks 矩阵按阶段算——各卡数字可以不同）；
   * undefined = 数据面未就绪/加载失败，隐藏该段（诚实占位，不谎报数字）。
   */
  hooksCount?: number
  /** 与下一张卡之间的转换事件名；无 forward 边 = null，不画连接件（诚实：边不存在就不画箭头）。 */
  linkEvent: string | null
  /** v6 T11：该阶段真实 change 计数（stageCounts 投影，snapshot 未就绪/该阶段无任务 = 0）。 */
  count: number
  /** v6 T11：该阶段是否存在 automation==='running' 的 change（驱动脉冲光泽承载元素）。 */
  running: boolean
}

/** v6 T11：门徽章 popover 内容条目——静态展示，与具体阶段无关（决议 #2 强制常开对任意复核门一致）。 */
export interface GateHookInfo {
  id: string
  name: string
  desc: string
}

export interface StepperRailProps {
  steps: StepperStep[]
  selectedId: string | null
  onSelect: (id: string) => void
  /**
   * 添加阶段（验收反馈#4，补齐 T13 遗留缺口）。未接线（如 default 只读态）时按钮渲染
   * 禁用态占位——WorkbenchView 只在自定义 workflow 非只读态才传入真 handler。
   */
  onAddStage?: () => void
  /** stepper 容器的 aria-label（如「release-train 阶段」）。 */
  label: string
  /** v6 T11：门徽章 popover 里展示的 hook 列表（WorkbenchView 静态拼出，见文件头注释）。 */
  gateHooks?: readonly GateHookInfo[]
}

/** 技能短名：带命名空间的 id（superpowers:tdd）只显示冒号后段，全名进 title。 */
function shortSkill(id: string): string {
  const ix = id.lastIndexOf(':')
  return ix >= 0 ? id.slice(ix + 1) : id
}

// ── tailwind 原子类合集（原 styles.ts wb8-/wb-flow- 区块的等值搬运；颜色全走 token 语义类）──
// 连接件流动虚线：gated（门后推进边）=红 + 慢速；普通=绿。reduced-motion 由 motion-safe: 停用。
const CONN_BASE =
  "relative h-[34px] w-11 flex-none self-center before:absolute before:top-4 before:right-[9px] before:left-1 before:h-0.5 before:content-[''] after:absolute after:top-3 after:right-0.5 after:h-2.5 after:w-1.5 after:content-[''] after:[clip-path:polygon(0_0,100%_50%,0_100%)]"
const CONN_PLAIN =
  'before:bg-[repeating-linear-gradient(90deg,var(--green)_0_6px,transparent_6px_12px)] motion-safe:before:animate-[wb8-flow_1.4s_linear_infinite] after:bg-green'
const CONN_GATED =
  'before:bg-[repeating-linear-gradient(90deg,var(--red)_0_6px,transparent_6px_12px)] motion-safe:before:animate-[wb8-flow_2.6s_linear_infinite] after:bg-red'

export function StepperRail({
  steps,
  selectedId,
  onSelect,
  onAddStage,
  label,
  gateHooks = [],
}: StepperRailProps): JSX.Element {
  const { t } = useT()
  // 门徽章 popover 开关态：hover 即显（鼠标移出即收）；点击「钉住」显示，不受后续 mouseLeave
  // 影响，再点一次或点外部区域才收起——同一时间只会有一个钉住（点新的门徽章直接切换）。
  const [hoverGate, setHoverGate] = useState<string | null>(null)
  const [pinnedGate, setPinnedGate] = useState<string | null>(null)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pinnedGate === null) return
    function onDocClick(e: MouseEvent): void {
      if (railRef.current && e.target instanceof Node && !railRef.current.contains(e.target)) setPinnedGate(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [pinnedGate])

  return (
    <div className="mb-4">
      <div
        className="flex w-full items-stretch overflow-x-auto px-0.5 pt-1.5 pb-4"
        aria-label={label}
        ref={railRef}
        data-testid="wb-stages"
      >
        {steps.map((s, i) => {
          const on = s.id === selectedId
          const openPop = hoverGate === s.id || pinnedGate === s.id
          const gateLabel = s.gate === 'confirm' ? t('workbench.gate_badge_confirm') : t('workbench.gate_badge')
          return (
            <Fragment key={s.id}>
              <div
                className="relative flex min-w-[178px] flex-1 rounded-[13px] border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-border-2 hover:shadow-md aria-[current=step]:border-green aria-[current=step]:bg-[color-mix(in_srgb,var(--green)_7%,var(--card))] aria-[current=step]:shadow-[0_0_0_3px_var(--ring),var(--shadow)]"
                data-anim="wb-stage"
                data-testid={`wb-step-${s.id}`}
                aria-current={on ? 'step' : undefined}
                // 选中态点击处理落在外层容器（不落在下面主体按钮本身）：门徽章是这个
                // 容器的兄弟节点而非按钮子节点，选中处理若挂在按钮上，直接
                // 点击容器本身（既有测试的既定用法，如 fireEvent.click(getByTestId('wb-step-x'))）
                // 不会经过按钮冒泡触发。原生点击事件冒泡覆盖按钮内部（含键盘
                // Enter/Space 在其上触发的原生 click），门徽章自己的 onClick 会 stopPropagation
                // 挡掉，两者不会互相误触发。
                onClick={() => onSelect(s.id)}
              >
                <button
                  type="button"
                  className="relative flex min-w-0 flex-1 cursor-pointer items-start gap-[11px] overflow-hidden rounded-[inherit] px-3.5 pt-[13px] pb-[11px] text-left"
                >
                  <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full border border-green-b bg-green-t font-mono text-[12.5px] font-bold text-green-d">
                    {i + 1}
                  </span>
                  {s.running && (
                    <i
                      className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[46px] bg-[linear-gradient(105deg,transparent_6%,color-mix(in_srgb,var(--green)_42%,transparent)_50%,transparent_94%)] opacity-0"
                      data-anim="wb-gloss"
                      data-testid={`wb-flow-gloss-${s.id}`}
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 flex-wrap items-baseline gap-[7px] pr-10">
                      <b className="font-mono text-[13.5px] font-bold tracking-[-0.01em] text-text">{s.name}</b>
                      <span className="font-mono text-[10.5px] text-text-3">{s.id}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-[3px] font-mono text-[11px] text-text-3 tabular-nums">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap"><Icon name="layers" size={11} />{t('workbench.meta_skills', { n: s.skills.length })}</span>
                      {s.hooksCount !== undefined && (
                        <>
                          <i className="not-italic text-border-2">·</i>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap"><Icon name="gauge" size={11} />{t('workbench.meta_hooks', { n: s.hooksCount })}</span>
                        </>
                      )}
                      <i className="not-italic text-border-2">·</i>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap"><Icon name="doc" size={11} />{t('workbench.meta_outputs', { n: s.outputsCount })}</span>
                    </span>
                    {s.skills.length > 0 && (
                      <span className="flex flex-wrap items-center gap-1">
                        {s.skills.slice(0, 2).map((id) => (
                          <span
                            key={id}
                            className="inline-block max-w-[124px] truncate rounded-[6px] border border-border bg-fill px-1.5 py-px font-mono text-[11px] text-text-2"
                            title={id}
                          >
                            {shortSkill(id)}
                          </span>
                        ))}
                        {s.skills.length > 2 && <span className="font-mono text-[11px] text-text-3">+{s.skills.length - 2}</span>}
                      </span>
                    )}
                  </span>
                </button>

                <span className="absolute top-2 right-2.5 z-[2] flex items-center gap-1">
                  {s.count > 0 && (
                    <span
                      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-fill-2 px-[5px] font-mono text-[10.5px] font-extrabold text-text-2"
                      data-testid={`wb-flow-count-${s.id}`}
                      title={t('workbench.flow_count_title', { n: s.count })}
                    >
                      {s.count}
                    </span>
                  )}
                  {s.gate && (
                    <span className="relative inline-flex">
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center rounded-full bg-red-t px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-red-d hover:bg-red-b focus-visible:bg-red-b"
                        data-testid={`wb-flow-gate-${s.id}`}
                        aria-expanded={openPop}
                        title={t('workbench.gate_pop_title')}
                        onMouseEnter={() => setHoverGate(s.id)}
                        onMouseLeave={() => setHoverGate(null)}
                        onFocus={() => setHoverGate(s.id)}
                        onBlur={() => setHoverGate(null)}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPinnedGate((cur) => (cur === s.id ? null : s.id))
                        }}
                      >
                        <Icon name="gate" size={10} />
                        {gateLabel}
                      </button>
                      {openPop && (
                        <div
                          className="absolute top-[calc(100%+6px)] right-0 z-[6] w-60 rounded-[11px] border border-border bg-card px-3 py-2.5 text-left shadow-md"
                          data-testid={`wb-flow-gatepop-${s.id}`}
                          role="tooltip"
                        >
                          <p className="mb-1.5 text-[11.5px] font-bold text-text-2">{t('workbench.gate_pop_title')}</p>
                          <div className="space-y-[5px]">
                            {gateHooks.map((h) => (
                              <p key={h.id} className="text-[11.5px] leading-[1.55] text-text-2">
                                <b className="block font-[650] text-text">{h.name}</b>
                                {h.desc}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </span>
                  )}
                </span>
              </div>

              {/* 段间连接件：流动虚线+箭头；门阶段之后的推进边=红虚线+菱形门节点（demo .conn.gated）。
                  连接件是卡的兄弟节点（demo .stages 同款 flex 序），事件名小字随连接件走。 */}
              {s.linkEvent !== null && i < steps.length - 1 && (
                <div
                  className={`${CONN_BASE} ${s.gate ? CONN_GATED : CONN_PLAIN}`}
                  data-gated={s.gate ? '' : undefined}
                  aria-hidden="true"
                >
                  {s.gate && (
                    <span className="absolute top-[17px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-[1.6px] border-red bg-red-t" />
                  )}
                  {/* #2（2026-07-15 用户反馈）：段间转换事件名小字（draft-complete…）会被相邻阶段卡
                      挡住、也非必要——退役，连接件只留流动虚线+门菱形。事件名 aria/悬浮不再需要。 */}
                </div>
              )}
            </Fragment>
          )
        })}
        <button
          className="ml-2.5 flex min-w-[104px] flex-none cursor-pointer items-center justify-center self-stretch rounded-[13px] border border-dashed border-border-2 p-3 text-[13px] font-semibold text-text-3 transition-colors enabled:hover:border-green-b enabled:hover:bg-card enabled:hover:text-text-2 disabled:cursor-not-allowed disabled:opacity-55"
          onClick={onAddStage}
          disabled={!onAddStage}
          title={onAddStage ? undefined : t('workbench.add_stage_pending')}
        >
          {t('workbench.add_stage')}
        </button>
      </div>
    </div>
  )
}
