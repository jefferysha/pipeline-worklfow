import { useT } from '../i18n'
import { solutionSectionId, solutionSections } from './solutionModel'

export function SolutionSectionNav(): JSX.Element {
  const { t } = useT()

  return (
    <nav
      aria-label={t('solution.nav_label')}
      className="sticky top-2 z-20 overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-card/90 shadow-sm backdrop-blur-xl"
      data-testid="solution-section-nav"
    >
      <ul className="flex min-w-max items-center gap-1 p-1.5">
        {solutionSections.map((section) => (
          <li key={section}>
            <a
              href={`#${solutionSectionId(section)}`}
              className="flex min-h-11 items-center whitespace-nowrap rounded-xl border border-transparent px-3 text-xs font-semibold text-text-2 outline-none transition-colors motion-reduce:transition-none hover:border-border hover:bg-fill hover:text-text focus-visible:border-(--accent) focus-visible:ring-2 focus-visible:ring-(--ring-blue)"
            >
              {t(`solution.sections.${section}_eyebrow`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
