import type { ReactNode, RefObject } from 'react'
import { useT } from '../i18n'
import { TaskDetail } from '../shared/TaskDetail'
import { VerificationEvidenceComposer } from '../verification/VerificationEvidenceComposer'
import { fieldStr, type FlatRow } from './progressViewModel'
import { ContextBundlePreview } from './ContextBundlePreview'
import { RunLogPane } from './RunLogPane'

export interface ProgressDrawerProps {
  row: FlatRow
  drawerRef: RefObject<HTMLElement>
  scrimRef: RefObject<HTMLDivElement>
  badge: ReactNode
  actions?: ReactNode
  onClose: () => void
  onToast?: (message: string) => void
}

export function ProgressDrawer({
  row,
  drawerRef,
  scrimRef,
  badge,
  actions,
  onClose,
  onToast,
}: ProgressDrawerProps): JSX.Element {
  const { lang } = useT()
  return (
    <>
      <div className="fixed inset-0 z-40 bg-scrim" data-testid="prg9-scrim" ref={scrimRef} onClick={onClose} />
      <aside
        className="fixed top-0 right-0 bottom-0 z-50 flex w-[560px] max-w-[94vw] flex-col border-l border-border-2 bg-card shadow-lg"
        data-anim="prg-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={row.row.change.name}
        data-testid="prg9-drawer"
        ref={drawerRef}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TaskDetail
            root={row.row.root}
            change={row.row.change}
            rules={row.rules}
            badge={badge}
            actions={actions}
            curStageExtra={(
              <ContextBundlePreview
                key={`${row.row.root}\u0000${row.row.change.name}\u0000${row.row.change.phase}`}
                root={row.row.root}
                change={row.row.change.name}
                currentPhase={row.row.change.phase}
              />
            )}
            collapseTechnical
            documentsExtra={row.row.change.phase === 'verify'
              ? (
                  <VerificationEvidenceComposer
                    locale={lang === 'zh' ? 'zh-CN' : 'en'}
                    onToast={onToast}
                    root={row.row.root}
                  />
                )
              : undefined}
            onClose={onClose}
            onToast={onToast}
          />
          {row.row.state === 'running' && fieldStr(row.row.change, 'automation') === 'running' && (
            <RunLogPane root={row.row.root} change={row.row.change} />
          )}
        </div>
      </aside>
    </>
  )
}
