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
import { readSkillSources, type SkillSource } from '../skillSources.js'
import {
  buildSkillsPlan,
  cmdSetup,
  cmdSetupSkills,
  ensurePipelineOnPath,
  REAL_SETUP_ENV,
  resolvePipelineSource,
  type PlannedCommand,
  type SetupEnv,
} from './setup.js'

// ── spy env:记录全部 fs mutation + exec 调用,断言「零副作用」/「未碰 PATH」/「零执行」──────
interface SpyCalls {
  mkdirp: string[]
  makeSymlink: Array<[string, string]>
  removePath: string[]
  chmodExec: string[]
  exec: Array<[string, string[]]>
}
type ExecStub = (cmd: string, args: string[]) => { code: number; stdout: string; stderr: string }
function spyEnv(over: Partial<SetupEnv> = {}, exec?: ExecStub, confirmAns = true): { env: SetupEnv; calls: SpyCalls } {
  const calls: SpyCalls = { mkdirp: [], makeSymlink: [], removePath: [], chmodExec: [], exec: [] }
  const env: SetupEnv = {
    homeDir: () => '/home/test',
    pluginRoot: () => '/plugin',
    selfPath: () => '/plugin/packages/cli/dist/pipeline.mjs',
    mkdirp: (d) => { calls.mkdirp.push(d) },
    readSymlink: () => null,
    pathExists: () => false,
    makeSymlink: (t, l) => { calls.makeSymlink.push([t, l]) },
    removePath: (p) => { calls.removePath.push(p) },
    chmodExec: (p) => { calls.chmodExec.push(p) },
    runCommand: (cmd, args) => { calls.exec.push([cmd, args]); return exec ? exec(cmd, args) : { code: 0, stdout: '', stderr: '' } },
    confirm: () => confirmAns,
    ...over,
  }
  return { env, calls }
}

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

describe('①--dry-run —— 打印计划骨架且零写、零软链', () => {
  test('空 sub + --dry-run:骨架含三段 + Phase 锚点,且零 mutation', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    expect(cmdSetup(deps, undefined, { dryRun: true }, env)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('计划骨架')
    expect(out).toContain('技能安装')
    expect(out).toContain('Phase 2')
    expect(out).toContain('运行时检查')
    expect(out).toContain('Phase 3')
    expect(out).toContain('就绪清单')
    expect(out).toContain('--dry-run')
    // 零副作用铁律（含技能段:dry-run 零执行）
    expect(calls.mkdirp).toHaveLength(0)
    expect(calls.makeSymlink).toHaveLength(0)
    expect(calls.removePath).toHaveLength(0)
    expect(calls.chmodExec).toHaveLength(0)
    expect(calls.exec).toHaveLength(0)
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

  test('setup runtime → Phase 3 待实现 + exit 0 + 零 mutation', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    expect(cmdSetup(deps, 'runtime', {}, env)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('待实现')
    expect(out).toContain('Phase 3')
    expect(calls.makeSymlink).toHaveLength(0)
  })

  test('未知 sub → stderr + exit 1', () => {
    const deps = makeDeps()
    expect(cmdSetup(deps, 'frobnicate', {}, spyEnv().env)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('未知 setup 子命令')
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

  test('setup --dry-run:commander 解析为 dry-run（打印骨架、零副作用安全）', async () => {
    const deps = makeDeps()
    expect(await runProgram(deps, ['setup', '--dry-run'])).toBe(0)
    expect(deps.outLines.join('\n')).toContain('--dry-run')
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
    expect(ecc!.bareAdd).toBe(false)
    expect(cmdText(ecc!)).toContain('npx skills add affaan-m/ECC --skill browser-qa')
    // 禁整装:绝无 args 恰为 skills add affaan-m/ECC（缺 --skill）的整仓命令
    expect(plan.commands.some((c) => c.cmd === 'npx' && c.args.join(' ') === 'skills add affaan-m/ECC')).toBe(false)
  })

  test('① agents-inc marketplace-add 在逐 id install 之前;npm 一条;builtin/bundled 无命令', () => {
    const src: SkillSource[] = [
      { token: 'shadcn-ui', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-ui-shadcn-ui', tier: 'recommended', official: false },
      { token: 'tailwind-css-patterns', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-styling-tailwind', tier: 'recommended', official: false },
      { token: 'opsx', tool: 'npm', source: '@fission-ai/openspec', tier: 'mandatory', official: false },
      { token: 'verify', tool: 'builtin', source: 'claude-code', tier: 'mandatory', official: true },
      { token: 'openspec-propose', tool: 'bundled', source: 'pipeline-lite', tier: 'mandatory', official: false },
    ]
    const plan = buildSkillsPlan(src, spyEnv().env)
    const texts = plan.commands.map(cmdText)
    const addIdx = texts.findIndex((s) => s.includes('plugin marketplace add agents-inc/skills'))
    const shadcnIdx = texts.findIndex((s) => s.includes('web-ui-shadcn-ui@agents-inc'))
    const tailwindIdx = texts.findIndex((s) => s.includes('web-styling-tailwind@agents-inc'))
    expect(addIdx).toBeGreaterThanOrEqual(0)
    expect(addIdx).toBeLessThan(shadcnIdx)
    expect(addIdx).toBeLessThan(tailwindIdx)
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

  test('⑥ browser-qa 的 engine → 附加 claude plugin install playwright@claude-plugins-official（官方）', () => {
    const src: SkillSource[] = [
      { token: 'browser-qa', tool: 'skills-cli', source: 'affaan-m/ECC', skill: 'browser-qa', tier: 'mandatory', official: false, engine: 'playwright@claude-plugins-official' },
    ]
    const plan = buildSkillsPlan(src, spyEnv().env)
    expect(plan.commands.map(cmdText)).toContain('claude plugin install playwright@claude-plugins-official')
    const pw = plan.commands.find((c) => c.args.includes('playwright@claude-plugins-official'))!
    expect(pw.group).toBe('claude-plugin')
    expect(pw.official).toBe(true)
  })

  test('⑦ 禁整装:真 registry 全量 —— skills-cli 命令非 --skill 即白名单单技能 bare 源', () => {
    const all = readSkillSources()
    expect(all.length).toBeGreaterThan(0) // registry 加载成功
    const plan = buildSkillsPlan(all, spyEnv().env) // 无已装 → 全量生成
    const BARE_WHITELIST = new Set([
      'alchaincyf/huashu-design', 'nutlope/hallmark', 'dominikmartn/hue', 'nextlevelbuilder/ui-ux-pro-max-skill',
    ])
    const skillsCli = plan.commands.filter((c) => c.group === 'skills-cli')
    expect(skillsCli.length).toBeGreaterThan(0)
    for (const c of skillsCli) {
      if (c.bareAdd) expect(BARE_WHITELIST.has(c.source)).toBe(true) // bare 仅白名单单技能仓
      else expect(c.args).toContain('--skill') // 其余必按名
    }
    const ecc = skillsCli.find((c) => c.source === 'affaan-m/ECC')!
    expect(ecc.names).toHaveLength(15) // ECC 15 个真 registry 里聚合成一条
  })
})
