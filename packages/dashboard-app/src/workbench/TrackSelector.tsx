import type { KeyboardEvent } from 'react'
import { CircleHelp } from 'lucide-react'
import { useT } from '../i18n'
import type { MandatoryState } from './mandatoryState'
import { TrackSettings } from './TrackSettings'
import { trackDisplayName } from './trackPresentation'

const NOTE_CLS = 'text-[12.5px] leading-[1.55] text-text-3'

export function TrackSelector({ state }: { state: MandatoryState }): JSX.Element {
  const { t } = useT()

  function onTrackKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const last = state.matrixTracks.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = last
    if (next === null || next < 0) return
    event.preventDefault()
    const candidate = state.matrixTracks[next]
    if (!candidate) return
    state.setTrack(candidate.id)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons?.[next]?.focus()
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold text-text-3">
        运行轨道
        <span className="grid h-6 w-6 place-items-center rounded-full text-text-3" title="轨道是项目级运行配置：为任务选择角色、路由与默认 Skill，不改变 Workflow 的阶段。所有 Workflow 都可以使用同一组轨道。" aria-label="运行轨道说明">
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </span>
      {state.table === null ? (
        <span className={NOTE_CLS} role="status" data-testid="wb-track-loading">{t('workbench.track_loading')}</span>
      ) : state.configError !== null ? (
        <span className="text-[12.5px] text-red" role="alert" data-testid="wb-track-load-error">
          {t('workbench.track_load_error')}
        </span>
      ) : state.matrixTracks.length === 0 ? (
        <span className={NOTE_CLS} role="status" data-testid="wb-track-empty">{t('workbench.track_empty')}</span>
      ) : (
        <div
          className="inline-flex flex-wrap gap-1 rounded-xl bg-fill p-1 shadow-inner"
          role="radiogroup"
          aria-label={t('workbench.mand_track_group')}
          data-testid="wb-track-tabs"
        >
          {state.matrixTracks.map((candidate, index) => {
            const selected = candidate.id === state.track
            const profile = candidate.policyProfile.skills.profile
            return (
              <button
                key={candidate.id}
                type="button"
                role="radio"
                className="cursor-pointer rounded-lg border-0 bg-transparent px-4 py-2 text-[12.5px] font-bold text-text-3 transition-all not-aria-checked:hover:text-text-2 aria-checked:bg-card aria-checked:text-accent-d aria-checked:shadow-sm"
                aria-checked={selected}
                title={`${candidate.label}${profile !== candidate.id ? `；沿用 ${state.tracks.find((track) => track.id === profile)?.label ?? profile} 轨道 Skill` : ''}`}
                tabIndex={selected ? 0 : -1}
                data-testid={`wb-track-${candidate.id}`}
                onClick={() => state.setTrack(candidate.id)}
                onKeyDown={(event) => onTrackKeyDown(event, index)}
              >
                {candidate.builtin && <span className="sr-only">系统轨道 </span>}
                {trackDisplayName(candidate)}
                {profile !== candidate.id && <span className="sr-only">，沿用 {trackDisplayName(state.tracks.find((track) => track.id === profile) ?? candidate)} 轨道技能</span>}
              </button>
            )
          })}
        </div>
      )}
      {state.table !== null && state.tracks.length > 0 ? <TrackSettings state={state} /> : null}
    </div>
  )
}
