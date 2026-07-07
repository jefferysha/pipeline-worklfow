import { mkdtemp, rm, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStateStore } from '@pipeline-lite/kernel'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { worktreePathFor } from '../lifecycle/worktree.js'
import { dockerAvailable } from '../runner/docker.js'
import { nodeExec } from '../runner/exec.js'
import { createAutomation } from './sdk.js'
import { createDockerRunChange } from './dockerRunChange.js'

/**
 * #29-wire 全链 e2e（诚实门，翻 automation docker honest-skip 的执行接线）：
 *   真 build sandcastle 镜像 → 真 docker 容器 → 真 git worktree（挂载）→ 沙箱内 pipeline-afk-run
 *   确定性 build commit → 回读 <output> 握手 → host collectCommits + barrier build_sha → L3 真 merge-back。
 *
 *   · 无 docker daemon → honest skip（ctx.skip，vitest 计 skipped）+ 打印缺什么，绝不伪绿。
 *   · 缺编译产物 packages/cli/dist/pipeline.mjs（先 npm run build）→ honest skip。
 *   · full CC-in-sandbox（真 agent 编码）→ 需 CLAUDE_CODE_OAUTH_TOKEN + WITH_CLAUDE_CODE 镜像 → honest skip。
 *   · 任何路径都不为绿伪造 pass（非零退出真抛错、noop 真判、merge 冲突真留现场）。
 */
const IMAGE = 'sandcastle:test'
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..', '..') // sdk → src → automation → packages → root
const bundlePath = join(repoRoot, 'packages', 'cli', 'dist', 'pipeline.mjs')
const dockerfile = join(repoRoot, 'tools', 'sandcastle', 'Dockerfile')

let hasDocker = false
let imageReady = false
let skipReason = ''

const clock = () => '2026-07-07T00:00:00Z'

async function git(cwd: string, args: string[]): Promise<void> {
  const r = await nodeExec('git', args, { cwd })
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
}

