import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getToken } from '../api/client'
import { useT } from '../i18n'
import { Dialog } from '../shell/Dialog'
import type { Snapshot } from '../types'
import { useAfkLog } from './useAfkLog'

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
 *
 * Task 12（评审 P0-3「监控不成立」+ P1-7）追加四件事，均是在以上三条纪律之外新增，不改动
 * 三条本身：
 *  4. 日志区接 useAfkLog（running 时 2.5s 轮询 + 「跟随尾部」开关 + 「↻ 刷新」手动钮）——此前
 *     选中一次即永久冻结，运行中的任务在面板里看起来像是卡死了；
 *  5. 卡片加项目 root 徽章 + 列表按 currentRoot 过滤（''=聚合显示全部）——AFK 此前是全应用
 *     唯一无视 currentRoot 语境的视图，跨项目卡片混列且不显示各自属于哪个项目；
 *  6. 挂队输入换成 `<input list>` + `<datalist>`，候选来自主 snapshot 当前语境的 change 名——
 *     此前纯自由文本，用户只能凭记忆手打 change 名，打错必得 400；
 *  7. 取消操作加 Dialog 二次确认（危险操作，此前一次点击直接触发，无回退余地）。
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

/** root 尾段（同 inbox.ts projectName()/App.tsx navProjects/BoardView.tsx rootTail() 同款
 *  一行逻辑的第四份局部拷贝——BoardView.tsx 头注早有先例判断"三处都只是这一行，不值得为此
 *  新增跨模块依赖"，这里是同一判断的延伸）：卡片项目徽章展示用。 */
function rootTail(root: string): string {
  const parts = root.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? root
}

interface ContextChange {
  root: string
  name: string
  phase: string
}

/**
 * 挂队输入 datalist 候选（评审 P1-7：此前纯自由文本，用户只能凭记忆手打 change 名，打错必
 * 得 400）：主 snapshot（App 的 useSnapshot() 产出，含每个 change 全字段——与本组件自己 fetch
 * 的 /api/afk/snapshot 队列/lane 视图是两个不同数据源，字段形状也不同，不要混用）里，当前
 * 语境（currentRoot 同款判据：''=聚合看全部 ok 项目，否则只看该项目）下的全部 change。过滤
 * 逻辑复刻 inbox.ts selectInbox() 的既定 currentRoot 判据，不新发明一套。
 */
function contextChanges(main: Snapshot | null, root: string): ContextChange[] {
  if (!main) return []
  const out: ContextChange[] = []
  for (const p of main.projects) {
    if (!p.ok) continue
    if (root !== '' && p.root !== root) continue
    for (const c of p.changes) out.push({ root: p.root, name: c.name, phase: c.phase })
  }
  return out
}

export interface AfkWorkbenchProps {
  /** 挂队目标 project root，同时也是列表过滤语境（Task 12 起）—— App 的 currentRoot（D5 项目
   *  切换器语义）：''=聚合，卡片列表显示全部项目（各自带 root 徽章消歧）；非空=只看该项目。 */
  root?: string
  /** 主 snapshot（App 的 useSnapshot() 产出，含每个项目 change 全字段——与本组件自己 fetch 的
   *  /api/afk/snapshot 队列/lane 视图是两个不同数据源，不要混用）：挂队输入框 datalist 候选
   *  据此按当前语境（root）过滤产出，见 contextChanges()。 */
  snapshot?: Snapshot | null
  /** 详情区「查看 change →」点击回调，传出该卡自己的 (root, name)（不是 currentRoot——聚合
   *  语境下两者不等价，见卡片 root 字段）。App 决定具体接线方式，本组件不关心；缺省不传则
   *  不渲染该按钮。 */
  onOpenChange?: (root: string, name: string) => void
}

