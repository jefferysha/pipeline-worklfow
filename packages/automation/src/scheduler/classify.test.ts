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

  it('容器 mount 前 host 侧 skill bundle 核验失败（SkillBundleSnapshotMismatchError，H10 r1 阻断6/4）→ conflict，不重试，cause=skill-bundle-snapshot-corrupt（专属值，不复用泛泛的 conflict）', () => {
    const c = classifyFailure({ _tag: 'SkillBundleSnapshotMismatchError', message: 'digest 不一致' })
    expect(c.kind).toBe('conflict')
    expect(c.cause).toBe('skill-bundle-snapshot-corrupt')
    expect(c.message).toBe('digest 不一致')
  })

  it('start permit 发现 policy/bundle 已变化 → retry + 专属 cause，不当基础设施故障', () => {
    const c = classifyFailure({ _tag: 'LoopPolicyChangedError', message: 'policy changed' })
    expect(c).toMatchObject({ kind: 'retry', cause: 'skill-bundle-policy-changed' })
  })

  it('容器清理失败（直接或附着在主错误上）→ conflict + container-cleanup，阻止带泄漏现场自动重跑', () => {
    const direct = classifyFailure({
      _tag: 'ContainerCleanupError', message: 'docker rm failed', preservedWorktreePath: '/wt/direct',
    })
    expect(direct).toEqual({
      kind: 'conflict', message: 'docker rm failed', cause: 'container-cleanup', preservedPath: '/wt/direct',
    })

    const nested = classifyFailure({
      message: 'agent failed',
      preservedWorktreePath: '/wt/nested',
      cleanupError: { _tag: 'ContainerCleanupError', message: 'container still exists' },
    })
    expect(nested).toEqual({
      kind: 'conflict',
      message: 'agent failed; cleanup failed: container still exists',
      cause: 'container-cleanup',
      preservedPath: '/wt/nested',
    })
  })

  it('H14 r8：direct cleanup Proxy 的无关 verifyFail getter 抛错 → 分类器不抛，仍可信 conflict', () => {
    const hostile = new Proxy({
      _tag: 'ContainerCleanupError',
      message: 'container remains',
      preservedWorktreePath: '/wt/direct-proxy',
    }, {
      get(target, key, receiver) {
        if (key === 'verifyFail') throw new Error('hostile verifyFail getter')
        return Reflect.get(target, key, receiver)
      },
    })

    expect(classifyFailure(hostile)).toEqual({
      kind: 'conflict', message: 'container remains', cause: 'container-cleanup',
      preservedPath: '/wt/direct-proxy',
    })
  })

  it('H14 r8：nested cleanup Proxy 的 _tag getter 抛错 → 已进入 cleanup candidate 后 fail-closed', () => {
    const nested = new Proxy({ message: 'container remains' }, {
      get(target, key, receiver) {
        if (key === '_tag') throw new Error('hostile nested tag getter')
        return Reflect.get(target, key, receiver)
      },
    })
    const wrapper = {
      message: 'agent failed',
      cleanupError: nested,
      preservedWorktreePath: '/wt/nested-proxy',
    }

    expect(classifyFailure(wrapper)).toEqual({
      kind: 'conflict',
      message: 'agent failed; cleanup failed: container remains',
      cause: 'container-cleanup',
      preservedPath: '/wt/nested-proxy',
    })
  })

  it.each([
    {
      name: 'cleanupError 字段缺席',
      error: () => ({ _tag: 'RunAndCleanupError', message: 'run and cleanup failed' }),
    },
    {
      name: 'cleanupError 显式 undefined',
      error: () => ({ _tag: 'RunAndCleanupError', message: 'run and cleanup failed', cleanupError: undefined }),
    },
    {
      name: 'stateful Proxy 首次读取 cleanupError 返回 undefined',
      error: () => new Proxy({
        _tag: 'RunAndCleanupError', message: 'run and cleanup failed',
        cleanupError: { _tag: 'ContainerCleanupError', message: 'container remains' },
      }, {
        get(target, key, receiver) {
          if (key === 'cleanupError') return undefined
          return Reflect.get(target, key, receiver)
        },
      }),
    },
  ])('H14 r9：可信组合 tag + $name → 缺损诊断也必须 fail-closed 为 cleanup conflict', ({ error }) => {
    expect(classifyFailure(error())).toEqual({
      kind: 'conflict',
      message: 'run and cleanup failed; cleanup failed: container cleanup failed',
      cause: 'container-cleanup',
    })
  })

  it('全部已知属性 getter 都抛错的任意 Proxy → classifyFailure 仍返回结构化结果，绝不向外 throw', () => {
    const hostile = new Proxy({}, { get() { throw new Error('hostile all-fields getter') } })
    expect(classifyFailure(hostile)).toEqual({ kind: 'retry', message: 'run failed', cause: '' })
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

  it('allowlist 越界（AllowlistViolationError）→ conflict，不重试并保留 worktree', () => {
    expect(classifyFailure({
      _tag: 'AllowlistViolationError',
      message: 'outside L3 allowlist',
      preservedWorktreePath: '/tmp/wt-allow',
    })).toEqual({ kind: 'conflict', message: 'outside L3 allowlist', cause: 'conflict', preservedPath: '/tmp/wt-allow' })
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
