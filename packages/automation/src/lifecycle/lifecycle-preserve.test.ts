import { describe, expect, it } from 'vitest'
import { type LifecyclePorts, runChangeInSandbox } from './lifecycle.js'
import { SyncError } from './mergeback.js'

const SHA = 'a'.repeat(40)
const TEST_VERIFIER_IDENTITY = {
  kind: 'host-verifier', verifier: 'fake-verifier', version: '1',
} as const
const testMergeJournal = {
  async recordMergeIntent() { return 'preserve-intent-1' },
  async recordMergeLanded() {},
}

/**
 * #29c 现场保留补强：#29 lifecycle 只在 abort 时保留 worktree；真 merge-back 引入真冲突后，
 * **conflict 类错误（SyncError / BarrierDriftError）也必须保留现场（不 remove worktree）**——
 * DESIGN §7-item4「失败/冲突绝不清沙箱」。纯 fake 端口驱动（无 docker/git），钉死保留行为。
 */
const makePorts = (over: Partial<LifecyclePorts>): { ports: LifecyclePorts; log: string[] } => {
  const log: string[] = []
  const ports: LifecyclePorts = {
    worktree: {
      async create(_repoDir, branch) {
        log.push('wt.create')
        return { path: `/wt/${branch}`, branch }
      },
      async remove(path) {
        log.push(`wt.remove:${path}`)
      },
      // 本文件专测 merge-back 冲突类保留现场，不涉及取消；固定无标记（afk-workbench Task 3
      // 的 CancelledRunError 专测在 lifecycle.test.ts）。
      async hasCancelMarker() {
        return false
      },
    },
    async createSandbox(opts) {
      log.push('sandbox.create')
      return {
        env: opts.env,
        containerName: 'sandcastle-preservetest',
        async exec() {
          return { stdout: '', stderr: '', exitCode: 0 }
        },
        async close() {
          log.push('sandbox.close')
        },
      }
    },
    async runWork() {
      log.push('runWork')
      return { verify_result: 'pass', build_sha: SHA, phase_event: 'verify-pass' }
    },
    async collectCommits() {
      return [{ sha: SHA }]
    },
    async diffNames() {
      return []
    },
    async mergeToBase() {
      log.push('mergeToBase')
    },
    git: { revParse: async () => SHA },
    async setStateField() {},
    // H7 verifier Phase 2：本文件专测 merge-back 冲突现场保留，不涉及 verifier 行为——固定 trusted
    // passed（不影响任何断言，mergeToBase 判断块本身不消费 verification）。
    verifier: {
      async verify(input) {
        return {
          schema_version: 1,
          verification_id: 'ver-preserve-fake',
          subject: { workflow_run_id: input.workflowRunId, attempt_id: input.context.attempt_id, change: input.context.change, revision: { kind: 'named-branch-head', sha: input.revisionSha } },
          binding: input.workflowBinding,
          verdict: 'passed',
          evidence: [{ kind: 'command-result', command_id: 'fake', exit_code: 0 }],
          issuer: { ...TEST_VERIFIER_IDENTITY, trusted: true },
          evaluated_at: '2026-07-18T00:00:00.000Z',
        }
      },
    },
    verifierExpectedIssuerIdentity: TEST_VERIFIER_IDENTITY,
    ...over,
  }
  return { ports, log }
}

describe('runChangeInSandbox 冲突现场保留（#29c）', () => {
  it('merge-back 抛 SyncError（conflict）→ 保留 worktree（不 remove）+ 容器仍杀 + 错误透传', async () => {
    const { ports, log } = makePorts({
      async mergeToBase() {
        log.push('mergeToBase')
        throw new SyncError('merge conflict', '/wt/sandcastle-pipeline/x')
      },
    })
    await expect(
      runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'],
        requireMergeJournal: true, mergeJournal: testMergeJournal,
      }, new AbortController().signal),
    ).rejects.toBeInstanceOf(SyncError)
    expect(log).toContain('mergeToBase')
    // 关键：conflict 不清 worktree（留现场供人工接管）
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(false)
    // 容器仍杀（不泄漏），worktree 才留
    expect(log).toContain('sandbox.close')
  })

  it('普通（非 conflict）错误仍清 worktree（不无差别留现场）', async () => {
    const { ports, log } = makePorts({
      async runWork() {
        throw new Error('transient boom')
      },
    })
    await expect(
      runChangeInSandbox(ports, {
        hostRepoDir: '/repo', name: 'x', base: 'main', autoMerge: true, allowlist: ['**'],
        requireMergeJournal: true, mergeJournal: testMergeJournal,
      }, new AbortController().signal),
    ).rejects.toThrow('transient boom')
    // 非保留类错误：worktree 照清（retry 会重建），不误留现场
    expect(log.some((l) => l.startsWith('wt.remove'))).toBe(true)
  })
})
