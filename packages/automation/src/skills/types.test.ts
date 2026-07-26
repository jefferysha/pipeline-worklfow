/**
 * isPathSafeSkillId 直接单测（H10-T4 共享判据；H10 r1 复审阻断2/4 第3节尾注：路径校验必须拒绝
 * 单独 '.'）。之前只被 snapshot-store.test.ts 间接经 buildCanonicalManifest 的错误包装外壳
 * 覆盖——本文件直接测这个纯函数本身，把判据的完整真值表钉在离它最近的地方。
 */
import { describe, expect, it } from 'vitest'
import { isPathSafeSkillId } from './types.js'

describe('isPathSafeSkillId', () => {
  it('合法 id（含连字符/下划线/点号非单独出现）→ true', () => {
    expect(isPathSafeSkillId('tenon-build')).toBe(true)
    expect(isPathSafeSkillId('pipeline_build')).toBe(true)
    expect(isPathSafeSkillId('a.b.c')).toBe(true)
    expect(isPathSafeSkillId('superpowers:brainstorming')).toBe(true)
  })

  it('空串 → false', () => {
    expect(isPathSafeSkillId('')).toBe(false)
  })

  it('含路径分隔符（/ 或 \\）→ false', () => {
    expect(isPathSafeSkillId('a/b')).toBe(false)
    expect(isPathSafeSkillId('a\\b')).toBe(false)
    expect(isPathSafeSkillId('/etc/passwd')).toBe(false)
  })

  it('含 ".."（父目录逃逸）→ false', () => {
    expect(isPathSafeSkillId('..')).toBe(false)
    expect(isPathSafeSkillId('../escape')).toBe(false)
    expect(isPathSafeSkillId('a..b')).toBe(false)
  })

  it('含 NUL 字节 → false', () => {
    expect(isPathSafeSkillId('a\0b')).toBe(false)
  })

  it("恰为单独 '.' → false（H10 r1 复审阻断2/4：join(root, '.') 会退化成 root 自身，把整个内容根" +
    '当成一个 skill，原判据（禁 /、\\\\、..、NUL）不会拦住这个字面上"什么都没有"的畸形 id）', () => {
    expect(isPathSafeSkillId('.')).toBe(false)
  })

  it("'.' 只是某个更长 id 的普通字符时不受影响（真正被拒的只有恰好等于 '.' 的整串）", () => {
    expect(isPathSafeSkillId('.hidden')).toBe(true)
    expect(isPathSafeSkillId('a.')).toBe(true)
  })
})
