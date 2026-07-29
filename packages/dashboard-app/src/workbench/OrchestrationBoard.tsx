import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Dialog } from '../shared/Dialog'
import { Icon } from '../shared/Icon'
import { OrchestrationLaneHeader } from './OrchestrationLaneHeader'
import { OrchestrationSkillZone } from './OrchestrationSkillZone'
import { OrchestrationOutputZone } from './OrchestrationOutputZone'
import { OrchestrationHookBody } from './OrchestrationHookBody'
import { DependencyPopover, SkillCandidatePopover, UninstalledSkillBadge } from './OrchestrationPopovers'
import './workbench.css'
export type { BoardLane, LanePatch, OrchestrationBoardProps } from './orchestrationBoardModel'
import { BTN_DANGER, BTN_GHOST, FIELD_RE, HK_CARET, HK_SUMROW, HK_SUMROW_BTN, MINI_BASE, MINI_RO, ZONE_TITLE, isAfterX, primeDrag, type BoardLane, type DragPayload, type DropHint, type OrchestrationBoardProps } from './orchestrationBoardModel'
export function OrchestrationBoard({
  lanes,
  readonly,
  selectedId,
  onSelect,
  label,
  onAddStage,
  gateHooks = [],
  onLaneEdit,
  onRemoveStage,
  renderSkillZone,
  onSkillMove,
  onSkillDep,
  onSkillAdd,
  onOpenSkillEditor,
  onSkillRemove,
  skillRegistry,
  onLaneGuard,
  onStageReorder,
  hooks,
  toolbarSlot,
}: OrchestrationBoardProps): JSX.Element {
  const { t, lang } = useT()
  const [hoverGate, setHoverGate] = useState<string | null>(null)
  const [pinnedGate, setPinnedGate] = useState<string | null>(null)
  const [nameEdit, setNameEdit] = useState<{ id: string; draft: string } | null>(null)
  const [outAdd, setOutAdd] = useState<{ id: string; draft: string; error: string | null } | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragPayload | null>(null)
  const [drop, setDrop] = useState<DropHint | null>(null)
  const [depPop, setDepPop] = useState<{ stage: string; skill: string; prevDep: string | null } | null>(null)
  const [skPop, setSkPop] = useState<string | null>(null)
  const [dupWarn, setDupWarn] = useState<string | null>(null)
  const [hookOpen, setHookOpen] = useState<Record<string, boolean>>({})
  const boardRef = useRef<HTMLDivElement>(null)
  const canEdit = onLaneEdit !== undefined && !readonly
  const canRemove = onRemoveStage !== undefined && !readonly
  const canDragSkill = onSkillMove !== undefined && !readonly
  const canDep = onSkillDep !== undefined && !readonly
  const canDragLane = onStageReorder !== undefined && !readonly
  const canAddSkill = (onOpenSkillEditor !== undefined || onSkillAdd !== undefined) && !readonly
  const canRemoveSkill = onSkillRemove !== undefined && !readonly
  const canGuard = onLaneGuard !== undefined && !readonly
  const regReady = skillRegistry !== null && skillRegistry !== undefined
  const removeLane = removeId === null ? undefined : lanes.find((l) => l.id === removeId)
  useEffect(() => {
    setOutAdd((current) => current === null ? null : { ...current, error: null })
  }, [lang])
  useEffect(() => {
    if (pinnedGate === null) return
    function onDocClick(e: MouseEvent): void {
      if (boardRef.current && e.target instanceof Node && !boardRef.current.contains(e.target)) setPinnedGate(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [pinnedGate])
  useEffect(() => {
    if (depPop === null) return
    function onDocClick(e: MouseEvent): void {
      if (e.target instanceof Element && e.target.closest('[data-wb-dep-open]') !== null) return
      setDepPop(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [depPop])
  useEffect(() => {
    if (skPop === null) return
    function onDocClick(e: MouseEvent): void {
      if (e.target instanceof Element && e.target.closest('[data-wb-sk-open]') !== null) return
      setSkPop(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [skPop])
  function toggleGate(lane: BoardLane): void {
    onLaneEdit?.(lane.id, { gate: lane.gate === null ? 'review' : null })
  }
  function commitName(lane: BoardLane, cancel: boolean): void {
    if (nameEdit === null || nameEdit.id !== lane.id) return
    if (cancel) {
      setNameEdit(null)
      return
    }
    const v = nameEdit.draft.trim()
    if (v !== '' && v !== lane.name) onLaneEdit?.(lane.id, { label: v })
    setNameEdit(null)
  }
  function removeOutput(lane: BoardLane, field: string): void {
    onLaneEdit?.(lane.id, { outputs: lane.outputs.filter((o) => o !== field) })
  }
  function commitOutAdd(lane: BoardLane, cancel: boolean): void {
    if (outAdd === null || outAdd.id !== lane.id) return
    if (cancel) {
      setOutAdd(null)
      return
    }
    const v = outAdd.draft.trim()
    if (v === '') {
      setOutAdd(null)
      return
    }
    if (!FIELD_RE.test(v)) {
      setOutAdd({ ...outAdd, error: t('workbench.ed_output_invalid') })
      return
    }
    if (lane.outputs.includes(v)) {
      setOutAdd({ ...outAdd, error: t('workbench.ed_output_dup') })
      return
    }
    onLaneEdit?.(lane.id, { outputs: [...lane.outputs, v] })
    setOutAdd(null)
  }
  function beginDrag(payload: DragPayload): void {
    setDupWarn(null)
    setDrag(payload)
  }
  function endDrag(): void {
    setDrag(null)
    setDrop(null)
  }
  function commitSkillMove(from: { stage: string; skill: string }, toLane: BoardLane, refSkillId: string | null, after: boolean): void {
    endDrag()
    if (from.stage !== toLane.id && (toLane.skills ?? []).includes(from.skill)) {
      setDupWarn(toLane.id)
      return
    }
    onSkillMove?.({ skillId: from.skill, fromStage: from.stage, toStage: toLane.id, refSkillId, after })
  }
  function depPopover(lane: BoardLane, skillId: string, candidates: string[], previous: string | null): JSX.Element {
    return <DependencyPopover lane={lane} skillId={skillId} candidates={candidates} previous={previous} onChoose={(dependency) => onSkillDep?.(lane.id, skillId, dependency, previous)} onClose={() => setDepPop(null)} />
  }
  function uninstBadge(id: string, testId: string): JSX.Element | null {
    return <UninstalledSkillBadge id={id} testId={testId} registry={skillRegistry} />
  }
  function skillPopover(lane: BoardLane, candidates: string[]): JSX.Element {
    return <SkillCandidatePopover lane={lane} candidates={candidates} registry={skillRegistry} onChoose={(skillId) => { onSkillAdd?.(lane.id, skillId); setSkPop(null) }} />
  }
  function hookZoneBody(lane: BoardLane, open: boolean): JSX.Element | null {
    if (hooks?.hooks == null) return null
    return <OrchestrationHookBody lane={lane} open={open} hooks={hooks} />
  }
  return (
    <>
      {toolbarSlot ? (
        <div className="mb-2.5 flex flex-wrap items-center gap-2 px-1" data-testid="wb-board-toolbar">
          {toolbarSlot}
        </div>
      ) : null}
      <div className="overflow-x-auto px-1 pt-1.5 pb-4" data-testid="wb-board-scroll" ref={boardRef}>
        <div className="flex min-w-min items-start gap-3">
          <div
            className={`grid grid-flow-col w-max items-start gap-x-8 [grid-auto-columns:minmax(320px,max-content)] ${canDragLane ? 'px-[18px]' : 'pr-1'}`}
            role="list"
            aria-label={label}
            data-testid="wb-stages"
          >
            {lanes.map((lane, i) => {
              const selected = lane.id === selectedId
              const state = selected ? 'current' : lane.running ? 'running' : 'idle'
              const openPop = hoverGate === lane.id || pinnedGate === lane.id
              const hooksReady = lane.hooksCount !== undefined
              const hkOpen = hookOpen[lane.id] ?? lane.running
              const hookBody = hookZoneBody(lane, hkOpen)
              const hookSummary = (
                <>
                  <span className={`${ZONE_TITLE} inline-flex items-center gap-1.5`}><Icon name="gauge" size={12} />{t('workbench.board_auto_checks')}</span>
                  <span className="ml-auto inline-flex flex-none items-center gap-1.5">
                    <span className={`${MINI_BASE} ${MINI_RO}`}>{t('workbench.board_items', { n: (lane.hooksCount ?? 0) + (lane.hooksLocked ?? 0) })}</span>
                  </span>
                </>
              )
              const laneDragging = drag !== null && drag.kind === 'lane' && drag.stage === lane.id
              const laneDrop = drop !== null && drop.kind === 'lane' && drop.stage === lane.id ? (drop.after ? 'after' : 'before') : undefined
              const intoDrop = drop !== null && drop.kind === 'into' && drop.stage === lane.id
              const skills = lane.skills
              return (
                <div
                  key={lane.id}
                  className="group relative flex flex-col overflow-visible rounded-[22px] border border-border bg-card shadow-[0_10px_30px_rgba(15,23,42,0.045)] transition-[border-color,box-shadow,opacity,transform] duration-200 hover:-translate-y-px hover:border-border-2 hover:shadow-[0_14px_36px_rgba(15,23,42,0.07)] data-[locked]:bg-fill/55 data-[state=running]:border-green-b data-[state=current]:border-accent-b data-[state=current]:shadow-[0_16px_40px_rgba(37,99,235,0.10)] data-[state=current]:ring-2 data-[state=current]:ring-accent-t data-[dragging]:opacity-45"
                  role="listitem"
                  data-testid={`wb-step-${lane.id}`}
                  data-state={state}
                  data-locked={readonly ? '' : undefined}
                  data-dragging={laneDragging ? '' : undefined}
                  data-drop={laneDrop}
                  onDragStart={
                    canDragLane
                      ? (e) => {
                          beginDrag({ kind: 'lane', stage: lane.id })
                          primeDrag(e, lane.id, e.currentTarget)
                        }
                      : undefined
                  }
                  onDragEnd={canDragLane ? endDrag : undefined}
                  onDragOver={(e) => {
                    if (drag === null || drag.kind !== 'lane' || drag.stage === lane.id) return
                    e.preventDefault()
                    setDrop({ kind: 'lane', stage: lane.id, after: isAfterX(e, e.currentTarget) })
                  }}
                  onDrop={(e) => {
                    if (drag === null || drag.kind !== 'lane' || drag.stage === lane.id) return
                    e.preventDefault()
                    const fromId = drag.stage
                    const after = isAfterX(e, e.currentTarget)
                    endDrag()
                    onStageReorder?.(fromId, lane.id, after)
                  }}
                  data-forward={lane.linkEvent !== null ? lane.linkEvent : undefined}
                  data-gated={lane.gate !== null ? '' : undefined}
                  aria-current={selected ? 'step' : undefined}
                  onClick={() => onSelect(lane.id)}
                >
                  {laneDrop !== undefined && <span className="pointer-events-none" data-wb-drop-caret="" aria-hidden="true" />}
                  <OrchestrationLaneHeader
                    lane={lane}
                    index={i}
                    readonly={readonly}
                    canDrag={canDragLane}
                    canEdit={canEdit}
                    canRemove={canRemove}
                    nameEdit={nameEdit}
                    gateOpen={openPop}
                    gateHooks={gateHooks}
                    onNameEdit={setNameEdit}
                    onNameCommit={commitName}
                    onGateToggle={toggleGate}
                    onGateHover={setHoverGate}
                    onGatePin={(id) => setPinnedGate((current) => current === id ? null : id)}
                    onRemove={setRemoveId}
                  />
                  <div className="flex flex-col gap-3.5 px-3 pt-3 pb-3.5">
                    {renderSkillZone !== undefined ? renderSkillZone(lane.id) : skills !== undefined && (
                      <OrchestrationSkillZone
                        lane={lane}
                        skills={skills}
                        readonly={readonly}
                        canDragSkill={canDragSkill}
                        canDep={canDep}
                        canRemoveSkill={canRemoveSkill}
                        canAddSkill={canAddSkill}
                        regReady={regReady}
                        intoDrop={intoDrop}
                        drag={drag}
                        drop={drop}
                        depPop={depPop}
                        skPop={skPop}
                        dupWarn={dupWarn}
                        skillRegistry={skillRegistry}
                        onBeginDrag={beginDrag}
                        onEndDrag={endDrag}
                        onDropHint={setDrop}
                        onSkillMove={commitSkillMove}
                        onDependencyPopover={setDepPop}
                        onSkillPopover={setSkPop}
                        onSkillRemove={onSkillRemove}
                        onOpenSkillEditor={onOpenSkillEditor}
                        renderDependencyPopover={depPopover}
                        renderSkillPopover={skillPopover}
                        renderUninstalledBadge={uninstBadge}
                      />
                    )}
                    {hooksReady && (
                      <div data-testid={`wb-lane-hooks-${lane.id}`}>
                        {hookBody === null ? (
                          <div className={HK_SUMROW}>{hookSummary}</div>
                        ) : (
                          <button
                            type="button"
                            className={`${HK_SUMROW} ${HK_SUMROW_BTN}`}
                            data-testid={`wb-lane-hk-toggle-${lane.id}`}
                            aria-expanded={hkOpen}
                            aria-controls={hkOpen ? `wb-lane-hk-body-${lane.id}` : undefined}
                            onClick={() => setHookOpen((cur) => ({ ...cur, [lane.id]: !hkOpen }))}
                          >
                            <span className={HK_CARET} data-open={hkOpen ? '' : undefined} aria-hidden="true">
                              <Icon name="chevron" size={11} />
                            </span>
                            {hookSummary}
                          </button>
                        )}
                        {hookBody}
                      </div>
                    )}
                    <OrchestrationOutputZone
                      lane={lane}
                      readonly={readonly}
                      canEdit={canEdit}
                      canGuard={canGuard}
                      outAdd={outAdd}
                      onOutAdd={setOutAdd}
                      onCommit={commitOutAdd}
                      onRemove={removeOutput}
                      onGuard={onLaneGuard}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {onAddStage && <button
            type="button"
            className="mt-1.5 grid min-h-[190px] w-max flex-none cursor-pointer place-items-center self-start rounded-2xl border-[1.5px] border-dashed border-border-2 px-6 text-[14px] font-bold whitespace-nowrap text-text-3 transition-colors duration-150 enabled:hover:border-accent-b enabled:hover:bg-accent-t enabled:hover:text-accent-d disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onAddStage}
          >
            {t('workbench.add_stage')}
          </button>}
        </div>
      </div>
      {removeLane !== undefined && (
        <Dialog
          title={t('workbench.board_rm_title', { name: removeLane.name })}
          onClose={() => setRemoveId(null)}
          testid="wb-lane-rm-confirm"
          actions={
            <>
              <button type="button" className={BTN_GHOST} onClick={() => setRemoveId(null)}>
                {t('workbench.board_rm_cancel')}
              </button>
              <button
                type="button"
                className={BTN_DANGER}
                data-testid="wb-lane-rm-ok"
                onClick={() => {
                  setRemoveId(null)
                  onRemoveStage?.(removeLane.id)
                }}
              >
                {t('workbench.board_rm_confirm')}
              </button>
            </>
          }
        >
          <p className="mb-4 text-[12.5px] leading-[1.6] text-text-2">
            {t('workbench.board_rm_body', { name: removeLane.name })}
          </p>
        </Dialog>
      )}
    </>
  )
}
