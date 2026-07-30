import { useT } from '../i18n'

export interface SnapshotInlineErrorProps {
  error: string
  loading: boolean
  onRefresh?: () => void | Promise<void>
}

export function SnapshotInlineError({
  error,
  loading,
  onRefresh,
}: SnapshotInlineErrorProps): JSX.Element {
  const { t } = useT()
  return (
    <div
      className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-b bg-red-t px-4 py-3 text-[13px] text-red-d"
      role="alert"
      data-testid="prg-error"
    >
      <p className="min-w-0 break-words">{error}</p>
      {onRefresh && (
        <button
          type="button"
          className="cursor-pointer rounded-lg border border-red-b bg-card px-3 py-2 text-[13px] font-bold text-red-d transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-wait disabled:opacity-60"
          disabled={loading}
          onClick={() => { void onRefresh() }}
        >
          {t('common.snapshot_retry')}
        </button>
      )}
    </div>
  )
}
