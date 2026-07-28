import { useEffect, useRef, useState } from 'react'
import { Bot, FolderKanban, GitBranch, Monitor, Moon, ScanLine, Settings, SlidersHorizontal, Sun, type LucideIcon } from 'lucide-react'
import { useT } from '../i18n'
import type { Lang } from '../i18n/translations'
import { Icon } from './Icon'

/**
 * 外壳左侧图标 rail（v10b `design-demos/v10b-railway-canvas.html` .rail 结构对位；配色一律走
 * token）。2026-07-15 外壳 IA 重构拍板：rail 放视图导航——项目 / 进度 / AFK / 工作台 / 机器（五枚
 * lucide 图标 + 小字）。「项目」既是 rail 首枚入口（点入 view='projects' 总览页），也仍由内容区
 * 项目总览直接承担自动发现与项目选择；rail 不重复展示当前项目名。
 *
 * 结构（自上而下）：logo 标（品牌名收进 title 悬浮）→ 分隔线 → 竖排导航项 项目/进度/AFK/工作台
 * （lucide 图标 + 小字，激活态沿 aria-current 变体，进度项挂待拍板红徽标、AFK 项挂待处置失败红
 * 徽标）→ 弹性空档 → 分隔线 → 底部单一「设置」入口；连接、主题和语言收进锚定浮层。
 * 窄屏（<720px）收为纯图标窄列。
 */
export type View = 'overview' | 'projects' | 'progress' | 'afk' | 'workbench' | 'machine'
export type ThemePreference = 'system' | 'light' | 'dark'

/** rail 竖排渲染的一级导航项——显式枚举白名单，顺序=项目/进度/AFK/工作台/机器。 */
export type RailView = 'projects' | 'progress' | 'afk' | 'workbench' | 'machine'
export const PRIMARY_VIEWS: RailView[] = ['projects', 'progress', 'afk', 'workbench', 'machine']

/** rail 导航项 lucide 图标：项目=看板文件夹、进度=流程节点、AFK=无人值守机器人、工作台=设置滑杆。 */
const VIEW_ICONS: Record<RailView, LucideIcon> = {
  projects: FolderKanban,
  progress: GitBranch,
  afk: Bot,
  workbench: SlidersHorizontal,
  machine: ScanLine,
}

interface NavProps {
  view: View
  onView: (v: View) => void
  lang: Lang
  onLang: (l: Lang) => void
  theme: ThemePreference
  onTheme: (t: ThemePreference) => void
  connected: boolean
  /** 待拍板徽标数（在等你决定的 change 数，currentRoot 语境）——收件箱退役后挂在「进度」导航项上。 */
  decisionCount: number
  /** AFK 待处置徽标数（schedulerHealth.failed，等你处置的失败数，currentRoot 语境）——挂在「AFK」导航项上，>0 才显。 */
  afkCount: number
}

// ── tailwind 类串（状态经 aria-current / data-* 属性挂 aria-*/data-* 变体，测试不断言视觉类名）──
/** rail 竖排按钮骨架（demo .railbtn 对位）：图标 + 小字纵排；窄屏收为纯图标。 */
const RAIL_BTN_CLS =
  'group relative flex w-[72px] cursor-pointer flex-col items-center gap-[3px] rounded-[10px] border border-transparent px-0.5 pb-1.5 pt-2 text-text-3 outline-none transition-colors motion-reduce:transition-none hover:bg-fill hover:text-text focus-visible:border-(--accent) focus-visible:ring-[3px] focus-visible:ring-(--ring-blue) max-[720px]:w-10 max-[720px]:px-0'
