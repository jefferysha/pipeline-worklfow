import { useT } from '../i18n'
import type { ChangeHistoryEntry } from '../api/client'
import type { EvidenceChip } from '../model/evidence'
import { Icon } from './Icon'
import { outputPresentation, outputValuePresentation } from './outputPresentation'

export interface EvidencePartProps {
  chip: EvidenceChip
  onCopy: (value: string) => void
}

export function StageChip({ chip, onCopy }: EvidencePartProps): JSX.Element {
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

export function BoxField({ chip, onCopy }: EvidencePartProps): JSX.Element {
  const { t } = useT()
  const presentation = outputPresentation(chip.key)
  const tone = chip.unset ? 'miss' : chip.tone === 'pass' ? 'pass' : chip.tone === 'fail' ? 'fail' : 'plain'
  const valueClass = tone === 'pass'
    ? 'font-bold text-green-d'
    : tone === 'fail'
      ? 'font-bold text-red-d'
      : tone === 'miss' ? 'text-text-3' : 'text-text'
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
          className={`inline cursor-pointer border-0 bg-transparent p-0 text-left font-mono text-xs transition-colors [overflow-wrap:anywhere] hover:text-accent-d ${valueClass}`}
          data-copy={chip.value}
          title={t('detail.copy_field', { field: chip.key })}
          onClick={() => onCopy(chip.value)}
        >
          {chip.value} <span className="inline-block align-[-2px]" aria-hidden="true"><Icon name="copy" size={11} /></span>
        </button>
      ) : (
        <div className={`text-xs [overflow-wrap:anywhere] ${valueClass}`}>
          {chip.unset ? t('evidence.unset') : outputValuePresentation(chip.value)}
        </div>
      )}
    </div>
  )
}

export function historyText(
  entry: ChangeHistoryEntry,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (entry.kind === 'transition' && entry.from && entry.to) {
    return `${entry.from} → ${entry.to}${entry.raw ? ` · ${entry.raw}` : ''}`
  }
  if (entry.kind === 'init') return t('detail.hist_init')
  if (entry.kind === 'import') return t('detail.hist_import')
  if (entry.kind === 'set' && entry.field) return t('detail.hist_set', { field: entry.field })
  return entry.raw ?? entry.kind
}
