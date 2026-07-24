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
import { SessionResumeRow, connKeyCls, connNoteCls, connRowCls, connValCls, copyBtnCls } from './SessionResumeRow'
import { shellQuote } from './shellQuote'
import { revealStages } from './motion'
import { Icon } from '../shell/Icon'
import { shortTime } from '../model/time'
import { RunAuditPanel } from './RunAuditPanel'
import { outputPresentation, outputValuePresentation } from './outputPresentation'

gsap.registerPlugin(useGSAP)

/**
 * TaskDetail（T8 共享任务详情组件）—— 进度行内展开（T11 宿主）在用的一份详情面。
 * 阶段区：垂直阶段时间线，视觉基准 design-demos/v5-progress-workbench.html 收件箱右卡。
 *
 * 骨架（v8-C 意见④重排，视觉基准 design-demos/v8-trellis-encore.html #drawer）：头（名字/宿主
 * badge/关闭）→ **动作置顶条**（props 化不变：按钮由宿主传入，组件不绑任何业务端点——
 * 放行/打回/重试/放弃的端点调用、busy 守卫、二次确认全归宿主，见 T9/T11 与计划决议 #13；旁附
 * footLabel 语境 + 一句语义说明）→ 任务一句话（宿主传入，可无）→ 阶段区（直接消费 T7
 * stageArtifacts；节点/行语义 ✓绿 done / ●蓝当前带 ring / ×红失败 / 无缀未开始，状态由行上
 * data-state 承载；失败阶段=人话报错卡 dt-diag：cause 人话标题 + 处置指引 failure.hint_*，
 * last_error 原文收 <details> 折叠，attempts/cause 走 mono 元信息行，cancelled 琥珀 tone
 * （data-tone=amb）非故障）→ **「自己上手修」连接命令卡 dt8-conn**（失败/在跑态渲染，不要求
 * 现场字段——恢复会话行/重跑行恒在，automation_worktree/automation_sandbox 两行按字段渲染；
 * 零后端改动——两字段随快照 fields 整包透传，照 automation_cause 先例 fieldStr 直读）→
 * 「在终端继续」命令区（文案与第一条前进 transition 事件一致）→ history 区（T1
 * GET /api/change/:name/history，无记录显示「早期记录不可用」，决议 #10；**只留流程级事件**
 * transition/init/import，set 与未知 kind 一律滤掉）。
 *
 * v10b 迁移：样式全部 tailwind 原子类（颜色只走 token 语义类），状态一律 data-state/data-tone
 * 承载；GSAP 入场锚点从类名换成 data-anim="stage"。根节点不再自带卡皮（.card 退役）——唯一
 * 宿主进度抽屉本就用 `.prg9-dw-body > .card.dt` 剥掉边框/阴影/内边距，直渲染即现状观感，
 * 卡面（bg-card）由抽屉面板提供。
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
  /** 默认详情只展示用户可决策信息；技术审计与流程历史折叠到按需展开区。 */
  collapseTechnical?: boolean
  onClose?: () => void
  onToast?: (msg: string) => void
}

type StageStatus = 'done' | 'cur' | 'fail' | 'todo'

/* ── tailwind 类串（旧 dt-/dtl-/dt8- 规则一比一对位；状态类改由 data-state/data-tone 驱动） ── */
/** 区块（旧 .dt-sec）：最后一块无底线。 */
const secCls = 'border-b border-border py-[13px] last:border-b-0'
/** 区头（旧 .dt-sec-h）+ 头旁小字 hint（旧 .dt-hint）。 */
const secHeadCls = 'mb-2.5 flex items-baseline gap-[7px] text-[12.5px] font-bold text-text'
const hintCls = 'text-xs font-normal text-text-3'
/** 灰字空态/注释（旧 .dt-none / .dt-note）。 */
const noneCls = 'm-0 text-xs text-text-3'
const noteCls = 'mt-2 mb-0 text-xs leading-[1.55] text-text-3'
/** 命令块（旧 .dt-code 及其 $ 提示符）。 */
const codeRowCls = 'flex items-center gap-2 rounded-md border border-code-border bg-code-bg px-[11px] py-2 font-mono text-xs'
const codePromptCls = 'text-text-3'
const codeCls = 'min-w-0 flex-1 text-text [overflow-wrap:anywhere]'
/** 产物 chip 行（旧 .dtl-r）。 */
const chipRowCls = 'flex min-h-[22px] flex-wrap items-center gap-1.5'
/** 字段格栅（旧 .dt-arts）。 */
const artsCls = 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5'

