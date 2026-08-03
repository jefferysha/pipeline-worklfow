import type { ChangeSnapshot } from '../types'
import { isPhase } from '../types'
import { DEFAULT_RULES, type WorkflowRules } from '../model/workflowModel'

type Tr = (key: string, vars?: Record<string, string | number>) => string
type TrackState = 'done' | 'current' | 'todo'

export function phaseLabel(
  step: string,
  labelByStep: Record<string, string> | undefined,
  t: Tr,
  executionModel?: WorkflowRules['executionModel'],
): string {
  const custom = executionModel === 'phase-manifest' ? undefined : labelByStep?.[step]
  if (custom) return custom
  return isPhase(step) ? t(`phases.${step}`) : step
}

export function MiniTrack({
  change,
  rules,
  failed,
  t,
}: {
  change: ChangeSnapshot
  rules: WorkflowRules | undefined
  failed: boolean
  t: Tr
}): JSX.Element {
  const steps = (rules?.steps ?? DEFAULT_RULES.steps).filter((step) => step !== 'archive')
  const currentIndex = steps.indexOf(change.phase)
  return (
    <span
      aria-hidden="true"
      data-testid={`afk-track-${change.name}`}
      data-phase={change.phase}
      className="mt-1.5 flex items-center gap-0"
    >
      {steps.map((step, index) => {
        const state: TrackState =
          currentIndex === -1
            ? 'todo'
            : index < currentIndex
              ? 'done'
              : index === currentIndex
                ? 'current'
                : 'todo'
        const reached = state !== 'todo'
        const dotClass =
          state === 'current'
            ? failed
              ? 'h-2 w-2 bg-red'
              : 'h-2 w-2 bg-(--accent)'
            : state === 'done'
              ? 'h-[7px] w-[7px] bg-border-2'
              : 'h-[7px] w-[7px] border border-border bg-transparent'
        return (
          <span key={step} className="flex flex-none items-center">
            {index > 0 && <span className={`h-px w-3 flex-none ${reached ? 'bg-border-2' : 'bg-border'}`} />}
            <span
              data-phase={step}
              data-state={state}
              data-error={state === 'current' && failed ? 'true' : undefined}
              title={phaseLabel(step, rules?.labelByStep, t, rules?.executionModel)}
              className={`flex-none rounded-full ${dotClass}`}
            />
          </span>
        )
      })}
    </span>
  )
}
