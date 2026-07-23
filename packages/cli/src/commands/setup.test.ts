/**
 * setup 命令 —— mock/真临时 fs 混合回归（full-install F3 骨架 + S2 技能安装段）。
 * 覆盖:①--dry-run 零写零软链(spy env 断言零 mutation);②ensurePipelineOnPath 真临时 HOME
 * 建软链/同源跳过/异源覆盖告警/非软链覆盖/缺 ~/.local/bin 建目录;③runtime 占位分派、skills 真实装派;
 * ④program 装配 flag 解析(--dry-run/--yes 透传);⑤技能安装段 S2 七钉(命令生成/官方第三方标注/幂等/
 * dry-run 零执行/失败容错/engine 附加/禁整装)。软链源解析(pluginRoot 优先 / selfPath 回退)单钉。
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { buildProgram, CliExit } from '../program.js'
import { readSkillSources, type SkillSource, type SkillSourcesResult } from '../skillSources.js'
import {
  buildSkillsPlan,
  cmdSetup,
  cmdSetupHost,
  cmdSetupRuntime,
  cmdSetupSkills,
  ensurePipelineOnPath,
  REAL_SETUP_ENV,
  resolvePipelineSource,
  type PlannedCommand,
  type RuntimeEnv,
  type SetupEnv,
} from './setup.js'
import type { ExecDockerFn } from '../afkReadiness.js'

// ── spy env:记录全部 fs mutation + exec 调用,断言「零副作用」/「未碰 PATH」/「零执行」──────
interface SpyCalls {
  mkdirp: string[]
  makeSymlink: Array<[string, string]>
  removePath: string[]
  chmodExec: string[]
  writeText: Array<[string, string]>
  exec: Array<[string, string[]]>
}
type ExecStub = (cmd: string, args: string[]) => { code: number; stdout: string; stderr: string }
function spyEnv(over: Partial<SetupEnv> = {}, exec?: ExecStub, confirmAns = true): { env: SetupEnv; calls: SpyCalls } {
  const calls: SpyCalls = { mkdirp: [], makeSymlink: [], removePath: [], chmodExec: [], writeText: [], exec: [] }
  const env: SetupEnv = {
    homeDir: () => '/home/test',
    pluginRoot: () => '/plugin',
    selfPath: () => '/plugin/packages/cli/dist/pipeline.mjs',
    mkdirp: (d) => { calls.mkdirp.push(d) },
    readSymlink: () => null,
    pathExists: () => false,
    commandExists: () => false,
    listDir: () => [],
    makeSymlink: (t, l) => { calls.makeSymlink.push([t, l]) },
    removePath: (p) => { calls.removePath.push(p) },
    chmodExec: (p) => { calls.chmodExec.push(p) },
    writeText: (p, text) => { calls.writeText.push([p, text]) },
    runCommand: (cmd, args) => { calls.exec.push([cmd, args]); return exec ? exec(cmd, args) : { code: 0, stdout: '', stderr: '' } },
    confirm: () => confirmAns,
    ...over,
  }
  return { env, calls }
}

// ── 运行时段 fake RuntimeEnv（注入 docker exec + hostEnv + image;零真 docker 子进程）──────────
/** 缺省:docker 可用 + 镜像在位;over 覆写 exec/hostEnv/resolveImage 造 docker 缺 / 镜像缺 / 凭证态。 */
function fakeRt(over: Partial<RuntimeEnv> = {}): RuntimeEnv {
  const okExec: ExecDockerFn = async (args) => {
    if (args[0] === 'info') return { stdout: 'ok', stderr: '', exitCode: 0 }
    if (args[0] === 'image' && args[1] === 'inspect') return { stdout: '[]', stderr: '', exitCode: 0 }
    return { stdout: '', stderr: '', exitCode: 0 }
  }
  return { exec: okExec, hostEnv: {}, resolveImage: () => 'sandcastle:local', ...over }
}
/** docker daemon 不可用（info 非零）——镜像 inspect 不应再被调（短路）。 */
const dockerDownExec: ExecDockerFn = async () => ({ stdout: '', stderr: 'daemon down', exitCode: 1 })

// ── S2 registry fixtures（inline SkillSource[] 子集,不碰真 yaml）──────────────────────
const ECC_NAMES = [
  'browser-qa', 'e2e-testing', 'search-first', 'deep-research', 'market-research', 'code-tour', 'github-ops',
  'react-patterns', 'python-patterns', 'python-testing', 'nestjs-patterns', 'postgres-patterns', 'docker-patterns',
  'deployment-patterns', 'frontend-patterns',
] as const
const eccSources: SkillSource[] = ECC_NAMES.map((n) => ({
  token: n, tool: 'skills-cli', source: 'affaan-m/ECC', skill: n,
  tier: n === 'browser-qa' || n === 'e2e-testing' ? 'mandatory' : 'optional', official: false,
  ...(n === 'browser-qa' ? { engine: 'playwright@claude-plugins-official' } : {}),
}))
const cmdText = (c: PlannedCommand): string => [c.cmd, ...c.args].join(' ')

