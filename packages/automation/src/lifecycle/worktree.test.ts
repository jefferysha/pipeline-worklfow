import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import { NO_CONFIG_LOCK_FLAGS, addWorktree, worktreePathFor } from './worktree.js'

/**
 * git worktree 管理 argv（老仓 WorktreeManager.ts:210-313 + git.ts NO_CONFIG_LOCK_FLAGS，DESIGN §7-item12）。
 * 并发安全三件套：LC_ALL=C（stderr 匹配稳定）+ NO_CONFIG_LOCK_FLAGS（防 config.lock 竞争）。
 * 纯 argv 单测（fake ExecFn），真 worktree add/remove 走 worktree.integration.test.ts。
 */
describe('worktreePathFor', () => {
  it('命名分支斜杠折成目录名（sandcastle-pipeline/x → 目录 sandcastle-pipeline-x）', () => {
    const p = worktreePathFor('/repo', 'sandcastle-pipeline/x')
    expect(p).toContain('.sandcastle/worktrees/')
    expect(p.endsWith('sandcastle-pipeline-x')).toBe(true)
  })
})

describe('NO_CONFIG_LOCK_FLAGS（防 .git/config.lock 竞争）', () => {
  it('含 branch.autoSetupMerge=false', () => {
    expect(NO_CONFIG_LOCK_FLAGS).toContain('branch.autoSetupMerge=false')
  })
})

describe('addWorktree argv（fake ExecFn，真临时 repoDir 供 mkdir）', () => {
  const makeExec = (onGit: (args: string[]) => ExecResult) => {
    const calls: string[][] = []
    const exec: ExecFn = async (file, args) => {
      calls.push([file, ...args])
      return onGit(args)
    }
    return { exec, calls }
  }

  let repoDir: string
  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'afk-wt-argv-'))
  })
  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true })
  })

  it('worktree add -b <branch> <path> HEAD，带 NO_CONFIG_LOCK_FLAGS + LC_ALL=C', async () => {
    const { exec, calls } = makeExec(() => ({ stdout: '', stderr: '', exitCode: 0 }))
    const r = await addWorktree(exec, repoDir, 'sandcastle-pipeline/x')
    expect(r.branch).toBe('sandcastle-pipeline/x')
    const gitCall = calls.find((c) => c.includes('worktree') && c.includes('add'))
    expect(gitCall).toBeDefined()
    expect(gitCall!.join(' ')).toContain('branch.autoSetupMerge=false')
    expect(gitCall!).toContain('-b')
    expect(gitCall!).toContain('sandcastle-pipeline/x')
  })
})
