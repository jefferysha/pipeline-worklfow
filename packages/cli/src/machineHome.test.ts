import { describe, expect, it } from 'vitest'
import { resolveMachineStateHome } from './machineHome.js'

describe('resolveMachineStateHome', () => {
  it('缺覆盖时使用真实 home', () => {
    expect(resolveMachineStateHome({}, '/Users/demo')).toBe('/Users/demo')
  })

  it('PIPELINE_DASHBOARD_HOME 隔离项目注册表与 secrets', () => {
    expect(resolveMachineStateHome({ PIPELINE_DASHBOARD_HOME: '/tmp/hermetic-home' }, '/Users/demo'))
      .toBe('/tmp/hermetic-home')
  })

  it('空覆盖不劫持真实 home', () => {
    expect(resolveMachineStateHome({ PIPELINE_DASHBOARD_HOME: '' }, '/Users/demo')).toBe('/Users/demo')
  })
})
