import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import type { Snapshot } from '../types'
import { rulesKey, type WorkflowRules } from '../model/workflowModel'
import { legalTargets, plannedTransition, type PlannedTransition } from '../board/events'
import { shortTime } from '../model/time'
import { Dialog } from '../shell/Dialog'
import { Icon } from '../shell/Icon'
import { revealList } from '../workflow/motion'
import { ChangeDetailCard } from './ChangeDetailCard'
import { gateEvidence, type EvidenceChip } from './evidence'
import { changeWorkflow, projectName, selectInbox } from './inbox'

interface InboxViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** D5 项目切换器语义：非空=只看该项目；空串=全部项目聚合（Task 5 契约）。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集，键=rulesKey(root,wf)（Task 8/G19③：聚合语境下同名
   *  自定义 workflow 跨项目不串缓存，键必须带 root 才能唯一定位）。 */
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  onOpenBoard: () => void
  /** 快捷转换（App 注入 = api/client.postTransition + 成功后 refresh）。 */
  onTransition: (name: string, root: string, event: string) => Promise<void>
  onToast?: (msg: string) => void
  onError?: (msg: string) => void
  /** G18 新建 change 入口（App 提供；无项目语境时缺省不渲染）。 */
  onNewChange?: () => void
}

interface Pending {
  name: string
  root: string
  planned: PlannedTransition
}

/**
 * 行内证据 chip（Task 7，评审 P0-1：gateEvidence 复用，行内即时可见，不必点开详情卡才看得到）。
 * copyable 字段（路径/sha 类）渲染成可点的 button（拷贝值），其余 tone 语义字段渲染成只读 span
 * ——同视觉基准 demo 的 `.chip`/`button.chip` 区分（非 button 的 chip 不该看起来可点）。
 */
function renderEvidenceChip(chip: EvidenceChip, onCopy: (value: string) => void): JSX.Element {
  if (chip.copyable) {
    return (
      <button
        key={chip.key}
        type="button"
        className="ev__chip ev__chip--neutral"
        data-testid={`inbox-evidence-${chip.key}`}
        onClick={() => onCopy(chip.value)}
      >
        <Icon name="copy" size={11} />
        {chip.key}={chip.value}
      </button>
    )
  }
  return (
    <span key={chip.key} className={`ev__chip ev__chip--${chip.tone}`} data-testid={`inbox-evidence-${chip.key}`}>
      {chip.tone === 'pass' && <Icon name="check" size={11} />}
      {chip.tone === 'fail' && <Icon name="x" size={11} />}
      {chip.key}={chip.value}
    </span>
  )
}

/**
 * 收件箱 —— 默认落地视图（病灶②的解法）。只答一个问题："现在哪个 change 在等我决定"。
 * 工票车间语言（spec §2.3）：朱红工票行 + 实底"等你复核"徽章 + 行尾快捷转换按钮
 * （与看板同一 legalTargets/plannedTransition 管线，回退边共用二次确认语义）。
 * 设计变更登记：原"决定类型文案行"（awaiting.<kind>）退役——紧凑行里徽章已表达"在等"，
 * 细分语义由相位胶囊承担；awaiting.* i18n key 保留供空态副本等复用。
 */
