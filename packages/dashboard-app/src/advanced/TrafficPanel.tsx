import { useCallback, useEffect, useState } from 'react'
import {
  fetchTraceRecords,
  fetchTraceSessions,
  recordSummary,
  type TraceRecordsResponse,
  type TraceSessionRow,
} from './trafficData'

/**
 * TrafficPanel（#34d）—— tap 流量查看器：真消费 /api/traces/sessions + /api/traces/records。
 * #34e 护栏：只读本地捕获、不外发——面板显式标注 local-only；数据端亦回 outbound: 'local-only'。
 */
export function TrafficPanel(): JSX.Element {
  const [sessions, setSessions] = useState<TraceSessionRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [records, setRecords] = useState<TraceRecordsResponse | null>(null)
  const [recError, setRecError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTraceSessions()
      .then((d) => {
        if (!cancelled) setSessions(d.sessions)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openSession = useCallback((id: string) => {
    setSelected(id)
    setRecords(null)
    setRecError(null)
    fetchTraceRecords(id)
      .then(setRecords)
      .catch((e: unknown) => setRecError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) {
    return (
      <div className="traffic" data-testid="traffic-panel">
        <p className="traffic__error" data-testid="traffic-error">
          traces 数据端不可达：{error}
        </p>
      </div>
    )
  }
  if (!sessions) {
    return (
      <div className="traffic" data-testid="traffic-panel">
        <p className="traffic__loading">加载捕获会话…</p>
      </div>
    )
  }

  return (
    <div className="traffic" data-testid="traffic-panel">
      <p className="traffic__note" data-testid="traffic-note">
        本地捕获 · 不外发（local-only）
      </p>
      {sessions.length === 0 ? (
        <p className="traffic__empty" data-testid="traffic-empty">
          暂无捕获会话（tap 默认 OFF）
        </p>
      ) : (
        <ul className="traffic__sessions" data-testid="traffic-sessions">
          {sessions.map((s) => (
            <li className="traffic__session" data-testid={`traffic-session-${s.id}`} key={s.id}>
              <button
                type="button"
                className={`traffic__session-btn${selected === s.id ? ' is-selected' : ''}`}
                onClick={() => openSession(s.id)}
              >
                <span className="traffic__client">{s.client || '(unknown)'}</span>
                <span className="traffic__count">{s.record_count} 条</span>
                <span className={`traffic__status traffic__status--${s.status}`}>{s.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && recError && (
        <p className="traffic__error" data-testid="traffic-rec-error">
          记录读取失败：{recError}
        </p>
      )}
      {selected && records && (
        <ol className="traffic__records" data-testid="traffic-records">
          {records.records.map((r, i) => (
            <li className="traffic__record" data-testid={`traffic-record-${i}`} key={i}>
              {recordSummary(r)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
