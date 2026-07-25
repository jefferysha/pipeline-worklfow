import { LockKeyhole } from 'lucide-react'
import type { WbTrackDefinition } from '../api/client'
import { useT } from '../i18n'
import type { MandatoryState } from './mandatoryState'
import { trackDisplayName } from './trackPresentation'

export function TrackSettingsList({
  state,
  onEdit,
}: {
  state: MandatoryState
  onEdit: (track: WbTrackDefinition) => void
}): JSX.Element {
  const { t } = useT()
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
              <b className="text-[15px] text-text">{trackDisplayName(track)}</b>
              {track.builtin && <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] text-text-3">系统轨道</span>}
              <button
                type="button"
                className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] font-bold text-text-3 disabled:cursor-not-allowed disabled:opacity-55"
                data-testid={`wb-track-edit-${track.id}`}
                onClick={() => onEdit(track)}
              >
                {t('workbench.track_edit')}
              </button>
            </div>
            <dl className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-2 border-t border-border pt-3">
              <dt className="text-text-3">适用流程</dt>
              <dd className="m-0 font-semibold text-text">{track.workflow.default}{Array.isArray(track.workflow.allowed) ? ` · ${track.workflow.allowed.join('、')}` : ' · 全部'}</dd>
              <dt className="text-text-3">自动分配</dt>
              <dd className="m-0 font-semibold text-text">{routing.enabled ? '已启用' : '未启用'}</dd>
              <dt className="text-text-3">AFK 接管</dt>
              <dd className="m-0 font-semibold text-text">{track.policyProfile.autoEnqueueOnSpecComplete ? 'Spec 完成后自动排队' : '仅按需执行'}</dd>
              <dt className="text-text-3">默认技能</dt>
              <dd className="m-0 font-semibold text-text">
                {track.policyProfile.skills.matrix
                  ? profile === track.id ? '使用本轨道配置' : `沿用“${trackDisplayName(inherited)}”轨道`
                  : '不注入默认 Skill'}
              </dd>
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
