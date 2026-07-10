import { useState } from 'react'
import { useT } from '../i18n'
import type { ChangeSnapshot } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import { legalTargets, plannedTransition, type PlannedTransition } from '../board/events'
import { shortTime } from '../model/time'
import { Dialog } from '../shell/Dialog'
import { Icon, type IconName } from '../shell/Icon'
import { artifactChips, gateEvidence, VERIFY_STATUS_FIELDS, type EvidenceChip } from './evidence'
import { decisionKind } from './inbox'

/**
 * ChangeDetailCard（评审 P0-1 核心交付件，Task 7）—— 收件箱行点开后的详情卡：
 * 头（名字/相位/等你复核徽章/关闭）→「为什么在等你」一句话 + 证据格（gateEvidence 复用）
 * → 产物（非空路径字段+拷贝钮，evidence.ts 导出的 artifactChips 正门）→ 语境
 * （workflow/track/preset/automation/created→updated）→ 底部动作条（legalTargets+
 * plannedTransition 逐出边渲染全部前进/回退边，评审 Important-2 修复；review 门文案带
 * "· 放行"/"· 打回"，其余相位通用"→ {to}"/"↩ {to}"）。视觉基准
 * design-demos/v4-openai-trellis.html 的「change 详情」卡段（信息架构照抄，历史区除外
 * ——spec §5 登记：待 history 读端点，本轮不做）。
 *
 * Props 故意不含任何 InboxView 私有状态（无 pending/busy 之类的回调）——Task 9 看板要逐字
 * 复用同一组件，接口必须对"谁在渲染我"零假设。回退边二次确认因此是组件自己的本地
 * pending/busy + Dialog，与 InboxView 行内快捷钮的 pending 流是"同构复用"（同一套 i18n
 * 文案、同一个共享 Dialog、同一套确认语义），不是"共享同一份 state"。
 */
export interface ChangeDetailCardProps {
  root: string
  change: ChangeSnapshot
  rules: WorkflowRules | undefined
  onTransition: (name: string, root: string, event: string) => Promise<void>
  onClose: () => void
  onToast?: (msg: string) => void
  onError?: (msg: string) => void
}

const TONE_ICON: Partial<Record<EvidenceChip['tone'], IconName>> = { pass: 'check', fail: 'x' }

/** 未设口径同 evidence.ts 私有 helper（老内核 cmd_get：字面 'null' 或空串）——只读展示，不必导出复用。 */
function fieldStr(c: ChangeSnapshot, key: string): string {
  const v = c.fields[key]
  return typeof v === 'string' ? v : ''
}
function isSet(v: string): boolean {
  return v !== '' && v !== 'null'
}

interface FieldBoxProps {
  fieldKey: string
  value: string
  tone?: EvidenceChip['tone']
  copyable?: boolean
  testid?: string
  onCopy?: (value: string) => void
  /** 终审修复批：未产出占位契约修正——evidence.ts 不再把中文「未产出」焊死进 value，改用
   *  unset:true 语义标记（此时 value 恒为 ''）；本组件按 unset 走 i18n t('evidence.unset')
   *  渲染展示文案，不直接吐 value。 */
  unset?: boolean
}

/** 证据格 / 产物行 / 语境格三处共用的 key:value 展示格——tone 决定语义色，copyable 决定要不要拷贝钮。 */
function FieldBox({ fieldKey, value, tone = 'neutral', copyable, testid, onCopy, unset }: FieldBoxProps): JSX.Element {
  const { t } = useT()
  const icon = TONE_ICON[tone]
  const displayValue = unset ? t('evidence.unset') : value
  return (
    <div className={`detail__field detail__field--${tone}`} data-testid={testid}>
      <span className="detail__field-key">{fieldKey}</span>
      <span className="detail__field-value">
        {icon && <Icon name={icon} size={12} />}
        <span className="detail__field-text">{displayValue}</span>
        {copyable && (
          <button
            type="button"
            className="detail__copy"
            data-testid={testid ? `${testid}-copy` : undefined}
            aria-label={t('detail.copy_field', { field: fieldKey })}
            onClick={() => onCopy?.(value)}
          >
            <Icon name="copy" size={12} />
          </button>
        )}
      </span>
    </div>
  )
}

interface Pending {
  planned: PlannedTransition
}

