import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const bundle = join(process.cwd(), 'packages', 'cli', 'dist', 'tenon.mjs')
const brokenRuntimeEnv = {
  ...process.env,
  TENON_RUNTIME_ROOTS: '{broken',
}

function run(args: string[]) {
  return spawnSync(process.execPath, [bundle, ...args], {
    cwd: process.cwd(),
    env: brokenRuntimeEnv,
    encoding: 'utf8',
  })
}

describe.skipIf(!existsSync(bundle))('runtime CLI 真实入口的作用域错误边界', () => {
  it.each([
    {
      args: ['runtime', 'status', '--json'],
      expected: 'ERROR: 无法读取 managed runtime 状态：TENON_RUNTIME_ROOTS 不是合法 JSON',
    },
    {
      args: ['runtime', 'repair', '--rollback'],
      expected: 'ERROR: runtime 回滚失败：TENON_RUNTIME_ROOTS 不是合法 JSON',
    },
  ])('将 $args 的损坏作用域映射为稳定错误', ({ args, expected }) => {
    const result = run(args)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(expected)
    expect(result.stderr).not.toContain('at resolveProductPaths')
    expect(result.stderr).not.toContain('at resolveRuntimePaths')
  })

  it.each([
    {
      args: ['runtime', 'repair'],
      expected: 'ERROR: runtime repair 只接受精确恢复动作',
    },
    {
      args: ['runtime', 'unknown'],
      expected: 'ERROR: runtime 子命令仅支持 status 或 repair --rollback',
    },
  ])('$args 在命令校验失败时不读取运行时作用域', ({ args, expected }) => {
    const result = run(args)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(expected)
    expect(result.stderr).not.toContain('TENON_RUNTIME_ROOTS 不是合法 JSON')
    expect(result.stderr).not.toContain('at resolveRuntimePaths')
  })
})
