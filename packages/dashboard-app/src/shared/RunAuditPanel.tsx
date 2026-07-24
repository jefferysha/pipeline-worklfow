import { useEffect, useMemo, useState } from 'react'
import { ApiError, fetchRunDetail, type WbLedgerRecord, type WbRunDetail } from '../api/client'
import { shortTime } from '../model/time'

export interface RunAuditPanelProps {
  root: string
  change: string
  /** phase/automation 等 canonical 快照变化时由宿主传新键，触发重读。 */
  refreshKey?: string
}

function object(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return Object.fromEntries(Object.entries(value))
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function short(value: unknown, width = 12): string {
  const text = str(value)
  if (text.length <= width) return text || '—'
  return `${text.slice(0, width)}…`
}

function recordOf(records: readonly WbLedgerRecord[], kind: string): WbLedgerRecord | undefined {
  return [...records].reverse().find((record) => record.kind === kind)
}

const STEP_LABELS: Readonly<Record<string, string>> = {
  open: '立项',
  explore: '调研',
  draft: '初稿',
  spec: '规格',
  review: '复核',
  build: '实现',
  verify: '验证',
  release: '交付',
  archive: '归档',
  done: '完成',
}

function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? (step || '未提供')
}

function resultLabel(result: string): string {
  const labels: Readonly<Record<string, string>> = {
    merged: '已完成并合并',
    success: '已完成',
    passed: '已通过',
    paused: '已暂停',
    failed: '失败',
    conflict: '发生冲突',
    skipped: '已跳过',
    queued: '等待中',
    running: '运行中',
  }
  return labels[result] ?? (result || '尚未结束')
}

function reasonLabel(reason: string): string {
  const labels: Readonly<Record<string, string>> = {
    'verify-fail': '验证未通过',
    'verification-inconclusive': '验证结果不明确',
    'verification-subject-mismatch': '验证对象不一致',
    'verification-binding-unresolved': '验证绑定不完整',
    'skill-bundle-snapshot-corrupt': '技能快照损坏',
    'budget-exceeded': '超出运行预算',
  }
  return labels[reason] ?? (reason ? '需要查看失败原因' : '')
}

function verificationLabel(verdict: string): string {
  if (verdict === 'passed') return '已通过'
  if (verdict === 'failed') return '未通过'
  if (verdict === 'inconclusive') return '结果不明确'
  return verdict || '尚未验证'
}

function evidenceSummary(value: unknown): string {
  const evidence = object(value)
  if (!evidence) return '证据格式异常'
  if (evidence.kind === 'command-result') {
    const exitCode = num(evidence.exit_code)
    return exitCode === 0 ? '命令检查通过' : `命令检查未通过${exitCode === null ? '' : `（退出码 ${exitCode}）`}`
  }
  if (evidence.kind === 'repo-file') return `文件证据已核验：${str(evidence.path) || '未命名文件'}`
  return '已记录验证证据'
}

const factCard = 'rounded-xl border border-border bg-card px-3 py-3'
const factLabel = 'text-[11px] font-semibold text-text-3'
const factValue = 'mt-1 text-[13px] font-bold leading-5 text-text [overflow-wrap:anywhere]'

