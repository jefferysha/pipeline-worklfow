import { useCallback, useEffect, useState } from 'react'
import { getToken } from '../api/client'
import { useT } from '../i18n'

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
 *
 * whole-branch review（GOAL v2.0 集成收尾）追加两处修复：① 取消/重试成功后 refetch 一次快照
 * （此前成功只清错误、不刷新，列表/lane 停在操作前的旧状态，要手动刷新页面才看得到真实结果）；
 * ② 详情区补渲染 sandbox/worktree 路径（F3/design §4 明确要求，此前 AfkCard 已经声明并 fetch
 * 了这两个字段但从未渲染，是 UI 遗漏非数据缺口）。
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

export interface AfkWorkbenchProps {
  /**
   * 挂队目标 project root——同 App.tsx 传给 WorkflowCanvas/WorkflowEditorView 的
   * `currentRoot` 同一份值（`snapshot.projects[0]?.root`）。已知简化点同 G14：没有
   * "选哪个已注册项目挂队"的显式切换，多项目场景固定挂到第一个。
   */
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
      // 成功后 refetch 一次快照并把 selected 对齐到刷新后的同一张卡（按 root+name 匹配）——
      // 否则详情区仍读旧的 selected 对象，取消/重试按钮的门禁（automation/lane）会显示操作前
      // 的陈旧状态，用户看不出操作是否真的生效，只能手动刷新整个页面才能看到真实结果。
      const fresh = await loadSnapshot()
      if (fresh) {
        const freshCards = Object.values(fresh.lanes).flat()
        setSelected(freshCards.find((c) => c.root === selected.root && c.name === selected.name) ?? null)
      }
    } catch (err) {
      setActionError(t('afk.action_error', { label, msg: err instanceof Error ? err.message : t('afk.network_error') }))
    }
  }

  // 挂队缺口修复（2026-07-09，真机验证发现）：此前面板只有查看/取消/重试，没有把一个 change
  // 摆进 AFK 队列的入口——`pipeline afk enqueue <name>` 是唯一路径，dashboard 点不到。同
  // doAction 的错误可见性纪律（非 2xx 与网络层 throw 都要落到行内提示，不静默失败）；成功后
  // 同样 refetch 快照（新挂队的 change 需要出现在 queued 泳道），并清空输入框（不清空的话，
  // 已提交的 change 名还留在框里,用户分不清是"已提交"还是"忘了填"）。
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
    return <p className="subtitle">{snapshotError}</p>
  }

  return (
    <div className="split">
      <div className="mock-sidebar">
        <div>
          <input
            value={enqueueName}
            placeholder={t('afk.enqueue_placeholder')}
            onChange={(e) => { setEnqueueName(e.target.value); setEnqueueError(null) }}
          />
          <button onClick={() => void doEnqueue()}>{t('afk.enqueue')}</button>
        </div>
        {enqueueError && <p className="subtitle">{enqueueError}</p>}
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
            {selected.sandbox && <p className="subtitle">{t('afk.sandbox_label')}：{selected.sandbox}</p>}
            {selected.worktree && <p className="subtitle">{t('afk.worktree_label')}：{selected.worktree}</p>}
            {selected.last_error && <p className="subtitle">{t('afk.last_error_label')}：{selected.last_error}</p>}
            {logError ? <p className="subtitle">{logError}</p> : <pre>{log ?? t('afk.empty_log')}</pre>}
            {actionError && <p className="subtitle">{actionError}</p>}
            {selected.automation === 'running' && <button onClick={() => doAction('cancel')}>{t('afk.cancel')}</button>}
            {RETRYABLE.has(selected.lane) && <button onClick={() => doAction('retry')}>{t('afk.retry')}</button>}
          </>
        ) : (
          <p className="subtitle">{t('afk.select_hint')}</p>
        )}
      </div>
    </div>
  )
}
