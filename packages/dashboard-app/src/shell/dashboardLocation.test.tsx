import { describe, expect, it } from 'vitest'
import { dashboardSearch, parseDashboardLocation } from './dashboardLocation'

describe('dashboard URL 深链路', () => {
  it('接受 overview 作为独立品牌视图，并保留外部 query', () => {
    expect(parseDashboardLocation('?debug=1&view=overview')).toEqual({ view: 'overview' })
    expect(dashboardSearch('?debug=1', { view: 'overview', root: '', change: null })).toBe('?debug=1&view=overview')
  })

  it('只接受已知 view，并逐字保留 root/change', () => {
    expect(parseDashboardLocation('?view=progress&root=%2Frepo%2Fa&change=fix-login')).toEqual({
      view: 'progress', root: '/repo/a', change: 'fix-login',
    })
    expect(parseDashboardLocation('?view=retired&root=%2Frepo')).toEqual({ root: '/repo' })
  })

  it('生成可复制链接时保留无关 query，并在离开详情时删除 change', () => {
    expect(dashboardSearch('?debug=1', { view: 'machine', root: '', change: null })).toBe('?debug=1&view=machine')
    expect(dashboardSearch('?debug=1&view=progress&root=%2Frepo&change=old', { view: 'projects', root: '/repo', change: null })).toBe('?debug=1&view=projects&root=%2Frepo')
  })
})
