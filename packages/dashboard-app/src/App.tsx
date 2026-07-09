import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, postTransition, unregisterProject } from './api/client'
import { I18nProvider, useT } from './i18n'
import type { Lang } from './i18n/translations'
import { AdvancedPanel } from './advanced/AdvancedPanel'
import { AfkWorkbench } from './afk/AfkWorkbench'
import { BoardView } from './board/BoardView'
import { InboxView } from './inbox/InboxView'
import { changeWorkflow, selectInbox } from './inbox/inbox'
import { useWorkflowRules, useWorkflowRulesMulti } from './model/workflowModel'
import { LoopsPanel } from './loops/LoopsPanel'
import { SettingsView } from './settings/SettingsView'
import { Dialog } from './shell/Dialog'
import { Nav, type View } from './shell/Nav'
import { NewChangeDialog } from './shell/NewChangeDialog'
import { Onboarding } from './shell/Onboarding'
import { useSnapshot } from './state/useSnapshot'
import { GLOBAL_CSS } from './styles'
import type { ChangeSnapshot } from './types'
import { toastIn } from './workflow/motion'
import { WorkflowCanvas } from './workflow/WorkflowCanvas'
import { WorkflowEditorView } from './workflow/WorkflowEditorView'

type Theme = 'light' | 'dark'
const THEME_KEY = 'pipeline-dashboard-theme'
const ROOT_KEY = 'pipeline-dashboard-root'

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
  const [view, setView] = useState<View>('inbox')
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [newChangeOpen, setNewChangeOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const flashRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (flash && flashRef.current) toastIn(flashRef.current)
  }, [flash])
  const { snapshot, loading, error, connected, refresh, reconnect } = useSnapshot()
  // GOAL.md E8 收编（Task 9）：null = workflow 列表页，非 null = 正打开该名字的画布页。
  const [openWorkflowName, setOpenWorkflowName] = useState<string | null>(null)
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
  // G17：当前项目涉及的全部 workflow 规则（default 零网络；自定义走 API+缓存）
  const currentProject = snapshot?.projects.find((p) => p.root === currentRoot)
  const wfNames = useMemo(() => wfNamesFor(currentProject?.changes ?? []), [currentProject])
  const { rules: rulesByWf, errors: rulesErrors } = useWorkflowRules(currentRoot, wfNames)

  // G19③（Task 8）：收件箱聚合语境（currentRoot===''）要看全部 ok 项目，selectInbox 第三参
  // 键升级为 rulesKey(root,wf)（见 workflowModel.ts）——同名自定义 workflow 跨项目不再共享
  // 同一把 key。React hook 不能条件调用：不能"聚合时调 Multi、非聚合时不调"两条路径切换。
  // 这里选"两个 hook 都恒调、各自服务不同视图"（而不是统一只调 Multi 再反推 BoardView 的
  // rulesByWf/rulesErrors）：上面这行 useWorkflowRules 调用逐字不动，继续单独喂 BoardView 的
  // 非聚合路径；新增的这条 Multi 调用喂 InboxView（恒）+ BoardView 的聚合路径（Task 11：
  // BoardView 的 rulesByWf/rulesErrors 这两个 prop 名没有改，但下面 JSX 调用点在
  // currentRoot===''时改传这里的 rulesByKey/rulesErrorsByKey——BoardView 内部按 currentRoot
  // 是否为空自己决定拿到的 Map 是裸 wf 名索引还是 rulesKey(root,wf) 索引，见 BoardView.tsx
  // 的 BoardViewProps.rulesByWf JSDoc）。单项目语境下两条调用会请求同一批 (root,wf)，靠
  // fetchRules 模块级 cache/inflight 去重（workflowModel.ts 已有机制，这里不重复实现/不产生
  // 重复网络请求），代价只是同一份数据被两套 tick/errors/pendingCount 状态各记一份（可接受
  // 的小冗余，换非聚合路径 App.tsx 接线 + BoardView.test.tsx 既有 34 条测试零改动）。
  const rulesPairs = useMemo(() => {
    if (currentRoot !== '') return [{ root: currentRoot, names: wfNames }]
    return (snapshot?.projects ?? []).filter((p) => p.ok).map((p) => ({ root: p.root, names: wfNamesFor(p.changes) }))
  }, [currentRoot, wfNames, snapshot])
  const { rules: rulesByKey, errors: rulesErrorsByKey } = useWorkflowRulesMulti(rulesPairs)

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

  // 注销项目（G18 API + 评审 P2-13 入口，Task 5）：Nav 拿到用户确认后调用，这里做真正的
  // 网络调用 + 收尾——成功则 refresh（快照重新拉取，注销的项目从列表消失）；若注销的正是
  // 当前语境，切回聚合（''），避免停留在一个已经不存在的 root 上。
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
        onRegisterProject={() => setRegisterOpen(true)}
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
        {/* G18 教学空状态：零项目 → 全视图 onboarding；有项目零 change → 收件箱/看板替换为新建引导 */}
        {snapshot && snapshot.project_count === 0 ? (
          <Onboarding kind="no-project" onRegistered={refresh} />
        ) : snapshot && currentProject && currentProject.changes.length === 0 && (view === 'inbox' || view === 'board') ? (
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
            onOpenBoard={() => setView('board')}
            onTransition={onTransition}
            onToast={(m) => showFlash('toast', m)}
            onError={(m) => showFlash('error', m)}
            onNewChange={currentRoot ? () => setNewChangeOpen(true) : undefined}
          />
        )}
        {view === 'board' && (
          <BoardView
            snapshot={snapshot}
            loading={loading}
            error={error}
            currentRoot={currentRoot}
            // Task 11（G19③/④）：聚合语境（currentRoot===''）改传 useWorkflowRulesMulti 的产出
            // （已经是按 rulesKey(root,wf) 索引），非聚合语境逐字沿用 Task 8 起就未变的
            // useWorkflowRules 单项目产出（裸 wf 名索引）——prop 名不变，BoardView 内部按
            // currentRoot 自己判断该用哪种键格式查（见 BoardView.tsx 的 lookupRules）。
            rulesByWf={currentRoot === '' ? rulesByKey : rulesByWf}
            rulesErrors={currentRoot === '' ? rulesErrorsByKey : rulesErrors}
            onTransition={onTransition}
            onToast={(m) => showFlash('toast', m)}
            onError={(m) => showFlash('error', m)}
            onNewChange={currentRoot ? () => setNewChangeOpen(true) : undefined}
          />
        )}
        {view === 'settings' && <SettingsView />}
        {view === 'loops' && <LoopsPanel />}
        {view === 'afk' && <AfkWorkbench root={currentRoot} />}
        {view === 'workflows' && (
          openWorkflowName
            ? <WorkflowCanvas root={currentRoot} name={openWorkflowName} onBack={() => setOpenWorkflowName(null)} />
            : <WorkflowEditorView root={currentRoot} onOpen={setOpenWorkflowName} />
        )}
          </>
        )}
      </main>

      {registerOpen && (
        <Dialog
          title={t('onboard.no_project_title')}
          onClose={() => setRegisterOpen(false)}
          testid="register-dialog"
          actions={
            <button type="button" className="btn btn--ghost" onClick={() => setRegisterOpen(false)}>
              {t('onboard.cancel')}
            </button>
          }
        >
          <Onboarding
            kind="no-project"
            onRegistered={() => {
              setRegisterOpen(false)
              refresh()
            }}
          />
        </Dialog>
      )}

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
