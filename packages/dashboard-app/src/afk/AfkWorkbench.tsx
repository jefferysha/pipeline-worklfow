import { useCallback, useEffect, useState } from 'react'
import { getToken } from '../api/client'
import { useT } from '../i18n'

/**
 * AfkWorkbench —— 工票车间重写（spec §4；视觉真相源 demo all-views §2）：
 * 左=挂队表单+队列卡（lane 语义徽章），右=详情（元信息/终端风日志块/操作按钮语义归位：
 * 取消=朱红 ghost，重试=绿）。
 *
 * 行为层三条纪律自零样式版逐字保留（whole-branch review 教训，一条不丢）：
 *  1. 快照/日志/取消/重试/挂队五处网络调用错误全部行内可见（先 r.ok 再 json）；
 *  2. 取消门禁用 automation==='running' 而非 lane（scheduled 折叠进 running 泳道但 cancel 必 400）；
 *     重试门禁用 RETRYABLE lane；操作成功后 refetch 快照并把 selected 按 root+name 重对齐；
 *  3. 挂队成功清空输入并 refetch；失败保留输入 + 行内错误；空名 no-op。
 */

interface AfkCard {
  name: string
  root: string
  automation: string
  lane: string
  sandbox: string
  worktree: string
  last_error: string
  phase?: string
}
interface AfkScheduler {
  status: string
  queued: number
  running: number
  paused: number
}
interface AfkSnapshot {
  scheduler?: AfkScheduler
  lanes: Record<string, AfkCard[]>
}
interface ErrorBody {
  error?: string
}

const RETRYABLE = new Set(['failed', 'conflict', 'paused'])

/** 非 2xx 响应尽量读出 server 的 { error } 文案；没有 JSON 体（如纯文本 500）就吞掉，回落调用方的通用文案。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (body && typeof body.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

function laneBadgeClass(lane: string): string {
  if (lane === 'running') return 'afk-state afk-state--run'
  if (lane === 'failed' || lane === 'conflict') return 'afk-state afk-state--fail'
  if (lane === 'paused') return 'afk-state afk-state--pause'
  return 'afk-state afk-state--queue'
}

export interface AfkWorkbenchProps {
  /** 挂队目标 project root —— App 的 currentRoot（D5 项目切换器语义）。 */
  root?: string
}

