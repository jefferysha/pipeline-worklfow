import { useEffect, useState } from 'react'
import {
  deleteTrackDefinition,
  patchTrackDefinition,
  postRouterPreview,
  postTrackDefinition,
  type WbRouterPreview,
  type WbTrackDefinition,
} from '../api/client'
import { useT } from '../i18n'
import { formatApiError } from '../api/transport'
import { Dialog } from '../shared/Dialog'
import type { MandatoryState } from './mandatoryState'
import { TrackSettingsList } from './TrackSettingsList'

const ADD_CLS =
  'cursor-pointer rounded-lg border-[1.5px] border-dashed border-border-2 bg-transparent px-[11px] py-[5px] text-[12.5px] font-bold whitespace-nowrap text-text-3 transition-colors enabled:hover:border-purple-b enabled:hover:text-purple-d disabled:cursor-not-allowed disabled:opacity-50'

type TrackPolicyDraft = WbTrackDefinition['policyProfile']
interface TrackEditorDraft {
  id: string
  label: string
  workflowDefault: string
  workflowAny: boolean
  workflowAllowed: string
  policyProfile: TrackPolicyDraft
}

function clonePolicy(policy: TrackPolicyDraft): TrackPolicyDraft {
  return {
    ...policy,
    routing: policy.routing.enabled ? { ...policy.routing } : { enabled: false },
    skills: { ...policy.skills },
  }
}

function draftFromTrack(track: WbTrackDefinition): TrackEditorDraft {
  return {
    id: track.id,
    label: track.label,
    workflowDefault: track.workflow.default,
    workflowAny: track.workflow.allowed === '*',
    workflowAllowed: track.workflow.allowed === '*' ? '' : track.workflow.allowed.join(', '),
    policyProfile: clonePolicy(track.policyProfile),
  }
}

