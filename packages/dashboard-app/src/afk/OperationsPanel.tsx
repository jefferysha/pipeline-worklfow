import { useEffect, useMemo, useState } from 'react'
import { Activity, Clock3, Play, RefreshCw, Sparkles } from 'lucide-react'
import {
  ApiError,
  fetchAutomationStarters,
  fetchCadenceStatus,
  fetchLoopsSnapshot,
  postLoopRun,
  postLoopStarterInit,
  postLoopSync,
  postTriage,
  type AutomationStarterTemplate,
  type OperationResponse,
  type WbLoopRow,
  type WbCadenceStatus,
} from '../api/client'
import { useT } from '../i18n'
import { shortTime } from '../model/time'
import { OperationResultView } from './OperationResultView'

export interface OperationsPanelProps {
  root: string
  onToast?: (message: string) => void
  /** 结构化 operation 结果里的权威 change 标识，跳转到该 Change / Run 审计现场。 */
  onOpenChange?: (name: string) => void
  /** 缺省展示完整操作面；自动运行工具抽屉传入后只呈现一个真实工具。 */
  activeTool?: OperationTool
  compact?: boolean
}

export type OperationTool = 'cadence' | 'starter' | 'run' | 'sync' | 'triage'

const card = 'rounded-xl border border-border bg-card p-4'
const input = 'h-9 w-full rounded-lg border border-border bg-bg px-3 text-[13px] text-text outline-none focus:border-(--accent)'
const button = 'h-9 rounded-lg bg-btn-bg px-3.5 text-[12.5px] font-bold text-btn-fg transition-colors hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-45'
const ghost = 'h-9 rounded-lg border border-border bg-card px-3.5 text-[12.5px] font-semibold text-text-2 hover:bg-fill disabled:opacity-45'

function errorText(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : String(error)
}

const STARTER_COPY: Record<string, { title: string; description: string }> = {
  'pr-babysitter': { title: '代码评审守护', description: '持续跟进代码评审、CI、变基和合并，遇到风险时交给你处理。' },
  'daily-triage': { title: '每日巡检', description: '每天整理 CI、问题、提交和待办，生成一份可执行清单。' },
  'ci-sweeper': { title: 'CI 故障巡检', description: '发现失败的 CI 后尝试最小修复，无法安全处理时及时升级。' },
  'post-merge-cleanup': { title: '合并后清理', description: '代码合并后扫描遗留问题和技术债，生成后续清理任务。' },
  'dependency-sweeper': { title: '依赖更新巡检', description: '发现并验证依赖与安全更新，高风险改动必须由人确认。' },
  'changelog-drafter': { title: '更新日志草稿', description: '根据已合并改动起草分类清晰的更新日志，交由你审核。' },
  'issue-triage': { title: '问题分拣', description: '去重、分类并排列新问题，让待办列表保持可执行。' },
}

function starterCopy(item: AutomationStarterTemplate): { title: string; description: string } {
  return STARTER_COPY[item.id] ?? { title: item.id, description: item.goal }
}

function riskLabel(value: string): string {
  if (value === 'low') return '低风险'
  if (value === 'medium') return '中风险'
  if (value === 'high') return '高风险'
  return value
}

