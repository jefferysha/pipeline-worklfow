import { GripVertical } from 'lucide-react'
import { Icon } from '../shared/Icon'
import { useT } from '../i18n'
import type { GateHookInfo } from './StepperRail'
import {
  BADGE_BASE,
  BADGE_LOCK,
  GRIP_LANE,
  INPUT_BASE,
  LANE_RM,
  SWITCH,
  type BoardLane,
} from './orchestrationBoardModel'

export interface LaneNameDraft {
  id: string
  draft: string
}

export function OrchestrationLaneHeader({
  lane,
  index,
  readonly,
  canDrag,
  canEdit,
  canRemove,
  nameEdit,
  gateOpen,
  gateHooks,
  onNameEdit,
  onNameCommit,
  onGateToggle,
  onGateHover,
  onGatePin,
  onRemove,
}: {
  lane: BoardLane
  index: number
  readonly: boolean
  canDrag: boolean
  canEdit: boolean
  canRemove: boolean
  nameEdit: LaneNameDraft | null
  gateOpen: boolean
  gateHooks: readonly GateHookInfo[]
  onNameEdit: (draft: LaneNameDraft | null) => void
  onNameCommit: (lane: BoardLane, cancel: boolean) => void
  onGateToggle: (lane: BoardLane) => void
  onGateHover: (id: string | null) => void
  onGatePin: (id: string) => void
  onRemove: (id: string) => void
}): JSX.Element {
  const { t } = useT()
  const editing = nameEdit?.id === lane.id
  const showGateSwitch = canEdit
  const hasBadges = lane.gate !== null || readonly || showGateSwitch
  const gateLabel = lane.gate === 'confirm' ? '需要确认' : '离开前复核'
  return (
    <div className="relative flex flex-col items-start gap-[9px] border-b border-border px-3.5 pt-[13px] pb-3">
      {lane.running && <span className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-t-2xl" aria-hidden="true"><i className="absolute top-2 left-2 size-1.5 rounded-full bg-green" data-anim="wb-gloss" data-testid={`wb-flow-gloss-${lane.id}`} /></span>}
      <div className="relative z-[2] flex w-full items-center gap-[9px]">
        {canDrag && <span className={GRIP_LANE} data-testid={`wb-lane-grip-${lane.id}`} draggable aria-hidden="true" title={t('workbench.board_drag_lane')}><GripVertical className="size-4" aria-hidden="true" /></span>}
        <button type="button" className="flex flex-none cursor-pointer items-center gap-[9px] rounded-lg text-left" aria-label={t('workbench.board_lane_select', { name: lane.name })}>
          <span className="grid h-[27px] w-[27px] flex-none place-items-center rounded-full border border-green-b bg-green-t font-mono text-[14px] font-extrabold text-green-d group-data-[locked]:border-border-2 group-data-[locked]:bg-fill group-data-[locked]:text-text-3">{index + 1}</span>
          {!canEdit && <span className="flex-none font-mono text-[16.5px] font-[750] tracking-[-0.01em] whitespace-nowrap text-text">{lane.name}</span>}
        </button>
        {canEdit && (editing ? (
          <input
            className={`${INPUT_BASE} px-2 py-0.5 font-mono text-[16.5px] font-[750] tracking-[-0.01em]`}
            data-testid={`wb-lane-name-input-${lane.id}`}
            aria-label={`${t('workbench.board_ed_name')} · ${lane.name}`}
            value={nameEdit?.draft ?? ''}
            size={Math.max((nameEdit?.draft.length ?? 0) + 1, 8)}
            autoFocus
            onChange={(event) => onNameEdit({ id: lane.id, draft: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onNameCommit(lane, false)
              } else if (event.key === 'Escape') onNameCommit(lane, true)
            }}
            onBlur={() => onNameCommit(lane, false)}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <button type="button" className="-mx-1 flex-none cursor-pointer rounded-md border border-transparent px-1 font-mono text-[16.5px] font-[750] tracking-[-0.01em] whitespace-nowrap text-text transition-colors hover:border-border-2 hover:bg-card" data-testid={`wb-lane-name-${lane.id}`} aria-label={`${t('workbench.board_ed_name')} · ${lane.name}`} onClick={() => onNameEdit({ id: lane.id, draft: lane.name })}>{lane.name}</button>
        ))}
        {canRemove && <><span className="min-w-2 flex-1" /><button type="button" className={LANE_RM} data-testid={`wb-lane-rm-${lane.id}`} aria-label={`${t('workbench.board_rm_lane')} · ${lane.name}`} title={`${t('workbench.board_rm_lane')} · ${lane.name}`} onClick={(event) => { event.stopPropagation(); onRemove(lane.id) }}><Icon name="x" size={13} /></button></>}
      </div>
      {hasBadges && (
        <div className="relative z-[2] flex flex-wrap items-center gap-1.5">
          {showGateSwitch && <span className="inline-flex flex-none items-center gap-1.5"><button type="button" className={SWITCH} role="switch" aria-checked={lane.gate !== null} aria-label={`${t('workbench.board_ed_gate')} · ${lane.name}`} data-testid={`wb-lane-gate-sw-${lane.id}`} onClick={(event) => { event.stopPropagation(); onGateToggle(lane) }} />{lane.gate === null && <span className="text-[12.5px] font-bold whitespace-nowrap text-text-3">{t('workbench.board_gate_off')}</span>}</span>}
          {lane.gate !== null && (
            <span className="relative inline-flex">
              <button type="button" className={`${BADGE_BASE} border-red-b bg-red-t text-red-d cursor-pointer hover:bg-red-b focus-visible:bg-red-b`} data-testid={`wb-flow-gate-${lane.id}`} aria-expanded={gateOpen} title={t('workbench.gate_pop_title')} onMouseEnter={() => onGateHover(lane.id)} onMouseLeave={() => onGateHover(null)} onFocus={() => onGateHover(lane.id)} onBlur={() => onGateHover(null)} onClick={(event) => { event.stopPropagation(); onGatePin(lane.id) }}><Icon name="gate" size={11} />{gateLabel}</button>
              {gateOpen && <div className="absolute top-[calc(100%+6px)] left-0 z-[6] w-60 rounded-[11px] border border-border bg-card px-3 py-2.5 text-left shadow-md" data-testid={`wb-flow-gatepop-${lane.id}`} role="tooltip"><p className="mb-1.5 text-[12px] font-bold text-text-2">{t('workbench.gate_pop_title')}</p><p className="mb-2 text-[12px] leading-[1.55] text-text-3">离开本阶段前，系统会执行下面的内置检查；任一检查未通过，流程就停在这里等待处理。</p><div className="space-y-[5px]">{gateHooks.map((hook) => <p key={hook.id} className="text-[12px] leading-[1.55] text-text-2"><b className="block font-[650] text-text">{hook.name}</b>{hook.desc}</p>)}</div></div>}
            </span>
          )}
          {readonly && <span className={`${BADGE_BASE} ${BADGE_LOCK}`} data-testid={`wb-lane-lock-${lane.id}`}><Icon name="gate" size={11} />{t('workbench.board_lane_locked')}</span>}
        </div>
      )}
    </div>
  )
}