export function RunAuditPanel({ root, change, refreshKey = '' }: RunAuditPanelProps): JSX.Element {
  const [detail, setDetail] = useState<WbRunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(null)
    fetchRunDetail(change, root)
      .then((next) => {
        if (!cancelled) setDetail(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : String(reason))
      })
    return () => { cancelled = true }
  }, [change, root, refreshKey])

  const records = detail?.ledger?.records ?? []
  const terminal = useMemo(() => recordOf(records, 'run'), [records])
  const usage = useMemo(() => recordOf(records, 'usage'), [records])
  const skillSnapshot = useMemo(() => recordOf(records, 'skill-bundle-snapshot'), [records])

  if (error !== null) {
    return (
      <section className="border-b border-border py-3" data-testid="run-audit-error">
        <p className="rounded-xl border border-red-b bg-red-t px-3 py-2.5 text-xs font-semibold text-red-d">
          运行记录获取失败：{error}
        </p>
      </section>
    )
  }

  if (detail === null) {
    return <section className="border-b border-border py-3 text-xs text-text-3" data-testid="run-audit-loading">正在读取运行记录…</section>
  }

  const run = detail.workflow_run
  const current = detail.current_revision
  const terminalArtifacts = object(terminal?.artifacts)
  const terminalCommits = strings(terminalArtifacts?.commit_shas)
  const terminalResult = str(terminal?.result)
  const terminalReason = str(terminal?.reason)
  const verification = object(terminal?.verification)
  const evidence = Array.isArray(verification?.evidence) ? verification.evidence : []
  const tokens = object(usage?.tokens)
  const slots = Array.isArray(skillSnapshot?.slots)
    ? skillSnapshot.slots.map(object).filter((slot): slot is Record<string, unknown> => slot !== null)
    : []
  const updatedAt = str(terminal?.finished_at) || run?.updated_at || current?.mutation.observedAt || ''

  return (
    <section className="border-b border-border py-3" data-source={detail.source} data-testid="run-audit">
      <div className="flex items-center justify-between gap-3">
        <div>
          <b className="text-[13px] text-text">运行记录</b>
          <p className="mt-0.5 text-[11px] leading-5 text-text-3">只展示会影响你判断和处理任务的真实结果。</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${detail.source === 'canonical' ? 'border-green-b bg-green-t text-green-d' : 'border-amb-b bg-amb-t text-amb-d'}`}>
          {detail.source === 'canonical' ? '系统记录' : '兼容记录'}
        </span>
      </div>

      {detail.source === 'legacy' && (
        <p className="mt-3 rounded-xl border border-amb-b bg-amb-t px-3 py-2 text-xs font-semibold text-amb-d" data-testid="run-audit-source-alert">
          这份记录来自旧格式，可能不是最新版本。
        </p>
      )}
      {detail.projection.status === 'drift' && (
        <p className="mt-3 rounded-xl border border-red-b bg-red-t px-3 py-2 text-xs font-semibold text-red-d" data-testid="run-audit-projection-alert">
          进度数据不同步，请在继续操作前重新加载或联系维护者修复。
        </p>
      )}
      {detail.ledger.health === 'degraded' && (
        <p className="mt-3 rounded-xl border border-red-b bg-red-t px-3 py-2 text-xs font-semibold text-red-d" data-testid="run-audit-ledger-alert">
          有 {detail.ledger.rejected.length} 条运行记录无法读取，本页结果可能不完整。
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2" data-testid="run-audit-summary">
        <div className={factCard}><div className={factLabel}>工作流</div><div className={factValue}>{run?.workflow_id ?? '未提供'}</div></div>
        <div className={factCard}><div className={factLabel}>当前阶段</div><div className={factValue}>{stepLabel(run?.current_step ?? '')}</div></div>
        <div className={factCard}><div className={factLabel}>记录版本</div><div className={factValue}>{current ? `第 ${current.revision} 版` : '未提供'}</div></div>
        <div className={factCard}><div className={factLabel}>最近更新</div><div className={factValue}>{updatedAt ? shortTime(updatedAt) : '未提供'}</div></div>
      </div>

      {detail.transitions.length > 0 && (
        <div className="mt-3" data-testid="run-audit-transitions">
          <h3 className="text-xs font-semibold text-text">阶段流转</h3>
          <ol className="mt-2 space-y-1.5">
            {detail.transitions.map((transition) => (
              <li key={transition.id} className="flex items-center justify-between gap-3 rounded-lg bg-fill px-3 py-2 text-xs text-text-2">
                <span><b className="text-text">{stepLabel(transition.from)} → {stepLabel(transition.to)}</b></span>
                <time className="text-[11px] text-text-3">{shortTime(transition.observedAt)}</time>
              </li>
            ))}
          </ol>
        </div>
      )}

      {terminal ? (
        <div className="mt-3" data-testid="run-audit-execution">
          <h3 className="text-xs font-semibold text-text">最近一次执行</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className={factCard}><div className={factLabel}>结果</div><div className={factValue}>{resultLabel(terminalResult)}{terminalReason ? ` · ${reasonLabel(terminalReason)}` : ''}</div></div>
            <div className={factCard}><div className={factLabel}>代码分支</div><div className={factValue}>{str(terminalArtifacts?.branch) || '未生成'}</div></div>
            <div className={factCard}><div className={factLabel}>构建基线</div><div className={factValue}>{short(terminalArtifacts?.build_sha)}</div></div>
            <div className={factCard}><div className={factLabel}>提交数量</div><div className={factValue}>{terminalCommits.length} 个提交</div></div>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-fill px-3 py-3 text-xs text-text-3">尚未开始真实执行。</p>
      )}

      {verification && (
        <div className="mt-3" data-testid="run-audit-verification">
          <h3 className="text-xs font-semibold text-text">验证结果</h3>
          <div className={`mt-2 rounded-xl border px-3 py-3 ${str(verification.verdict) === 'passed' ? 'border-green-b bg-green-t' : 'border-red-b bg-red-t'}`}>
            <b className="text-sm text-text">{verificationLabel(str(verification.verdict))}</b>
            {evidence.length > 0 && <ul className="mt-2 space-y-1 text-xs text-text-2">{evidence.map((item, index) => <li key={index}>{evidenceSummary(item)}</li>)}</ul>}
          </div>
        </div>
      )}

      {skillSnapshot && (
        <div className="mt-3" data-testid="run-audit-skills">
          <h3 className="text-xs font-semibold text-text">本次使用的技能</h3>
          <div className="mt-2 rounded-xl border border-border bg-card px-3 py-3 text-xs text-text-2">
            <b className="text-text">{str(skillSnapshot.skill_bundle_id) || '未命名技能包'}</b>
            {slots.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{slots.map((slot, index) => <span key={`${str(slot.concrete_skill_id)}-${index}`} className="rounded-lg bg-fill px-2 py-1 font-semibold">{str(slot.concrete_skill_id) || str(slot.token)}</span>)}</div>}
          </div>
        </div>
      )}

      {usage && (
        <div className="mt-3" data-testid="run-audit-usage">
          <h3 className="text-xs font-semibold text-text">模型用量</h3>
          <div className="mt-2 rounded-xl border border-border bg-card px-3 py-3 text-xs text-text-2">
            本次共使用 <b className="text-text">{num(tokens?.total)?.toLocaleString('en-US') ?? '未提供'} tokens</b>
          </div>
        </div>
      )}

      <p className="mt-3 rounded-xl bg-fill px-3 py-3 text-xs leading-5 text-text-3" data-testid="run-audit-artifact-note">
        运行时产出由运行 Agent 显式登记；系统会校验当前工作流、阶段、字段和执行技能，登记成功后显示在上方对应阶段。
      </p>
    </section>
  )
}
