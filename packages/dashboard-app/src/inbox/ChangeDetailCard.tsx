import { useState } from 'react'
import { useT } from '../i18n'
import type { ChangeSnapshot } from '../types'
import type { WorkflowRules } from '../model/workflowModel'
import { legalTargets, plannedTransition, type PlannedTransition } from '../board/events'
import { shortTime } from '../model/time'
import { Dialog } from '../shell/Dialog'
import { Icon, type IconName } from '../shell/Icon'
import { gateEvidence, type EvidenceChip } from './evidence'
import { decisionKind } from './inbox'

/**
 * ChangeDetailCard（评审 P0-1 核心交付件，Task 7）—— 收件箱行点开后的详情卡：
 * 头（名字/相位/等你复核徽章/关闭）→「为什么在等你」一句话 + 证据格（gateEvidence 复用）
 * → 产物（非空路径字段+拷贝钮）→ 语境（workflow/track/preset/automation/created→updated）
 * → 底部动作条（放行/打回）。视觉基准 design-demos/v4-openai-trellis.html 的「change 详情」
 * 卡段（信息架构照抄，历史区除外——spec §5 登记：待 history 读端点，本轮不做）。
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
}

/** 证据格 / 产物行 / 语境格三处共用的 key:value 展示格——tone 决定语义色，copyable 决定要不要拷贝钮。 */
function FieldBox({ fieldKey, value, tone = 'neutral', copyable, testid, onCopy }: FieldBoxProps): JSX.Element {
  const { t } = useT()
  const icon = TONE_ICON[tone]
  return (
    <div className={`detail__field detail__field--${tone}`} data-testid={testid}>
      <span className="detail__field-key">{fieldKey}</span>
      <span className="detail__field-value">
        {icon && <Icon name={icon} size={12} />}
        <span className="detail__field-text">{value}</span>
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
  // 产物：故意传 rules=undefined——gateEvidence 的判据 `rules === DEFAULT_RULES && phase 在表内`
  // 恒为 false，必定命中兜底分支（全部非空 PATH_FIELDS：design_doc/plan/verification_report/
  // pr_url），不需要 evidence.ts 额外导出私有字段表。与「证据格」去重：verify 门已在证据格
  // 展示过 verification_report/build_sha 时不在产物区重复出现（对齐视觉基准 demo 的信息架构——
  // 产物区只展示证据区没覆盖到的路径字段）。
  const evidenceKeys = new Set(evidenceChips.map((c) => c.key))
  const artifactChips = gateEvidence(change, undefined).filter((c) => !evidenceKeys.has(c.key))

  const whyText =
    kind === 'verify'
      ? (() => {
          // 三轨状态字段在 gateEvidence 里恒定 copyable 缺省（只有 verification_report/build_sha
          // 路径型字段才 copyable:true）——用这个信号取"未过项"，不需要 evidence.ts 额外导出
          // VERIFY_STATUS_FIELDS 私有常量。
          const failed = evidenceChips.filter((c) => !c.copyable && c.tone !== 'pass')
          return failed.length === 0
            ? t('detail.why_gate_allpass')
            : t('detail.why_gate', { names: failed.map((c) => c.key.replace(/_result$/, '')).join('、') })
        })()
      : t(`inbox.awaiting.${kind}`)

  const targets = rules ? legalTargets(rules, change.phase) : []
  const planned = targets
    .map((to) => (rules ? plannedTransition(rules, change.phase, to) : null))
    .filter((p): p is PlannedTransition => p !== null)
  // 出边按钮只取"第一个前进边"+"第一个回退边"（review-gate 语义上是二元决策：放行或打回）；
  // default workflow 的 verify/explore/spec 门恒好落在这个形状（至多 1 进 + 1 退），自定义
  // workflow 若声明了 2+ 条同向出边，本卡只呈现第一条——已知简化，见任务报告"担忧"一节。
  const forward = planned.find((p) => !p.backward)
  const backward = planned.find((p) => p.backward)

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
        <span className="badge badge--gate">{t('inbox.badge_waiting')}</span>
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
                testid={`detail-evidence-${chip.key}`}
                onCopy={copy}
              />
            ))}
          </div>
        )}
      </div>

      {artifactChips.length > 0 && (
        <div className="detail__sec">
          <div className="detail__sec-h">
            <Icon name="folder" size={13} />
            <b>{t('detail.artifacts_heading')}</b>
          </div>
          <div className="detail__grid">
            {artifactChips.map((chip) => (
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
        {backward && (
          <button
            type="button"
            className="btn btn--verm-ghost"
            data-testid="detail-reject"
            disabled={busy}
            onClick={() => setPending({ planned: backward })}
          >
            ↩ {t('detail.reject')}
          </button>
        )}
        {forward && (
          <button
            type="button"
            className="btn"
            data-testid="detail-approve"
            disabled={busy}
            onClick={() => void apply(forward)}
          >
            → {t('detail.approve')}
          </button>
        )}
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