/** Native setup must resolve the real plugin root from the host-owned inventory, not cache guesses. */
const codexInstallExec: ExecStub = (cmd, args) => {
  if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
    return {
      code: 0,
      stdout: JSON.stringify({
        installed: [{ name: 'pipeline-lite', marketplaceName: 'pipeline-lite', source: { path: '/installed/pipeline-lite' } }],
      }),
      stderr: '',
    }
  }
  return { code: 0, stdout: '', stderr: '' }
}

// ── 真 fs env:临时 HOME + 临时源,验证真软链行为 ─────────────────────────────────────
const tmpDirs: string[] = []
function mkTmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
function realEnv(home: string, source: string): SetupEnv {
  return { ...REAL_SETUP_ENV, homeDir: () => home, pluginRoot: () => null, selfPath: () => source }
}
function mkSource(): string {
  const dir = mkTmp('setup-src-')
  const source = join(dir, 'pipeline.mjs')
  writeFileSync(source, '#!/usr/bin/env node\n')
  return source
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('resolvePipelineSource —— 软链源解析', () => {
  test('pluginRoot 存在 → $CLAUDE_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs', () => {
    const { env } = spyEnv({ pluginRoot: () => '/plugin' })
    expect(resolvePipelineSource(env)).toBe('/plugin/packages/cli/dist/pipeline.mjs')
  })
  test('pluginRoot 缺失 → 回退 selfPath()（dev 场景）', () => {
    const { env } = spyEnv({ pluginRoot: () => null, selfPath: () => '/dev/dist/pipeline.mjs' })
    expect(resolvePipelineSource(env)).toBe('/dev/dist/pipeline.mjs')
  })
})

describe('①--dry-run —— 按宿主打印计划且零写、零软链', () => {
  test('setup --codex --dry-run:骨架含三段 + Phase 锚点,且零 mutation', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    expect(cmdSetup(deps, undefined, { codex: true, dryRun: true }, env)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('计划骨架')
    expect(out).toContain('唯一 pipeline-lite 插件')
    expect(out).toContain('内置技能')
    expect(out).toContain('技能安装计划')
    expect(out).toContain('运行时就绪检查')
    expect(out).toContain('--dry-run')
    // 零副作用铁律（含技能段:dry-run 零执行）
    expect(calls.mkdirp).toHaveLength(0)
    expect(calls.makeSymlink).toHaveLength(0)
    expect(calls.removePath).toHaveLength(0)
    expect(calls.chmodExec).toHaveLength(0)
    expect(calls.writeText).toHaveLength(0)
    expect(calls.exec).toHaveLength(0)
  })

  test('未选择宿主 → fail-loud，不会悄悄同时安装 Codex 与 Claude', () => {
    const deps = makeDeps()
    expect(cmdSetup(deps, undefined, { dryRun: true }, spyEnv().env)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('必须指定一个宿主')
  })
})

describe('①a 自动更新偏好 —— 只允许原生宿主，且在插件校验后写入用户配置', () => {
  test('Codex 原生安装验证通过后，--auto-update 写入精确的每日更新偏好', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv({
      readSymlink: () => '/installed/pipeline-lite/packages/cli/dist/pipeline.mjs',
      pathExists: () => true,
    }, codexInstallExec)

    expect(cmdSetupHost(deps, 'codex', { codex: true, autoUpdate: true }, env)).toBe(0)
    expect(calls.writeText).toEqual([[
      '/home/test/.config/pipeline-lite/auto-update.conf',
      'host=codex\nenabled=true\n',
    ]])
    expect(calls.mkdirp).toContain('/home/test/.config/pipeline-lite')
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin marketplace add jefferysha/pipeline-worklfow --ref main'],
      ['codex', 'plugin add pipeline-lite@pipeline-lite --json'],
      ['codex', 'plugin list --json'],
      ['bash', '/installed/pipeline-lite/tools/verify-skills.sh --quiet --root /installed/pipeline-lite'],
    ])
    expect(deps.outLines.join('\n')).toContain('已启用 --codex 自动更新')
    expect(deps.outLines.join('\n')).toContain('输入 /hooks')
  })

  test('adapter 不能借 --auto-update 伪装成有自己的发布通道', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()

    expect(cmdSetupHost(deps, 'cursor', { cursor: true, autoUpdate: true }, env)).toBe(1)
    expect(calls.exec).toEqual([])
    expect(calls.writeText).toEqual([])
    expect(deps.errLines.join('\n')).toContain('由承载它的 Codex 或 Claude 插件负责')
  })
})

