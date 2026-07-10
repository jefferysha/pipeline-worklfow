import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import { rulesKey, type WorkflowRules } from '../model/workflowModel'
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
  /** D5 项目切换器语义：''=全部项目聚合（Task 11，G19③/④），非空=只看该项目。 */
  currentRoot: string
  /**
   * App 拉取的 workflow 规则集。**键格式随语境变化**（Task 11 权衡：为了让非聚合路径的
   * App.tsx 接线与既有 34 条测试逐字零改动，没有像 InboxView 那样整体升级成恒定
   * rulesKey(root,wf) 索引的新 prop 名——细节见下）：
   *   · currentRoot !== ''（非聚合）：裸 wf 名索引（沿用 useWorkflowRules 的既有产出，Task 8
   *     起就是这个形状，App.tsx 这一侧零改动）。
   *   · currentRoot === ''（聚合）：App 改传 useWorkflowRulesMulti 的产出，索引变成
   *     rulesKey(root,wf)——因为聚合时同名自定义 workflow 可能出自不同项目、定义不同，裸 wf
   *     名不足以区分。本组件内部任何 rules 查找一律经下面的 lookupRules/lookupRulesError
   *     两个小函数完成，不手拼分隔符、不绕过 rulesKey()。
   */
  rulesByWf: ReadonlyMap<string, WorkflowRules>
  /** 拉取失败的 workflow——对应组渲染为只读降级（卡不消失）。键格式同 rulesByWf 的语境规则。 */
  rulesErrors: ReadonlyMap<string, string>
  /** 写回一次转换（App 注入 = api/client.postTransition + 成功后 refresh）。 */
  onTransition: (name: string, root: string, event: string) => Promise<void>
  onToast?: (msg: string) => void
  onError?: (msg: string) => void
  /** G18 新建 change 入口（App 提供）。聚合语境下 App 恒传 undefined——新建需要明确的目标项目。 */
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
 * Task 11：新增 root——聚合语境下两个不同项目可能各自有一个同名 workflow（如都叫
 * release-train，但定义不同），仅凭 workflow 名判定合法性会把"跨项目、名字碰巧相同"误判成
 * 合法（P1-11 原注释"列前示只需要 phase/workflow 就能判定合法性"这个假设在聚合语境下不再
 * 成立，一并更正）。name 仍只是调试/未来扩展的 identity，不参与判定。
 */
interface DraggingState {
  name: string
  root: string
  phase: string
  workflow: string
}

