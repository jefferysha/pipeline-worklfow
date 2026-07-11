/**
 * cmdAfk('run') · image 三段链路证据（T21 评审 major 缺口）——automation.json 的 image 真流进
 * dockerRunChange 的 docker run argv，而不是只停在 afk.ts:124 那行三元表达式里。
 *
 * 背景：`opts.image ?? readAutomationJson(deps.cwd).image ?? DEFAULT_SANDCASTLE_IMAGE` 是 UI
 * 沙箱镜像输入框真实生效的唯一接线。--image 显式段已有 afk-run.integration.test.ts 真容器覆盖，
 * 但 automation.json 段此前零覆盖——若 root 取错或键名漂移（同 Task 1「store 没接线」先例），
 * image 会静默回落默认、输入框变假而无测试抓红。
 *
 * 打桩口径同 dockerRunChange.test.ts 的 makeFakeExec（fake exec 只省掉真 docker/git 子进程，
 * 装配链路 createAutomation → runRound → createDockerRunChange → runChangeInSandbox 全真）：
 *   · vi.mock 只动两点——dockerAvailable 恒 true（本测试不问 docker 探针，问的是 image 来源），
 *     createDockerRunChange 包一层注入 fake exec（opts 原样透传，image 由被测代码决定）；
 *   · readAutomationJson / createAutomation / runChangeInSandbox 全部走真实现；
 *   · deps.cwd 真临时 git 仓（currentBranch 真跑 `git branch --show-current`），
 *     .pipeline/automation.json 真落盘（readAutomationJson 真读文件，不 fake fs）。
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDeps, mockState } from '../test-support.js'
import { cmdAfk } from './afk.js'

const execFileAsync = promisify(execFile)
const SHA = 'a'.repeat(40)

/** fake exec 的 argv 记录（vi.mock 工厂被 hoist，必须用 vi.hoisted 共享可变引用）。 */
const h = vi.hoisted(() => ({ calls: [] as string[][] }))

