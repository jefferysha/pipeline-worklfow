import { describe, expect, it } from 'vitest'
import { classifyFailure } from './classify.js'

/** 失败分类（老仓 scheduler/classify.ts:1-119）：按 tag 而非字符串。 */
describe('classifyFailure', () => {
  it('verify-fail sentinel → retry', () => {
    expect(classifyFailure({ verifyFail: true })).toEqual({ kind: 'retry', message: 'verify-fail' })
  })

  it('操作员 abort（AbortedRunError）→ conflict，不重试，带 preservedPath', () => {
    const c = classifyFailure({ _tag: 'AbortedRunError', message: '停止', preservedPath: '/wt/x' })
    expect(c.kind).toBe('conflict')
    expect(c.preservedPath).toBe('/wt/x')
  })

  it('dashboard 取消（CancelledRunError，见 lifecycle.ts）→ conflict，不重试，带 preservedPath（afk-workbench Task 3）', () => {
    const c = classifyFailure({ _tag: 'CancelledRunError', message: 'cancel requested via dashboard', preservedPath: '/wt/z' })
    expect(c.kind).toBe('conflict')
    expect(c.preservedPath).toBe('/wt/z')
  })

  it('merge 冲突 / barrier drift → conflict（不重试）', () => {
    expect(classifyFailure({ _tag: 'SyncError', message: 'conflict' }).kind).toBe('conflict')
    expect(classifyFailure({ _tag: 'BarrierDriftError', message: 'drift' }).kind).toBe('conflict')
    expect(classifyFailure({ _tag: 'MergeToHostTimeoutError' }).kind).toBe('conflict')
    expect(classifyFailure({ _tag: 'WorktreeError' }).kind).toBe('conflict')
  })

  it('denylist 违规（DenylistViolationError，T4 决议 #12）→ conflict，不重试，带结构化 preservedWorktreePath', () => {
    const c = classifyFailure({
      _tag: 'DenylistViolationError',
      message: 'run touched denylisted paths: docs/a.md (denylist: docs/**)',
      preservedWorktreePath: '/wt/sandcastle-pipeline/x',
    })
    expect(c.kind).toBe('conflict')
    expect(c.preservedPath).toBe('/wt/sandcastle-pipeline/x')
  })

  it('agent idle-timeout → retry（瞬态挂起）', () => {
    expect(classifyFailure({ _tag: 'AgentIdleTimeoutError' }).kind).toBe('retry')
  })

  it('瞬态 exec 126/137 与普通失败都 retry', () => {
    expect(classifyFailure({ _tag: 'ExecError', exitCode: 137 }).kind).toBe('retry')
    expect(classifyFailure({ _tag: 'ExecError', exitCode: 1 }).kind).toBe('retry')
    expect(classifyFailure(new Error('boom')).kind).toBe('retry')
  })

  it('preservedPath 从 message 兜底抓取（含空格路径不截断）', () => {
    const c = classifyFailure({ _tag: 'SyncError', message: 'merge failed; preserved at /a b/wt 1' })
    expect(c.preservedPath).toBe('/a b/wt 1')
  })
})
