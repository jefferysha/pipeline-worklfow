import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchHostTargetPlan,
  fetchHostTargets,
  HostTargetPlanClientError,
} from '../api/hostTargetPlanClient'
import type {
  HostId,
  HostOperation,
  HostTarget,
  HostTargetCatalog,
  HostTargetPlan,
} from '../api/hostTargetPlanTypes'
import { useT } from '../i18n'
import {
  HostOperationPlanPanel,
  type HostPlanRequestState,
} from './HostOperationPlanPanel'

interface HostTargetPlanViewProps {
  loadTargets?: () => Promise<HostTargetCatalog>
  loadPlan?: (host: HostId, operation: HostOperation) => Promise<HostTargetPlan>
  copyText?: (text: string) => Promise<void>
}

type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; catalog: HostTargetCatalog }

const HOST_NAMES: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude',
  cursor: 'Cursor',
  gemini: 'Gemini',
  copilot: 'GitHub Copilot',
  pi: 'Pi',
  devin: 'Devin',
  zed: 'Zed',
  aider: 'Aider',
  continue: 'Continue',
  cline: 'Cline',
  amp: 'Amp',
}

function hostName(target: HostTarget): string {
  return HOST_NAMES[target.id] ?? target.id
}

function localizedError(
  error: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!(error instanceof HostTargetPlanClientError)) return t('hostPlan.errors.unknown')
  switch (error.code) {
    case 'HOST_TARGET_NETWORK_ERROR':
      return t('hostPlan.errors.network')
    case 'HOST_TARGET_QUERY_INVALID':
      return t('hostPlan.errors.query_invalid')
    case 'HOST_TARGET_PLAN_UNAVAILABLE':
      return t('hostPlan.errors.unavailable')
    case 'HOST_TARGET_PLAN_INVALID':
      return t('hostPlan.errors.upstream_invalid')
    case 'HOST_TARGET_CATALOG_RESPONSE_INVALID':
      return t('hostPlan.errors.catalog_invalid')
    case 'HOST_TARGET_PLAN_RESPONSE_INVALID':
      return t('hostPlan.errors.plan_invalid')
    case 'HOST_TARGET_PLAN_REQUEST_MISMATCH':
      return t('hostPlan.errors.mismatch')
    case 'HOST_TARGET_HTTP_ERROR':
      return t('hostPlan.errors.http', { status: error.status ?? 'unknown' })
  }
}

