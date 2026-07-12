import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import type { ChangeSnapshot, Snapshot } from '../types'
import { rulesKey, type WorkflowRules } from '../model/workflowModel'
import { changeProgressState, type ProgressState } from '../model/progressModel'
import { legalTargets, plannedTransition, type PlannedTransition } from '../model/events'
import { shortTime } from '../model/time'
import { Dialog } from '../shell/Dialog'
import { Icon } from '../shell/Icon'
import { revealList } from '../shared/motion'
import { TaskDetail } from '../shared/TaskDetail'
import { postAfkDismiss, postAfkRetry } from '../api/client'
import { diagnoseFailure } from '../shared/failureDiagnosis'
import { gateEvidence, VERIFY_STATUS_FIELDS, type EvidenceChip } from './evidence'
import { changeWorkflow, decisionKind, projectName, selectInbox, type InboxItem } from './inbox'

interface InboxViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** D5 项目切换器语义：非空=只看该项目；空串=全部项目聚合（Task 5 契约）。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集，键=rulesKey(root,wf)（G19③：聚合语境下同名自定义
   *  workflow 跨项目不串缓存，键必须带 root 才能唯一定位）。 */
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  onOpenBoard: () => void
  /** 快捷转换（App 注入 = api/client.postTransition + 成功后 refresh）。 */
  onTransition: (name: string, root: string, event: string) => Promise<void>
  onToast?: (msg: string) => void
  onError?: (msg: string) => void
  /** G18 新建 change 入口（App 提供；无项目语境时缺省不渲染）。 */
  onNewChange?: () => void
}

interface Pending {
  name: string
  root: string
  planned: PlannedTransition
}

/** 行/详情共用的结论式语义（demo v5 三情形口径）：badge 一句结论 + lead 一句人话。 */
interface RowSemantics {
  tone: 'green' | 'red'
  badgeText: string
  lead: string
}

/** 老内核 cmd_get 口径：字面 'null'（init heredoc）或空串算未设（同 evidence.ts 私有 fieldStr）。 */
function fieldStr(c: ChangeSnapshot, key: string): string {
  const v = c.fields[key]
  return typeof v === 'string' ? v : ''
}

/**
 * 行语义判定（T9，demo v5 收件箱三情形口径）：
 *   · failed（automation ∈ {failed, conflict}）→「失败 ×N · 等你决定」+「重试还是放弃？」；
 *   · gate 且证据里有未过判定（verify 三轨白名单，产物没产出不等于验证没过——Important-1
 *     教训沿用）或根本没有任何自动证据（自定义门/纯人判）→「等你判断」；
 *   · gate 且证据齐 →「✓ 可以放行」，lead 按决定类型细分（verify 用 demo 全句，其余沿
 *     awaiting.* 既有细分文案）。
 * 纯函数（t 注入），行与右栏详情卡头部 badge 同源消费，两处不漂移。
 */
function rowSemantics(
  change: ChangeSnapshot,
  state: ProgressState,
  evidence: EvidenceChip[],
  t: (key: string, vars?: Record<string, string | number>) => string,
): RowSemantics {
  if (state === 'failed') {
    const attempts = fieldStr(change, 'automation_attempts')
    const err = fieldStr(change, 'automation_last_error') || t('detail.fail_generic')
    return {
      tone: 'red',
      badgeText: attempts !== '' ? t('inbox.badge_failed', { n: attempts }) : t('inbox.badge_failed_plain'),
      lead: attempts !== '' ? t('inbox.lead_failed', { err, n: attempts }) : t('inbox.lead_failed_plain', { err }),
    }
  }
  const hasJudgment = evidence.some((c) => !c.unset)
  if (!hasJudgment) {
    return { tone: 'red', badgeText: t('inbox.badge_judge'), lead: t('inbox.lead_judge', { wf: changeWorkflow(change) }) }
  }
  const kind = decisionKind(change)
  const failedTracks = evidence.filter(
    (c) => (VERIFY_STATUS_FIELDS as readonly string[]).includes(c.key) && c.tone !== 'pass',
  )
  if (kind === 'verify' && failedTracks.length > 0) {
    return {
      tone: 'red',
      badgeText: t('inbox.badge_judge'),
      lead: t('detail.why_gate', { names: failedTracks.map((c) => c.key.replace(/_result$/, '')).join('、') }),
    }
  }
  return {
    tone: 'green',
    badgeText: t('inbox.badge_pass'),
    lead: kind === 'verify' ? t('inbox.lead_verify_pass') : t(`inbox.awaiting.${kind}`),
  }
}

