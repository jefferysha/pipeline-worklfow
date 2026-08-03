import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, Layers3, ShieldCheck } from 'lucide-react'
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
  trackControls: ReactNode
}): JSX.Element {
  const { t } = useT()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const openFocusRef = useRef<'current' | 'first' | 'last'>('current')

  function menuItems(): HTMLButtonElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
  }

  function focusMenuItem(target: 'current' | 'first' | 'last' | number): void {
    const items = menuItems()
    if (items.length === 0) return
    const index = typeof target === 'number'
      ? target
      : target === 'last'
        ? items.length - 1
        : target === 'current'
          ? Math.max(0, props.menuNames.indexOf(props.workflowName ?? ''))
          : 0
    items[Math.min(Math.max(index, 0), items.length - 1)]?.focus()
  }

  useEffect(() => {
    if (!props.menuOpen) return
    focusMenuItem(openFocusRef.current)
    openFocusRef.current = 'current'
  }, [props.menuOpen])

  function openMenu(focus: 'current' | 'first' | 'last' = 'current'): void {
    openFocusRef.current = focus
    props.onMenuOpen(true)
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    openMenu(event.key === 'ArrowUp' ? 'last' : 'current')
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const items = menuItems()
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = index < 0 || index === items.length - 1 ? 0 : index + 1
    if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = items.length - 1
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onMenuOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      props.onMenuOpen(false)
      return
    }
    if (next === null) return
    event.preventDefault()
    focusMenuItem(next)
  }

  return <>
    <div className="mb-4 rounded-2xl border border-border bg-card p-3 shadow-sm" data-testid="wb-controls">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5" data-testid="wb-workflow-controls">
      <div className="relative">
        <button ref={triggerRef} className="group inline-flex min-h-10 min-w-[220px] max-w-full cursor-pointer items-center gap-2.5 rounded-xl border border-accent-b bg-accent-t/45 px-3.5 text-left outline-none transition hover:border-(--accent) hover:bg-accent-t focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-card" data-testid="wb-wf-btn" aria-haspopup="menu" aria-expanded={props.menuOpen} onKeyDown={onTriggerKeyDown} onClick={() => props.menuOpen ? props.onMenuOpen(false) : openMenu()}>
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-(--accent) text-btn-fg shadow-sm"><Layers3 className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-[9px] font-bold tracking-[.08em] text-accent-d uppercase">{t('workbench.current_workflow')}</span><span className="block truncate text-[14px] font-extrabold tracking-[-0.01em] text-text">{props.workflowName ?? '…'}</span></span>
          {props.currentStages != null && <span className="rounded-full bg-card px-2 py-1 text-[11px] font-semibold text-text-2 shadow-sm">{t('workbench.wf_stages', { n: props.currentStages })}</span>}
          <ChevronDown className="h-4 w-4 flex-none text-text-3 transition-transform group-aria-expanded:rotate-180" aria-hidden="true" />
        </button>
        {props.menuOpen && <div ref={menuRef} className="absolute top-[calc(100%+6px)] left-0 z-40 min-w-[238px] rounded-lg border border-border bg-card p-1.5 shadow-md" role="menu" aria-label={t('workbench.wf_menu_label')} onKeyDown={onMenuKeyDown}>
          {props.menuNames.map((name) => {
            const count = props.stagesCountOf(name)
            return <button key={name} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left font-mono text-[13px] text-text-2 transition-colors hover:bg-fill data-on:bg-fill-2 data-on:font-semibold data-on:text-text" role="menuitem" data-on={name === props.workflowName ? '' : undefined} data-testid={`wb-wf-item-${name}`} onClick={() => props.onSwitch(name)}><span>{name}</span>{count != null && <span className="ml-auto font-sans text-xs text-text-3">{t('workbench.wf_stages', { n: count })}</span>}</button>
          })}
        </div>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('workbench.workflow_actions')}>
        <button className={BTN_GHOST} data-testid="wb-workflow-new" onClick={() => props.onCreate('new')} disabled={props.saving}>{t('workbench.workflow_new')}</button>
        <button className={BTN_GHOST} data-testid="wb-workflow-copy" onClick={() => props.onCreate('copy')} disabled={!props.def || props.saving} title={t(props.readonly ? 'workbench.workflow_copy_readonly_title' : 'workbench.workflow_copy_editable_title')}>{t(props.readonly ? 'workbench.workflow_copy_readonly' : 'workbench.workflow_copy_editable')}</button>
        {!props.readonly && <button className={BTN_DANGER} data-testid="wb-workflow-delete" onClick={props.onDelete} disabled={!props.workflowName || props.saving}>{t('workbench.workflow_delete')}</button>}
        <button className={BTN_GHOST} data-testid="wb-governance-open" onClick={props.onGovernance} disabled={!props.def}>
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {t('workbench.gov_title')}
        </button>
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
      <div className="mt-3 min-w-0 border-t border-border pt-3" data-testid="wb-track-context">
        {props.trackControls}
      </div>
    </div>
    {props.saveStatus.kind === 'error' && <ul className="mb-3.5 list-none rounded-md border border-red-b bg-red-t px-3 py-2.5" role="alert" data-testid="wb-save-errors">{props.saveStatus.errors.map((error) => <li key={error} className="font-mono text-[12.5px] leading-[1.6] text-red-d">{error}</li>)}</ul>}
    {props.namesError && <p className={ERR_NOTE} role="alert">{props.namesError}</p>}
    {props.defError && <p className={ERR_NOTE} role="alert">{props.defError}</p>}
  </>
}
