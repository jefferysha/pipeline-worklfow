import { useT } from '../i18n'
import type { Lang } from '../i18n/translations'

export type View = 'inbox' | 'board' | 'settings'

/** 一级导航项 —— 病灶③解法：恒为 3 项（收件箱 / 看板 / 设置）。debug 工具不在此列。 */
export const PRIMARY_VIEWS: View[] = ['inbox', 'board', 'settings']

interface NavProps {
  view: View
  onView: (v: View) => void
  lang: Lang
  onLang: (l: Lang) => void
  theme: 'light' | 'dark'
  onTheme: (t: 'light' | 'dark') => void
  connected: boolean
  /** 收件箱徽标数（在等你决定的 change 数）。 */
  inboxCount: number
}

export function Nav({ view, onView, lang, onLang, theme, onTheme, connected, inboxCount }: NavProps): JSX.Element {
  const { t } = useT()
  return (
    <header className="nav" role="banner">
      <div className="nav__brand">{t('app.title')}</div>
      <nav className="nav__primary" aria-label="primary" data-testid="primary-nav">
        {PRIMARY_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`nav-${v}`}
            aria-current={view === v ? 'page' : undefined}
            className={view === v ? 'nav__item nav__item--active' : 'nav__item'}
            onClick={() => onView(v)}
          >
            {t(`nav.${v}`)}
            {v === 'inbox' && inboxCount > 0 && (
              <span className="nav__badge" data-testid="inbox-badge">
                {inboxCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="nav__tools">
        <span
          className={connected ? 'nav__conn nav__conn--on' : 'nav__conn'}
          title={connected ? t('common.connected') : t('common.offline')}
          data-testid="conn-indicator"
        >
          ●
        </span>
        <button
          type="button"
          className="nav__tool"
          data-testid="lang-toggle"
          onClick={() => onLang(lang === 'zh' ? 'en' : 'zh')}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
        <button
          type="button"
          className="nav__tool"
          data-testid="theme-toggle"
          aria-label={t('common.theme_toggle')}
          onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>
    </header>
  )
}
