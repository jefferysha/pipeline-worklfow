import type { TraceSessionRow, TraceTimelineEntry } from './trafficData'

export const trafficButtonClass =
  'cursor-pointer rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-text outline-none transition-[border-color,box-shadow] hover:border-accent-b focus-visible:border-(--accent) focus-visible:ring-[3px] focus-visible:ring-(--ring-blue) aria-pressed:border-(--accent) aria-pressed:bg-accent-t'

const SESSION_STATUS_KEYS: Readonly<Record<string, string>> = {
  active: 'traffic_status_active',
  complete: 'traffic_status_complete',
  empty: 'traffic_status_empty',
  error: 'traffic_status_error',
}

type Translate = (key: string, vars?: Record<string, string | number>) => string

function shortSessionId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}

export function SessionStatusBadge({
  status,
  t,
}: {
  status: string
  t: Translate
}): JSX.Element {
  return (
    <span
      className="shrink-0 rounded-full bg-fill px-[7px] py-0.5 text-[10.5px] font-bold text-text-3 data-[state=active]:bg-green-t data-[state=active]:text-green-d data-[state=error]:bg-red-t data-[state=error]:text-red"
      data-state={status}
    >
      {t(`advanced.${SESSION_STATUS_KEYS[status] ?? 'traffic_status_unknown'}`)}
    </span>
  )
}

export function TimelineEntry({
  entry,
  formatNumber,
  t,
}: {
  entry: TraceTimelineEntry
  formatNumber: (value: number | null) => string
  t: Translate
}): JSX.Element {
  const parsedTimestamp = entry.timestamp === null ? Number.NaN : Date.parse(entry.timestamp)
  const time = Number.isNaN(parsedTimestamp)
    ? t('advanced.traffic_unknown')
    : new Date(parsedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <li
      className="grid min-w-0 gap-2 px-3 py-3 text-xs min-[1280px]:grid-cols-[6.5rem_minmax(0,1fr)_auto]"
      data-testid={`traffic-entry-${entry.sequence}`}
    >
      <div className="flex flex-col gap-0.5 font-mono text-[11px] text-text-3">
        <span>{entry.turn === null ? t('advanced.traffic_turn_unknown') : t('advanced.traffic_turn', { n: entry.turn })}</span>
        <time dateTime={entry.timestamp ?? undefined}>{time}</time>
      </div>
      <div className="min-w-0">
        <p className="m-0 truncate font-mono font-semibold text-text" title={`${entry.method ?? ''} ${entry.path ?? ''}`.trim()}>
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

export function TrafficSessionRail({
  formatDateTime,
  formatNumber,
  loadSessions,
  onSelect,
  selected,
  sessions,
  sessionsError,
  setButtonRef,
  t,
}: {
  formatDateTime: (value: string) => string
  formatNumber: (value: number | null) => string
  loadSessions: () => void
  onSelect: (id: string) => void
  selected: string | null
  sessions: TraceSessionRow[] | null
  sessionsError: boolean
  setButtonRef: (id: string, node: HTMLButtonElement | null) => void
  t: Translate
}): JSX.Element {
  return (
    <section
      aria-label={t('advanced.traffic_sessions_label')}
      className="min-w-0 rounded-lg border border-border bg-fill/30 p-2.5"
      data-testid="traffic-session-rail"
    >
      <header className="mb-2.5 flex items-end justify-between gap-3 px-0.5">
        <div>
          <p className="m-0 text-xs font-bold text-text">{t('advanced.traffic_sessions_heading')}</p>
          <p className="mt-0.5 mb-0 text-[10.5px] text-text-3">{t('advanced.traffic_sessions_hint')}</p>
        </div>
        {sessions !== null && !sessionsError && (
          <span className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10.5px] text-text-3">
            {formatNumber(sessions.length)}
          </span>
        )}
      </header>

      {sessionsError ? (
        <div className="rounded-md border border-red-b bg-red-t p-3">
          <p className="m-0 text-xs font-semibold text-red" data-testid="traffic-error" role="alert">
            {t('advanced.traffic_sessions_error')}
          </p>
          <button className={`${trafficButtonClass} mt-2`} type="button" onClick={loadSessions}>
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
        <ul
          className="m-0 flex max-h-[42rem] list-none flex-col gap-1.5 overflow-y-auto p-0 pr-1"
          data-testid="traffic-sessions"
        >
          {sessions.map((session) => (
            <li data-testid={`traffic-session-${session.id}`} key={session.id}>
              <button
                ref={(node) => setButtonRef(session.id, node)}
                type="button"
                title={session.id}
                className="group flex w-full cursor-pointer flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-2.5 text-left text-text outline-none transition-[border-color,box-shadow,background-color] hover:border-accent-b focus-visible:border-(--accent) focus-visible:ring-[3px] focus-visible:ring-(--ring-blue) aria-pressed:border-l-[3px] aria-pressed:border-(--accent) aria-pressed:bg-accent-t aria-pressed:shadow-[0_0_0_3px_var(--ring-blue)]"
                aria-pressed={selected === session.id}
                onClick={() => onSelect(session.id)}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-text">
                    {session.client || t('advanced.traffic_unknown_client')}
                  </span>
                  <SessionStatusBadge status={session.status} t={t} />
                </span>
                <span className="flex w-full min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-text-3">
                  <span className="min-w-0 truncate">{shortSessionId(session.id)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    {session.proxy_mode || t('advanced.traffic_unknown_proxy')}
                  </span>
                </span>
                <span className="flex w-full items-center justify-between gap-2 text-[10.5px] text-text-3">
                  <span>
                    {t(
                      session.record_count === 1
                        ? 'advanced.traffic_session_count_one'
                        : 'advanced.traffic_session_count_many',
                      { n: formatNumber(session.record_count) },
                    )}
                  </span>
                  <time dateTime={session.updated_at} title={session.updated_at}>
                    {formatDateTime(session.updated_at)}
                  </time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
