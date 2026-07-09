import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import { changeWorkflow } from '../inbox/inbox'
import { ChangeDetailCard } from '../inbox/ChangeDetailCard'
import { shortTime } from '../model/time'
import { Dialog } from '../shell/Dialog'
import { foldOpen, stampConfirm } from '../workflow/motion'
import { legalTargets, plannedTransition, type PlannedTransition } from './events'

interface BoardViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** D5 项目切换器语义：看板只看当前项目。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集（wf 名 → rules）。 */
  rulesByWf: ReadonlyMap<string, WorkflowRules>
  /** 拉取失败的 workflow（wf 名 → server 文案）——对应组渲染为只读降级（卡不消失）。 */
  rulesErrors: ReadonlyMap<string, string>
  /** 写回一次转换（App 注入 = api/client.postTransition + 成功后 refresh）。 */
  onTransition: (name: string, root: string, event: string) => Promise<void>
  onToast?: (msg: string) => void
  onError?: (msg: string) => void
  /** G18 新建 change 入口（App 提供）。 */
  onNewChange?: () => void
}

interface Pending {
  name: string
  root: string
  planned: PlannedTransition
}

interface DragPayload {
  name: string
  root: string
  phase: string
  workflow: string
}

/**
 * 评审 P1-11：拖拽中驱动列前示的状态（与 draggingRef 并存——ref 只管 click 抑制，这个 state
 * 管视觉：每列按 plannedTransition(group.rules, dragging.phase, step) 判定 legal/illegal）。
 * 刻意不含 root——列前示只需要 phase/workflow 就能判定合法性，name 只是留作调试/未来扩展的
 * identity，不参与任何判定逻辑。
 */
interface DraggingState {
  name: string
  phase: string
  workflow: string
}

interface WfGroup {
  wf: string
  rules: WorkflowRules | undefined
  error: string | undefined
  cards: ChangeSnapshot[]
}

function collapseKey(root: string, wf: string): string {
  return `board.collapsed.${root}.${wf}`
}

interface DetailTarget {
  root: string
  name: string
}

interface DetailEntry {
  change: ChangeSnapshot
  rules: WorkflowRules | undefined
}

/**
 * detail 状态只存 {root,name}（Task 9 brief 契约），渲染时经本函数反查所属组拿到 change 与
 * 该组已经算好的 rules——brief 交接注意事项：BoardView 的 rulesByWf 是按裸 wf 名键的旧 Map
 * （非 rulesKey(root,wf) 格式），detail 卡的 rules 不查它，直接用同组卡片共享的 group.rules。
 *
 * 评审修复轮 Important-3：新增 currentRoot 参数与核对。BoardView 切换项目（D5 项目切换器）
 * 不会卸载重挂组件，若 detail 里存的 root 是切换前的旧项目、而新项目恰好有同名 change，
 * 仅按 name 匹配会把"旧项目的详情卡"错配成"新项目同名 change 的数据"（root 对不上，内容却
 * 照样渲染出来）。groups 已经是按 currentRoot 过滤过的当前项目分组，这里只需要求
 * target.root === currentRoot 才继续按 name 找；不相等直接判定"查无此卡"，与组件里
 * [currentRoot] 依赖的 detail 重置 effect 构成双保险。
 */
function findDetailEntry(groups: readonly WfGroup[], target: DetailTarget | null, currentRoot: string): DetailEntry | undefined {
  if (!target) return undefined
  if (target.root !== currentRoot) return undefined
  for (const g of groups) {
    const change = g.cards.find((c) => c.name === target.name)
    if (change) return { change, rules: g.rules }
  }
  return undefined
}

/**
 * 看板 Kanban —— G17 根治版（spec §2.2 分组看板）：按 change 实际所属 workflow 分组，
 * 每组渲染它自己的列集与转换图；default 组行为与旧七列看板一致。卡片 hover 快捷转换
 * 按钮与拖拽并存（吸收 brainstorm 方案 3 的优点）；回退边共用二次确认。
 * 规则拉取失败的组只读降级——G17 的底线：任何情况下卡不消失。
 */
