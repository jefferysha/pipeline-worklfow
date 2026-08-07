import { useCallback, useEffect, useState } from 'react'
import { TaskRunPanel } from '../afk/TaskRunPanel'
import { TaskPlanPanel } from '../taskPlan/TaskPlanPanel'
import { SkillInvocationEvidenceCard } from '../shared/SkillInvocationEvidenceCard'

export interface TaskPlanEvidenceSectionProps {
  readonly root: string
  readonly change: string
}

interface SelectionState {
  readonly scopeKey: string
  readonly workItemId: string | undefined
}

function makeScopeKey(root: string, change: string): string {
  return `${root}\u0000${change}`
}

export function TaskPlanEvidenceSection({ root, change }: TaskPlanEvidenceSectionProps): JSX.Element {
  const scopeKey = makeScopeKey(root, change)
  const [selection, setSelection] = useState<SelectionState>(() => ({ scopeKey, workItemId: undefined }))

  useEffect(() => {
    setSelection((current) => {
      if (current.scopeKey === scopeKey && current.workItemId === undefined) return current
      return { scopeKey, workItemId: undefined }
    })
  }, [scopeKey])

  const selectedWorkItemId = selection.scopeKey === scopeKey ? selection.workItemId : undefined
  const handleSelectedWorkItemChange = useCallback(
    (workItemId: string | undefined): void => {
      setSelection({ scopeKey, workItemId })
    },
    [scopeKey],
  )

  return (
    <>
      <TaskPlanPanel root={root} change={change} onSelectedWorkItemChange={handleSelectedWorkItemChange} />
      <SkillInvocationEvidenceCard root={root} change={change} workItemId={selectedWorkItemId} />
      <TaskRunPanel root={root} change={change} readOnly />
    </>
  )
}
