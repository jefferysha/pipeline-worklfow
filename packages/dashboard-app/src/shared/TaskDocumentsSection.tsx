import { useT } from '../i18n'
import type { ChangeSnapshot } from '../types'
import type { VerificationEvidenceLocale } from '../api/client'
import { VerificationEvidenceComposer } from './VerificationEvidenceComposer'

export interface TaskDocumentsSectionProps {
  documents: NonNullable<ChangeSnapshot['documents']>
  locale: VerificationEvidenceLocale
  phase: string
  root: string
  onToast?: (message: string) => void
}

export function TaskDocumentsSection({
  documents,
  locale,
  phase,
  root,
  onToast,
}: TaskDocumentsSectionProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="border-b border-border py-[13px] last:border-b-0" data-testid="dt-documents">
      <div className="mb-2.5 flex items-baseline gap-[7px] text-[12.5px] font-bold text-text">
        {t('detail.docs_heading')}
        <span className="text-xs font-normal text-text-3">
          {documents.pass === true ? t('detail.docs_complete') : t('detail.docs_incomplete')}
        </span>
      </div>
      {documents.items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="dt-documents-items">
          {documents.items.map((item) => (
            <li
              className={`rounded-md border px-2 py-1.5 text-xs [overflow-wrap:anywhere] ${
                item.status === 'recorded' ? 'border-green-b bg-green-t text-green-d' : 'border-red-b bg-red-t text-red-d'
              }`}
              data-status={item.status}
              data-testid={`dt-document-${item.kind}`}
              key={item.kind}
            >
              <b>{item.kind}</b> · {item.status === 'recorded'
                ? t('detail.docs_recorded')
                : item.status === 'missing'
                  ? t('detail.docs_missing')
                  : item.status === 'stale'
                    ? t('detail.docs_stale')
                    : t('detail.docs_unread')}
              {item.requiredRead && <span className="text-text-3"> · {t('detail.docs_read_required')}</span>}
              {item.paths.length > 0 && <span className="font-mono text-[11px] text-text-2"> · {item.paths.join(', ')}</span>}
            </li>
          ))}
        </ul>
      )}
      {documents.blockers.length > 0 && (
        <ul className="mt-2 mb-0 flex list-none flex-col gap-1 pl-0 text-xs text-red-d" data-testid="dt-document-blockers">
          {documents.blockers.map((blocker) => <li key={blocker}>× {blocker}</li>)}
        </ul>
      )}
      {documents.items.length === 0 && documents.blockers.length === 0 && (
        <p className="m-0 text-xs text-text-3">{t('detail.docs_empty')}</p>
      )}
      {phase === 'verify' && (
        <div className="mt-3 border-t border-border pt-3">
          <VerificationEvidenceComposer locale={locale} onToast={onToast} root={root} />
        </div>
      )}
    </div>
  )
}
