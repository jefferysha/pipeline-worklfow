import { formatApiError } from '../api/transport'

type Translate = (key: string, vars?: Record<string, string | number>) => string

interface FirstStepStatusProps {
  state: 'idle' | 'loading' | 'ready' | 'error'
  firstStep: string | null
  error: unknown | null
  workflow: string
  lang: string
  t: Translate
}

export function FirstStepStatus({ state, firstStep, error, workflow, lang, t }: FirstStepStatusProps): JSX.Element {
  const value = state === 'loading'
    ? t('change_create.step_loading')
    : t('change_create.first_step', {
        step: state === 'ready' && firstStep === null
          ? t('change_create.workflow_empty', { workflow })
          : error === null ? firstStep ?? '—' : formatApiError(error, t, { exposeServerDetail: lang === 'zh' }),
      })
  return <span className="mt-1.5 block normal-case tracking-normal text-text-3" data-testid="route-first-step" role="status" aria-live="polite">{value}</span>
}
