import { describe, expect, it } from 'vitest'
import { makeChange, makeProject, makeSnapshot } from '../testkit'
import { buildProjectRows, buildRepositoryGroups } from './projectsModel'
import { projectMatchesQuery } from './projectsFocusModel'

const t = (key: string): string => key

describe('repository project groups', () => {
  it('groups workspaces by opaque identity while preserving exact roots and stable workspace order', () => {
    const primaryRoot = '/code/tenon'
    const worktreeRoot = '/worktrees/feature/tenon'
    const otherRoot = '/code/another-tenon'
    const legacyRoot = '/code/legacy'
    const snapshot = makeSnapshot([
      makeProject(worktreeRoot, [makeChange('feature', 'build')], {
        repository: { id: 'a'.repeat(64), label: 'tenon', workspace_kind: 'worktree' },
      }),
      makeProject(otherRoot, [makeChange('other', 'open')], {
        repository: { id: 'b'.repeat(64), label: 'tenon', workspace_kind: 'primary' },
      }),
      makeProject(primaryRoot, [makeChange('main', 'verify')], {
        repository: { id: 'a'.repeat(64), label: 'tenon', workspace_kind: 'primary' },
      }),
      makeProject(legacyRoot, [makeChange('legacy', 'open')]),
    ])

    const groups = buildRepositoryGroups(buildProjectRows(snapshot, new Map(), t))

    expect(groups).toHaveLength(3)
    const shared = groups.find((group) => group.id === `repository:${'a'.repeat(64)}`)
    expect(shared).toMatchObject({ label: 'tenon', workspaceCount: 2 })
    expect(shared?.workspaces.map((workspace) => workspace.root)).toEqual([primaryRoot, worktreeRoot])
    expect(groups.filter((group) => group.label === 'tenon')).toHaveLength(2)
    expect(groups.find((group) => group.id === `workspace:${legacyRoot}`)?.workspaces[0]?.root)
      .toBe(legacyRoot)
  })

  it('matches a worktree when the query names its repository group', () => {
    const snapshot = makeSnapshot([makeProject('/worktrees/feature-a', [], {
      repository: { id: 'c'.repeat(64), label: 'tenon', workspace_kind: 'worktree' },
    })])
    const row = buildProjectRows(snapshot, new Map(), t)[0]

    expect(projectMatchesQuery(row, 'tenon')).toBe(true)
  })
})
