import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ContextBundlePreviewApiError,
  fetchContextBundlePreview,
  type ContextBundlePhase,
  type ContextBundlePreviewFailure,
  type ContextBundlePreviewInput,
  type ContextBundleReasonCode,
  type ContextBundlePreviewSuccess,
} from '../api/client'
import { CONTEXT_BUNDLE_PHASES } from '../api/contextBundleTypes'
import { useT } from '../i18n'

const DEFAULT_BUDGET_BYTES = 120_000

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; preview: ContextBundlePreviewSuccess }
  | {
      kind: 'budget-error'
      code: string
      preview: ContextBundlePreviewFailure
    }
  | {
      kind: 'error'
      code: string
      path?: string
      metric?: string
      limit?: number
      actual?: number
    }

export interface ContextBundlePreviewProps {
  root: string
  change: string
  currentPhase: string
}

function nextCanonicalPhase(currentPhase: string): ContextBundlePhase {
  const index = CONTEXT_BUNDLE_PHASES.findIndex((phase) => phase === currentPhase)
  return index >= 0 && index < CONTEXT_BUNDLE_PHASES.length - 1
    ? CONTEXT_BUNDLE_PHASES[index + 1] ?? 'open'
    : 'open'
}

const ERROR_KEYS: Readonly<Record<string, string>> = {
  CONTEXT_BUNDLE_INVALID_REQUEST: 'progress.bundle_error_invalid',
  CONTEXT_BUNDLE_STATE_CORRUPT: 'progress.bundle_error_state_corrupt',
  CONTEXT_BUNDLE_LEDGER_MISSING: 'progress.bundle_error_ledger_missing',
  CONTEXT_BUNDLE_DOCUMENT_MISSING: 'progress.bundle_error_document_missing',
  CONTEXT_BUNDLE_DOCUMENT_STALE: 'progress.bundle_error_document_stale',
  CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED: 'progress.bundle_error_resource_limit',
  CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE: 'progress.bundle_error_trusted_reader_unavailable',
  CONTEXT_BUNDLE_NETWORK_ERROR: 'progress.bundle_error_network',
  CONTEXT_BUNDLE_INVALID_RESPONSE: 'progress.bundle_error_invalid_response',
  CONTEXT_BUNDLE_REQUEST_FAILED: 'progress.bundle_error_request_failed',
}

const REPAIR_KEYS: Readonly<Record<string, string>> = {
  CONTEXT_BUNDLE_INVALID_REQUEST: 'progress.bundle_repair_invalid',
  CONTEXT_BUNDLE_STATE_CORRUPT: 'progress.bundle_repair_state_corrupt',
  CONTEXT_BUNDLE_LEDGER_MISSING: 'progress.bundle_repair_ledger_missing',
  CONTEXT_BUNDLE_DOCUMENT_MISSING: 'progress.bundle_repair_document_missing',
  CONTEXT_BUNDLE_DOCUMENT_STALE: 'progress.bundle_repair_document_stale',
  CONTEXT_BUNDLE_RESOURCE_LIMIT_EXCEEDED: 'progress.bundle_repair_resource_limit',
  CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE: 'progress.bundle_repair_trusted_reader_unavailable',
  CONTEXT_BUNDLE_NETWORK_ERROR: 'progress.bundle_repair_network',
  CONTEXT_BUNDLE_INVALID_RESPONSE: 'progress.bundle_repair_invalid_response',
  CONTEXT_BUNDLE_REQUEST_FAILED: 'progress.bundle_repair_request_failed',
}

const REASON_I18N_KEYS: Readonly<Record<ContextBundleReasonCode, string>> = {
  'context-bundle.reason.proposal': 'progress.bundle_reason_proposal',
  'context-bundle.reason.openspec-design': 'progress.bundle_reason_openspec_design',
  'context-bundle.reason.tasks': 'progress.bundle_reason_tasks',
  'context-bundle.reason.superpower-design': 'progress.bundle_reason_superpower_design',
  'context-bundle.reason.adr': 'progress.bundle_reason_adr',
  'context-bundle.reason.delta-spec': 'progress.bundle_reason_delta_spec',
  'context-bundle.reason.superpower-plan': 'progress.bundle_reason_superpower_plan',
  'context-bundle.reason.plan': 'progress.bundle_reason_plan',
  'context-bundle.reason.verification-report': 'progress.bundle_reason_verification_report',
  'context-bundle.reason.applied-spec': 'progress.bundle_reason_applied_spec',
}