/** rail 按钮小字标签（demo .railbtn .lb 对位）；窄屏隐藏（textContent 仍在，仅视觉收起）。 */
const RAIL_LB_CLS = 'max-w-full truncate text-[11px] leading-[1.2] max-[720px]:hidden'
export function Nav({ view, onView, lang, onLang, theme, onTheme, connected, decisionCount, afkCount }: NavProps): JSX.Element {
  const { t } = useT()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsTriggerRef = useRef<HTMLButtonElement>(null)
  const settingsPanelRef = useRef<HTMLElement>(null)
  // 在线/离线 短标签：title 走既有 common.connected/common.offline 键；短标签内联双语。
  const connLabel = connected ? (lang === 'zh' ? '在线' : 'Live') : lang === 'zh' ? '离线' : 'Offline'
  const nextTheme: ThemePreference = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
  const themeLabel = theme === 'system' ? t('common.theme_system') : theme === 'dark' ? t('common.theme_dark') : t('common.theme_light')

  useEffect(() => {
    if (!settingsOpen) return
    const panel = settingsPanelRef.current
    const focusable = panel?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
    focusable?.[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
        event.preventDefault()
        setSettingsOpen(false)
        settingsTriggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [settingsOpen])

  return (
    <header
      className="sticky top-0 z-10 flex h-screen w-[84px] flex-none flex-col items-center gap-1 border-r border-border bg-card px-1.5 py-3 max-[720px]:w-14"
      role="banner"
    >
      {/* 品牌 logo 标（demo .rail .logo 对位）：品牌名收成图标，全名走 title 悬浮。 */}
      <button
        type="button"
        data-testid="nav-overview"
        aria-label={t('solution.nav_label')}
        aria-current={view === 'overview' ? 'page' : undefined}
        className="mb-1.5 grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-[11px] border border-transparent bg-ink text-ink-fg outline-none transition-colors motion-reduce:transition-none hover:bg-ink-hover focus-visible:border-(--accent) focus-visible:ring-[3px] focus-visible:ring-(--ring-blue) aria-[current=page]:border-(--accent)"
        title={t('solution.nav_label')}
        onClick={() => {
          setSettingsOpen(false)
          onView('overview')
        }}
      >
        <Icon name="flow" size={16} />
      </button>

      <div className="my-1.5 w-14 flex-none border-t border-border max-[720px]:w-9" aria-hidden="true" />

      <nav className="flex flex-col gap-1" aria-label="primary" data-testid="primary-nav">
        {PRIMARY_VIEWS.map((v) => {
          const IconCmp = VIEW_ICONS[v]
          return (
            <button
              key={v}
              type="button"
              data-testid={`nav-${v}`}
              aria-label={t(`nav.${v}`)}
              aria-current={view === v ? 'page' : undefined}
              title={t(`nav.${v}`)}
              className={`${RAIL_BTN_CLS} aria-[current=page]:border-border-2 aria-[current=page]:bg-fill aria-[current=page]:font-bold aria-[current=page]:text-text`}
              onClick={() => {
                setSettingsOpen(false)
                onView(v)
              }}
            >
              <IconCmp size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className={`${RAIL_LB_CLS} group-aria-[current=page]:text-(--accent)`}>{t(`nav.${v}`)}</span>
              {v === 'progress' && decisionCount > 0 && (
                <span
                  className="absolute -top-0.5 right-1.5 inline-block h-[17px] min-w-[17px] rounded-[9px] border border-red-b bg-red-t px-[5px] text-center font-mono text-[10.5px] font-bold leading-[17px] text-red-d max-[720px]:-right-1"
                  data-testid="progress-badge"
                >
                  {decisionCount}
                </span>
              )}
              {v === 'afk' && afkCount > 0 && (
                <span
                  className="absolute -top-0.5 right-1.5 inline-block h-[17px] min-w-[17px] rounded-[9px] border border-red-b bg-red-t px-[5px] text-center font-mono text-[10.5px] font-bold leading-[17px] text-red-d max-[720px]:-right-1"
                  data-testid="afk-badge"
                >
                  {afkCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="flex-1" aria-hidden="true" />
      <div className="my-1.5 w-14 flex-none border-t border-border max-[720px]:w-9" aria-hidden="true" />

      <div className="relative flex flex-none flex-col items-center">
        <button
          type="button"
          ref={settingsTriggerRef}
          data-testid="nav-settings"
          aria-label={t('common.settings')}
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          className={`${RAIL_BTN_CLS} aria-[expanded=true]:border-border-2 aria-[expanded=true]:bg-fill aria-[expanded=true]:font-bold aria-[expanded=true]:text-text`}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className={RAIL_LB_CLS}>{t('common.settings')}</span>
        </button>

        {settingsOpen && (
          <section
            ref={settingsPanelRef}
            role="dialog"
            aria-modal="false"
            aria-label={t('common.settings')}
            data-testid="nav-settings-panel"
            className="absolute bottom-0 left-[calc(100%+12px)] z-50 w-[248px] rounded-2xl border border-border bg-card/95 p-3.5 text-left shadow-[0_18px_55px_rgba(15,23,42,.2)] backdrop-blur-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3">
              <h2 className="text-sm font-bold text-text">{t('common.settings')}</h2>
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-2"
                data-on={connected ? 'true' : 'false'}
                title={connected ? t('common.connected') : t('common.offline')}
                data-testid="conn-indicator"
              >
                <span className={connected ? 'h-2 w-2 rounded-full bg-green' : 'h-2 w-2 rounded-full bg-red'} aria-hidden="true" />
                {connLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 text-xs font-semibold text-text-2 outline-none transition-colors motion-reduce:transition-none hover:bg-fill focus-visible:border-(--accent) focus-visible:ring-[3px] focus-visible:ring-(--ring-blue)"
                data-testid="theme-toggle"
                aria-label={t('common.theme_toggle')}
                onClick={() => onTheme(nextTheme)}
              >
                {theme === 'system' ? <Monitor className="h-4 w-4" aria-hidden="true" /> : theme === 'dark' ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
                {themeLabel}
              </button>
              <button
                type="button"
                className="min-h-10 rounded-xl border border-border bg-bg px-3 text-xs font-semibold text-text-2 outline-none transition-colors motion-reduce:transition-none hover:bg-fill focus-visible:border-(--accent) focus-visible:ring-[3px] focus-visible:ring-(--ring-blue)"
                data-testid="lang-toggle"
                onClick={() => onLang(lang === 'zh' ? 'en' : 'zh')}
              >
                {lang === 'zh' ? t('common.switch_to_english') : t('common.switch_to_chinese')}
              </button>
            </div>
          </section>
        )}
      </div>
    </header>
  )
}
