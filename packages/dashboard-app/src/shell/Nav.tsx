import { useState } from 'react'
import { Bot, FolderKanban, GitBranch, Moon, ScanLine, Settings, SlidersHorizontal, Sun, type LucideIcon } from 'lucide-react'
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
 * 窄屏（<720px）切为底部导航并保留短标签，释放横向阅读空间。
 */
export type View = 'overview' | 'projects' | 'progress' | 'afk' | 'workbench' | 'machine'

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
  theme: 'light' | 'dark'
  onTheme: (t: 'light' | 'dark') => void
  connected: boolean
  /** 待拍板徽标数（在等你决定的 change 数，currentRoot 语境）——收件箱退役后挂在「进度」导航项上。 */
  decisionCount: number
  /** AFK 待处置徽标数（schedulerHealth.failed，等你处置的失败数，currentRoot 语境）——挂在「AFK」导航项上，>0 才显。 */
  afkCount: number
}

// ── tailwind 类串（状态经 aria-current / data-* 属性挂 aria-*/data-* 变体，测试不断言视觉类名）──
/** rail 竖排按钮骨架（demo .railbtn 对位）：图标 + 小字纵排；窄屏收为纯图标。 */
const RAIL_BTN_CLS =
  'group relative flex min-h-11 w-[72px] cursor-pointer flex-col items-center justify-center gap-[3px] rounded-xl border border-transparent px-1 py-1.5 text-text-3 outline-none transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:bg-fill hover:text-text focus-visible:border-(--accent) focus-visible:ring-[3px] focus-visible:ring-(--ring-blue) active:scale-[.98] motion-reduce:active:scale-100 max-[720px]:h-14 max-[720px]:min-w-11 max-[720px]:flex-1 max-[720px]:rounded-lg max-[720px]:px-0.5 max-[720px]:py-1'
/** rail / bottom-nav 按钮短标签；移动端也可见，避免纯图标入口依赖记忆。 */
const RAIL_LB_CLS = 'max-w-full truncate text-[11px] font-medium leading-[1.2] max-[720px]:text-[10px]'
export function Nav({ view, onView, lang, onLang, theme, onTheme, connected, decisionCount, afkCount }: NavProps): JSX.Element {
  const { t } = useT()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 在线/离线 短标签：title 走既有 common.connected/common.offline 键；短标签内联双语。
  const connLabel = connected ? (lang === 'zh' ? '在线' : 'Live') : lang === 'zh' ? '离线' : 'Offline'

  return (
    <header
      className="sticky top-0 z-40 flex h-screen w-[88px] flex-none flex-col items-center gap-1 border-r border-border bg-card/96 px-2 py-3 backdrop-blur-xl max-[720px]:fixed max-[720px]:bottom-0 max-[720px]:top-auto max-[720px]:h-[calc(72px+env(safe-area-inset-bottom))] max-[720px]:w-full max-[720px]:flex-row max-[720px]:items-start max-[720px]:gap-1 max-[720px]:border-r-0 max-[720px]:border-t max-[720px]:px-2 max-[720px]:pb-[env(safe-area-inset-bottom)] max-[720px]:pt-1.5"
      role="banner"
      data-testid="app-navigation"
      data-responsive="rail-to-bottom"
    >
      {/* 品牌 logo 标（demo .rail .logo 对位）：品牌名收成图标，全名走 title 悬浮。 */}
      <button
        type="button"
        data-testid="nav-overview"
        aria-label={t('solution.nav_label')}
        aria-current={view === 'overview' ? 'page' : undefined}
        className="mb-1.5 grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-xl border border-transparent bg-ink text-ink-fg outline-none transition-colors motion-reduce:transition-none hover:bg-ink-hover focus-visible:border-(--accent) focus-visible:ring-[3px] focus-visible:ring-(--ring-blue) aria-[current=page]:border-(--accent) max-[720px]:mb-0 max-[720px]:mt-1 max-[720px]:h-11 max-[720px]:w-11 max-[360px]:hidden"
        title={t('solution.nav_label')}
        onClick={() => {
          setSettingsOpen(false)
          onView('overview')
        }}
      >
        <Icon name="flow" size={16} />
      </button>

      <div className="my-1.5 w-14 flex-none border-t border-border max-[720px]:hidden" aria-hidden="true" />

      <nav className="flex flex-col gap-1 max-[720px]:min-w-0 max-[720px]:flex-1 max-[720px]:flex-row max-[720px]:justify-around max-[720px]:overflow-x-auto max-[720px]:overscroll-x-contain max-[720px]:[scrollbar-width:none]" aria-label="primary" data-testid="primary-nav">
        {PRIMARY_VIEWS.map((v) => {
          const IconCmp = VIEW_ICONS[v]
          return (
            <button
              key={v}
              type="button"
              data-testid={`nav-${v}`}
              aria-current={view === v ? 'page' : undefined}
              title={t(`nav.${v}`)}
              className={`${RAIL_BTN_CLS} aria-[current=page]:border-accent-b aria-[current=page]:bg-accent-t aria-[current=page]:font-bold aria-[current=page]:text-accent-d`}
              onClick={() => {
                setSettingsOpen(false)
                onView(v)
              }}
            >
              <IconCmp size={18} strokeWidth={1.75} aria-hidden="true" />
              <span data-testid={`nav-label-${v}`} className={RAIL_LB_CLS}>{t(`nav.${v}`)}</span>
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

      <div className="flex-1 max-[720px]:hidden" aria-hidden="true" />
      <div className="my-1.5 w-14 flex-none border-t border-border max-[720px]:hidden" aria-hidden="true" />

      <div className="relative flex flex-none flex-col items-center max-[720px]:mt-1">
        <button
          type="button"
          data-testid="nav-settings"
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          className={`${RAIL_BTN_CLS} aria-[expanded=true]:border-accent-b aria-[expanded=true]:bg-accent-t aria-[expanded=true]:font-bold aria-[expanded=true]:text-accent-d max-[720px]:w-11 max-[720px]:flex-none`}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className={RAIL_LB_CLS}>{t('common.settings')}</span>
        </button>

        {settingsOpen && (
          <section
            role="dialog"
            aria-label={t('common.settings')}
            data-testid="nav-settings-panel"
            className="absolute bottom-0 left-[calc(100%+12px)] z-50 w-[248px] rounded-2xl border border-border bg-card/96 p-3.5 text-left shadow-lg backdrop-blur-2xl max-[720px]:bottom-[calc(100%+12px)] max-[720px]:left-auto max-[720px]:right-0 max-[720px]:max-w-[calc(100vw-24px)]"
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
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 text-xs font-semibold text-text-2 hover:bg-fill"
                data-testid="theme-toggle"
                aria-label={t('common.theme_toggle')}
                onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
                {theme === 'dark' ? t('common.theme_dark') : t('common.theme_light')}
              </button>
              <button
                type="button"
                className="min-h-10 rounded-xl border border-border bg-bg px-3 text-xs font-semibold text-text-2 hover:bg-fill"
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