export function AfkWorkbench({ root = '', snapshot: mainSnapshot = null, onOpenChange }: AfkWorkbenchProps): JSX.Element {
  const { t } = useT()
  const [snapshot, setSnapshot] = useState<AfkSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AfkCard | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [enqueueName, setEnqueueName] = useState('')
  const [enqueueError, setEnqueueError] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  // Task 12：日志 fetch/轮询/跟随下沉进 useAfkLog——root 传 selected.root（卡片自己的项目，
  // 不是 currentRoot，二者聚合语境下不等价，见 useAfkLog.ts 头注对省略 root 的后果分析）。
  const { log, follow, setFollow, refresh: refreshLog } = useAfkLog(
    selected?.name ?? null,
    selected?.automation,
    selected?.root ?? '',
  )

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

  // 日志 fetch/轮询已下沉进 useAfkLog（Task 12）；这里只保留"切换选中目标即清空上一张卡遗留的
  // 瞬态 UI 态"这一半既有职责——取消确认框同理清（防御性：正常交互路径下 Dialog 背板会挡住
  // 其它卡片点击，这一步理论上不会被触发，但保持"选中变了、瞬态态归零"这条既有纪律一致）。
  useEffect(() => {
    setActionError(null)
    setCancelConfirmOpen(false)
  }, [selected])

  // 「跟随尾部」（Task 12，评审 P0-3）：follow 开着时，日志内容每次更新都滚到底部。jsdom 不算
  // 真布局，scrollHeight/scrollTop 在测试环境里恒为 0——这段效果本身不写专门断言锁（已知边界，
  // 见任务报告），行为在真浏览器里可核验。
  useEffect(() => {
    if (follow && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log, follow])

  const allCards = snapshot ? Object.values(snapshot.lanes).flat() : []
  // currentRoot 过滤（评审 P0-3：AFK 此前是全应用唯一无视 currentRoot 语境的视图，跨项目卡片
  // 混列且不显 root）——''=聚合，原样显示全部；非空=只保留该项目的卡。
  const visibleCards = root === '' ? allCards : allCards.filter((c) => c.root === root)
  const scheduler = snapshot?.scheduler
  const enqueueOptions = useMemo(() => contextChanges(mainSnapshot, root), [mainSnapshot, root])

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
              list="afk-enqueue-datalist"
              value={enqueueName}
              placeholder={t('afk.enqueue_placeholder')}
              onChange={(e) => { setEnqueueName(e.target.value); setEnqueueError(null) }}
            />
            <datalist id="afk-enqueue-datalist">
              {enqueueOptions.map((c, i) => (
                <option key={`${c.root}::${c.name}::${i}`} value={c.name}>
                  {t('afk.datalist_option', { name: c.name, phase: c.phase })}
                </option>
              ))}
            </datalist>
            <button type="button" className="btn" disabled={!enqueueName.trim()} onClick={() => void doEnqueue()}>{t('afk.enqueue')}</button>
          </div>
          {enqueueError && <p className="field__error" data-testid="afk-enqueue-error">{enqueueError}</p>}
          {visibleCards.map((c) => {
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
                  <span className="afk-itemtitle">
                    <span className="card__name">{c.name}</span>
                    <span className="afk-item-root" data-testid={`afk-item-root-${c.name}`}>{rootTail(c.root)}</span>
                  </span>
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
                  {onOpenChange && (
                    <button
                      type="button"
                      className="qk__btn qk__btn--ghost"
                      data-testid="afk-open-change"
                      onClick={() => onOpenChange(selected.root, selected.name)}
                    >
                      {t('afk.view_change')}
                    </button>
                  )}
                  {selected.automation === 'running' && (
                    <button type="button" className="btn--verm-ghost" data-testid="afk-cancel" onClick={() => setCancelConfirmOpen(true)}>
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
              <div className="afk-loghead">
                <span>.sandcastle-run.log</span>
                <span className="afk-logtools">
                  <label className="afk-follow">
                    <input
                      type="checkbox"
                      data-testid="afk-follow"
                      checked={follow}
                      onChange={(e) => setFollow(e.target.checked)}
                    />
                    {t('afk.follow_label')}
                  </label>
                  <button type="button" className="qk__btn qk__btn--ghost" data-testid="afk-log-refresh" onClick={() => void refreshLog()}>
                    {t('afk.log_refresh')}
                  </button>
                </span>
              </div>
              <pre className="afk-log" data-testid="afk-log" ref={logRef}>{log}</pre>
            </>
          ) : (
            <p className="view__note" data-testid="afk-select-hint">{t('afk.select_hint')}</p>
          )}
        </div>
      </div>
      {cancelConfirmOpen && selected && (
        <Dialog
          title={t('afk.cancel_confirm_title', { name: selected.name })}
          onClose={() => setCancelConfirmOpen(false)}
          testid="afk-cancel-dialog"
          actions={
            <>
              <button type="button" className="btn btn--ghost" data-testid="afk-cancel-dismiss" onClick={() => setCancelConfirmOpen(false)}>
                {t('afk.cancel_confirm_dismiss')}
              </button>
              <button
                type="button"
                className="btn btn--verm-ghost"
                data-testid="afk-cancel-confirm"
                onClick={() => { setCancelConfirmOpen(false); void doAction('cancel') }}
              >
                {t('afk.cancel_confirm_action')}
              </button>
            </>
          }
        >
          <p className="dialog__desc">{t('afk.cancel_confirm_desc', { name: selected.name })}</p>
        </Dialog>
      )}
    </section>
  )
}
