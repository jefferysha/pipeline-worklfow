import { useCallback, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n'
import type { View } from './Nav'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

gsap.registerPlugin(useGSAP)

/**
 * AppHeader —— 内容区顶部的项目上下文条（2026-07-15 外壳 IA 重构拍板）。项目上下文从 rail 里
 * 拿出来放到这里、居中显眼：左=当前项目名（mono，root 尾段目录名，title 全路径）+ 切换器下拉
 * （沿用原 Nav 的项目列表 / 切换 / 注销逻辑与二次确认 Dialog）；右=「所有项目」入口（→
 * view='projects'）。切换器弹层用 fixed/absolute 定位避免被内容区裁剪。
 *
 * 契约：状态一律走 aria-* 与 data-*（不断言视觉类名）；testid 沿用原 Nav 切换器那一套（位置从
 * rail 搬到 header，testid 不变）——project-switcher / project-menu / project-item-* /
 * project-unregister-* / project-label / unregister-confirm；新增 app-header / header-all-projects。
 */
export interface AppHeaderProject {
  root: string
  name: string
  count: number
  /** false = 该项目当前不可达（root 不存在/不可读等）；缺省按 true 处理。 */
  ok?: boolean
}

interface AppHeaderProps {
  view: View
  onView: (v: View) => void
  /** 已注册项目列表（缺省/空 = 不渲染切换区，如加载首帧）。 */
  projects?: AppHeaderProject[]
  /** 当前单项目 root（App 保证为真实 root）。 */
  currentRoot?: string
  onRoot?: (root: string) => void
  /**
   * 注销项目（G18 `DELETE /api/projects`）：切换器每项 hover 区的「注销…」，用户在本组件内的
   * Dialog 二次确认后才调用，只传出 root——真正的网络调用/refresh/currentRoot 归属判断都是
   * 调用方（App）的职责。缺省则不渲染注销入口。
   */
  onUnregister?: (root: string) => void
}

/** root → 尾段项目名（同 inbox.ts projectName 口径，入参是裸 root 串）。 */
function rootBasename(root: string): string {
  const parts = root.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? root
}

// ── tailwind 类串（状态经 aria-expanded / data-on 属性挂变体，测试不断言视觉类名）──
const MENU_ROW_CLS = 'group flex items-center gap-1 rounded-[9px] hover:bg-fill'
const MENU_ITEM_CLS =
  'flex min-w-0 flex-1 cursor-pointer items-center gap-[9px] rounded-[9px] px-[9px] py-2 text-left text-[13px] text-text-2 group-data-[on]:bg-green-t'
const MENU_NAME_CLS = 'truncate font-semibold text-text group-data-[on]:text-green-d'
const MENU_N_CLS = 'ml-auto pl-2.5 font-mono text-[12.5px] font-bold tabular-nums text-accent-d'

export function AppHeader({ view, onView, projects, currentRoot, onRoot, onUnregister }: AppHeaderProps): JSX.Element {
  const { t } = useT()
  const [projectOpen, setProjectOpen] = useState(false)
  const [pendingUnregister, setPendingUnregister] = useState<AppHeaderProject | null>(null)
  const projRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 关=快出（短补间后卸载）。reduced-motion / 无 matchMedia（jsdom）直接卸载——测试与降级同步。
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
    gsap.to(el, { autoAlpha: 0, y: -4, duration: 0.12, ease: 'power1.in', onComplete: () => setProjectOpen(false) })
  }, [])

  // 开=下滑淡入 + 行 stagger（header 下拉从触发钮正下方落下）；gsap.matchMedia 全包，reduce 直显终态。
  useGSAP(
    () => {
      if (!projectOpen) return
      const el = menuRef.current
      if (!el || typeof window.matchMedia !== 'function') return
      const mm = gsap.matchMedia()
      mm.add(
        { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
        (ctx) => {
          if (Boolean((ctx.conditions as { reduce?: boolean } | undefined)?.reduce)) return
          gsap
            .timeline()
            .fromTo(
              el,
              { autoAlpha: 0, y: -6, transformOrigin: 'top left' },
              { autoAlpha: 1, y: 0, duration: 0.18, ease: 'power2.out' },
            )
            .fromTo(
              el.querySelectorAll('[data-anim="header-menu-row"]'),
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
  const switcherLabel = currentProject?.name ?? (currentRoot ? rootBasename(currentRoot) : '')

  // view='projects'：已在总览页，header 简化为标题（切换器/入口收起，无单项目上下文可切）。
  const onProjects = view === 'projects'

  return (
    <header
      className="flex items-center gap-3 bg-bg px-5 pt-4 pb-1 max-[720px]:px-3.5"
      data-testid="app-header"
    >
      {onProjects ? (
        <span className="text-[13.5px] font-semibold text-text" data-testid="app-header-title">
          {t('projects.title')}
        </span>
      ) : (
        <>
          {projects && projects.length > 1 && (
            <div ref={projRef} className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) closeMenu() }}>
              <button
                type="button"
                className="group -ml-2 flex max-w-[60vw] cursor-pointer items-center gap-2 rounded-[9px] border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-fill aria-expanded:border-border-2 aria-expanded:bg-fill"
                data-testid="project-switcher"
                aria-haspopup="menu"
                aria-expanded={projectOpen}
                title={currentRoot}
                onClick={() => (projectOpen ? closeMenu() : setProjectOpen(true))}
              >
                <span className="flex-none text-text-3"><Icon name="folder" size={16} /></span>
                <span className="truncate font-mono text-[14px] font-semibold text-text">{switcherLabel}</span>
                <span className="flex-none text-text-3 transition-transform group-aria-expanded:rotate-180" aria-hidden="true">
                  <Icon name="chevron" size={13} />
                </span>
              </button>
              {projectOpen && (
                <div
                  ref={menuRef}
                  className="absolute left-0 top-full z-30 mt-1 w-max min-w-[240px] max-w-[340px] origin-top-left rounded-lg border border-border bg-card p-1.5 shadow-lg"
                  role="menu"
                  data-testid="project-menu"
                >
                  {projects.map((p) => (
                    <div
                      key={p.root}
                      className={MENU_ROW_CLS}
                      data-on={p.root === currentRoot ? 'true' : undefined}
                      data-anim="header-menu-row"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        data-testid={`project-item-${p.name}`}
                        className={MENU_ITEM_CLS}
                        onClick={() => {
                          onRoot?.(p.root)
                          setProjectOpen(false)
                        }}
                      >
                        <span className={MENU_NAME_CLS}>{p.name}</span>
                        {p.count > 0 && <span className={MENU_N_CLS}>{p.count}</span>}
                      </button>
                      {onUnregister && (
                        <button
                          type="button"
                          className="mr-[5px] inline-grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-md text-text-3 opacity-0 transition-[opacity,background-color,color] hover:bg-red-t hover:text-red-d focus-visible:opacity-100 group-hover:opacity-100"
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
                  <p
                    className="mt-1 border-t border-border px-[9px] pb-[5px] pt-[7px] text-[11.5px] text-text-3"
                    data-anim="header-menu-row"
                  >{t('nav.project_menu_hint')}</p>
                </div>
              )}
            </div>
          )}
          {projects && projects.length === 1 && (
            <span className="flex items-center gap-2 px-2 py-1.5" data-testid="project-label" title={projects[0]?.root}>
              <span className="flex-none text-text-3"><Icon name="folder" size={16} /></span>
              <span className="truncate font-mono text-[14px] font-semibold text-text">{projects[0]?.name}</span>
            </span>
          )}

          <button
            type="button"
            className="ml-auto flex-none cursor-pointer rounded-[7px] border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-text-2 transition-colors hover:border-text-3 hover:bg-fill hover:text-text"
            data-testid="header-all-projects"
            onClick={() => onView('projects')}
          >
            {t('nav.projects')}
          </button>
        </>
      )}

      {pendingUnregister && (
        <Dialog
          title={t('nav.unregister_title', { name: pendingUnregister.name })}
          onClose={() => setPendingUnregister(null)}
          testid="unregister-confirm"
          actions={
            <>
              <button
                type="button"
                className="cursor-pointer rounded-md border border-border px-4 py-2 text-[12.5px] font-semibold text-text-2 transition-colors hover:border-text-3 hover:text-text"
                onClick={() => setPendingUnregister(null)}
              >
                {t('nav.unregister_cancel')}
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-md border border-red-b px-4 py-2 text-[12.5px] font-bold text-red-d transition-colors hover:bg-red-t"
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
          <p className="mb-4 text-[12.5px] leading-[1.6] text-text-2">
            {t('nav.unregister_desc', { name: pendingUnregister.name })}
          </p>
        </Dialog>
      )}
    </header>
  )
}