describe('createDockerRunChange · 真 docker 全链执行（#29-wire）', () => {
  beforeAll(async () => {
    hasDocker = await dockerAvailable((f, a) => nodeExec(f, a))
    if (!hasDocker) {
      skipReason = 'docker daemon 不可用（docker info 失败）'
      console.warn(`[HONEST SKIP] ${skipReason} → #29-wire 全链 IT 跳过，绝不伪绿。装 docker 后本地/CI 真跑。`)
      return
    }
    try {
      await access(bundlePath)
    } catch {
      skipReason = '缺 packages/cli/dist/pipeline.mjs（先 npm run build）'
      console.warn(`[HONEST SKIP] ${skipReason} → #29-wire 全链 IT 跳过`)
      return
    }
    // 精简镜像（无 claude-code agent 层）：确定性驱动 pipeline-afk-run，docker 层缓存使重跑很快。
    const r = await nodeExec('docker', [
      'build', '-f', dockerfile, '-t', IMAGE, '--build-arg', 'WITH_CLAUDE_CODE=false', repoRoot,
    ])
    if (r.exitCode !== 0) {
      skipReason = `sandcastle 镜像构建失败: ${r.stderr.slice(-500)}`
      console.warn(`[HONEST SKIP] ${skipReason}`)
      return
    }
    imageReady = true
  }, 600_000)

  let repo: string
  const store = createStateStore()

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'afk-wire-'))
    if (!imageReady) return
    await git(repo, ['init', '-q'])
    await git(repo, ['config', 'user.email', 'test@pipeline.local'])
    await git(repo, ['config', 'user.name', 'test'])
    await git(repo, ['config', 'commit.gpgsign', 'false'])
  })
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  const seedChange = async (name: string): Promise<string> => {
    const dir = await store.init({ repoRoot: repo, name, track: 'backend', preset: 'full', clock })
    await store.set(dir, 'phase', 'build')
    await git(repo, ['add', '-A'])
    await git(repo, ['commit', '-q', '-m', 'seed change'])
    return dir
  }

  it('L3：真容器跑 pipeline-afk-run → 回读握手 → 真 merge-back 落 host base（automation=merged）', async (ctx) => {
    if (!imageReady) {
      ctx.skip()
      return
    }
    const dir = await seedChange('x')
    const base = (await nodeExec('git', ['branch', '--show-current'], { cwd: repo })).stdout.trim()

    const auto = createAutomation({ repoRoot: repo, store, clock, config: { level: 'L3', enabled: true, defaultOptIn: true } })
    expect(await auto.enqueue('x')).toBe(true)

    const runChange = createDockerRunChange({
      hostRepoDir: repo, base, level: 'L3', image: IMAGE, idleMs: 120_000, graceMs: 15_000,
    })
    await auto.runRound(runChange)

    // 真落盘 merged（L3 自动合并；非伪造：只有沙箱真跑成功 + 真 merge 才到 merged）
    expect(await store.get(dir, 'automation')).toBe('merged')

    // host base 真拿到沙箱在命名分支上落的 build 产物（merge-back 真发生）
    const merged = await readFile(join(repo, '.sandcastle-build', 'x.done'), 'utf8')
    expect(merged).toContain('afk build for x')

    // 命名分支真存在且带真 commit（barrier build_sha 锚点）
    const branches = (await nodeExec('git', ['branch', '--list', 'sandcastle-pipeline/x'], { cwd: repo })).stdout
    expect(branches).toContain('sandcastle-pipeline/x')

    // afk-workbench Task 2 teardown 修复（见 task-2-report.md "Fix: log survives teardown"）：
    // L3 也走同一条结算落盘路径——worktree 真被 runChangeInSandbox 的 finally 块清掉之后，完整
    // 日志仍要能从 host 侧 openspec/changes/<name>/.sandcastle-run.log 读到。
    let worktreeLeaked = false
    try {
      await access(worktreePathFor(repo, 'sandcastle-pipeline/x'))
      worktreeLeaked = true
    } catch {
      /* 期望：真被 teardown 删除 */
    }
    expect(worktreeLeaked).toBe(false)
    const runLog = await readFile(join(dir, '.sandcastle-run.log'), 'utf8')
    expect(runLog).toContain('<output>')
    expect(runLog).toContain('verify_result')
  }, 300_000)

  it('L1 report-only：真容器跑成功但**不自动 merge**（automation=paused，host base 不含产物）', async (ctx) => {
    if (!imageReady) {
      ctx.skip()
      return
    }
    const dir = await seedChange('y')
    const base = (await nodeExec('git', ['branch', '--show-current'], { cwd: repo })).stdout.trim()

    const auto = createAutomation({ repoRoot: repo, store, clock, config: { level: 'L1', enabled: true, defaultOptIn: true } })
    await auto.enqueue('y')
    const runChange = createDockerRunChange({
      hostRepoDir: repo, base, level: 'L1', image: IMAGE, idleMs: 120_000, graceMs: 15_000,
    })
    await auto.runRound(runChange)

    // L1 安全默认：成功也停 paused，不自动合并回主线
    expect(await store.get(dir, 'automation')).toBe('paused')
    // host base 不含沙箱产物（未 merge）
    let leaked = false
    try { await access(join(repo, '.sandcastle-build', 'y.done')); leaked = true } catch { /* 期望不存在 */ }
    expect(leaked).toBe(false)

    // afk-workbench Task 2 teardown 修复（见 task-2-report.md "Fix: log survives teardown"）：
    // 早期版本把完整日志落在 worktree 内——但成功结算这一类，runChangeInSandbox 的 finally 块
    // 会真删 worktree（下方断言先钉死这一点：worktree 目录真的从磁盘消失，不是编排层偷懒没删），
    // 日志刚写完就随之消失。真容器跑完这个最常见的"成功"结局后，完整日志现在应仍可从 host 侧
    // openspec/changes/<name>/.sandcastle-run.log 读到。
    let worktreeLeaked = false
    try {
      await access(worktreePathFor(repo, 'sandcastle-pipeline/y'))
      worktreeLeaked = true
    } catch {
      /* 期望：真被 teardown 删除——这正是缺口曾经发生的地方 */
    }
    expect(worktreeLeaked).toBe(false)
    const runLog = await readFile(join(dir, '.sandcastle-run.log'), 'utf8')
    expect(runLog).toContain('<output>')
    expect(runLog).toContain('verify_result')
  }, 300_000)

  it('full CC-in-sandbox（真 agent 编码）需 CLAUDE_CODE_OAUTH_TOKEN + WITH_CLAUDE_CODE 镜像 → honest skip', (ctx) => {
    if (!imageReady) {
      ctx.skip()
      return
    }
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      console.warn('[HONEST SKIP] 缺 CLAUDE_CODE_OAUTH_TOKEN → full CC-in-sandbox 跳过（缺沙箱内 agent 认证）')
      ctx.skip()
      return
    }
    console.warn('[HONEST SKIP] full CC-in-sandbox 需 WITH_CLAUDE_CODE=true 镜像 + 真 agent 编码，本 wire 的 host 侧全链已覆盖')
    ctx.skip()
  })
})
