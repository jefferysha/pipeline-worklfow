/**
 * init 项目注册表自动登记 e2e（v5 T2 决策 D）——真 kernel + 真临时 fs，零 mock。
 * hermetic：注册表路径注入临时 Tenon config root，绝不碰真实用户状态。
 * registerProject 的装配方式与 main.ts 同款（registerProjectRoot + projectRegistryPath），
 * 仅 home 换成临时目录。
 */
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { registerProjectRoot } from '@tenon/kernel'
import { buildProgram, CliExit } from './program.js'
import { realDeps } from './integration-harness.js'

describe('init 自动登记项目注册表（hermetic 临时 HOME，e2e）', () => {
  let cwd: string
  let configRoot: string
  let registry: string
  const out: string[] = []
  const err: string[] = []

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'lite-initreg-repo-'))
    configRoot = await mkdtemp(join(tmpdir(), 'tenon-initreg-config-'))
    registry = join(configRoot, 'projects.json')
  })
  afterEach(async () => {
    await chmod(configRoot, 0o755).catch(() => {})
    await rm(cwd, { recursive: true, force: true })
    await rm(configRoot, { recursive: true, force: true })
  })

  /** 与 main.ts 同款装配，仅注册表指向临时 HOME */
  async function run(args: string[]): Promise<number> {
    out.length = 0
    err.length = 0
    const deps = realDeps(cwd, out, err)
    deps.registerProject = async (repoRoot) => {
      await registerProjectRoot(registry, repoRoot)
    }
    try {
      await buildProgram(deps).parseAsync(args, { from: 'user' })
      return 0
    } catch (e) {
      if (e instanceof CliExit) return e.code
      throw e
    }
  }

  test('init 成功 → 注册表 JSON 含 resolve 后 root；同仓再 init 别的 change 不重复登记', async () => {
    expect(await run(['init', 'demo', '--track', 'backend', '--preset', 'full'])).toBe(0)
    const first = JSON.parse(await readFile(registry, 'utf8')) as string[]
    expect(first).toEqual([resolvePath(cwd)])

    expect(await run(['init', 'demo2', '--track', 'backend', '--preset', 'full'])).toBe(0)
    const second = JSON.parse(await readFile(registry, 'utf8')) as string[]
    expect(second).toEqual([resolvePath(cwd)])
  })

  test('注册表损坏 → init 照常 exit 0，登记后文件恢复为合法 JSON', async () => {
    await mkdir(configRoot, { recursive: true })
    await writeFile(registry, '{oops', 'utf8')
    expect(await run(['init', 'demo', '--track', 'backend', '--preset', 'full'])).toBe(0)
    expect(err).toContain(`[INIT] ${join(cwd, 'openspec', 'changes', 'demo')}`)
    const data = JSON.parse(await readFile(registry, 'utf8')) as string[]
    expect(data).toEqual([resolvePath(cwd)])
  })

  test('注册表目录不可写 → init 仍 exit 0（best-effort 铁律），stderr 出 WARN 提示', async () => {
    await mkdir(configRoot, { recursive: true })
    await chmod(configRoot, 0o555)
    expect(await run(['init', 'demo', '--track', 'backend', '--preset', 'full'])).toBe(0)
    expect(err).toContain(`[INIT] ${join(cwd, 'openspec', 'changes', 'demo')}`)
    expect(err.some((l) => l.startsWith('WARN:'))).toBe(true)
    // change 本体已正常创建
    await expect(readFile(join(cwd, 'openspec', 'changes', 'demo', '.pipeline.yaml'), 'utf8')).resolves.toContain('phase:')
  })

  test('原子写：登记后 config root 只有注册表本体，无 *.tmp* 残留', async () => {
    await run(['init', 'demo', '--track', 'backend', '--preset', 'full'])
    const entries = await readdir(configRoot)
    expect(entries).toEqual(['projects.json'])
  })
})