export function HostTargetPlanView({
  loadTargets = fetchHostTargets,
  loadPlan = fetchHostTargetPlan,
  copyText = async (text) => navigator.clipboard.writeText(text),
}: HostTargetPlanViewProps): JSX.Element {
  const { t } = useT()
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: 'loading' })
  const [selectedHost, setSelectedHost] = useState<HostId | null>(null)
  const [selectedOperation, setSelectedOperation] = useState<HostOperation | null>(null)
  const [planState, setPlanState] = useState<HostPlanRequestState>({ status: 'idle' })
  const requestSequence = useRef(0)

  const refreshCatalog = useCallback(() => {
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    setSelectedHost(null)
    setSelectedOperation(null)
    setPlanState({ status: 'idle' })
    setCatalogState({ status: 'loading' })
    void loadTargets().then(
      (catalog) => {
        if (requestSequence.current === sequence) setCatalogState({ status: 'ready', catalog })
      },
      (error: unknown) => {
        if (requestSequence.current === sequence) {
          setCatalogState({
            status: 'error',
            error,
          })
        }
      },
    )
  }, [loadTargets])

  useEffect(() => {
    refreshCatalog()
    return () => {
      requestSequence.current += 1
    }
  }, [refreshCatalog])

  const selectHost = (host: HostId): void => {
    requestSequence.current += 1
    setSelectedHost(host)
    setSelectedOperation(null)
    setPlanState({ status: 'idle' })
  }

  const requestPlan = (host: HostId, operation: HostOperation): void => {
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    setSelectedOperation(operation)
    setPlanState({ status: 'loading' })
    void loadPlan(host, operation).then(
      (plan) => {
        if (requestSequence.current === sequence) setPlanState({ status: 'ready', plan })
      },
      (error: unknown) => {
        if (requestSequence.current === sequence) {
          setPlanState({
            status: 'error',
            error,
          })
        }
      },
    )
  }

  return (
    <section className="mx-auto w-full max-w-[1120px] py-5" data-testid="host-plan-view">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-(--accent)">
          {t('hostPlan.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-text">{t('hostPlan.title')}</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-text-2">{t('hostPlan.subtitle')}</p>
      </header>

      {catalogState.status === 'loading' ? (
        <p className="mt-8 text-sm text-text-3" role="status">{t('hostPlan.catalog_loading')}</p>
      ) : catalogState.status === 'error' ? (
        <div className="mt-8 rounded-2xl border border-red-b bg-red-t p-5 text-red-d" role="alert">
          <p className="break-words text-sm">{localizedError(catalogState.error, t)}</p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-red-b bg-card px-3.5 py-2 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            onClick={refreshCatalog}
          >
            {t('hostPlan.catalog_retry')}
          </button>
        </div>
      ) : catalogState.catalog.targets.length === 0 ? (
        <div
          className="mt-8 rounded-2xl border border-dashed border-border-2 bg-card p-6 text-sm text-text-2"
          data-testid="host-plan-empty"
          role="status"
        >
          <p>{t('hostPlan.catalog_empty')}</p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-border-2 bg-bg px-3.5 py-2 text-sm font-bold text-text outline-none hover:bg-fill focus-visible:ring-2 focus-visible:ring-(--accent)"
            onClick={refreshCatalog}
          >
            {t('hostPlan.catalog_retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 max-[720px]:grid-cols-1" data-testid="host-target-grid">
            {catalogState.catalog.targets.map((target) => {
              const name = hostName(target)
              const selected = selectedHost === target.id
              return (
                <Fragment key={target.id}>
                <article
                  className={`min-w-0 rounded-2xl border bg-card p-5 shadow-sm ${
                    selected ? 'col-span-full border-(--accent) ring-1 ring-(--accent)' : 'border-border'
                  }`}
                  data-kind={target.kind}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-text">{name}</h2>
                      <p className="mt-1 font-mono text-xs text-text-3">{target.cli_flag}</p>
                    </div>
                    <span className="rounded-full border border-border bg-fill px-2 py-1 text-[11px] font-semibold text-text-2">
                      {t(`hostPlan.kind.${target.kind}`)}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-border bg-bg px-2 py-1 text-[11px] font-semibold text-text-3">
                      {t(`hostPlan.scope.${target.target_scope}`)}
                    </span>
                    {target.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-full border border-blue-b bg-blue-t px-2 py-1 text-[11px] font-semibold text-blue-d"
                      >
                        {t(`hostPlan.capability.${capability}`)}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-pressed={selected}
                    className="mt-5 w-full rounded-lg border border-border-2 bg-bg px-3.5 py-2 text-sm font-bold text-text outline-none hover:bg-fill focus-visible:ring-2 focus-visible:ring-(--accent)"
                    onClick={() => selectHost(target.id)}
                  >
                    {selected ? t('hostPlan.selected') : t('hostPlan.select', { host: name })}
                  </button>
                </article>
                {selected && (
                  <HostOperationPlanPanel
                    target={target}
                    targetLabel={name}
                    selectedOperation={selectedOperation}
                    planState={planState}
                    copyText={copyText}
                    onRequestPlan={requestPlan}
                    errorMessage={(error) => localizedError(error, t)}
                  />
                )}
                </Fragment>
              )
            })}
          </div>
          {selectedHost === null && (
            <p className="mt-5 text-sm text-text-2" role="status">{t('hostPlan.awaiting_host')}</p>
          )}
        </>
      )}
    </section>
  )
}
