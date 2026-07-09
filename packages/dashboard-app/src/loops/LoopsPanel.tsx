import { useCallback, useEffect, useState } from 'react'
import { getToken } from '../api/client'
import { useT } from '../i18n'

/**
 * Loop 治理面板 —— 工票车间重写（spec §4；视觉真相源 demo all-views §3）。
 * 数据/行为层保留自零样式版的三条纪律（whole-branch review 教训，一条不丢）：
 *  1. 快照/升档两处网络错误全部行内可见（先 r.ok 再 json，读 {error}/{errors} 信封）；
 *  2. graduation 逻辑拒绝（400 + errors[]）显示具体拒绝理由（朱红提示条），非泛化文案；
 *  3. 升档成功后 refetch 快照（不让界面停在旧档位）。
 * 设计变更登记：表格退役 → 工票行 + 展开详情；breaker 徽章去 emoji 改语义色；
 * 档位徽章带人话副标签（L1 提案制 / L2 半自动 / L3 全自动）。
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
// G19② 升级收编：kernel applyLevelChange「降档总允许」、POST /api/loops/level 本就双向，缺的只是这个入口。
const PREV_LEVEL: Record<LoopRow['autonomy_level'], 'L1' | 'L2' | null> = { L1: null, L2: 'L1', L3: 'L2' }

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

  async function setLevel(row: LoopRow, target: string, kind: 'promote' | 'demote'): Promise<void> {
    setPromoteError(null)
    try {
      const res = await fetch('/api/loops/level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ root: row.root, id: row.id, target }),
      })
      if (!res.ok) {
        const detail = await readErrorDetail(res)
        setPromoteError(detail ? t(`loops.${kind}_fail`, { msg: detail }) : t(`loops.${kind}_fail_status`, { status: res.status }))
        return
      }
      loadSnapshot()
    } catch (err) {
      setPromoteError(t(`loops.${kind}_fail`, { msg: err instanceof Error ? err.message : t('loops.network_error') }))
    }
  }

  if (error) return <p className="view__note view__note--error" data-testid="loops-error">{error}</p>
  if (!snapshot) return <p className="view__note" data-testid="loops-loading">{t('common.loading')}</p>

  const breakerBadge = (breaker: BudgetStatus['breaker']): JSX.Element =>
    breaker === 'ok' ? (
      <span className="badge badge--run">● {t('loops.breaker_ok')}</span>
    ) : breaker === 'warn' ? (
      <span className="badge badge--pending">{t('loops.breaker_warn')}</span>
    ) : (
      <span className="badge badge--gate">{t('loops.breaker_tripped')}</span>
    )

  return (
    <section className="view loops" data-testid="loops-view">
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('loops.title')}</h1>
          <p className="view__subtitle">{t('loops.subtitle')}</p>
        </div>
        <span className="view__count">{t('loops.count', { n: snapshot.rows.length })}</span>
      </header>
      {snapshot.rows.length === 0 ? (
        <p className="view__note" data-testid="loops-empty">{t('loops.empty')}</p>
      ) : (
        <div className="g-list">
          {snapshot.rows.map((row) => {
            const nextLevel = NEXT_LEVEL[row.autonomy_level]
            const prevLevel = PREV_LEVEL[row.autonomy_level]
            const isOpen = expanded === row.id
            return (
              <div key={`${row.root}:${row.id}`} className="loop-row" data-testid={`loop-row-${row.id}`}>
                <button
                  type="button"
                  className="loop-line"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setExpanded(isOpen ? null : row.id)
                    setPromoteError(null)
                  }}
                >
                  <span className="loop-caret">{isOpen ? '▾' : '▸'}</span>
                  <span className="card__name">{row.id}</span>
                  <span className="loop-level"><b>{row.autonomy_level}</b><span className="loop-level__tag"> · {t(`loops.level_${row.autonomy_level.toLowerCase()}`)}</span></span>
                  <span className="loop-ready">{t('loops.readiness')} <b>{row.readiness.score}</b></span>
                  {breakerBadge(row.budget.breaker)}
                  <span className="ticket-row__spacer" />
                </button>
                {isOpen && (
                  <div className="loop-detail">
                    <p className="loop-band">{t('loops.readiness_band', { band: row.readiness.band })}</p>
                    {promoteError && <p className="loop-reject" data-testid="loop-reject">⛔ {promoteError}</p>}
                    {(nextLevel || prevLevel) && (
                      <div className="qk">
                        {nextLevel && (
                          <button type="button" className="qk__btn" data-testid={`loop-promote-${row.id}`} onClick={() => void setLevel(row, nextLevel, 'promote')}>
                            ↑ {t('loops.promote_to', { level: nextLevel })}
                          </button>
                        )}
                        {prevLevel && (
                          <button type="button" className="qk__btn qk__btn--ghost" data-testid={`loop-demote-${row.id}`} onClick={() => void setLevel(row, prevLevel, 'demote')}>
                            ↓ {t('loops.demote_to', { level: prevLevel })}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