describe('②ensurePipelineOnPath —— 真临时 HOME 软链行为', () => {
  test('首次:建 ~/.local/bin + 软链指向正确源 + 可执行', () => {
    const home = mkTmp('setup-home-')
    const source = mkSource()
    const deps = makeDeps()
    ensurePipelineOnPath(deps, realEnv(home, source))
    const binDir = join(home, '.local', 'bin')
    const link = join(binDir, 'pipeline')
    expect(existsSync(binDir)).toBe(true) // 缺 ~/.local/bin 时建目录
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readlinkSync(link)).toBe(source)
    expect(deps.outLines.join('\n')).toContain('已把 pipeline 软链到 PATH')
  })

  test('已存在同源:跳过（不重建）', () => {
    const home = mkTmp('setup-home-')
    const source = mkSource()
    const binDir = join(home, '.local', 'bin')
    mkdirSync(binDir, { recursive: true })
    symlinkSync(source, join(binDir, 'pipeline'))
    const deps = makeDeps()
    ensurePipelineOnPath(deps, realEnv(home, source))
    expect(readlinkSync(join(binDir, 'pipeline'))).toBe(source)
    expect(deps.outLines.join('\n')).toMatch(/同源|跳过/)
    expect(deps.errLines.join('\n')).not.toContain('WARN')
  })

  test('已存在异源:告警 + 覆盖为新源', () => {
    const home = mkTmp('setup-home-')
    const source = mkSource()
    const binDir = join(home, '.local', 'bin')
    mkdirSync(binDir, { recursive: true })
    symlinkSync('/some/old/pipeline.mjs', join(binDir, 'pipeline'))
    const deps = makeDeps()
    ensurePipelineOnPath(deps, realEnv(home, source))
    expect(readlinkSync(join(binDir, 'pipeline'))).toBe(source)
    expect(deps.errLines.join('\n')).toContain('WARN')
    expect(deps.errLines.join('\n')).toContain('/some/old/pipeline.mjs')
  })

  test('已存在非软链（普通文件）:告警 + 覆盖为软链', () => {
    const home = mkTmp('setup-home-')
    const source = mkSource()
    const binDir = join(home, '.local', 'bin')
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(binDir, 'pipeline'), 'old regular file')
    const deps = makeDeps()
    ensurePipelineOnPath(deps, realEnv(home, source))
    expect(lstatSync(join(binDir, 'pipeline')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(binDir, 'pipeline'))).toBe(source)
    expect(deps.errLines.join('\n')).toContain('WARN')
  })

  test('best-effort:mkdirp 抛错只 WARN,不崩', () => {
    const deps = makeDeps()
    const { env } = spyEnv({ mkdirp: () => { throw new Error('EACCES boom') } })
    expect(() => ensurePipelineOnPath(deps, env)).not.toThrow()
    expect(deps.errLines.join('\n')).toContain('WARN')
  })
})

describe('③skills/runtime 分派 —— skills 真实装派(dry-run 安全) / runtime 占位 / 未知 sub', () => {
  test('setup skills --dry-run → 打印技能计划 + exit 0 + 零 exec 零 mutation', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv() // 默认真 registry;dry-run 只出计划,不 exec
    expect(cmdSetup(deps, 'skills', { dryRun: true }, env)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('技能安装计划')
    expect(out).toContain('--dry-run')
    expect(calls.exec).toHaveLength(0)
    expect(calls.makeSymlink).toHaveLength(0)
    expect(calls.mkdirp).toHaveLength(0)
  })

  test('setup runtime 分派（注入 fake docker）→ 到达 cmdSetupRuntime，出就绪清单 + exit 0，零软链', async () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    const code = await cmdSetup(deps, 'runtime', {}, env, fakeRt())
    expect(code).toBe(0)
    expect(deps.outLines.join('\n')).toContain('就绪清单')
    expect(calls.makeSymlink).toHaveLength(0) // runtime 段不碰 PATH/软链
  })

  test('未知 sub → stderr + exit 1', () => {
    const deps = makeDeps()
    expect(cmdSetup(deps, 'frobnicate', {}, spyEnv().env)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('未知 setup 子命令')
  })
})

