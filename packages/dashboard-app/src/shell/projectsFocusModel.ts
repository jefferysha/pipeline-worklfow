import type { ProjectRow } from './projectsModel'

export const PROJECT_FOCUS_OPTIONS = ['all', 'attention', 'running', 'unreachable'] as const

export type ProjectFocus = (typeof PROJECT_FOCUS_OPTIONS)[number]

export type ProjectFocusCounts = Record<ProjectFocus, number>

export function projectMatchesQuery(row: ProjectRow, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return row.basename.toLowerCase().includes(normalized)
    || row.root.toLowerCase().includes(normalized)
    || row.repositoryLabel?.toLowerCase().includes(normalized) === true
}

export function projectMatchesFocus(row: ProjectRow, focus: ProjectFocus): boolean {
  switch (focus) {
    case 'attention':
      return row.ok && row.need > 0
    case 'running':
      return row.ok && row.running > 0
    case 'unreachable':
      return !row.ok
    case 'all':
      return true
  }
}

export function countProjectFocus(rows: readonly ProjectRow[]): ProjectFocusCounts {
  return {
    all: rows.length,
    attention: rows.filter((row) => projectMatchesFocus(row, 'attention')).length,
    running: rows.filter((row) => projectMatchesFocus(row, 'running')).length,
    unreachable: rows.filter((row) => projectMatchesFocus(row, 'unreachable')).length,
  }
}

export function selectFocusedProjects(rows: readonly ProjectRow[], query: string, focus: ProjectFocus): ProjectRow[] {
  return rows.filter((row) => projectMatchesQuery(row, query) && projectMatchesFocus(row, focus))
}
