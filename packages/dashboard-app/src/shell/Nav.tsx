import { useState } from 'react'
import { useT } from '../i18n'
import type { Lang } from '../i18n/translations'

export type View = 'inbox' | 'board' | 'settings' | 'loops' | 'afk' | 'workflows'

/** 一级导航项 —— 病灶③解法的显式枚举白名单，顶部恰 3 项。 */
export const PRIMARY_VIEWS: View[] = ['inbox', 'board', 'settings']

/**
 * GOAL.md F1 收尾：loop 设置 + AFK 工作台原本各自的一级导航入口收进一个"工作台"下拉分组，
 * 顶部导航因此恢复到 3 项（+1 个分组触发按钮）。skill 编辑器已经是设置页内的弹窗，不占导航项。
 * workflow 编辑器（E8 画布 UI，GOAL.md 2026-07-08 收编）是本分组第三项——`WorkflowEditorView`
 * 列表页 + `WorkflowCanvas` 画布页两者共用这一个入口，具体渲染哪个由 App.tsx 内部的
 * "当前打开的 workflow 名字"状态决定，本文件不关心。
 */
export const WORKBENCH_VIEWS: View[] = ['loops', 'afk', 'workflows']

export interface NavProject {
  root: string
  name: string
  count: number
}

interface NavProps {
  view: View
  onView: (v: View) => void
  lang: Lang
  onLang: (l: Lang) => void
  theme: 'light' | 'dark'
  onTheme: (t: 'light' | 'dark') => void
  connected: boolean
  /** 收件箱徽标数（在等你决定的 change 数，currentRoot 语境）。 */
  inboxCount: number
  /** D5 项目切换器：已注册项目列表（缺省/空 = 不渲染切换区，如加载首帧）。 */
  projects?: NavProject[]
  currentRoot?: string
  onRoot?: (root: string) => void
  /** 注册新项目入口（G18）；缺省则不渲染入口。 */
  onRegisterProject?: () => void
}

export function Nav({ view, onView, lang, onLang, theme, onTheme, connected, inboxCount, projects, currentRoot, onRoot, onRegisterProject }: NavProps): JSX.Element {
  const { t } = useT()
  const [workbenchOpen, setWorkbenchOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const workbenchActive = WORKBENCH_VIEWS.includes(view)
  const currentProject = projects?.find((p) => p.root === currentRoot)

  const selectWorkbenchView = (v: View) => {
    onView(v)
    setWorkbenchOpen(false)
  }

  return (
    <header className="nav" role="banner">
      <div className="nav__brand">{t('app.title')}</div>
      {projects && projects.length > 1 && (
        <div
          className="nav__project"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setProjectOpen(false)
          }}
        >
          <button
            type="button"
            className="nav__project-btn"
            data-testid="project-switcher"
            aria-haspopup="menu"
            aria-expanded={projectOpen}
            onClick={() => setProjectOpen((open) => !open)}
          >
            {currentProject?.name ?? currentRoot} ▾
          </button>
          {projectOpen && (
            <div className="nav__dropdown" role="menu" data-testid="project-menu">
              {projects.map((p) => (
                <button
                  key={p.root}
                  type="button"
                  role="menuitem"
                  data-testid={`project-item-${p.name}`}
                  className={p.root === currentRoot ? 'nav__dropdown-item nav__dropdown-item--active' : 'nav__dropdown-item'}
                  onClick={() => {
                    onRoot?.(p.root)
                    setProjectOpen(false)
                  }}
                >
                  {p.name}{p.count > 0 ? ` · ${p.count}` : ''}
                </button>
              ))}
              {onRegisterProject && (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="project-register"
                  className="nav__dropdown-item"
                  onClick={() => {
                    onRegisterProject()
                    setProjectOpen(false)
                  }}
                >
                  {t('nav.project_register')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {projects && projects.length === 1 && (
        <>
          <span className="nav__project-label" data-testid="project-label">{projects[0]!.name}</span>
          {onRegisterProject && (
            <button type="button" className="nav__tool" data-testid="project-register" onClick={onRegisterProject}>
              ＋
            </button>
          )}
        </>
      )}
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
        <div
          className="nav__group"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setWorkbenchOpen(false)
          }}
        >
          <button
            type="button"
            data-testid="nav-workbench"
            aria-haspopup="menu"
            aria-expanded={workbenchOpen}
            aria-current={workbenchActive ? 'page' : undefined}
            className={workbenchActive ? 'nav__item nav__item--active' : 'nav__item'}
            onClick={() => setWorkbenchOpen((open) => !open)}
          >
            {t('nav.workbench')}
          </button>
          {workbenchOpen && (
            <div className="nav__dropdown" role="menu" data-testid="workbench-menu">
              {WORKBENCH_VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="menuitem"
                  data-testid={`nav-${v}`}
                  aria-current={view === v ? 'page' : undefined}
                  className={
                    view === v ? 'nav__dropdown-item nav__dropdown-item--active' : 'nav__dropdown-item'
                  }
                  onClick={() => selectWorkbenchView(v)}
                >
                  {t(`nav.${v}`)}
                </button>
              ))}
            </div>
          )}
        </div>
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
