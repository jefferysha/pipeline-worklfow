import { useCallback, useEffect, useState } from 'react'
import { getToken } from '../api/client'
import { useT } from '../i18n'

/**
 * 错误可见性 + i18n（whole-branch review 抓出的两个真实回归，一并修复）：
 * 1. 初始快照 fetch 此前没有 `r.ok` 检查——server 对错误统一返回 JSON 信封（`{ok:false,error}`），
 *    502/500 时 `r.json()` 会成功 resolve 而不是 reject，`.catch` 永远不触发，`snapshot.rows`
 *    在 undefined 快照上取值直接抛错、无 ErrorBoundary 兜底会把整个 App 白屏。同 AfkWorkbench.tsx
 *    的 readErrorDetail 模式。
 * 2. 本文件此前完全不走 `t()`，切到英文后一级导航是英文、本视图内容仍是中文——现在全部经 i18n。
 */
interface ReadinessScore { score: number; band: string }
interface BudgetStatus { breaker: 'ok' | 'warn' | 'tripped'; remaining: number | null }
interface LoopRow {
  root: string; id: string; name: string; autonomy_level: 'L1' | 'L2' | 'L3'; status: string
  readiness: ReadinessScore; budget: BudgetStatus
}
interface LoopsSnapshot { generated_at: string; rows: LoopRow[] }
interface ErrorBody {
  error?: string
  errors?: string[]
}

const NEXT_LEVEL: Record<LoopRow['autonomy_level'], 'L2' | 'L3' | null> = { L1: 'L2', L2: 'L3', L3: null }

/** 非 2xx 响应尽量读出 server 的 { error } 或 { errors } 文案；没有 JSON 体就吞掉，回落调用方的通用文案。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
    if (Array.isArray(body?.errors) && body.errors.length > 0) return body.errors.join('; ')
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

export function LoopsPanel(): JSX.Element {
  const { t } = useT()
  const [snapshot, setSnapshot] = useState<LoopsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [promoteError, setPromoteError] = useState<string | null>(null)

  const loadSnapshot = useCallback(() => {
    fetch('/api/loops/snapshot', { headers: { Accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<LoopsSnapshot>
      })
      .then((body) => {
        setSnapshot(body)
        setError(null)
      })
      .catch((err: unknown) => setError(t('loops.load_error', { msg: err instanceof Error ? err.message : t('loops.network_error') })))
  }, [t])

  useEffect(() => loadSnapshot(), [loadSnapshot])

  async function promote(row: LoopRow): Promise<void> {
    const target = NEXT_LEVEL[row.autonomy_level]
    if (!target) return
    setPromoteError(null)
    try {
      const res = await fetch('/api/loops/level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ root: row.root, id: row.id, target }),
      })
      if (!res.ok) {
        const detail = await readErrorDetail(res)
        setPromoteError(detail ? t('loops.promote_fail', { msg: detail }) : t('loops.promote_fail_status', { status: res.status }))
        return
      }
      loadSnapshot()
    } catch (err) {
      setPromoteError(t('loops.promote_fail', { msg: err instanceof Error ? err.message : t('loops.network_error') }))
    }
  }

  if (error) return <p className="subtitle">{error}</p>
  if (!snapshot) return <p className="subtitle">{t('common.loading')}</p>
  if (snapshot.rows.length === 0) return <p className="subtitle">{t('loops.empty')}</p>

  const breakerLabel = (breaker: BudgetStatus['breaker']): string =>
    breaker === 'ok' ? t('loops.breaker_ok') : breaker === 'warn' ? t('loops.breaker_warn') : t('loops.breaker_tripped')

  return (
    <table className="loops-table">
      <thead>
        <tr>
          <th>{t('loops.col_loop')}</th>
          <th>{t('loops.col_level')}</th>
          <th>{t('loops.col_readiness')}</th>
          <th>{t('loops.col_budget')}</th>
          <th>{t('loops.col_status')}</th>
        </tr>
      </thead>
      <tbody>
        {snapshot.rows.flatMap((row) => {
          const mainRow = (
            <tr key={`${row.root}:${row.id}`} onClick={() => setExpanded(expanded === row.id ? null : row.id)} style={{ cursor: 'pointer' }}>
              <td>{row.id}</td>
              <td>{row.autonomy_level}</td>
              <td>{row.readiness.score}</td>
              <td>{row.budget.remaining ?? '—'}</td>
              <td>{breakerLabel(row.budget.breaker)}</td>
            </tr>
          )
          // nextLevel 提出成局部变量而不是在下面重复索引 NEXT_LEVEL[row.autonomy_level]——
          // TS 的控制流窄化不跨越两次独立的下标访问表达式生效（即使值确定性相同），重复写会在
          // `t()` 调用处把 'L2' | 'L3' | null 原样传给期望 string | number 的 vars 参数，
          // 类型检查报错（tsc --noEmit 目前不被 CI 门禁覆盖——见 TEST-REALITY.md G15——但
          // 本轮需要真跑 `npm run build:web` 验证 workflow 编辑器等真机流程，顺手修正）。
          const nextLevel = NEXT_LEVEL[row.autonomy_level]
          const detailRow = expanded === row.id ? (
            <tr key={`${row.root}:${row.id}:detail`}>
              <td colSpan={5}>
                <p>{t('loops.readiness_band', { band: row.readiness.band })}</p>
                {promoteError && <p style={{ color: 'red' }}>{promoteError}</p>}
                {nextLevel && (
                  <button onClick={() => promote(row)}>{t('loops.promote_to', { level: nextLevel })}</button>
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
