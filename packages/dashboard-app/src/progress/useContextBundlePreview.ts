import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ContextBundlePreviewApiError,
  fetchContextBundlePreview,
  type ContextBundlePhase,
  type ContextBundlePreviewFailure,
  type ContextBundlePreviewSuccess,
} from '../api/client'
import { CONTEXT_BUNDLE_PHASES } from '../api/contextBundleTypes'

const DEFAULT_BUDGET_BYTES = 120_000

export type ContextBundlePreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; preview: ContextBundlePreviewSuccess }
  | { kind: 'budget-error'; code: string; preview: ContextBundlePreviewFailure }
  | {
      kind: 'error'
      code: string
      path?: string
      metric?: string
      limit?: number
      actual?: number
    }

function nextCanonicalPhase(currentPhase: string): ContextBundlePhase {
  const index = CONTEXT_BUNDLE_PHASES.findIndex((phase) => phase === currentPhase)
  return index >= 0 && index < CONTEXT_BUNDLE_PHASES.length - 1
    ? CONTEXT_BUNDLE_PHASES[index + 1] ?? 'open'
    : 'open'
}

function phaseFromValue(value: string): ContextBundlePhase {
  return CONTEXT_BUNDLE_PHASES.find((phase) => phase === value) ?? 'open'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useContextBundlePreview({
  root,
  change,
  currentPhase,
}: {
  root: string
  change: string
  currentPhase: string
}) {
  const [target, setTarget] = useState<ContextBundlePhase>(() => nextCanonicalPhase(currentPhase))
  const [budgetText, setBudgetText] = useState(String(DEFAULT_BUDGET_BYTES))
  const [state, setState] = useState<ContextBundlePreviewState>({ kind: 'loading' })
  const activeRequest = useRef<AbortController | null>(null)
  const requestGeneration = useRef(0)

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
        setState({ kind: 'budget-error', code: error.code, preview: error.preview })
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
      setState({ kind: 'error', code: 'CONTEXT_BUNDLE_INVALID_REQUEST' })
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
    setState({ kind: 'error', code: 'CONTEXT_BUNDLE_INVALID_REQUEST' })
  }

  const onBudgetChange = (value: string) => {
    requestGeneration.current += 1
    activeRequest.current?.abort()
    setBudgetText(value)
    setState({ kind: 'idle' })
  }

  return {
    target,
    budgetText,
    state,
    submit,
    onTargetChange,
    onBudgetChange,
  }
}
