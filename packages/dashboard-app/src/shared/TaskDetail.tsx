import { useEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import type { ChangeSnapshot } from '../types'
import { isPhase } from '../types'
import { plannedTransition, type PlannedTransition } from '../board/events'
import { changeProgressState, type ProgressRules, type ProgressState } from '../model/progressModel'
import { artifactChips, gateEvidence, stageArtifacts, VERIFY_STATUS_FIELDS, type EvidenceChip } from '../inbox/evidence'
import { decisionKind } from '../inbox/inbox'
import { getHistory, type ChangeHistoryEntry } from '../api/client'
import { revealStages } from '../workflow/motion'
import { Icon } from '../shell/Icon'
import { shortTime } from '../model/time'

gsap.registerPlugin(useGSAP)

/**
 * TaskDetail（T8 共享任务详情组件）—— 收件箱右卡（T9）与进度行内展开（T11）共用的一份详情面。
 * 阶段区双形态（计划 T8 原文；demo v5 六轮定稿 3fdb36c 两处都在）：
 *   · 形态 A（variant='timeline'，缺省）：dtl- 垂直时间线，收件箱右栏（T9 宿主），视觉基准
 *     design-demos/v5-progress-workbench.html 收件箱右卡；
 *   · 形态 B（variant='tabs'）：dt-tabs 阶段 sheet（role=tablist + dt-pane），进度行内展开
 *     （T11 宿主复用），视觉基准同 demo 进度视图 prg-detail 内 dt-tabs（L924 起）。
 *
 * 骨架：头（名字/宿主 badge/关闭）→ 任务一句话（宿主传入，可无）→ 阶段区（两形态同源消费 T7
 * stageArtifacts；节点/tab 语义 ✓绿 done / ●蓝当前带 ring / ×红失败 / 无缀未开始；当前/失败
 * 阶段展示结论或 last_error）→「在终端继续」命令区（文案与第一条前进 transition 事件一致）→
 * history 区（T1 GET /api/change/:name/history，无记录显示「早期记录不可用」，决议 #10）→
 * 动作条（**props 化**：按钮由宿主传入，组件不绑任何业务端点——放行/打回/重试/放弃的端点调用、
 * busy 守卫、二次确认全归宿主，见 T9/T11 与计划决议 #13）。
 *
 * rules 缺失（自定义 workflow 定义拉取失败）或 change.phase 不在 rules.steps（workflow 字段
 * 与规则错位）→ 阶段区留白但卡不消失（G17 底线）：回落 artifactChips 产物正门只列非空路径
 * 字段；失败态下 last_error/attempts 照常渲染，不随阶段区一起静默丢失。
 */
export interface TaskDetailProps {
  root: string
  change: ChangeSnapshot
  rules: ProgressRules | undefined
  /** 阶段区形态：'timeline'（形态 A，缺省，收件箱右栏）| 'tabs'（形态 B，进度行内展开）。 */
  variant?: 'timeline' | 'tabs'
  /** 任务需求一句话（宿主传入；快照 fields 无此数据面，缺省整节不渲染）。 */
  requirement?: string
  /** 头部语义徽章（✓可以放行 / 失败 ×N…语义判定归宿主，组件零业务）。 */
  badge?: ReactNode
  /** 动作条按钮（props 化）；未传则不渲染动作条。 */
  actions?: ReactNode
  /** 当前/失败阶段内容体尾部的宿主扩展区（T11 进度宿主的运行日志尾部；纯布局插槽，
   *  同 actions 的 props 化纪律——组件不感知内容语义，零业务）。 */
  curStageExtra?: ReactNode
  onClose?: () => void
  onToast?: (msg: string) => void
}

type StageStatus = 'done' | 'cur' | 'fail' | 'todo'

/** 老内核 cmd_get 口径：字面 'null' 或空串算未设（同 evidence.ts 私有 isUnset，只读展示不导出）。 */
function fieldStr(c: ChangeSnapshot, key: string): string {
  const v = c.fields[key]
  return typeof v === 'string' ? v : ''
}

/** 行内产物 chip：实值可拷贝（data-copy=值）；三轨判定字段展示 key=value；未设走占位 chip。 */
function StageChip({ chip, onCopy }: { chip: EvidenceChip; onCopy: (v: string) => void }): JSX.Element {
  const { t } = useT()
  if (chip.unset) {
    return (
      <span className="dtl-chip--empty" data-testid={`dtl-chip-empty-${chip.key}`}>
        {chip.key} · {t('evidence.unset')}
      </span>
    )
  }
  if (!chip.copyable) {
    return (
      <span className="dtl-chip dtl-chip--ro" data-testid={`dtl-chip-${chip.key}`}>
        {chip.key}={chip.value}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="dtl-chip"
      data-copy={chip.value}
      data-testid={`dtl-chip-${chip.key}`}
      title={t('detail.copy_field', { field: chip.key })}
      onClick={() => onCopy(chip.value)}
    >
      <span className="cp" aria-hidden="true">
        ⧉
      </span>
      {chip.value}
    </button>
  )
}

/** 高亮框内字段格：pass/fail 语义色、未设 miss 占位、路径值可点拷贝。 */
function BoxField({ chip, onCopy }: { chip: EvidenceChip; onCopy: (v: string) => void }): JSX.Element {
  const { t } = useT()
  const tone = chip.unset ? 'miss' : chip.tone === 'pass' ? 'pass' : chip.tone === 'fail' ? 'fail' : ''
  return (
    <div className={`dt-field${tone ? ` dt-field--${tone}` : ''}`} data-testid={`dt-field-${chip.key}`}>
      <div className="dt-fk" title={chip.key}>
        {chip.key}
      </div>
      {chip.copyable && !chip.unset ? (
        <button
          type="button"
          className="dt-fv dt-fv--copy"
          data-copy={chip.value}
          title={t('detail.copy_field', { field: chip.key })}
          onClick={() => onCopy(chip.value)}
        >
          {chip.value} <span aria-hidden="true">⧉</span>
        </button>
      ) : (
        <div className="dt-fv">{chip.unset ? t('evidence.unset') : chip.value}</div>
      )}
    </div>
  )
}

/** history 单条 → 人读文案：transition 走 from → to · raw(=event 名) 不变式，其余按 kind 兜底。 */
function histText(e: ChangeHistoryEntry, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (e.kind === 'transition' && e.from && e.to) return `${e.from} → ${e.to}${e.raw ? ` · ${e.raw}` : ''}`
  if (e.kind === 'init') return t('detail.hist_init')
  if (e.kind === 'set' && e.field) return t('detail.hist_set', { field: e.field })
  return e.raw ?? e.kind
}

export function TaskDetail({
  root,
  change,
  rules,
  variant = 'timeline',
  requirement,
  badge,
  actions,
  curStageExtra,
  onClose,
  onToast,
}: TaskDetailProps): JSX.Element {
  const { t } = useT()
  const scopeRef = useRef<HTMLElement>(null)
  const [entries, setEntries] = useState<ChangeHistoryEntry[] | null>(null)
  // 形态 B 手动选中的 tab（null=跟随当前阶段）；切 change/阶段推进时重置，防残留上一张卡的选择。
  const [tabSel, setTabSel] = useState<string | null>(null)

  useEffect(() => {
    setTabSel(null)
  }, [change.name, change.phase])

  // ── history 端点接入（T1）：切 change/root/阶段重取（评审登记项：同一 change 经动作条转换后
  //    SSE 快照更新 phase，历史区要跟着刷新，不等宿主重挂载——T9/T11 接宿主的前置）；
  //    失败降级为空（＝「早期记录不可用」），卡不崩。──
  useEffect(() => {
    let cancelled = false
    setEntries(null)
    getHistory(change.name, root)
      .then((es) => {
        if (!cancelled) setEntries(es)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [change.name, change.phase, root])

  // ── 阶段区入场 stagger：只在切换 change 时重播（依赖收敛纪律，同 WorkbenchView stepper 入场）。──
  useGSAP(
    () => {
      revealStages(variant === 'tabs' ? '.dt-tab' : '.dtl-it')
    },
    { scope: scopeRef, dependencies: [change.name] },
  )

  function copy(value: string): void {
    void navigator.clipboard?.writeText(value).then(() => {
      onToast?.(t('detail.copied', { value }))
    })
  }

  const state: ProgressState = changeProgressState(change, rules)
  const stages = stageArtifacts(rules, change)
  const curIdx = rules ? rules.steps.indexOf(change.phase) : -1
  // workflow 字段与规则错位（rules 存在但 change.phase 不在 steps）：全 todo 的时间线/tab 条是
  // 假信息且会吞掉失败信息（评审 nit）——判给 G17 兜底分支，同 rules 缺失一并处理。
  const misaligned = rules !== undefined && curIdx === -1
  const showStages = stages.length > 0 && !misaligned
  // 形态 B 生效中的 tab：手动选择优先，否则跟随当前阶段（showStages 保证 change.phase ∈ steps）。
  const activeTab = tabSel ?? change.phase

  function statusOf(i: number): StageStatus {
    if (i < curIdx) return 'done'
    if (i > curIdx) return 'todo'
    return state === 'failed' ? 'fail' : 'cur'
  }

  // 第一条前进边（命令区 + 动作条左标签的数据源；宿主的动作按钮自带各自的 event，不经这里）。
  const firstForward: PlannedTransition | null = rules
    ? ((rules.transitions[change.phase] ?? [])
        .map((e) => plannedTransition(rules, change.phase, e.to))
        .find((p): p is PlannedTransition => p !== null && !p.backward) ?? null)
    : null
  const cmd = state !== 'failed' && firstForward ? `pipeline transition ${change.name} ${firstForward.event}` : null

  const automation = fieldStr(change, 'automation')
  const attempts = fieldStr(change, 'automation_attempts')
  const lastError = fieldStr(change, 'automation_last_error')
  const footLabel =
    state === 'failed' ? `automation · ${automation}` : firstForward ? `${change.phase} → ${firstForward.to}` : change.phase

  /** 当前行结论（demo dt-verdict）：gate 阶段沿 ChangeDetailCard whyText 判据迁移
   *  （verify 用 VERIFY_STATUS_FIELDS 白名单圈未过项——产物没产出不等于验证没过，Important-1），
   *  其余按五态给一句人话。 */
  function verdict(): { text: string; bad: boolean; glyph: string } {
    if (state === 'failed') return { text: lastError || t('detail.fail_generic'), bad: true, glyph: '×' }
    if (state === 'running') return { text: t('detail.verdict_running'), bad: false, glyph: '●' }
    if (state === 'queued') return { text: t('detail.verdict_queued'), bad: false, glyph: '○' }
    if (state === 'agent') return { text: t('detail.verdict_agent'), bad: false, glyph: '○' }
    // gate：能拍板
    const kind = decisionKind(change)
    if (kind === 'verify' && rules) {
      const failed = gateEvidence(change, rules).filter(
        (c) => (VERIFY_STATUS_FIELDS as readonly string[]).includes(c.key) && c.tone !== 'pass',
      )
      return failed.length === 0
        ? { text: t('detail.why_gate_allpass'), bad: false, glyph: '✓' }
        : { text: t('detail.why_gate', { names: failed.map((c) => c.key.replace(/_result$/, '')).join('、') }), bad: false, glyph: '○' }
    }
    return { text: t(`inbox.awaiting.${kind}`), bad: false, glyph: '○' }
  }

  function stageLabel(id: string): string {
    return isPhase(id) ? t(`phases.${id}`) : id
  }

  /** 当前/失败阶段的内容体（结论行 + 字段格栅 + 失败说明）——形态 A 包进 dtl-box 高亮框，
   *  形态 B 直接铺在 dt-pane 里（demo 两处对位：收件箱右卡 dtl-box / 进度 dt-pane）。 */
  function boxInner(chips: EvidenceChip[]): JSX.Element {
    const v = verdict()
    if (state === 'failed') {
      const missing = chips.filter((c) => c.unset).map((c) => c.key)
      return (
        <>
          <div className="dt-verdict dt-verdict--bad">
            <span className="ic" aria-hidden="true">
              ×
            </span>
            {v.text}
          </div>
          <div className="dt-arts">
            {lastError !== '' && (
              <div className="dt-field dt-field--wide" data-testid="dt-field-last_error">
                <div className="dt-fk">last_error</div>
                <div className="dt-fv dtl-err">{lastError}</div>
              </div>
            )}
            {attempts !== '' && (
              <div className="dt-field" data-testid="dt-field-attempts">
                <div className="dt-fk">attempts</div>
                <div className="dt-fv">{attempts}</div>
              </div>
            )}
            {chips
              .filter((c) => !c.unset)
              .map((c) => (
                <BoxField key={c.key} chip={c} onCopy={copy} />
              ))}
            {missing.length > 0 && (
              <div className="dt-field dt-field--miss" data-testid="dt-field-missing">
                <div className="dt-fk">{missing.join(' · ')}</div>
                <div className="dt-fv">{t('evidence.unset')}</div>
              </div>
            )}
          </div>
          <p className="dt-note">{t('detail.fail_note')}</p>
        </>
      )
    }
    return (
      <>
        <div className={`dt-verdict${v.bad ? ' dt-verdict--bad' : ''}`}>
          <span className={`ic${v.glyph === '✓' ? ' ic--good' : ''}`} aria-hidden="true">
            {v.glyph}
          </span>
          {v.text}
        </div>
        {chips.length > 0 ? (
          <div className="dt-arts">
            {chips.map((c) => (
              <BoxField key={c.key} chip={c} onCopy={copy} />
            ))}
          </div>
        ) : (
          <div className="dt-none">{t('detail.stage_no_outputs')}</div>
        )}
      </>
    )
  }

  /** 形态 A 当前/失败行的高亮框（boxInner 外包一层 dtl-box）。 */
  function renderBox(chips: EvidenceChip[]): JSX.Element {
    return <div className={`dtl-box${state === 'failed' ? ' dtl-box--bad' : ''}`}>{boxInner(chips)}</div>
  }

  return (
    <section className="card dt" data-testid="task-detail" ref={scopeRef}>
      <header className="dt-head">
        <span className="dt-name">{change.name}</span>
        {badge}
        <span className="dt-sp" />
        {onClose && (
          <button
            type="button"
            className="dt-close btn--icon"
            data-testid="detail-close"
            aria-label={t('detail.close')}
            onClick={onClose}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </header>

      {requirement !== undefined && requirement !== '' && (
        <div className="dt-sec">
          <div className="dt-sec-h">{t('detail.req_heading')}</div>
          <p className="dt-req">{requirement}</p>
        </div>
      )}

      <div className="dt-sec">
        <div className="dt-sec-h">
          {t('detail.stages_heading')} <span className="dt-hint">{t('detail.stages_hint')}</span>
        </div>
        {showStages && variant === 'tabs' && (
          // 形态 B：dt-tabs 阶段 sheet（demo 进度视图对位）——tab 条 + 单 pane 展示，默认跟随当前阶段。
          <div className="dt-stages">
            <div className="dt-tabs" role="tablist" aria-label={t('detail.stages_label', { name: change.name, n: stages.length })}>
              {stages.map((st, i) => {
                const status = statusOf(i)
                const on = st.step === activeTab
                return (
                  <button
                    type="button"
                    role="tab"
                    key={st.step}
                    id={`dt-tab-${st.step}`}
                    aria-selected={on}
                    aria-controls={`dt-pane-${st.step}`}
                    className={`dt-tab${status !== 'todo' ? ` dt-tab--${status}` : ''}${on ? ' on' : ''}`}
                    data-testid={`dt-tab-${st.step}`}
                    onClick={() => setTabSel(st.step)}
                  >
                    {status !== 'todo' && (
                      <span className="tfx" aria-hidden="true">
                        {status === 'done' ? '✓' : status === 'fail' ? '×' : '●'}
                      </span>
                    )}
                    {stageLabel(st.step)}
                  </button>
                )
              })}
            </div>
            {stages.map((st, i) => {
              const status = statusOf(i)
              return (
                <div
                  className="dt-pane"
                  role="tabpanel"
                  key={st.step}
                  id={`dt-pane-${st.step}`}
                  aria-labelledby={`dt-tab-${st.step}`}
                  data-testid={`dt-pane-${st.step}`}
                  hidden={st.step !== activeTab}
                >
                  {status === 'todo' && <div className="dt-empty">{t('detail.not_started')}</div>}
                  {status === 'done' &&
                    (st.chips.length > 0 ? (
                      <div className="dt-arts">
                        {st.chips.map((c) => (
                          <BoxField key={c.key} chip={c} onCopy={copy} />
                        ))}
                      </div>
                    ) : (
                      <div className="dt-none">{t('detail.stage_no_outputs')}</div>
                    ))}
                  {(status === 'cur' || status === 'fail') && (
                    <>
                      {boxInner(st.chips)}
                      {curStageExtra}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {showStages && variant === 'timeline' && (
          <div className="dtl" role="list" aria-label={t('detail.stages_label', { name: change.name, n: stages.length })}>
            {stages.map((st, i) => {
              const status = statusOf(i)
              return (
                <div className={`dtl-it dtl-it--${status}`} role="listitem" data-testid={`dtl-${st.step}`} key={st.step}>
                  <span className={`dtl-node dtl-node--${status}`} aria-hidden="true">
                    {status === 'done' ? '✓' : status === 'fail' ? '×' : ''}
                  </span>
                  <div className="dtl-r">
                    <span className="dtl-name">{stageLabel(st.step)}</span>
                    {status === 'todo' && <span className="dtl-dim">{t('detail.not_started')}</span>}
                    {status === 'done' &&
                      (st.chips.length > 0 ? (
                        st.chips.map((c) => <StageChip key={c.key} chip={c} onCopy={copy} />)
                      ) : (
                        <span className="dtl-dim">{t('detail.no_outputs')}</span>
                      ))}
                    {status === 'fail' && attempts !== '' && (
                      <span className="dtl-dim">{t('detail.fail_stopped_here', { n: attempts })}</span>
                    )}
                  </div>
                  {(status === 'cur' || status === 'fail') && (
                    <>
                      {renderBox(st.chips)}
                      {curStageExtra}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {!showStages && (
          // rules 缺失或 phase 与规则错位：阶段区留白但卡不消失（G17 底线）——回落产物正门，
          // 只列非空路径字段；失败态下失败框照渲染（last_error/attempts 不随阶段区静默丢失）。
          <div className="dtl-fallback">
            <p className="dt-none">{t('detail.stages_unknown')}</p>
            {state === 'failed' && renderBox([])}
            {curStageExtra}
            <div className="dtl-r">
              {artifactChips(change).map((c) => (
                <StageChip key={c.key} chip={c} onCopy={copy} />
              ))}
            </div>
          </div>
        )}
      </div>

      {cmd && (
        <div className="dt-sec">
          <div className="dt-sec-h">{t('detail.terminal_heading')}</div>
          <div className="dt-code">
            <span className="p" aria-hidden="true">
              $
            </span>
            <code data-testid="detail-cmd">{cmd}</code>
            <button
              type="button"
              className="dt-code-copy"
              data-copy={cmd}
              data-testid="detail-cmd-copy"
              aria-label={t('detail.copy_cmd')}
              onClick={() => copy(cmd)}
            >
              <Icon name="copy" size={12} />
            </button>
          </div>
          <p className="dt-note">{t('detail.terminal_note')}</p>
        </div>
      )}

      {/* data-settled：history 拉取是否已落定（测试用来等异步 setState 收敛，避免 act 警告）。 */}
      <div className="dt-sec" data-testid="dt-hist-sec" data-settled={entries !== null ? 'true' : 'false'}>
        <div className="dt-sec-h">{t('detail.history_heading')}</div>
        {entries !== null &&
          (entries.length === 0 ? (
            <p className="dt-none">{t('detail.history_empty')}</p>
          ) : (
            <ol className="dt-hist" data-testid="dt-hist">
              {entries.map((e, i) => (
                <li className="dt-hist-it" data-testid={`dt-hist-${i}`} key={`${e.ts}-${i}`}>
                  <span className="dt-hist-ts">{shortTime(e.ts)}</span>
                  <span className="dt-hist-txt">{histText(e, t)}</span>
                </li>
              ))}
            </ol>
          ))}
      </div>

      {actions !== undefined && (
        <div className="dt-foot">
          <span className="dt-foot-l" data-testid="dt-foot-label">
            {footLabel}
          </span>
          <div className="dt-foot-btns">{actions}</div>
        </div>
      )}
    </section>
  )
}