export function BoardView({ snapshot, loading, error, currentRoot, rulesByWf, rulesErrors, onTransition, onToast, onError, onNewChange }: BoardViewProps): JSX.Element {
  const { t } = useT()
  const [dragOver, setDragOver] = useState<string | null>(null) // `${wf}:${step}`
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [collapseTick, setCollapseTick] = useState(0)
  /** 转换成功盖章（1.6s 后自动消失，仅状态信息非装饰）。 */
  const [stamped, setStamped] = useState<{ name: string; to: string } | null>(null)
  /** 刚被用户展开的组名——body 挂载时播 foldOpen（首屏挂载不播）。 */
  const expandingRef = useRef<string | null>(null)
  /** 详情卡开关（评审 P0-2 死卡片复活，Task 9）：只存 {root,name}，渲染时经 findDetailEntry
   *  反查 change/rules。「置 detail」不是 toggle（brief 原话，故意区别于 InboxView 的
   *  toggleRow）——点已打开的卡或换点别的卡都是直接覆盖，不是开关切换。 */
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  /** dragstart→dragend 期间为 true：原生拖拽手势结束后浏览器通常不会再派发 click，但为防御
   *  "拖拽落点后紧跟一次 click"（含测试环境显式派发的场景），click handler 据此旁路，不误当
   *  成"点开详情"（brief Step 1 明确要求的第 5 条测试）。
   *  评审修复轮 Important-2：复位不能只靠 onDragEnd——若拖拽中源卡因某种原因（如 SSE 快照
   *  刷新把这张卡从列表里移除）被卸载，dragend 不会派发，这个全板共享的 ref 会永久卡在
   *  true，之后所有卡片的 click 都会被短路失效。下方 Esc 监听所在的 effect 里另加了
   *  document 级 mouseup 兜底复位（见该处注释），mouseup 无论 DOM 结构怎么变都会派发到
   *  document，是比 onDragEnd 更可靠的复位时机。 */
  const draggingRef = useRef(false)
  /** 评审 P1-11：拖拽中的 {name,phase,workflow}，驱动每列 legal/illegal 前示；onDragStart 置、
   *  onDragEnd/onDrop/document-mouseup 兜底清（与 draggingRef 复位时机对称，但这个 state 只管
   *  视觉，没有 draggingRef 那种"抑制紧跟的 click"的顾虑，mouseup 分支可以同步清，不必等
   *  setTimeout(0)）。 */
  const [dragging, setDragging] = useState<DraggingState | null>(null)
  /** 非法 drop 落点列——300ms 后自动清（CSS shake 动效窗口），配合 onError 一句解释取代旧的
   *  静默 no-op（评审 P1-11）。 */
  const [shakeCol, setShakeCol] = useState<string | null>(null)

  // Esc 关 detail（评审 P0-2 键盘契约的一部分）。让位打开中的 Dialog（board 自己的回退确认框，
  // 或 detail 卡自己的回退确认框）——同 InboxView.tsx 的既有写法：document 上还有
  // [role="dialog"] 时整体不处理，避免"关掉确认框的同一次 Esc 顺带把详情卡也关了"的双重反应。
  //
  // 同一个 effect 里另挂 document 级 mouseup（评审修复轮 Important-2）：draggingRef 的复位
  // 此前完全依赖 React onDragEnd，若拖拽过程中源卡被卸载（如 SSE 刷新把这张卡从快照里移走）
  // dragend 就不会派发，ref 永久卡 true、全板卡片 click 从此失效。mouseup 是比 dragend 更
  // 可靠的复位信号——无论 DOM 在拖拽中怎么变，鼠标释放都会派发到 document。用
  // setTimeout(0) 把复位挪到下一个宏任务而非立即同步复位：拖拽落点后浏览器/测试环境紧跟
  // 派发的那次 click 与这次 mouseup 属于同一次用户交互，在同一个同步任务里派发，
  // setTimeout(0) 保证那次 click 读到的 draggingRef.current 仍是 true（继续被抑制，不误开
  // 详情），复位在这次交互结束之后才生效，不破坏 draggingRef 声明处注释描述的既有防误触
  // 语义。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      setDetail(null)
    }
    function onMouseUp(): void {
      // 评审 P1-11：dragging state 没有 draggingRef 那种"抑制紧跟 click"的顾虑（它只管列的
      // legal/illegal 视觉前示，不参与 click 短路判断），可以直接同步清，不必等 setTimeout(0)。
      setDragging(null)
      window.setTimeout(() => {
        draggingRef.current = false
      }, 0)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // 切项目即关详情卡（评审修复轮 Important-3，双保险的一半）：BoardView 不会因为切换
  // currentRoot 而卸载重挂，detail 状态若跨项目残留，配合 findDetailEntry 新增的 root
  // 核对——两处任一生效都能防止"旧项目详情 + 新项目同名 change"错配渲染，这里负责主动
  // 清空 state（另一半见 findDetailEntry 的 target.root !== currentRoot 早退）。
  useEffect(() => {
    setDetail(null)
  }, [currentRoot])

  const groups = useMemo<WfGroup[]>(() => {
    const project = snapshot?.projects.find((p) => p.ok && p.root === currentRoot)
    const byWf = new Map<string, ChangeSnapshot[]>()
    for (const c of project?.changes ?? []) {
      const wf = changeWorkflow(c)
      const bucket = byWf.get(wf) ?? []
      bucket.push(c)
      byWf.set(wf, bucket)
    }
    const names = [...byWf.keys()].sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a < b ? -1 : 1))
    return names.map((wf) => ({ wf, rules: rulesByWf.get(wf), error: rulesErrors.get(wf), cards: byWf.get(wf)! }))
  }, [snapshot, currentRoot, rulesByWf, rulesErrors])

  const totalCards = groups.reduce((n, g) => n + g.cards.length, 0)
  const detailEntry = findDetailEntry(groups, detail, currentRoot)

  function isCollapsed(wf: string): boolean {
    void collapseTick
    try {
      return localStorage.getItem(collapseKey(currentRoot, wf)) === '1'
    } catch {
      return false
    }
  }

  function toggleCollapsed(wf: string): void {
    try {
      const key = collapseKey(currentRoot, wf)
      if (localStorage.getItem(key) === '1') {
        localStorage.removeItem(key)
        expandingRef.current = wf // 展开方向：body 挂载时播 foldOpen
      } else {
        localStorage.setItem(key, '1')
      }
    } catch {
      /* ignore */
    }
    setCollapseTick((n) => n + 1)
  }

  async function apply(name: string, root: string, planned: PlannedTransition): Promise<void> {
    setBusy(true)
    try {
      await onTransition(name, root, planned.event)
      onToast?.(t('board.transition_ok', { name, event: planned.event }))
      setStamped({ name, to: planned.to })
      window.setTimeout(() => setStamped((s) => (s?.name === name ? null : s)), 1600)
    } catch (e) {
      onError?.(t('board.transition_fail', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  function requestTransition(name: string, root: string, planned: PlannedTransition): void {
    if (planned.backward) {
      setPending({ name, root, planned })
    } else {
      void apply(name, root, planned)
    }
  }

  // busy 守卫（评审修复）：迁移到共享 Dialog 后 Esc/backdrop 都会调 onClose，
  // 迁移前的手写 backdrop 是死 div、busy 期间点它没有任何效果——这里补回等价语义。
  // 取消钮也复用同一个函数（本来就该和 Esc/backdrop 一致，不必各写一份）。
  function closePending(): void {
    if (!busy) setPending(null)
  }

  /**
   * 评审 P1-11：非法落点不再静默 no-op——该列 shake 300ms + onError 一句解释（"{from} 没有到
   * {to} 的转换边"）。key 与列渲染时用于 shakeCol 比对的 colKey 同构（`${wf}:${step}`）。
   */
  function triggerIllegalDrop(wf: string, toStep: string, fromStep: string): void {
    const key = `${wf}:${toStep}`
    setShakeCol(key)
    window.setTimeout(() => setShakeCol((k) => (k === key ? null : k)), 300)
    onError?.(t('board.illegal_drop', { from: fromStep, to: toStep }))
  }

  function onDrop(group: WfGroup, toStep: string, raw: string): void {
    setDragOver(null)
    setDragging(null)
    if (!group.rules) return
    let payload: DragPayload
    try {
      payload = JSON.parse(raw) as DragPayload
    } catch {
      return
    }
    if (!payload || typeof payload !== 'object' || !payload.name || !payload.phase) return
    if (payload.workflow !== group.wf) {
      triggerIllegalDrop(group.wf, toStep, payload.phase) // 跨组落点：不同 workflow 的列语义不通
      return
    }
    const planned = plannedTransition(group.rules, payload.phase, toStep)
    if (!planned) {
      triggerIllegalDrop(group.wf, toStep, payload.phase) // 非法落点（评审 P1-11）
      return
    }
    requestTransition(payload.name, payload.root ?? '', planned)
  }

  if (loading && !snapshot) {
    return <p className="view__note" data-testid="board-loading">{t('common.loading')}</p>
  }
  if (error && !snapshot) {
    return <p className="view__note view__note--error" data-testid="board-error">{error}</p>
  }
  if (totalCards === 0) {
    return (
      <section className="view board" data-testid="board-view">
        <p className="view__note" data-testid="board-empty">{t('board.empty')}</p>
      </section>
    )
  }

  return (
    <section className="view board" data-testid="board-view">
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('board.title')}</h1>
          <p className="view__subtitle">{t('board.subtitle')}</p>
        </div>
        {onNewChange && (
          <button type="button" className="btn" data-testid="new-change-open" onClick={onNewChange}>
            ＋ {t('newchange.title')}
          </button>
        )}
      </header>

      {groups.map((group) => {
        const collapsed = isCollapsed(group.wf)
        return (
          <section key={group.wf} className="board__group" data-testid={`board-group-${group.wf}`}>
            <header className="board__group-head">
              <button
                type="button"
                className="board__group-caret"
                data-testid={`board-fold-${group.wf}`}
                aria-expanded={!collapsed}
                onClick={() => toggleCollapsed(group.wf)}
              >
                {collapsed ? '▸' : '▾'}
              </button>
              <span className="board__group-name">{group.wf}</span>
              <span className="board__group-meta">
                {group.rules
                  ? t('board.group_meta', { steps: group.rules.steps.length, cards: group.cards.length })
                  : t('board.group_meta_nocol', { cards: group.cards.length })}
              </span>
            </header>

            {group.error && (
              <p className="board__group-error" data-testid={`board-group-error-${group.wf}`}>
                {t('board.group_error', { msg: group.error })}
              </p>
            )}

            {!collapsed && group.rules && (
              <div
                className="board__scroll"
                ref={(el) => {
                  if (el && expandingRef.current === group.wf) {
                    expandingRef.current = null
                    foldOpen(el)
                  }
                }}
              >
                <div
                  className="board__grid"
                  data-testid={`board-grid-${group.wf}`}
                  style={{ gridTemplateColumns: `repeat(${group.rules.steps.length}, minmax(126px, 1fr))` }}
                >
                  {group.rules.steps.map((step) => {
                    const rules = group.rules!
                    const foldArchive = group.wf === 'default' && step === 'archive'
                    const cards = group.cards.filter((c) => c.phase === step)
                    const colKey = `${group.wf}:${step}`
                    const isTarget = dragOver === colKey
                    // 评审 P1-11：拖拽中逐列判定合法性——跨组（workflow 不同）不信任 step 名巧合
                    // 相等，整组直接非法；同组按 plannedTransition 是否有出边判定（含起点列本身：
                    // fromStep===toStep 恒 null，同样落 illegal，不特殊豁免）。不在拖拽中为 null，
                    // 不渲染 legal/illegal 任一类。
                    const legal = dragging
                      ? dragging.workflow === group.wf && plannedTransition(rules, dragging.phase, step) !== null
                      : null
                    const colClass = ['board__col']
                    if (legal === true) colClass.push('board__col--legal')
                    else if (legal === false) colClass.push('board__col--illegal')
                    if (isTarget && legal === true) colClass.push('board__col--target') // hover 高亮仅合法列生效
                    if (shakeCol === colKey) colClass.push('board__col--shake')
                    return (
                      <div
                        key={step}
                        data-testid={`board-col-${group.wf}-${step}`}
                        className={colClass.join(' ')}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (dragOver !== colKey) setDragOver(colKey)
                        }}
                        onDragLeave={() => {
                          if (dragOver === colKey) setDragOver(null)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          onDrop(group, step, e.dataTransfer.getData('application/json'))
                        }}
                      >
                        <div className="board__col-head">
                          <span className="board__col-name">{step}</span>
                          <span className="board__col-count" data-testid={`board-col-count-${group.wf}-${step}`}>{cards.length}</span>
                        </div>
                        <div className="board__col-body">
                          {foldArchive ? (
                            <div className="board__fold" data-testid="board-fold-archive">
                              {t('board.archived_fold', { n: cards.length })}
                            </div>
                          ) : (
                            <>
                              {cards.map((change) => {
                                const gate = rules.gateByStep[change.phase] === 'review'
                                const targets = legalTargets(rules, change.phase)
                                // 评审修复轮 Important-1：detail 打开时，该卡（root+name 与当前 detail 匹配）的
                                // 行内快捷钮组隐藏——详情卡动作条是唯一动作面，同 InboxView.tsx Minor-5 先例
                                // （避免同一条转换在看板卡快捷钮与详情卡动作条两处都能触发）。只隐藏"正在被
                                // 详情卡展示的那一张"，其余卡片的快捷钮不受影响。
                                const isCardDetailOpen = detail !== null && detail.root === currentRoot && detail.name === change.name
                                return (
                                  <article
                                    key={`${currentRoot}/${change.name}`}
                                    className={gate ? 'card board__card board__card--gate' : 'card board__card'}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`change ${change.name}`}
                                    data-testid={`board-card-${change.name}`}
                                    draggable
                                    onClick={() => {
                                      if (draggingRef.current) return // 拖拽落点触发的 click 旁路，见 draggingRef 声明处注释
                                      setDetail({ root: currentRoot, name: change.name })
                                    }}
                                    onKeyDown={(e) => {
                                      // 评审 P0-2：role="button" tabIndex={0} 此前 click/Enter/Space 三路无反应——接上真行为。
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault() // 阻止 Space 的原生页面滚动，呼应 role="button" 的键盘契约
                                        setDetail({ root: currentRoot, name: change.name })
                                      }
                                    }}
                                    onDragStart={(e) => {
                                      draggingRef.current = true
                                      const payload: DragPayload = { name: change.name, root: currentRoot, phase: change.phase, workflow: group.wf }
                                      e.dataTransfer.setData('application/json', JSON.stringify(payload))
                                      e.dataTransfer.effectAllowed = 'move'
                                      setDragging({ name: change.name, phase: change.phase, workflow: group.wf }) // 评审 P1-11：驱动列前示
                                    }}
                                    onDragEnd={() => {
                                      draggingRef.current = false
                                      setDragging(null)
                                    }}
                                  >
                                    {stamped?.name === change.name && (
                                      <span
                                        className="stamp"
                                        data-testid={`board-stamp-${change.name}`}
                                        ref={(el) => {
                                          if (el) stampConfirm(el)
                                        }}
                                      >
                                        ✓ {t('board.stamp', { to: stamped.to })}
                                      </span>
                                    )}
                                    <div className="board__card-top">
                                      <span className="card__name">{change.name}</span>
                                      {change.track && <span className="card__track">{change.track}</span>}
                                    </div>
                                    {(gate || change.updated_at) && (
                                      <div className="board__card-meta">
                                        {gate ? <span className="badge badge--gate">{t('inbox.badge_waiting')}</span> : <span />}
                                        {change.updated_at && <span>{shortTime(change.updated_at)}</span>}
                                      </div>
                                    )}
                                    {targets.length > 0 && !isCardDetailOpen && (
                                      <span className="qk">
                                        {targets.map((to) => {
                                          const planned = plannedTransition(rules, change.phase, to)
                                          if (!planned) return null
                                          return (
                                            <button
                                              key={planned.event}
                                              type="button"
                                              className={planned.backward ? 'qk__btn qk__btn--back' : 'qk__btn'}
                                              data-testid={`board-quick-${change.name}-${planned.event}`}
                                              disabled={busy}
                                              onClick={(e) => {
                                                // 卡片新增 onClick 开详情后，快捷钮点击不该冒泡触发同一次 click 顺带打开详情
                                                // （同 InboxView.tsx 行内快捷钮的既有 stopPropagation 先例）。
                                                e.stopPropagation()
                                                requestTransition(change.name, currentRoot, planned)
                                              }}
                                            >
                                              {planned.backward ? `↩ ${to}` : `→ ${to}`}
                                            </button>
                                          )
                                        })}
                                      </span>
                                    )}
                                  </article>
                                )
                              })}
                              {cards.length === 0 && <div className="board__col-empty">{t('board.col_empty')}</div>}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!collapsed && !group.rules && (
              <ul className="inbox__list">
                {group.cards.map((change) => (
                  <li key={change.name} className="ticket-row" data-testid={`board-card-${change.name}`}>
                    <span className="card__name">{change.name}</span>
                    {change.track && <span className="card__track">{change.track}</span>}
                    <span className="g-phase">{change.phase}</span>
                    <span className="ticket-row__time">{change.updated_at ? shortTime(change.updated_at) : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {detail && detailEntry && (
        <ChangeDetailCard
          root={detail.root}
          change={detailEntry.change}
          rules={detailEntry.rules}
          onTransition={onTransition}
          onClose={() => setDetail(null)}
          onToast={onToast}
          onError={onError}
        />
      )}

      {pending && (
        <Dialog
          title={t('board.confirm_backward_title')}
          onClose={closePending}
          testid="board-confirm"
          actions={
            <>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={closePending}>
                {t('board.confirm_no')}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                data-testid="board-confirm-yes"
                disabled={busy}
                onClick={() => void apply(pending.name, pending.root, pending.planned)}
              >
                {t('board.confirm_yes')}
              </button>
            </>
          }
        >
          <p className="dialog__desc">
            {t('board.confirm_backward_desc', {
              name: pending.name,
              from: pending.planned.from,
              to: pending.planned.to,
              event: pending.planned.event,
            })}
          </p>
        </Dialog>
      )}
    </section>
  )
}
