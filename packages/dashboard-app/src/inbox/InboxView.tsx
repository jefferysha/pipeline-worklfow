import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import type { Snapshot } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import { legalTargets, plannedTransition, type PlannedTransition } from '../board/events'
import { shortTime } from '../model/time'
import { changeWorkflow, projectName, selectInbox } from './inbox'

interface InboxViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** D5 项目切换器语义：收件箱只看当前项目。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集（wf 名 → rules）。 */
  rulesByWf: ReadonlyMap<string, WorkflowRules>
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
 * 收件箱 —— 默认落地视图（病灶②的解法）。只答一个问题："现在哪个 change 在等我决定"。
 * 工票车间语言（spec §2.3）：朱红工票行 + 实底"等你复核"徽章 + 行尾快捷转换按钮
 * （与看板同一 legalTargets/plannedTransition 管线，回退边共用二次确认语义）。
 * 设计变更登记：原"决定类型文案行"（awaiting.<kind>）退役——紧凑行里徽章已表达"在等"，
 * 细分语义由相位胶囊承担；awaiting.* i18n key 保留供空态副本等复用。
 */
export function InboxView({ snapshot, loading, error, currentRoot, rulesByWf, onOpenBoard, onTransition, onToast, onError, onNewChange }: InboxViewProps): JSX.Element {
  const { t } = useT()
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const items = useMemo(() => selectInbox(snapshot, currentRoot, rulesByWf), [snapshot, currentRoot, rulesByWf])
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
      <ul className="inbox__list" data-testid="inbox-list">
        {items.map(({ root, change }) => {
          const wf = changeWorkflow(change)
          const rules = rulesByWf.get(wf)
          const targets = rules ? legalTargets(rules, change.phase) : []
          return (
            <li key={`${root}/${change.name}`} className="ticket-row ticket-row--gate" data-testid="inbox-card">
              <span className="card__name">{change.name}</span>
              {change.track && <span className="card__track">{change.track}</span>}
              <span className="wf-label" data-testid="inbox-card-wf">{wf}</span>
              <span className="g-phase" data-testid="inbox-card-phase">{change.phase}</span>
              <span className="badge badge--gate">{t('inbox.badge_waiting')}</span>
              <span className="ticket-row__time">{rootToName.get(root) ?? root}{change.updated_at ? ` · ${shortTime(change.updated_at)}` : ''}</span>
              <span className="ticket-row__spacer" />
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
                      onClick={() => onQuick(change.name, root, planned)}
                    >
                      {planned.backward ? `↩ ${to}` : `→ ${to}`}
                    </button>
                  )
                })}
              </span>
            </li>
          )
        })}
      </ul>

      {pending && (
        <div className="dialog__backdrop" data-testid="inbox-confirm">
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
                data-testid="inbox-confirm-yes"
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
