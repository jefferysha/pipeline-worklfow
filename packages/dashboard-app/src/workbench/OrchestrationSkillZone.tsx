import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Diamond, GripVertical, X } from 'lucide-react'
import type { WbSkillEntry } from '../api/client'
import { useT } from '../i18n'
import {
  DEP_ADD, DEP_CHIP, GRIP_SK, SK_ADD, SK_NOREG, SK_RM, ZONE_TITLE,
  isAfterY, primeDrag,
  splitName,
  type BoardLane,
  type DragPayload,
  type DropHint,
} from './orchestrationBoardModel'

interface DependencyPopoverState {
  stage: string
  skill: string
  prevDep: string | null
}

export function OrchestrationSkillZone({
  lane, skills, readonly, canDragSkill, canDep, canRemoveSkill, canAddSkill,
  regReady, intoDrop, drag, drop, depPop, skPop, dupWarn, skillRegistry,
  onBeginDrag, onEndDrag, onDropHint, onSkillMove, onDependencyPopover,
  onSkillPopover, onSkillRemove, onOpenSkillEditor, renderDependencyPopover,
  renderSkillPopover, renderUninstalledBadge,
}: {
  lane: BoardLane
  skills: string[]
  readonly: boolean
  canDragSkill: boolean
  canDep: boolean
  canRemoveSkill: boolean
  canAddSkill: boolean
  regReady: boolean
  intoDrop: boolean
  drag: DragPayload | null
  drop: DropHint | null
  depPop: DependencyPopoverState | null
  skPop: string | null
  dupWarn: string | null
  skillRegistry?: WbSkillEntry[] | null
  onBeginDrag: (payload: DragPayload) => void
  onEndDrag: () => void
  onDropHint: (hint: DropHint | null) => void
  onSkillMove: (from: { stage: string; skill: string }, lane: BoardLane, ref: string | null, after: boolean) => void
  onDependencyPopover: (state: DependencyPopoverState | null) => void
  onSkillPopover: Dispatch<SetStateAction<string | null>>
  onSkillRemove?: (stageId: string, skillId: string) => void
  onOpenSkillEditor?: (stageId: string) => void
  renderDependencyPopover: (lane: BoardLane, skillId: string, candidates: string[], previous: string | null) => ReactNode
  renderSkillPopover: (lane: BoardLane, candidates: string[]) => ReactNode
  renderUninstalledBadge: (id: string, testId: string) => ReactNode
}): JSX.Element {
  const { t } = useT()
  const beginDrag = onBeginDrag
  const endDrag = onEndDrag
  const setDrop = onDropHint
  const commitSkillMove = onSkillMove
  const setDepPop = onDependencyPopover
  const setSkPop = onSkillPopover
  const uninstBadge = renderUninstalledBadge
  const depPopover = renderDependencyPopover
  const skillPopover = renderSkillPopover
  return (
                          <div data-testid={`wb-lane-skills-${lane.id}`}>
                            <div className="mx-0.5 mb-2 flex items-center gap-2">
                              <span className={`${ZONE_TITLE} inline-flex items-center gap-1.5`}><Diamond className="size-3" aria-hidden="true" />{t('workbench.board_zone_skills')}</span>
                            </div>
                            <div
                              className="flex min-h-2 flex-col gap-2.5"
                              data-testid={`wb-lane-sklist-${lane.id}`}
                              data-drop={intoDrop ? 'into' : undefined}
                              onDragOver={
                                canDragSkill
                                  ? (e) => {
                                      if (drag === null || drag.kind !== 'skill') return
                                      e.preventDefault()
                                      setDrop({ kind: 'into', stage: lane.id })
                                    }
                                  : undefined
                              }
                              onDragLeave={
                                canDragSkill
                                  ? (e) => {
                                      if (e.target === e.currentTarget) setDrop(null)
                                    }
                                  : undefined
                              }
                              onDrop={
                                canDragSkill
                                  ? (e) => {
                                      if (drag === null || drag.kind !== 'skill') return
                                      e.preventDefault()
                                      commitSkillMove(drag, lane, null, true)
                                    }
                                  : undefined
                              }
                            >
                              {skills.length > 0 ? (
                                skills.map((skillId, si) => {
                                  const { ns, base } = splitName(skillId)
                                  const skDragging = drag !== null && drag.kind === 'skill' && drag.stage === lane.id && drag.skill === skillId
                                  const skDrop =
                                    drop !== null && drop.kind === 'skill' && drop.stage === lane.id && drop.skill === skillId
                                      ? drop.after
                                        ? 'after'
                                        : 'before'
                                      : undefined
                                  const deps = lane.skillDeps?.[skillId] ?? []
                                  const candidates = skills.filter((s) => s !== skillId && !deps.includes(s))
                                  const showDepAdd = canDep && candidates.length > 0
                                  const showDepRow = !readonly && (deps.length > 0 || showDepAdd)
                                  const addOpen =
                                    depPop !== null && depPop.stage === lane.id && depPop.skill === skillId && depPop.prevDep === null
                                  return (
                                    <div
                                      key={skillId}
                                      className="group/sk rounded-[11px] border border-border bg-card px-2.5 py-2.5 shadow-sm transition-[border-color,box-shadow,opacity] duration-150 hover:border-purple-b group-data-[locked]:hover:border-border data-[dragging]:opacity-40"
                                      data-testid={`wb-lane-sk-${lane.id}-${skillId}`}
                                      data-dragging={skDragging ? '' : undefined}
                                      data-drop={skDrop}
                                      onDragStart={
                                        canDragSkill
                                          ? (e) => {
                                              e.stopPropagation()
                                              beginDrag({ kind: 'skill', stage: lane.id, skill: skillId })
                                              primeDrag(e, skillId, e.currentTarget)
                                            }
                                          : undefined
                                      }
                                      onDragEnd={canDragSkill ? endDrag : undefined}
                                      onDragOver={
                                        canDragSkill
                                          ? (e) => {
                                              if (drag === null || drag.kind !== 'skill') return
                                              e.stopPropagation()
                                              if (drag.stage === lane.id && drag.skill === skillId) {
                                                setDrop(null)
                                                return
                                              }
                                              e.preventDefault()
                                              setDrop({ kind: 'skill', stage: lane.id, skill: skillId, after: isAfterY(e, e.currentTarget) })
                                            }
                                          : undefined
                                      }
                                      onDrop={
                                        canDragSkill
                                          ? (e) => {
                                              if (drag === null || drag.kind !== 'skill') return
                                              e.stopPropagation()
                                              if (drag.stage === lane.id && drag.skill === skillId) {
                                                endDrag()
                                                return
                                              }
                                              e.preventDefault()
                                              commitSkillMove(drag, lane, skillId, isAfterY(e, e.currentTarget))
                                            }
                                          : undefined
                                      }
                                    >
                                      <div className="flex items-center gap-2">
                                        {canDragSkill && (
                                          <span
                                            className={GRIP_SK}
                                            data-testid={`wb-lane-sk-grip-${lane.id}-${skillId}`}
                                            draggable
                                            aria-hidden="true"
                                            title={t('workbench.board_drag_skill')}
                                          >
                                            <GripVertical className="size-4" aria-hidden="true" />
                                          </span>
                                        )}
                                        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full border border-purple-b bg-purple-t font-mono text-[12.5px] font-extrabold text-purple-d">
                                          {si + 1}
                                        </span>
                                        <span className="flex-none font-mono text-[14.5px] font-[650] whitespace-nowrap text-text">
                                          {ns !== '' && <span className="font-normal text-text-3">{ns}</span>}
                                          {base}
                                        </span>
                                        {uninstBadge(skillId, `wb-lane-sk-uninst-${lane.id}-${skillId}`)}
                                        {canRemoveSkill && (
                                          <>
                                            <span className="min-w-2 flex-1" />
                                            <button
                                              type="button"
                                              className={SK_RM}
                                              data-testid={`wb-lane-sk-rm-${lane.id}-${skillId}`}
                                              aria-label={`${t('workbench.sk_remove', { id: skillId })} · ${lane.name}`}
                                              title={t('workbench.sk_remove', { id: skillId })}
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                onSkillRemove?.(lane.id, skillId)
                                              }}
                                            >
                                              <X className="size-3.5" aria-hidden="true" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                      {showDepRow && (
                                        <div className="mt-[7px] flex flex-col items-start gap-1.5 pl-[30px]">
                                          {deps.map((dep) => {
                                            const dn = splitName(dep)
                                            const chipOpen =
                                              depPop !== null && depPop.stage === lane.id && depPop.skill === skillId && depPop.prevDep === dep
                                            return (
                                              <span key={dep} className="relative inline-flex">
                                                {canDep ? <button
                                                  type="button"
                                                  className={DEP_CHIP}
                                                  data-testid={`wb-lane-dep-${lane.id}-${skillId}-${dep}`}
                                                  aria-expanded={chipOpen}
                                                  aria-label={`${t('workbench.board_dep_label')} ${dep} · ${skillId} · ${lane.name}`}
                                                  title={t('workbench.board_dep_chip_hint', { id: dep })}
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    setSkPop(null)
                                                    setDepPop(chipOpen ? null : { stage: lane.id, skill: skillId, prevDep: dep })
                                                  }}
                                                >
                                                  <span className="flex-none whitespace-nowrap">⟼ {t('workbench.board_dep_label')}</span>
                                                  <span className="flex-none whitespace-nowrap">
                                                    {dn.ns !== '' && <span className="font-normal text-text-3">{dn.ns}</span>}
                                                    {dn.base}
                                                  </span>
                                                </button> : <span className={DEP_CHIP} title={t('workbench.board_dep_wait_hint', { id: dep })}>
                                                  <span className="flex-none whitespace-nowrap">{t('workbench.board_dep_wait')}</span>
                                                  <span className="flex-none whitespace-nowrap">
                                                    {dn.ns !== '' && <span className="font-normal text-text-3">{dn.ns}</span>}
                                                    {dn.base}
                                                  </span>
                                                </span>}
                                                {canDep && chipOpen && depPopover(lane, skillId, candidates, dep)}
                                              </span>
                                            )
                                          })}
                                          {showDepAdd && (
                                            <span className="relative inline-flex">
                                              <button
                                                type="button"
                                                className={DEP_ADD}
                                                data-testid={`wb-lane-dep-${lane.id}-${skillId}`}
                                                aria-expanded={addOpen}
                                                aria-label={`${t('workbench.board_dep_add')} · ${skillId} · ${lane.name}`}
                                                title={t('workbench.board_dep_add')}
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setSkPop(null)
                                                  setDepPop(addOpen ? null : { stage: lane.id, skill: skillId, prevDep: null })
                                                }}
                                              >
                                                ⟼ {t('workbench.board_dep_add')}
                                              </button>
                                              {addOpen && depPopover(lane, skillId, candidates, null)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })
                              ) : (
                                <span className="mx-0.5 text-[13px] text-text-3" role="status" aria-live="polite">{t('workbench.board_skills_empty')}</span>
                              )}
                            </div>
                            {dupWarn === lane.id && (
                              <p className="mt-2 text-[12.5px] leading-[1.5] text-red" data-testid={`wb-lane-sk-dup-${lane.id}`} role="status">
                                {t('workbench.board_drag_dup')}
                              </p>
                            )}
                            {canAddSkill && (
                              <div className="relative mt-1.5">
                                <button
                                  type="button"
                                  className={SK_ADD}
                                  data-testid={`wb-lane-sk-add-${lane.id}`}
                                  aria-expanded={onOpenSkillEditor ? undefined : skPop === lane.id}
                                  aria-label={`${t('workbench.board_sk_add')} · ${lane.name}`}
                                  title={regReady ? t('workbench.board_skill_orchestrator_open') : t('workbench.board_sk_noreg')}
                                  disabled={!regReady}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDepPop(null)
                                    if (onOpenSkillEditor) onOpenSkillEditor(lane.id)
                                    else setSkPop((cur) => (cur === lane.id ? null : lane.id))
                                  }}
                                >
                                  {t('workbench.board_sk_add')}
                                </button>
                                {!regReady && (
                                  <p className={SK_NOREG} data-testid={`wb-lane-sk-noreg-${lane.id}`}>
                                    {t('workbench.board_sk_noreg')}
                                  </p>
                                )}
                                {!onOpenSkillEditor && regReady &&
                                  skPop === lane.id &&
                                  skillPopover(
                                    lane,
                                    (skillRegistry ?? []).map((e) => e.name).filter((n) => !skills.includes(n)),
                                  )}
                              </div>
                            )}
                          </div>
  )
}
