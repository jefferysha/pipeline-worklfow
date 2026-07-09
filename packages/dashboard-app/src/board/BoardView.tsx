import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { PHASES, type ChangeSnapshot, type Phase, type Snapshot } from '../types'
import { plannedTransition, type PlannedTransition } from './events'
import { DEFAULT_RULES } from '../model/workflowModel'

interface BoardViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** 写回一次转换（App 注入 = api/client.postTransition + 成功后 refresh）。 */
  onTransition: (name: string, root: string, event: string) => Promise<void>
  onToast?: (msg: string) => void
  onError?: (msg: string) => void
}

interface FlatChange {
  root: string
  change: ChangeSnapshot
}

interface Pending {
  name: string
  root: string
  planned: PlannedTransition
}

interface DragPayload {
  name: string
  root: string
  phase: string
}

/**
 * 看板 Kanban —— 病灶①解法：本视图只做操作（拖拽换列 → 转换），配置矩阵搬去 Settings。
 * 7 相位列；拖卡到目标相位列 → plannedTransition 计算 event；非法边 no-op，回退边二次确认。
 */
export function BoardView({ snapshot, loading, error, onTransition, onToast, onError }: BoardViewProps): JSX.Element {
  const { t } = useT()
  const [dragOver, setDragOver] = useState<Phase | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  const flat = useMemo<FlatChange[]>(() => {
    const out: FlatChange[] = []
    for (const p of snapshot?.projects ?? []) {
      if (!p.ok) continue
      for (const c of p.changes) out.push({ root: p.root, change: c })
    }
    return out
  }, [snapshot])

  const byPhase = useMemo(() => {
    const m = new Map<Phase, FlatChange[]>(PHASES.map((p) => [p, []]))
    for (const fc of flat) {
      const bucket = m.get(fc.change.phase as Phase)
      if (bucket) bucket.push(fc)
    }
    return m
  }, [flat])

  async function apply(name: string, root: string, planned: PlannedTransition): Promise<void> {
    setBusy(true)
    try {
      await onTransition(name, root, planned.event)
      onToast?.(t('board.transition_ok', { name, event: planned.event }))
    } catch (e) {
      onError?.(t('board.transition_fail', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  function onDrop(toPhase: Phase, raw: string): void {
    setDragOver(null)
    let payload: DragPayload
    try {
      payload = JSON.parse(raw) as DragPayload
    } catch {
      return
    }
    if (!payload || typeof payload !== 'object' || !payload.name || !payload.phase) return
    // 临时桥（Task 6 分组看板重写时移除）：本视图当前仍只渲染 default 七列
    const planned = plannedTransition(DEFAULT_RULES, payload.phase, toPhase)
    if (!planned) return // 非法落点：no-op（视觉回弹）
    if (planned.backward) {
      setPending({ name: payload.name, root: payload.root ?? '', planned })
    } else {
      void apply(payload.name, payload.root ?? '', planned)
    }
  }

  if (loading && !snapshot) {
    return <p className="view__note" data-testid="board-loading">{t('common.loading')}</p>
  }
  if (error && !snapshot) {
    return <p className="view__note view__note--error" data-testid="board-error">{error}</p>
  }
  if (flat.length === 0) {
    return (
      <section className="view board" data-testid="board-view">
        <p className="view__note" data-testid="board-empty">{t('board.empty')}</p>
      </section>
    )
  }

  return (
    <section className="view board" data-testid="board-view">
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('board.title')}</h1>
          <p className="view__subtitle">{t('board.subtitle')}</p>
        </div>
      </header>
      <div className="board__grid" data-testid="board-grid">
        {PHASES.map((phase) => {
          const cards = byPhase.get(phase) ?? []
          const isTarget = dragOver === phase
          return (
            <div
              key={phase}
              data-testid={`board-col-${phase}`}
              className={isTarget ? 'board__col board__col--target' : 'board__col'}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragOver !== phase) setDragOver(phase)
              }}
              onDragLeave={() => {
                if (dragOver === phase) setDragOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                onDrop(phase, e.dataTransfer.getData('application/json'))
              }}
            >
              <div className="board__col-head">
                <span className="board__col-name">{t(`phases.${phase}`)}</span>
                <span className="board__col-count" data-testid={`board-col-count-${phase}`}>{cards.length}</span>
              </div>
              <div className="board__col-body">
                {cards.map(({ root, change }) => (
                  <div
                    key={`${root}/${change.name}`}
                    className="card board__card"
                    role="button"
                    tabIndex={0}
                    aria-label={`change ${change.name}`}
                    data-testid={`board-card-${change.name}`}
                    draggable
                    onDragStart={(e) => {
                      const payload: DragPayload = { name: change.name, root, phase: change.phase }
                      e.dataTransfer.setData('application/json', JSON.stringify(payload))
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                  >
                    <span className="card__name">{change.name}</span>
                    {change.track && <span className="card__track">{change.track}</span>}
                  </div>
                ))}
                {cards.length === 0 && <div className="board__col-empty">{t('board.col_empty')}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {pending && (
        <div className="dialog__backdrop" data-testid="board-confirm">
          <div className="dialog" role="dialog" aria-modal="true" aria-label={t('board.confirm_backward_title')}>
            <h2 className="dialog__title">{t('board.confirm_backward_title')}</h2>
            <p className="dialog__desc">
              {t('board.confirm_backward_desc', {
                name: pending.name,
                from: t(`phases.${pending.planned.from}`),
                to: t(`phases.${pending.planned.to}`),
                event: pending.planned.event,
              })}
            </p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setPending(null)}>
                {t('board.confirm_no')}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                data-testid="board-confirm-yes"
                disabled={busy}
                onClick={() => void apply(pending.name, pending.root, pending.planned)}
              >
                {t('board.confirm_yes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
