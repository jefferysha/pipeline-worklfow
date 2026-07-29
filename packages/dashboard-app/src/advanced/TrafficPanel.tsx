import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  actualTokenTotal,
  fetchTraceSessions,
  fetchTraceTimeline,
  filterTimelineEntries,
  type TraceSessionRow,
  type TraceTimelineEntry,
  type TraceTimelineFilter,
  type TraceTimelineResponse,
} from './trafficData'
import { useT } from '../i18n'

const buttonClass =
  'cursor-pointer rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-accent-b aria-pressed:border-(--accent) aria-pressed:bg-accent-t'

const SESSION_STATUS_KEYS: Readonly<Record<string, string>> = {
  active: 'traffic_status_active',
  complete: 'traffic_status_complete',
  empty: 'traffic_status_empty',
  error: 'traffic_status_error',
}

function TimelineEntry({
  entry,
  formatNumber,
  t,
}: {
  entry: TraceTimelineEntry
  formatNumber: (value: number | null) => string
  t: (key: string, vars?: Record<string, string | number>) => string
}): JSX.Element {
  const parsedTimestamp = entry.timestamp === null ? Number.NaN : Date.parse(entry.timestamp)
  const time = Number.isNaN(parsedTimestamp)
    ? t('advanced.traffic_unknown')
    : new Date(parsedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <li
      className="grid gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-xs sm:grid-cols-[7rem_minmax(0,1fr)_auto]"
      data-testid={`traffic-entry-${entry.sequence}`}
    >
      <div className="flex flex-col gap-0.5 font-mono text-[11px] text-text-3">
        <span>{entry.turn === null ? t('advanced.traffic_turn_unknown') : t('advanced.traffic_turn', { n: entry.turn })}</span>
        <time dateTime={entry.timestamp ?? undefined}>{time}</time>
      </div>
      <div className="min-w-0">
        <p className="m-0 truncate font-mono font-semibold text-text">
          {entry.method ?? t('advanced.traffic_unknown')} {entry.path ?? t('advanced.traffic_unknown')}
        </p>
        <p className="mt-1 mb-0 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-text-3">
          {entry.model && <span>{t('advanced.traffic_model', { value: entry.model })}</span>}
          {entry.input_tokens !== null && (
            <span>{t('advanced.traffic_input_tokens', { n: formatNumber(entry.input_tokens) })}</span>
          )}
          {entry.output_tokens !== null && (
            <span>{t('advanced.traffic_output_tokens', { n: formatNumber(entry.output_tokens) })}</span>
          )}
          {entry.cached_input_tokens !== null && (
            <span>{t('advanced.traffic_cached_tokens', { n: formatNumber(entry.cached_input_tokens) })}</span>
          )}
          {entry.stream_event_count !== null && (
            <span>{t('advanced.traffic_stream_events', { n: formatNumber(entry.stream_event_count) })}</span>
          )}
        </p>
      </div>
      <div className="flex items-start gap-2 font-mono text-[11px]">
        <span
          className="rounded-full bg-fill px-2 py-0.5 font-bold text-text-3 data-[outcome=error]:bg-red-t data-[outcome=error]:text-red data-[outcome=success]:bg-green-t data-[outcome=success]:text-green-d"
          data-outcome={entry.outcome}
        >
          {entry.status_code ?? t('advanced.traffic_unknown')}
          {' · '}
          {t(`advanced.traffic_outcome_${entry.outcome}`)}
        </span>
        <span className="pt-0.5 text-text-3">
          {entry.duration_ms === null
            ? t('advanced.traffic_duration_unknown')
            : t('advanced.traffic_duration_ms', { n: formatNumber(entry.duration_ms) })}
          {entry.transport && ` · ${entry.transport}`}
        </span>
      </div>
    </li>
  )
}

