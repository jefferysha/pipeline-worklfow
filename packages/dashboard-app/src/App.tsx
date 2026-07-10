import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, postTransition, unregisterProject } from './api/client'
import { I18nProvider, useT } from './i18n'
import type { Lang } from './i18n/translations'
import { AdvancedPanel } from './advanced/AdvancedPanel'
import { InboxView } from './inbox/InboxView'
import { changeWorkflow, selectInbox } from './inbox/inbox'
import { useWorkflowRulesMulti } from './model/workflowModel'
import { ProgressView } from './progress/ProgressView'
import { Nav, PRIMARY_VIEWS, type View } from './shell/Nav'
import { NewChangeDialog } from './shell/NewChangeDialog'
import { Onboarding } from './shell/Onboarding'
import { useSnapshot } from './state/useSnapshot'
import { GLOBAL_CSS } from './styles'
import type { ChangeSnapshot } from './types'
import { WorkbenchView } from './workbench/WorkbenchView'
import { toastIn } from './shared/motion'

type Theme = 'light' | 'dark'
const THEME_KEY = 'pipeline-dashboard-theme'
const ROOT_KEY = 'pipeline-dashboard-root'
// T17：视图记忆。旧值（board/settings/loops/afk/workflows）随三视图 IA 退役——initialView
// 以 PRIMARY_VIEWS 白名单校验，不认识的一律兜底回 inbox（默认落地=收件箱，病灶②口径不变）。
const VIEW_KEY = 'pipeline-dashboard-view'

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    /* ignore */
  }
  return 'light'
}

function initialView(): View {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    if (stored !== null && (PRIMARY_VIEWS as string[]).includes(stored)) return stored as View
  } catch {
    /* ignore */
  }
  return 'inbox'
}

interface Flash {
  kind: 'toast' | 'error'
  msg: string
}

/** 一批 change 涉及的全部 workflow 名（'default' 恒在集合内）。单项目/聚合两条路径共用，
 *  避免各自平行维护同一段收集逻辑（Task 8，G19③）。 */
function wfNamesFor(changes: readonly ChangeSnapshot[]): string[] {
  const names = new Set<string>(['default'])
  for (const c of changes) names.add(changeWorkflow(c))
  return [...names]
}

