import { describe, expect, it } from 'vitest'
import { makeProject } from '../testkit'
import {
  isProjectWritable,
  resolveProjectSelection,
  selectedProjectRoot,
} from './projectSelectionModel'

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

  it('含兼容问题的项目仍可显式进入 Progress，普通不可达项目保持拒绝', () => {
    const projects = [
      makeProject('/mixed', [], {
        ok: false,
        compatibilityIssues: [{
          kind: 'unsupported-canonical-version',
          change: 'future',
          foundVersion: 2,
          supportedVersion: 1,
          action: 'upgrade-runtime',
        }],
      }),
      makeProject('/broken', [], { ok: false, error: 'offline' }),
    ]

    expect(resolveProjectSelection(projects, '/mixed')).toEqual({
      kind: 'selected',
      root: '/mixed',
    })
    expect(resolveProjectSelection(projects, '/broken')).toEqual({ kind: 'none' })
  })

  it('兼容问题与普通损坏并存时仍按不可达处理，不用升级提示掩盖 corruption', () => {
    const project = makeProject('/mixed-broken', [], {
      ok: false,
      error: 'broken-current: 状态损坏或不可读',
      compatibilityIssues: [{
        kind: 'unsupported-canonical-version',
        change: 'future',
        foundVersion: 2,
        supportedVersion: 1,
        action: 'upgrade-runtime',
      }],
    })

    expect(resolveProjectSelection([project], '/mixed-broken')).toEqual({ kind: 'none' })
  })

  it('只有 ok=true 项目有同步写资格，兼容只读项目不能挂载写视图', () => {
    expect(isProjectWritable(makeProject('/ok', []))).toBe(true)
    expect(isProjectWritable(makeProject('/read-only', [], {
      ok: false,
      compatibilityIssues: [{
        kind: 'unsupported-canonical-version',
        change: 'future',
        foundVersion: 2,
        supportedVersion: 1,
        action: 'upgrade-runtime',
      }],
    }))).toBe(false)
    expect(isProjectWritable(undefined)).toBe(false)
  })
})
