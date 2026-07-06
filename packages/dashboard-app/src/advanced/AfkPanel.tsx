import { useEffect, useState } from 'react'
import { AFK_LANES, fetchAfkSnapshot, type AfkSnapshot } from './afkData'

/**
 * AfkPanel（#29d）—— AFK Sandcastle 指挥面：真消费 /api/afk/snapshot 渲染泳道 + 调度器 doctor 灯。
 * 挂载即拉数据端（Advanced 折叠内，caps.afk=true 才被 AdvancedPanel 渲染 → 只在已接线时 fetch）。
 */
export function AfkPanel(): JSX.Element {
  const [data, setData] = useState<AfkSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAfkSnapshot()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="afk" data-testid="afk-panel">
        <p className="afk__error" data-testid="afk-error">
          AFK 数据端不可达：{error}
        </p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="afk" data-testid="afk-panel">
        <p className="afk__loading">加载 AFK 快照…</p>
      </div>
    )
  }

  const sc = data.scheduler
  return (
    <div className="afk" data-testid="afk-panel">
      <div
        className={`afk__light afk__light--${sc.status}`}
        data-testid="afk-scheduler"
        role="status"
        title={`queued=${sc.queued} running=${sc.running} failed=${sc.failed} conflict=${sc.conflict}`}
      >
        <strong>调度器 {sc.status.toUpperCase()}</strong> · {sc.message}
      </div>
      <div className="afk__lanes">
        {AFK_LANES.map((lane) => {
          const cards = data.lanes[lane]
          return (
            <div className="afk__lane" data-testid={`afk-lane-${lane}`} key={lane}>
              <div className="afk__lane-head">
                {lane} <span className="afk__lane-count">({cards.length})</span>
              </div>
              {cards.map((c) => (
                <div className="afk__card" data-testid={`afk-card-${c.name}`} key={`${c.root}::${c.name}`}>
                  <span className="afk__card-name">{c.name}</span>
                  {c.attempts > 0 && <span className="afk__card-attempts">试 {c.attempts}</span>}
                  {c.last_error && (
                    <span className="afk__card-err" title={c.last_error}>
                      {c.last_error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
