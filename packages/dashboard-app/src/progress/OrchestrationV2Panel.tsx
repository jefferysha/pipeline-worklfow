import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RefreshCw, Square } from 'lucide-react'
import type { BoardEventV2, BoardSnapshotV2 } from '@tenon/kernel'
import { formatApiError } from '../api/transport'
import { fetchOrchestrationV2Snapshot, postOrchestrationV2Command, postOrchestrationV2Control, sortUniqueEvents, subscribeOrchestrationV2 } from '../api/orchestrationV2Client'
import { useT } from '../i18n'

export interface OrchestrationV2PanelProps {
  readonly root: string
  readonly change: string | null | undefined
  readonly readOnly?: boolean
  readonly onToast?: (message: string) => void
}

const statusTone: Record<string, string> = {
  completed: 'text-green-700 dark:text-green-300', executing: 'text-sky-700 dark:text-sky-300', running: 'text-sky-700 dark:text-sky-300',
  blocked: 'text-red-700 dark:text-red-300', failed: 'text-red-700 dark:text-red-300', paused: 'text-amber-700 dark:text-amber-300',
}

export function OrchestrationV2Panel({ root, change, readOnly = false, onToast }: OrchestrationV2PanelProps): JSX.Element | null {
  const { t } = useT()
  const [snapshot, setSnapshot] = useState<BoardSnapshotV2 | null>(null)
  const [events, setEvents] = useState<readonly BoardEventV2[]>([])
  const [error, setError] = useState<unknown>(null)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)

  useEffect(() => {
    revision.current = 0
    setSnapshot(null)
    setEvents([])
    setError(null)
    setConnected(false)
    if (!change) return
    const controller = new AbortController()
    let disposed = false
    void fetchOrchestrationV2Snapshot(root, change, controller.signal).then((next) => {
      if (disposed) return
      if (next.revision < revision.current) return
      revision.current = Math.max(revision.current, next.revision)
      setSnapshot(next)
      setError(null)
    }).catch((reason: unknown) => {
      if (!disposed && !(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason)
    })
    const unsubscribe = subscribeOrchestrationV2(root, change, (frame) => {
      if (disposed) return
      const frameRevision = frame.value.revision
      if (frameRevision < revision.current) return
      revision.current = frameRevision
      setConnected(true)
      setError(null)
      if (frame.kind === 'snapshot') setSnapshot(frame.value)
      else setEvents((previous) => sortUniqueEvents([...previous, frame.value]))
    }, () => {
      if (!disposed) setConnected(false)
    })
    return () => {
      disposed = true
      controller.abort()
      unsubscribe()
    }
  }, [change, root])

  const counts = useMemo(() => {
    const values = snapshot?.work_items ?? []
    return { done: values.filter((item) => item.status === 'completed').length, total: values.length, running: values.filter((item) => item.status === 'running').length }
  }, [snapshot])

  const refresh = async (): Promise<void> => {
    if (!change || busy) return
    setBusy(true)
    try {
      const next = await fetchOrchestrationV2Snapshot(root, change)
      if (next.revision < revision.current) return
      revision.current = Math.max(revision.current, next.revision)
      setSnapshot(next)
      setError(null)
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
    }
  }

  if (!change) return null
  const action = async (type: 'pause-change' | 'resume-change' | 'cancel-change'): Promise<void> => {
    if (!snapshot || busy || readOnly) return
    setBusy(true)
    try {
      const next = await postOrchestrationV2Control(root, snapshot, type)
      revision.current = Math.max(revision.current, next.revision)
      setSnapshot(next)
      onToast?.(type === 'cancel-change' ? t('progress.orchestration_cancel_ok') : type === 'pause-change' ? t('progress.orchestration_pause_ok') : t('progress.orchestration_resume_ok'))
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
    }
  }

  const dispatch = async (type: Parameters<typeof postOrchestrationV2Command>[2], payload: Record<string, unknown> = {}): Promise<void> => {
    if (!snapshot || busy || readOnly) return
    setBusy(true)
    try {
      const next = await postOrchestrationV2Command(root, snapshot, type, payload)
      revision.current = Math.max(revision.current, next.revision)
      setSnapshot(next)
      onToast?.(t('progress.orchestration_command_ok', { command: type }))
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
    }
  }

  const retryItem = (workItemId: string): void => {
    const previous = snapshot?.runs.filter((run) => run.work_item_id === workItemId).at(-1)
    if (!previous) return
    const nonce = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}`
    void dispatch('retry-work-item', { work_item_id: workItemId, attempt_id: `attempt:dashboard:${nonce}`, run_id: `run:dashboard:${nonce}` })
  }

  const evaluateGate = (status: 'passed' | 'rejected'): void => {
    if (!snapshot) return
    const nonce = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}`
    const gateId = snapshot.gates.find((gate) => gate.status === 'pending')?.gate_id ?? `verification:${snapshot.change_id}`
    const evidence = snapshot.validations.filter((report) => report.status === 'pass').flatMap((report) => report.evidence_refs)
    void dispatch('evaluate-gate', { gate: {
      schema_version: 'gate-evaluation/v2', record_id: `gate:${gateId}`, project_id: snapshot.project_id, change_id: snapshot.change_id,
      revision: snapshot.revision, correlation_id: snapshot.correlation_id, actor: { kind: 'user', id: 'dashboard' }, created_at: new Date().toISOString(),
      gate_id: gateId, kind: 'verification', status, required_evidence_refs: evidence, decision_revision: snapshot.revision, rationale: `dashboard:${status}:${nonce}`,
    } })
  }

  const bindArtifact = (workItemId: string): void => {
    const ref = globalThis.prompt?.(t('progress.orchestration_artifact_prompt'))?.trim()
    if (!ref) return
    const digest = globalThis.prompt?.(t('progress.orchestration_digest_prompt'))?.trim()
    if (!digest || !/^sha256:[a-f0-9]{64}$/u.test(digest)) { setError(new Error('artifact digest must be sha256')); return }
    void dispatch('bind-artifact', { work_item_id: workItemId, artifact_ref: ref, digest })
  }

  const status = snapshot?.status ?? 'loading'
  const progress = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100)
  return (
    <section className="mt-5 rounded-xl border border-border-2 bg-card/80 p-4 shadow-sm" data-testid="orchestration-v2-panel" aria-label={t('progress.orchestration_title')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-text">{t('progress.orchestration_title')}</h2>
            <span className={`text-[12px] font-semibold ${statusTone[status] ?? 'text-text-3'}`} data-testid="orchestration-v2-status">{status}</span>
            <span className="text-[11px] text-text-3" data-testid="orchestration-v2-revision">rev {snapshot?.revision ?? '—'}</span>
          </div>
          <p className="mt-1 text-[12px] text-text-3">{connected ? t('progress.orchestration_connected') : t('progress.orchestration_syncing')} · {t('progress.orchestration_counts', counts)}</p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && status === 'executing' && <button type="button" aria-label={t('progress.orchestration_pause')} disabled={busy || !snapshot} onClick={() => { void action('pause-change') }} className="rounded-md border border-border-2 px-2 py-1 text-xs hover:bg-fill disabled:opacity-50"><Pause className="h-3.5 w-3.5" /></button>}
          {!readOnly && status === 'paused' && <button type="button" aria-label={t('progress.orchestration_resume')} disabled={busy || !snapshot} onClick={() => { void action('resume-change') }} className="rounded-md border border-border-2 px-2 py-1 text-xs hover:bg-fill disabled:opacity-50"><Play className="h-3.5 w-3.5" /></button>}
          {!readOnly && !['completed', 'cancelled'].includes(status) && <button type="button" aria-label={t('progress.orchestration_cancel')} disabled={busy || !snapshot} onClick={() => { void action('cancel-change') }} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"><Square className="h-3.5 w-3.5" /></button>}
          {!readOnly && !['completed', 'cancelled'].includes(status) && <button type="button" aria-label={t('progress.orchestration_replan')} disabled={busy || !snapshot} onClick={() => { void dispatch('replan-change', { reason: 'dashboard-request' }) }} className="rounded-md border border-border-2 px-2 py-1 text-xs hover:bg-fill disabled:opacity-50">↻</button>}
          {!readOnly && status === 'verifying' && <><button type="button" aria-label={t('progress.orchestration_approve')} disabled={busy || !snapshot} onClick={() => evaluateGate('passed')} className="rounded-md border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50">✓</button><button type="button" aria-label={t('progress.orchestration_reject')} disabled={busy || !snapshot} onClick={() => evaluateGate('rejected')} className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50">!</button></>}
          <button type="button" aria-label={t('progress.orchestration_refresh')} disabled={busy} onClick={() => { void refresh() }} className="rounded-md border border-border-2 px-2 py-1 text-xs hover:bg-fill disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {error !== null && <p className="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">{formatApiError(error, t, { exposeServerDetail: false })}</p>}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill" aria-label={`${progress}%`}><div className="h-full rounded-full bg-(--accent) transition-[width]" style={{ width: `${progress}%` }} /></div>
      {snapshot && snapshot.work_items.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={t('progress.orchestration_items')}>
          {snapshot.work_items.map((item) => {
            const binding = snapshot.resolution?.bindings.find((entry) => entry.work_item_id === item.work_item_id)
            const latestRun = snapshot.runs.filter((run) => run.work_item_id === item.work_item_id).at(-1)
            return <li key={item.work_item_id} className="rounded-lg border border-border-2 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate font-medium text-text">{item.title}</span><span className={`shrink-0 font-semibold ${statusTone[item.status] ?? 'text-text-3'}`}>{item.status}</span></div>
              <div className="mt-1 space-y-0.5 text-text-3">
                <div>{t('progress.orchestration_dependencies')}: {item.depends_on.length === 0 ? '—' : item.depends_on.join(', ')}</div>
                {binding && <div>{t('progress.orchestration_capabilities')}: {binding.skill_id}@{binding.skill_version}{binding.mcp_ids.length > 0 ? ` · ${binding.mcp_ids.join(', ')}` : ''}</div>}
                {item.required_artifact_refs.length > 0 && <div>{t('progress.orchestration_artifacts')}: {item.required_artifact_refs.join(', ')}</div>}
                {latestRun && <div>{t('progress.orchestration_runs')}: {latestRun.status} · {latestRun.attempt_id}</div>}
              </div>
              {!readOnly && ['failed', 'interrupted', 'blocked'].includes(item.status) && <div className="mt-2 flex gap-2"><button type="button" aria-label={`${t('progress.orchestration_retry')}: ${item.title}`} onClick={() => retryItem(item.work_item_id)} disabled={busy} className="rounded border border-border-2 px-2 py-1 text-[11px] hover:bg-fill disabled:opacity-50">{t('progress.orchestration_retry')}</button><button type="button" aria-label={`${t('progress.orchestration_bind_artifact')}: ${item.title}`} onClick={() => bindArtifact(item.work_item_id)} disabled={busy} className="rounded border border-border-2 px-2 py-1 text-[11px] hover:bg-fill disabled:opacity-50">{t('progress.orchestration_bind_artifact')}</button></div>}
            </li>
          })}
        </ul>
      )}
      {snapshot && <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <section className="rounded-lg border border-border-2 p-3" aria-label={t('progress.orchestration_runs')}><h3 className="font-semibold text-text">{t('progress.orchestration_runs')}</h3>{snapshot.runs.length === 0 ? <p className="mt-1 text-text-3">—</p> : <ul className="mt-1 space-y-1">{snapshot.runs.map((run) => <li key={run.run_id} className="text-text-3">{run.skill_id}@{run.skill_version} · {run.status} · {run.attempt_id}{run.lease ? ` · ${run.lease.status}#${run.lease.generation}` : ''}</li>)}</ul>}</section>
        <section className="rounded-lg border border-border-2 p-3" aria-label={t('progress.orchestration_results')}><h3 className="font-semibold text-text">{t('progress.orchestration_results')}</h3>{snapshot.results.length === 0 ? <p className="mt-1 text-text-3">—</p> : <ul className="mt-1 space-y-1">{snapshot.results.map((result) => <li key={result.result_id} className="text-text-3">{result.status} · {result.contract_status}{result.output_schema_id ? ` · ${result.output_schema_id}` : ''}{result.artifacts.length ? ` · ${result.artifacts.map((artifact) => artifact.ref).join(', ')}` : ''}</li>)}</ul>}</section>
        <section className="rounded-lg border border-border-2 p-3" aria-label={t('progress.orchestration_validations')}><h3 className="font-semibold text-text">{t('progress.orchestration_validations')}</h3>{snapshot.validations.length === 0 ? <p className="mt-1 text-text-3">—</p> : <ul className="mt-1 space-y-1">{snapshot.validations.map((report) => <li key={report.report_id} className="text-text-3">{report.validator_id}@{report.validator_version} · {report.status} · {report.evidence_refs.join(', ') || '—'}</li>)}</ul>}</section>
        <section className="rounded-lg border border-border-2 p-3" aria-label={t('progress.orchestration_gates')}><h3 className="font-semibold text-text">{t('progress.orchestration_gates')}</h3>{snapshot.gates.length === 0 ? <p className="mt-1 text-text-3">—</p> : <ul className="mt-1 space-y-1">{snapshot.gates.map((gate) => <li key={gate.gate_id} className="text-text-3">{gate.kind} · {gate.status} · rev {gate.decision_revision}</li>)}</ul>}</section>
      </div>}
      {snapshot && (snapshot.blockers.length > 0 || snapshot.next_actions.length > 0) && <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><section aria-label={t('progress.orchestration_blockers')}><h3 className="font-semibold text-text">{t('progress.orchestration_blockers')}</h3><ul className="mt-1 list-disc pl-4 text-red-700 dark:text-red-300">{(snapshot.blockers.length ? snapshot.blockers : ['—']).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></section><section aria-label={t('progress.orchestration_next_actions')}><h3 className="font-semibold text-text">{t('progress.orchestration_next_actions')}</h3><ul className="mt-1 list-disc pl-4 text-text-3">{snapshot.next_actions.map((next) => <li key={next}>{next}</li>)}</ul></section></div>}
      {events.length > 0 && <p className="mt-3 text-[11px] text-text-3" data-testid="orchestration-v2-event-tail">{t('progress.orchestration_event_tail', { events: events.slice(0, 3).map((event) => `${event.revision} ${event.event_type}`).join(' · ') })}</p>}
    </section>
  )
}
