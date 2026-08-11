import { describe, expect, test } from 'vitest'
import { REAL_SETUP_ENV } from './setupEnvironment.js'

describe('REAL_SETUP_ENV.runCommand', () => {
  test('surfaces timeout diagnostics from execFileSync in stderr', () => {
    const result = REAL_SETUP_ENV.runCommand(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 1000)'],
      { timeoutMs: 20 },
    )

    expect(result.code).not.toBe(0)
    expect(result.stderr).not.toBe('')
    expect(result.stderr).toMatch(/timeout|ETIMEDOUT/i)
  })
})
