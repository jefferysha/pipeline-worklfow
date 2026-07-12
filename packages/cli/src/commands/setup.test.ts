/**
 * setup 命令骨架 —— mock/真临时 fs 混合回归（full-install F3）。
 * 覆盖:①--dry-run 零写零软链(spy env 断言零 mutation);②ensurePipelineOnPath 真临时 HOME
 * 建软链/同源跳过/异源覆盖告警/非软链覆盖/缺 ~/.local/bin 建目录;③skills/runtime 占位分派
 * 打印待实现 exit 0 且不碰 PATH;④program 装配 flag 解析(--dry-run/--yes 透传)。
 * 软链源解析(pluginRoot 优先 / selfPath 回退)单钉。
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { buildProgram, CliExit } from '../program.js'
import {
  cmdSetup,
  ensurePipelineOnPath,
  REAL_SETUP_ENV,
  resolvePipelineSource,
  type SetupEnv,
} from './setup.js'

// ── spy env:记录全部 fs mutation,断言「零副作用」/「未碰 PATH」──────────────────────
interface SpyCalls {
  mkdirp: string[]
  makeSymlink: Array<[string, string]>
  removePath: string[]
  chmodExec: string[]
}
function spyEnv(over: Partial<SetupEnv> = {}): { env: SetupEnv; calls: SpyCalls } {
  const calls: SpyCalls = { mkdirp: [], makeSymlink: [], removePath: [], chmodExec: [] }
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
    ...over,
  }
  return { env, calls }
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
    // 零副作用铁律
    expect(calls.mkdirp).toHaveLength(0)
    expect(calls.makeSymlink).toHaveLength(0)
    expect(calls.removePath).toHaveLength(0)
    expect(calls.chmodExec).toHaveLength(0)
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

describe('③skills/runtime 占位分派 —— 打印待实现 exit 0 且不碰 PATH', () => {
  test('setup skills → Phase 2 待实现 + exit 0 + 零 mutation', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    expect(cmdSetup(deps, 'skills', {}, env)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('待实现')
    expect(out).toContain('Phase 2')
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

  test('setup skills --yes:--yes 透传占位（安全,skills 不碰 fs）', async () => {
    const deps = makeDeps()
    expect(await runProgram(deps, ['setup', 'skills', '--yes'])).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('待实现')
    expect(out).toContain('--yes')
  })
})
