import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import { CANCEL_MARKER_FILE, NO_CONFIG_LOCK_FLAGS, addWorktree, hasCancelMarker, worktreePathFor } from './worktree.js'

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

/**
 * dashboard 取消标记探测（afk-workbench Task 3）：真 fs.access，无 git/docker 依赖——不属于
 * worktree.integration.test.ts 的"需要真 git 二进制"范畴，纯 node:fs 真磁盘即可覆盖真行为
 * （同 ports.test.ts 的 realDeleteWorktreePort 先例：真磁盘不等于需要 .integration 后缀）。
 */
describe('hasCancelMarker（真 fs.access 探测 dashboard 取消标记）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'afk-wt-cancel-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('标记文件不存在 → false', async () => {
    expect(await hasCancelMarker(dir)).toBe(false)
  })

  it(`标记文件（${CANCEL_MARKER_FILE}）存在 → true`, async () => {
    await writeFile(join(dir, CANCEL_MARKER_FILE), '1', 'utf8')
    expect(await hasCancelMarker(dir)).toBe(true)
  })

  it('worktree 目录本身已不存在（已被清）→ false，不 throw（探测本身不该成为结算路径上的新失败源）', async () => {
    await rm(dir, { recursive: true, force: true })
    await expect(hasCancelMarker(dir)).resolves.toBe(false)
  })
})
