import { useEffect, useMemo, useState } from 'react'
import { getHistory, type ChangeHistoryEntry } from '../api/client'
import { changeWorkflowName } from '../model/progressModel'
import type { Snapshot } from '../types'

export function useRecentWorkflowHistory(snapshot: Snapshot | null, root: string, workflow: string | null): {
  recent: Array<ChangeHistoryEntry & { change: string }> | null
  recentSilent: number
} {
  const [recent, setRecent] = useState<Array<ChangeHistoryEntry & { change: string }> | null>(null)
  const [recentSilent, setRecentSilent] = useState(0)
  const names = useMemo(() => {
    const project = snapshot?.projects.find((candidate) => candidate.root === root)
    if (!project?.ok || !workflow) return []
    return project.changes
      .filter((change) => change.archived !== 'true' && changeWorkflowName(change) === workflow)
      .map((change) => change.name)
  }, [snapshot, root, workflow])

  useEffect(() => {
    let cancelled = false
    if (names.length === 0) {
      setRecent([])
      setRecentSilent(0)
      return
    }
    setRecent(null)
    void Promise.all(names.map((name) =>
      getHistory(name, root)
        .then((entries) => ({ name, entries }))
        .catch(() => ({ name, entries: [] as ChangeHistoryEntry[] })),
    )).then((groups) => {
      if (cancelled) return
      const merged = groups.flatMap(({ name, entries }) => entries.map((entry) => ({ ...entry, change: name })))
      merged.sort((left, right) => left.ts < right.ts ? 1 : left.ts > right.ts ? -1 : 0)
      setRecent(merged.slice(0, 12))
      setRecentSilent(groups.filter((group) => group.entries.length === 0).length)
    })
    return () => {
      cancelled = true
    }
  }, [names, root])
  return { recent, recentSilent }
}
