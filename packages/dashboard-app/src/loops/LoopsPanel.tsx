import { useCallback, useEffect, useState } from 'react'
import { getToken } from '../api/client'
import { useT } from '../i18n'
import { Dialog } from '../shell/Dialog'

/**
 * Loop 治理面板 —— 工票车间重写（spec §4；视觉真相源 demo all-views §3）。
 * 数据/行为层保留自零样式版的三条纪律（whole-branch review 教训，一条不丢）：
 *  1. 快照/升档两处网络错误全部行内可见（先 r.ok 再 json，读 {error}/{errors} 信封）；
 *  2. graduation 逻辑拒绝（400 + errors[]）显示具体拒绝理由（朱红提示条），非泛化文案；
 *  3. 升档成功后 refetch 快照（不让界面停在旧档位）。
 * 设计变更登记：表格退役 → 工票行 + 展开详情；breaker 徽章去 emoji 改语义色；
 * 档位徽章带人话副标签（L1 提案制 / L2 半自动 / L3 全自动）。
 *
 * Task 13（评审 P1-6，三条一起补）：
 *  · 「budget.remaining 取到即弃」—— 快照行早就带了 kernel computeBudgetStatus 的全量预算字段
 *    （hasBudget/maxTokensPerDay/spentToday/remaining/usedRatio），此前只读了 breaker 就地弃掉
 *    剩下几个。本轮补展开区预算行：有预算画进度条（usedRatio 驱动宽度，>0.8 标红）+
 *    「spentToday/maxTokensPerDay · 剩 remaining」文案；hasBudget=false（未声明预算，见
 *    kernel budget.ts computeBudgetStatus 的 max===null 分支）显示「无预算限制」，不画假进度条。
 *  · 「熔断死胡同」—— breaker==='tripped' 此前只有 badge 变红字，用户不知道熔断意味着什么、
 *    怎么恢复。补一条红 tint 说明块，读固定 i18n 文案（不读 kernel 的 reason 自由文本——reason
 *    是给人读日志用的诊断句，措辞不保证面向终端用户，固定文案才稳定可控）。
 *  · 「升 L3 无确认」—— 降档总允许、风险低，保持直发（G19②既有设计不变）；升档会真的调高自动化
 *    程度、影响后续 run 是否需要人工过一遍，改成 Dialog 二次确认（Task 3 共享组件），正文带上
 *    就绪分带 + 预算摘要，给决策提供语境，而不是空对空的"确定吗"。
 *  · 就绪构成行（dimensions[] 逐项 ✓/✗）顺带补上——同一次快照里 readiness.dimensions 同样是取到
 *    即弃的字段，行为与预算字段是同一类问题，一并处理。dimensions 缺失/空数组（旧数据或简化
 *    fixture）时只显已有的 band 文案，不额外渲染构成行——不假设全部快照来源都已升级到新形状。
 */
interface ReadinessDimension { name: string; score: number; max: number }
interface ReadinessScore { score: number; band: string; dimensions?: ReadinessDimension[] }
interface BudgetStatus {
  breaker: 'ok' | 'warn' | 'tripped'
  remaining: number | null
  hasBudget?: boolean
  maxTokensPerDay?: number | null
  spentToday?: number
  usedRatio?: number | null
}
interface LoopRow {
  root: string; id: string; name: string; autonomy_level: 'L1' | 'L2' | 'L3'; status: string
  readiness: ReadinessScore; budget: BudgetStatus
}
interface LoopsSnapshot { generated_at: string; rows: LoopRow[] }
interface ErrorBody {
  error?: string
  errors?: string[]
}
type TFn = (key: string, vars?: Record<string, string | number>) => string

/** dimensions[].name（kernel computeReadiness 固定产出的 7 个键）→ 人话标签 i18n key。 */
const DIM_LABEL_KEYS: Record<string, string> = {
  goal: 'loops.dim_goal',
  kill_criteria: 'loops.dim_kill_criteria',
  human_gates: 'loops.dim_human_gates',
  budget: 'loops.dim_budget',
  cadence: 'loops.dim_cadence',
  change_prefix: 'loops.dim_change_prefix',
  observability: 'loops.dim_observability',
}