/** 结论式 badge（demo badge--green / badge--red 对位；红系带闪点，同 prg-badge 语义家族）。 */
function semBadge(sem: RowSemantics): JSX.Element {
  if (sem.tone === 'green') return <span className="badge badge--green">{sem.badgeText}</span>
  return (
    <span className="badge badge--red">
      <span className="dot" aria-hidden="true" />
      {sem.badgeText}
    </span>
  )
}

/**
 * 行内证据 chip（Task 7 评审 P0-1 沿用：gateEvidence 复用，行内即时可见）。copyable 字段渲染
 * 成可点 button（拷贝值），其余 tone 语义字段渲染成只读 span；unset 走 i18n t('evidence.unset')。
 */
function renderEvidenceChip(
  chip: EvidenceChip,
  onCopy: (value: string) => void,
  t: (key: string, vars?: Record<string, string | number>) => string,
): JSX.Element {
  if (chip.copyable) {
    return (
      <button
        key={chip.key}
        type="button"
        className="ev__chip ev__chip--neutral"
        data-testid={`inbox-evidence-${chip.key}`}
        onClick={() => onCopy(chip.value)}
      >
        <Icon name="copy" size={11} />
        {chip.key}={chip.value}
      </button>
    )
  }
  return (
    <span key={chip.key} className={`ev__chip ev__chip--${chip.tone}`} data-testid={`inbox-evidence-${chip.key}`}>
      {chip.tone === 'pass' && <Icon name="check" size={11} />}
      {chip.tone === 'fail' && <Icon name="x" size={11} />}
      {chip.key}={chip.unset ? t('evidence.unset') : chip.value}
    </span>
  )
}

/** Enter/j/k 键盘旁路的 tagName 集合（终审修复批口径沿用：Dialog 内 select/按钮/链接上的
 *  这些键不该被 document 级监听器接管）。 */
const FOCUSABLE_BYPASS_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'])

/** 空态给的「建 change」教学命令（字面终端命令，与 shell/Onboarding 的 INIT_CMD 同口径）。 */
const EMPTY_INIT_CMD = 'pipeline init my-change --track chat'

function itemKey(it: InboxItem): string {
  return `${it.root}/${it.change.name}`
}

/**
 * 收件箱 v5（T9）—— master-detail：左行列表（人话主文案 + 结论式 badge + 证据 chips）+
 * 右 356px sticky 详情（shared/TaskDetail variant='timeline'）。交互基准 demo v5 收件箱段：
 * 默认开首行详情；点行切换；Esc/✕ 收起出占位卡；Enter 开关 kbd 焦点行；j/k 移焦点环
 * （scrollIntoView 跟随）。动作条按计划决议 #13 归宿主：gate 行放行/打回走既有 transition
 * 管线（回退二次确认 + busy 守卫），失败行重试/放弃走 afk 端点（postAfkRetry/postAfkDismiss，
 * dismiss 端点由 T11 落地）。旧 ChangeDetailCard 与旧看板视图已随 T18 退役删除。
 * requirement 数据面：change fields 无「任务一句话」字段——不传 prop，TaskDetail 缺省整节
 * 不渲染（读组件缺省行为，不伪造需求文案）。
 */
