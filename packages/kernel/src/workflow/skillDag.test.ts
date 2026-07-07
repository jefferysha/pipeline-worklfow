import { describe, expect, it } from 'vitest'
import { isSkillUnlocked } from './skillDag.js'
import type { SkillRef } from './types.js'

describe('isSkillUnlocked', () => {
  const skills: SkillRef[] = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c', depends_on: ['a', 'b'] },
    { id: 'd', depends_on: ['a'] },
  ]

  it('无依赖的 skill 永远解锁', () => {
    expect(isSkillUnlocked('a', skills, new Set())).toBe(true)
    expect(isSkillUnlocked('b', skills, new Set())).toBe(true)
  })

  it('有依赖但未全部完成 → 锁定', () => {
    expect(isSkillUnlocked('c', skills, new Set(['a']))).toBe(false)
  })

  it('依赖全部完成 → 解锁', () => {
    expect(isSkillUnlocked('c', skills, new Set(['a', 'b']))).toBe(true)
  })

  it('交叉依赖场景：d 只依赖 a，不需要等 b（验证不会被过度串行化）', () => {
    expect(isSkillUnlocked('d', skills, new Set(['a']))).toBe(true)
  })
})