/** 预算摘要文案：无预算声明 → 固定「无预算限制」；有预算 → spent/max · 剩 remaining。 */
function budgetSummaryText(budget: BudgetStatus, t: TFn): string {
  if (!budget.hasBudget) return t('loops.no_budget')
  return t('loops.budget_summary', {
    spent: budget.spentToday ?? 0,
    max: budget.maxTokensPerDay ?? 0,
    remaining: budget.remaining ?? 0,
  })
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
  // 升档二次确认（评审 P1-6「升 L3 无确认」）：只存目标 row + target，Dialog 关闭/取消都只清这个
  // 状态，不触碰 promoteError（上一次失败的行内提示应该留着，不该被"打开一个新弹框"悄悄清掉）。
  const [confirmPromote, setConfirmPromote] = useState<{ row: LoopRow; target: string } | null>(null)

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

  /** 升档确认框「确认」钮：先同步关弹框（乐观关闭，对齐 AfkWorkbench 取消确认的既有先例），再真 POST。 */
  async function confirmPromoteNow(): Promise<void> {
    if (!confirmPromote) return
    const { row, target } = confirmPromote
    setConfirmPromote(null)
    await setLevel(row, target, 'promote')
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
                    {row.budget.hasBudget ? (
                      <div className="loop-budget" data-testid={`loop-budget-${row.id}`}>
                        <div className="loop-budget__track">
                          <div
                            className={`loop-budget__fill${(row.budget.usedRatio ?? 0) > 0.8 ? ' loop-budget__fill--warn' : ''}`}
                            style={{ width: `${Math.min(100, Math.max(0, (row.budget.usedRatio ?? 0) * 100))}%` }}
                            data-testid={`loop-budget-fill-${row.id}`}
                          />
                        </div>
                        <p className="loop-budget__label">{budgetSummaryText(row.budget, t)}</p>
                      </div>
                    ) : (
                      <p className="loop-budget__label loop-budget__label--none" data-testid={`loop-budget-none-${row.id}`}>
                        {t('loops.no_budget')}
                      </p>
                    )}
                    {row.readiness.dimensions && row.readiness.dimensions.length > 0 && (
                      <ul className="loop-dims" data-testid={`loop-dims-${row.id}`}>
                        {row.readiness.dimensions.map((d) => (
                          <li key={d.name} className={`loop-dim ${d.score >= d.max ? 'loop-dim--pass' : 'loop-dim--fail'}`}>
                            <span className="loop-dim__mark" aria-hidden="true">{d.score >= d.max ? '✓' : '✗'}</span>
                            {t(DIM_LABEL_KEYS[d.name] ?? d.name)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.budget.breaker === 'tripped' && (
                      <p className="loop-tripped" data-testid={`loop-tripped-${row.id}`}>{t('loops.tripped_help')}</p>
                    )}
                    {promoteError && <p className="loop-reject" data-testid="loop-reject">⛔ {promoteError}</p>}
                    {(nextLevel || prevLevel) && (
                      <div className="qk">
                        {nextLevel && (
                          <button type="button" className="qk__btn" data-testid={`loop-promote-${row.id}`} onClick={() => setConfirmPromote({ row, target: nextLevel })}>
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
      {confirmPromote && (
        <Dialog
          title={t('loops.promote_confirm_title', { level: confirmPromote.target })}
          onClose={() => setConfirmPromote(null)}
          testid="loop-promote-confirm"
          actions={
            <>
              <button type="button" className="btn btn--ghost" data-testid="loop-promote-confirm-cancel" onClick={() => setConfirmPromote(null)}>
                {t('loops.promote_confirm_no')}
              </button>
              <button type="button" className="btn" data-testid="loop-promote-confirm-submit" onClick={() => void confirmPromoteNow()}>
                {t('loops.promote_confirm_yes')}
              </button>
            </>
          }
        >
          <p className="dialog__desc">
            {t('loops.promote_confirm_desc', {
              band: confirmPromote.row.readiness.band,
              budget: budgetSummaryText(confirmPromote.row.budget, t),
              level: confirmPromote.target,
            })}
          </p>
        </Dialog>
      )}
    </section>
  )
}
