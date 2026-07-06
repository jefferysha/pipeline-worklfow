import { describe, expect, it } from 'vitest'
import { SyncError, parseMergeResult } from './mergeback.js'

/**
 * merge-back 冲突判定（老仓 SandboxLifecycle.ts:766-814，DESIGN §4.5 + §7-item2）。
 * `git merge`（非 cherry-pick）：exit 0 = 干净交付；非零 = 冲突（settled）→ abort + 保留命名分支/现场。
 * 纯判定单测（不需 git），真 merge/冲突留现场走 mergeback.integration.test.ts。
 */
describe('parseMergeResult（冲突判定）', () => {
  it('exit 0 → 无冲突（干净交付）', () => {
    expect(parseMergeResult({ exitCode: 0, stdout: 'Fast-forward', stderr: '' })).toEqual({ conflict: false })
  })
  it('非零退出 → conflict（settled，绝不重试）', () => {
    expect(parseMergeResult({ exitCode: 1, stdout: 'CONFLICT (content)', stderr: '' }).conflict).toBe(true)
  })
})

describe('SyncError', () => {
  it('_tag=SyncError + 结构化 preservedWorktreePath（classify 归 conflict，留现场）', () => {
    const e = new SyncError('merge failed', '/wt/sandcastle-pipeline-x')
    expect(e._tag).toBe('SyncError')
    expect(e.preservedWorktreePath).toBe('/wt/sandcastle-pipeline-x')
  })
})
