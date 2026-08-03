import { useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useT } from '../i18n'
import { STAGE_ID_RE } from './workbenchApiDecoders'
import type { WbStepDef, WbWorkflowDef } from './workbenchDefinition'

interface StageDraftInput {
  def: WbWorkflowDef | null
  stageId: string | null
  setDef: Dispatch<SetStateAction<WbWorkflowDef | null>>
  setStageId: Dispatch<SetStateAction<string | null>>
}

interface StageDraftController {
  addStageOpen: boolean
  setAddStageOpen: Dispatch<SetStateAction<boolean>>
  stageDraftName: string
  setStageDraftName: Dispatch<SetStateAction<string>>
  stageDraftId: string
  setStageDraftId: Dispatch<SetStateAction<string>>
  stageIdTouched: boolean
  setStageIdTouched: Dispatch<SetStateAction<boolean>>
  addStageNameRef: RefObject<HTMLInputElement>
  stageIdError: string | null
  canSubmitStage: boolean
  closeAddStage: () => void
  confirmAddStage: () => void
  draftDirty: boolean
}

export function useStageDraftEditor(input: StageDraftInput): StageDraftController {
  const { t } = useT()
  const [addStageOpen, setAddStageOpen] = useState(false)
  const [stageDraftName, setStageDraftName] = useState('')
  const [stageDraftId, setStageDraftId] = useState('')
  const [stageIdTouched, setStageIdTouched] = useState(false)
  const addStageNameRef = useRef<HTMLInputElement>(null)
  const trimmedId = stageDraftId.trim()
  const invalid = trimmedId.length > 0 && !STAGE_ID_RE.test(trimmedId)
  const duplicate = trimmedId.length > 0 && !invalid && (input.def?.steps.some((step) => step.id === trimmedId) ?? false)
  const stageIdError = invalid
    ? t('workbench.add_stage_id_invalid')
    : duplicate ? t('workbench.add_stage_id_dup') : null
  const canSubmitStage = trimmedId.length > 0 && !invalid && !duplicate

  function closeAddStage(): void {
    setAddStageOpen(false)
    setStageDraftName('')
    setStageDraftId('')
    setStageIdTouched(false)
  }

  function confirmAddStage(): void {
    if (!canSubmitStage || !input.def) return
    const id = trimmedId
    const label = stageDraftName.trim()
    input.setDef((current) => {
      if (!current) return current
      const selectedIndex = input.stageId ? current.steps.findIndex((step) => step.id === input.stageId) : -1
      const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : current.steps.length
      const previous = insertIndex > 0 ? current.steps[insertIndex - 1] : undefined
      const next = current.steps[insertIndex]
      let transitions: WbStepDef['transitions'] = []
      let steps = current.steps
      if (previous && next) {
        const transitionIndex = previous.transitions.findIndex((transition) => transition.to === next.id)
        if (transitionIndex >= 0) {
          transitions = [{ event: `${id}-complete`, to: next.id }]
          steps = current.steps.map((step, index) => index === insertIndex - 1
            ? { ...step, transitions: step.transitions.map((transition, position) => position === transitionIndex ? { ...transition, to: id } : transition) }
            : step)
        }
      } else if (previous) {
        steps = current.steps.map((step, index) => index === insertIndex - 1
          ? { ...step, transitions: [...step.transitions, { event: `${step.id}-complete`, to: id }] }
          : step)
      }
      const nextSteps = [...steps]
      nextSteps.splice(insertIndex, 0, {
        id, label, gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions,
      })
      return { ...current, steps: nextSteps }
    })
    input.setStageId(id)
    closeAddStage()
  }

  return {
    addStageOpen, setAddStageOpen, stageDraftName, setStageDraftName, stageDraftId, setStageDraftId,
    stageIdTouched, setStageIdTouched, addStageNameRef, stageIdError, canSubmitStage,
    closeAddStage, confirmAddStage,
    draftDirty: addStageOpen && (stageDraftName !== '' || stageDraftId !== ''),
  }
}
