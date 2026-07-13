import { describe, expect, it } from 'vitest'
import { classifyFailure } from './classify.js'

/** 失败分类（老仓 scheduler/classify.ts:1-119）：按 tag 而非字符串。 */
describe('classifyFailure', () => {
  it('verify-fail sentinel → retry + cause=verify-fail（F-b 结构化成因）', () => {
    expect(classifyFailure({ verifyFail: true })).toEqual({ kind: 'retry', message: 'verify-fail', cause: 'verify-fail' })
  })

  it('操作员 abort（AbortedRunError）→ conflict，不重试，带 preservedPath，cause=cancelled', () => {
    const c = classifyFailure({ _tag: 'AbortedRunError', message: '停止', preservedPath: '/wt/x' })
    expect(c.kind).toBe('conflict')
    expect(c.preservedPath).toBe('/wt/x')
    expect(c.cause).toBe('cancelled')
  })

  it('dashboard 取消（CancelledRunError，见 lifecycle.ts）→ conflict，不重试，带 preservedPath，cause=cancelled（F-b：读取端不再把用户取消误判 unknown）', () => {
    const c = classifyFailure({ _tag: 'CancelledRunError', message: 'cancel requested via dashboard', preservedPath: '/wt/z' })
    expect(c.kind).toBe('conflict')
    expect(c.preservedPath).toBe('/wt/z')
    expect(c.cause).toBe('cancelled')
  })

  it('merge 冲突 / barrier drift → conflict（不重试），cause=conflict', () => {
    for (const tag of ['SyncError', 'BarrierDriftError', 'MergeToHostTimeoutError', 'WorktreeError'] as const) {
      const c = classifyFailure({ _tag: tag, message: 'x' })
      expect(c.kind).toBe('conflict')
      expect(c.cause).toBe('conflict')
    }
  })

  it('denylist 违规（DenylistViolationError，T4 决议 #12）→ conflict，不重试，带结构化 preservedWorktreePath，cause=conflict', () => {
    const c = classifyFailure({
      _tag: 'DenylistViolationError',
      message: 'run touched denylisted paths: docs/a.md (denylist: docs/**)',
      preservedWorktreePath: '/wt/sandcastle-pipeline/x',
    })
    expect(c.kind).toBe('conflict')
    expect(c.preservedPath).toBe('/wt/sandcastle-pipeline/x')
    expect(c.cause).toBe('conflict')
  })

  it('agent idle-timeout → retry（瞬态挂起），cause=timeout', () => {
    const c = classifyFailure({ _tag: 'AgentIdleTimeoutError' })
    expect(c.kind).toBe('retry')
    expect(c.cause).toBe('timeout')
  })

  it('瞬态 exec 126/137 与普通失败都 retry；cause 空串（tag 无法干净定成因，读取端 regex 兜底）', () => {
    expect(classifyFailure({ _tag: 'ExecError', exitCode: 137 })).toMatchObject({ kind: 'retry', cause: '' })
    expect(classifyFailure({ _tag: 'ExecError', exitCode: 1 })).toMatchObject({ kind: 'retry', cause: '' })
    expect(classifyFailure(new Error('boom'))).toMatchObject({ kind: 'retry', cause: '' })
  })

  it('preservedPath 从 message 兜底抓取（含空格路径不截断）', () => {
    const c = classifyFailure({ _tag: 'SyncError', message: 'merge failed; preserved at /a b/wt 1' })
    expect(c.preservedPath).toBe('/a b/wt 1')
  })
})
