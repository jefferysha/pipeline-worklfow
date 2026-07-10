import { describe, expect, it } from 'vitest'
import { runnerForChange } from './runnerFor.js'

/** v5 T20：change → 生效 runner 派生（change_prefix 归属，同 denylistForChange 口径）。 */
describe('runnerForChange（change_prefix 归属 → loop 声明的 runner）', () => {
  const loops = [
    { change_prefix: 'loop-be-', runner: 'codex' },
    { change_prefix: 'loop-fe-', runner: 'claude-code' },
    { change_prefix: null, runner: 'codex' },
    { change_prefix: 'loop-docs-', runner: 'cron' },
  ]

  it('前缀命中 → 返回该 loop 的 runner', () => {
    expect(runnerForChange(loops, 'loop-be-fix-1')).toBe('codex')
    expect(runnerForChange(loops, 'loop-fe-polish')).toBe('claude-code')
  })

  it('历史自由值（cron）原样返回——分派口径在 buildAfkRunCommand（仅 codex 生效）', () => {
    expect(runnerForChange(loops, 'loop-docs-sync')).toBe('cron')
  })

  it('无前缀命中 / null 前缀不参与 → undefined（无 loop 语境，缺省路径）', () => {
    expect(runnerForChange(loops, 'standalone-change')).toBeUndefined()
  })

  it('多 loop 前缀同时命中 → 首个命中优先（登记表声明序）', () => {
    const dup = [
      { change_prefix: 'loop-', runner: 'claude-code' },
      { change_prefix: 'loop-be-', runner: 'codex' },
    ]
    expect(runnerForChange(dup, 'loop-be-x')).toBe('claude-code')
  })
})
