import { describe, expect, it } from 'vitest'
import { DEFAULT_DASHBOARD_PORT, resolveDashboardPort } from './port.js'

describe('resolveDashboardPort', () => {
  it('uses 18765 as the one production default', () => {
    expect(DEFAULT_DASHBOARD_PORT).toBe(18765)
    expect(resolveDashboardPort(undefined)).toBe(18765)
    expect(resolveDashboardPort('')).toBe(18765)
  })

  it('accepts the documented former 8765 override', () => {
    expect(resolveDashboardPort('8765')).toBe(8765)
  })

  it('does not turn malformed or invalid environment input into an unusable listener', () => {
    for (const value of ['0', '-1', '65536', '8765junk', '1.5', 'NaN']) {
      expect(resolveDashboardPort(value)).toBe(DEFAULT_DASHBOARD_PORT)
    }
  })
})
