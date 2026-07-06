import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BarrierDriftError, type GitFace, deriveBarrierSha } from './barrier.js'

const execFileAsync = promisify(execFile)

/** 真 git face（execFile git，LC_ALL=C）——barrier 派生走真实 rev-parse。 */
const realGit = (cwd: string): GitFace => ({
  async revParse(ref) {
    const { stdout } = await execFileAsync('git', ['rev-parse', ref], {
      cwd,
      env: { ...process.env, LC_ALL: 'C' },
    })
    return stdout.trim()
  },
})

const git = async (cwd: string, args: string[]) =>
  execFileAsync('git', args, { cwd, env: { ...process.env, LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null' } })

let hasGit = false

describe('barrier 派生 · 真 git 集成', () => {
  let root: string

  beforeAll(async () => {
    try {
      await execFileAsync('git', ['--version'])
      hasGit = true
    } catch {
      console.warn('[HONEST SKIP] git 不可用 → barrier 真 git 集成跳过（绝不伪绿）')
    }
  })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'afk-barrier-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('真命名分支 HEAD == landed → 冻结真实 40-char SHA', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await git(root, ['init', '-q', '-b', 'main'])
    await git(root, ['config', 'user.email', 'afk@test'])
    await git(root, ['config', 'user.name', 'afk'])
    await writeFile(join(root, 'f.txt'), 'hi')
    await git(root, ['add', '.'])
    await git(root, ['commit', '-q', '-m', 'c1'])
    await git(root, ['branch', 'sandcastle-pipeline/x'])
    const head = (await execFileAsync('git', ['rev-parse', 'refs/heads/sandcastle-pipeline/x'], { cwd: root })).stdout.trim()

    const r = await deriveBarrierSha({
      git: realGit(root),
      branch: 'sandcastle-pipeline/x',
      commits: [{ sha: head }],
    })
    expect(r.buildSha).toBe(head)
    expect(head).toMatch(/^[0-9a-f]{40}$/)
  }, 60_000)

  it('真 drift：命名分支再补一 commit 越过 landed → BarrierDriftError', async (ctx) => {
    if (!hasGit) return ctx.skip()
    await git(root, ['init', '-q', '-b', 'main'])
    await git(root, ['config', 'user.email', 'afk@test'])
    await git(root, ['config', 'user.name', 'afk'])
    await writeFile(join(root, 'f.txt'), 'hi')
    await git(root, ['add', '.'])
    await git(root, ['commit', '-q', '-m', 'c1'])
    await git(root, ['branch', 'sandcastle-pipeline/x'])
    const landed = (await execFileAsync('git', ['rev-parse', 'refs/heads/sandcastle-pipeline/x'], { cwd: root })).stdout.trim()
    // 带外写者把命名分支推过 landed
    await git(root, ['checkout', '-q', 'sandcastle-pipeline/x'])
    await writeFile(join(root, 'g.txt'), 'drift')
    await git(root, ['add', '.'])
    await git(root, ['commit', '-q', '-m', 'c2'])

    await expect(
      deriveBarrierSha({ git: realGit(root), branch: 'sandcastle-pipeline/x', commits: [{ sha: landed }] }),
    ).rejects.toBeInstanceOf(BarrierDriftError)
  }, 60_000)
})
