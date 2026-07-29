import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Clock3, Play, RefreshCw, Sparkles } from 'lucide-react'
import {
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
import { formatApiError } from '../api/transport'
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

const STARTER_COPY_KEYS: Record<string, { title: string; description: string }> = {
  'pr-babysitter': { title: 'operations.starter_pr_babysitter_title', description: 'operations.starter_pr_babysitter_desc' },
  'daily-triage': { title: 'operations.starter_daily_triage_title', description: 'operations.starter_daily_triage_desc' },
  'ci-sweeper': { title: 'operations.starter_ci_sweeper_title', description: 'operations.starter_ci_sweeper_desc' },
  'post-merge-cleanup': { title: 'operations.starter_post_merge_cleanup_title', description: 'operations.starter_post_merge_cleanup_desc' },
  'dependency-sweeper': { title: 'operations.starter_dependency_sweeper_title', description: 'operations.starter_dependency_sweeper_desc' },
  'changelog-drafter': { title: 'operations.starter_changelog_drafter_title', description: 'operations.starter_changelog_drafter_desc' },
  'issue-triage': { title: 'operations.starter_issue_triage_title', description: 'operations.starter_issue_triage_desc' },
}

function starterCopy(item: AutomationStarterTemplate, t: (key: string) => string): { title: string; description: string } {
  const keys = STARTER_COPY_KEYS[item.id]
  return keys ? { title: t(keys.title), description: t(keys.description) } : { title: item.id, description: item.goal }
}

function riskLabel(value: string, t: (key: string) => string): string {
  if (value === 'low') return t('operations.risk_low')
  if (value === 'medium') return t('operations.risk_medium')
  if (value === 'high') return t('operations.risk_high')
  return value
}

export function OperationsPanel({ root, onToast, onOpenChange, activeTool, compact = false }: OperationsPanelProps): JSX.Element {
  const { lang, t } = useT()
  const [templates, setTemplates] = useState<AutomationStarterTemplate[]>([])
  const [loops, setLoops] = useState<WbLoopRow[]>([])
  const [cadence, setCadence] = useState<WbCadenceStatus | null>(null)
  const [loadError, setLoadError] = useState<unknown | null>(null)
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
  const [operationError, setOperationError] = useState<unknown | null>(null)
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const operationGeneration = useRef(0)
  const currentRoot = useRef(root)
  currentRoot.current = root
  const localeIdentity = useRef({ t, lang })
  localeIdentity.current = { t, lang }

  const clearRootScopedState = (): void => {
    setTemplates([])
    setLoops([])
    setCadence(null)
    setSelectedTemplate('')
    setLoopId('')
    setRunner('codex')
    setWorkflow('default')
    setSkillBundle('')
    setSelector('')
    setRunLevel('L1')
    setRunReal(false)
    setRunCommit(false)
    setConfirmRun(false)
    setConfirmL3(false)
    setSyncMode('dry-run')
    setConfirmSync(false)
    setTriageSource('git-commits')
    setTriageModel('')
    setConfirmTriage(false)
    setBusy(null)
    setResult(null)
    setOperationError(null)
    setLoadedRoot(null)
  }

  const reload = (): void => {
    const targetRoot = root
    const generation = ++loadGeneration.current
    setLoadError(null)
    void Promise.all([fetchAutomationStarters(targetRoot), fetchLoopsSnapshot(), fetchCadenceStatus(targetRoot)])
      .then(([nextTemplates, loopSnapshot, cadenceStatus]) => {
        if (generation !== loadGeneration.current || currentRoot.current !== targetRoot) return
        const nextLoops = loopSnapshot.rows.filter((loop) => loop.root === targetRoot)
        setTemplates(nextTemplates)
        setLoops(nextLoops)
        setCadence(cadenceStatus)
        setSelectedTemplate((current) => nextTemplates.some((item) => item.id === current) ? current : nextTemplates[0]?.id || '')
        setSelector((current) => nextLoops.some((item) => item.id === current) ? current : nextLoops[0]?.id || '')
        setLoadedRoot(targetRoot)
      })
      .catch((error: unknown) => {
        if (generation === loadGeneration.current && currentRoot.current === targetRoot) {
          setLoadError(error)
        }
      })
  }

  useEffect(() => {
    ++operationGeneration.current
    clearRootScopedState()
    reload()
    return () => {
      ++loadGeneration.current
      ++operationGeneration.current
    }
  }, [root])

  useEffect(() => {
    const loop = loops.find((item) => item.id === selector)
    if (loop) setRunLevel(loop.autonomy_level)
  }, [selector, loops])

  const template = useMemo(
    () => templates.find((item) => item.id === selectedTemplate) ?? null,
    [templates, selectedTemplate],
  )

  async function perform(kind: string, action: () => Promise<OperationResponse>, refresh = false): Promise<void> {
    const targetRoot = root
    const generation = ++operationGeneration.current
    setBusy(kind)
    setOperationError(null)
    setResult(null)
    try {
      const response = await action()
      if (generation !== operationGeneration.current || currentRoot.current !== targetRoot) return
      setResult(response)
      if (response.ok) {
        onToast?.(localeIdentity.current.t('operations.completed'))
        if (refresh) reload()
      }
    } catch (error) {
      if (generation === operationGeneration.current && currentRoot.current === targetRoot) {
        setOperationError(error)
      }
    } finally {
      if (generation === operationGeneration.current && currentRoot.current === targetRoot) {
        setBusy(null)
      }
    }
  }

  const rootReady = loadedRoot === root
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

      {loadError !== null && <p role="alert" className="mb-3 rounded-lg border border-red-b bg-red-t px-3 py-2 text-xs text-red-d">{formatApiError(loadError, t, { exposeServerDetail: lang === 'zh' })}</p>}

      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'lg:grid-cols-2'}`}>
        {shows('cadence') && <article className={`rounded-lg border border-border bg-fill/40 px-3.5 py-3 ${compact ? '' : 'lg:col-span-2'}`} data-testid="ops-cadence-status" data-enabled={cadence?.enabled === true}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Clock3 size={15} aria-hidden="true" /><h3 className="font-bold text-text">{t('operations.cadence_title')}</h3></div>
            <span className="rounded-full border border-border bg-bg px-2 py-1 font-mono text-[10.5px] text-text-3" role="status" aria-live="polite">
              {cadence === null ? t('operations.cadence_loading') : `${t('operations.cadence_poll', { seconds: cadence.poll_interval_ms / 1000 })} · ${cadence.running ? t('operations.cadence_running') : t('operations.cadence_online')}`}
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
                  <div className="mt-1 text-text-3">{item.runner} · {item.cadence}{item.due_at ? ` · ${t('operations.cadence_next', { time: shortTime(item.due_at, lang) })}` : ''}</div>
                  {item.error && <div className="mt-1 text-red-d" role="alert">{lang === 'zh' ? item.error : t('operations.cadence_loop_error')}</div>}
                </div>
              ))}
            </div>
          )}
        </article>}

        {shows('starter') && <article className={card}>
          <div className="flex items-center gap-2"><Sparkles size={15} aria-hidden="true" /><h3 className="font-bold text-text">{t('operations.starter_title')}</h3></div>
          <p className="mt-1 text-xs leading-5 text-text-3">{t('operations.starter_note')}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-fill p-3 text-center text-[11px] text-text-3">
            <span><b className="block text-text">{t('operations.starter_axis_type')}</b>{t('operations.starter_axis_type_note')}</span>
            <span><b className="block text-text">{t('operations.starter_axis_workflow')}</b>{t('operations.starter_axis_workflow_note')}</span>
            <span><b className="block text-text">{t('operations.starter_axis_skills')}</b>{t('operations.starter_axis_skills_note')}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {templates.map((item) => {
              const copy = starterCopy(item, t)
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`ops-starter-${item.id}`}
                  data-selected={selectedTemplate === item.id}
                  className="rounded-xl border border-border bg-bg p-3.5 text-left data-[selected=true]:border-(--accent) data-[selected=true]:bg-accent-t"
                  onClick={() => setSelectedTemplate(item.id)}
                >
                  <span className="flex items-center justify-between gap-3"><b className="text-sm text-text">{copy.title}</b><span className="rounded-full bg-fill px-2 py-1 text-[10px] font-semibold text-text-3">{riskLabel(item.risk, t)}</span></span>
                  <span className="mt-1.5 block text-xs leading-5 text-text-3">{copy.description}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-text-2">{t('operations.loop_id')}<input className={`${input} mt-1`} data-testid="ops-loop-id" value={loopId} onChange={(event) => setLoopId(event.target.value)} placeholder={t('operations.loop_id_placeholder')} /><span className="mt-1 block text-[10px] font-normal text-text-3">{t('operations.loop_id_help')}</span></label>
            <label className="text-xs font-semibold text-text-2">{t('operations.skill_bundle')}<input className={`${input} mt-1`} data-testid="ops-skill-bundle" value={skillBundle} onChange={(event) => setSkillBundle(event.target.value)} placeholder={t('operations.skill_bundle_placeholder')} /><span className="mt-1 block text-[10px] font-normal text-text-3">{t('operations.skill_bundle_help')}</span></label>
            <label className="text-xs font-semibold text-text-2">{t('operations.workflow')}<input className={`${input} mt-1`} value={workflow} onChange={(event) => setWorkflow(event.target.value)} /><span className="mt-1 block text-[10px] font-normal text-text-3">{t('operations.workflow_help')}</span></label>
            <label className="text-xs font-semibold text-text-2">{t('operations.runner')}<select className={`${input} mt-1`} data-testid="ops-runner" value={runner} onChange={(event) => setRunner(event.target.value)}><option value="codex">Codex</option><option value="claude-code">Claude Code</option></select><span className="mt-1 block text-[10px] font-normal text-text-3">{t('operations.runner_help')}</span></label>
          </div>
          <button
            type="button"
            className={`${button} mt-3`}
            data-testid="ops-create-loop"
            disabled={!rootReady || busy !== null || template === null || !/^[a-z][a-z0-9-]{1,63}$/.test(loopId)}
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
            <label className="text-xs font-semibold text-text-2">{t('operations.run_loop')}<select className={`${input} mt-1`} data-testid="ops-loop-selector" value={selector} onChange={(event) => setSelector(event.target.value)}>{loops.map((loop) => <option key={loop.id} value={loop.id}>{loop.id} · {loop.status}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-text-3">{t('operations.run_loop_help')}</span></label>
            <label className="text-xs font-semibold text-text-2">{t('operations.run_permission')}<select className={`${input} mt-1`} data-testid="ops-run-level" value={runLevel} onChange={(event) => setRunLevel(event.target.value as 'L1' | 'L2' | 'L3')}><option value="L1">{t('operations.run_permission_l1')}</option><option value="L2">{t('operations.run_permission_l2')}</option><option value="L3">{t('operations.run_permission_l3')}</option></select><span className="mt-1 block text-[10px] font-normal text-text-3">{t('operations.run_permission_help')}</span></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-2">
            <label><input type="checkbox" data-testid="ops-run-real" checked={runReal} onChange={(event) => setRunReal(event.target.checked)} /> {t('operations.real_run')}</label>
            {runReal && <label><input type="checkbox" data-testid="ops-confirm-run" checked={confirmRun} onChange={(event) => setConfirmRun(event.target.checked)} /> {t('operations.confirm_run')}</label>}
            {runReal && runLevel === 'L3' && <label><input type="checkbox" data-testid="ops-confirm-l3" checked={confirmL3} onChange={(event) => setConfirmL3(event.target.checked)} /> {t('operations.confirm_l3')}</label>}
            {runReal && <label><input type="checkbox" checked={runCommit} onChange={(event) => setRunCommit(event.target.checked)} /> {t('operations.commit')}</label>}
          </div>
          <button type="button" className={`${button} mt-3`} data-testid="ops-run-submit" disabled={!rootReady || busy !== null || selector === '' || !loops.some((loop) => loop.id === selector) || !realRunReady} onClick={() => void perform('run', () => postLoopRun({ root, selector, dry_run: !runReal, level: runLevel, commit: runCommit, confirm_run: confirmRun, confirm_l3: confirmL3 }))}>{busy === 'run' ? t('operations.running') : runReal ? t('operations.run_now') : t('operations.preview')}</button>
        </article>}

        {shows('sync') && <article className={card}>
          <h3 className="font-bold text-text">{t('operations.sync_title')}</h3>
          <p className="mt-1 text-xs text-text-3">{t('operations.sync_note')}</p>
          <div className="mt-3 flex gap-2">
            <select className={input} value={syncMode} onChange={(event) => setSyncMode(event.target.value as 'dry-run' | 'apply')}><option value="dry-run">dry-run</option><option value="apply">apply</option></select>
            {syncMode === 'apply' && <label className="flex items-center gap-1.5 whitespace-nowrap text-xs"><input type="checkbox" checked={confirmSync} onChange={(event) => setConfirmSync(event.target.checked)} />{t('operations.confirm_apply')}</label>}
          </div>
          <button type="button" className={`${button} mt-3`} data-testid="ops-sync-submit" disabled={!rootReady || busy !== null || selector === '' || !loops.some((loop) => loop.id === selector) || !syncReady} onClick={() => void perform('sync', () => postLoopSync({ root, loop_id: selector, mode: syncMode, confirm_apply: confirmSync }))}>{busy === 'sync' ? t('operations.running') : syncMode === 'apply' ? t('operations.apply') : t('operations.preview')}</button>
        </article>}

        {shows('triage') && <article className={card}>
          <h3 className="font-bold text-text">{t('operations.triage_title')}</h3>
          <p className="mt-1 text-xs text-text-3">{t('operations.triage_note')}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select className={input} value={triageSource} onChange={(event) => setTriageSource(event.target.value as typeof triageSource)}><option value="git-commits">git-commits</option><option value="loop-run-terminals">loop-run-terminals</option></select>
            <input className={input} value={triageModel} onChange={(event) => setTriageModel(event.target.value)} placeholder={t('operations.model_default')} />
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-text-2"><input className="mt-0.5" type="checkbox" data-testid="ops-confirm-triage" checked={confirmTriage} onChange={(event) => setConfirmTriage(event.target.checked)} />{t('operations.triage_confirm')}</label>
          <button type="button" className={`${button} mt-3`} data-testid="ops-triage-submit" disabled={!rootReady || busy !== null || !confirmTriage} onClick={() => void perform('triage', () => postTriage({ root, source: triageSource, model: triageModel, confirm_apply: confirmTriage }))}>{busy === 'triage' ? t('operations.running') : t('operations.triage_run')}</button>
        </article>}
      </div>

      {operationError !== null && <p role="alert" className="mt-3 rounded-lg border border-red-b bg-red-t px-3 py-2 text-xs text-red-d">{formatApiError(operationError, t, { exposeServerDetail: lang === 'zh' })}</p>}
      {result && <OperationResultView response={result} onOpenChange={onOpenChange} />}
    </section>
  )
}