describe('⑨空 sub 全流程 —— 技能段后接运行时就绪清单（dry-run 只提示不真探测,R1 concern#1）', () => {
  test('非 dry-run:技能段之后真跑运行时就绪清单（注入 fakeRt,零真 docker）→ 出清单 + exit 0', async () => {
    const deps = makeDeps()
    // 全部已装 → 技能段几乎空跑;同源软链 → 跳过。聚焦「运行时段确实被接上」(零真 docker 由 fakeRt 保证)。
    const { env } = spyEnv({
      readSymlink: () => '/plugin/packages/cli/dist/pipeline.mjs',
      pathExists: () => true,
    }, codexInstallExec)
    const rt = fakeRt({ hostEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'a', OPENAI_API_KEY: 'b' } })
    const code = await cmdSetup(deps, undefined, { codex: true, yes: true }, env, rt)
    expect(code).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('技能安装计划') // 技能段跑了
    expect(out).toContain('就绪清单') // 运行时段也跑了（一屏）
    expect(out).toContain('docker daemon 可用')
  })

  test('--dry-run:运行时段只提示见 pipeline setup runtime,绝不真探测 docker（同步返 number,不碰 rt）', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    // 关键:不传 rt（用真实 REAL_RUNTIME_ENV 缺省）——dry-run 仍绝不起真 docker;同步返 number 即证未 await 探测。
    const code = cmdSetup(deps, undefined, { codex: true, dryRun: true }, env)
    expect(code).toBe(0) // 同步 number（非 Promise）——dry-run 不进异步运行时探测
    const out = deps.outLines.join('\n')
    expect(out).toContain('运行时就绪检查')
    expect(out).toContain('pipeline setup runtime') // 指引去独立子命令看真清单
    expect(out).toContain('--dry-run')
    expect(calls.exec).toHaveLength(0) // 零 exec（技能段 dry-run 零执行 + 运行时段未探测）
  })

  test('宿主 marketplace 安装失败时立即退出，不会把未验证的插件伪装成可运行环境', async () => {
    const deps = makeDeps()
    // 无已装 + 全 exec 失败 → 真 registry 的 mandatory 命令全败 → 技能段 exit 1。
    const exec: ExecStub = () => ({ code: 1, stdout: '', stderr: 'boom' })
    const { env } = spyEnv({ readSymlink: () => '/plugin/packages/cli/dist/pipeline.mjs' }, exec)
    const code = await cmdSetup(deps, undefined, { codex: true, yes: true }, env, fakeRt())
    expect(code).toBe(1)
    expect(deps.errLines.join('\n')).toContain('失败')
    expect(deps.outLines.join('\n')).not.toContain('就绪清单')
  })
})

describe('⑧运行时检查段 R1 —— AFK 就绪清单（docker/镜像/两 runner 凭证对称;缺镜像 build_hint;缺凭证去配 X）', () => {
  test('全就绪:docker 可用 + 镜像在位 + 两 runner 凭证已配（宿主 env）→ 清单全就绪 + exit 0', async () => {
    const deps = makeDeps()
    const rt = fakeRt({ hostEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'a', OPENAI_API_KEY: 'b', CODEX_HOME: '/c' } })
    expect(await cmdSetupRuntime(deps, {}, rt)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('就绪清单')
    expect(out).toContain('docker daemon 可用')
    expect(out).toContain('sandcastle:local 在位')
    expect(out).toContain('CLAUDE_CODE_OAUTH_TOKEN 已配（宿主 env）')
    expect(out).toContain('OPENAI_API_KEY 已配（宿主 env）')
    expect(out).not.toContain('[缺失]')
  })

  test('docker 不可用 → 降级标缺失（不抛不阻断,exit 0）;镜像未能核给 build_hint;附「怎么拿」docker 安装引导', async () => {
    const deps = makeDeps()
    expect(await cmdSetupRuntime(deps, {}, fakeRt({ exec: dockerDownExec }))).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('docker 不可用')
    expect(out).toContain('bash tools/sandcastle/build.sh') // build_hint 单一真相源
    // FI·G1:不光报缺,还引导怎么获取——装 OrbStack / Docker Desktop,且明示不自动装
    expect(out).toContain('OrbStack')
    expect(out).toContain('Docker Desktop')
    expect(out).toContain('不自动装')
  })

  test('docker 在但镜像缺（inspect 非零）→ [缺失] + 构建:build_hint 一键', async () => {
    const deps = makeDeps()
    const exec: ExecDockerFn = async (args) =>
      args[0] === 'info' ? { stdout: 'ok', stderr: '', exitCode: 0 } : { stdout: '', stderr: 'no image', exitCode: 1 }
    expect(await cmdSetupRuntime(deps, {}, fakeRt({ exec }))).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('docker daemon 可用')
    expect(out).toContain('构建:bash tools/sandcastle/build.sh')
  })

  test('凭证缺 → 去配 X;凭证值永不回显（secrets 明文不进输出）;codex 缺附「怎么拿」两条路,claude 已配则无 claude 引导', async () => {
    const deps = makeDeps()
    // secrets 供 claude-code token（明文），codex OPENAI_API_KEY 两源皆缺
    deps.readSecretsEnv = async () => ({ CLAUDE_CODE_OAUTH_TOKEN: 'super-secret-xyz' })
    const out0 = await cmdSetupRuntime(deps, {}, fakeRt({ hostEnv: {} }))
    expect(out0).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).not.toContain('super-secret-xyz') // 值永不回显
    expect(out).toContain('CLAUDE_CODE_OAUTH_TOKEN 已配（secrets 文件）') // 只报 set+source
    expect(out).toContain('去配 OPENAI_API_KEY') // 缺 → 去配硬指引
    // FI·G1:codex 缺 → 引导两条路（codex login / openai api-keys）;claude 已配 → 不出 claude 引导（只对缺项引导）
    expect(out).toContain('codex login')
    expect(out).toContain('platform.openai.com/api-keys')
    expect(out).not.toContain('claude setup-token')
  })

  test('Codex-first：默认 ~/.codex/auth.json 可读 → 不再要求 OPENAI_API_KEY', async () => {
    const deps = makeDeps()
    const rt = Object.assign(fakeRt({ hostEnv: {} }), {
      defaultCodexHome: '/users/codex-owner/.codex',
      canReadFile: (path: string) => path === '/users/codex-owner/.codex/auth.json',
    })
    expect(await cmdSetupRuntime(deps, {}, rt)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('默认 ~/.codex 登录')
    expect(out).not.toContain('去配 OPENAI_API_KEY')
  })

  test('claude-code 凭证缺 → 附「怎么拿」claude setup-token 引导（值永不回显）', async () => {
    const deps = makeDeps()
    // 两 runner 凭证两源皆缺（hostEnv 空 + 无 secrets）
    deps.readSecretsEnv = async () => ({})
    expect(await cmdSetupRuntime(deps, {}, fakeRt({ hostEnv: {} }))).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('去配 CLAUDE_CODE_OAUTH_TOKEN')
    expect(out).toContain('claude setup-token') // claude-code 缺 → 生成长期 OAuth token
    expect(out).toContain('codex login') // codex 也缺 → 两条路引导
  })

  test('两 runner 凭证对称:claude-code 已配、codex 全缺时,codex 的 OPENAI_API_KEY 与 CODEX_HOME 仍双双在清单（不缺席）', async () => {
    const deps = makeDeps()
    const rt = fakeRt({ hostEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'only-claude' } })
    expect(await cmdSetupRuntime(deps, {}, rt)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('codex 凭证 OPENAI_API_KEY')
    expect(out).toContain('codex CODEX_HOME') // codex 对等:两键都呈现
    expect(out).not.toContain('only-claude') // 值永不回显
  })

  test('--dry-run:出清单 + dry-run 说明,且零写（store.write 零调用）', async () => {
    const deps = makeDeps()
    expect(await cmdSetupRuntime(deps, { dryRun: true }, fakeRt({ exec: dockerDownExec }))).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('就绪清单')
    expect(out).toContain('--dry-run')
    expect(deps.store.write.calls).toHaveLength(0) // 运行时段只探测只打印,零写
  })
})

