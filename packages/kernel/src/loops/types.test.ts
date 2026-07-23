import { describe, expect, test } from 'vitest'
import { assertLoopRunner, isLoopRunner } from './types.js'

describe('loop runner 闭集边界', () => {
  test.each(['codex', 'claude-code'] as const)('%s 是合法 runner', (runner) => {
    expect(isLoopRunner(runner)).toBe(true)
    expect(assertLoopRunner(runner)).toBe(runner)
  })

  test.each(['codxe', 'cron', '', undefined])('%s 非法且 assert fail-loud', (runner) => {
    expect(isLoopRunner(runner)).toBe(false)
    expect(() => assertLoopRunner(runner)).toThrow(/runner.*claude-code.*codex/i)
  })
})
