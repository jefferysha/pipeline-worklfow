import { useCallback, useEffect, useMemo, useState } from 'react'
import { dashboardSearch, parseDashboardLocation } from '../shell/dashboardLocation'
import type { View } from '../shell/Nav'
import type { Snapshot } from '../types'
import { resolveProjectSelection, selectedProjectRoot } from './projectSelectionModel'

export interface ProjectSelectionController {
  readonly currentRoot: string
  readonly setCurrentRoot: (root: string) => void
}

export function useProjectSelection(input: {
  readonly snapshot: Snapshot | null
  readonly view: View
  readonly selectedChange: string | null
  readonly onPopView: (view: View) => void
  readonly onSelectedChange: (change: string | null) => void
}): ProjectSelectionController {
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
  const setCurrentRoot = useCallback((root: string) => {
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

  useEffect(() => {
    const onPopState = (): void => {
      const linked = parseDashboardLocation(window.location.search)
      if (linked.view !== undefined) input.onPopView(linked.view)
      setPreferredRoot(linked.root ?? null)
      input.onSelectedChange(linked.change ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [input.onPopView, input.onSelectedChange])

  return { currentRoot, setCurrentRoot }
}
