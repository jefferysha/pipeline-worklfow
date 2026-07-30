import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dashboardSearch, parseDashboardLocation } from '../shell/dashboardLocation'
import type { View } from '../shell/Nav'
import type { Snapshot } from '../types'
import { resolveProjectSelection, selectedProjectRoot } from './projectSelectionModel'

export interface ProjectSelectionController {
  readonly currentRoot: string
  readonly selectProject: (root: string, view: View) => void
  readonly applyLocation: (target: DashboardNavigationTarget) => void
  /** Replays the blocked Back/Forward traversal after its inverse has restored the current entry. */
  readonly confirmPopNavigation: () => void
}

export interface DashboardNavigationTarget {
  readonly view: View
  readonly root: string | null
  readonly change: string | null
}

const HISTORY_POSITION_KEY = '__tenonDashboardPosition'

function historyPosition(state: unknown): number | null {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return null
  const value = (state as Record<string, unknown>)[HISTORY_POSITION_KEY]
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function historyStateAt(position: number): Record<string, unknown> {
  const current = typeof window.history.state === 'object'
    && window.history.state !== null
    && !Array.isArray(window.history.state)
    ? window.history.state as Record<string, unknown>
    : {}
  return { ...current, [HISTORY_POSITION_KEY]: position }
}

function traverseHistory(delta: number): void {
  if (delta === -1) window.history.back()
  else if (delta === 1) window.history.forward()
  else window.history.go(delta)
}

export function useProjectSelection(input: {
  readonly snapshot: Snapshot | null
  readonly view: View
  readonly selectedChange: string | null
  readonly onPopView: (view: View) => void
  readonly onSelectedChange: (change: string | null) => void
  /** Return false after capturing the target to keep the last committed URL/UI in place. */
  readonly onPopAttempt?: (target: DashboardNavigationTarget) => boolean
}): ProjectSelectionController {
  const restoringBlockedPopRef = useRef(false)
  const confirmAfterRestoreRef = useRef(false)
  const allowNextPopRef = useRef(false)
  const historyPositionRef = useRef(historyPosition(window.history.state) ?? 0)
  const blockedTraversalRef = useRef(-1)
  useEffect(() => {
    if (historyPosition(window.history.state) === null) {
      window.history.replaceState(historyStateAt(historyPositionRef.current), '')
    }
  }, [])
  const [preferredRoot, setPreferredRoot] = useState<string | null>(() => {
    try {
      return parseDashboardLocation(window.location.search).root ?? null
    } catch {
      return null
    }
  })
  const currentRoot = useMemo(
    () => selectedProjectRoot(resolveProjectSelection(input.snapshot?.projects ?? [], preferredRoot)),
    [input.snapshot, preferredRoot],
  )
  const selectProject = useCallback((root: string, view: View) => {
    try {
      const search = dashboardSearch(window.location.search, { view, root, change: null })
      const next = `${window.location.pathname}${search}${window.location.hash}`
      const now = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (next !== now) {
        const nextPosition = historyPositionRef.current + 1
        window.history.pushState(historyStateAt(nextPosition), '', next)
        historyPositionRef.current = nextPosition
      }
    } catch {
      // 内存选择仍然生效；仅宿主禁用 history 时失去可后退 URL。
    }
    setPreferredRoot(root)
    input.onSelectedChange(null)
  }, [input.onSelectedChange])

  useEffect(() => {
    try {
      const root = input.snapshot ? currentRoot : (preferredRoot ?? '')
      const search = dashboardSearch(window.location.search, {
        view: input.view,
        root,
        change: input.view === 'progress' && root !== '' ? input.selectedChange : null,
      })
      const next = `${window.location.pathname}${search}${window.location.hash}`
      const now = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (next !== now) window.history.replaceState(window.history.state, '', next)
    } catch {
      // 禁用 history 的宿主只失去可复制 URL，不影响内存中的显式选择。
    }
  }, [currentRoot, input.selectedChange, input.snapshot, input.view, preferredRoot])

  useEffect(() => {
    if (!input.snapshot) return
    if (input.view === 'projects' || (preferredRoot !== null && currentRoot === '')) {
      if (preferredRoot !== null) setPreferredRoot(null)
      if (input.selectedChange !== null) input.onSelectedChange(null)
    }
  }, [currentRoot, input.onSelectedChange, input.selectedChange, input.snapshot, input.view, preferredRoot])

  const applyLocation = useCallback((target: DashboardNavigationTarget): void => {
    input.onPopView(target.view)
    setPreferredRoot(target.root)
    input.onSelectedChange(target.change)
  }, [input.onPopView, input.onSelectedChange])

  const confirmPopNavigation = useCallback((): void => {
    if (restoringBlockedPopRef.current) {
      confirmAfterRestoreRef.current = true
      return
    }
    allowNextPopRef.current = true
    traverseHistory(blockedTraversalRef.current)
  }, [])

  useEffect(() => {
    const onPopState = (event: PopStateEvent): void => {
      const previousPosition = historyPositionRef.current
      const eventPosition = historyPosition(event.state)
      if (restoringBlockedPopRef.current) {
        historyPositionRef.current = eventPosition ?? previousPosition - blockedTraversalRef.current
        restoringBlockedPopRef.current = false
        if (confirmAfterRestoreRef.current) {
          confirmAfterRestoreRef.current = false
          allowNextPopRef.current = true
          traverseHistory(blockedTraversalRef.current)
        }
        return
      }
      // Entries created before the Dashboard mounted do not carry our monotonic marker. They can
      // only be reached by leaving the current marked entry, so preserve the legacy Back fallback.
      const targetPosition = eventPosition ?? previousPosition - 1
      const traversal = targetPosition - previousPosition
      historyPositionRef.current = targetPosition
      const linked = parseDashboardLocation(window.location.search)
      const target: DashboardNavigationTarget = {
        view: linked.view ?? input.view,
        root: linked.root ?? null,
        change: linked.change ?? null,
      }
      if (allowNextPopRef.current) {
        allowNextPopRef.current = false
        applyLocation(target)
        return
      }
      if (input.onPopAttempt?.(target) === false) {
        // popstate fires after the browser has selected the target. Undo the exact traversal
        // direction (Back or Forward), then replay that same delta only if the user confirms.
        blockedTraversalRef.current = traversal === 0 ? -1 : traversal
        restoringBlockedPopRef.current = true
        traverseHistory(-blockedTraversalRef.current)
        return
      }
      applyLocation(target)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyLocation, input.onPopAttempt, input.view])

  return { currentRoot, selectProject, applyLocation, confirmPopNavigation }
}
