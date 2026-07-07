/**
 * afk run —— #29-wire 真接线 e2e（GOAL C9）：`pipeline afk run` 不再只 report，真调
 * automation.runRound(createDockerRunChange(...)) 跑真容器 + 真 git worktree + 真 merge-back。
 *
 * 镜像同 dockerRunChange.integration.test.ts 用 `sandcastle:test`（同名同 Dockerfile，docker build
 * 天然幂等去重）；本文件**自足**真构建（不假设另一文件先跑过）——vitest 默认并行/乱序跑测试文件，
 * 依赖跨文件执行顺序会在 CI 上偶发假 honest-skip（docker 有、只是镜像还没建好）。
 * 无 docker → honest skip，绝不伪绿。
 */
import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeHarness, type Harness } from './integration-harness.js'

const execFileAsync = promisify(execFile)
const IMAGE = 'sandcastle:test' // 与 dockerRunChange.integration.test.ts 同名同 Dockerfile，build 天然去重
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..') // src → cli → packages → 根
const bundlePath = join(repoRoot, 'packages', 'cli', 'dist', 'pipeline.mjs')
const dockerfile = join(repoRoot, 'tools', 'sandcastle', 'Dockerfile')

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd })
}

let hasImage = false

describe('afk run —— 真调 docker 执行接线（#29-wire 落地到 CLI）', () => {
  beforeAll(async () => {
    let hasDocker = false
    try {
      await execFileAsync('docker', ['info'])
      hasDocker = true
    } catch {
      console.warn('[HONEST SKIP] docker daemon 不可用 → afk run CLI e2e 跳过，绝不伪绿')
    }
    if (!hasDocker) return
    try {
      await access(bundlePath)
    } catch {
      console.warn('[HONEST SKIP] 缺 packages/cli/dist/pipeline.mjs（先 npm run build）→ afk run CLI e2e 跳过')
      return
    }
    // docker build 对同 tag 天然幂等去重：若 dockerRunChange.integration.test.ts 已建过，这里秒过。
    await execFileAsync('docker', [
      'build', '-f', dockerfile, '-t', IMAGE, '--build-arg', 'WITH_CLAUDE_CODE=false', repoRoot,
    ]).catch(() => { /* 构建失败：下面 image inspect 会证实并 honest-skip */ })
    try {
      await execFileAsync('docker', ['image', 'inspect', IMAGE])
      hasImage = true
    } catch {
      console.warn('[HONEST SKIP] sandcastle:test 镜像构建失败 → afk run CLI e2e 跳过')
    }
  }, 300_000)

  let h: Harness
  beforeEach(async () => {
    if (!hasImage) return
    h = makeHarness(await mkdtemp(join(tmpdir(), 'afk-run-e2e-')))
    await git(h.cwd, ['init', '-q'])
    await git(h.cwd, ['config', 'user.email', 'test@pipeline.local'])
    await git(h.cwd, ['config', 'user.name', 'test'])
    await git(h.cwd, ['config', 'commit.gpgsign', 'false'])
  })
  afterEach(async () => {
    if (hasImage) await rm(h.cwd, { recursive: true, force: true })
  })

  it('L3 --image：真容器跑 + 真 merge-back，automation=merged，host 真拿到产物', async (ctx) => {
    if (!hasImage) { ctx.skip(); return }
    await h.run(['init', 'x', '--track', 'backend', '--preset', 'full'])
    await h.run(['set', 'x', 'phase', 'build'])
    await git(h.cwd, ['add', '-A'])
    await git(h.cwd, ['commit', '-q', '-m', 'seed'])

    expect(await h.run(['afk', 'enqueue', 'x'])).toBe(0)
    expect(await h.run(['afk', 'run', '--level', 'L3', '--image', IMAGE])).toBe(0)

    expect(await h.read('x')).toMatch(/^automation: merged$/m)
    const produced = await readFile(join(h.cwd, '.sandcastle-build', 'x.done'), 'utf8')
    expect(produced).toContain('afk build for x')
  }, 120_000)

  it('默认 L1 report-only：真容器跑成功但落 paused，不 merge', async (ctx) => {
    if (!hasImage) { ctx.skip(); return }
    await h.run(['init', 'y', '--track', 'backend', '--preset', 'full'])
    await h.run(['set', 'y', 'phase', 'build'])
    await git(h.cwd, ['add', '-A'])
    await git(h.cwd, ['commit', '-q', '-m', 'seed'])

    await h.run(['afk', 'enqueue', 'y'])
    expect(await h.run(['afk', 'run', '--image', IMAGE])).toBe(0)

    const yaml = await h.read('y')
    expect(yaml).toMatch(/^automation: paused$/m)
    let leaked = false
    try { await access(join(h.cwd, '.sandcastle-build', 'y.done')); leaked = true } catch { /* 期望不存在 */ }
    expect(leaked).toBe(false)

    // Task 1 收尾缺口修复验证（.superpowers/sdd/task-1-report.md「Concerns」）：真 cmdAfk('run')
    // 全链（非 fake ports——这里是真 docker 容器 + 真 CLI argv 解析）应该把 automation_sandbox/
    // automation_worktree 真写回磁盘。此前 afk.ts 没把 deps.store 传进 createDockerRunChange，
    // ports.ts 的 setStateField 缺省 no-op，两个字段永远停在 init 时的 ""。
    expect(yaml).toMatch(/^automation_sandbox: sandcastle-/m)
    expect(yaml).not.toMatch(/^automation_worktree: ""$/m)
  }, 120_000)

  it('就绪队列为空 → 诚实报告，不起容器', async (ctx) => {
    if (!hasImage) { ctx.skip(); return }
    await h.run(['init', 'z', '--track', 'backend', '--preset', 'full']) // 相位仍 open，非 build → 不就绪
    expect(await h.run(['afk', 'run', '--image', IMAGE])).toBe(0)
    expect(h.out.join('\n')).toContain('就绪队列空')
  })
})

describe('afk run —— 无 docker 环境诚实降级（不依赖 IMAGE 探针，真跑 docker info）', () => {
  it('docker 不可用 → 报告就绪队列 + 明示不执行容器，exit 0', async (ctx) => {
    // 只有在这台机器确实没有 docker 时才有意义；有 docker 时这个分支在别的机器上验证，本地不強跑。
    try {
      await execFileAsync('docker', ['info'])
      ctx.skip() // 本机有 docker：诚实分支交给没有 docker 的机器验证，避免本用例假造缺失
      return
    } catch { /* 真无 docker，继续 */ }
    const h2 = makeHarness(await mkdtemp(join(tmpdir(), 'afk-run-nodocker-')))
    try {
      await h2.run(['init', 'c1', '--track', 'backend', '--preset', 'full'])
      expect(await h2.run(['afk', 'run'])).toBe(0)
      expect(h2.err.join('\n')).toMatch(/docker/i)
    } finally {
      await rm(h2.cwd, { recursive: true, force: true })
    }
  })
})