export function TrackSettings({ state }: { state: MandatoryState }): JSX.Element {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; original: WbTrackDefinition | null; draft: TrackEditorDraft } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [routePrompt, setRoutePrompt] = useState('')
  const [routePreview, setRoutePreview] = useState<WbRouterPreview | null>(null)
  const [routePreviewBusy, setRoutePreviewBusy] = useState(false)
  const [routePreviewError, setRoutePreviewError] = useState('')
  useEffect(() => {
    setError(null)
    setRoutePreviewError('')
  }, [lang])
  const fieldClass = 'rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] text-text focus-visible:border-(--accent) focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-(--ring-blue) disabled:opacity-60'

  function openCreate(): void {
    const template = state.tracks.find((track) => track.id === 'frontend') ?? state.tracks[0]
    if (!template) return
    setEditor({
      mode: 'create', original: null,
      draft: { id: '', label: '', workflowDefault: 'default', workflowAny: true, workflowAllowed: '', policyProfile: clonePolicy(template.policyProfile) },
    })
    setError(null)
    setDeleteConfirm(false)
    setRoutePreview(null)
    setRoutePreviewError('')
  }

  function openEdit(track: WbTrackDefinition): void {
    setEditor({ mode: 'edit', original: track, draft: draftFromTrack(track) })
    setError(null)
    setDeleteConfirm(false)
    setRoutePreview(null)
    setRoutePreviewError('')
  }

  function updateDraft(patch: Partial<TrackEditorDraft>): void {
    setEditor((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current)
    setRoutePreview(null)
  }

  function effectiveDraft(draft: TrackEditorDraft): WbTrackDefinition {
    return {
      id: draft.id,
      label: draft.label.trim(),
      builtin: false,
      workflow: { default: draft.workflowDefault.trim(), allowed: allowedFromDraft(draft) },
      policyProfile: clonePolicy(draft.policyProfile),
    }
  }

  async function previewRoute(): Promise<void> {
    if (!editor || editor.original?.builtin || routePreviewBusy || routePrompt.trim() === '') return
    setRoutePreviewBusy(true)
    setRoutePreviewError('')
    try {
      setRoutePreview(await postRouterPreview(state.root, routePrompt.trim(), effectiveDraft(editor.draft)))
    } catch (cause) {
      setRoutePreview(null)
      setRoutePreviewError(formatApiError(cause, t))
    } finally {
      setRoutePreviewBusy(false)
    }
  }

  function allowedFromDraft(draft: TrackEditorDraft): '*' | string[] {
    if (draft.workflowAny) return '*'
    return [...new Set(draft.workflowAllowed.split(',').map((value) => value.trim()).filter(Boolean))]
  }

  async function readMutationError(response: Response): Promise<string> {
    let body: { error?: string; references?: string[]; blockers?: string[] } = {}
    try { body = await response.json() as typeof body } catch { /* no JSON */ }
    const details = lang === 'zh'
      ? [...(Array.isArray(body.references) ? body.references : []), ...(Array.isArray(body.blockers) ? body.blockers : [])]
      : []
    const summary = lang === 'zh' && body.error
      ? body.error
      : t('common.request_http_error', { status: response.status })
    return [summary, ...details].join(' · ')
  }

  async function saveTrack(): Promise<void> {
    if (!editor || busy) return
    const draft = editor.draft
    const allowed = allowedFromDraft(draft)
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(draft.id) || draft.label.trim() === '' || draft.workflowDefault.trim() === '') {
      setError(t('workbench.track_fields_invalid'))
      return
    }
    if (editor.mode === 'create' && state.tracks.some((track) => track.id === draft.id)) {
      setError(t('workbench.track_id_duplicate'))
      return
    }
    if (Array.isArray(allowed) && (allowed.length === 0 || !allowed.includes(draft.workflowDefault.trim()))) {
      setError(t('workbench.track_allowed_invalid'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = editor.mode === 'create'
        ? await postTrackDefinition({
            root: state.root,
            revision: state.revision,
            track: {
              id: draft.id,
              label: draft.label.trim(),
              builtin: false,
              workflow: { default: draft.workflowDefault.trim(), allowed },
              policyProfile: clonePolicy(draft.policyProfile),
            },
          })
        : await patchTrackDefinition(state.root, state.revision, draft.id, {
            label: draft.label.trim(),
            workflowDefault: draft.workflowDefault.trim(),
            workflowAllowed: allowed,
            ...(editor.original?.builtin ? {} : { policyProfile: clonePolicy(draft.policyProfile) }),
          })
      if (!response.ok) {
        setError(await readMutationError(response))
        return
      }
      await state.reloadConfig()
      setEditor(null)
    } catch (mutationError) {
      setError(formatApiError(mutationError, t))
    } finally {
      setBusy(false)
    }
  }

  async function removeTrack(): Promise<void> {
    if (!editor?.original || editor.original.builtin || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await deleteTrackDefinition(state.root, state.revision, editor.original.id)
      if (!response.ok) {
        setError(await readMutationError(response))
        return
      }
      await state.reloadConfig()
      setEditor(null)
    } catch (mutationError) {
      setError(formatApiError(mutationError, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-md border border-border bg-card px-3 py-[6px] text-[12.5px] font-bold text-text-2 transition-colors hover:bg-fill"
        data-testid="wb-track-settings-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('workbench.track_settings_toggle')}
      </button>
      {open && (
        <Dialog
          title={t('workbench.track_settings_dialog')}
          onClose={() => setOpen(false)}
          testid="wb-track-settings-panel"
          closeLabel={t('workbench.track_settings_close')}
          panelClassName="w-[min(920px,calc(100vw-32px))]"
          variant="workspace"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-3">{t('workbench.track_settings_description')}</p>
            <button type="button" className={ADD_CLS} data-testid="wb-track-create" onClick={openCreate}>{t('workbench.track_settings_create')}</button>
          </div>
          {editor && (
            <form
              className="mb-3 rounded-xl border border-accent-b bg-accent-t/35 p-3"
              data-testid="wb-track-editor"
              onSubmit={(event) => { event.preventDefault(); void saveTrack() }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <b className="text-[13px] text-text">{editor.mode === 'create' ? t('workbench.track_create_title') : t('workbench.track_edit_title')}</b>
                <button type="button" className="text-xs text-text-3" onClick={() => setEditor(null)}>{t('workbench.track_cancel')}</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-[11.5px] font-bold text-text-2">
                  {t('workbench.track_id')}
                  <input aria-label="Track ID" className={fieldClass} value={editor.draft.id} disabled={editor.mode === 'edit'} onChange={(event) => updateDraft({ id: event.target.value })} />
                </label>
                <label className="grid gap-1 text-[11.5px] font-bold text-text-2">
                  {t('workbench.track_label')}
                  <input aria-label={t('workbench.track_label')} className={fieldClass} value={editor.draft.label} onChange={(event) => updateDraft({ label: event.target.value })} />
                </label>
                <label className="grid gap-1 text-[11.5px] font-bold text-text-2">
                  {t('workbench.track_workflow_default')}
                  <input aria-label={t('workbench.track_workflow_default')} className={fieldClass} value={editor.draft.workflowDefault} onChange={(event) => updateDraft({ workflowDefault: event.target.value })} />
                </label>
                <label className="flex items-center gap-2 self-end rounded-md border border-border px-2 py-1.5 text-[11.5px] font-bold text-text-2">
                  <input type="checkbox" checked={editor.draft.workflowAny} onChange={(event) => updateDraft({ workflowAny: event.target.checked })} />
                  {t('workbench.track_workflow_any')}
                </label>
                {!editor.draft.workflowAny && (
                  <label className="grid gap-1 text-[11.5px] font-bold text-text-2 sm:col-span-2">
                    {t('workbench.track_workflow_allowed')}
                    <input className={fieldClass} value={editor.draft.workflowAllowed} onChange={(event) => updateDraft({ workflowAllowed: event.target.value })} />
                  </label>
                )}
                {!editor.original?.builtin && (
                  <label className="grid gap-1 text-[11.5px] font-bold text-text-2 sm:col-span-2">
                    {t('workbench.track_policy_template')}
                    <select
                      aria-label={t('workbench.track_policy_template')}
                      className={fieldClass}
                      defaultValue=""
                      onChange={(event) => {
                        const template = state.tracks.find((track) => track.id === event.target.value && track.builtin)
                        if (template) updateDraft({ policyProfile: clonePolicy(template.policyProfile) })
                      }}
                    >
                      <option value="">{t('workbench.track_policy_keep')}</option>
                      {state.tracks.filter((track) => track.builtin).map((track) => <option key={track.id} value={track.id}>{track.id}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {!editor.original?.builtin && (
                <details className="mt-3 rounded-md border border-border bg-card/60 p-2">
                  <summary className="cursor-pointer text-xs font-bold text-text-2">{t('workbench.track_policy_details')}</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-[11px] text-text-2">{t('workbench.track_review_seed')}
                      <select aria-label="reviewSeed" className={fieldClass} value={editor.draft.policyProfile.reviewSeed} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, reviewSeed: event.target.value as 'pending' | 'skipped' } })}>
                        <option value="pending">{t('workbench.track_review_pending')}</option><option value="skipped">{t('workbench.track_review_skipped')}</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-[11px] text-text-2">{t('workbench.track_coverage')}
                      <select aria-label="coverageProfile" className={fieldClass} value={editor.draft.policyProfile.coverageProfile} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, coverageProfile: event.target.value as 'none' | 'pm' | 'frontend' | 'backend' } })}>
                        <option value="none">{t('workbench.track_coverage_none')}</option><option value="pm">{t('workbench.track_coverage_pm')}</option><option value="frontend">{t('workbench.track_coverage_frontend')}</option><option value="backend">{t('workbench.track_coverage_backend')}</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-text-2"><input aria-label="automationEligible" type="checkbox" checked={editor.draft.policyProfile.automationEligible} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, automationEligible: event.target.checked } })} />{t('workbench.track_afk_manual')}</label>
                    <label className="flex items-center gap-2 text-[11px] text-text-2"><input aria-label="autoEnqueueOnSpecComplete" type="checkbox" checked={editor.draft.policyProfile.autoEnqueueOnSpecComplete ?? false} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, autoEnqueueOnSpecComplete: event.target.checked } })} />{t('workbench.track_afk_auto')}</label>
                    <label className="flex items-center gap-2 text-[11px] text-text-2"><input aria-label="skills.matrix" type="checkbox" checked={editor.draft.policyProfile.skills.matrix} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, skills: { ...editor.draft.policyProfile.skills, matrix: event.target.checked } } })} />{t('workbench.track_skills_matrix')}</label>
                    <label className="grid gap-1 text-[11px] text-text-2">{t('workbench.track_skills_profile')}<input aria-label="skills.profile" className={fieldClass} value={editor.draft.policyProfile.skills.profile} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, skills: { ...editor.draft.policyProfile.skills, profile: event.target.value } } })} /></label>
                    <label className="flex items-center gap-2 text-[11px] text-text-2"><input aria-label="routing.enabled" type="checkbox" checked={editor.draft.policyProfile.routing.enabled} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, routing: event.target.checked ? { enabled: true, pattern: '', priority: 0 } : { enabled: false } } })} />{t('workbench.track_routing_enabled')}</label>
                    {editor.draft.policyProfile.routing.enabled && <>
                      <label className="grid gap-1 text-[11px] text-text-2">{t('workbench.track_routing_pattern')}<input aria-label="routing.pattern" className={fieldClass} value={editor.draft.policyProfile.routing.pattern} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, routing: { ...editor.draft.policyProfile.routing as { enabled: true; pattern: string; priority: number }, pattern: event.target.value } } })} /></label>
                      <label className="grid gap-1 text-[11px] text-text-2">{t('workbench.track_routing_exclude')}<input aria-label="routing.excludePattern" className={fieldClass} value={editor.draft.policyProfile.routing.excludePattern ?? ''} onChange={(event) => {
                        const routing = editor.draft.policyProfile.routing as { enabled: true; pattern: string; excludePattern?: string; priority: number }
                        const excludePattern = event.target.value
                        updateDraft({
                          policyProfile: {
                            ...editor.draft.policyProfile,
                            routing: excludePattern === ''
                              ? { enabled: true, pattern: routing.pattern, priority: routing.priority }
                              : { ...routing, excludePattern },
                          },
                        })
                      }} /></label>
                      <label className="grid gap-1 text-[11px] text-text-2">{t('workbench.track_routing_priority')}<input aria-label="routing.priority" type="number" min="0" className={fieldClass} value={editor.draft.policyProfile.routing.priority} onChange={(event) => updateDraft({ policyProfile: { ...editor.draft.policyProfile, routing: { ...editor.draft.policyProfile.routing as { enabled: true; pattern: string; priority: number }, priority: Number(event.target.value) } } })} /></label>
                    </>}
                  </div>
                </details>
              )}
              {!editor.original?.builtin && (
                <section className="mt-3 rounded-md border border-border bg-card/70 p-2" data-testid="wb-track-route-impact">
                  <div className="mb-2">
                    <b className="text-xs text-text">{t('workbench.track_route_preview_title')}</b>
                    <p className="mt-0.5 text-[11px] text-text-3">{t('workbench.track_route_preview_note')}</p>
                  </div>
                  <div className="flex gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">{t('workbench.track_route_prompt')}</span>
                      <input
                        className={`${fieldClass} w-full`}
                        data-testid="wb-track-route-prompt"
                        value={routePrompt}
                        placeholder={t('workbench.track_route_prompt_placeholder')}
                        onChange={(event) => { setRoutePrompt(event.target.value); setRoutePreview(null) }}
                      />
                    </label>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-bold text-text-2 disabled:opacity-50"
                      data-testid="wb-track-route-preview"
                      disabled={routePreviewBusy || routePrompt.trim() === ''}
                      onClick={() => void previewRoute()}
                    >
                      {routePreviewBusy ? t('workbench.track_route_previewing') : t('workbench.track_route_preview')}
                    </button>
                  </div>
                  {routePreviewError !== '' && <p className="mt-2 text-xs text-red" role="alert">{routePreviewError}</p>}
                  {routePreview && (
                    <div className="mt-2 text-[11.5px] text-text-2" data-testid="wb-track-route-result">
                      <p className="font-semibold text-text">
                        {routePreview.suppressed_reason
                          ? t('workbench.track_route_suppressed', { reason: routePreview.suppressed_reason })
                          : routePreview.winner
                            ? t('workbench.track_route_winner', { label: routePreview.winner.track.label, score: routePreview.winner.score })
                            : t('workbench.track_route_no_winner')}
                      </p>
                      <ul className="mt-1 grid list-none gap-1 p-0 sm:grid-cols-2">
                        {routePreview.candidates.map((candidate) => (
                          <li key={candidate.track.id} className="flex justify-between gap-2 rounded bg-fill px-2 py-1">
                            <span>{candidate.track.label}</span>
                            <code>{t('workbench.track_route_score', { score: candidate.score, priority: candidate.priority })}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}
              {error && <p className="mt-3 rounded-md border border-red-b bg-red-t p-2 text-xs text-red-d" role="alert" data-testid="wb-track-editor-error">{error}</p>}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {editor.mode === 'edit' && !editor.original?.builtin && (
                  deleteConfirm
                    ? <button type="button" className="rounded-md border border-red-b px-3 py-1.5 text-xs font-bold text-red-d" data-testid="wb-track-delete-confirm" onClick={() => void removeTrack()} disabled={busy}>{t('workbench.track_delete_confirm')}</button>
                    : <button type="button" className="mr-auto rounded-md border border-red-b px-3 py-1.5 text-xs font-bold text-red-d" data-testid="wb-track-editor-delete" onClick={() => setDeleteConfirm(true)}>{t('workbench.track_delete')}</button>
                )}
                <button type="submit" className="rounded-md bg-btn-bg px-4 py-1.5 text-xs font-bold text-btn-fg disabled:opacity-50" data-testid="wb-track-editor-save" disabled={busy}>{busy ? t('workbench.track_saving') : t('workbench.track_save')}</button>
              </div>
            </form>
          )}
          <TrackSettingsList state={state} onEdit={openEdit} />
        </Dialog>
      )}
    </div>
  )
}