describe('④program 装配 —— flag 解析 --dry-run/--yes 透传', () => {
  async function runProgram(deps: ReturnType<typeof makeDeps>, args: string[]): Promise<number> {
    try {
      await buildProgram(deps).parseAsync(args, { from: 'user' })
      return 0
    } catch (e) {
      if (e instanceof CliExit) return e.code
      throw e
    }
  }

  test('setup --codex --dry-run:commander 解析为 host + dry-run（打印骨架、零副作用安全）', async () => {
    const deps = makeDeps()
    expect(await runProgram(deps, ['setup', '--codex', '--dry-run'])).toBe(0)
    expect(deps.outLines.join('\n')).toContain('--dry-run')
  })

  test('setup --dry-run 未指定宿主 → exit 1', async () => {
    const deps = makeDeps()
    expect(await runProgram(deps, ['setup', '--dry-run'])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('必须指定一个宿主')
  })

  test('setup skills --dry-run:commander 解析,出技能计划零全局写（真装留最终门,不入 CI）', async () => {
    const deps = makeDeps()
    expect(await runProgram(deps, ['setup', 'skills', '--dry-run'])).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('技能安装计划')
    expect(out).toContain('--dry-run')
  })
})

describe('⑤技能安装段 S2 —— 命令生成 / 标注 / 幂等 / dry-run 零执行 / 失败容错 / engine / 禁整装', () => {
  test('① ECC 15 token 聚合成一条 --skill×15,无裸 npx skills add affaan-m/ECC', () => {
    const plan = buildSkillsPlan(eccSources, spyEnv().env)
    const ecc = plan.commands.find((c) => c.source === 'affaan-m/ECC' && c.group === 'skills-cli')
    expect(ecc).toBeDefined()
    expect(ecc!.names).toHaveLength(15)
    expect(ecc!.args.filter((a) => a === '--skill')).toHaveLength(15)
    expect(ecc!.args).toEqual(expect.arrayContaining(['-g', '-y']))
    expect(ecc!.bareAdd).toBe(false)
    expect(cmdText(ecc!)).toContain('npx skills add affaan-m/ECC --skill browser-qa')
    // 禁整装:绝无 args 恰为 skills add affaan-m/ECC（缺 --skill）的整仓命令
    expect(plan.commands.some((c) => c.cmd === 'npx' && c.args.join(' ') === 'skills add affaan-m/ECC')).toBe(false)
  })

  test('真实 registry：default workflow 全部 bundled，不生成第三方 skills-cli/npm/marketplace 安装命令', () => {
    const plan = buildSkillsPlan(readSkillSources(), spyEnv().env)
    expect(plan.commands).toEqual([])
    expect(plan.noInstall.length).toBeGreaterThan(30)
    expect(plan.noInstall).toContainEqual({ token: 'brainstorming', tool: 'bundled' })
    expect(plan.noInstall).toContainEqual({ token: 'openspec-propose', tool: 'bundled' })
    expect(plan.noInstall).toContainEqual({ token: 'deployment-patterns', tool: 'bundled' })
  })

  test('① agents-inc marketplace-add 在逐 id install 之前，Codex 优先且保留 Claude 兼容；npm 一条；builtin/bundled 无命令', () => {
    const src: SkillSource[] = [
      { token: 'shadcn-ui', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-ui-shadcn-ui', tier: 'recommended', official: false },
      { token: 'tailwind-css-patterns', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-styling-tailwind', tier: 'recommended', official: false },
      { token: 'opsx', tool: 'npm', source: '@fission-ai/openspec', tier: 'mandatory', official: false },
      { token: 'verify', tool: 'builtin', source: 'claude-code', tier: 'mandatory', official: true },
      { token: 'openspec-propose', tool: 'bundled', source: 'pipeline-lite', tier: 'mandatory', official: false },
    ]
    const plan = buildSkillsPlan(src, spyEnv().env)
    const texts = plan.commands.map(cmdText)
    const codexAddIdx = texts.indexOf('codex plugin marketplace add agents-inc/skills')
    const claudeAddIdx = texts.indexOf('claude plugin marketplace add agents-inc/skills')
    const codexShadcnIdx = texts.indexOf('codex plugin add web-ui-shadcn-ui@agents-inc')
    const codexTailwindIdx = texts.indexOf('codex plugin add web-styling-tailwind@agents-inc')
    const claudeShadcnIdx = texts.indexOf('claude plugin install web-ui-shadcn-ui@agents-inc')
    expect(codexAddIdx).toBeGreaterThanOrEqual(0)
    expect(claudeAddIdx).toBeGreaterThanOrEqual(0)
    expect(codexAddIdx).toBeLessThan(codexShadcnIdx)
    expect(codexAddIdx).toBeLessThan(codexTailwindIdx)
    expect(claudeAddIdx).toBeLessThan(claudeShadcnIdx)
    expect(texts).toContain('npm install -g @fission-ai/openspec')
    expect(texts.some((s) => s.includes('verify') || s.includes('openspec-propose'))).toBe(false)
    expect(plan.noInstall.map((n) => n.token).sort()).toEqual(['openspec-propose', 'verify'])
  })

  test('② 官方/第三方标注:anthropics/claude-plugins-official=官方,ECC/agents-inc=第三方', () => {
    const src: SkillSource[] = [
      { token: 'web-artifacts-builder', tool: 'skills-cli', source: 'anthropics/skills', skill: 'web-artifacts-builder', tier: 'optional', official: true },
      { token: 'e2e-testing', tool: 'skills-cli', source: 'affaan-m/ECC', skill: 'e2e-testing', tier: 'mandatory', official: false },
      { token: 'shadcn-ui', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-ui-shadcn-ui', tier: 'recommended', official: false },
      { token: 'frontend-design', tool: 'claude-plugin', source: 'claude-plugins-official', skill: 'frontend-design', tier: 'mandatory', official: true },
    ]
    const plan = buildSkillsPlan(src, spyEnv().env)
    const byToken = (t: string): PlannedCommand => plan.commands.find((c) => c.tokens.includes(t))!
    expect(byToken('web-artifacts-builder').official).toBe(true)
    expect(byToken('e2e-testing').official).toBe(false)
    expect(byToken('shadcn-ui').official).toBe(false)
    expect(byToken('frontend-design').official).toBe(true)
  })

  test('③ 幂等:注入 ~/.agents/skills/e2e-testing 已装 → 从 ECC --skill 剔除并标跳过', () => {
    const three = eccSources.slice(0, 3) // browser-qa, e2e-testing, search-first
    const installed = join('/home/test', '.agents', 'skills', 'e2e-testing')
    const { env } = spyEnv({ pathExists: (p) => p === installed })
    const plan = buildSkillsPlan(three, env)
    const ecc = plan.commands.find((c) => c.source === 'affaan-m/ECC')!
    expect(ecc.names).not.toContain('e2e-testing')
    expect(ecc.names).toEqual(expect.arrayContaining(['browser-qa', 'search-first']))
    expect(plan.alreadyInstalled.map((a) => a.token)).toContain('e2e-testing')
  })

  test('③ 幂等:整组已装 → 整条命令剔除', () => {
    const { env } = spyEnv({ pathExists: () => true })
    const plan = buildSkillsPlan(eccSources, env)
    expect(plan.commands.filter((c) => c.source === 'affaan-m/ECC')).toHaveLength(0)
  })

  test('③ 幂等:npm registry 声明的全局 binary 已在 PATH → npm install 整条剔除', () => {
    const src = [{
      token: 'opsx', tool: 'npm', source: '@fission-ai/openspec', bin: 'openspec',
      tier: 'mandatory', official: false,
    }] as SkillSource[]
    const { env } = spyEnv({ commandExists: (name) => name === 'openspec' })
    const plan = buildSkillsPlan(src, env)
    expect(plan.commands.filter((c) => c.group === 'npm')).toHaveLength(0)
    expect(plan.alreadyInstalled).toContainEqual({ token: 'opsx', where: 'PATH:openspec' })
  })

  test('③ 幂等:registry 明示上游 unavailable → 不执行、不反复 WARN 安装失败', () => {
    const src = [{
      token: 'zoom-out', tool: 'skills-cli', source: 'mattpocock/skills', skill: 'zoom-out',
      unavailable: true, tier: 'optional', official: false,
    }] as SkillSource[]
    const plan = buildSkillsPlan(src, spyEnv().env)
    expect(plan.commands).toHaveLength(0)
    expect(plan.noInstall).toContainEqual({ token: 'zoom-out', tool: 'unavailable-upstream' })
  })

  test('③ 幂等：Codex 与 Claude 双 cache 都命中才算 plugin 全就绪，不每次重装', () => {
    const src: SkillSource[] = [
      { token: 'frontend-design', tool: 'claude-plugin', source: 'claude-plugins-official', skill: 'frontend-design', tier: 'mandatory', official: true },
    ]
    const claudeCache = join('/home/test', '.claude', 'plugins', 'cache')
    const codexCache = join('/home/test', '.codex', 'plugins', 'cache')
    const { env } = spyEnv({
      listDir: () => [],
      pathExists: (p) => p === join(claudeCache, 'claude-plugins-official', 'frontend-design')
        || p === join(codexCache, 'claude-plugins-official', 'frontend-design'),
    })
    const plan = buildSkillsPlan(src, env)
    expect(plan.commands.filter((c) => c.group === 'claude-plugin' || c.group === 'codex-plugin')).toHaveLength(0)
    expect(plan.alreadyInstalled.map((a) => a.token)).toContain('frontend-design')
  })

  test('Codex-first：Claude plugin 已装但 Codex cache 缺失，仍计划 codex plugin add，绝不误判全就绪', () => {
    const src: SkillSource[] = [
      { token: 'tailwind-css-patterns', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-styling-tailwind', tier: 'recommended', official: false },
    ]
    const claudePlugin = join('/home/test', '.claude', 'plugins', 'cache', 'agents-inc', 'web-styling-tailwind')
    const codexMarketplace = join('/home/test', '.codex', '.tmp', 'marketplaces', 'agents-inc')
    const { env } = spyEnv({ pathExists: (p) => p === claudePlugin || p === codexMarketplace })

    const plan = buildSkillsPlan(src, env)

    expect(plan.commands.map(cmdText)).toContain('codex plugin add web-styling-tailwind@agents-inc')
    expect(plan.commands.map(cmdText)).not.toContain('claude plugin install web-styling-tailwind@agents-inc')
    expect(plan.alreadyInstalled.map((row) => row.token)).not.toContain('tailwind-css-patterns')
  })

  test('④ cmdSetupSkills --dry-run:spy exec/mutation 调用数 0,计划仍列 ECC 15 个', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    expect(cmdSetupSkills(deps, { dryRun: true }, env, eccSources)).toBe(0)
    expect(calls.exec).toHaveLength(0)
    expect(calls.mkdirp).toHaveLength(0)
    expect(calls.makeSymlink).toHaveLength(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('--dry-run')
    expect(out).toContain('技能(15)')
  })

  test('⑤ 失败容错:mattpocock 装失败 → 其余仍跑,汇总红字,强制失败 exit 1', () => {
    const src: SkillSource[] = [
      { token: 'grill-with-docs', tool: 'skills-cli', source: 'mattpocock/skills', skill: 'grill-with-docs', tier: 'mandatory', official: false },
      { token: 'hallmark', tool: 'skills-cli', source: 'nutlope/hallmark', tier: 'recommended', official: false },
      { token: 'opsx', tool: 'npm', source: '@fission-ai/openspec', tier: 'mandatory', official: false },
    ]
    const execCalls: Array<[string, string[]]> = []
    const exec: ExecStub = (cmd, args) => {
      execCalls.push([cmd, args])
      if (args.includes('--list')) return { code: 0, stdout: 'grill-with-docs', stderr: '' } // --list 回显名,不制造漂移
      if (args.includes('mattpocock/skills')) return { code: 1, stdout: '', stderr: 'network unreachable' }
      return { code: 0, stdout: '', stderr: '' }
    }
    const deps = makeDeps()
    const { env } = spyEnv({}, exec)
    expect(cmdSetupSkills(deps, { yes: true }, env, src)).toBe(1) // 强制级失败 → 非零
    // 其余仍跑:hallmark + openspec 都被 exec（不 abort）
    expect(execCalls.some(([, a]) => a.includes('nutlope/hallmark'))).toBe(true)
    expect(execCalls.some(([, a]) => a.join(' ').includes('@fission-ai/openspec'))).toBe(true)
    const err = deps.errLines.join('\n')
    expect(err).toContain('mattpocock/skills')
    expect(err).toContain('强制')
  })

  test('⑤ 非强制失败不改退出码:hallmark 失败 → exit 0', () => {
    const src: SkillSource[] = [
      { token: 'hallmark', tool: 'skills-cli', source: 'nutlope/hallmark', tier: 'recommended', official: false },
    ]
    const exec: ExecStub = () => ({ code: 1, stdout: '', stderr: 'boom' })
    const deps = makeDeps()
    const { env } = spyEnv({}, exec)
    expect(cmdSetupSkills(deps, { yes: true }, env, src)).toBe(0)
    expect(deps.errLines.join('\n')).toContain('nutlope/hallmark')
  })

  test('安装命令 exit 0 但请求技能未真正出现在用户级目录 → 不计成功并按真实 tier 失败', () => {
    const src: SkillSource[] = [
      { token: 'browser-qa', tool: 'skills-cli', source: 'affaan-m/ECC', skill: 'browser-qa', tier: 'mandatory', official: false },
    ]
    const exec: ExecStub = (_cmd, args) => args.includes('--list')
      ? { code: 0, stdout: 'browser-qa\n', stderr: '' }
      : { code: 0, stdout: 'installer claimed success', stderr: '' }
    const deps = makeDeps()
    const { env } = spyEnv({}, exec)
    expect(cmdSetupSkills(deps, { yes: true }, env, src)).toBe(1)
    expect(deps.outLines.join('\n')).toContain('成功 0')
    expect(deps.errLines.join('\n')).toContain('命令 exit 0')
    expect(deps.errLines.join('\n')).toContain('browser-qa')
  })

  test('⑥ browser-qa 的 engine → Codex 优先并附加 Claude 兼容的 playwright plugin（官方）', () => {
    const src: SkillSource[] = [
      { token: 'browser-qa', tool: 'skills-cli', source: 'affaan-m/ECC', skill: 'browser-qa', tier: 'mandatory', official: false, engine: 'playwright@claude-plugins-official' },
    ]
    const plan = buildSkillsPlan(src, spyEnv().env)
    expect(plan.commands.map(cmdText)).toContain('claude plugin install playwright@claude-plugins-official')
    expect(plan.commands.map(cmdText)).toContain('codex plugin add playwright@claude-plugins-official')
    const pw = plan.commands.find((c) => c.group === 'claude-plugin' && c.args.includes('playwright@claude-plugins-official'))!
    expect(pw.group).toBe('claude-plugin')
    expect(pw.official).toBe(true)
  })

  test('⑦ 真 registry 全量：不再有任何外部安装命令，所有 token 都由随包 skill 提供', () => {
    const all = readSkillSources()
    expect(all.length).toBeGreaterThan(0) // registry 加载成功
    const plan = buildSkillsPlan(all, spyEnv().env)
    expect(plan.commands).toEqual([])
    expect(plan.noInstall).toHaveLength(all.length)
    expect(plan.noInstall.every((entry) => entry.tool === 'bundled')).toBe(true)
  })
})

describe('⑩ registry 就绪门 —— 坏/缺 registry fail-loud（不空计划假成功），真空 registry 才走无待装', () => {
  const failLoader = (): SkillSourcesResult => ({ ok: false, error: '解析失败: token x tool 非法' })
  const emptyLoader = (): SkillSourcesResult => ({ ok: true, sources: [] })

  test('坏 registry（loader 报失败）→ 非零退出 + 明示 registry 未就绪，不打印「无待装」假成功', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    const code = cmdSetupSkills(deps, { yes: true }, env, undefined, failLoader)
    expect(code).not.toBe(0) // 非零退出（不假成功）
    const err = deps.errLines.join('\n')
    expect(err).toContain('registry 未就绪')
    expect(err).toContain('解析失败') // 携具体原因
    expect(deps.outLines.join('\n')).not.toContain('无待装') // 绝不当空计划走假成功
    expect(calls.exec).toHaveLength(0) // 未执行任何安装命令
  })

  test('坏 registry + --dry-run 也 fail-loud（零执行，仍非零，不假成功）', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    const code = cmdSetupSkills(deps, { dryRun: true }, env, undefined, failLoader)
    expect(code).not.toBe(0)
    expect(deps.errLines.join('\n')).toContain('registry 未就绪')
    expect(calls.exec).toHaveLength(0)
  })

  test('真空 registry（合法但无条目）→ 走「无待装」+ exit 0（与坏 registry 区分）', () => {
    const deps = makeDeps()
    const { env } = spyEnv()
    const code = cmdSetupSkills(deps, { yes: true }, env, undefined, emptyLoader)
    expect(code).toBe(0)
    expect(deps.outLines.join('\n')).toContain('无待装')
    expect(deps.errLines.join('\n')).not.toContain('registry 未就绪')
  })
})
