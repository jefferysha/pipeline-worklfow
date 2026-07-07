import { useEffect, useState } from 'react'
import { getToken } from '../api/client'

interface ReadinessScore { score: number; band: string }
interface BudgetStatus { breaker: 'ok' | 'warn' | 'tripped'; remaining: number | null }
interface LoopRow {
  root: string; id: string; name: string; autonomy_level: 'L1' | 'L2' | 'L3'; status: string
  readiness: ReadinessScore; budget: BudgetStatus
}
interface LoopsSnapshot { generated_at: string; rows: LoopRow[] }

const NEXT_LEVEL: Record<LoopRow['autonomy_level'], 'L2' | 'L3' | null> = { L1: 'L2', L2: 'L3', L3: null }

export function LoopsPanel(): JSX.Element {
  const [snapshot, setSnapshot] = useState<LoopsSnapshot | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/loops/snapshot', { headers: { Accept: 'application/json' } })
      .then((r) => r.json() as Promise<LoopsSnapshot>)
      .then(setSnapshot)
  }, [])

  async function promote(row: LoopRow): Promise<void> {
    const target = NEXT_LEVEL[row.autonomy_level]
    if (!target) return
    await fetch('/api/loops/level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ root: row.root, id: row.id, target }),
    })
  }

  if (!snapshot) return <p className="subtitle">加载中…</p>
  if (snapshot.rows.length === 0) return <p className="subtitle">没有已注册的 loop</p>

  return (
    <table className="loops-table">
      <thead>
        <tr><th>loop</th><th>档位</th><th>就绪分</th><th>预算</th><th>状态</th></tr>
      </thead>
      <tbody>
        {snapshot.rows.flatMap((row) => {
          const mainRow = (
            <tr key={`${row.root}:${row.id}`} onClick={() => setExpanded(expanded === row.id ? null : row.id)} style={{ cursor: 'pointer' }}>
              <td>{row.id}</td>
              <td>{row.autonomy_level}</td>
              <td>{row.readiness.score}</td>
              <td>{row.budget.remaining ?? '—'}</td>
              <td>{row.budget.breaker === 'ok' ? '🟢 OK' : row.budget.breaker === 'warn' ? '🟡 预警' : '🔴 熔断'}</td>
            </tr>
          )
          const detailRow = expanded === row.id ? (
            <tr key={`${row.root}:${row.id}:detail`}>
              <td colSpan={5}>
                <p>就绪分带：{row.readiness.band}</p>
                {NEXT_LEVEL[row.autonomy_level] && (
                  <button onClick={() => promote(row)}>升档 → {NEXT_LEVEL[row.autonomy_level]}</button>
                )}
              </td>
            </tr>
          ) : null
          return detailRow ? [mainRow, detailRow] : [mainRow]
        })}
      </tbody>
    </table>
  )
}