function phaseFromValue(value: string): ContextBundlePhase {
  return CONTEXT_BUNDLE_PHASES.find((phase) => phase === value) ?? 'open'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function PreviewInputs({
  inputs,
  formatNumber,
}: {
  inputs: ContextBundlePreviewInput[]
  formatNumber: (value: number) => string
}): JSX.Element {
  const { t } = useT()
  return (
    <ul className="space-y-2" aria-label={t('progress.bundle_inputs_label')}>
      {inputs.map((input) => (
        <li
          className="rounded-lg border border-border bg-fill px-3 py-2.5"
          key={`${input.kind}:${input.path}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all text-xs font-semibold text-text">{input.path}</code>
            <span className="rounded-md bg-fill-2 px-1.5 py-0.5 font-mono text-[10px] text-text-2">
              {input.kind}
            </span>
            <span className="rounded-md bg-accent-t px-1.5 py-0.5 font-mono text-[10px] text-accent-d">
              {input.mode}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-text-3">
            {t(REASON_I18N_KEYS[input.reasonCode])}
          </p>
          <p className="mt-1 font-mono text-[11px] text-text-2">
            {t('progress.bundle_input_bytes', {
              source: formatNumber(input.sourceBytes),
              materialized: formatNumber(input.materializedBytes),
            })}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function ContextBundlePreview({
  root,
  change,
  currentPhase,
}: ContextBundlePreviewProps): JSX.Element {
  const { t, lang } = useT()
  const initialTarget = nextCanonicalPhase(currentPhase)
  const [target, setTarget] = useState<ContextBundlePhase>(initialTarget)
  const [budgetText, setBudgetText] = useState(String(DEFAULT_BUDGET_BYTES))
  const [state, setState] = useState<PreviewState>({ kind: 'loading' })
  const activeRequest = useRef<AbortController | null>(null)
  const requestGeneration = useRef(0)
  const formatNumber = useCallback(
    (value: number) => new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US').format(value),
    [lang],
  )

  const load = useCallback(async (nextTarget: ContextBundlePhase, budgetBytes: number) => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const generation = requestGeneration.current + 1
    requestGeneration.current = generation
    setState({ kind: 'loading' })
    try {
      const preview = await fetchContextBundlePreview({
        root,
        change,
        target: nextTarget,
        budgetBytes,
        signal: controller.signal,
      })
      if (!controller.signal.aborted && generation === requestGeneration.current) {
        setState({ kind: 'success', preview })
      }
    } catch (error) {
      if (controller.signal.aborted || generation !== requestGeneration.current || isAbortError(error)) return
      if (
        error instanceof ContextBundlePreviewApiError
        && error.code === 'CONTEXT_BUNDLE_BUDGET_EXCEEDED'
        && error.preview
      ) {
        setState({
          kind: 'budget-error',
          code: error.code,
          preview: error.preview,
        })
        return
      }
      setState({
        kind: 'error',
        code: error instanceof ContextBundlePreviewApiError
          ? error.code
          : 'CONTEXT_BUNDLE_UNKNOWN_ERROR',
        ...(error instanceof ContextBundlePreviewApiError && error.detail?.path
          ? { path: error.detail.path }
          : {}),
        ...(error instanceof ContextBundlePreviewApiError && error.detail?.metric
          ? { metric: error.detail.metric }
          : {}),
        ...(error instanceof ContextBundlePreviewApiError && error.detail?.limit !== undefined
          ? { limit: error.detail.limit }
          : {}),
        ...(error instanceof ContextBundlePreviewApiError && error.detail?.actual !== undefined
          ? { actual: error.detail.actual }
          : {}),
      })
    }
  }, [change, root])

  useEffect(() => {
    const nextTarget = nextCanonicalPhase(currentPhase)
    setTarget(nextTarget)
    setBudgetText(String(DEFAULT_BUDGET_BYTES))
    void load(nextTarget, DEFAULT_BUDGET_BYTES)
    return () => {
      requestGeneration.current += 1
      activeRequest.current?.abort()
    }
  }, [change, currentPhase, load, root])

  const parsedBudget = Number(budgetText)
  const budgetValid = Number.isSafeInteger(parsedBudget) && parsedBudget > 0

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!budgetValid) {
      setState({
        kind: 'error',
        code: 'CONTEXT_BUNDLE_INVALID_REQUEST',
      })
      return
    }
    void load(target, parsedBudget)
  }

  const onTargetChange = (value: string) => {
    const nextTarget = phaseFromValue(value)
    setTarget(nextTarget)
    if (budgetValid) {
      void load(nextTarget, parsedBudget)
      return
    }
    requestGeneration.current += 1
    activeRequest.current?.abort()
    setState({
      kind: 'error',
      code: 'CONTEXT_BUNDLE_INVALID_REQUEST',
    })
  }

  const onBudgetChange = (value: string) => {
    requestGeneration.current += 1
    activeRequest.current?.abort()
    setBudgetText(value)
    setState({ kind: 'idle' })
  }

  const buttonLabel = state.kind === 'budget-error' || state.kind === 'error'
    ? t('progress.bundle_retry')
    : state.kind === 'success'
      ? t('progress.bundle_resubmit')
      : t('progress.bundle_submit')

  return (
    <section
      className="mt-4 rounded-xl border border-border-2 bg-card p-4"
      aria-labelledby="context-bundle-preview-title"
    >
      <div>
        <h2 id="context-bundle-preview-title" className="text-sm font-semibold text-text">
          {t('progress.bundle_title')}
        </h2>
        <p className="mt-1 text-xs leading-5 text-text-3">
          {t('progress.bundle_description')}
        </p>
      </div>

      <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={submit}>
        <label className="grid gap-1 text-xs font-medium text-text-2">
          {t('progress.bundle_target_label')}
          <select
            className="h-9 rounded-lg border border-border bg-fill px-2 text-sm text-text outline-none transition-colors hover:border-border-2 focus-visible:border-(--accent) focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            value={target}
            onChange={(event) => onTargetChange(event.currentTarget.value)}
          >
            {CONTEXT_BUNDLE_PHASES.map((phase) => (
              <option key={phase} value={phase}>{t(`phases.${phase}`)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-text-2">
          {t('progress.bundle_budget_label')}
          <input
            className="h-9 rounded-lg border border-border bg-fill px-2 font-mono text-sm text-text outline-none transition-colors hover:border-border-2 focus-visible:border-(--accent) focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={budgetText}
            onChange={(event) => onBudgetChange(event.currentTarget.value)}
          />
        </label>
        <button
          className="h-9 rounded-lg bg-btn-hover px-3 text-xs font-semibold text-btn-fg outline-none transition-[filter,transform] hover:brightness-90 active:translate-y-px active:brightness-75 focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transform-none disabled:cursor-wait disabled:opacity-50"
          type="submit"
          disabled={state.kind === 'loading'}
        >
          {buttonLabel}
        </button>
      </form>

      <div className="mt-4" aria-live="polite">
        {state.kind === 'idle' && (
          <p className="text-xs text-text-3">{t('progress.bundle_idle')}</p>
        )}
        {state.kind === 'loading' && (
          <p className="text-xs text-text-3" role="status">{t('progress.bundle_loading')}</p>
        )}

        {state.kind === 'success' && state.preview.inputs.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-2 px-3 py-4 text-xs text-text-3">
            {t('progress.bundle_empty')}
          </div>
        )}

        {state.kind === 'success' && state.preview.inputs.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong className="font-mono text-sm text-text">
                {formatNumber(state.preview.budget.usedBytes)} / {formatNumber(state.preview.budget.maxBytes)} bytes
              </strong>
              <span className="text-xs text-text-3">
                {t('progress.bundle_document_count', { count: state.preview.documentCount })}
              </span>
            </div>
            <PreviewInputs inputs={state.preview.inputs} formatNumber={formatNumber} />
          </div>
        )}

        {state.kind === 'budget-error' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amb-b bg-amb-t px-3 py-2.5 text-xs text-amb-d" role="alert">
              <p className="font-semibold">
                {t('progress.bundle_budget_error', {
                  required: formatNumber(state.preview.budget.usedBytes),
                  available: formatNumber(state.preview.budget.maxBytes),
                })}
              </p>
              <code className="mt-1 block text-[10px]">{state.code}</code>
              <p className="mt-1">{t('progress.bundle_budget_repair')}</p>
            </div>
            <PreviewInputs inputs={state.preview.inputs} formatNumber={formatNumber} />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-lg border border-red-b bg-red-t px-3 py-2.5 text-xs text-red-d" role="alert">
            <p className="font-semibold">{t('progress.bundle_error_title')}</p>
            <code className="mt-1 block text-[10px]">{state.code}</code>
            <p className="mt-1">
              {t(ERROR_KEYS[state.code] ?? 'progress.bundle_error_unknown', {
                path: state.path ?? '—',
                metric: state.metric ?? '—',
                limit: state.limit === undefined ? '—' : formatNumber(state.limit),
                actual: state.actual === undefined ? '—' : formatNumber(state.actual),
              })}
            </p>
            <p className="mt-1">
              {t(REPAIR_KEYS[state.code] ?? 'progress.bundle_error_repair')}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
