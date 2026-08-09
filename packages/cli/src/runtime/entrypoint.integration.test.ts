import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { freezeTrustedExecutable } from '../commands/trusted-executable.js'

const bundle = join(process.cwd(), 'packages', 'cli', 'dist', 'tenon.mjs')
const brokenRuntimeEnv = {
  ...process.env,
  TENON_RUNTIME_ROOTS: '{broken',
}
const realNodeIsProvablyTrusted = freezeTrustedExecutable(process.execPath) !== undefined

function run(args: string[]) {
  return spawnSync(process.execPath, [bundle, ...args], {
    cwd: process.cwd(),
    env: brokenRuntimeEnv,
    encoding: 'utf8',
  })
}

describe.skipIf(!existsSync(bundle))('runtime CLI 真实入口的错误边界', () => {
  it.each([
    {
      args: ['runtime', 'status', '--json'],
      expected: realNodeIsProvablyTrusted
        ? 'ERROR: 无法读取 managed runtime 状态：TENON_RUNTIME_ROOTS 不是合法 JSON'
        : 'ERROR: 无法读取 managed runtime 状态：可信 Node 物理身份不可证明',
    },
    {
      args: ['runtime', 'repair', '--rollback'],
      expected: realNodeIsProvablyTrusted
        ? 'ERROR: runtime 回滚失败：TENON_RUNTIME_ROOTS 不是合法 JSON'
        : 'ERROR: runtime 回滚失败：可信 Node 物理身份不可证明',
    },
  ])('将 $args 映射为稳定的 Node 信任或损坏作用域错误', ({ args, expected }) => {
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
