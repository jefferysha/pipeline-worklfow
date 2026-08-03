import type { Dispatch, SetStateAction } from 'react'
import { Icon } from '../shared/Icon'
import { useT } from '../i18n'
import { outputPresentation } from '../shared/outputPresentation'
import { GUARD_LABEL, GUARD_NOTE, INPUT_BASE, MINI_BASE, MINI_RO, MINI_RW, OUT_ADD, OUT_X, SWITCH, ZONE_TITLE, type BoardLane } from './orchestrationBoardModel'

export interface OutputDraft {
  id: string
  draft: string
  error: string | null
}

export function OrchestrationOutputZone({ lane, readonly, canEdit, canGuard, outAdd, onOutAdd, onCommit, onRemove, onGuard }: {
  lane: BoardLane
  readonly: boolean
  canEdit: boolean
  canGuard: boolean
  outAdd: OutputDraft | null
  onOutAdd: Dispatch<SetStateAction<OutputDraft | null>>
  onCommit: (lane: BoardLane, cancel: boolean) => void
  onRemove: (lane: BoardLane, field: string) => void
  onGuard?: (stageId: string, nonempty: boolean) => void
}): JSX.Element {
  const { lang, t } = useT()
  const addingOut = outAdd?.id === lane.id
  const outError = addingOut ? outAdd?.error ?? null : null
  const showGuard = canGuard && lane.nonemptyGuard !== undefined
  const setOutAdd = onOutAdd
  const commitOutAdd = onCommit
  const removeOutput = onRemove
  const onLaneGuard = onGuard
  return (
                    <div data-testid={`wb-lane-outs-${lane.id}`}>
                      <div className="mx-0.5 mb-2 flex items-center gap-2">
                        <span className={`${ZONE_TITLE} inline-flex items-center gap-1.5`}><Icon name="doc" size={12} />{t('workbench.board_zone_outputs')}</span>
                        <span className="ml-auto inline-flex flex-none items-center gap-1.5">
                          {readonly ? (
                            <span className={`${MINI_BASE} ${MINI_RO} inline-flex items-center gap-1`}><Icon name="gate" size={10} />{t('workbench.board_badge_ro')}</span>
                          ) : (
                            <span className={`${MINI_BASE} ${MINI_RW} inline-flex items-center gap-1`}><Icon name="gauge" size={10} />{t('workbench.board_badge_rw')}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-col items-start gap-1.5">
                        {lane.outputs.map((o) => {
                          const presentation = outputPresentation(o, lang)
                          return (
                          <span
                            key={o}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap text-text-2"
                            title={presentation.title}
                          >
                            {presentation.label}
                            {canEdit && (
                              <button
                                type="button"
                                className={OUT_X}
                                data-testid={`wb-lane-out-rm-${lane.id}-${o}`}
                                aria-label={`${t('workbench.board_ed_out_rm', { field: o })} · ${lane.name}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeOutput(lane, o)
                                }}
                              >
                                <Icon name="x" size={12} />
                              </button>
                            )}
                          </span>
                          )
                        })}
                        {lane.outputs.length === 0 && !addingOut && (
                          <span className="mx-0.5 text-[13px] text-text-3" data-testid={`wb-lane-outs-empty-${lane.id}`} role="status" aria-live="polite">
                            {t('workbench.board_outs_empty')}
                          </span>
                        )}
                        {canEdit &&
                          (addingOut ? (
                            <input
                              className={`${INPUT_BASE} px-2.5 py-1 font-mono text-[13px]`}
                              data-testid={`wb-lane-out-input-${lane.id}`}
                              placeholder={t('workbench.board_ed_out_placeholder')}
                              aria-label={`${t('workbench.board_ed_out_add')} · ${lane.name}`}
                              aria-invalid={outError !== null}
                              value={outAdd.draft}
                              size={Math.max(outAdd.draft.length + 1, 12)}
                              autoFocus
                              onChange={(e) => setOutAdd({ id: lane.id, draft: e.target.value, error: null })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  commitOutAdd(lane, false)
                                } else if (e.key === 'Escape') {
                                  commitOutAdd(lane, true)
                                }
                              }}
                              onBlur={() => commitOutAdd(lane, outAdd.draft.trim() === '')}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <button
                              type="button"
                              className={OUT_ADD}
                              data-testid={`wb-lane-out-add-${lane.id}`}
                              aria-label={`${t('workbench.board_ed_out_add')} · ${lane.name}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setOutAdd({ id: lane.id, draft: '', error: null })
                              }}
                            >
                              {t('workbench.board_ed_out_add')}
                            </button>
                          ))}
                      </div>
                      {outError !== null && (
                        <p className="mt-1.5 text-[12.5px] text-red" data-testid={`wb-lane-out-err-${lane.id}`} role="alert">
                          {outError}
                        </p>
                      )}
                      {showGuard && (
                        <>
                          <div className="mt-2.5 flex items-center gap-[9px]">
                            <button
                              type="button"
                              className={SWITCH}
                              role="switch"
                              aria-checked={lane.nonemptyGuard === true}
                              aria-label={`${t('workbench.ed_nonempty')} · ${lane.name}`}
                              data-testid={`wb-lane-guard-${lane.id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onLaneGuard?.(lane.id, lane.nonemptyGuard !== true)
                              }}
                            />
                            <span className={GUARD_LABEL}>{t('workbench.ed_nonempty')}</span>
                          </div>
                          <p className={GUARD_NOTE}>{t('workbench.ed_nonempty_note')}</p>
                        </>
                      )}
                    </div>
  )
}