export function ChangeDetailCard({ root, change, rules, onTransition, onClose, onToast, onError }: ChangeDetailCardProps): JSX.Element {
  const { t } = useT()
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  function copy(value: string): void {
    void navigator.clipboard?.writeText(value).then(() => {
      onToast?.(t('detail.copied', { value }))
    })
  }

  const kind = decisionKind(change)
  const evidenceChips = gateEvidence(change, rules)
  // 产物（评审 Important-1 + Minor-3 修复）：改走 evidence.ts 导出的语义化正门 artifactChips()——
  // 不再靠"故意传 rules=undefined 强制 gateEvidence 走兜底分支"这个隐式技巧倒推同一份候选集。
  // 与「证据格」去重逻辑不变：verify 门已在证据格展示过 verification_report/build_sha 时不在
  // 产物区重复出现（对齐视觉基准 demo 的信息架构——产物区只展示证据区没覆盖到的路径字段）。
  const evidenceKeys = new Set(evidenceChips.map((c) => c.key))
  const artifacts = artifactChips(change).filter((c) => !evidenceKeys.has(c.key))

  const whyText =
    kind === 'verify'
      ? (() => {
          // 评审 Important-1 修复：未过项判据改用 evidence.ts 导出的 VERIFY_STATUS_FIELDS 白名单
          // （key ∈ 三轨字段名 且 tone !== 'pass'），不再用 `!c.copyable` 当替身信号——旧判据的
          // 漏洞是 verification_report/build_sha 未设时同样落在 unsetPlaceholder()（无 copyable、
          // tone pending），会被误判成"未过项"混进三轨列表（如「build_sha 未过」的假警报），
          // 而这两个字段根本不是三轨判定字段，产物没产出不等于验证没过。
          const failed = evidenceChips.filter(
            (c) => (VERIFY_STATUS_FIELDS as readonly string[]).includes(c.key) && c.tone !== 'pass',
          )
          return failed.length === 0
            ? t('detail.why_gate_allpass')
            : t('detail.why_gate', { names: failed.map((c) => c.key.replace(/_result$/, '')).join('、') })
        })()
      : t(`inbox.awaiting.${kind}`)

  const targets = rules ? legalTargets(rules, change.phase) : []
  const planned = targets
    .map((to) => (rules ? plannedTransition(rules, change.phase, to) : null))
    .filter((p): p is PlannedTransition => p !== null)
  // 评审 Important-2 修复：全部出边逐条渲染（不再只取"第一个前进边"+"第一个回退边"）——
  // 自定义 workflow 若声明了 2+ 条同向出边，此前只有第一条可达，其余边彻底不可点（Task 7
  // 报告"担忧"一节已明确标记的已知缺口），本轮补齐。第一条前进/回退边仍挂既有
  // detail-approve/detail-reject testid（向后兼容既有测试与 Task 9 看板复用契约），额外的边
  // 用 detail-forward-{event}/detail-backward-{event}。
  const forwardEdges = planned.filter((p) => !p.backward)
  const backwardEdges = planned.filter((p) => p.backward)
  // 文案相位感知：只有 review 门（放行/打回二元决策语义）才缀"· 放行"/"· 打回"；confirm 门
  // 或非 gate 相位一律用通用的"→ {to}"/"↩ {to}"——review 是唯一带"审批"语义的 gate 类型
  // （见 workflowModel.ts WorkflowRules.gateByStep 的三态定义）。
  const isGatePhase = rules?.gateByStep[change.phase] === 'review'

  async function apply(p: PlannedTransition): Promise<void> {
    setBusy(true)
    try {
      await onTransition(change.name, root, p.event)
      onToast?.(t('board.transition_ok', { name: change.name, event: p.event }))
    } catch (e) {
      onError?.(t('board.transition_fail', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  // 禁止用 useCallback 包裹本函数——会冻结 busy 快照，连取消钮/Esc/backdrop 的 busy 语义一起
  // 假死，且 exhaustive-deps 拦不住（同 InboxView.tsx closePending 的既有告诫，同构复用）。
  function closePending(): void {
    if (!busy) setPending(null)
  }

  const workflowName = fieldStr(change, 'workflow') || 'default'
  const automation = fieldStr(change, 'automation')
  const createdAt = fieldStr(change, 'created_at')

  return (
    <section className="detail" data-testid="change-detail">
      <header className="detail__head">
        <span className="card__name">{change.name}</span>
        <span className="g-phase">{change.phase}</span>
        {/* 终审修复批（非 gate 不说谎）：「等你复核」是 review 门专属语义（二元放行/打回决策），
            非 gate 相位（含 confirm 门）此刻并没有任何决策在等——挂 isGatePhase 而非恒渲染。 */}
        {isGatePhase && <span className="badge badge--gate">{t('inbox.badge_waiting')}</span>}
        <button
          type="button"
          className="detail__close btn--icon"
          data-testid="detail-close"
          aria-label={t('detail.close')}
          onClick={onClose}
        >
          <Icon name="x" size={14} />
        </button>
      </header>

      {/* 终审修复批（非 gate 不说谎）：整节挂 isGatePhase——"为什么在等你"这句话 + 证据格，
          语义上都是"解释这个决策"的一部分；非 gate 相位没有决策在等，不该渲染这节（含证据格：
          DEFAULT_RULES 下能产出非空证据格的三个相位 verify/explore/spec 恰好也是仅有的三个
          review 门相位，isGatePhase 收紧对它们零影响，见 evidence.ts/workflowModel.ts 的
          REVIEW_PHASES 映射）。 */}
      {isGatePhase && (
        <div className="detail__sec">
          <div className="detail__sec-h">
            <Icon name="gate" size={13} />
            <b>{t('detail.why_heading')}</b>
          </div>
          <p className="detail__why">{whyText}</p>
          {evidenceChips.length > 0 && (
            <div className="detail__grid">
              {evidenceChips.map((chip) => (
                <FieldBox
                  key={chip.key}
                  fieldKey={chip.key}
                  value={chip.value}
                  tone={chip.tone}
                  copyable={chip.copyable}
                  unset={chip.unset}
                  testid={`detail-evidence-${chip.key}`}
                  onCopy={copy}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="detail__sec">
          <div className="detail__sec-h">
            <Icon name="folder" size={13} />
            <b>{t('detail.artifacts_heading')}</b>
          </div>
          <div className="detail__grid">
            {artifacts.map((chip) => (
              <FieldBox
                key={chip.key}
                fieldKey={chip.key}
                value={chip.value}
                copyable={chip.copyable}
                testid={`detail-artifact-${chip.key}`}
                onCopy={copy}
              />
            ))}
          </div>
        </div>
      )}

      <div className="detail__sec">
        <div className="detail__sec-h">
          <Icon name="layers" size={13} />
          <b>{t('detail.context_heading')}</b>
        </div>
        <div className="detail__grid">
          <FieldBox fieldKey="workflow" value={workflowName} />
          <FieldBox fieldKey="track" value={change.track} />
          <FieldBox fieldKey="preset" value={change.preset} />
          {isSet(automation) && <FieldBox fieldKey="automation" value={automation} />}
          {isSet(createdAt) && <FieldBox fieldKey="created_at" value={shortTime(createdAt)} />}
          <FieldBox fieldKey="updated_at" value={shortTime(change.updated_at)} />
        </div>
      </div>

      <div className="detail__foot">
        {backwardEdges.map((p, i) => (
          <button
            key={p.event}
            type="button"
            className="btn btn--verm-ghost"
            data-testid={i === 0 ? 'detail-reject' : `detail-backward-${p.event}`}
            disabled={busy}
            onClick={() => setPending({ planned: p })}
          >
            {isGatePhase ? t('detail.reject_to', { to: p.to }) : t('detail.backward_to', { to: p.to })}
          </button>
        ))}
        {forwardEdges.map((p, i) => (
          <button
            key={p.event}
            type="button"
            className="btn"
            data-testid={i === 0 ? 'detail-approve' : `detail-forward-${p.event}`}
            disabled={busy}
            onClick={() => void apply(p)}
          >
            {isGatePhase ? t('detail.approve_to', { to: p.to }) : t('detail.forward_to', { to: p.to })}
          </button>
        ))}
      </div>

      {pending && (
        <Dialog
          title={t('board.confirm_backward_title')}
          onClose={closePending}
          testid="detail-confirm"
          actions={
            <>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={closePending}>
                {t('board.confirm_no')}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                data-testid="detail-confirm-yes"
                disabled={busy}
                onClick={() => void apply(pending.planned)}
              >
                {t('board.confirm_yes')}
              </button>
            </>
          }
        >
          <p className="dialog__desc">
            {t('board.confirm_backward_desc', {
              name: change.name,
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
