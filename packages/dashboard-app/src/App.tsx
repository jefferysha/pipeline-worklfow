import { useCallback, useEffect, useMemo, useState } from 'react'
import { postTransition } from './api/client'
import { I18nProvider, useT } from './i18n'
import type { Lang } from './i18n/translations'
import { AdvancedPanel } from './advanced/AdvancedPanel'
import { AfkWorkbench } from './afk/AfkWorkbench'
import { BoardView } from './board/BoardView'
import { InboxView } from './inbox/InboxView'
import { selectInbox } from './inbox/inbox'
import { LoopsPanel } from './loops/LoopsPanel'
import { SettingsView } from './settings/SettingsView'
import { Nav, type View } from './shell/Nav'
import { useSnapshot } from './state/useSnapshot'
import { GLOBAL_CSS } from './styles'
import { WorkflowCanvas } from './workflow/WorkflowCanvas'
import { WorkflowEditorView } from './workflow/WorkflowEditorView'

type Theme = 'light' | 'dark'
const THEME_KEY = 'pipeline-dashboard-theme'

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
  const { snapshot, loading, error, connected, refresh } = useSnapshot()
  // GOAL.md E8 收编（Task 9）：null = workflow 列表页，非 null = 正打开该名字的画布页。
  const [openWorkflowName, setOpenWorkflowName] = useState<string | null>(null)
  // 已知简化点（登记见 docs/TEST-REALITY.md G14）：App 层目前没有"当前选中 project root"
  // 这个概念（snapshot 聚合全部已注册 project），固定取第一个 project 的 root——真实多项目
  // 场景下选哪个 root 编辑 workflow 是本任务范围外的更大问题。
  const currentRoot = snapshot?.projects[0]?.root ?? ''

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

  const inboxCount = useMemo(() => selectInbox(snapshot).length, [snapshot])

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
      />

      {flash && (
        <div
          className={flash.kind === 'error' ? 'flash flash--error' : 'flash flash--toast'}
          role="status"
          data-testid={`flash-${flash.kind}`}
        >
          {flash.msg}
        </div>
      )}

      <main className="main">
        {view === 'inbox' && (
          <InboxView snapshot={snapshot} loading={loading} error={error} onOpenBoard={() => setView('board')} />
        )}
        {view === 'board' && (
          <BoardView
            snapshot={snapshot}
            loading={loading}
            error={error}
            onTransition={onTransition}
            onToast={(m) => showFlash('toast', m)}
            onError={(m) => showFlash('error', m)}
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
      </main>

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