export function InboxView({ snapshot, loading, error, currentRoot, rulesByKey, onOpenBoard, onTransition, onToast, onError, onNewChange }: InboxViewProps): JSX.Element {
  const { t } = useT()
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  // 详情卡点开（Task 7，评审 P0-1）：selected 是被点开那行的 `${root}/${change.name}` 复合键
  // （单项目语境下 root 恒定，仍取复合键是为了防御未来聚合视图；见 selectInbox 的 currentRoot
  // 过滤注释）。kbdFocus 是独立的"键盘焦点环"索引——j/k 移动它，不联动 selected（哪行展开
  // 详情只由点击/Enter 决定），两者语义分离对齐 brief"焦点环"与"选中"是两件事的措辞。
  const [selected, setSelected] = useState<string | null>(null)
  const [kbdFocus, setKbdFocus] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const revealedRef = useRef(false)
  const items = useMemo(() => selectInbox(snapshot, currentRoot, rulesByKey), [snapshot, currentRoot, rulesByKey])
  // 视图进场 stagger（只播首次数据到达，SSE 后续刷新瞬时——product register：不重播编排）
  useEffect(() => {
    if (items.length > 0 && listRef.current && !revealedRef.current) {
      revealedRef.current = true
      revealList(listRef.current.children)
    }
  }, [items.length])

  // j/k 移动焦点环、Enter 开/关 kbdFocus 所在行的详情卡、Esc 关详情——单个 document keydown
  // 监听（brief 明确要求合一，不是三个监听器）。两条旁路：① e.target 是 INPUT/TEXTAREA 时整体
  // 不处理——NewChangeDialog/Onboarding 的文本输入与本视图同时挂载（对话框是覆盖层，不卸载
  // 背后的 InboxView），敲字符 'j'/'k' 或提交时的 Enter 不该拨动收件箱的隐藏状态；
  // ② Esc 时若 document 上还有打开的 [role="dialog"]（本视图的回退确认框，或详情卡自己的回退
  // 确认框）则整体不处理，让位给 Dialog 自己的 LIFO 栈 Esc 逻辑——避免"关掉确认框的同一次 Esc
  // 顺带把详情卡也关了"的双重反应。Dialog 组件的状态更新在这次事件派发的同步阶段还没有落到
  // DOM 上（React 18 批处理），这里的 document.querySelector 读到的仍是"事件发生时"的 DOM，
  // 与 Dialog 自己监听器的注册/执行顺序无关，两边独立判断都成立。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'j') {
        setKbdFocus((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'k') {
        setKbdFocus((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const item = items[kbdFocus]
        if (item) {
          const key = `${item.root}/${item.change.name}`
          setSelected((prev) => (prev === key ? null : key))
        }
      } else if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"]')) return
        setSelected(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [items, kbdFocus])

  const rootToName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of snapshot?.projects ?? []) m.set(p.root, projectName(p))
    return m
  }, [snapshot])

  async function apply(name: string, root: string, planned: PlannedTransition): Promise<void> {
    setBusy(true)
    try {
      await onTransition(name, root, planned.event)
      onToast?.(t('board.transition_ok', { name, event: planned.event }))
    } catch (e) {
      onError?.(t('board.transition_fail', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  function onQuick(name: string, root: string, planned: PlannedTransition): void {
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

  function toggleRow(key: string, index: number): void {
    setKbdFocus(index)
    setSelected((prev) => (prev === key ? null : key))
  }

  function copyEvidence(value: string): void {
    void navigator.clipboard?.writeText(value).then(() => {
      onToast?.(t('detail.copied', { value }))
    })
  }

  if (loading && !snapshot) {
    return <p className="view__note" data-testid="inbox-loading">{t('common.loading')}</p>
  }
  if (error && !snapshot) {
    return <p className="view__note view__note--error" data-testid="inbox-error">{error}</p>
  }

  if (items.length === 0) {
    return (
      <section className="view inbox" data-testid="inbox-view">
        <div className="empty" data-testid="inbox-empty">
          <div className="empty__mark" aria-hidden="true">◇</div>
          <h2 className="empty__title">{t('inbox.empty_title')}</h2>
          <p className="empty__desc">{t('inbox.empty_desc')}</p>
          <button type="button" className="btn" onClick={onOpenBoard}>{t('inbox.open_board')}</button>
        </div>
      </section>
    )
  }

  const selectedItem = selected ? items.find((it) => `${it.root}/${it.change.name}` === selected) : undefined

  return (
    <section className="view inbox" data-testid="inbox-view">
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('inbox.title')}</h1>
          <p className="view__subtitle">{t('inbox.subtitle')}</p>
        </div>
        <span className="view__count" data-testid="inbox-count">{t('inbox.count', { n: items.length })}</span>
        {onNewChange && (
          <button type="button" className="btn" data-testid="new-change-open" onClick={onNewChange}>
            ＋ {t('newchange.title')}
          </button>
        )}
      </header>
      <ul className="inbox__list" data-testid="inbox-list" ref={listRef}>
        {items.map(({ root, change }, index) => {
          const wf = changeWorkflow(change)
          const rules = rulesByKey.get(rulesKey(root, wf))
          const targets = rules ? legalTargets(rules, change.phase) : []
          const key = `${root}/${change.name}`
          const isSelected = selected === key
          const evidence = gateEvidence(change, rules)
          const rowClass = [
            'ticket-row',
            'ticket-row--gate',
            isSelected && 'ticket-row--open',
            kbdFocus === index && 'kbd-focus',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <li
              key={key}
              className={rowClass}
              data-testid="inbox-card"
              tabIndex={0}
              aria-expanded={isSelected}
              onClick={() => toggleRow(key, index)}
              onFocus={() => setKbdFocus(index)}
            >
              <span className="card__name">{change.name}</span>
              {change.track && <span className="card__track">{change.track}</span>}
              <span className="wf-label" data-testid="inbox-card-wf">{wf}</span>
              <span className="g-phase" data-testid="inbox-card-phase">{change.phase}</span>
              <span className="badge badge--gate">{t('inbox.badge_waiting')}</span>
              <span className="ticket-row__time">{rootToName.get(root) ?? root}{change.updated_at ? ` · ${shortTime(change.updated_at)}` : ''}</span>
              <span className="ticket-row__spacer" />
              {/* 评审 Minor-5 修复：卡打开时该行快捷钮组隐藏——详情卡动作条是唯一动作面，
                  避免同一条转换在行内快捷钮与详情卡两处都能触发（双提交风险）。 */}
              {!isSelected && (
                <span className="qk">
                  {targets.map((to) => {
                    const planned = rules ? plannedTransition(rules, change.phase, to) : null
                    if (!planned) return null
                    return (
                      <button
                        key={planned.event}
                        type="button"
                        className={planned.backward ? 'qk__btn qk__btn--back' : 'qk__btn'}
                        data-testid={`inbox-quick-${planned.event}`}
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          onQuick(change.name, root, planned)
                        }}
                      >
                        {planned.backward ? `↩ ${to}` : `→ ${to}`}
                      </button>
                    )
                  })}
                </span>
              )}
              {evidence.length > 0 && (
                <div className="ev" onClick={(e) => e.stopPropagation()}>
                  {evidence.map((chip) => renderEvidenceChip(chip, copyEvidence))}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {selectedItem && (
        <ChangeDetailCard
          root={selectedItem.root}
          change={selectedItem.change}
          rules={rulesByKey.get(rulesKey(selectedItem.root, changeWorkflow(selectedItem.change)))}
          onTransition={onTransition}
          onClose={() => setSelected(null)}
          onToast={onToast}
          onError={onError}
        />
      )}

      {pending && (
        <Dialog
          title={t('board.confirm_backward_title')}
          onClose={closePending}
          testid="inbox-confirm"
          actions={
            <>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={closePending}>
                {t('board.confirm_no')}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                data-testid="inbox-confirm-yes"
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
