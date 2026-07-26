import { describe, expect, test } from 'vitest'
import { parseDashboardServerArgs } from './server-args.js'

describe('Dashboard server process arguments', () => {
  test('starts only with an empty internal argv', () => {
    expect(parseDashboardServerArgs([])).toEqual({ mode: 'run' })
  })

  test('prints help without binding the singleton port', () => {
    expect(parseDashboardServerArgs(['--help'])).toEqual({ mode: 'help' })
    expect(parseDashboardServerArgs(['-h'])).toEqual({ mode: 'help' })
  })

  test('rejects every unknown direct-bundle argument', () => {
    expect(parseDashboardServerArgs(['--port', '18766'])).toEqual({
      mode: 'invalid',
      detail: 'unsupported direct server arguments: --port 18766',
    })
  })
})