export function TrafficPanel(): JSX.Element {
  const { lang, t } = useT()
  const [sessions, setSessions] = useState<TraceSessionRow[] | null>(null)
  const [sessionsError, setSessionsError] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<TraceTimelineResponse | null>(null)
  const [timelineError, setTimelineError] = useState(false)
  const [filter, setFilter] = useState<TraceTimelineFilter>('all')
  const requestIdentity = useRef(0)
  const sessionButtons = useRef(new Map<string, HTMLButtonElement>())

  const loadSessions = useCallback(() => {
    setSessions(null)
    setSessionsError(false)
    fetchTraceSessions()
      .then((response) => setSessions(response.sessions))
      .catch(() => setSessionsError(true))
  }, [])

  useEffect(() => {
    loadSessions()
    return () => {
      requestIdentity.current += 1
    }
  }, [loadSessions])

  const loadTimeline = useCallback((id: string, resetFilter = true) => {
    const identity = requestIdentity.current + 1
    requestIdentity.current = identity
    setSelected(id)
    setTimeline(null)
    setTimelineError(false)
    if (resetFilter) setFilter('all')
    fetchTraceTimeline(id)
      .then((response) => {
        if (requestIdentity.current === identity) setTimeline(response)
      })
      .catch(() => {
        if (requestIdentity.current === identity) setTimelineError(true)
      })
  }, [])

  const closeTimeline = useCallback(() => {
    if (!selected) return
    const returnTarget = sessionButtons.current.get(selected)
    requestIdentity.current += 1
    setSelected(null)
    setTimeline(null)
    setTimelineError(false)
    setFilter('all')
    returnTarget?.focus()
  }, [selected])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !selected) return
    event.preventDefault()
    closeTimeline()
  }, [closeTimeline, selected])

  const formatNumber = useCallback(
    (value: number | null) => value === null
      ? t('advanced.traffic_unknown')
      : new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US').format(value),
    [lang, t],
  )
  const filteredEntries = useMemo(
    () => timeline ? filterTimelineEntries(timeline.entries, filter) : [],
    [filter, timeline],
  )
  const summaryTokens = timeline ? actualTokenTotal(timeline.summary) : null

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5" data-testid="traffic-panel" onKeyDown={handleKeyDown}>
      <p className="m-0 font-mono text-[11px] text-text-3" data-testid="traffic-note">
        {t('advanced.traffic_local_note')}
      </p>

      {sessionsError ? (
        <div className="rounded-md border border-red-b bg-red-t p-3">
          <p className="m-0 text-xs font-semibold text-red" data-testid="traffic-error" role="alert">
            {t('advanced.traffic_sessions_error')}
          </p>
          <button className={`${buttonClass} mt-2`} type="button" onClick={loadSessions}>
            {t('advanced.traffic_retry_sessions')}
          </button>
        </div>
      ) : sessions === null ? (
        <p
          className="m-0 text-xs text-text-3"
          data-testid="traffic-sessions-loading"
          role="status"
          aria-live="polite"
        >
          {t('advanced.traffic_sessions_loading')}
        </p>
      ) : sessions.length === 0 ? (
        <p className="m-0 text-xs text-text-3" data-testid="traffic-empty" role="status">
          {t('advanced.traffic_sessions_empty')}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="traffic-sessions">
          {sessions.map((session) => (
            <li data-testid={`traffic-session-${session.id}`} key={session.id}>
              <button
                ref={(node) => {
                  if (node) sessionButtons.current.set(session.id, node)
                  else sessionButtons.current.delete(session.id)
                }}
                type="button"
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-[7px] text-left text-text transition-[border-color,box-shadow] hover:border-accent-b aria-pressed:border-[1.5px] aria-pressed:border-(--accent) aria-pressed:bg-accent-t aria-pressed:shadow-[0_0_0_3px_var(--ring-blue)]"
                aria-pressed={selected === session.id}
                onClick={() => loadTimeline(session.id, true)}
              >
                <span className="font-mono text-xs font-semibold text-text">
                  {session.client || t('advanced.traffic_unknown_client')}
                </span>
                <span className="font-mono text-[11px] text-text-3">
                  {t(
                    session.record_count === 1
                      ? 'advanced.traffic_session_count_one'
                      : 'advanced.traffic_session_count_many',
                    { n: formatNumber(session.record_count) },
                  )}
                </span>
                <span
                  className="ml-auto rounded-full bg-fill px-[7px] py-0.5 text-[10.5px] font-bold text-text-3 data-[state=active]:bg-green-t data-[state=active]:text-green-d"
                  data-state={session.status}
                >
                  {t(`advanced.${SESSION_STATUS_KEYS[session.status] ?? 'traffic_status_unknown'}`)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <section
          aria-label={t('advanced.traffic_timeline_label')}
          className="mt-1 flex min-w-0 flex-col gap-2.5 border-t border-border pt-3"
          data-testid="traffic-timeline"
        >
          {timelineError ? (
            <div className="rounded-md border border-red-b bg-red-t p-3">
              <p className="m-0 text-xs font-semibold text-red" data-testid="traffic-timeline-error" role="alert">
                {t('advanced.traffic_timeline_error')}
              </p>
              <button className={`${buttonClass} mt-2`} type="button" onClick={() => loadTimeline(selected, false)}>
                {t('advanced.traffic_retry_timeline')}
              </button>
            </div>
          ) : timeline === null ? (
            <p
              className="m-0 text-xs text-text-3"
              data-testid="traffic-timeline-loading"
              role="status"
              aria-live="polite"
            >
              {t('advanced.traffic_timeline_loading')}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="traffic-summary">
                {[
                  [t('advanced.traffic_summary_calls'), formatNumber(timeline.returned_count)],
                  [t('advanced.traffic_summary_errors'), formatNumber(timeline.summary.error_count)],
                  [t('advanced.traffic_summary_duration'), formatNumber(timeline.summary.total_duration_ms)],
                  [t('advanced.traffic_summary_tokens'), formatNumber(summaryTokens)],
                ].map(([label, value]) => (
                  <div className="rounded-md border border-border bg-fill px-2.5 py-2" key={label}>
                    <p className="m-0 text-[10px] font-semibold tracking-wide text-text-3 uppercase">{label}</p>
                    <p className="mt-0.5 mb-0 font-mono text-sm font-bold text-text">{value}</p>
                    {label === t('advanced.traffic_summary_calls') && (
                      <p className="mt-0.5 mb-0 text-[10px] text-text-3">
                        {t('advanced.traffic_summary_unknown', {
                          n: formatNumber(timeline.summary.unknown_count),
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {(timeline.integrity === 'partial' || timeline.truncated) && (
                <div className="rounded-md border border-amber-b bg-amber-t p-2.5" data-testid="traffic-integrity">
                  <p className="m-0 text-xs font-semibold text-text">
                    {timeline.integrity === 'partial'
                      ? t('advanced.traffic_integrity_partial', { n: timeline.skipped_count })
                      : t('advanced.traffic_integrity_complete')}
                    {timeline.truncated ? ` ${t('advanced.traffic_integrity_truncated')}` : ''}
                  </p>
                  <p className="mt-1 mb-0 text-[11px] text-text-3">
                    {t('advanced.traffic_integrity_warnings', { codes: timeline.warnings.join(', ') })}
                  </p>
                  <button className={`${buttonClass} mt-2`} type="button" onClick={() => loadTimeline(selected, false)}>
                    {t('advanced.traffic_retry_timeline')}
                  </button>
                </div>
              )}

              {timeline.entries.length === 0 && timeline.total_count === 0 && timeline.integrity === 'complete' ? (
                <p className="m-0 text-xs text-text-3" data-testid="traffic-timeline-empty" role="status">
                  {t('advanced.traffic_timeline_empty')}
                </p>
              ) : timeline.entries.length === 0 ? (
                <p className="m-0 text-xs text-text-3" data-testid="traffic-timeline-unavailable" role="status">
                  {t('advanced.traffic_timeline_unavailable')}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5" aria-label={t('advanced.traffic_filter_label')}>
                    {([
                      ['all', 'traffic_filter_all'],
                      ['error', 'traffic_filter_errors'],
                      ['success', 'traffic_filter_success'],
                    ] as const).map(([value, key]) => (
                      <button
                        className={buttonClass}
                        type="button"
                        aria-pressed={filter === value}
                        key={value}
                        onClick={() => setFilter(value)}
                      >
                        {t(`advanced.${key}`)}
                      </button>
                    ))}
                  </div>
                  {filteredEntries.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border bg-fill p-3" data-testid="traffic-filter-empty">
                      <p className="m-0 text-xs text-text-3">{t('advanced.traffic_filter_empty')}</p>
                      <button className={`${buttonClass} mt-2`} type="button" onClick={() => setFilter('all')}>
                        {t('advanced.traffic_filter_clear')}
                      </button>
                    </div>
                  ) : (
                    <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="traffic-entries">
                      {filteredEntries.map((entry, index) => (
                        <TimelineEntry
                          entry={entry}
                          formatNumber={formatNumber}
                          key={`${entry.sequence}-${index}`}
                          t={t}
                        />
                      ))}
                    </ol>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
