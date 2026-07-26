import { describe, expect, it } from 'vitest'
import { makeProject } from '../testkit'
import { resolveProjectSelection, selectedProjectRoot } from './projectSelectionModel'

describe('projectSelectionModel', () => {
  it('只允许显式选择可达项目，不可达和缺省偏好都收敛为 none', () => {
    const projects = [
      makeProject('/reachable', []),
      makeProject('/unreachable', [], { ok: false, error: 'offline' }),
    ]
    expect(resolveProjectSelection(projects, null)).toEqual({ kind: 'none' })
    expect(resolveProjectSelection(projects, '/unreachable')).toEqual({ kind: 'none' })
    expect(resolveProjectSelection(projects, '/reachable')).toEqual({
      kind: 'selected',
      root: '/reachable',
    })
    expect(selectedProjectRoot({ kind: 'none' })).toBe('')
  })
})
