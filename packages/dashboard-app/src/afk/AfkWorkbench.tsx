import { useEffect, useState } from 'react'
import { getToken } from '../api/client'

/**
 * AfkWorkbench（afk-workbench Task 7）—— 列表 + 详情侧栏工作台，取代 advanced/AfkPanel 的只读摘要
 * （Task 8 接线进导航后移除后者）。消费 GET /api/afk/snapshot（已存在）、GET /api/afk/:name/log
 * （Task 6）、POST /api/afk/:name/cancel（Task 4）、POST /api/afk/:name/retry（Task 5）。
 *
 * 错误可见性（本效力两次修复循环——SkillTransferModal.tsx / LoopsPanel.tsx——都在首次评审后
 * 补的教训，这里从一开始就写进去）：挂载拉快照、选中后拉日志、点取消/重试三处网络调用都不能
 * 静默失败——非 2xx（三个新端点对"change 不存在"统一返回 400 {ok:false,error}）和网络层
 * throw（fetch 本身 reject）都要落到可见的行内提示，不是永远停在空白/加载态。刻意不做的事：
 * 不重试、不上 toast 库，只是 state + 一段文字，同 LoopsPanel.tsx 的既有模式。
 */

interface AfkCard {
  name: string
  root: string
  automation: string
  lane: string
  sandbox: string
  worktree: string
  last_error: string
}
interface AfkSnapshot {
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

export function AfkWorkbench(): JSX.Element {
  const [snapshot, setSnapshot] = useState<AfkSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AfkCard | null>(null)
  const [log, setLog] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/afk/snapshot')
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `快照获取失败（${r.status}）`)
        return r.json() as Promise<AfkSnapshot>
      })
      .then((body) => {
        setSnapshot(body)
        setSnapshotError(null)
      })
      .catch((err: unknown) => setSnapshotError(`加载失败：${err instanceof Error ? err.message : '网络错误'}`))
  }, [])

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
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `日志获取失败（${r.status}）`)
        return r.json() as Promise<{ log: string | null }>
      })
      .then((body) => setLog(body.log))
      .catch((err: unknown) => setLogError(`日志加载失败：${err instanceof Error ? err.message : '网络错误'}`))
  }, [selected])

  const allCards = snapshot ? Object.values(snapshot.lanes).flat() : []

  async function doAction(action: 'cancel' | 'retry'): Promise<void> {
    if (!selected) return
    setActionError(null)
    const label = action === 'cancel' ? '取消' : '重试'
    try {
      const res = await fetch(`/api/afk/${encodeURIComponent(selected.name)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ root: selected.root }),
      })
      if (!res.ok) {
        const detail = await readErrorDetail(res)
        setActionError(detail ? `${label}失败：${detail}` : `${label}失败（${res.status}）`)
      }
    } catch (err) {
      setActionError(`${label}失败：${err instanceof Error ? err.message : '网络错误'}`)
    }
  }

  if (snapshotError) {
    return <p className="subtitle">{snapshotError}</p>
  }

  return (
    <div className="split">
      <div className="mock-sidebar">
        {allCards.map((c) => (
          <div key={`${c.root}:${c.name}`} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
            {c.lane === 'running' ? '●' : '○'} <span>{c.name}</span> · {c.lane}
          </div>
        ))}
      </div>
      <div className="mock-content">
        {selected ? (
          <>
            <b>{selected.name}</b> · {selected.automation}
            {logError ? <p className="subtitle">{logError}</p> : <pre>{log ?? '（无日志）'}</pre>}
            {actionError && <p className="subtitle">{actionError}</p>}
            {selected.automation === 'running' && <button onClick={() => doAction('cancel')}>取消</button>}
            {RETRYABLE.has(selected.lane) && <button onClick={() => doAction('retry')}>重试</button>}
          </>
        ) : (
          <p className="subtitle">选一个 change 查看详情</p>
        )}
      </div>
    </div>
  )
}
