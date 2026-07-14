import { useEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import type { ChangeSnapshot } from '../types'
import { isPhase } from '../types'
import { plannedTransition, type PlannedTransition } from '../model/events'
import { changeProgressState, type ProgressRules, type ProgressState } from '../model/progressModel'
import { artifactChips, gateEvidence, stageArtifacts, VERIFY_STATUS_FIELDS, type EvidenceChip } from '../inbox/evidence'
import { decisionKind } from '../inbox/inbox'
import { getHistory, type ChangeHistoryEntry } from '../api/client'
import { diagnoseFailureWithCause } from './failureDiagnosis'
import { SessionResumeRow } from './SessionResumeRow'
import { shellQuote } from './shellQuote'
import { revealStages } from './motion'
import { Icon } from '../shell/Icon'
import { shortTime } from '../model/time'

gsap.registerPlugin(useGSAP)

/**
 * TaskDetail（T8 共享任务详情组件）—— 进度行内展开（T11 宿主）在用的一份详情面。
 * 阶段区：dtl- 垂直时间线，视觉基准 design-demos/v5-progress-workbench.html 收件箱右卡。
 *
 * 骨架（v8-C 意见④重排，视觉基准 design-demos/v8-trellis-encore.html #drawer）：头（名字/宿主
 * badge/关闭）→ **动作置顶条 .dt8-acts**（props 化不变：按钮由宿主传入，组件不绑任何业务端点——
 * 放行/打回/重试/放弃的端点调用、busy 守卫、二次确认全归宿主，见 T9/T11 与计划决议 #13；旁附
 * footLabel 语境 + 一句语义说明；原底部 .dt-foot JSX 撤下、styles 旧规则双保留）→ 任务一句话
 * （宿主传入，可无）→ 阶段区（直接消费 T7 stageArtifacts；节点/tab 语义 ✓绿 done /
 * ●蓝当前带 ring / ×红失败 / 无缀未开始；失败阶段=人话报错卡 .dt8-diag：cause 人话标题 + 处置
 * 指引 failure.hint_*，last_error 原文收 <details> 折叠，attempts/cause 走 mono 元信息行，
 * cancelled 琥珀 tone 非故障）→ **「自己上手修」连接命令卡 .dt8-conn-card**（失败/在跑态
 * 渲染，不要求现场字段——恢复会话行/重跑行恒在，automation_worktree/automation_sandbox 两行
 * 按字段渲染；零后端改动——两字段随快照 fields 整包
 * 透传，照 automation_cause 先例 fieldStr 直读）→「在终端继续」命令区（文案与第一条前进
 * transition 事件一致）→ history 区（T1 GET /api/change/:name/history，无记录显示「早期记录
 * 不可用」，决议 #10；**只留流程级事件** transition/init，set 与未知 kind 一律滤掉）。
 *
 * rules 缺失（自定义 workflow 定义拉取失败）或 change.phase 不在 rules.steps（workflow 字段
 * 与规则错位）→ 阶段区留白但卡不消失（G17 底线）：回落 artifactChips 产物正门只列非空路径
 * 字段；失败态下 last_error/attempts 照常渲染，不随阶段区一起静默丢失。
 */
export interface TaskDetailProps {
  root: string
  change: ChangeSnapshot
  rules: ProgressRules | undefined
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
  if (e.kind === 'import') return t('detail.hist_import')
  if (e.kind === 'set' && e.field) return t('detail.hist_set', { field: e.field })
  return e.raw ?? e.kind
}

export function TaskDetail({
  root,
  change,
  rules,
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
      revealStages('.dtl-it')
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
  // F-b：结构化失败成因（写入端结算现场落盘；空串=老数据/未落 → 诊断层回落 last_error regex）。
  const failCause = fieldStr(change, 'automation_cause')
  // v8-C 意见④：连接命令卡现场字段——automation_worktree/automation_sandbox 已随快照 fields
  // 整包透传（零后端改动），照 automation_cause 先例 fieldStr 直读；空串=无现场，对应行不渲染。
  const worktree = fieldStr(change, 'automation_worktree')
  const sandbox = fieldStr(change, 'automation_sandbox')
  // 拷贝命令的动态段一律过 shellQuote（codex 终稿 P2）：原先 `cd "${x}"` 双引号挡不住
  // `"`/反引号/$()，容器名完全未引；现安全字符原样、特殊字符 POSIX 单引号转义。
  const sandboxCmd = `docker exec -it ${shellQuote(sandbox)} bash`
  const worktreeCmd = `cd ${shellQuote(worktree)}`
  const rerunCmd = `pipeline afk run ${shellQuote(change.name)}`
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

  /** 当前/失败阶段的内容体（结论行 + 字段格栅 + 失败说明）——包进 dtl-box 高亮框
   *  （demo 对位：收件箱右卡 dtl-box）。 */
  function boxInner(chips: EvidenceChip[]): JSX.Element {
    if (state === 'failed') {
      const missing = chips.filter((c) => c.unset).map((c) => c.key)
      // v8-C 意见④人话报错卡（demo .diag 对位）：标题=人话结论 cause_*，正文=处置指引 hint_*；
      // last_error 原文不再当结论行平铺，收进 <details> 折叠（默认收起）；attempts/cause 作 mono
      // 元信息行。cancelled 走琥珀 tone（人为终止非故障，不该红成硬故障）。
      // F-b：结构化 automation_cause 直判优先，空串/未识别回落 last_error regex（老数据兼容）。
      const diag = diagnoseFailureWithCause(failCause, lastError)
      const fix = diag.fixCommand
      return (
        <>
          <div className={`dt8-diag${diag.cause === 'cancelled' ? ' dt8-diag--amb' : ''}`} data-testid="dt-diag">
            <div className="dt8-diag-t" data-testid="dt-diag-cause">
              {t(`failure.cause_${diag.cause}`)}
            </div>
            <p className="dt8-diag-hint" data-testid="dt8-diag-hint">
              {t(`failure.hint_${diag.cause}`)}
            </p>
            {fix !== null && (
              <div className="dt-diag-fix">
                <span className="dt-diag-fix-label">{t('failure.fix_label')}</span>
                <div className="dt-code">
                  <span className="p" aria-hidden="true">
                    $
                  </span>
                  <code data-testid="detail-fix-cmd">{fix}</code>
                  <button
                    type="button"
                    className="dt-code-copy"
                    data-copy={fix}
                    data-testid="detail-fix-copy"
                    aria-label={t('failure.fix_copy')}
                    onClick={() => copy(fix)}
                  >
                    <Icon name="copy" size={12} />
                  </button>
                </div>
              </div>
            )}
            {lastError !== '' && (
              <details className="dt8-rawfold" data-testid="dt8-rawfold">
                <summary>{t('detail.raw_error_summary')}</summary>
                <pre data-testid="dt8-raw-pre">{lastError}</pre>
              </details>
            )}
            <div className="dt8-diag-meta" data-testid="dt8-diag-meta">
              {attempts !== '' && (
                <span>
                  attempts <b>{attempts}</b>
                </span>
              )}
              <span>
                cause <b>{diag.cause}</b>
              </span>
            </div>
          </div>
          <div className="dt-arts">
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
    // 评审 P2-9：verdict() 只在非 failed 分支消费——failed 早退前不白算（原先置于函数头是死计算）。
    const v = verdict()
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

  /** 当前/失败行的高亮框（boxInner 外包一层 dtl-box）。 */
  function renderBox(chips: EvidenceChip[]): JSX.Element {
    return <div className={`dtl-box${state === 'failed' ? ' dtl-box--bad' : ''}`}>{boxInner(chips)}</div>
  }

  // v8-C 意见④：历史只留流程级事件（transition/init/import——import 与 init 同级里程碑，kernel
  // kind 值域含之，评审 P2-5 补上）——kind==='set' 字段级噪音与未知 kind 一律滤掉（demo .hist
  // 对位；区头 hint 注明口径）。data-settled 仍看 entries（拉取落定判据不变）。
  const flowEntries =
    entries === null ? null : entries.filter((e) => e.kind === 'transition' || e.kind === 'init' || e.kind === 'import')

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

      {/* v8-C 意见④：动作置顶条（demo .dw-acts 对位）——原底部 .dt-foot 的按钮与 footLabel 语境
          挪到头部，旁附一句语义说明；props 化纪律不变（按钮语义/端点全归宿主）。 */}
      {actions !== undefined && (
        <div className="dt8-acts" data-testid="dt8-acts">
          <div className="dt8-acts-btns">{actions}</div>
          <span className="dt8-acts-ctx" data-testid="dt-foot-label">
            {footLabel}
          </span>
          <span className="dt8-acts-note">{t('detail.acts_note')}</span>
        </div>
      )}

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
        {showStages && (
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

      {/* v8-C 意见④：「自己上手修」连接命令卡（demo .conn-card 对位）——失败/在跑态即渲染，
          不再要求 worktree/sandbox 现场字段（codex 终稿 P2：server 端 session-link 在
          worktree 空时回落 root 查会话，本机直跑失败的恢复路径原先在 UI 永远走不到）；
          恢复会话行与重跑行恒在，worktree/sandbox 行按各自字段空串与否渲染；
          automation!=='running' 时容器行加「（未在跑）」小注；卡底注来源字段说明。 */}
      {/* v9 追加：running 态（容器活着，恢复会话最有意义）与失败态同渲染本卡。 */}
      {(state === 'failed' || automation === 'running') && (
        <div className="dt-sec" data-testid="dt8-conn">
          <div className="dt-sec-h">
            {t('detail.selffix_title')} <span className="dt-hint">{t('detail.selffix_desc')}</span>
          </div>
          <div className="dt8-conn-card">
            <div className="dt8-conn-rows">
              {/* v9-I：恢复会话行（自取数，loading 静默 / 查不到一行灰字）——失败+取消
                  （conflict/cause=cancelled 同落 failed 态）与 running 态随本卡覆盖；
                  worktree 空时 server 端回落 root 查会话，故本行不依赖现场字段恒挂载。 */}
              <SessionResumeRow root={root} name={change.name} onCopy={copy} />
              {worktree !== '' && (
                <div className="dt8-conn-row" data-testid="dt8-conn-worktree">
                  <span className="dt8-conn-k">{t('detail.conn_worktree')}</span>
                  <span className="dt8-conn-v">{worktreeCmd}</span>
                  <button
                    type="button"
                    className="dt-code-copy"
                    data-copy={worktreeCmd}
                    data-testid="dt8-conn-worktree-copy"
                    aria-label={t('detail.copy_cmd')}
                    onClick={() => copy(worktreeCmd)}
                  >
                    <Icon name="copy" size={12} />
                  </button>
                </div>
              )}
              {sandbox !== '' && (
                <div className="dt8-conn-row" data-testid="dt8-conn-sandbox">
                  <span className="dt8-conn-k">{t('detail.conn_sandbox')}</span>
                  <span className="dt8-conn-v">{sandboxCmd}</span>
                  {automation !== 'running' && <span className="dt8-conn-note">{t('detail.conn_not_running')}</span>}
                  <button
                    type="button"
                    className="dt-code-copy"
                    data-copy={sandboxCmd}
                    data-testid="dt8-conn-sandbox-copy"
                    aria-label={t('detail.copy_cmd')}
                    onClick={() => copy(sandboxCmd)}
                  >
                    <Icon name="copy" size={12} />
                  </button>
                </div>
              )}
              <div className="dt8-conn-row" data-testid="dt8-conn-rerun">
                <span className="dt8-conn-k">{t('detail.conn_rerun')}</span>
                <span className="dt8-conn-v">{rerunCmd}</span>
                <button
                  type="button"
                  className="dt-code-copy"
                  data-copy={rerunCmd}
                  data-testid="dt8-conn-rerun-copy"
                  aria-label={t('detail.copy_cmd')}
                  onClick={() => copy(rerunCmd)}
                >
                  <Icon name="copy" size={12} />
                </button>
              </div>
            </div>
            <p className="dt8-conn-src">{t('detail.conn_src')}</p>
          </div>
        </div>
      )}

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
        <div className="dt-sec-h">
          {t('detail.history_heading')} <span className="dt-hint">{t('detail.hist_flow_hint')}</span>
        </div>
        {flowEntries !== null &&
          (flowEntries.length === 0 ? (
            <p className="dt-none">{t('detail.history_empty')}</p>
          ) : (
            <ol className="dt-hist" data-testid="dt-hist">
              {flowEntries.map((e, i) => (
                <li className="dt-hist-it" data-testid={`dt-hist-${i}`} key={`${e.ts}-${i}`}>
                  <span className="dt-hist-ts">{shortTime(e.ts)}</span>
                  <span className="dt-hist-txt">{histText(e, t)}</span>
                </li>
              ))}
            </ol>
          ))}
      </div>

    </section>
  )
}
