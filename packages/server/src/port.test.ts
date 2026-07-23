import { describe, expect, it } from 'vitest'
import { DEFAULT_DASHBOARD_PORT, resolveDashboardPort } from './port.js'

describe('resolveDashboardPort', () => {
  it('uses 8765 as the one production default', () => {
    expect(DEFAULT_DASHBOARD_PORT).toBe(8765)
    expect(resolveDashboardPort(undefined)).toBe(8765)
    expect(resolveDashboardPort('')).toBe(8765)
  })

  it('accepts the documented 18765 override', () => {
    expect(resolveDashboardPort('18765')).toBe(18765)
  })

  it('does not turn malformed or invalid environment input into an unusable listener', () => {
    for (const value of ['0', '-1', '65536', '8765junk', '1.5', 'NaN']) {
      expect(resolveDashboardPort(value)).toBe(DEFAULT_DASHBOARD_PORT)
    }
  })
})
