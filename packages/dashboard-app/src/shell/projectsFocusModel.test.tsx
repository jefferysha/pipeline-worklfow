import { describe, expect, it } from 'vitest'
import type { ProjectRow } from './projectsModel'
import {
  countProjectFocus,
  projectMatchesFocus,
  projectMatchesQuery,
  selectFocusedProjects,
} from './projectsFocusModel'

function row(overrides: Partial<ProjectRow> & Pick<ProjectRow, 'root' | 'basename'>): ProjectRow {
  return {
    ok: true,
    wip: 0,
    need: 0,
    running: 0,
    cells: [],
    ...overrides,
  }
}

const rows: ProjectRow[] = [
  row({
    root: '/Users/me/.codex/worktrees/alpha/pipeline-worklfow',
    basename: 'pipeline-worklfow',
    need: 2,
    running: 1,
  }),
  row({
    root: '/Users/me/code/Release-Console',
    basename: 'Release-Console',
    running: 3,
  }),
  row({
    root: '/Users/me/archive/broken-project',
    basename: 'broken-project',
    ok: false,
  }),
]

describe('projectsFocusModel', () => {
  it('matches trimmed, case-insensitive basename and root fragments', () => {
    expect(projectMatchesQuery(rows[0], '  PIPELINE  ')).toBe(true)
    expect(projectMatchesQuery(rows[1], 'code/release')).toBe(true)
    expect(projectMatchesQuery(rows[2], 'missing')).toBe(false)
    expect(projectMatchesQuery(rows[2], '   ')).toBe(true)
  })

  it('maps every focus to the existing ProjectRow facts', () => {
    expect(projectMatchesFocus(rows[0], 'all')).toBe(true)
    expect(projectMatchesFocus(rows[0], 'attention')).toBe(true)
    expect(projectMatchesFocus(rows[1], 'attention')).toBe(false)
    expect(projectMatchesFocus(rows[0], 'running')).toBe(true)
    expect(projectMatchesFocus(rows[1], 'running')).toBe(true)
    expect(projectMatchesFocus(rows[2], 'running')).toBe(false)
    expect(projectMatchesFocus(rows[2], 'unreachable')).toBe(true)
    expect(projectMatchesFocus(rows[0], 'unreachable')).toBe(false)
  })

  it('keeps badge counts global while query and focus narrow the visible rows', () => {
    expect(countProjectFocus(rows)).toEqual({
      all: 3,
      attention: 1,
      running: 2,
      unreachable: 1,
    })
    expect(selectFocusedProjects(rows, 'release', 'running')).toEqual([rows[1]])
    expect(selectFocusedProjects(rows, 'pipeline', 'unreachable')).toEqual([])
  })
})