export function AfkWorkbench({ root = '' }: AfkWorkbenchProps): JSX.Element {
  const { t } = useT()
  const [snapshot, setSnapshot] = useState<AfkSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AfkCard | null>(null)
  const [log, setLog] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [enqueueName, setEnqueueName] = useState('')
  const [enqueueError, setEnqueueError] = useState<string | null>(null)

  const loadSnapshot = useCallback((): Promise<AfkSnapshot | null> => {
    return fetch('/api/afk/snapshot')
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || t('afk.snapshot_error_status', { status: r.status }))
        return r.json() as Promise<AfkSnapshot>
      })
      .then((body) => {
        setSnapshot(body)
        setSnapshotError(null)
        return body
      })
      .catch((err: unknown) => {
        setSnapshotError(t('afk.snapshot_error', { msg: err instanceof Error ? err.message : t('afk.network_error') }))
        return null
      })
  }, [t])

  useEffect(() => {
    loadSnapshot()
  }, [loadSnapshot])

  useEffect(() => {
    if (!selected) {
      setLog(null)
      setLogError(null)
      setActionError(null)
      return
    }
    setLogError(null)
    setActionError(null)
    fetch(`/api/afk/${encodeURIComponent(selected.name)}/log?root=${encodeURIComponent(selected.root)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || t('afk.log_error_status', { status: r.status }))
        return r.json() as Promise<{ log: string | null }>
      })
      .then((body) => setLog(body.log))
      .catch((err: unknown) => setLogError(t('afk.log_error', { msg: err instanceof Error ? err.message : t('afk.network_error') })))
  }, [selected, t])

  const allCards = snapshot ? Object.values(snapshot.lanes).flat() : []
  const scheduler = snapshot?.scheduler

  async function doAction(action: 'cancel' | 'retry'): Promise<void> {
    if (!selected) return
    setActionError(null)
    const label = action === 'cancel' ? t('afk.cancel') : t('afk.retry')
    try {
      const res = await fetch(`/api/afk/${encodeURIComponent(selected.name)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ root: selected.root }),
      })
      if (!res.ok) {
        const detail = await readErrorDetail(res)
        setActionError(detail ? t('afk.action_error', { label, msg: detail }) : t('afk.action_error_status', { label, status: res.status }))
        return
      }
      const fresh = await loadSnapshot()
      if (fresh) {
        const freshCards = Object.values(fresh.lanes).flat()
        setSelected(freshCards.find((c) => c.root === selected.root && c.name === selected.name) ?? null)
      }
    } catch (err) {
      setActionError(t('afk.action_error', { label, msg: err instanceof Error ? err.message : t('afk.network_error') }))
    }
  }

  async function doEnqueue(): Promise<void> {
    const name = enqueueName.trim()
    if (!name) return
    setEnqueueError(null)
    try {
      const res = await fetch(`/api/afk/${encodeURIComponent(name)}/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ root }),
      })
      if (!res.ok) {
        const detail = await readErrorDetail(res)
        setEnqueueError(detail ? t('afk.action_error', { label: t('afk.enqueue'), msg: detail }) : t('afk.action_error_status', { label: t('afk.enqueue'), status: res.status }))
        return
      }
      setEnqueueName('')
      await loadSnapshot()
    } catch (err) {
      setEnqueueError(t('afk.action_error', { label: t('afk.enqueue'), msg: err instanceof Error ? err.message : t('afk.network_error') }))
    }
  }

  if (snapshotError) {
    return <p className="view__note view__note--error" data-testid="afk-error">{snapshotError}</p>
  }

  return (
    <section className="view afk" data-testid="afk-view">
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('afk.title')}</h1>
          <p className="view__subtitle">
            {scheduler
              ? t('afk.scheduler_meta', { status: scheduler.status, running: scheduler.running, queued: scheduler.queued })
              : t('afk.subtitle')}
          </p>
        </div>
      </header>
      <div className="afk-split">
        <div className="afk-list">
          <div className="afk-enq">
            <input
              className="input"
              value={enqueueName}
              placeholder={t('afk.enqueue_placeholder')}
              onChange={(e) => { setEnqueueName(e.target.value); setEnqueueError(null) }}
            />
            <button type="button" className="btn" onClick={() => void doEnqueue()}>{t('afk.enqueue')}</button>
          </div>
          {enqueueError && <p className="field__error" data-testid="afk-enqueue-error">{enqueueError}</p>}
          {allCards.map((c) => {
            const active = selected && selected.root === c.root && selected.name === c.name
            return (
              <button
                type="button"
                key={`${c.root}:${c.name}`}
                data-testid={`afk-item-${c.name}`}
                className={[
                  'afk-item',
                  active ? 'is-active' : '',
                  c.lane === 'failed' || c.lane === 'conflict' ? 'is-failed' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelected(c)}
              >
                <span className="afk-itemtop">
                  <span className="card__name">{c.name}</span>
                  <span className={laneBadgeClass(c.lane)}>{c.lane}</span>
                </span>
                <span className="afk-itemmeta">{[c.phase, c.automation].filter(Boolean).join(' · ')}</span>
              </button>
            )
          })}
        </div>
        <div className="afk-detail">
          {selected ? (
            <>
              <div className="afk-dhead">
                <h2 className="afk-dtitle">{selected.name}</h2>
                <span className={laneBadgeClass(selected.lane)}>{selected.lane}</span>
                <span className="ticket-row__spacer" />
                <span className="afk-dactions">
                  {selected.automation === 'running' && (
                    <button type="button" className="btn--verm-ghost" data-testid="afk-cancel" onClick={() => doAction('cancel')}>
                      {t('afk.cancel')}
                    </button>
                  )}
                  {RETRYABLE.has(selected.lane) && (
                    <button type="button" className="qk__btn" data-testid="afk-retry" onClick={() => doAction('retry')}>
                      {t('afk.retry')}
                    </button>
                  )}
                </span>
              </div>
              <div className="afk-dmeta">
                <span>automation <b>{selected.automation}</b></span>
                {selected.sandbox && <span>{t('afk.sandbox_label')} <b>{selected.sandbox}</b></span>}
                {selected.worktree && <span>{t('afk.worktree_label')} <b>{selected.worktree}</b></span>}
              </div>
              {selected.last_error && (
                <p className="loop-reject" data-testid="afk-last-error">{t('afk.last_error_label')}：{selected.last_error}</p>
              )}
              {actionError && <p className="field__error" data-testid="afk-action-error">{actionError}</p>}
              {logError ? (
                <p className="field__error" data-testid="afk-log-error">{logError}</p>
              ) : (
                <>
                  <div className="afk-loghead">.sandcastle-run.log</div>
                  <pre className="afk-log" data-testid="afk-log">{log ?? t('afk.empty_log')}</pre>
                </>
              )}
            </>
          ) : (
            <p className="view__note" data-testid="afk-select-hint">{t('afk.select_hint')}</p>
          )}
        </div>
      </div>
    </section>
  )
}
