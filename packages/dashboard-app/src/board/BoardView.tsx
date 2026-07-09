import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import { changeWorkflow } from '../inbox/inbox'
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

interface WfGroup {
  wf: string
  rules: WorkflowRules | undefined
  error: string | undefined
  cards: ChangeSnapshot[]
}

function collapseKey(root: string, wf: string): string {
  return `board.collapsed.${root}.${wf}`
}

/**
 * 看板 Kanban —— G17 根治版（spec §2.2 分组看板）：按 change 实际所属 workflow 分组，
 * 每组渲染它自己的列集与转换图；default 组行为与旧七列看板一致。卡片 hover 快捷转换
 * 按钮与拖拽并存（吸收 brainstorm 方案 3 的优点）；回退边共用二次确认。
 * 规则拉取失败的组只读降级——G17 的底线：任何情况下卡不消失。
 */
export function BoardView({ snapshot, loading, error, currentRoot, rulesByWf, rulesErrors, onTransition, onToast, onError }: BoardViewProps): JSX.Element {
  const { t } = useT()
  const [dragOver, setDragOver] = useState<string | null>(null) // `${wf}:${step}`
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [collapseTick, setCollapseTick] = useState(0)

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
      if (localStorage.getItem(key) === '1') localStorage.removeItem(key)
      else localStorage.setItem(key, '1')
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

  function onDrop(group: WfGroup, toStep: string, raw: string): void {
    setDragOver(null)
    if (!group.rules) return
    let payload: DragPayload
    try {
      payload = JSON.parse(raw) as DragPayload
    } catch {
      return
    }
    if (!payload || typeof payload !== 'object' || !payload.name || !payload.phase) return
    if (payload.workflow !== group.wf) return // 跨组落点：不同 workflow 的列语义不通，no-op
    const planned = plannedTransition(group.rules, payload.phase, toStep)
    if (!planned) return // 非法落点：no-op（视觉回弹）
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
              <div className="board__scroll">
                <div
                  className="board__grid"
                  data-testid={`board-grid-${group.wf}`}
                  style={{ gridTemplateColumns: `repeat(${group.rules.steps.length}, minmax(126px, 1fr))` }}
                >
                  {group.rules.steps.map((step) => {
                    const rules = group.rules!
                    const foldArchive = group.wf === 'default' && step === 'archive'
                    const cards = group.cards.filter((c) => c.phase === step)
                    const isTarget = dragOver === `${group.wf}:${step}`
                    return (
                      <div
                        key={step}
                        data-testid={`board-col-${group.wf}-${step}`}
                        className={isTarget ? 'board__col board__col--target' : 'board__col'}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (dragOver !== `${group.wf}:${step}`) setDragOver(`${group.wf}:${step}`)
                        }}
                        onDragLeave={() => {
                          if (dragOver === `${group.wf}:${step}`) setDragOver(null)
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
                                return (
                                  <article
                                    key={`${currentRoot}/${change.name}`}
                                    className={gate ? 'card board__card board__card--gate' : 'card board__card'}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`change ${change.name}`}
                                    data-testid={`board-card-${change.name}`}
                                    draggable
                                    onDragStart={(e) => {
                                      const payload: DragPayload = { name: change.name, root: currentRoot, phase: change.phase, workflow: group.wf }
                                      e.dataTransfer.setData('application/json', JSON.stringify(payload))
                                      e.dataTransfer.effectAllowed = 'move'
                                    }}
                                  >
                                    <div className="board__card-top">
                                      <span className="card__name">{change.name}</span>
                                      {change.track && <span className="card__track">{change.track}</span>}
                                    </div>
                                    {(gate || change.updated_at) && (
                                      <div className="board__card-meta">
                                        {gate ? <span className="badge badge--gate">{t('inbox.badge_waiting')}</span> : <span />}
                                        {change.updated_at && <span>{change.updated_at}</span>}
                                      </div>
                                    )}
                                    {targets.length > 0 && (
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
                                              onClick={() => requestTransition(change.name, currentRoot, planned)}
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
                    <span className="ticket-row__time">{change.updated_at}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {pending && (
        <div className="dialog__backdrop" data-testid="board-confirm">
          <div className="dialog" role="dialog" aria-modal="true" aria-label={t('board.confirm_backward_title')}>
            <h2 className="dialog__title">{t('board.confirm_backward_title')}</h2>
            <p className="dialog__desc">
              {t('board.confirm_backward_desc', {
                name: pending.name,
                from: pending.planned.from,
                to: pending.planned.to,
                event: pending.planned.event,
              })}
            </p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setPending(null)}>
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
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