function AppShell(): JSX.Element {
  const { t, lang, setLang } = useT()
  const [view, setViewState] = useState<View>(initialView)
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [newChangeOpen, setNewChangeOpen] = useState(false)
  const flashRef = useRef<HTMLDivElement>(null)

  const setView = useCallback((v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (flash && flashRef.current) toastIn(flashRef.current)
  }, [flash])
  const { snapshot, loading, error, connected, refresh, reconnect } = useSnapshot()
  // D5（吃掉 G14）：currentRoot 是显式概念——localStorage 记忆的偏好在 snapshot 里仍存在
  // 则用之，否则回退第一个已注册项目；切换器 UI 在 Nav（Task 11 接线 setCurrentRoot）。
  const [rootPref, setRootPref] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ROOT_KEY)
    } catch {
      return null
    }
  })
  const currentRoot = useMemo(() => {
    const roots = snapshot?.projects.map((p) => p.root) ?? []
    // ''（聚合选择）是合法偏好，不是"未设置"——不能用朴素 truthy 检查（'' 也是 falsy），
    // 否则选中聚合后下一次重算会被这里悄悄吃回第一个项目（Task 5 起 rootPref 才会取到 ''，
    // 此前老值只会是 null 或真实 root，这条分支因此不影响任何既有行为）。
    if (rootPref !== null && (rootPref === '' || roots.includes(rootPref))) return rootPref
    return roots[0] ?? ''
  }, [snapshot, rootPref])
  const setCurrentRoot = useCallback((root: string) => {
    setRootPref(root)
    try {
      localStorage.setItem(ROOT_KEY, root)
    } catch {
      /* ignore */
    }
  }, [])
  const currentProject = snapshot?.projects.find((p) => p.root === currentRoot)
  const wfNames = useMemo(() => wfNamesFor(currentProject?.changes ?? []), [currentProject])

  // G19③（Task 8）/ T17：全应用的 workflow 规则统一走 useWorkflowRulesMulti，键=rulesKey(root,wf)
  // ——收件箱徽章/InboxView/ProgressView 三个消费方吃同一份 Map。聚合语境（currentRoot===''）
  // 收集全部 ok 项目的 (root,wf) 对；单项目语境只请求当前项目（default 零网络，自定义走
  // fetchRules 模块级 cache/inflight 去重，见 workflowModel.ts）。旧的 useWorkflowRules 单项目
  // 调用随 旧看板视图 退出 App 接线而移除（T17；组件文件 T18 删）。
  const rulesPairs = useMemo(() => {
    if (currentRoot !== '') return [{ root: currentRoot, names: wfNames }]
    return (snapshot?.projects ?? []).filter((p) => p.ok).map((p) => ({ root: p.root, names: wfNamesFor(p.changes) }))
  }, [currentRoot, wfNames, snapshot])
  const { rules: rulesByKey } = useWorkflowRulesMulti(rulesPairs)

  useEffect(() => {
    try {
      document.documentElement.dataset.theme = theme
    } catch {
      /* ignore */
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const inboxCount = useMemo(
    () => selectInbox(snapshot, currentRoot, rulesByKey).length,
    [snapshot, currentRoot, rulesByKey],
  )

  // Nav 项目切换器数据（name=root 尾段目录名；count=活跃 change 数；ok 供聚合计数过滤用）
  const navProjects = useMemo(
    () =>
      (snapshot?.projects ?? []).map((p) => ({
        root: p.root,
        name: p.root.split('/').filter(Boolean).pop() ?? p.root,
        count: p.changes.length,
        ok: p.ok,
      })),
    [snapshot],
  )

  // T17：工作台是 per-root 配置面（workflow 定义/hooks/loops 都挂在具体项目上），聚合语境
  // （currentRoot===''）没有它的语义——回落第一个可达项目。回落也落空（项目非零但全部
  // ok=false）时这里保持空串，渲染处以诚实空态短路，不拿空 root 打端点得一屏报错（T17 评审收口）。
  const workbenchRoot = currentRoot !== '' ? currentRoot : snapshot?.projects.find((p) => p.ok)?.root ?? ''

  const showFlash = useCallback((kind: Flash['kind'], msg: string) => {
    setFlash({ kind, msg })
    window.setTimeout(() => setFlash(null), 4000)
  }, [])

  const onTransition = useCallback(
    async (name: string, root: string, event: string): Promise<void> => {
      await postTransition(name, root, event)
      refresh()
    },
    [refresh],
  )

  // 注销项目（G18 API + 评审 P2-13 入口，Task 5；T17 决议#7 保留）：Nav 拿到用户确认后调用，
  // 这里做真正的网络调用 + 收尾——成功则 refresh（快照重新拉取，注销的项目从列表消失）；若
  // 注销的正是当前语境，切回聚合（''），避免停留在一个已经不存在的 root 上。
  const onUnregister = useCallback(
    (root: string) => {
      void unregisterProject(root)
        .then(() => {
          if (root === currentRoot) setCurrentRoot('')
          refresh()
        })
        .catch((err: unknown) => {
          showFlash('error', err instanceof ApiError ? err.message : String(err))
        })
    },
    [currentRoot, setCurrentRoot, refresh, showFlash],
  )

  return (
    <div className="app">
      <style>{GLOBAL_CSS}</style>
      <Nav
        view={view}
        onView={setView}
        lang={lang}
        onLang={(l: Lang) => setLang(l)}
        theme={theme}
        onTheme={setTheme}
        connected={connected}
        inboxCount={inboxCount}
        projects={navProjects}
        currentRoot={currentRoot}
        onRoot={setCurrentRoot}
        onUnregister={onUnregister}
      />

      {!connected && (
        <div className="offline-banner" role="status" data-testid="offline-banner">
          <span className="offline-banner__msg">{t('common.offline')}</span>
          <button type="button" className="offline-banner__btn" data-testid="offline-reconnect" onClick={reconnect}>
            {t('common.reconnect')}
          </button>
        </div>
      )}

      {flash && (
        <div
          ref={flashRef}
          className={flash.kind === 'error' ? 'flash flash--error' : 'flash flash--toast'}
          role="status"
          data-testid={`flash-${flash.kind}`}
        >
          {flash.msg}
        </div>
      )}

      <main className="main">
        {/* G18 教学空状态（T17 起纯教学态：pipeline init 自动登记，无注册表单）：
            零项目 → 全视图 onboarding；有项目零 change → 收件箱/进度替换为新建引导
            （工作台不替换——它是配置面，零 change 也有事可做）。 */}
        {snapshot && snapshot.project_count === 0 ? (
          <Onboarding kind="no-project" />
        ) : snapshot && currentProject && currentProject.changes.length === 0 && (view === 'inbox' || view === 'progress') ? (
          <Onboarding kind="no-change" root={currentRoot} onNewChange={() => setNewChangeOpen(true)} />
        ) : (
          <>
        {view === 'inbox' && (
          <InboxView
            snapshot={snapshot}
            loading={loading}
            error={error}
            currentRoot={currentRoot}
            rulesByKey={rulesByKey}
            onOpenBoard={() => setView('progress')}
            onTransition={onTransition}
            onToast={(m) => showFlash('toast', m)}
            onError={(m) => showFlash('error', m)}
            onNewChange={currentRoot ? () => setNewChangeOpen(true) : undefined}
          />
        )}
        {view === 'progress' && (
          <ProgressView
            snapshot={snapshot}
            loading={loading}
            error={error}
            currentRoot={currentRoot}
            rulesByKey={rulesByKey}
            onToast={(m) => showFlash('toast', m)}
            onRefresh={refresh}
          />
        )}
        {view === 'workbench' && (
          workbenchRoot !== '' ? (
            <WorkbenchView root={workbenchRoot} onToggleError={(m) => showFlash('error', m)} />
          ) : snapshot ? (
            // 项目非零但全部不可达（ok=false）：诚实空态，不挂载 WorkbenchView
            //（零项目已被上方 Onboarding 分支接走，这里只剩「有项目但读不到」的角落）。
            <p className="view__note view__note--error" data-testid="wb-no-root">{t('workbench.no_reachable_root')}</p>
          ) : (
            <p className="view__note">{t('common.loading')}</p>
          )
        )}
          </>
        )}
      </main>

      {newChangeOpen && currentRoot && (
        <NewChangeDialog
          root={currentRoot}
          onClose={() => setNewChangeOpen(false)}
          onCreated={(name) => {
            setNewChangeOpen(false)
            showFlash('toast', t('newchange.created_toast', { name }))
            refresh()
          }}
        />
      )}

      <footer className="footer">
        <AdvancedPanel snapshot={snapshot} />
        <span className="footer__ver">{snapshot ? `server ${snapshot.version}` : t('common.loading')}</span>
      </footer>
    </div>
  )
}

export function App(): JSX.Element {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  )
}
