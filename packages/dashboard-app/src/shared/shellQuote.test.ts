/**
 * shellQuote —— POSIX 单引号转义纯函数（codex review 终稿 P2）。
 * 纯 .test.ts：归根 vitest.config（node 环境）跑，与本包 jsdom 组件测试（*.test.tsx）
 * 刻意互不相交（见 vitest.config.ts 头注）。
 */
import { describe, expect, it } from 'vitest'
import { shellQuote } from './shellQuote'

describe('shellQuote —— 安全集原样', () => {
  it('典型 worktree 路径（含 . / - _）不加引号', () => {
    expect(shellQuote('/Users/x/.pipeline/worktrees/hotfix')).toBe('/Users/x/.pipeline/worktrees/hotfix')
  })

  it('容器名 / change 名（字母数字连字符）不加引号', () => {
    expect(shellQuote('pipeline-afk-hotfix')).toBe('pipeline-afk-hotfix')
  })

  it('安全集全字符类覆盖（@ % + = : , 也算安全）', () => {
    expect(shellQuote('a@b%c+d=e:f,g')).toBe('a@b%c+d=e:f,g')
  })
})

describe('shellQuote —— 出安全集则整体单引号', () => {
  it('空串 → 两个单引号（参数位不塌缩）', () => {
    expect(shellQuote('')).toBe("''")
  })

  it('含空格 → 单引号包裹', () => {
    expect(shellQuote('/Users/x/My Work/wt hotfix')).toBe("'/Users/x/My Work/wt hotfix'")
  })

  it('含双引号 → 单引号内成字面量（双引号包裹挡不住的正主）', () => {
    expect(shellQuote('a"b')).toBe('\'a"b\'')
  })

  it('含反引号 → 单引号内零展开', () => {
    expect(shellQuote('a`whoami`b')).toBe("'a`whoami`b'")
  })

  it('含 $() 命令替换 → 单引号内成字面量', () => {
    expect(shellQuote('pwn$(rm -rf /)x')).toBe("'pwn$(rm -rf /)x'")
  })

  it("内嵌单引号 → '\\'' 断开重接", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })
})
