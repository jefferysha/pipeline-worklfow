import { useT } from '../i18n'

export function GovernanceRailHead(): JSX.Element {
  const { t } = useT()
  return (
    <div className="mx-0.5 mt-0.5 flex items-center gap-2.5">
      <span className="grid size-[23px] flex-none place-items-center rounded-[7px] bg-ink font-mono text-[12.5px] font-extrabold text-ink-fg" aria-hidden="true">L</span>
      <b className="text-[15.5px] font-[750] text-text">{t('workbench.gov_title')}</b>
      <span className="ml-auto font-mono text-[11.5px] text-text-3">{t('workbench.gov_per_root')}</span>
    </div>
  )
}
