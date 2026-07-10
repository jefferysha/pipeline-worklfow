import { useState } from 'react'
import { useT } from '../i18n'
import type { Lang } from '../i18n/translations'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

/**
 * T17（计划 2026-07-11-v5-interaction-rebuild）：IA 收敛三视图——收件箱 / 进度 / 工作台。
 * 交互真相源 design-demos/v5-progress-workbench.html 顶栏（#mainNav 恰 3 项，收件箱带计数）。
 * 旧的「工作台下拉分组（loops/afk/workflows）」与 nav-board/nav-settings 一并退役：能力分别
 * 收编进工作台（T12-T16）与进度（T10/T11），旧组件文件 T18 删除。
 */
export type View = 'inbox' | 'progress' | 'workbench'

/** 一级导航项 —— 显式枚举白名单，顶部恰 3 项（demo v5 顶栏口径）。 */
export const PRIMARY_VIEWS: View[] = ['inbox', 'progress', 'workbench']

export interface NavProject {
  root: string
  name: string
  count: number
  /**
   * 聚合计数用（D5/G19③ 聚合入口收编，Task 5）：false = 该项目当前不可达（root 不存在/
   * 不可读等），「全部项目」聚合总数不计入它的 count。缺省（未传）按 true 处理，兼容早期
   * 只关心单项目展示的调用方。
   */
  ok?: boolean
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
  /**
   * ''（空串）= 「全部项目」聚合语境——这是全应用聚合语境的唯一表示（Task 5 起，
   * App 状态持有；后续任务（视图侧的聚合渲染等）都消费这个约定）。
   */
  currentRoot?: string
  onRoot?: (root: string) => void
  /**
   * 注销项目（G18 `DELETE /api/projects` + 评审 P2-13 入口，Task 5；T17 决议#7 保留）：
   * 项目切换器每项 hover 区的「注销…」，用户在本组件内的 Dialog 确认后才调用，只传出 root——
   * 真正的网络调用/refresh/currentRoot 归属判断都是调用方（App）的职责。缺省则不渲染注销入口。
   *
   * 「注册项目」入口已随 T17 删除（决议#7）：pipeline init 会 best-effort 自动登记项目
   * （T2），dashboard 侧不再提供注册 UI；POST /api/projects 端点仅兼容保留。
   */
  onUnregister?: (root: string) => void
}

export function Nav({
  view,
  onView,
  lang,
  onLang,
  theme,
  onTheme,
  connected,
  inboxCount,
  projects,
  currentRoot,
  onRoot,
  onUnregister,
}: NavProps): JSX.Element {
  const { t } = useT()
  const [projectOpen, setProjectOpen] = useState(false)
  const [pendingUnregister, setPendingUnregister] = useState<NavProject | null>(null)
  const currentProject = projects?.find((p) => p.root === currentRoot)
  // 聚合项计数 = 各 ok 项目 change 总和（ok=false 的不可达项目不计入，D5/G19③ 拍板）。
  const aggregateCount = (projects ?? []).reduce((sum, p) => sum + (p.ok === false ? 0 : p.count), 0)
  const switcherLabel = currentRoot === '' ? t('nav.project_all') : currentProject?.name ?? currentRoot

  return (
    <header className="nav" role="banner">
      <div className="nav__brand">
        <span className="nav__brand-mark" aria-hidden="true">
          <Icon name="flow" size={15} />
        </span>
        {t('app.title')}
      </div>
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
            {switcherLabel} ▾
          </button>
          {projectOpen && (
            <div className="nav__dropdown" role="menu" data-testid="project-menu">
              <button
                type="button"
                role="menuitem"
                data-testid="project-item-all"
                className={currentRoot === '' ? 'nav__dropdown-item nav__dropdown-item--active' : 'nav__dropdown-item'}
                onClick={() => {
                  onRoot?.('')
                  setProjectOpen(false)
                }}
              >
                <span className="nav__dropdown-dia" aria-hidden="true">◈</span> {t('nav.project_all')}
                {aggregateCount > 0 && <span className="nav__dropdown-count">{aggregateCount}</span>}
              </button>
              {projects.map((p) => (
                <div key={p.root} className="nav__dropdown-row">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`project-item-${p.name}`}
                    className={p.root === currentRoot ? 'nav__dropdown-item nav__dropdown-item--active' : 'nav__dropdown-item'}
                    onClick={() => {
                      onRoot?.(p.root)
                      setProjectOpen(false)
                    }}
                  >
                    {p.name} {p.count > 0 && <span className="nav__dropdown-count">{p.count}</span>}
                  </button>
                  {onUnregister && (
                    <button
                      type="button"
                      className="nav__dropdown-unreg"
                      data-testid={`project-unregister-${p.name}`}
                      onClick={() => {
                        setProjectOpen(false)
                        setPendingUnregister(p)
                      }}
                    >
                      {t('nav.project_unregister')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {projects && projects.length === 1 && (
        <span className="nav__project-label" data-testid="project-label">{projects[0]!.name}</span>
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
          className="nav__tool nav__tool--icon"
          data-testid="theme-toggle"
          aria-label={t('common.theme_toggle')}
          onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>

      {pendingUnregister && (
        <Dialog
          title={t('nav.unregister_title', { name: pendingUnregister.name })}
          onClose={() => setPendingUnregister(null)}
          testid="unregister-confirm"
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setPendingUnregister(null)}>
                {t('nav.unregister_cancel')}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  const root = pendingUnregister.root
                  setPendingUnregister(null)
                  onUnregister?.(root)
                }}
              >
                {t('nav.unregister_confirm')}
              </button>
            </>
          }
        >
          <p className="dialog__desc">{t('nav.unregister_desc', { name: pendingUnregister.name })}</p>
        </Dialog>
      )}
    </header>
  )
}
