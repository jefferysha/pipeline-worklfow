import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { postTransition } from './api/client'
import { I18nProvider, useT } from './i18n'
import type { Lang } from './i18n/translations'
import { AdvancedPanel } from './advanced/AdvancedPanel'
import { AfkWorkbench } from './afk/AfkWorkbench'
import { BoardView } from './board/BoardView'
import { InboxView } from './inbox/InboxView'
import { changeWorkflow, selectInbox } from './inbox/inbox'
import { useWorkflowRules } from './model/workflowModel'
import { LoopsPanel } from './loops/LoopsPanel'
import { SettingsView } from './settings/SettingsView'
import { Dialog } from './shell/Dialog'
import { Nav, type View } from './shell/Nav'
import { NewChangeDialog } from './shell/NewChangeDialog'
import { Onboarding } from './shell/Onboarding'
import { useSnapshot } from './state/useSnapshot'
import { GLOBAL_CSS } from './styles'
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
  const { snapshot, loading, error, connected, refresh } = useSnapshot()
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
    if (rootPref && roots.includes(rootPref)) return rootPref
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
  const wfNames = useMemo(() => {
    const names = new Set<string>(['default'])
    for (const c of currentProject?.changes ?? []) names.add(changeWorkflow(c))
    return [...names]
  }, [currentProject])
  const { rules: rulesByWf, errors: rulesErrors } = useWorkflowRules(currentRoot, wfNames)

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
    () => selectInbox(snapshot, currentRoot, rulesByWf).length,
    [snapshot, currentRoot, rulesByWf],
  )

  // Nav 项目切换器数据（name=root 尾段目录名；count=活跃 change 数）
  const navProjects = useMemo(
    () =>
      (snapshot?.projects ?? []).map((p) => ({
        root: p.root,
        name: p.root.split('/').filter(Boolean).pop() ?? p.root,
        count: p.changes.length,
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
      />

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
            rulesByWf={rulesByWf}
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
            rulesByWf={rulesByWf}
            rulesErrors={rulesErrors}
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
