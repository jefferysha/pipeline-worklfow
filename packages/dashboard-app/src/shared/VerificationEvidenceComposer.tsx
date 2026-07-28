import { useRef, useState } from 'react'
import {
  postVerificationEvidenceCompose,
  VerificationEvidenceApiError,
  type VerificationEvidenceDraftEntry,
  type VerificationEvidenceLocale,
} from '../api/client'
import { useT } from '../i18n'
import { Dialog } from './Dialog'
import {
  VerificationEvidenceEntryEditor,
  type VerificationEvidenceEditorEntry,
} from './VerificationEvidenceEntryEditor'

interface VerificationEvidenceComposerProps {
  root: string
  locale: VerificationEvidenceLocale
  onToast?: (message: string) => void
}

function draftEntry(entry: VerificationEvidenceEditorEntry): VerificationEvidenceDraftEntry {
  return {
    kind: entry.kind,
    title: entry.title.trim(),
    status: entry.status,
    ...(entry.kind === 'command' && entry.command.trim() !== '' ? { command: entry.command.trim() } : {}),
    ...(entry.status === 'skipped'
      ? { skipReason: entry.skipReason.trim() }
      : { result: entry.result.trim() }),
  }
}

export function VerificationEvidenceComposer({
  root,
  locale,
  onToast,
}: VerificationEvidenceComposerProps): JSX.Element {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<VerificationEvidenceEditorEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [copyError, setCopyError] = useState('')
  const nextId = useRef(1)

  function resetOutcome(): void {
    setError('')
    setMarkdown('')
    setCopyError('')
  }

  function addEntry(): void {
    const id = nextId.current
    nextId.current += 1
    setEntries((current) => [...current, {
      id,
      kind: 'command',
      title: '',
      status: 'passed',
      command: '',
      result: '',
      skipReason: '',
    }])
    resetOutcome()
  }

  function updateEntry(id: number, patch: Partial<VerificationEvidenceEditorEntry>): void {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry))
    resetOutcome()
  }

  function validate(): string {
    const invalid = entries.find((entry) => entry.title.trim() === '')
    if (invalid) return t('detail.evidence_error_title')
    const missingBody = entries.find((entry) => entry.status === 'skipped'
      ? entry.skipReason.trim() === ''
      : entry.result.trim() === '')
    if (!missingBody) return ''
    return missingBody.status === 'skipped'
      ? t('detail.evidence_error_skip_reason')
      : t('detail.evidence_error_result')
  }

  async function compose(): Promise<void> {
    const localError = validate()
    if (localError !== '') {
      setError(localError)
      return
    }
    setBusy(true)
    resetOutcome()
    try {
      const result = await postVerificationEvidenceCompose({
        root,
        locale,
        entries: entries.map(draftEntry),
      })
      setMarkdown(result.markdown)
    } catch (caught) {
      if (caught instanceof VerificationEvidenceApiError) {
        const path = caught.details[0]?.path || 'request'
        setError(t('detail.evidence_error_invalid', { path }))
      } else {
        setError(t('detail.evidence_error_request'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function copy(): Promise<void> {
    setCopyError('')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(markdown)
      onToast?.(t('detail.evidence_copied'))
    } catch {
      setCopyError(t('detail.evidence_copy_failed'))
    }
  }

  return (
    <>
      <button
        className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-text transition hover:border-(--accent) hover:bg-fill"
        data-testid="evidence-compose-open"
        onClick={() => setOpen(true)}
        type="button"
      >
        {t('detail.evidence_open')}
      </button>
      {open && (
        <Dialog
          actions={(
            <>
              <button className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-2 hover:bg-fill" onClick={() => setOpen(false)} type="button">
                {t('detail.evidence_cancel')}
              </button>
              <button
                className="rounded-lg bg-btn-bg px-4 py-2 text-xs font-bold text-btn-fg hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-45"
                data-testid="evidence-compose"
                disabled={busy || entries.length === 0}
                onClick={() => void compose()}
                type="button"
              >
                {busy ? t('detail.evidence_composing') : t('detail.evidence_compose')}
              </button>
            </>
          )}
          closeLabel={t('detail.evidence_cancel')}
          onClose={() => setOpen(false)}
          panelClassName="w-[min(780px,94vw)]"
          testid="evidence-compose-dialog"
          title={t('detail.evidence_dialog_title')}
          variant="workspace"
        >
          <p className="mb-2 text-[13px] leading-5 text-text-2">{t('detail.evidence_subtitle')}</p>
          <p className="mb-4 rounded-lg border border-amber-b bg-amber-t px-3 py-2 text-xs leading-5 text-amber-d">
            {t('detail.evidence_draft_notice')}
          </p>
          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center" data-testid="evidence-empty">
              <p className="m-0 text-sm font-semibold text-text-2">{t('detail.evidence_empty')}</p>
              <p className="mt-1 text-xs text-text-3">{t('detail.evidence_empty_hint')}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {entries.map((entry, index) => (
                <VerificationEvidenceEntryEditor
                  disabled={busy}
                  entry={entry}
                  index={index}
                  key={entry.id}
                  onChange={(patch) => updateEntry(entry.id, patch)}
                  onRemove={() => {
                    setEntries((current) => current.filter((item) => item.id !== entry.id))
                    resetOutcome()
                  }}
                />
              ))}
            </div>
          )}
          <button
            className="mt-3 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text hover:bg-fill disabled:opacity-45"
            data-testid="evidence-add-entry"
            disabled={busy || entries.length >= 12}
            onClick={addEntry}
            type="button"
          >
            + {t('detail.evidence_add')}
          </button>
          {error !== '' && (
            <p aria-live="polite" className="mt-3 rounded-lg border border-red-b bg-red-t px-3 py-2 text-xs text-red-d" data-testid="evidence-error">
              {error}
            </p>
          )}
          {markdown !== '' && (
            <section className="mt-4 rounded-xl border border-green-b bg-green-t/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-xs font-bold text-green-d" htmlFor="verification-evidence-output">
                  {t('detail.evidence_output')}
                </label>
                <button className="rounded-lg border border-green-b px-3 py-1.5 text-xs font-semibold text-green-d hover:bg-green-t" data-testid="evidence-copy" onClick={() => void copy()} type="button">
                  {t('detail.evidence_copy')}
                </button>
              </div>
              <textarea
                className="min-h-48 w-full resize-y rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-5 text-text outline-none"
                data-testid="evidence-output"
                id="verification-evidence-output"
                readOnly
                value={markdown}
              />
              {copyError !== '' && <p aria-live="polite" className="mb-0 mt-2 text-xs text-red-d" data-testid="evidence-copy-error">{copyError}</p>}
            </section>
          )}
        </Dialog>
      )}
    </>
  )
}