/** 时间线节点四态（旧 .dtl-node--*）。 */
const nodeBaseCls = 'absolute left-0 top-0.5 grid size-4 place-items-center rounded-full font-bold leading-none'
const nodeToneCls: Record<StageStatus, string> = {
  done: 'bg-green text-[11px] text-btn-fg',
  cur: 'bg-btn-bg text-[11px] shadow-[0_0_0_3px_var(--ring)]',
  fail: 'bg-red text-[10px] text-btn-fg',
  todo: 'border-2 border-border-2 bg-card text-[11px]',
}
/** 阶段名四态（旧 .dtl-name 及状态修饰）。 */
const stageNameCls: Record<StageStatus, string> = {
  done: 'font-medium text-text',
  cur: 'font-semibold text-text',
  fail: 'font-semibold text-red-d',
  todo: 'font-normal text-text-3',
}

/** 老内核 cmd_get 口径：字面 'null' 或空串算未设（同 evidence.ts 私有 isUnset，只读展示不导出）。 */
function fieldStr(c: ChangeSnapshot, key: string): string {
  const v = c.fields[key]
  return typeof v === 'string' ? v : ''
}

/** 行内产物 chip：实值可拷贝（data-copy=值）；三轨判定字段展示 key=value；未设走占位 chip。 */
function StageChip({ chip, onCopy }: { chip: EvidenceChip; onCopy: (v: string) => void }): JSX.Element {
  const { t } = useT()
  const presentation = outputPresentation(chip.key)
  if (chip.unset) {
    return (
      <span
        className="inline-flex h-[22px] items-center rounded-[7px] border border-dashed border-border-2 bg-transparent px-[7px] font-mono text-[11.5px] text-text-3"
        data-testid={`dtl-chip-empty-${chip.key}`}
      >
        <span title={presentation.title}>{presentation.label}</span> · {t('evidence.unset')}
      </span>
    )
  }
  if (!chip.copyable) {
    return (
      <span
        className="inline-flex h-[22px] items-center gap-1 rounded-[7px] border border-border bg-fill px-[7px] font-mono text-[11.5px] text-text-2"
        data-testid={`dtl-chip-${chip.key}`}
      >
        <span title={presentation.title}>{presentation.label}</span>：{outputValuePresentation(chip.value)}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="inline-flex h-[22px] cursor-pointer items-center gap-1 rounded-[7px] border border-border bg-fill px-[7px] font-mono text-[11.5px] text-text-2 transition-colors hover:border-border-2 hover:bg-fill-2 hover:text-text"
      data-copy={chip.value}
      data-testid={`dtl-chip-${chip.key}`}
      title={t('detail.copy_field', { field: chip.key })}
      onClick={() => onCopy(chip.value)}
    >
      <span className="text-text-3" aria-hidden="true"><Icon name="copy" size={11} /></span>
      {chip.value}
    </button>
  )
}

/** 高亮框内字段格：pass/fail 语义色、未设 miss 占位、路径值可点拷贝（状态挂 data-state）。 */
function BoxField({ chip, onCopy }: { chip: EvidenceChip; onCopy: (v: string) => void }): JSX.Element {
  const { t } = useT()
  const presentation = outputPresentation(chip.key)
  const tone = chip.unset ? 'miss' : chip.tone === 'pass' ? 'pass' : chip.tone === 'fail' ? 'fail' : 'plain'
  const valToneCls =
    tone === 'pass' ? 'font-bold text-green-d' : tone === 'fail' ? 'font-bold text-red-d' : tone === 'miss' ? 'text-text-3' : 'text-text'
  return (
    <div
      className={`min-w-0 rounded-[7px] border border-border px-2 py-[5px] ${tone === 'miss' ? 'border-dashed bg-transparent' : 'bg-card'}`}
      data-state={tone}
      data-testid={`dt-field-${chip.key}`}
    >
      <div className="text-[11px] font-semibold text-text-2 [overflow-wrap:anywhere]" title={`${presentation.title}（字段：${chip.key}）`}>
        {presentation.label}
      </div>
      {chip.copyable && !chip.unset ? (
        <button
          type="button"
          className={`inline cursor-pointer border-0 bg-transparent p-0 text-left font-mono text-xs transition-colors [overflow-wrap:anywhere] hover:text-accent-d ${valToneCls}`}
          data-copy={chip.value}
          title={t('detail.copy_field', { field: chip.key })}
          onClick={() => onCopy(chip.value)}
        >
          {chip.value} <span className="inline-block align-[-2px]" aria-hidden="true"><Icon name="copy" size={11} /></span>
        </button>
      ) : (
        <div className={`text-xs [overflow-wrap:anywhere] ${valToneCls}`}>{chip.unset ? t('evidence.unset') : outputValuePresentation(chip.value)}</div>
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
  collapseTechnical = false,
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

  // ── 阶段区入场 stagger：只在切换 change 时重播（依赖收敛纪律，同 WorkbenchView stepper 入场）。
  //    锚点 data-anim="stage"（v10b：GSAP 选择器不再吃视觉类名）。──
  useGSAP(
    () => {
      revealStages('[data-anim="stage"]')
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
  // `todo` is server-projected from the active Change's OpenSpec tasks.md. Keep the existing stage
  // timeline as the workflow/artefact view, then attach only real checkbox rows to their phase rather
  // than deriving a second generic list from the raw user prompt.
  const todoByStage = new Map((change.todo?.stages ?? []).map((stage) => [stage.id, stage]))
  const curIdx = rules ? rules.steps.indexOf(change.phase) : -1
  // workflow 字段与规则错位（rules 存在但 change.phase 不在 steps）：全 todo 的时间线/tab 条是
  // 假信息且会吞掉失败信息（评审 nit）——判给 G17 兜底分支，同 rules 缺失一并处理。
  const misaligned = rules !== undefined && curIdx === -1
  const showStages = stages.length > 0 && !misaligned

  function statusOf(i: number): StageStatus {
    // StageArtifacts intentionally names the workflow coordinate `step`; use that same canonical
    // id to join the server-projected OpenSpec task rows.  Reading a non-existent `id` silently
    // orphaned every real Todo row from its phase.
    const projected = todoByStage.get(stages[i]?.step ?? '')?.status
    if (projected === 'done') return 'done'
    if (projected === 'pending') return 'todo'
    if (projected === 'current') return state === 'failed' ? 'fail' : 'cur'
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
  // #6（2026-07-15 调查）：afk run 忽略 name、跑整轮就绪队列；按名重跑该 change 的正确命令是
  // afk enqueue（重新入队该 change）。三处 cmdChip（ProgressView/AfkView/此处）口径统一为 enqueue。
  const rerunCmd = `pipeline afk enqueue ${shellQuote(change.name)}`
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

  /** 当前/失败阶段的内容体（结论行 + 字段格栅 + 失败说明）——包进高亮框
   *  （demo 对位：收件箱右卡 dtl-box）。 */
  function boxInner(chips: EvidenceChip[]): JSX.Element {
    if (state === 'failed') {
      const missing = chips.filter((c) => c.unset).map((c) => c.key)
      // v8-C 意见④人话报错卡（demo .diag 对位）：标题=人话结论 cause_*，正文=处置指引 hint_*；
      // last_error 原文不再当结论行平铺，收进 <details> 折叠（默认收起）；attempts/cause 作 mono
      // 元信息行。cancelled 走琥珀 tone（人为终止非故障，不该红成硬故障）→ data-tone=amb。
      // F-b：结构化 automation_cause 直判优先，空串/未识别回落 last_error regex（老数据兼容）。
      const diag = diagnoseFailureWithCause(failCause, lastError)
      const amb = diag.cause === 'cancelled'
      const fix = diag.fixCommand
      return (
        <>
          <div
            className={`rounded-[11px] border px-[15px] py-[13px] ${amb ? 'border-amb-b bg-amb-t' : 'border-red-b bg-red-t'}`}
            data-tone={amb ? 'amb' : 'red'}
            data-testid="dt-diag"
          >
            <div className={`text-sm font-bold leading-[1.45] ${amb ? 'text-amb-d' : 'text-red-d'}`} data-testid="dt-diag-cause">
              {t(`failure.cause_${diag.cause}`)}
            </div>
            <p className="mt-1.5 mb-0 max-w-[64ch] text-[13px] leading-[1.6] text-text-2" data-testid="dt8-diag-hint">
              {t(`failure.hint_${diag.cause}`)}
            </p>
            {fix !== null && (
              <div className="mt-2.5 flex flex-col gap-1">
                <span className="text-[11px] text-text-3">{t('failure.fix_label')}</span>
                <div className={codeRowCls}>
                  <span className={codePromptCls} aria-hidden="true">
                    $
                  </span>
                  <code className={codeCls} data-testid="detail-fix-cmd">
                    {fix}
                  </code>
                  <button
                    type="button"
                    className={copyBtnCls}
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
              <details className="group mt-[11px]" data-testid="dt8-rawfold">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-[12.5px] font-semibold text-text-2 outline-none before:text-[10px] before:text-text-3 before:transition-transform before:content-['▸'] group-open:before:rotate-90 focus-visible:shadow-[0_0_0_3px_var(--ring-blue)] [&::-webkit-details-marker]:hidden">
                  {t('detail.raw_error_summary')}
                </summary>
                <pre
                  className="mt-2 mb-0 rounded-[9px] border border-code-border bg-code-bg px-3 py-2.5 font-mono text-xs leading-[1.65] whitespace-pre-wrap text-text-2 [overflow-wrap:anywhere]"
                  data-testid="dt8-raw-pre"
                >
                  {lastError}
                </pre>
              </details>
            )}
            <div
              className="mt-2.5 flex gap-3.5 font-mono text-xs tabular-nums text-text-3 [&_b]:font-bold [&_b]:text-text-2"
              data-testid="dt8-diag-meta"
            >
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
          <div className={artsCls}>
            {chips
              .filter((c) => !c.unset)
              .map((c) => (
                <BoxField key={c.key} chip={c} onCopy={copy} />
              ))}
            {missing.length > 0 && (
              <div
                className="min-w-0 rounded-[7px] border border-dashed border-border bg-transparent px-2 py-[5px]"
                data-state="miss"
                data-testid="dt-field-missing"
              >
                <div className="font-mono text-[10.5px] text-text-3 [overflow-wrap:anywhere]">{missing.join(' · ')}</div>
                <div className="text-xs text-text-3 [overflow-wrap:anywhere]">{t('evidence.unset')}</div>
              </div>
            )}
          </div>
          <p className={noteCls}>{t('detail.fail_note')}</p>
        </>
      )
    }
    // 评审 P2-9：verdict() 只在非 failed 分支消费——failed 早退前不白算（原先置于函数头是死计算）。
    const v = verdict()
    return (
      <>
        <div
          className={`mb-2 flex items-baseline gap-1.5 text-[12.5px] leading-normal font-semibold ${v.bad ? 'text-red-d' : 'text-text'}`}
          data-tone={v.bad ? 'bad' : 'ok'}
          data-testid="dt-verdict"
        >
          {/* tailwind v4 扫描器纪律：类与插值间留空白，防「类名+插值」连成非法 token 被丢弃 */}
          <span className={`flex-none ${v.glyph === '✓' ? 'text-green' : ''}`} aria-hidden="true">
            {v.glyph}
          </span>
          {v.text}
        </div>
        {chips.length > 0 ? (
          <div className={artsCls}>
            {chips.map((c) => (
              <BoxField key={c.key} chip={c} onCopy={copy} />
            ))}
          </div>
        ) : (
          <div className={noneCls}>{t('detail.stage_no_outputs')}</div>
        )}
      </>
    )
  }

  /** 当前/失败行的高亮框（boxInner 外包一层；失败态红 tone → data-tone=bad）。 */
  function renderBox(chips: EvidenceChip[]): JSX.Element {
    const bad = state === 'failed'
    return (
      <div
        className={`mt-2 rounded-md border px-[11px] py-2.5 ${bad ? 'border-red-b bg-red-t' : 'border-accent-b bg-accent-t'}`}
        data-tone={bad ? 'bad' : 'ok'}
        data-testid="dtl-box"
      >
        {boxInner(chips)}
      </div>
    )
  }

  // v8-C 意见④：历史只留流程级事件（transition/init/import——import 与 init 同级里程碑，kernel
  // kind 值域含之，评审 P2-5 补上）——kind==='set' 字段级噪音与未知 kind 一律滤掉（demo .hist
  // 对位；区头 hint 注明口径）。data-settled 仍看 entries（拉取落定判据不变）。
  const flowEntries =
    entries === null ? null : entries.filter((e) => e.kind === 'transition' || e.kind === 'init' || e.kind === 'import')

  const historySection = (
    <div className={secCls} data-testid="dt-hist-sec" data-settled={entries !== null ? 'true' : 'false'}>
      <div className={secHeadCls}>
        {t('detail.history_heading')} <span className={hintCls}>{t('detail.hist_flow_hint')}</span>
      </div>
      {flowEntries !== null &&
        (flowEntries.length === 0 ? (
          <p className={noneCls}>{t('detail.history_empty')}</p>
        ) : (
          <ol className="m-0 flex max-h-[180px] list-none flex-col gap-[5px] overflow-y-auto p-0" data-testid="dt-hist">
            {flowEntries.map((e, i) => (
              <li className="flex items-baseline gap-2 text-xs" data-testid={`dt-hist-${i}`} key={`${e.ts}-${i}`}>
                <span className="font-mono whitespace-nowrap text-text-3">{shortTime(e.ts)}</span>
                <span className="text-text-2 [overflow-wrap:anywhere]">{histText(e, t)}</span>
              </li>
            ))}
          </ol>
        ))}
    </div>
  )

  return (
    <section data-testid="task-detail" ref={scopeRef}>
      <header className="flex flex-wrap items-center gap-[9px] border-b border-border py-[13px]" data-testid="dt-head">
        <span className="font-mono text-[13.5px] font-bold text-text">{change.name}</span>
        {badge}
        <span className="flex-1" />
        {onClose && (
          <button
            type="button"
            className="cursor-pointer rounded-[6px] border border-transparent bg-transparent px-2.5 py-[5px] text-xs text-text-3 transition-colors hover:border-border hover:bg-fill hover:text-red"
            data-testid="detail-close"
            aria-label={t('detail.close')}
            onClick={onClose}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </header>

      {/* v8-C 意见④：动作置顶条（demo .dw-acts 对位）——原底部动作区的按钮与 footLabel 语境
          挪到头部，旁附一句语义说明；props 化纪律不变（按钮语义/端点全归宿主）。 */}
      {actions !== undefined && (
        <div className="flex flex-wrap items-center gap-[9px] border-b border-border py-3" data-testid="dt8-acts">
          <div className="flex items-center gap-2">{actions}</div>
          <span className="font-mono text-[11.5px] tabular-nums text-text-3" data-testid="dt-foot-label">
            {footLabel}
          </span>
        </div>
      )}

      {requirement !== undefined && requirement !== '' && (
        <div className={secCls}>
          <div className={secHeadCls}>{t('detail.req_heading')}</div>
          <p className="m-0 text-[13px] leading-[1.6] text-text-2">{requirement}</p>
        </div>
      )}

      <div className={secCls} data-testid="dt-stages-sec">
        <div className={secHeadCls}>
          {t('detail.stages_heading')} <span className={hintCls}>{t('detail.stages_hint')}</span>
        </div>
        {showStages && (
          <div role="list" aria-label={t('detail.stages_label', { name: change.name, n: stages.length })}>
            {stages.map((st, i) => {
              const status = statusOf(i)
              const todo = todoByStage.get(st.step)
              return (
                <div
                  className={`relative pb-3 pl-6 before:absolute before:top-[18px] before:-bottom-0.5 before:left-[7px] before:w-0.5 before:rounded-full before:content-[''] last:pb-0 last:before:hidden ${status === 'done' ? 'before:bg-green-b' : 'before:bg-border'}`}
                  role="listitem"
                  data-anim="stage"
                  data-state={status}
                  data-testid={`dtl-${st.step}`}
                  key={st.step}
                >
                  <span className={`${nodeBaseCls} ${nodeToneCls[status]}`} aria-hidden="true">
                    {status === 'done' ? '✓' : status === 'fail' ? '×' : ''}
                  </span>
                  <div className={chipRowCls}>
                    <span className={`text-[13px] ${stageNameCls[status]}`}>{stageLabel(st.step)}</span>
                    {status === 'todo' && <span className="text-xs text-text-3">{t('detail.not_started')}</span>}
                    {status === 'done' &&
                      (st.chips.length > 0 ? (
                        st.chips.map((c) => <StageChip key={c.key} chip={c} onCopy={copy} />)
                      ) : (
                        <span className="text-xs text-text-3">{t('detail.no_outputs')}</span>
                      ))}
                    {status === 'fail' && attempts !== '' && (
                      <span className="text-xs text-text-3">{t('detail.fail_stopped_here', { n: attempts })}</span>
                    )}
                  </div>
                  {(status === 'cur' || status === 'fail') && (
                    <>
                      {renderBox(st.chips)}
                      {curStageExtra}
                    </>
                  )}
                  {todo !== undefined && todo.tasks.length > 0 && (
                    <ul
                      className="mt-2 mb-0 flex list-none flex-col gap-1 pl-0 text-xs"
                      data-testid={`dtl-todo-${st.step}`}
                    >
                      {todo.tasks.map((task, taskIndex) => (
                        <li
                          className={`flex gap-1.5 [overflow-wrap:anywhere] ${task.completed ? 'text-text-3 line-through' : 'text-text-2'}`}
                          data-completed={task.completed ? 'true' : 'false'}
                          data-testid={`dtl-todo-${st.step}-${taskIndex}`}
                          key={`${taskIndex}-${task.text}`}
                        >
                          <span aria-hidden="true">{task.completed ? '✓' : '○'}</span>
                          <span>{task.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {!showStages && (
          // rules 缺失或 phase 与规则错位：阶段区留白但卡不消失（G17 底线）——回落产物正门，
          // 只列非空路径字段；失败态下失败框照渲染（last_error/attempts 不随阶段区静默丢失）。
          <div>
            <p className={noneCls}>{t('detail.stages_unknown')}</p>
            {state === 'failed' && renderBox([])}
            {curStageExtra}
            <div className={chipRowCls}>
              {artifactChips(change).map((c) => (
                <StageChip key={c.key} chip={c} onCopy={copy} />
              ))}
            </div>
          </div>
        )}
      </div>

      {change.documents?.governed && (
        <div className={secCls} data-testid="dt-documents">
          <div className={secHeadCls}>
            {t('detail.docs_heading')}
            <span className={hintCls}>
              {change.documents.pass === true ? t('detail.docs_complete') : t('detail.docs_incomplete')}
            </span>
          </div>
          {change.documents.items.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="dt-documents-items">
              {change.documents.items.map((item) => (
                <li
                  className={`rounded-md border px-2 py-1.5 text-xs [overflow-wrap:anywhere] ${
                    item.status === 'recorded' ? 'border-green-b bg-green-t text-green-d' : 'border-red-b bg-red-t text-red-d'
                  }`}
                  data-status={item.status}
                  data-testid={`dt-document-${item.kind}`}
                  key={item.kind}
                >
                  <b>{item.kind}</b>
                  {' · '}
                  {item.status === 'recorded'
                    ? t('detail.docs_recorded')
                    : item.status === 'missing'
                      ? t('detail.docs_missing')
                      : item.status === 'stale'
                        ? t('detail.docs_stale')
                        : t('detail.docs_unread')}
                  {item.requiredRead && <span className="text-text-3"> · {t('detail.docs_read_required')}</span>}
                  {item.paths.length > 0 && <span className="font-mono text-[11px] text-text-2"> · {item.paths.join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
          {change.documents.blockers.length > 0 && (
            <ul className="mt-2 mb-0 flex list-none flex-col gap-1 pl-0 text-xs text-red-d" data-testid="dt-document-blockers">
              {change.documents.blockers.map((blocker) => <li key={blocker}>× {blocker}</li>)}
            </ul>
          )}
          {change.documents.items.length === 0 && change.documents.blockers.length === 0 && (
            <p className={noneCls}>{t('detail.docs_empty')}</p>
          )}
        </div>
      )}

      {collapseTechnical ? (
        <details className="my-3 rounded-xl border border-border bg-fill/40 px-3" data-testid="detail-technical">
          <summary className="cursor-pointer py-3 text-[12.5px] font-semibold text-text">运行记录</summary>
          <RunAuditPanel root={root} change={change.name} refreshKey={`${change.phase}:${automation}`} />
          {historySection}
        </details>
      ) : (
        <RunAuditPanel root={root} change={change.name} refreshKey={`${change.phase}:${automation}`} />
      )}

      {/* v8-C 意见④：「自己上手修」连接命令卡（demo .conn-card 对位）——失败/在跑态即渲染，
          不再要求 worktree/sandbox 现场字段（codex 终稿 P2：server 端 session-link 在
          worktree 空时回落 root 查会话，本机直跑失败的恢复路径原先在 UI 永远走不到）；
          恢复会话行与重跑行恒在，worktree/sandbox 行按各自字段空串与否渲染；
          automation!=='running' 时容器行加「（未在跑）」小注；卡底注来源字段说明。 */}
      {/* v9 追加：running 态（容器活着，恢复会话最有意义）与失败态同渲染本卡。 */}
      {(state === 'failed' || automation === 'running') && (
        <div className={secCls} data-testid="dt8-conn">
          <div className={secHeadCls}>
            {t('detail.selffix_title')} <span className={hintCls}>{t('detail.selffix_desc')}</span>
          </div>
          <div className="rounded-[11px] border border-accent-b bg-accent-t px-[15px] py-[13px]">
            <div className="flex flex-col gap-[7px]">
              {/* v9-I：恢复会话行（自取数，loading 静默 / 查不到一行灰字）——失败+取消
                  （conflict/cause=cancelled 同落 failed 态）与 running 态随本卡覆盖；
                  worktree 空时 server 端回落 root 查会话，故本行不依赖现场字段恒挂载。 */}
              <SessionResumeRow root={root} name={change.name} onCopy={copy} />
              {worktree !== '' && (
                <div className={connRowCls} data-testid="dt8-conn-worktree">
                  <span className={connKeyCls}>{t('detail.conn_worktree')}</span>
                  <span className={connValCls}>{worktreeCmd}</span>
                  <button
                    type="button"
                    className={copyBtnCls}
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
                <div className={connRowCls} data-testid="dt8-conn-sandbox">
                  <span className={connKeyCls}>{t('detail.conn_sandbox')}</span>
                  <span className={connValCls}>{sandboxCmd}</span>
                  {automation !== 'running' && <span className={connNoteCls}>{t('detail.conn_not_running')}</span>}
                  <button
                    type="button"
                    className={copyBtnCls}
                    data-copy={sandboxCmd}
                    data-testid="dt8-conn-sandbox-copy"
                    aria-label={t('detail.copy_cmd')}
                    onClick={() => copy(sandboxCmd)}
                  >
                    <Icon name="copy" size={12} />
                  </button>
                </div>
              )}
              <div className={connRowCls} data-testid="dt8-conn-rerun">
                <span className={connKeyCls}>{t('detail.conn_rerun')}</span>
                <span className={connValCls}>{rerunCmd}</span>
                <button
                  type="button"
                  className={copyBtnCls}
                  data-copy={rerunCmd}
                  data-testid="dt8-conn-rerun-copy"
                  aria-label={t('detail.copy_cmd')}
                  onClick={() => copy(rerunCmd)}
                >
                  <Icon name="copy" size={12} />
                </button>
              </div>
            </div>
            <p className="mt-[9px] mb-0 text-[11.5px] text-text-3">{t('detail.conn_src')}</p>
          </div>
        </div>
      )}

      {/* #7（2026-07-15）：门行「在终端继续 pipeline transition」命令区退役——与抽屉内联动作
          按钮完全等价，属冗余；detail-cmd/detail-cmd-copy testid 与 terminal_heading/terminal_note
          随之退役。失败态的「自己上手修」连接命令卡（dt8-conn）是终端专属、保留。 */}

      {!collapseTechnical && historySection}

    </section>
  )
}
