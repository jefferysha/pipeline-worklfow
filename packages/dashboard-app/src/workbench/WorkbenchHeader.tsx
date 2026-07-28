import { ChevronDown, Layers3 } from 'lucide-react'
import { useT } from '../i18n'
import type { WbWorkflowDef } from './workbenchDefinition'
import { BTN_DANGER, BTN_GHOST, BTN_SOLID, ERR_NOTE, PILL } from './workbenchStyles'

type SaveStatus = { kind: 'idle' | 'ok' } | { kind: 'error'; errors: string[] }

export function WorkbenchHeader(props: {
  workflowName: string | null
  currentStages: number | null
  menuOpen: boolean
  menuNames: string[]
  stagesCountOf: (name: string) => number | null
  readonly: boolean
  def: WbWorkflowDef | null
  dirty: boolean
  saving: boolean
  saveStatus: SaveStatus
  namesError: string | null
  defError: string | null
  onMenuOpen: (open: boolean) => void
  onSwitch: (name: string) => void
  onCreate: (mode: 'new' | 'copy') => void
  onDelete: () => void
  onGovernance: () => void
  onSave: () => void
}): JSX.Element {
  const { t } = useT()
  return <>
    <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="relative">
        <button className="group inline-flex min-h-14 min-w-[280px] cursor-pointer items-center gap-3 rounded-xl border border-accent-b bg-accent-t/45 px-3.5 text-left transition hover:border-(--accent) hover:bg-accent-t" data-testid="wb-wf-btn" aria-haspopup="menu" aria-expanded={props.menuOpen} onClick={() => props.onMenuOpen(!props.menuOpen)}>
          <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-(--accent) text-btn-fg shadow-sm"><Layers3 className="h-4.5 w-4.5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold tracking-[.08em] text-accent-d uppercase">当前工作流</span><span className="mt-0.5 block truncate text-[17px] font-extrabold tracking-[-0.01em] text-text">{props.workflowName ?? '…'}</span></span>
          {props.currentStages != null && <span className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-text-2 shadow-sm">{t('workbench.wf_stages', { n: props.currentStages })}</span>}
          <ChevronDown className="h-4 w-4 flex-none text-text-3 transition-transform group-aria-expanded:rotate-180" aria-hidden="true" />
        </button>
        {props.menuOpen && <div className="absolute top-[calc(100%+6px)] left-0 z-40 min-w-[238px] rounded-lg border border-border bg-card p-1.5 shadow-md" role="menu" aria-label={t('workbench.wf_menu_label')}>
          {props.menuNames.map((name) => {
            const count = props.stagesCountOf(name)
            return <button key={name} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left font-mono text-[13px] text-text-2 transition-colors hover:bg-fill data-on:bg-fill-2 data-on:font-semibold data-on:text-text" role="menuitem" data-on={name === props.workflowName ? '' : undefined} data-testid={`wb-wf-item-${name}`} onClick={() => props.onSwitch(name)}><span>{name}</span>{count != null && <span className="ml-auto font-sans text-xs text-text-3">{t('workbench.wf_stages', { n: count })}</span>}</button>
          })}
        </div>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('workbench.workflow_actions')}>
        <button className={BTN_GHOST} data-testid="wb-workflow-new" onClick={() => props.onCreate('new')}>{t('workbench.workflow_new')}</button>
        <button className={BTN_GHOST} data-testid="wb-workflow-copy" onClick={() => props.onCreate('copy')} disabled={!props.def} title={props.readonly ? '保留系统默认流程的阶段与 Skill，创建一个可编辑副本' : '基于当前配置创建另一条工作流'}>{props.readonly ? '创建可编辑副本' : '另存副本'}</button>
        {!props.readonly && <button className={BTN_DANGER} data-testid="wb-workflow-delete" onClick={props.onDelete} disabled={!props.workflowName}>{t('workbench.workflow_delete')}</button>}
        <button hidden tabIndex={-1} aria-hidden="true" data-testid="wb-governance-open" onClick={props.onGovernance} disabled={!props.def}>运行治理</button>
      </div>
      <span className="flex-1" />
      {props.readonly ? <span className={`${PILL} bg-fill-2 text-text-3`} data-testid="wb-ro-pill">{t('workbench.readonly_pill')}</span> : <>
        {props.dirty && <span className={`${PILL} border border-dashed border-border-2 bg-fill text-text-2`} data-testid="wb-dirty" role="status" aria-live="polite">{t('workbench.dirty_badge')}</span>}
        {props.saveStatus.kind === 'ok' && !props.dirty && <span className={`${PILL} bg-green-t text-green-d`} role="status" aria-live="polite" data-testid="wb-save-ok">{t('workbench.save_success')}</span>}
        {props.saveStatus.kind === 'error' && <span className={`${PILL} bg-red-t text-red-d`} role="alert" data-testid="wb-save-error">{t('workbench.save_error_pill')}</span>}
        <button className={BTN_SOLID} data-testid="wb-save" onClick={props.onSave} disabled={!props.dirty || props.saving}>{t('workbench.save')}</button>
      </>}
      {props.def?.openspecContract === 'required' && <span className={`${PILL} border border-accent-b bg-accent-t text-accent-d`} data-testid="wb-openspec-contract">{t('workbench.openspec_contract')}</span>}
      {props.def?.documentContract !== undefined && <span className={`${PILL} border border-accent-b bg-accent-t text-accent-d`} data-testid="wb-document-contract">{t('workbench.document_contract')}</span>}
    </div>
    {props.saveStatus.kind === 'error' && <ul className="mb-3.5 list-none rounded-md border border-red-b bg-red-t px-3 py-2.5" role="alert" data-testid="wb-save-errors">{props.saveStatus.errors.map((error) => <li key={error} className="font-mono text-[12.5px] leading-[1.6] text-red-d">{error}</li>)}</ul>}
    {props.namesError && <p className={ERR_NOTE} role="alert">{props.namesError}</p>}
    {props.defError && <p className={ERR_NOTE} role="alert">{props.defError}</p>}
  </>
}
