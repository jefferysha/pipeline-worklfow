import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { deleteWorkflowDef, fetchWorkflow, fetchWorkflowNames, postWorkflowDef } from '../api/client'
import { formatApiError } from '../api/transport'
import { useT } from '../i18n'
import { DEFAULT_RULES, invalidateWorkflowRules, rulesKey, useWorkflowRulesMulti } from '../model/workflowModel'
import { PHASES } from '../types'
import { revealDialog, revealList } from '../shared/motion'
import { PageHeader } from '../shared/PageHeader'
import './workbench.css'
import { useHooksConfig } from './HookTimeline'
import { useLoops } from './LoopCard'
import { LaneMandatorySkills, TrackSelector, useMandatorySkills } from './mandatorySkills'
import { ExecutionTimelineComposer } from './ExecutionTimelineComposer'
import { SkillOrchestrationDialog } from './SkillOrchestrationDialog'
import { readSaveErrors, readWorkflowDeleteResponse, STAGE_ID_RE } from './workbenchApiDecoders'
import { useRecentWorkflowHistory } from './useRecentWorkflowHistory'
import { WorkbenchDialogs } from './WorkbenchDialogs'
import { WorkbenchHeader } from './WorkbenchHeader'
import { WorkbenchGovernanceDialog } from './WorkbenchGovernanceDialog'
import type { WorkbenchViewProps } from './workbenchViewTypes'
import { useWorkbenchBoard } from './useWorkbenchBoard'
import {
  addSkillToDef,
  buildDefaultDef,
  editLaneInDef,
  moveSkillInDef,
  removeSkillFromDef,
  removeStageFromDef,
  reorderStagesInDef,
  setLaneGuardInDef,
  setSkillDepInDef,
  stageCounts,
  workflowForCreate,
  type WbStepDef,
  type WbWorkflowDef,
} from './workbenchDefinition'
export {
  addSkillToDef,
  moveSkillInDef,
  removeSkillFromDef,
  removeStageFromDef,
  reorderStagesInDef,
  setLaneGuardInDef,
  setSkillDepInDef,
  stageCounts,
}
export type {
  SkillMove,
  StageAmbient,
  WbActionConfig,
  WbArtifactConfig,
  WbDocumentContract,
  WbFieldRef,
  WbGuardConfig,
  WbSkillRef,
  WbStepDef,
  WbTrackPredicate,
  WbTransition,
  WbWorkflowDef,
} from './workbenchDefinition'
gsap.registerPlugin(useGSAP)
export function WorkbenchView({ root, onToggleError, snapshot = null }: WorkbenchViewProps): JSX.Element {
  const { t, lang } = useT()
  const defaultLabels = useMemo(
    () => Object.fromEntries(PHASES.map((phase) => [phase, t(`phases.${phase}`)])),
    [lang, t],
  )
  const localizedDefaultDef = useMemo(() => buildDefaultDef(defaultLabels), [defaultLabels])
  const [names, setNames] = useState<string[] | null>(null)
  const [namesError, setNamesError] = useState<unknown | null>(null)
  const [wfName, setWfName] = useState<string | null>(null)
  const [def, setDef] = useState<WbWorkflowDef | null>(null)
  const [defError, setDefError] = useState<unknown | null>(null)
  const [menuOpen, setMenuOpen] = useState(false); const [stageId, setStageId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<{ kind: 'idle' | 'ok' } | { kind: 'error'; errors: string[] }>({ kind: 'idle' })
  const [saving, setSaving] = useState(false)
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null)
  const [addStageOpen, setAddStageOpen] = useState(false)
  const [stageDraftName, setStageDraftName] = useState('')
  const [stageDraftId, setStageDraftId] = useState('')
  const [stageIdTouched, setStageIdTouched] = useState(false)
  const addStageNameRef = useRef<HTMLInputElement>(null)
  const [workflowCreateMode, setWorkflowCreateMode] = useState<'new' | 'copy' | null>(null)
  const [workflowDraftName, setWorkflowDraftName] = useState('')
  const [workflowOpBusy, setWorkflowOpBusy] = useState(false)
  const [workflowOpErrors, setWorkflowOpErrors] = useState<string[]>([])
  const [workflowDeleteTarget, setWorkflowDeleteTarget] = useState<{ root: string; name: string } | null>(null)
  const [workflowDeleteBusy, setWorkflowDeleteBusy] = useState(false)
  const [workflowDeleteError, setWorkflowDeleteError] = useState<{
    summary: string
    references: Array<{ kind?: string; source?: string }>
    blockers: Array<{ source?: string; detail?: string }>
  } | null>(null)
  const workflowNameRef = useRef<HTMLInputElement>(null); const rootRef = useRef<HTMLElement>(null)
  const rootIdentity = useRef(root)
  const workflowIdentity = useRef<string | null>(null)
  const saveGeneration = useRef(0)
  const createGeneration = useRef(0)
  const deleteGeneration = useRef(0)
  const namesGeneration = useRef(0)
  const localeIdentity = useRef({ t, lang })
  rootIdentity.current = root
  workflowIdentity.current = wfName
  localeIdentity.current = { t, lang }
  const [advancedOpen, setAdvancedOpen] = useState(false); const [skillEditorOpen, setSkillEditorOpen] = useState(false)
  const defSnapshotRef = useRef<string | null>(null)
  const hooksConfig = useHooksConfig(root, onToggleError)
  const mandatory = useMandatorySkills(root)
  const { recent, recentSilent } = useRecentWorkflowHistory(snapshot, root, wfName)
  const loops = useLoops(root)
  useEffect(() => {
    setSaveStatus((current) => current.kind === 'error' ? { kind: 'idle' } : current)
    setWorkflowOpErrors([])
    setWorkflowDeleteError(null)
  }, [lang])
  useEffect(() => {
    const targetRoot = root
    const generation = ++namesGeneration.current
    ++saveGeneration.current
    ++createGeneration.current
    ++deleteGeneration.current
    setNames(null)
    setNamesError(null)
    setWfName(null)
    setDef(null)
    setDefError(null)
    setMenuOpen(false)
    setSaving(false)
    setPendingSwitch(null)
    setAddStageOpen(false)
    setWorkflowCreateMode(null)
    setWorkflowDraftName('')
    setWorkflowOpBusy(false)
    setWorkflowOpErrors([])
    setWorkflowDeleteTarget(null)
    setWorkflowDeleteBusy(false)
    setWorkflowDeleteError(null)
    setAdvancedOpen(false)
    setSkillEditorOpen(false)
    defSnapshotRef.current = null
    let cancelled = false
    fetchWorkflowNames(targetRoot)
      .then((names) => {
        if (cancelled || generation !== namesGeneration.current || rootIdentity.current !== targetRoot) return
        setNames(names)
        setNamesError(null)
        setWfName(names[0] ?? 'default')
      })
      .catch((err: unknown) => {
        if (cancelled || generation !== namesGeneration.current || rootIdentity.current !== targetRoot) return
        setNames([])
        setNamesError(err)
        setWfName('default')
      })
    return () => {
      cancelled = true
      ++namesGeneration.current
      ++saveGeneration.current
      ++createGeneration.current
      ++deleteGeneration.current
    }
  }, [root])
  useEffect(() => {
    if (!wfName) return
    setSaveStatus({ kind: 'idle' }) // 上一个 workflow 的保存态不跨名残留
    if (wfName === 'default') {
      setDef(localizedDefaultDef)
      setDefError(null)
      defSnapshotRef.current = null // default 只读态：永不参与 dirty 判定
      return
    }
    let cancelled = false
    setDef(null)
    setDefError(null)
    defSnapshotRef.current = null
    fetchWorkflow(wfName, root)
      .then((body) => {
        if (cancelled) return
        setDef(body)
        setDefError(null)
        defSnapshotRef.current = JSON.stringify(body)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDefError(err)
      })
    return () => {
      cancelled = true
    }
  }, [root, wfName])
  useEffect(() => {
    if (wfName === 'default') setDef(localizedDefaultDef)
  }, [localizedDefaultDef, wfName])
  useEffect(() => {
    if (!def) return
    setStageId((cur) => (cur && def.steps.some((s) => s.id === cur) ? cur : def.steps[0]?.id ?? null))
  }, [def])
  const readonlyWf = wfName === 'default'
  const namesErrorText = namesError === null ? null : t('workbench.names_error', { msg: formatApiError(namesError, t) })
  const defErrorText = defError === null ? null : t('workbench.def_error', { msg: formatApiError(defError, t) })
  const dirty = !readonlyWf && def !== null && defSnapshotRef.current !== null && JSON.stringify(def) !== defSnapshotRef.current
  function editLane(laneId: string, patch: Parameters<typeof editLaneInDef>[2]): void {
    setDef((prev) => (prev ? editLaneInDef(prev, laneId, patch) : prev))
  }
  function replaceStep(updated: WbStepDef): void {
    setDef((prev) => prev === null
      ? prev
      : { ...prev, steps: prev.steps.map((step) => step.id === updated.id ? updated : step) })
  }
  function removeStage(laneId: string): void {
    setDef((prev) => (prev ? removeStageFromDef(prev, laneId) : prev))
    setStageId((cur) => {
      if (cur !== laneId) return cur
      const rest = def?.steps.filter((s) => s.id !== laneId) ?? []
      return rest[0]?.id ?? null
    })
  }
  const stageIdTrimmed = stageDraftId.trim()
  const stageIdInvalid = stageIdTrimmed.length > 0 && !STAGE_ID_RE.test(stageIdTrimmed)
  const stageIdDup = stageIdTrimmed.length > 0 && !stageIdInvalid && (def?.steps.some((s) => s.id === stageIdTrimmed) ?? false)
  const stageIdError = stageIdInvalid
    ? t('workbench.add_stage_id_invalid')
    : stageIdDup
      ? t('workbench.add_stage_id_dup')
      : null
  const canSubmitStage = stageIdTrimmed.length > 0 && !stageIdInvalid && !stageIdDup
  function closeAddStage(): void {
    setAddStageOpen(false)
    setStageDraftName('')
    setStageDraftId('')
    setStageIdTouched(false)
  }
  function confirmAddStage(): void {
    if (!canSubmitStage || !def) return
    const id = stageIdTrimmed
    const label = stageDraftName.trim()
    setDef((prev) => {
      if (!prev) return prev
      const steps = prev.steps
      const selIdx = stageId ? steps.findIndex((s) => s.id === stageId) : -1
      const insertIndex = selIdx >= 0 ? selIdx + 1 : steps.length
      const prevStep = insertIndex > 0 ? steps[insertIndex - 1] : undefined
      const nextStep = steps[insertIndex] // 插入前的「原下一个 step」，末尾插入时为 undefined
      let newTransitions: WbStepDef['transitions'] = []
      let steppedSteps = steps
      if (prevStep && nextStep) {
        const fwdIdx = prevStep.transitions.findIndex((tr) => tr.to === nextStep.id)
        if (fwdIdx >= 0) {
          newTransitions = [{ event: `${id}-complete`, to: nextStep.id }]
          steppedSteps = steps.map((s, i) =>
            i === insertIndex - 1
              ? { ...s, transitions: s.transitions.map((tr, ti) => (ti === fwdIdx ? { ...tr, to: id } : tr)) }
              : s,
          )
        }
      } else if (prevStep && !nextStep) {
        steppedSteps = steps.map((s, i) =>
          i === insertIndex - 1
            ? { ...s, transitions: [...s.transitions, { event: `${s.id}-complete`, to: id }] }
            : s,
        )
      }
      const newStep: WbStepDef = {
        id, label, gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: newTransitions,
      }
      const finalSteps = [...steppedSteps]
      finalSteps.splice(insertIndex, 0, newStep)
      return { ...prev, steps: finalSteps }
    })
    setStageId(id)
    closeAddStage()
  }
  async function save(): Promise<void> {
    if (!def || !wfName || readonlyWf || !dirty || saving) return
    const targetRoot = root
    const targetWorkflow = wfName
    const generation = ++saveGeneration.current
    setSaving(true)
    setSaveStatus({ kind: 'idle' })
    try {
      const res = await postWorkflowDef(targetWorkflow, { ...def, root: targetRoot })
      if (!res.ok) {
        const locale = localeIdentity.current
        const errors = await readSaveErrors(
          res,
          locale.t('workbench.save_unauthorized'),
          locale.t('common.request_http_error', { status: res.status }),
          locale.lang === 'zh',
        )
        if (generation !== saveGeneration.current || rootIdentity.current !== targetRoot || workflowIdentity.current !== targetWorkflow) return
        setSaveStatus({
          kind: 'error',
          errors,
        })
        return
      }
      if (generation !== saveGeneration.current || rootIdentity.current !== targetRoot || workflowIdentity.current !== targetWorkflow) return
      invalidateWorkflowRules(targetRoot, targetWorkflow)
      defSnapshotRef.current = JSON.stringify(def)
      setSaveStatus({ kind: 'ok' })
    } catch (err) {
      if (generation === saveGeneration.current && rootIdentity.current === targetRoot && workflowIdentity.current === targetWorkflow) {
        setSaveStatus({ kind: 'error', errors: [formatApiError(err, localeIdentity.current.t)] })
      }
    } finally {
      if (generation === saveGeneration.current && rootIdentity.current === targetRoot && workflowIdentity.current === targetWorkflow) {
        setSaving(false)
      }
    }
  }
  function switchTo(name: string): void {
    ++saveGeneration.current
    workflowIdentity.current = name
    setSaving(false)
    setSaveStatus({ kind: 'idle' })
    setWfName(name)
    setDef(name === 'default' ? localizedDefaultDef : null)
    setDefError(null)
  }
  function requestSwitch(name: string): void {
    setMenuOpen(false)
    if (name === wfName) return
    if (dirty) {
      setPendingSwitch(name)
    } else {
      switchTo(name)
    }
  }
  function confirmSwitch(): void {
    if (pendingSwitch !== null) switchTo(pendingSwitch)
    setPendingSwitch(null)
  }
  const workflowName = workflowDraftName.trim()
  const workflowNameInvalid = workflowName.length > 0 && !/^[\p{L}\p{N}\p{M}_-]+$/u.test(workflowName)
  const workflowNameDuplicate = workflowName.length > 0 && (workflowName === 'default' || (names ?? []).includes(workflowName))
  const canSubmitWorkflow = workflowName.length > 0 && !workflowNameInvalid && !workflowNameDuplicate && !workflowOpBusy
  function openWorkflowCreate(mode: 'new' | 'copy'): void {
    if (saving) return
    setMenuOpen(false)
    setWorkflowCreateMode(mode)
    setWorkflowDraftName(mode === 'copy' ? `${wfName ?? 'workflow'}-copy` : '')
    setWorkflowOpErrors([])
  }
  function closeWorkflowCreate(): void {
    if (workflowOpBusy) return
    setWorkflowCreateMode(null)
    setWorkflowDraftName('')
    setWorkflowOpErrors([])
  }
  async function confirmWorkflowCreate(): Promise<void> {
    if (!canSubmitWorkflow || !workflowCreateMode) return
    if (workflowCreateMode === 'copy' && !def) return
    const targetRoot = root
    const generation = ++createGeneration.current
    const nextDef = workflowForCreate(workflowCreateMode, readonlyWf, def, workflowName, defaultLabels)
    if (nextDef === null) return
    setWorkflowOpBusy(true)
    setWorkflowOpErrors([])
    try {
      const res = await postWorkflowDef(workflowName, { root: targetRoot, ...nextDef })
      if (!res.ok) {
        const locale = localeIdentity.current
        const errors = await readSaveErrors(
          res,
          locale.t('workbench.save_unauthorized'),
          locale.t('common.request_http_error', { status: res.status }),
          locale.lang === 'zh',
        )
        if (generation !== createGeneration.current || rootIdentity.current !== targetRoot) return
        setWorkflowOpErrors(errors)
        return
      }
      if (generation !== createGeneration.current || rootIdentity.current !== targetRoot) return
      invalidateWorkflowRules(targetRoot, workflowName)
      setNames((prev) => [...new Set([...(prev ?? []), workflowName])].sort())
      setWorkflowCreateMode(null)
      setWorkflowDraftName('')
      switchTo(workflowName)
    } catch (err) {
      if (generation === createGeneration.current && rootIdentity.current === targetRoot) {
        setWorkflowOpErrors([formatApiError(err, localeIdentity.current.t)])
      }
    } finally {
      if (generation === createGeneration.current && rootIdentity.current === targetRoot) {
        setWorkflowOpBusy(false)
      }
    }
  }
  function openWorkflowDelete(): void {
    if (saving || !wfName || wfName === 'default') return
    setWorkflowDeleteError(null)
    setWorkflowDeleteTarget({ root, name: wfName })
  }
  function closeWorkflowDelete(): void {
    if (workflowDeleteBusy) return
    setWorkflowDeleteTarget(null)
    setWorkflowDeleteError(null)
  }
  async function confirmWorkflowDelete(): Promise<void> {
    const target = workflowDeleteTarget
    if (!target || target.root !== root || target.name !== wfName || workflowDeleteBusy) {
      setWorkflowDeleteTarget(null)
      return
    }
    const deleting = target.name
    const targetRoot = target.root
    const generation = ++deleteGeneration.current
    setWorkflowDeleteBusy(true)
    setWorkflowDeleteError(null)
    try {
      const res = await deleteWorkflowDef(deleting, targetRoot)
      const outcome = await readWorkflowDeleteResponse(res)
      if (generation !== deleteGeneration.current || rootIdentity.current !== targetRoot) return
      if (outcome.kind !== 'success') {
        const locale = localeIdentity.current
        const body = outcome.kind === 'error' ? outcome.body : null
        setWorkflowDeleteError({
          summary: outcome.kind === 'invalid'
            ? locale.t('common.invalid_response')
            : (locale.lang === 'zh' ? body?.error : undefined) ?? (body?.code === 'WORKFLOW_REFERENCED'
              ? locale.t('workbench.workflow_delete_referenced')
              : locale.t('workbench.workflow_delete_failed', { status: res.status })),
          references: locale.lang === 'zh' ? body?.references ?? [] : [],
          blockers: locale.lang === 'zh' ? body?.blockers ?? [] : [],
        })
        return
      }
      invalidateWorkflowRules(targetRoot, deleting)
      const remaining = (names ?? []).filter((name) => name !== deleting)
      setNames(remaining)
      setWorkflowDeleteTarget(null)
      setWorkflowDeleteError(null)
      switchTo(remaining[0] ?? 'default')
    } catch (err) {
      if (generation === deleteGeneration.current && rootIdentity.current === targetRoot) {
        setWorkflowDeleteError({
          summary: formatApiError(err, localeIdentity.current.t),
          references: [],
          blockers: [],
        })
      }
    } finally {
      if (generation === deleteGeneration.current && rootIdentity.current === targetRoot) {
        setWorkflowDeleteBusy(false)
      }
    }
  }
  useGSAP(() => {
    if (!def || def.steps.length === 0) return
    const el = rootRef.current
    if (!el) return
    const stages = Array.from(el.querySelectorAll<HTMLElement>('[data-anim="wb-stage"]'))
    if (stages.length > 0) revealList(stages)
  }, { scope: rootRef, dependencies: [def?.name] })
  useGSAP(() => {
    if (pendingSwitch !== null) {
      // Shared Dialogs live in a document.body portal, outside rootRef's GSAP selector scope.
      // Resolve the portal nodes explicitly so the animation keeps working without widening
      // the workbench context or handing GSAP an empty scoped selector.
      const backdrop = document.querySelector<HTMLElement>('[data-testid="wb-switch-confirm"]')
      const content = backdrop?.querySelector<HTMLElement>('[role="dialog"]')
      if (backdrop && content) revealDialog(backdrop, content)
    }
  }, { scope: rootRef, dependencies: [pendingSwitch] })
  const { hooks: hookMetas, matrix: hookMatrix } = hooksConfig
  const { boardLanes, summary } = useWorkbenchBoard({
    def,
    defaultWorkflow: readonlyWf,
    root,
    snapshot,
    readonlyWorkflow: readonlyWf,
    hookMetas,
    hookMatrix,
    t,
  })
  const selectedStep = def?.steps.find((step) => step.id === stageId) ?? null
  const { rules: rulesByKey } = useWorkflowRulesMulti(names && names.length > 0 ? [{ root, names }] : [])
  const menuNames = useMemo(() => [...(names ?? []), 'default'], [names])
  const stagesCountOf = (name: string): number | null =>
    name === 'default' ? DEFAULT_RULES.steps.length : rulesByKey.get(rulesKey(root, name))?.steps.length ?? null
  const currentStages = def?.steps.length ?? (wfName ? stagesCountOf(wfName) : null)
  const selectedLane = boardLanes.find((lane) => lane.id === stageId)
  return (
    <section data-testid="workbench-view" data-page-frame="standard" ref={rootRef} className="mx-auto w-full max-w-[1088px] pt-7 pb-5">
      <PageHeader eyebrow={root.split('/').filter(Boolean).at(-1) ?? root} title={t('workbench.title')} description={t('workbench.subtitle')} className="mb-5" />
      <WorkbenchHeader
        workflowName={wfName}
        currentStages={currentStages}
        menuOpen={menuOpen}
        menuNames={menuNames}
        stagesCountOf={stagesCountOf}
        readonly={readonlyWf}
        def={def}
        dirty={dirty}
        saving={saving}
        saveStatus={saveStatus}
        namesError={namesErrorText}
        defError={defErrorText}
        onMenuOpen={setMenuOpen}
        onSwitch={requestSwitch}
        onCreate={openWorkflowCreate}
        onDelete={openWorkflowDelete}
        onGovernance={() => setAdvancedOpen(true)}
        onSave={() => void save()}
      />
      {def && (
        <>
          <div className="mb-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm" data-testid="wb-track-context">
            <TrackSelector state={mandatory} />
          </div>
          <ExecutionTimelineComposer
            workflowName={def.name}
            lanes={boardLanes}
            selectedId={stageId}
            readonly={readonlyWf}
            hooks={hooksConfig}
            skillRegistry={mandatory.registry}
            selectedSkillZone={readonlyWf && stageId ? <LaneMandatorySkills phase={stageId} state={mandatory} readonly /> : undefined}
            prompt={selectedStep?.prompt ?? ''}
            onSelect={setStageId}
            onSkillMove={readonlyWf ? undefined : (move) => setDef((prev) => (prev ? moveSkillInDef(prev, move) : prev))}
            onSkillRemove={readonlyWf ? undefined : (laneId, skillId) => setDef((prev) => (prev ? removeSkillFromDef(prev, laneId, skillId) : prev))}
            onLaneEdit={readonlyWf ? undefined : editLane}
            onLaneGuard={readonlyWf ? undefined : (laneId, enabled) => setDef((prev) => (prev ? setLaneGuardInDef(prev, laneId, enabled) : prev))}
            onRemoveStage={readonlyWf ? undefined : removeStage}
            onAddStage={readonlyWf ? undefined : () => setAddStageOpen(true)}
            onStageReorder={readonlyWf ? undefined : (fromId, toId, after) => setDef((prev) => (prev ? reorderStagesInDef(prev, fromId, toId, after) : prev))}
            onPromptChange={readonlyWf || !selectedStep ? undefined : (prompt) => {
              if (prompt === '') {
                const { prompt: _prompt, ...withoutPrompt } = selectedStep
                replaceStep(withoutPrompt)
              } else {
                replaceStep({ ...selectedStep, prompt })
              }
            }}
            onOpenSkillEditor={readonlyWf ? undefined : () => setSkillEditorOpen(true)}
          />
        </>
      )}
      {!def && !defError && <p className="p-5 text-[13px] text-text-3" role="status" aria-live="polite">{t('common.loading')}</p>}
      {advancedOpen && <WorkbenchGovernanceDialog root={root} loops={loops} summary={summary} recent={recent} recentSilent={recentSilent} onClose={() => setAdvancedOpen(false)} />}
      {skillEditorOpen && selectedLane && (
        <SkillOrchestrationDialog
          lane={selectedLane}
          registry={mandatory.registry}
          onClose={() => setSkillEditorOpen(false)}
          onAdd={(laneId, skillId) => setDef((prev) => (prev ? addSkillToDef(prev, laneId, skillId) : prev))}
          onRemove={(laneId, skillId) => setDef((prev) => (prev ? removeSkillFromDef(prev, laneId, skillId) : prev))}
          onMove={(move) => setDef((prev) => (prev ? moveSkillInDef(prev, move) : prev))}
          onDependencyChange={(laneId, skillId, dep, prevDep) => setDef((prev) => (prev ? setSkillDepInDef(prev, laneId, skillId, dep, prevDep) : prev))}
        />
      )}
      <WorkbenchDialogs
        workflowName={wfName}
        pendingSwitch={pendingSwitch}
        onPendingSwitch={setPendingSwitch}
        onConfirmSwitch={confirmSwitch}
        createMode={workflowCreateMode}
        workflowNameRef={workflowNameRef}
        workflowDraftName={workflowDraftName}
        onWorkflowDraftName={(name) => { setWorkflowDraftName(name); setWorkflowOpErrors([]) }}
        workflowNameInvalid={workflowNameInvalid}
        workflowNameDuplicate={workflowNameDuplicate}
        workflowErrors={workflowOpErrors}
        workflowBusy={workflowOpBusy}
        canSubmitWorkflow={canSubmitWorkflow}
        onCloseWorkflowCreate={closeWorkflowCreate}
        onConfirmWorkflowCreate={() => void confirmWorkflowCreate()}
        deleteOpen={workflowDeleteTarget !== null}
        deleteBusy={workflowDeleteBusy}
        deleteError={workflowDeleteError}
        dirty={dirty}
        onCloseDelete={closeWorkflowDelete}
        onConfirmDelete={() => void confirmWorkflowDelete()}
        addStageOpen={addStageOpen}
        addStageNameRef={addStageNameRef}
        stageDraftName={stageDraftName}
        stageDraftId={stageDraftId}
        stageIdTouched={stageIdTouched}
        stageIdError={stageIdError}
        canSubmitStage={canSubmitStage}
        onStageDraftName={setStageDraftName}
        onStageDraftId={setStageDraftId}
        onStageIdTouched={() => setStageIdTouched(true)}
        onCloseAddStage={closeAddStage}
        onConfirmAddStage={confirmAddStage}
      />
    </section>
  )
}