export function InboxView({ snapshot, loading, error, currentRoot, rulesByKey, onOpenBoard, onTransition, onToast, onError, onNewChange }: InboxViewProps): JSX.Element {
  const { t } = useT()
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  // master-detail 选中态：selKey 是被选行的 `${root}/${name}` 复合键（聚合语境同名 change 不串），
  // open 是右栏详情开合（demo 默认开）。selKey=null 或指向已离开收件箱的行 → 回落首行——
  // 转换成功后该行离场，详情自动落到下一张待拍板的卡，不留空窗。
  const [selKey, setSelKey] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  // 键盘焦点环索引——j/k 移动它，与「哪行在右栏展开」语义分离（点击/Enter 才改选中）。
  const [kbdFocus, setKbdFocus] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const revealedRef = useRef(false)
  const items = useMemo(() => selectInbox(snapshot, currentRoot, rulesByKey), [snapshot, currentRoot, rulesByKey])

  // 视图进场 stagger（只播首次数据到达，SSE 后续刷新瞬时——product register：不重播编排）
  useEffect(() => {
    if (items.length > 0 && listRef.current && !revealedRef.current) {
      revealedRef.current = true
      revealList(listRef.current.children)
    }
  }, [items.length])

  // 行数收缩时焦点环回夹（转换成功/放弃后行离场，焦点不悬空在越界索引上）
  useEffect(() => {
    setKbdFocus((i) => Math.min(i, Math.max(items.length - 1, 0)))
  }, [items.length])

  const selectedItem: InboxItem | undefined = open
    ? (items.find((it) => itemKey(it) === selKey) ?? items[0])
    : undefined

  // j/k 移焦点环（scrollIntoView 跟随）、Enter 开/关焦点行详情、Esc 收起——单个 document
  // keydown 监听。两条旁路沿终审修复批口径：① e.target 命中 FOCUSABLE_BYPASS_TAGS 整体不
  // 处理（对话框覆盖层不卸载背后的本视图，敲字符/控件上的 Enter 不该拨动隐藏状态）；
  // ② Enter/Esc 时 document 上还有打开的 [role="dialog"]（回退确认框）→ 让位给 Dialog 自己
  // 的 LIFO 栈，避免同一次按键双重反应。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target
      if (target instanceof HTMLElement && FOCUSABLE_BYPASS_TAGS.has(target.tagName)) return
      if (e.key === 'j' || e.key === 'k') {
        const next = e.key === 'j' ? Math.min(kbdFocus + 1, items.length - 1) : Math.max(kbdFocus - 1, 0)
        setKbdFocus(next)
        // jsdom / 极老内核无 scrollIntoView——可选调用，不做垫片
        rowRefs.current[next]?.scrollIntoView?.({ block: 'nearest' })
      } else if (e.key === 'Enter') {
        if (document.querySelector('[role="dialog"]')) return
        const item = items[kbdFocus]
        if (!item) return
        const key = itemKey(item)
        if (open && selectedItem && itemKey(selectedItem) === key) {
          setOpen(false)
        } else {
          setSelKey(key)
          setOpen(true)
        }
      } else if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"]')) return
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [items, kbdFocus, open, selectedItem])

  const rootToName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of snapshot?.projects ?? []) m.set(p.root, projectName(p))
    return m
  }, [snapshot])

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

  /** 失败卡动作（demo 口径：重试=清零计数重新挂队；放弃=退出自动化现场保留）。busy 与
   *  transition 动作共锁——详情卡是唯一动作面，在途期间所有按钮一起禁用。 */
  async function doAfk(action: 'retry' | 'dismiss', item: InboxItem): Promise<void> {
    setBusy(true)
    try {
      if (action === 'retry') await postAfkRetry(item.change.name, item.root)
      else await postAfkDismiss(item.change.name, item.root)
      onToast?.(t(action === 'retry' ? 'inbox.afk_retry_ok' : 'inbox.afk_dismiss_ok', { name: item.change.name }))
    } catch (e) {
      onError?.(t('inbox.afk_fail', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
    }
  }

  // busy 守卫：Esc/backdrop/取消钮都走这里——在途请求期间确认框不许关（既有语义沿用）。
  // 禁止用 useCallback 包裹——会冻结 busy 快照，连取消钮的 busy 语义一起假死。
  function closePending(): void {
    if (!busy) setPending(null)
  }

  function copyEvidence(value: string): void {
    void navigator.clipboard?.writeText(value).then(() => {
      onToast?.(t('detail.copied', { value }))
    })
  }

  /**
   * 详情卡动作条（决议 #13 props 化下放宿主，文案以 demo v5 为唯一口径）：
   *   · failed →「✕ 放弃」+「↻ 重试」走 afk 端点；
   *   · gate → 全部出边逐条渲染（Important-2 纪律沿用：2+ 条同向出边一条不落）——单边用
   *     demo 字面「→ 放行」「↩ 打回」，多边退到带目标名的「→ {to}」消歧；回退边先过二次确认。
   * 无可用动作（rules 缺失/无出边）→ undefined，TaskDetail 不渲染动作条。
   */
  function detailActions(item: InboxItem, state: ProgressState, rules: WorkflowRules | undefined): ReactNode | undefined {
    if (state === 'failed') {
      return (
        <>
          <button
            type="button"
            className="btn btn--ghost ibx-act"
            data-testid="inbox-act-dismiss"
            disabled={busy}
            onClick={() => void doAfk('dismiss', item)}
          >
            {t('inbox.act_dismiss')}
          </button>
          <button
            type="button"
            className="btn ibx-act"
            data-testid="inbox-act-retry"
            disabled={busy}
            onClick={() => void doAfk('retry', item)}
          >
            {t('inbox.act_retry')}
          </button>
        </>
      )
    }
    if (!rules) return undefined
    const planned = legalTargets(rules, item.change.phase)
      .map((to) => plannedTransition(rules, item.change.phase, to))
      .filter((p): p is PlannedTransition => p !== null)
    if (planned.length === 0) return undefined
    const backward = planned.filter((p) => p.backward)
    const forward = planned.filter((p) => !p.backward)
    return (
      <>
        {backward.map((p, i) => (
          <button
            key={p.event}
            type="button"
            className="btn btn--verm-ghost ibx-act"
            data-testid={i === 0 ? 'inbox-act-reject' : `inbox-act-backward-${p.event}`}
            disabled={busy}
            onClick={() => setPending({ name: item.change.name, root: item.root, planned: p })}
          >
            {backward.length === 1 ? t('inbox.act_reject') : t('inbox.act_backward', { to: p.to })}
          </button>
        ))}
        {forward.map((p, i) => (
          <button
            key={p.event}
            type="button"
            className="btn ibx-act"
            data-testid={i === 0 ? 'inbox-act-approve' : `inbox-act-forward-${p.event}`}
            disabled={busy}
            onClick={() => void apply(item.change.name, item.root, p)}
          >
            {forward.length === 1 ? t('inbox.act_approve') : t('inbox.act_forward', { to: p.to })}
          </button>
        ))}
      </>
    )
  }

  if (loading && !snapshot) {
    return <p className="view__note" data-testid="inbox-loading">{t('common.loading')}</p>
  }
  if (error && !snapshot) {
    return <p className="view__note view__note--error" data-testid="inbox-error">{error}</p>
  }

  if (items.length === 0) {
    return (
      <section className="view inbox" data-testid="inbox-view">
        <div className="empty" data-testid="inbox-empty">
          <div className="empty__mark" aria-hidden="true">◇</div>
          <h2 className="empty__title">{t('inbox.empty_title')}</h2>
          <p className="empty__desc">{t('inbox.empty_desc')}</p>
          {/* W2（P0 断点）：CTA 指可执行下一步——新工作去终端 pipeline init（可复制真命令），
              「去进度」降为次要动作（有在跑的任务时才有内容），不再单一「去进度」死循环。 */}
          <div className="empty__cli">
            <button
              type="button"
              className="ev__chip ev__chip--neutral"
              data-testid="inbox-empty-cli"
              onClick={() => copyEvidence(EMPTY_INIT_CMD)}
            >
              <Icon name="copy" size={11} />
              {EMPTY_INIT_CMD}
            </button>
          </div>
          <div className="empty__acts">
            {onNewChange && (
              <button type="button" className="btn" data-testid="inbox-empty-new" onClick={onNewChange}>
                ＋ {t('newchange.title')}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onOpenBoard}>{t('inbox.open_board')}</button>
          </div>
        </div>
      </section>
    )
  }

  // 选中行的详情面数据（badge 与行同源；rules/state/动作都按行自己的 root 取——聚合语境禁
  // currentRoot 哨兵，上轮 Task 9→11 教训）。
  const selRules = selectedItem ? rulesByKey.get(rulesKey(selectedItem.root, changeWorkflow(selectedItem.change))) : undefined
  const selState = selectedItem ? changeProgressState(selectedItem.change, selRules) : undefined
  const selSem = selectedItem && selState !== undefined
    ? rowSemantics(selectedItem.change, selState, selState === 'failed' ? [] : gateEvidence(selectedItem.change, selRules), t)
    : undefined

  return (
    <section className="view inbox" data-testid="inbox-view">
      <header className="view__head">
        <div>
          <h1 className="view__title">{t('inbox.title')}</h1>
          <p className="view__subtitle">{t('inbox.subtitle')}</p>
        </div>
        <span className="view__count" data-testid="inbox-count">{t('inbox.count', { n: items.length })}</span>
        {onNewChange && (
          <button type="button" className="btn" data-testid="new-change-open" onClick={onNewChange}>
            ＋ {t('newchange.title')}
          </button>
        )}
      </header>
      <div className="ibx-grid">
        <div className="ibx-main">
          <ul className="ibx-list" role="listbox" aria-label={t('inbox.list_label')} data-testid="inbox-list" ref={listRef}>
            {items.map((item, index) => {
              const { root, change } = item
              const wf = changeWorkflow(change)
              const rules = rulesByKey.get(rulesKey(root, wf))
              const state = changeProgressState(change, rules)
              const evidence = state === 'failed' ? [] : gateEvidence(change, rules)
              const sem = rowSemantics(change, state, evidence, t)
              const key = itemKey(item)
              const isSel = selectedItem !== undefined && itemKey(selectedItem) === key
              const rowClass = ['ibx-row', isSel && 'ibx-row--on', kbdFocus === index && 'kbd-focus']
                .filter(Boolean)
                .join(' ')
              const automation = fieldStr(change, 'automation')
              // W2：失败行叠加成因诊断——lastError 原文经 W3 diagnoseFailure 映射成短成因 +
              // 可复制修复命令（非失败态不算，省掉每行的空串正则）。
              const lastError = state === 'failed' ? fieldStr(change, 'automation_last_error') : ''
              const failDiag = state === 'failed' ? diagnoseFailure(lastError) : null
              return (
                <li
                  key={key}
                  className={rowClass}
                  data-testid="inbox-card"
                  role="option"
                  tabIndex={0}
                  aria-selected={isSel}
                  ref={(el) => {
                    rowRefs.current[index] = el
                  }}
                  onClick={() => {
                    setSelKey(key)
                    setOpen(true)
                    setKbdFocus(index)
                  }}
                  onFocus={() => setKbdFocus(index)}
                >
                  <div className="ibx-r1">
                    <span className="ibx-name">{change.name}</span>
                    {change.track && <span className="card__track">{change.track}</span>}
                    {wf !== 'default' && <span className="ibx-wf" data-testid="inbox-card-wf">{wf}</span>}
                    <span className="g-phase" data-testid="inbox-card-phase">{change.phase}</span>
                    {semBadge(sem)}
                    <span className="ibx-sp" />
                    <span className="ibx-time">
                      {rootToName.get(root) ?? root}
                      {change.updated_at ? ` · ${shortTime(change.updated_at)}` : ''}
                    </span>
                  </div>
                  <div className="ibx-lead" data-testid="inbox-lead">{sem.lead}</div>
                  {state === 'failed' && failDiag ? (
                    <div className="ibx-r2" onClick={(e) => e.stopPropagation()}>
                      <span className="ev__chip ev__chip--fail" data-testid="inbox-fail-chip">
                        automation={automation}
                      </span>
                      {/* W2：叠加 W3 diagnoseFailure 短成因 + 可复制修复命令——口径与 ProgressView
                          失败行（failure.short_*）/ TaskDetail 详情（同 helper）一致，收件箱不散落
                          第二套猜错逻辑（BF11 不漂移）。 */}
                      <span
                        className={`ibx-cause ibx-cause--${failDiag.cause}`}
                        data-testid="inbox-cause"
                        title={lastError || undefined}
                      >
                        {t(`failure.short_${failDiag.cause}`)}
                      </span>
                      {failDiag.fixCommand !== null && (
                        <button
                          type="button"
                          className="ev__chip ev__chip--neutral"
                          data-testid="inbox-fix-cmd"
                          onClick={() => copyEvidence(failDiag.fixCommand!)}
                        >
                          <Icon name="copy" size={11} />
                          {failDiag.fixCommand}
                        </button>
                      )}
                    </div>
                  ) : (
                    evidence.length > 0 && (
                      <div className="ibx-r2" onClick={(e) => e.stopPropagation()}>
                        {evidence.map((chip) => renderEvidenceChip(chip, copyEvidence, t))}
                      </div>
                    )
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <aside className="ibx-side">
          {selectedItem && selState !== undefined && selSem !== undefined ? (
            <TaskDetail
              root={selectedItem.root}
              change={selectedItem.change}
              rules={selRules}
              variant="timeline"
              badge={semBadge(selSem)}
              actions={detailActions(selectedItem, selState, selRules)}
              onClose={() => setOpen(false)}
              onToast={onToast}
            />
          ) : (
            <div className="card ibx-collapsed" data-testid="inbox-collapsed">
              <div className="ibx-collapsed-in">
                {t('inbox.collapsed_title')}
                <br />
                {t('inbox.collapsed_hint')}
              </div>
            </div>
          )}
        </aside>
      </div>

      {pending && (
        <Dialog
          title={t('board.confirm_backward_title')}
          onClose={closePending}
          testid="inbox-confirm"
          actions={
            <>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={closePending}>
                {t('board.confirm_no')}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                data-testid="inbox-confirm-yes"
                disabled={busy}
                onClick={() => void apply(pending.name, pending.root, pending.planned)}
              >
                {t('board.confirm_yes')}
              </button>
            </>
          }
        >
          <p className="dialog__desc">
            {t('board.confirm_backward_desc', {
              name: pending.name,
              from: pending.planned.from,
              to: pending.planned.to,
              event: pending.planned.event,
            })}
          </p>
        </Dialog>
      )}
    </section>
  )
}
