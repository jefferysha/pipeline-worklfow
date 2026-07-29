import { describe, expect, it } from 'vitest'
import { dashboardSearch, parseDashboardLocation, resolveDashboardRoot } from './dashboardLocation'

describe('dashboard URL 深链路', () => {
  it('接受 overview 作为独立品牌视图，并保留外部 query', () => {
    expect(parseDashboardLocation('?debug=1&view=overview')).toEqual({ view: 'overview' })
    expect(dashboardSearch('?debug=1', { view: 'overview', root: '', change: null })).toBe('?debug=1&view=overview')
  })

  it('接受 hostPlan 作为无项目依赖的机器级深链', () => {
    expect(parseDashboardLocation('?debug=1&view=hostPlan')).toEqual({ view: 'hostPlan' })
    expect(dashboardSearch('?debug=1&root=%2Frepo&change=old', {
      view: 'hostPlan',
      root: '',
      change: null,
    })).toBe('?debug=1&view=hostPlan')
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

  it('无显式偏好或偏好失效时保持未选择，不回退注册表首项', () => {
    expect(resolveDashboardRoot(['/repo-a', '/repo-b'], null)).toBe('')
    expect(resolveDashboardRoot(['/repo-a', '/repo-b'], '')).toBe('')
    expect(resolveDashboardRoot(['/repo-a', '/repo-b'], '/missing')).toBe('')
  })

  it('显式 macOS 逻辑路径仍可解析到已登记的规范路径', () => {
    expect(resolveDashboardRoot(['/old', '/private/tmp/repo-a'], '/tmp/repo-a')).toBe('/private/tmp/repo-a')
  })
})
