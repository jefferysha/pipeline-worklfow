import { useCallback, useEffect, useState } from 'react'
import {
  fetchTraceRecords,
  fetchTraceSessions,
  recordSummary,
  type TraceRecordsResponse,
  type TraceSessionRow,
} from './trafficData'
import { useT } from '../i18n'

/**
 * TrafficPanel（#34d）—— tap 流量查看器：真消费 /api/traces/sessions + /api/traces/records。
 * #34e 护栏：只读本地捕获、不外发——面板显式标注 local-only；数据端亦回 outbound: 'local-only'。
 * v10b 迁移：旧 .traffic__* 类退役，样式 tailwind 原子类；选中态 aria-pressed、
 * 会话状态徽标 data-state 承载（active=绿 tint），颜色全走 token 语义类。
 */
export function TrafficPanel(): JSX.Element {
  const { t } = useT()
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

  const rootCls = 'flex min-w-0 flex-1 flex-col gap-2'
  const errorCls = 'm-0 text-[11.5px] font-semibold text-red'

  if (error) {
    return (
      <div className={rootCls} data-testid="traffic-panel">
        <p className={errorCls} data-testid="traffic-error" role="alert">
          traces 数据端不可达：{error}
        </p>
      </div>
    )
  }
  if (!sessions) {
    return (
      <div className={rootCls} data-testid="traffic-panel">
        <p className="m-0 text-xs text-text-3" role="status" aria-live="polite">加载捕获会话…</p>
      </div>
    )
  }

  return (
    <div className={rootCls} data-testid="traffic-panel">
      <p className="m-0 font-mono text-[11px] text-text-3" data-testid="traffic-note">
        本地捕获 · 不外发（local-only）
      </p>
      {sessions.length === 0 ? (
        <p className="m-0 text-xs text-text-3 opacity-75" data-testid="traffic-empty" role="status" aria-live="polite">
          暂无捕获会话（tap 默认 OFF）
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="traffic-sessions">
          {sessions.map((s) => (
            <li data-testid={`traffic-session-${s.id}`} key={s.id}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-[7px] text-left text-text transition-[border-color,box-shadow] hover:border-accent-b aria-pressed:border-[1.5px] aria-pressed:border-(--accent) aria-pressed:bg-accent-t aria-pressed:shadow-[0_0_0_3px_var(--ring-blue)]"
                aria-pressed={selected === s.id}
                onClick={() => openSession(s.id)}
              >
                <span className="font-mono text-xs font-semibold text-text">{s.client || '(unknown)'}</span>
                <span className="font-mono text-[11px] text-text-3">{s.record_count} 条</span>
                <span
                  className="ml-auto rounded-full bg-fill px-[7px] py-0.5 text-[10.5px] font-bold text-text-3 data-[state=active]:bg-green-t data-[state=active]:text-green-d"
                  data-state={s.status}
                >
                  {s.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && !records && !recError && (
        <p className="m-0 text-xs text-text-3" data-testid="traffic-records-loading" role="status" aria-live="polite">
          {t('advanced.traffic_records_loading')}
        </p>
      )}
      {selected && recError && (
        <p className={errorCls} data-testid="traffic-rec-error" role="alert">
          记录读取失败：{recError}
        </p>
      )}
      {selected && records && (
        <ol
          className="m-0 list-none overflow-x-auto rounded-md border border-dashed border-border bg-fill py-2.5 pr-3 pl-8 font-mono text-[11px] leading-[1.7] text-text-2"
          data-testid="traffic-records"
        >
          {records.records.map((r, i) => (
            <li className="whitespace-nowrap" data-testid={`traffic-record-${i}`} key={i}>
              {recordSummary(r)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
