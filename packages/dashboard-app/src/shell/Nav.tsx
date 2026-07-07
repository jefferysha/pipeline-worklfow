import { useT } from '../i18n'
import type { Lang } from '../i18n/translations'

export type View = 'inbox' | 'board' | 'settings' | 'loops'

/**
 * 一级导航项 —— 病灶③解法的显式枚举白名单，当前 4 项：收件箱 / 看板 / 设置 / loops。
 * loop 设置治理计划直接加了独立入口（工程简单、可独立验收）；GOAL.md F1 要求最终把
 * loops/afk 等工作台功能归并进一个"工作台"下拉分组（顶部仍收敛回 3 项）——那是后续一个
 * 很小的收尾任务，这里先允许 4 项。流量代理/运行时会话等其余 debug 工具仍不在此列。
 */
export const PRIMARY_VIEWS: View[] = ['inbox', 'board', 'settings', 'loops']

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
