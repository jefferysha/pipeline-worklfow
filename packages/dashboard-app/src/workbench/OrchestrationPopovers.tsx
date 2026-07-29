import type { WbSkillEntry } from '../api/client'
import { useT } from '../i18n'
import { DEP_OPT, SK_POP, SK_UNINST, splitName, type BoardLane } from './orchestrationBoardModel'

export function DependencyPopover({ lane, skillId, candidates, previous, onChoose, onClose }: {
  lane: BoardLane
  skillId: string
  candidates: string[]
  previous: string | null
  onChoose: (dependency: string | null) => void
  onClose: () => void
}): JSX.Element {
  const { t } = useT()
  return (
    <div className="absolute top-[calc(100%+6px)] left-0 z-[7] max-h-[300px] w-max min-w-[260px] overflow-y-auto rounded-[11px] border border-border bg-card p-1.5 text-left shadow-md" data-testid={`wb-lane-dep-pop-${lane.id}-${skillId}`} role="group" aria-label={`${t('workbench.board_dep_label')} · ${skillId}`}>
      {candidates.map((candidate) => {
        const name = splitName(candidate)
        return <button key={candidate} type="button" className={DEP_OPT} data-testid={`wb-lane-dep-opt-${lane.id}-${skillId}-${candidate}`} onClick={(event) => { event.stopPropagation(); onChoose(candidate); onClose() }}>
          <span className="font-mono whitespace-nowrap">{name.ns !== '' && <span className="text-text-3">{name.ns}</span>}{name.base}</span>
        </button>
      })}
      {previous !== null && <button type="button" className={`${DEP_OPT} text-red-d`} data-testid={`wb-lane-dep-clear-${lane.id}-${skillId}`} onClick={(event) => { event.stopPropagation(); onChoose(null); onClose() }}>{t('workbench.board_dep_clear')}</button>}
    </div>
  )
}

export function UninstalledSkillBadge({ id, testId, registry }: {
  id: string
  testId: string
  registry?: WbSkillEntry[] | null
}): JSX.Element | null {
  const { t } = useT()
  const entry = registry?.find((candidate) => candidate.name === id)
  if (entry?.installed !== false) return null
  return <span className={SK_UNINST} data-testid={testId} title={entry.installCmd ?? t('workbench.sk_uninstalled_hint_user')}>{t('workbench.sk_uninstalled')}</span>
}

export function SkillCandidatePopover({ lane, candidates, registry, onChoose }: {
  lane: BoardLane
  candidates: string[]
  registry?: WbSkillEntry[] | null
  onChoose: (skillId: string) => void
}): JSX.Element {
  const { t } = useT()
  return (
    <div className={SK_POP} data-testid={`wb-lane-sk-pop-${lane.id}`} role="group" aria-label={`${t('workbench.board_sk_add')} · ${lane.name}`}>
      {candidates.length === 0 ? <p className="px-2 py-1.5 text-[12.5px] text-text-3" role="status" aria-live="polite">{t('workbench.board_skills_empty')}</p> : candidates.map((candidate) => {
        const name = splitName(candidate)
        return <button key={candidate} type="button" className={DEP_OPT} data-testid={`wb-lane-sk-opt-${lane.id}-${candidate}`} onClick={(event) => { event.stopPropagation(); onChoose(candidate) }}>
          <span className="font-mono whitespace-nowrap">{name.ns !== '' && <span className="text-text-3">{name.ns}</span>}{name.base}</span>
          <UninstalledSkillBadge id={candidate} testId={`wb-lane-sk-opt-uninst-${lane.id}-${candidate}`} registry={registry} />
        </button>
      })}
    </div>
  )
}
