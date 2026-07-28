import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { deleteWorkflowDef, fetchWorkflow, fetchWorkflowNames, postWorkflowDef } from '../api/client'
import { useT } from '../i18n'
import { DEFAULT_RULES, invalidateWorkflowRules, rulesKey, useWorkflowRulesMulti } from '../model/workflowModel'
import { isPhase } from '../types'
import { revealDialog, revealList } from '../shared/motion'
import { PageHeader } from '../shared/PageHeader'
import './workbench.css'
import { LOCKED_IDS, useHooksConfig } from './HookTimeline'
import { useLoops } from './LoopCard'
import { LaneMandatorySkills, TrackSelector, useMandatorySkills } from './mandatorySkills'
import { type BoardLane, type LanePatch } from './OrchestrationBoard'
import { ExecutionTimelineComposer } from './ExecutionTimelineComposer'
import { SkillOrchestrationDialog } from './SkillOrchestrationDialog'
import { readErrorDetail, readSaveErrors, STAGE_ID_RE } from './workbenchApiDecoders'
import { useRecentWorkflowHistory } from './useRecentWorkflowHistory'
import { WorkbenchDialogs } from './WorkbenchDialogs'
import { WorkbenchHeader } from './WorkbenchHeader'
import { WorkbenchGovernanceDialog } from './WorkbenchGovernanceDialog'
import type { WorkbenchViewProps } from './workbenchViewTypes'
import {
  DEFAULT_DEF,
  addSkillToDef,
  governedWorkflow,
  moveSkillInDef,
  removeSkillFromDef,
  removeStageFromDef,
  reorderStagesInDef,
  setLaneGuardInDef,
  setSkillDepInDef,
  stageCounts,
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
  const { t } = useT()
  const [names, setNames] = useState<string[] | null>(null)
  const [namesError, setNamesError] = useState<string | null>(null)
  const [wfName, setWfName] = useState<string | null>(null)
  const [def, setDef] = useState<WbWorkflowDef | null>(null)
  const [defError, setDefError] = useState<string | null>(null)
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
  const [workflowDeleteOpen, setWorkflowDeleteOpen] = useState(false)
  const [workflowDeleteBusy, setWorkflowDeleteBusy] = useState(false)
  const [workflowDeleteError, setWorkflowDeleteError] = useState<{
    message: string
    references: Array<{ kind?: string; source?: string }>
    blockers: Array<{ source?: string; detail?: string }>
  } | null>(null)
  const workflowNameRef = useRef<HTMLInputElement>(null); const rootRef = useRef<HTMLElement>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false); const [skillEditorOpen, setSkillEditorOpen] = useState(false)
  const defSnapshotRef = useRef<string | null>(null)
  const hooksConfig = useHooksConfig(root, onToggleError)
  const mandatory = useMandatorySkills(root)
  const { recent, recentSilent } = useRecentWorkflowHistory(snapshot, root, wfName)
  const loops = useLoops(root)
  useEffect(() => {
    let cancelled = false
    fetchWorkflowNames(root)
      .then((names) => {
        if (cancelled) return
        setNames(names)
        setNamesError(null)
        setWfName((cur) => cur ?? names[0] ?? 'default')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setNames([])
        setNamesError(t('workbench.names_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') }))
        setWfName((cur) => cur ?? 'default')
      })
    return () => {
      cancelled = true
    }
  }, [root, t])
  useEffect(() => {
    if (!wfName) return
    setSaveStatus({ kind: 'idle' }) // 上一个 workflow 的保存态不跨名残留
    if (wfName === 'default') {
      setDef(DEFAULT_DEF)
      setDefError(null)
      defSnapshotRef.current = null // default 只读态：永不参与 dirty 判定
      return
    }
    let cancelled = false
    setDef(null)
    setDefError(null)
    defSnapshotRef.current = null
    fetchWorkflow(wfName, root)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<WbWorkflowDef>
      })
      .then((body) => {
        if (cancelled) return
        setDef(body)
        setDefError(null)
        defSnapshotRef.current = JSON.stringify(body)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDefError(t('workbench.def_error', { msg: err instanceof Error ? err.message : t('workbench.network_error') }))
      })
    return () => {
      cancelled = true
    }
  }, [root, wfName, t])
  useEffect(() => {
    if (!def) return
    setStageId((cur) => (cur && def.steps.some((s) => s.id === cur) ? cur : def.steps[0]?.id ?? null))
  }, [def])
  const readonlyWf = wfName === 'default'
  const dirty = !readonlyWf && def !== null && defSnapshotRef.current !== null && JSON.stringify(def) !== defSnapshotRef.current
  function editLane(laneId: string, patch: LanePatch): void {
    setDef((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((s) => {
          if (s.id !== laneId) return s
          const next: WbStepDef = { ...s }
          if (patch.label !== undefined) next.label = patch.label
          if (patch.gate !== undefined) next.gate = patch.gate
          if (patch.outputs !== undefined) {
            const byField = new Map(s.outputs.map((o) => [o.field, o]))
            next.outputs = patch.outputs.map((f) => byField.get(f) ?? { field: f, type: 'string' as const })
          }
          return next
        }),
      }
    })
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
    setSaving(true)
    setSaveStatus({ kind: 'idle' })
    try {
      const res = await postWorkflowDef(wfName, { ...def, root })
      if (!res.ok) {
        setSaveStatus({ kind: 'error', errors: await readSaveErrors(res) })
        return
      }
      invalidateWorkflowRules(root, wfName)
      defSnapshotRef.current = JSON.stringify(def)
      setSaveStatus({ kind: 'ok' })
    } catch (err) {
      setSaveStatus({ kind: 'error', errors: [err instanceof Error ? err.message : t('workbench.network_error')] })
    } finally {
      setSaving(false)
    }
  }
  function switchTo(name: string): void {
    setWfName(name)
    setDef(name === 'default' ? DEFAULT_DEF : null)
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
    const nextDef = workflowCreateMode === 'copy'
      ? wfName === 'default'
        ? governedWorkflow(workflowName)
        : { ...def, name: workflowName, steps: (def?.steps ?? []).map((step) => ({
          ...step,
          skills: step.skills.map((skill) => ({ ...skill, depends_on: skill.depends_on ? [...skill.depends_on] : undefined })),
          inputs: step.inputs.map((field) => ({ ...field })),
          outputs: step.outputs.map((field) => ({ ...field })),
          guards: step.guards.map((guard) => ({ ...guard })),
          transitions: step.transitions.map((transition) => ({ ...transition })),
        })) }
      : governedWorkflow(workflowName)
    setWorkflowOpBusy(true)
    setWorkflowOpErrors([])
    try {
      const res = await postWorkflowDef(workflowName, { root, ...nextDef })
      if (!res.ok) {
        setWorkflowOpErrors(await readSaveErrors(res))
        return
      }
      invalidateWorkflowRules(root, workflowName)
      setNames((prev) => [...new Set([...(prev ?? []), workflowName])].sort())
      setWorkflowCreateMode(null)
      setWorkflowDraftName('')
      switchTo(workflowName)
    } catch (err) {
      setWorkflowOpErrors([err instanceof Error ? err.message : t('workbench.network_error')])
    } finally {
      setWorkflowOpBusy(false)
    }
  }
  function openWorkflowDelete(): void {
    if (!wfName || wfName === 'default') return
    setWorkflowDeleteError(null)
    setWorkflowDeleteOpen(true)
  }
  function closeWorkflowDelete(): void {
    if (workflowDeleteBusy) return
    setWorkflowDeleteOpen(false)
    setWorkflowDeleteError(null)
  }
  async function confirmWorkflowDelete(): Promise<void> {
    if (!wfName || wfName === 'default' || workflowDeleteBusy) return
    const deleting = wfName
    setWorkflowDeleteBusy(true)
    setWorkflowDeleteError(null)
    try {
      const res = await deleteWorkflowDef(deleting, root)
      if (!res.ok) {
        let body: {
          error?: string
          code?: string
          references?: Array<{ kind?: string; source?: string }>
          blockers?: Array<{ source?: string; detail?: string }>
        } = {}
        try { body = await res.json() as typeof body } catch {  }
        setWorkflowDeleteError({
          message: body.error ?? (body.code === 'WORKFLOW_REFERENCED'
            ? t('workbench.workflow_delete_referenced')
            : t('workbench.workflow_delete_failed', { status: res.status })),
          references: Array.isArray(body.references) ? body.references : [],
          blockers: Array.isArray(body.blockers) ? body.blockers : [],
        })
        return
      }
      invalidateWorkflowRules(root, deleting)
      const remaining = (names ?? []).filter((name) => name !== deleting)
      setNames(remaining)
      setWorkflowDeleteOpen(false)
      setWorkflowDeleteError(null)
      switchTo(remaining[0] ?? 'default')
    } catch (err) {
      setWorkflowDeleteError({
        message: err instanceof Error ? err.message : t('workbench.network_error'),
        references: [],
        blockers: [],
      })
    } finally {
      setWorkflowDeleteBusy(false)
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
      revealDialog(
        '[data-testid="wb-switch-confirm"]',
        '[data-testid="wb-switch-confirm"] [role="dialog"]',
      )
    }
  }, { scope: rootRef, dependencies: [pendingSwitch] })
  const stepName = useCallback(
    (s: WbStepDef): string => s.label || (isPhase(s.id) ? t(`phases.${s.id}`) : s.id),
    [t],
  )
  const { hooks: hookMetas, matrix: hookMatrix } = hooksConfig
  const hookCountOf = useCallback(
    (stageId: string): number | undefined =>
      hookMetas === null ? undefined : hookMetas.filter((h) => !(`${h.id}.${stageId}` in hookMatrix)).length,
    [hookMetas, hookMatrix],
  )
  const ambientByStage = useMemo(
    () => (wfName ? stageCounts(snapshot, root, wfName) : {}),
    [snapshot, root, wfName],
  )
  const hookLockedOf = useCallback(
    (): number | undefined =>
      hookMetas === null ? undefined : hookMetas.filter((h) => !h.configurable && LOCKED_IDS.has(h.id)).length,
    [hookMetas],
  )
  const boardLanes: BoardLane[] = useMemo(() => {
    if (!def) return []
    return def.steps.map((s, i) => {
      const next = def.steps[i + 1]
      const fwd = next ? s.transitions.find((tr) => tr.to === next.id) : undefined
      const amb = ambientByStage[s.id]
      return {
        id: s.id,
        name: stepName(s),
        gate: s.gate,
        skills: readonlyWf ? undefined : [...new Set(s.skills.map((sk) => sk.id))],
        skillDeps: readonlyWf
          ? undefined
          : Object.fromEntries(
              s.skills.map((sk) => {
                const inLane = new Set(s.skills.map((k) => k.id))
                return [sk.id, (sk.depends_on ?? []).filter((d) => inLane.has(d))]
              }),
            ),
        outputs: s.outputs.map((o) => o.field),
        nonemptyGuard: readonlyWf ? undefined : s.guards.some((g) => g.type === 'nonempty-output'),
        hooksCount: hookCountOf(s.id),
        hooksLocked: hookLockedOf(),
        linkEvent: fwd?.event ?? null,
        count: amb?.count ?? 0,
        running: amb?.running ?? false,
      }
    })
  }, [def, stepName, hookCountOf, hookLockedOf, ambientByStage, readonlyWf])
  const selectedStep = def?.steps.find((step) => step.id === stageId) ?? null
  const summary = useMemo(() => {
    if (!def) return null
    const skillIds = new Set<string>()
    for (const s of def.steps) for (const sk of s.skills) skillIds.add(sk.id)
    return {
      stages: def.steps.length,
      gates: def.steps.filter((s) => s.gate !== null).length,
      skills: skillIds.size,
      hooks: hookMetas === null
        ? null
        : hookMetas.filter((h) => def.steps.every((s) => !(`${h.id}.${s.id}` in hookMatrix))).length,
    }
  }, [def, hookMetas, hookMatrix])
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
        namesError={namesError}
        defError={defError}
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
        deleteOpen={workflowDeleteOpen}
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
