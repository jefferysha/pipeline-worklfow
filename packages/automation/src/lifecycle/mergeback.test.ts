import { describe, expect, it } from 'vitest'
import type { ExecFn } from '../runner/exec.js'
import { SyncError, diffNamesReal, parseMergeResult } from './mergeback.js'

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

/**
 * T4 决议 #12：denylist 结算检查的数据源——本次 run 触碰的文件清单。
 * 三点号 range（merge-base 对比）读**不可变命名 ref**，与 collectCommitsReal 同款 sibling-proof
 * 口径；出错 → []（容错口径同 collectCommitsReal，denylist 检查对 git 故障不误判违规）。
 */
describe('diffNamesReal（git diff --name-only，决议 #12 数据源）', () => {
  const fakeExec = (result: { stdout: string; exitCode: number }): { exec: ExecFn; calls: { file: string; args: string[]; cwd?: string }[] } => {
    const calls: { file: string; args: string[]; cwd?: string }[] = []
    const exec: ExecFn = async (file, args, opts) => {
      calls.push({ file, args, cwd: opts?.cwd })
      return { stdout: result.stdout, stderr: '', exitCode: result.exitCode }
    }
    return { exec, calls }
  }

  it('argv：git diff --name-only <base>...refs/heads/<branch>，cwd=hostRepoDir', async () => {
    const { exec, calls } = fakeExec({ stdout: 'docs/a.md\nsrc/x.ts\n', exitCode: 0 })
    const files = await diffNamesReal(exec, { hostRepoDir: '/repo', branch: 'sandcastle-pipeline/x', base: 'main' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.file).toBe('git')
    expect(calls[0]!.args).toEqual(['diff', '--name-only', 'main...refs/heads/sandcastle-pipeline/x'])
    expect(calls[0]!.cwd).toBe('/repo')
    expect(files).toEqual(['docs/a.md', 'src/x.ts'])
  })

  it('空 diff → []', async () => {
    const { exec } = fakeExec({ stdout: '\n', exitCode: 0 })
    expect(await diffNamesReal(exec, { hostRepoDir: '/repo', branch: 'b', base: 'main' })).toEqual([])
  })

  it('git 非零退出 → []（容错口径同 collectCommitsReal，不把 git 故障误判成违规）', async () => {
    const { exec } = fakeExec({ stdout: '', exitCode: 128 })
    expect(await diffNamesReal(exec, { hostRepoDir: '/repo', branch: 'b', base: 'main' })).toEqual([])
  })
})
