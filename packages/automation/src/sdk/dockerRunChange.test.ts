import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStateStore } from '@pipeline-lite/kernel'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExecFn, ExecResult } from '../runner/exec.js'
import { createDockerRunChange } from './dockerRunChange.js'

/**
 * createDockerRunChange 装配面（fake exec，无需真 docker）：
 *   extraEnv 真流到 docker run -e argv（不是只停在 RunChangeConfig 里没往下传）。
 * 真容器端到端在 dockerRunChange.integration.test.ts 覆盖。
 */
const SHA = 'a'.repeat(40)

const makeFakeExec = (): { exec: ExecFn; calls: string[][] } => {
  const calls: string[][] = []
  const exec: ExecFn = async (file, args) => {
    calls.push([file, ...args])
    // docker exec（沙箱内 pipeline-afk-run）→ 回一个合法握手，让全程真跑完（而非中途因假 stdout
    // 触发 StructuredOutputError——那会掩盖本测试真正要看的 docker run argv 断言之外的噪声）。
    if (file === 'docker' && args[0] === 'exec') {
      return { stdout: `<output>{"verify_result":"pass","build_sha":"${SHA}","phase_event":"verify-pass"}</output>\n`, stderr: '', exitCode: 0 }
    }
    if (file === 'git' && args.includes('rev-list')) {
      return { stdout: `${SHA}\n`, stderr: '', exitCode: 0 } // collectCommits：一条落地 commit
    }
    const res: ExecResult = { stdout: `${SHA}\n`, stderr: '', exitCode: 0 } // rev-parse 等：借同一 SHA
    return res
  }
  return { exec, calls }
}

describe('createDockerRunChange · extraEnv 真流到 docker run argv', () => {
  let repo: string
  beforeEach(async () => { repo = await mkdtemp(join(tmpdir(), 'dockerrc-argv-')) })
  afterEach(async () => { await rm(repo, { recursive: true, force: true }) })

  it('opts.extraEnv 的每个键值都以 -e KEY=VALUE 出现在 docker run 调用里', async () => {
    const { exec, calls } = makeFakeExec()
    const runChange = createDockerRunChange({
      hostRepoDir: repo, base: 'main', level: 'L1', image: 'sandcastle:local', exec,
      extraEnv: { ANTHROPIC_BASE_URL: 'http://host.docker.internal:9', CLAUDE_CODE_OAUTH_TOKEN: 'tok-secret' },
    })
    await runChange('x', new AbortController().signal)

    const dockerRun = calls.find((c) => c[0] === 'docker' && c[1] === 'run')
    expect(dockerRun).toBeDefined()
    expect(dockerRun).toContain('-e')
    const joined = dockerRun!.join(' ')
    expect(joined).toContain('ANTHROPIC_BASE_URL=http://host.docker.internal:9')
    expect(joined).toContain('CLAUDE_CODE_OAUTH_TOKEN=tok-secret')
  })

  it('未传 extraEnv 时不炸（缺省行为不变，仍只有 PIPELINE_AFK=1）', async () => {
    const { exec, calls } = makeFakeExec()
    const runChange = createDockerRunChange({ hostRepoDir: repo, base: 'main', level: 'L1', image: 'sandcastle:local', exec })
    await runChange('x', new AbortController().signal)
    const dockerRun = calls.find((c) => c[0] === 'docker' && c[1] === 'run')
    expect(dockerRun!.join(' ')).toContain('PIPELINE_AFK=1')
  })
})

/**
 * Task 1 收尾缺口修复（真相源：.superpowers/sdd/task-1-report.md「Concerns」）：Task 1 让
 * runChangeInSandbox 真写 automation_sandbox/automation_worktree，但 createDockerRunChange
 * 从未把 setStateField 接进 createLifecyclePorts——即便调用方想接线真 StateStore 也没有入口。
 * 本组测试用**真 kernel StateStore**（非 fake ports）+ 真 createDockerRunChange 装配链路
 * （fake exec 只是省掉真 docker/git 子进程，不碰状态写回这条断言链），证明 opts.store 一旦注入，
 * 两个字段真的落盘非空——而不是仅在 lifecycle.ts 的注入面测试里用 fake setStateField 验证过。
 */
describe('createDockerRunChange · opts.store 真接线（Task 1 收尾缺口）', () => {
  let repo: string
  beforeEach(async () => { repo = await mkdtemp(join(tmpdir(), 'dockerrc-store-')) })
  afterEach(async () => { await rm(repo, { recursive: true, force: true }) })

  it('注入真 StateStore 后，runChange 结束前把 automation_sandbox/automation_worktree 真写回该 store（非空）', async () => {
    const { exec } = makeFakeExec()
    const store = createStateStore()
    const dir = await store.init({ repoRoot: repo, name: 'w', track: 'backend', preset: 'full' })
    // 起点：init 缺省两字段都是空串（CONTRACT §1 emptyFields()）——这是 gap 存在时测试会卡住不动的初值。
    expect(await store.get(dir, 'automation_sandbox')).toBe('')
    expect(await store.get(dir, 'automation_worktree')).toBe('')

    const runChange = createDockerRunChange({
      hostRepoDir: repo, base: 'main', level: 'L1', image: 'sandcastle:local', exec, store,
    })
    await runChange('w', new AbortController().signal)

    const sandbox = await store.get(dir, 'automation_sandbox')
    const worktree = await store.get(dir, 'automation_worktree')
    expect(sandbox).not.toBe('')
    expect(sandbox).toMatch(/^sandcastle-/)
    expect(worktree).not.toBe('')
  })

  it('未传 opts.store 时行为不变（缺省 no-op，不 throw、不阻断 run）', async () => {
    const { exec } = makeFakeExec()
    const runChange = createDockerRunChange({ hostRepoDir: repo, base: 'main', level: 'L1', image: 'sandcastle:local', exec })
    await expect(runChange('x', new AbortController().signal)).resolves.toBeDefined()
  })
})
