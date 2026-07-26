import { Square } from 'lucide-react'
import type { PlannedTransition } from '../model/events'
import { plannedTransition } from '../model/events'
import { missingGateArtifacts } from '../model/progressModel'
import type { SessionLink } from '../api/client'
import { shellQuote } from '../shared/shellQuote'
import {
  BTN_GO_CLS,
  BTN_NEG_CLS,
  fieldStr,
  stepLabel,
  type FlatRow,
  type Tr,
} from './progressViewModel'

export interface ProgressActionsProps {
  row: FlatRow
  busy: boolean
  sessionLink?: SessionLink
  t: Tr
  onTransition: (root: string, name: string, transition: PlannedTransition) => void
  onKill: (root: string, name: string) => void
  onToast?: (message: string) => void
}

export function ProgressActions({
  row,
  busy,
  sessionLink,
  t,
  onTransition,
  onKill,
  onToast,
}: ProgressActionsProps): JSX.Element | null {
  const name = row.row.change.name
  const testId = (action: string): string => `prg9-dw-${action}-${name}`
  if (row.row.state === 'gate') {
    const rules = row.rules
    if (!rules) return null
    const transitions = (rules.transitions[row.row.change.phase] ?? [])
      .map((edge) => plannedTransition(rules, row.row.change.phase, edge.to))
      .filter((transition): transition is PlannedTransition => transition !== null)
    const forward = transitions.filter((transition) => !transition.backward)
    const backward = transitions.filter((transition) => transition.backward)
    if (transitions.length === 0) return null
    return (
      <>
        {forward.map((transition, index) => (
          <button
            key={`forward-${transition.event}`}
            type="button"
            className={BTN_GO_CLS}
            data-testid={index === 0 ? testId('pass') : testId(`fw-${transition.event}`)}
            disabled={busy}
            onClick={() => onTransition(row.row.root, name, transition)}
          >
            {index === 0
              ? <>→ {t('progress.act_pass_to', { to: stepLabel(transition.to, rules.labelByStep, t) })}</>
              : t('inbox.act_forward', { to: transition.event })}
          </button>
        ))}
        {backward.map((transition, index) => (
          <button
            key={`backward-${transition.event}`}
            type="button"
            className={BTN_NEG_CLS}
            data-testid={index === 0 ? testId('reject') : testId(`bw-${transition.event}`)}
            disabled={busy}
            onClick={() => onTransition(row.row.root, name, transition)}
          >
            {t('inbox.act_backward', { to: stepLabel(transition.to, rules.labelByStep, t) })}
          </button>
        ))}
      </>
    )
  }
  if (row.row.state === 'failed') {
    const rerun = `tenon afk enqueue ${shellQuote(name)}`
    const worktree = fieldStr(row.row.change, 'automation_worktree')
    const chip = sessionLink?.found && sessionLink.resumeCmd
      ? { label: t('progress.cmd_resume'), command: sessionLink.resumeCmd }
      : row.cancelled
        ? { label: t('progress.cmd_rerun_cxl'), command: rerun }
        : worktree !== ''
          ? { label: t('progress.cmd_takeover'), command: `cd ${shellQuote(worktree)}` }
          : { label: t('progress.cmd_rerun'), command: rerun }
    return (
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-2 rounded-[7px] border border-code-border bg-code-bg px-2.5 py-[5px] text-left text-xs text-text-2 hover:border-(--accent)"
        data-testid={testId('cmd')}
        title={chip.command}
        aria-label={`${chip.label}：${chip.command}`}
        onClick={() => {
          void navigator.clipboard?.writeText(chip.command).then(() => {
            onToast?.(t('detail.copied', { value: chip.command }))
          })
        }}
      >
        {chip.label}
        <span className="truncate font-mono">{chip.command}</span>
      </button>
    )
  }
  if (row.row.state === 'running') {
    const automation = fieldStr(row.row.change, 'automation')
    if (row.row.change.terminalActivity !== undefined && automation !== 'running') return null
    return (
      <button
        type="button"
        className={BTN_NEG_CLS}
        data-testid={testId('kill')}
        disabled={busy || automation !== 'running'}
        onClick={() => onKill(row.row.root, name)}
      >
        <Square className="h-3 w-3" aria-hidden="true" /> {t('progress.act_kill')}
      </button>
    )
  }
  if (row.row.state === 'agent') {
    const missing = missingGateArtifacts(row.row.change, row.rules)
    return missing.length === 0 ? null : (
      <span className="text-xs text-text-3" data-testid={`prg9-note-${name}`}>
        {t('progress.note_agent_missing', { fields: missing.join(' ') })}
      </span>
    )
  }
  return null
}