interface WfGroup {
  /** 该组实际所属项目 root（非聚合时恒等于 currentRoot；聚合时是该组真正所属的项目路径，
   *  Task 11 新增——detail/拖拽/转换全部据此取"卡片自己的项目"而非语境层面的 currentRoot）。 */
  root: string
  wf: string
  /** React key / DOM testid / collapse-localStorage / 拖拽前示列 key 等纯 UI 用途的展示键：
   *  非聚合 = 裸 wf 名（与既有测试逐字一致）；聚合 = `${root}:${wf}`（避免同名 wf 跨项目撞
   *  key）。**与 rulesKey(root,wf) 无关**——rules 查找一律走 rulesKey()，两套键各管各的。 */
  groupKey: string
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
 * 该组已经算好的 rules。
 *
 * Task 11 改法（上游评审交办的前向兼容修复）：不再拿 target.root 与 currentRoot 比较——聚合
 * 语境下 currentRoot 恒为 ''，而 target.root 现在记的是卡片自己所属项目的真实 root（见
 * WfGroup.root/卡片 onClick 的 setDetail），两者压根不是同一个量纲，继续比较只会让聚合下的
 * detail 全部误判"查无此卡"。改为直接按"组的 root === target.root 且 name 匹配"反查——
 * groups 本身已经带着每组真实的 root（非聚合时等于 currentRoot，聚合时是各自项目的 root），
 * 这一条判据在两种语境下都成立，不必再单独传 currentRoot 参数。
 * 评审修复轮 Important-3 的"切项目即清空 detail" effect（见组件内 useEffect([currentRoot])）
 * 仍然保留，是同一个防错配问题的另一半保险（主动清空 + 反查兜底）。
 */
function findDetailEntry(groups: readonly WfGroup[], target: DetailTarget | null): DetailEntry | undefined {
  if (!target) return undefined
  for (const g of groups) {
    if (g.root !== target.root) continue
    const change = g.cards.find((c) => c.name === target.name)
    if (change) return { change, rules: g.rules }
  }
  return undefined
}

/** root 尾段（同 inbox.ts projectName()/App.tsx navProjects 同款一行逻辑的第三份局部拷贝——
 *  三处都只是这一行，不值得为此新增跨模块依赖）：聚合语境组头展示「<root 尾段> · <wf>」用。 */
function rootTail(root: string): string {
  const parts = root.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? root
}

/** 归档时间：archived_at 未设（老内核 cmd_get 口径：空串/字面 'null'，同 evidence.ts/
 *  ChangeDetailCard.tsx 私有 helper 的既有口径）时退化 updated_at（G19④ archive 展开名单用）。 */
function archivedAt(c: ChangeSnapshot): string {
  const v = c.fields['archived_at']
  return typeof v === 'string' && v !== '' && v !== 'null' ? v : c.updated_at
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
  /** archive 折叠条点开的只读名单（G19④）：按 groupKey 记住哪些组的 archive 列表当前展开——
   *  聚合语境下可能同时存在多个 default 组，各自独立展开/收起，互不影响。纯 UI 态，不落
   *  localStorage（不是"偏好"，每次进入看板都重新收起，同 InboxView 行内展开的既有先例）。 */
  const [archiveOpen, setArchiveOpen] = useState<ReadonlySet<string>>(new Set())
  /** 刚被用户展开的 archive 组 key——名单 body 挂载时播 foldOpen（同 expandingRef 的既有套路，
   *  独立一份 ref 因为这是另一块可折叠区域，不能共用 expandingRef 否则互相踩键）。 */
  const archiveExpandingRef = useRef<string | null>(null)

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
  // currentRoot 而卸载重挂，detail 状态若跨项目残留，配合 findDetailEntry 新增的按组 root
  // 核对——两处任一生效都能防止"旧项目详情 + 新项目同名 change"错配渲染，这里负责主动
  // 清空 state（另一半见 findDetailEntry 的 g.root !== target.root 早退）。聚合语境下同样
  // 适用：currentRoot 在聚合内部不变（恒为 ''），只有真正切换语境（聚合⇄单项目、或两个
  // 单项目之间切换）才会触发。
  useEffect(() => {
    setDetail(null)
  }, [currentRoot])

  /**
   * Task 11（G19③/④ 收官）：currentRoot===''（聚合）时不再只认 currentRoot 精确匹配的单个
   * 项目，遍历全部 ok 项目各自分组；每组携带自己真实的 root（WfGroup.root），供 detail/
   * 拖拽/转换全部取用"卡片自己的项目"而非语境层面的 currentRoot（后者聚合时是空字符串
   * 哨兵，不是任何一个真实项目）。非聚合分支逐字保留原实现（单项目 find + 分组），只是
   * 套进同一个"每项目一轮分组"的循环里，产出的 groups 与改动前逐字相同（多一个 root 字段，
   * 值恒等于 currentRoot）。
   * rules 查找（lookupRules/lookupRulesError，见下）按 currentRoot==='' 分支：非聚合沿用 App.tsx
   * 既有 useWorkflowRules 产出的裸 wf 名 Map（rulesByWf 这个 prop 名/格式对非聚合路径完全
   * 不变）；聚合时 App.tsx 改传 useWorkflowRulesMulti 的产出（同一个 prop 名，但已经是按
   * rulesKey(root,wf) 索引的 Map——见 BoardViewProps.rulesByWf 的 JSDoc）。
   */
  function lookupRules(root: string, wf: string): WorkflowRules | undefined {
    return currentRoot === '' ? rulesByWf.get(rulesKey(root, wf)) : rulesByWf.get(wf)
  }
  function lookupRulesError(root: string, wf: string): string | undefined {
    return currentRoot === '' ? rulesErrors.get(rulesKey(root, wf)) : rulesErrors.get(wf)
  }
  /** 展示键（React key/testid/collapse/拖拽列 key 用）：非聚合裸 wf 名（既有测试逐字不变）；
   *  聚合 `${root}:${wf}`（同名 wf 跨项目不再撞 key）。与 rulesKey() 是两套互不相关的键。 */
  function makeGroupKey(root: string, wf: string): string {
    return currentRoot === '' ? `${root}:${wf}` : wf
  }

  const groups = useMemo<WfGroup[]>(() => {
    const scopeProjects =
      currentRoot === ''
        ? (snapshot?.projects.filter((p) => p.ok) ?? [])
        : (() => {
            const project = snapshot?.projects.find((p) => p.ok && p.root === currentRoot)
            return project ? [project] : []
          })()
    const out: WfGroup[] = []
    for (const project of scopeProjects) {
      const byWf = new Map<string, ChangeSnapshot[]>()
      for (const c of project.changes) {
        const wf = changeWorkflow(c)
        const bucket = byWf.get(wf) ?? []
        bucket.push(c)
        byWf.set(wf, bucket)
      }
      const names = [...byWf.keys()].sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a < b ? -1 : 1))
      for (const wf of names) {
        out.push({
          root: project.root,
          wf,
          groupKey: makeGroupKey(project.root, wf),
          rules: lookupRules(project.root, wf),
          error: lookupRulesError(project.root, wf),
          cards: byWf.get(wf)!,
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookupRules/lookupRulesError/makeGroupKey 都是闭包在同一渲染里定义的纯函数，依赖已经通过 currentRoot/rulesByWf/rulesErrors 覆盖
  }, [snapshot, currentRoot, rulesByWf, rulesErrors])

  const totalCards = groups.reduce((n, g) => n + g.cards.length, 0)
  const detailEntry = findDetailEntry(groups, detail)

  function isCollapsed(g: WfGroup): boolean {
    void collapseTick
    try {
      return localStorage.getItem(collapseKey(g.root, g.wf)) === '1'
    } catch {
      return false
    }
  }

  function toggleCollapsed(g: WfGroup): void {
    try {
      const key = collapseKey(g.root, g.wf)
      if (localStorage.getItem(key) === '1') {
        localStorage.removeItem(key)
        expandingRef.current = g.groupKey // 展开方向：body 挂载时播 foldOpen
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
  // 禁止用 useCallback 包裹本函数——会冻结 busy 快照，连取消钮的 busy 语义一起假死，且 exhaustive-deps 拦不住。
  function closePending(): void {
    if (!busy) setPending(null)
  }

  /**
   * 评审 P1-11：非法落点不再静默 no-op——该列 shake 300ms + onError 一句解释。key 与列渲染时
   * 用于 shakeCol 比对的 colKey 同构（`${group.groupKey}:${step}`，Task 11 起 groupKey 取代
   * 裸 wf 名——聚合语境下两个不同项目的同名 wf 分组要落在各自独立的 shake key 上）。
   * reason='cross_project'（Task 11 新增）：聚合语境下跨项目拖拽——即使目标组恰好同名 wf，
   * "没有到 {to} 的转换边"这句话会说谎（边可能真的存在，只是存在于另一个项目），改用专门的
   * 跨项目文案，不复用可能误导的既有 illegal_drop 措辞。
   */
  function triggerIllegalDrop(groupKey: string, toStep: string, fromStep: string, reason: 'edge' | 'cross_project' = 'edge'): void {
    const key = `${groupKey}:${toStep}`
    setShakeCol(key)
    window.setTimeout(() => setShakeCol((k) => (k === key ? null : k)), 300)
    onError?.(reason === 'cross_project' ? t('board.illegal_drop_cross_project') : t('board.illegal_drop', { from: fromStep, to: toStep }))
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
    // Task 11（关键交接③）：聚合语境下 DragPayload 带的是卡片自己项目的 root（见卡片
    // onDragStart），不同项目即使 workflow 同名，列语义也不通——校验 payload.root ===
    // 组的 root，不相等一律非法反馈（不是静默 no-op，呼应 P1-11 的既有取舍：任何拖拽结果
    // 都要给用户看得见的反应，不能悄悄什么也不做）。非聚合语境下 payload.root 恒等于
    // group.root（两者都等于 currentRoot），这条判断永远为 false，不影响既有行为。
    if (payload.root !== group.root) {
      triggerIllegalDrop(group.groupKey, toStep, payload.phase, 'cross_project')
      return
    }
    if (payload.workflow !== group.wf) {
      triggerIllegalDrop(group.groupKey, toStep, payload.phase) // 跨组落点：不同 workflow 的列语义不通
      return
    }
    const planned = plannedTransition(group.rules, payload.phase, toStep)
    if (!planned) {
      triggerIllegalDrop(group.groupKey, toStep, payload.phase) // 非法落点（评审 P1-11）
      return
    }
    requestTransition(payload.name, payload.root ?? '', planned)
  }

  function toggleArchiveOpen(key: string): void {
    setArchiveOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        archiveExpandingRef.current = key // 展开方向：名单挂载时播 foldOpen（同 expandingRef 套路）
      }
      return next
    })
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
        const collapsed = isCollapsed(group)
        return (
          <section key={group.groupKey} className="board__group" data-testid={`board-group-${group.groupKey}`}>
            <header className="board__group-head">
              <button
                type="button"
                className="board__group-caret"
                data-testid={`board-fold-${group.groupKey}`}
                aria-expanded={!collapsed}
                onClick={() => toggleCollapsed(group)}
              >
                {collapsed ? '▸' : '▾'}
              </button>
              <span className="board__group-name">
                {currentRoot === '' ? (
                  <>
                    <span className="board__group-root">{rootTail(group.root)}</span>
                    {' · '}
                    {group.wf}
                  </>
                ) : (
                  group.wf
                )}
              </span>
              <span className="board__group-meta">
                {group.rules
                  ? t('board.group_meta', { steps: group.rules.steps.length, cards: group.cards.length })
                  : t('board.group_meta_nocol', { cards: group.cards.length })}
              </span>
            </header>

            {group.error && (
              <p className="board__group-error" data-testid={`board-group-error-${group.groupKey}`}>
                {t('board.group_error', { msg: group.error })}
              </p>
            )}

            {!collapsed && group.rules && (
              <div
                className="board__scroll"
                ref={(el) => {
                  if (el && expandingRef.current === group.groupKey) {
                    expandingRef.current = null
                    foldOpen(el)
                  }
                }}
              >
                <div
                  className="board__grid"
                  data-testid={`board-grid-${group.groupKey}`}
                  style={{ gridTemplateColumns: `repeat(${group.rules.steps.length}, minmax(126px, 1fr))` }}
                >
                  {group.rules.steps.map((step) => {
                    const rules = group.rules!
                    const foldArchive = group.wf === 'default' && step === 'archive'
                    const cards = group.cards.filter((c) => c.phase === step)
                    const colKey = `${group.groupKey}:${step}`
                    const isTarget = dragOver === colKey
                    // 评审 P1-11：拖拽中逐列判定合法性——跨组（workflow 不同）不信任 step 名巧合
                    // 相等，整组直接非法；同组按 plannedTransition 是否有出边判定（含起点列本身：
                    // fromStep===toStep 恒 null，同样落 illegal，不特殊豁免）。不在拖拽中为 null，
                    // 不渲染 legal/illegal 任一类。Task 11：先核对 dragging.root === group.root——
                    // 聚合语境下两个不同项目可能各自有一个同名 workflow，仅比 workflow 名会把
                    // "跨项目、名字碰巧相同"误判成合法（与 onDrop 的 payload.root 校验对称）。
                    const legal = dragging
                      ? dragging.root === group.root && dragging.workflow === group.wf && plannedTransition(rules, dragging.phase, step) !== null
                      : null
                    const colClass = ['board__col']
                    if (legal === true) colClass.push('board__col--legal')
                    else if (legal === false) colClass.push('board__col--illegal')
                    if (isTarget && legal === true) colClass.push('board__col--target') // hover 高亮仅合法列生效
                    if (shakeCol === colKey) colClass.push('board__col--shake')
                    const isArchiveOpen = archiveOpen.has(group.groupKey)
                    return (
                      <div
                        key={step}
                        data-testid={`board-col-${group.groupKey}-${step}`}
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
                          <span className="board__col-count" data-testid={`board-col-count-${group.groupKey}-${step}`}>{cards.length}</span>
                        </div>
                        <div className="board__col-body">
                          {foldArchive ? (
                            <div className="board__fold-wrap">
                              <button
                                type="button"
                                className="board__fold"
                                data-testid="board-fold-archive"
                                aria-expanded={isArchiveOpen}
                                onClick={() => toggleArchiveOpen(group.groupKey)}
                              >
                                {t('board.archived_fold', { n: cards.length })}
                              </button>
                              {isArchiveOpen && (
                                <div
                                  className="fold-body"
                                  ref={(el) => {
                                    if (el && archiveExpandingRef.current === group.groupKey) {
                                      archiveExpandingRef.current = null
                                      foldOpen(el)
                                    }
                                  }}
                                >
                                  <ul className="board__archive-list" data-testid="board-archive-list">
                                    {cards.map((c) => (
                                      <li key={`${group.root}/${c.name}`} className="board__archive-row">
                                        <span className="card__name">{c.name}</span>
                                        <span className="ticket-row__time">{shortTime(archivedAt(c))}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              {cards.map((change) => {
                                const gate = rules.gateByStep[change.phase] === 'review'
                                const targets = legalTargets(rules, change.phase)
                                // 评审修复轮 Important-1：detail 打开时，该卡（root+name 与当前 detail 匹配）的
                                // 行内快捷钮组隐藏——详情卡动作条是唯一动作面，同 InboxView.tsx Minor-5 先例
                                // （避免同一条转换在看板卡快捷钮与详情卡动作条两处都能触发）。只隐藏"正在被
                                // 详情卡展示的那一张"，其余卡片的快捷钮不受影响。Task 11：比对 group.root（卡片
                                // 自己所属的项目）而非 currentRoot——聚合语境下 currentRoot 恒为 ''，永远不会等于
                                // 任何真实 detail.root，继续比 currentRoot 会让这条隐藏逻辑在聚合下失效。
                                const isCardDetailOpen = detail !== null && detail.root === group.root && detail.name === change.name
                                return (
                                  <article
                                    key={`${group.root}/${change.name}`}
                                    className={gate ? 'card board__card board__card--gate' : 'card board__card'}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`change ${change.name}`}
                                    data-testid={`board-card-${change.name}`}
                                    draggable
                                    onClick={() => {
                                      if (draggingRef.current) return // 拖拽落点触发的 click 旁路，见 draggingRef 声明处注释
                                      setDetail({ root: group.root, name: change.name }) // Task 11：记卡片自己的项目 root，不是 currentRoot
                                    }}
                                    onKeyDown={(e) => {
                                      // 评审 P0-2：role="button" tabIndex={0} 此前 click/Enter/Space 三路无反应——接上真行为。
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault() // 阻止 Space 的原生页面滚动，呼应 role="button" 的键盘契约
                                        setDetail({ root: group.root, name: change.name })
                                      }
                                    }}
                                    onDragStart={(e) => {
                                      draggingRef.current = true
                                      // Task 11：payload.root 记卡片自己的项目 root（聚合语境下 currentRoot 是空字符串
                                      // 哨兵，不是任何真实项目；非聚合语境下 group.root 恒等于 currentRoot，行为不变）。
                                      const payload: DragPayload = { name: change.name, root: group.root, phase: change.phase, workflow: group.wf }
                                      e.dataTransfer.setData('application/json', JSON.stringify(payload))
                                      e.dataTransfer.effectAllowed = 'move'
                                      setDragging({ name: change.name, root: group.root, phase: change.phase, workflow: group.wf }) // 评审 P1-11 + Task 11：驱动列前示
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
                                                requestTransition(change.name, group.root, planned) // Task 11：用卡片自己的项目 root，不是 currentRoot
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
                  <li key={`${group.root}/${change.name}`} className="ticket-row" data-testid={`board-card-${change.name}`}>
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
