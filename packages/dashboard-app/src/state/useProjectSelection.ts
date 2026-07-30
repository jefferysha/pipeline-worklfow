import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dashboardSearch, parseDashboardLocation } from '../shell/dashboardLocation'
import type { View } from '../shell/Nav'
import type { Snapshot } from '../types'
import { resolveProjectSelection, selectedProjectRoot } from './projectSelectionModel'

export interface ProjectSelectionController {
  readonly currentRoot: string
  readonly selectProject: (root: string, view: View) => void
  readonly applyLocation: (target: DashboardNavigationTarget) => void
}

export interface DashboardNavigationTarget {
  readonly view: View
  readonly root: string | null
  readonly change: string | null
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
  const committedUrlRef = useRef(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
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
      if (next !== now) window.history.pushState(window.history.state, '', next)
      committedUrlRef.current = next
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
      committedUrlRef.current = next
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

  useEffect(() => {
    const onPopState = (): void => {
      const linked = parseDashboardLocation(window.location.search)
      const target: DashboardNavigationTarget = {
        view: linked.view ?? input.view,
        root: linked.root ?? null,
        change: linked.change ?? null,
      }
      if (input.onPopAttempt?.(target) === false) {
        try {
          window.history.replaceState(window.history.state, '', committedUrlRef.current)
        } catch {
          // URL restore is best-effort in restricted hosts; in-memory state remains authoritative.
        }
        return
      }
      applyLocation(target)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyLocation, input.onPopAttempt, input.view])

  return { currentRoot, selectProject, applyLocation }
}
