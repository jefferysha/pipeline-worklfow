import { useCallback, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import type { Lang } from '../i18n/translations'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

gsap.registerPlugin(useGSAP)

/**
 * v9-flowdeck（收件箱退役）：IA 收敛两视图——进度 / 工作台。交互真相源
 * design-demos/v9-flowdeck.html 顶栏（导航恰 2 项，待拍板红徽标挂在「进度」项上）。
 * 收件箱不再是独立视图：进度是唯一在制面（单列表看所有在制，需操作行高亮）；
 * 更早的「工作台下拉分组（loops/afk/workflows）」与 nav-board/nav-settings 随 T17 退役。
 */
export type View = 'progress' | 'workbench'

/** 一级导航项 —— 显式枚举白名单，顶部恰 2 项（demo v9 顶栏口径）。 */
export const PRIMARY_VIEWS: View[] = ['progress', 'workbench']

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
  /** 待拍板徽标数（在等你决定的 change 数，currentRoot 语境）——收件箱退役后挂在「进度」导航项上。 */
  decisionCount: number
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
  decisionCount,
  projects,
  currentRoot,
  onRoot,
  onUnregister,
}: NavProps): JSX.Element {
  const { t } = useT()
  const [projectOpen, setProjectOpen] = useState(false)
  const [pendingUnregister, setPendingUnregister] = useState<NavProject | null>(null)
  const projRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // v8-A 意见①：关=快出（短补间后卸载）。reduced-motion / 无 matchMedia（jsdom/极老内核）直接卸载，
  // 测试与降级路径都是同步的；只有明确 no-preference 才走 120ms 出场。
  const closeMenu = useCallback(() => {
    const el = menuRef.current
    const canAnimate =
      el !== null &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    if (!canAnimate) {
      setProjectOpen(false)
      return
    }
    gsap.to(el, {
      autoAlpha: 0,
      scale: 0.97,
      y: -3,
      duration: 0.12,
      ease: 'power1.in',
      onComplete: () => setProjectOpen(false),
    })
  }, [])

  // 开=scale .96→1 + y -4→0 + 行 stagger .03（demo v8 .proj-menu 形态）；gsap.matchMedia 全包，
  // reduce 分支直显终态（不放补间）——姿势沿 ProgressView.tsx 先例（registerPlugin/useGSAP/matchMedia）。
  useGSAP(
    () => {
      if (!projectOpen) return
      const el = menuRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          if (Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)) return // 直显即终态
          gsap
            .timeline()
            .fromTo(
              el,
              { autoAlpha: 0, scale: 0.96, y: -4, transformOrigin: 'top left' },
              { autoAlpha: 1, scale: 1, y: 0, duration: 0.18, ease: 'power2.out' },
            )
            .fromTo(
              el.querySelectorAll('.nav8-row, .nav8-foot'),
              { autoAlpha: 0, y: -4 },
              { autoAlpha: 1, y: 0, duration: 0.16, ease: 'power2.out', stagger: 0.03 },
              '<0.04',
            )
        },
      )
    },
    { scope: projRef, dependencies: [projectOpen], revertOnUpdate: true },
  )
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
          ref={projRef}
          className="nav__project"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) closeMenu()
          }}
        >
          <button
            type="button"
            className="nav__project-btn"
            data-testid="project-switcher"
            aria-haspopup="menu"
            aria-expanded={projectOpen}
            onClick={() => (projectOpen ? closeMenu() : setProjectOpen(true))}
          >
            {switcherLabel}
            <span className="nav8-chev" aria-hidden="true">▾</span>
          </button>
          {projectOpen && (
            <div ref={menuRef} className="nav8-menu" role="menu" data-testid="project-menu">
              <div className={currentRoot === '' ? 'nav8-row nav8-row--on' : 'nav8-row'}>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="project-item-all"
                  className="nav8-item"
                  onClick={() => {
                    onRoot?.('')
                    setProjectOpen(false)
                  }}
                >
                  <span className="nav8-dia" aria-hidden="true">◈</span>
                  <span className="nav8-name">{t('nav.project_all')}</span>
                  {aggregateCount > 0 && <span className="nav8-n">{aggregateCount}</span>}
                </button>
              </div>
              {projects.map((p) => (
                <div key={p.root} className={p.root === currentRoot ? 'nav8-row nav8-row--on' : 'nav8-row'}>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`project-item-${p.name}`}
                    className="nav8-item"
                    onClick={() => {
                      onRoot?.(p.root)
                      setProjectOpen(false)
                    }}
                  >
                    <span className="nav8-name">{p.name}</span>
                    {p.count > 0 && <span className="nav8-n">{p.count}</span>}
                  </button>
                  {onUnregister && (
                    <button
                      type="button"
                      className="nav8-unreg"
                      data-testid={`project-unregister-${p.name}`}
                      title={t('nav.project_unregister_aria', { name: p.name })}
                      aria-label={t('nav.project_unregister_aria', { name: p.name })}
                      onClick={() => {
                        setProjectOpen(false)
                        setPendingUnregister(p)
                      }}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </div>
              ))}
              <p className="nav8-foot">{t('nav.project_menu_hint')}</p>
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
            {v === 'progress' && decisionCount > 0 && (
              <span className="nav__badge" data-testid="progress-badge">
                {decisionCount}
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