export function OperationsPanel({ root, onToast, onOpenChange, activeTool, compact = false }: OperationsPanelProps): JSX.Element {
  const { t } = useT()
  const [templates, setTemplates] = useState<AutomationStarterTemplate[]>([])
  const [loops, setLoops] = useState<WbLoopRow[]>([])
  const [cadence, setCadence] = useState<WbCadenceStatus | null>(null)
  const [loadError, setLoadError] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [loopId, setLoopId] = useState('')
  const [runner, setRunner] = useState('codex')
  const [workflow, setWorkflow] = useState('default')
  const [skillBundle, setSkillBundle] = useState('')
  const [selector, setSelector] = useState('')
  const [runLevel, setRunLevel] = useState<'L1' | 'L2' | 'L3'>('L1')
  const [runReal, setRunReal] = useState(false)
  const [runCommit, setRunCommit] = useState(false)
  const [confirmRun, setConfirmRun] = useState(false)
  const [confirmL3, setConfirmL3] = useState(false)
  const [syncMode, setSyncMode] = useState<'dry-run' | 'apply'>('dry-run')
  const [confirmSync, setConfirmSync] = useState(false)
  const [triageSource, setTriageSource] = useState<'git-commits' | 'loop-run-terminals'>('git-commits')
  const [triageModel, setTriageModel] = useState('')
  const [confirmTriage, setConfirmTriage] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<OperationResponse | null>(null)
  const [operationError, setOperationError] = useState('')

  const reload = (): void => {
    setLoadError('')
    void Promise.all([fetchAutomationStarters(root), fetchLoopsSnapshot(), fetchCadenceStatus(root)])
      .then(([nextTemplates, loopSnapshot, cadenceStatus]) => {
        const nextLoops = loopSnapshot.rows.filter((loop) => loop.root === root)
        setTemplates(nextTemplates)
        setLoops(nextLoops)
        setCadence(cadenceStatus)
        setSelectedTemplate((current) => current || nextTemplates[0]?.id || '')
        setSelector((current) => current || nextLoops[0]?.id || '')
        if (nextLoops.length > 0) {
          const chosen = nextLoops.find((loop) => loop.id === selector) ?? nextLoops[0]!
          setRunLevel(chosen.autonomy_level)
        }
      })
      .catch((error: unknown) => setLoadError(errorText(error)))
  }

  useEffect(reload, [root])

  useEffect(() => {
    const loop = loops.find((item) => item.id === selector)
    if (loop) setRunLevel(loop.autonomy_level)
  }, [selector, loops])

  const template = useMemo(
    () => templates.find((item) => item.id === selectedTemplate) ?? null,
    [templates, selectedTemplate],
  )

  async function perform(kind: string, action: () => Promise<OperationResponse>, refresh = false): Promise<void> {
    setBusy(kind)
    setOperationError('')
    setResult(null)
    try {
      const response = await action()
      setResult(response)
      if (response.ok) {
        onToast?.(t('operations.completed'))
        if (refresh) reload()
      }
    } catch (error) {
      setOperationError(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  const realRunReady = !runReal || (confirmRun && (runLevel !== 'L3' || confirmL3))
  const syncReady = syncMode === 'dry-run' || confirmSync
  const shows = (tool: OperationTool): boolean => activeTool === undefined || activeTool === tool

  return (
    <section className={compact ? 'bg-card' : 'mb-5 rounded-xl border border-border bg-card p-4'} data-testid="operations-panel" data-tool={activeTool}>
      {!compact && <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-text"><Activity size={17} aria-hidden="true" /><h2 className="text-[15px] font-bold">{t('operations.title')}</h2></div>
          <p className="mt-1 text-xs text-text-3">{t('operations.subtitle')}</p>
        </div>
        <button type="button" className={ghost} onClick={reload} disabled={busy !== null} data-testid="ops-refresh">
          <RefreshCw className="mr-1.5 inline size-3.5" aria-hidden="true" />{t('operations.refresh')}
        </button>
      </header>}

      {loadError && <p role="alert" className="mb-3 rounded-lg border border-red-b bg-red-t px-3 py-2 text-xs text-red-d">{loadError}</p>}

      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'lg:grid-cols-2'}`}>
        {shows('cadence') && <article className={`rounded-lg border border-border bg-fill/40 px-3.5 py-3 ${compact ? '' : 'lg:col-span-2'}`} data-testid="ops-cadence-status" data-enabled={cadence?.enabled === true}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Clock3 size={15} aria-hidden="true" /><h3 className="font-bold text-text">{t('operations.cadence_title')}</h3></div>
            <span className="rounded-full border border-border bg-bg px-2 py-1 font-mono text-[10.5px] text-text-3" role="status" aria-live="polite">
              {cadence === null ? t('operations.cadence_loading') : `${cadence.poll_interval_ms / 1000}s poll · ${cadence.running ? t('operations.cadence_running') : t('operations.cadence_online')}`}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-3">{t('operations.cadence_note')}</p>
          {cadence !== null && cadence.loops.length === 0 && <p className="mt-3 text-xs text-text-3" role="status" aria-live="polite">{t('operations.cadence_empty')}</p>}
          {cadence !== null && cadence.loops.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {cadence.loops.map((item) => (
                <div
                  key={`${item.root}:${item.loop_id}`}
                  data-testid={`ops-cadence-loop-${item.loop_id}`}
                  data-state={item.state}
                  className="rounded-lg border border-border bg-bg px-3 py-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-3"><b className="font-mono text-text">{item.loop_id}</b><span className="font-mono text-text-2">{item.state}</span></div>
                  <div className="mt-1 text-text-3">{item.runner} · {item.cadence}{item.due_at ? ` · 下次运行 ${shortTime(item.due_at)}` : ''}</div>
                  {item.error && <div className="mt-1 text-red-d" role="alert">{item.error}</div>}
                </div>
              ))}
            </div>
          )}
        </article>}

        {shows('starter') && <article className={card}>
          <div className="flex items-center gap-2"><Sparkles size={15} aria-hidden="true" /><h3 className="font-bold text-text">{t('operations.starter_title')}</h3></div>
          <p className="mt-1 text-xs leading-5 text-text-3">{t('operations.starter_note')}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-fill p-3 text-center text-[11px] text-text-3">
            <span><b className="block text-text">任务类型</b>发现或生成任务</span>
            <span><b className="block text-text">工作流</b>规定推进阶段</span>
            <span><b className="block text-text">技能</b>限定执行能力</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {templates.map((item) => {
              const copy = starterCopy(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`ops-starter-${item.id}`}
                  data-selected={selectedTemplate === item.id}
                  className="rounded-xl border border-border bg-bg p-3.5 text-left data-[selected=true]:border-(--accent) data-[selected=true]:bg-accent-t"
                  onClick={() => setSelectedTemplate(item.id)}
                >
                  <span className="flex items-center justify-between gap-3"><b className="text-sm text-text">{copy.title}</b><span className="rounded-full bg-fill px-2 py-1 text-[10px] font-semibold text-text-3">{riskLabel(item.risk)}</span></span>
                  <span className="mt-1.5 block text-xs leading-5 text-text-3">{copy.description}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-text-2">{t('operations.loop_id')}<input className={`${input} mt-1`} data-testid="ops-loop-id" value={loopId} onChange={(event) => setLoopId(event.target.value)} placeholder="例如 daily-review" /><span className="mt-1 block text-[10px] font-normal text-text-3">用于识别这项定时任务，只能使用小写字母、数字和短横线。</span></label>
            <label className="text-xs font-semibold text-text-2">{t('operations.skill_bundle')}<input className={`${input} mt-1`} data-testid="ops-skill-bundle" value={skillBundle} onChange={(event) => setSkillBundle(event.target.value)} placeholder="例如 backend" /><span className="mt-1 block text-[10px] font-normal text-text-3">决定运行时可使用哪些技能；不确定时可留空。</span></label>
            <label className="text-xs font-semibold text-text-2">{t('operations.workflow')}<input className={`${input} mt-1`} value={workflow} onChange={(event) => setWorkflow(event.target.value)} /><span className="mt-1 block text-[10px] font-normal text-text-3">每个被发现或生成的任务都会沿这个工作流推进。</span></label>
            <label className="text-xs font-semibold text-text-2">{t('operations.runner')}<select className={`${input} mt-1`} data-testid="ops-runner" value={runner} onChange={(event) => setRunner(event.target.value)}><option value="codex">Codex</option><option value="claude-code">Claude Code</option></select><span className="mt-1 block text-[10px] font-normal text-text-3">选择实际执行任务的代码代理。</span></label>
          </div>
          <button
            type="button"
            className={`${button} mt-3`}
            data-testid="ops-create-loop"
            disabled={busy !== null || template === null || !/^[a-z][a-z0-9-]{1,63}$/.test(loopId)}
            onClick={() => {
              if (template === null) return
              void perform('init', () => postLoopStarterInit({
                root, id: loopId, template: template.id, workflow, skill_bundle: skillBundle,
                runner, goal: template.goal,
              }), true)
            }}
          >{busy === 'init' ? t('operations.running') : t('operations.create_draft')}</button>
        </article>}

        {shows('run') && <article className={card}>
          <div className="flex items-center gap-2"><Play size={15} aria-hidden="true" /><h3 className="font-bold text-text">{t('operations.run_title')}</h3></div>
          <p className="mt-1 text-xs leading-5 text-text-3">{t('operations.run_note')}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-text-2">定时任务<select className={`${input} mt-1`} data-testid="ops-loop-selector" value={selector} onChange={(event) => setSelector(event.target.value)}>{loops.map((loop) => <option key={loop.id} value={loop.id}>{loop.id} · {loop.status}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-text-3">选择要上线前检查，或临时立即执行的定时任务。</span></label>
            <label className="text-xs font-semibold text-text-2">运行权限<select className={`${input} mt-1`} data-testid="ops-run-level" value={runLevel} onChange={(event) => setRunLevel(event.target.value as 'L1' | 'L2' | 'L3')}><option value="L1">L1 · 只生成报告</option><option value="L2">L2 · 提供辅助</option><option value="L3">L3 · 无人值守</option></select><span className="mt-1 block text-[10px] font-normal text-text-3">权限越高，可自动完成的动作越多。</span></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-2">
            <label><input type="checkbox" data-testid="ops-run-real" checked={runReal} onChange={(event) => setRunReal(event.target.checked)} /> {t('operations.real_run')}</label>
            {runReal && <label><input type="checkbox" data-testid="ops-confirm-run" checked={confirmRun} onChange={(event) => setConfirmRun(event.target.checked)} /> {t('operations.confirm_run')}</label>}
            {runReal && runLevel === 'L3' && <label><input type="checkbox" data-testid="ops-confirm-l3" checked={confirmL3} onChange={(event) => setConfirmL3(event.target.checked)} /> {t('operations.confirm_l3')}</label>}
            {runReal && <label><input type="checkbox" checked={runCommit} onChange={(event) => setRunCommit(event.target.checked)} /> {t('operations.commit')}</label>}
          </div>
          <button type="button" className={`${button} mt-3`} data-testid="ops-run-submit" disabled={busy !== null || selector === '' || !realRunReady} onClick={() => void perform('run', () => postLoopRun({ root, selector, dry_run: !runReal, level: runLevel, commit: runCommit, confirm_run: confirmRun, confirm_l3: confirmL3 }))}>{busy === 'run' ? t('operations.running') : runReal ? t('operations.run_now') : t('operations.preview')}</button>
        </article>}

        {shows('sync') && <article className={card}>
          <h3 className="font-bold text-text">{t('operations.sync_title')}</h3>
          <p className="mt-1 text-xs text-text-3">{t('operations.sync_note')}</p>
          <div className="mt-3 flex gap-2">
            <select className={input} value={syncMode} onChange={(event) => setSyncMode(event.target.value as 'dry-run' | 'apply')}><option value="dry-run">dry-run</option><option value="apply">apply</option></select>
            {syncMode === 'apply' && <label className="flex items-center gap-1.5 whitespace-nowrap text-xs"><input type="checkbox" checked={confirmSync} onChange={(event) => setConfirmSync(event.target.checked)} />{t('operations.confirm_apply')}</label>}
          </div>
          <button type="button" className={`${button} mt-3`} data-testid="ops-sync-submit" disabled={busy !== null || selector === '' || !syncReady} onClick={() => void perform('sync', () => postLoopSync({ root, loop_id: selector, mode: syncMode, confirm_apply: confirmSync }))}>{busy === 'sync' ? t('operations.running') : syncMode === 'apply' ? t('operations.apply') : t('operations.preview')}</button>
        </article>}

        {shows('triage') && <article className={card}>
          <h3 className="font-bold text-text">{t('operations.triage_title')}</h3>
          <p className="mt-1 text-xs text-text-3">{t('operations.triage_note')}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select className={input} value={triageSource} onChange={(event) => setTriageSource(event.target.value as typeof triageSource)}><option value="git-commits">git-commits</option><option value="loop-run-terminals">loop-run-terminals</option></select>
            <input className={input} value={triageModel} onChange={(event) => setTriageModel(event.target.value)} placeholder={t('operations.model_default')} />
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-text-2"><input className="mt-0.5" type="checkbox" data-testid="ops-confirm-triage" checked={confirmTriage} onChange={(event) => setConfirmTriage(event.target.checked)} />{t('operations.triage_confirm')}</label>
          <button type="button" className={`${button} mt-3`} data-testid="ops-triage-submit" disabled={busy !== null || !confirmTriage} onClick={() => void perform('triage', () => postTriage({ root, source: triageSource, model: triageModel, confirm_apply: confirmTriage }))}>{busy === 'triage' ? t('operations.running') : t('operations.triage_run')}</button>
        </article>}
      </div>

      {operationError && <p role="alert" className="mt-3 rounded-lg border border-red-b bg-red-t px-3 py-2 text-xs text-red-d">{operationError}</p>}
      {result && <OperationResultView response={result} onOpenChange={onOpenChange} />}
    </section>
  )
}
