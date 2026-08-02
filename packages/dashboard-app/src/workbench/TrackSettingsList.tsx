import { LockKeyhole } from 'lucide-react'
import type { WbTrackDefinition } from '../api/client'
import { useT } from '../i18n'
import type { MandatoryState } from './mandatoryState'
import { trackDisplayName } from './trackPresentation'

export function TrackSettingsList({
  state,
  onEdit,
  disabled = false,
}: {
  state: MandatoryState
  onEdit: (track: WbTrackDefinition) => void
  disabled?: boolean
}): JSX.Element {
  const { lang, t } = useT()
  return (
    <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
      {state.tracks.map((track) => {
        const routing = track.policyProfile.routing
        const profile = track.policyProfile.skills.profile
        const inherited = state.tracks.find((candidate) => candidate.id === profile) ?? track
        return (
          <li
            key={track.id}
            className="rounded-2xl border border-border bg-bg p-4 text-[12.5px] text-text-2 shadow-sm transition hover:border-border-2 hover:shadow-md"
            data-testid={`wb-track-setting-${track.id}`}
          >
            <div className="mb-2 flex items-center gap-2">
              {track.builtin && <LockKeyhole className="h-3.5 w-3.5 text-text-3" aria-label={t('workbench.track_builtin_lock')} />}
              <b className="text-[15px] text-text">{trackDisplayName(track, lang)}</b>
              {track.builtin && <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] text-text-3">{t('workbench.track_list_system')}</span>}
              <button
                type="button"
                className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-bold text-text-3 disabled:cursor-not-allowed disabled:opacity-55"
                data-testid={`wb-track-edit-${track.id}`}
                disabled={disabled}
                onClick={() => onEdit(track)}
              >
                {t('workbench.track_edit')}
              </button>
            </div>
            <dl className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-2 border-t border-border pt-3">
              <dt className="text-text-3">{t('workbench.track_list_workflows')}</dt>
              <dd className="m-0 font-semibold text-text">{track.workflow.default}{Array.isArray(track.workflow.allowed) ? ` · ${track.workflow.allowed.join(', ')}` : ` · ${t('workbench.track_list_all')}`}</dd>
              <dt className="text-text-3">{t('workbench.track_list_routing')}</dt>
              <dd className="m-0 font-semibold text-text">{t(routing.enabled ? 'workbench.track_list_enabled' : 'workbench.track_list_disabled')}</dd>
              <dt className="text-text-3">{t('workbench.track_list_afk')}</dt>
              <dd className="m-0 font-semibold text-text">{t(track.policyProfile.autoEnqueueOnSpecComplete ? 'workbench.track_list_afk_auto' : 'workbench.track_list_afk_manual')}</dd>
              <dt className="text-text-3">{t('workbench.track_list_skills')}</dt>
              <dd className="m-0 font-semibold text-text">
                {track.policyProfile.skills.matrix
                  ? profile === track.id ? t('workbench.track_list_skills_self') : t('workbench.track_list_skills_inherit', { track: trackDisplayName(inherited, lang) })
                  : t('workbench.track_list_skills_none')}
              </dd>
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
