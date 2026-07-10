import { describe, expect, it } from 'vitest'
import { DenylistViolationError, denylistForChange, matchDenylist } from './denylist.js'

/**
 * T4 决议 #12：loop denylist 真实生效——run 结算时 git diff --name-only 对 denylist glob 匹配，
 * 违规判 conflict 保留现场。本文件测纯匹配逻辑（glob 语义钉死）+ loop 语境派生。
 */
describe('matchDenylist（路径 glob 匹配）', () => {
  it('`*` 只匹配单段（不跨 /）', () => {
    expect(matchDenylist(['a.md', 'docs/a.md'], ['*.md'])).toEqual([{ file: 'a.md', glob: '*.md' }])
  })

  it('`**` 跨段匹配（目录树整体拉黑）', () => {
    expect(matchDenylist(['docs/a.md', 'docs/sub/b.md', 'src/x.ts'], ['docs/**'])).toEqual([
      { file: 'docs/a.md', glob: 'docs/**' },
      { file: 'docs/sub/b.md', glob: 'docs/**' },
    ])
  })

  it('`**/` 前缀允许零段（`**/secrets.env` 命中根级与深层）', () => {
    expect(matchDenylist(['secrets.env', 'a/b/secrets.env'], ['**/secrets.env'])).toEqual([
      { file: 'secrets.env', glob: '**/secrets.env' },
      { file: 'a/b/secrets.env', glob: '**/secrets.env' },
    ])
  })

  it('`?` 匹配单字符（不匹配 /）', () => {
    expect(matchDenylist(['a1.ts', 'a12.ts', 'a/x.ts'], ['a?.ts'])).toEqual([{ file: 'a1.ts', glob: 'a?.ts' }])
  })

  it('字面量路径精确匹配；正则特殊字符（. + 等）不逃逸', () => {
    expect(matchDenylist(['package.json', 'packageXjson'], ['package.json'])).toEqual([
      { file: 'package.json', glob: 'package.json' },
    ])
  })

  it('无命中 → []；空 denylist → []', () => {
    expect(matchDenylist(['src/x.ts'], ['docs/**'])).toEqual([])
    expect(matchDenylist(['src/x.ts'], [])).toEqual([])
  })

  it('一个文件命中多条 glob 只报首条（不重复罗列）', () => {
    expect(matchDenylist(['docs/a.md'], ['docs/**', '**/*.md'])).toEqual([{ file: 'docs/a.md', glob: 'docs/**' }])
  })
})

describe('denylistForChange（loop 语境派生：change_prefix 前缀归属）', () => {
  const loops = [
    { change_prefix: 'loop-a-', denylist: ['docs/**', 'secrets/**'] },
    { change_prefix: 'loop-b-', denylist: ['docs/**', 'infra/**'] },
    { change_prefix: null, denylist: ['never-applies/**'] },
    { change_prefix: 'loop-c-' }, // 老登记表无 denylist 字段（T3 前）→ 视作 []
  ]

  it('命中 change_prefix 的 loop → 返回其 denylist', () => {
    expect(denylistForChange(loops, 'loop-a-fix-1')).toEqual(['docs/**', 'secrets/**'])
  })

  it('多 loop 前缀都命中 → 去重合并', () => {
    expect(denylistForChange([...loops, { change_prefix: 'loop-a', denylist: ['docs/**', 'x/**'] }], 'loop-a-fix')).toEqual([
      'docs/**',
      'secrets/**',
      'x/**',
    ])
  })

  it('无 loop 语境（前缀都不命中 / change_prefix null）→ []（跳过检查）', () => {
    expect(denylistForChange(loops, 'standalone-change')).toEqual([])
  })

  it('loop 无 denylist 字段（T3 schema 落地前的旧登记表）→ []', () => {
    expect(denylistForChange(loops, 'loop-c-thing')).toEqual([])
  })
})

describe('DenylistViolationError', () => {
  it('携带 _tag / preservedWorktreePath / 违规明细（供 classify 归 conflict + 留现场）', () => {
    const e = new DenylistViolationError([{ file: 'docs/a.md', glob: 'docs/**' }], '/wt/x')
    expect(e._tag).toBe('DenylistViolationError')
    expect(e.preservedWorktreePath).toBe('/wt/x')
    expect(e.violations).toEqual([{ file: 'docs/a.md', glob: 'docs/**' }])
    expect(e.message).toContain('docs/a.md')
    expect(e.message).toContain('docs/**')
  })
})
