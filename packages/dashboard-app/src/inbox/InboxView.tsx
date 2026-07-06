import { useMemo } from 'react'
import { useT } from '../i18n'
import type { Snapshot } from '../types'
import { decisionKind, projectName, selectInbox } from './inbox'

interface InboxViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  onOpenBoard: () => void
}

/**
 * 收件箱 —— 默认落地视图（病灶②的解法）。只答一个问题："现在哪个 change 在等我决定"。
 * 有卡：列出停在复核门的 change；空态："没有在等你的事"。
 */
export function InboxView({ snapshot, loading, error, onOpenBoard }: InboxViewProps): JSX.Element {
  const { t } = useT()
  const items = useMemo(() => selectInbox(snapshot), [snapshot])
  const rootToName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of snapshot?.projects ?? []) m.set(p.root, projectName(p))
    return m
  }, [snapshot])

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
      </header>
      <ul className="inbox__list" data-testid="inbox-list">
        {items.map(({ root, change }) => (
          <li key={`${root}/${change.name}`} className="card inbox__card" data-testid="inbox-card">
            <div className="card__head">
              <span className="card__name">{change.name}</span>
              <span className="badge badge--phase" data-testid="inbox-card-phase">
                {t(`phases.${change.phase}`)}
              </span>
            </div>
            <p className="card__reason" data-testid="inbox-card-reason">
              {t(`inbox.awaiting.${decisionKind(change)}`)}
            </p>
            <div className="card__meta">
              <span className="card__project">{rootToName.get(root) ?? root}</span>
              {change.track && <span className="card__track">{change.track}</span>}
              {change.updated_at && (
                <span className="card__updated">{t('common.updated')} {change.updated_at}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
