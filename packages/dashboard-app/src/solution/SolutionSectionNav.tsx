import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { cn } from '../lib/utils'
import { solutionSectionId, solutionSections, type SolutionSection } from './solutionModel'

function sectionFromHash(): SolutionSection | null {
  if (typeof window === 'undefined') return null
  return solutionSections.find((section) => window.location.hash === `#${solutionSectionId(section)}`) ?? null
}

export function SolutionSectionNav(): JSX.Element {
  const { t } = useT()
  const [currentSection, setCurrentSection] = useState<SolutionSection | null>(sectionFromHash)

  useEffect(() => {
    const syncHash = (): void => setCurrentSection(sectionFromHash())
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

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
              aria-current={currentSection === section ? 'location' : undefined}
              className={cn(
                'flex min-h-11 items-center whitespace-nowrap rounded-xl border border-transparent px-3 text-xs font-semibold text-text-2 outline-none transition-colors motion-reduce:transition-none hover:border-border hover:bg-fill hover:text-text focus-visible:border-(--accent) focus-visible:ring-2 focus-visible:ring-(--ring-blue)',
                currentSection === section && 'border-border bg-fill text-text shadow-xs',
              )}
            >
              {t(`solution.sections.${section}_eyebrow`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