vi.mock('@pipeline-lite/automation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pipeline-lite/automation')>()
  // 同 dockerRunChange.test.ts::makeFakeExec：docker exec 回合法握手让全程真跑完，
  // git rev-list / rev-parse 借同一 SHA——不起任何真容器/真 git 子进程。
  const fakeExec: typeof actual.nodeExec = async (file, args) => {
    h.calls.push([file, ...args])
    if (file === 'docker' && args[0] === 'exec') {
      return { stdout: `<output>{"verify_result":"pass","build_sha":"${SHA}","phase_event":"verify-pass"}</output>\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: `${SHA}\n`, stderr: '', exitCode: 0 }
  }
  return {
    ...actual,
    dockerAvailable: async () => true,
    createDockerRunChange: (opts: Parameters<typeof actual.createDockerRunChange>[0]) =>
      actual.createDockerRunChange({ ...opts, exec: fakeExec }),
  }
})

/** 本轮 fake exec 记录里的 `docker run` argv（join 成串好做 contains 断言）。 */
const dockerRunArgv = (): string => {
  const call = h.calls.find((c) => c[0] === 'docker' && c[1] === 'run')
  expect(call, 'runRound 应真调到 docker run（fake exec 记录）').toBeDefined()
  return call!.join(' ')
}

describe("cmdAfk('run') · image 同源三段链路（--image > automation.json > 内置默认）", () => {
  let cwd: string
  beforeEach(async () => {
    h.calls.length = 0
    cwd = await mkdtemp(join(tmpdir(), 'afk-image-src-'))
    // currentBranch 真跑 git branch --show-current（unborn 分支也返回分支名，无需 commit）
    await execFileAsync('git', ['init', '-q'], { cwd })
    // scanReadyFromFs 真 readdir openspec/changes/*；字段值由 makeDeps 的 mockStore 供给
    await mkdir(join(cwd, 'openspec', 'changes', 'w'), { recursive: true })
  })
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  const deps = () =>
    makeDeps({ cwd, states: { w: mockState({ phase: 'build', automation: 'queued' }) } })

  it('第二段（评审缺口）：无 --image 时 .pipeline/automation.json 的 image 真进 docker run argv', async () => {
    await mkdir(join(cwd, '.pipeline'), { recursive: true })
    await writeFile(join(cwd, '.pipeline', 'automation.json'), JSON.stringify({ image: 'sandcastle:from-file' }, null, 2))

    const d = deps()
    expect(await cmdAfk(d, 'run', undefined, {})).toBe(0)

    expect(dockerRunArgv()).toContain('sandcastle:from-file')
    expect(d.outLines.join('\n')).toContain('image=sandcastle:from-file')
  })

  it('第一段优先级：--image 显式覆盖 automation.json 的 image', async () => {
    await mkdir(join(cwd, '.pipeline'), { recursive: true })
    await writeFile(join(cwd, '.pipeline', 'automation.json'), JSON.stringify({ image: 'sandcastle:from-file' }, null, 2))

    const d = deps()
    expect(await cmdAfk(d, 'run', undefined, { image: 'sandcastle:explicit' })).toBe(0)

    const argv = dockerRunArgv()
    expect(argv).toContain('sandcastle:explicit')
    expect(argv).not.toContain('sandcastle:from-file')
  })

  it('第三段兜底：无 --image 且无 automation.json → 内置 sandcastle:local', async () => {
    const d = deps()
    expect(await cmdAfk(d, 'run', undefined, {})).toBe(0)
    expect(dockerRunArgv()).toContain('sandcastle:local')
  })

  it('文件 image 非法（值域被 readAutomationJson 丢弃）→ 回落内置默认，不把脏值灌进 docker', async () => {
    await mkdir(join(cwd, '.pipeline'), { recursive: true })
    await writeFile(join(cwd, '.pipeline', 'automation.json'), JSON.stringify({ image: 'bad image with spaces' }))

    const d = deps()
    expect(await cmdAfk(d, 'run', undefined, {})).toBe(0)

    const argv = dockerRunArgv()
    expect(argv).toContain('sandcastle:local')
    expect(argv).not.toContain('bad image')
  })
})

/**
 * v6 T2：cmdAfk('run') 凭证注入接线——机器级 secrets 文件(经 deps.readSecretsEnv)与宿主 env
 * 合并成 hostEnv 传给 createDockerRunChange。优先级:宿主 env 显式非空 > secrets 文件
 * (沿用 sdk「显式>文件」装配惯例;空串 env 视同缺席,不吃掉文件值)。fail-open:依赖未注入/
 * 读失败 → 行为与今天完全一致。env 用 vi.stubEnv 隔离(hermetic,不污染真机)。
 */
describe("cmdAfk('run') · 凭证注入(secrets 文件 × 宿主 env 合并)", () => {
  let cwd: string
  beforeEach(async () => {
    h.calls.length = 0
    cwd = await mkdtemp(join(tmpdir(), 'afk-cred-'))
    await execFileAsync('git', ['init', '-q'], { cwd })
    await mkdir(join(cwd, 'openspec', 'changes', 'w'), { recursive: true })
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(cwd, { recursive: true, force: true })
  })

  const deps = () =>
    makeDeps({ cwd, states: { w: mockState({ phase: 'build', automation: 'queued' }) } })

  it('secrets 文件有 token 而宿主 env 无(空串) → 文件值补位,docker run 注入 -e', async () => {
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', '')
    const d = deps()
    d.readSecretsEnv = async () => ({ CLAUDE_CODE_OAUTH_TOKEN: 'tok-from-file' })
    expect(await cmdAfk(d, 'run', undefined, {})).toBe(0)
    expect(dockerRunArgv()).toContain('CLAUDE_CODE_OAUTH_TOKEN=tok-from-file')
  })

  it('宿主 env 显式非空 → 覆盖 secrets 文件值(显式>文件)', async () => {
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'tok-from-env')
    const d = deps()
    d.readSecretsEnv = async () => ({ CLAUDE_CODE_OAUTH_TOKEN: 'tok-from-file' })
    expect(await cmdAfk(d, 'run', undefined, {})).toBe(0)
    const argv = dockerRunArgv()
    expect(argv).toContain('CLAUDE_CODE_OAUTH_TOKEN=tok-from-env')
    expect(argv).not.toContain('tok-from-file')
  })

  it('readSecretsEnv 未注入/读失败 → 行为与今天一致(无 token 不注入,run 正常跑完)', async () => {
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', '')
    const d = deps()
    expect(await cmdAfk(d, 'run', undefined, {})).toBe(0)
    expect(dockerRunArgv()).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')

    h.calls.length = 0
    const d2 = deps()
    d2.readSecretsEnv = async () => { throw new Error('secrets 读失败') }
    expect(await cmdAfk(d2, 'run', undefined, {})).toBe(0)
    expect(dockerRunArgv()).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
  })
})
