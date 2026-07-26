/**
 * known-untracked-template-allowlist 纯逻辑单测（BACKLOG #33，Tenon contract parity 收尾 ④，🔴 唯一 missing）。
 * 老仓自标 N/A（无「无 hash→hash-track」迁移期），但留占位入口（migrations.py 空常量 +
 * apply 钩子原样返回）。本移植忠实补齐同款占位：空白名单常量 + pass-through 应用 + 判定函数。
 * 空白名单下所有函数无副作用——待将来真经历该迁移期时填 {rel:[hash,...]}，classify 主路径不必改。
 */
import { describe, expect, test } from 'vitest'
import {
  KNOWN_UNTRACKED_ALLOWLIST,
  applyKnownUntrackedAllowlist,
  isKnownUntracked,
} from './allowlist.js'

describe('KNOWN_UNTRACKED_ALLOWLIST —— 空占位常量（对标 migrations.py KNOWN_UNTRACKED_ALLOWLIST = {}）', () => {
  test('默认为空对象', () => {
    expect(KNOWN_UNTRACKED_ALLOWLIST).toEqual({})
  })
})

describe('applyKnownUntrackedAllowlist —— 空 → 原样返回（无副作用）', () => {
  test('空白名单 → 返回同一 stored（对标 if not KNOWN...: return hashes）', () => {
    const stored = { 'a.md': 'h1', 'b.md': 'h2' }
    expect(applyKnownUntrackedAllowlist(stored)).toBe(stored) // 引用相同 = 零拷贝 pass-through
  })

  test('非空白名单（模拟将来填充）→ 只并入 stored 未含的 rel、取首个 hash、归一 key', () => {
    const stored = { 'a.md': 'h1' }
    const merged = applyKnownUntrackedAllowlist(stored, {
      'a.md': ['ignored'], // 已在 stored → 不覆盖
      'legacy/AGENTS.md': ['pristineHash', 'alt'], // 取首个
    })
    expect(merged['a.md']).toBe('h1') // 不覆盖既有
    expect(merged['legacy/AGENTS.md']).toBe('pristineHash') // 并入首个 hash
    expect(stored).toEqual({ 'a.md': 'h1' }) // 纯：不改入参
  })

  test('非空白名单但 hash 列表为空 → 该项跳过（对标 and hash_list）', () => {
    const merged = applyKnownUntrackedAllowlist({}, { 'x.md': [] })
    expect('x.md' in merged).toBe(false)
  })
})

describe('isKnownUntracked —— 判定函数（空白名单恒 false）', () => {
  test('空白名单下任何 (rel,hash) → false', () => {
    expect(isKnownUntracked('anything.md', 'anyhash')).toBe(false)
  })

  test('填充后：rel 命中且 hash 在其允许列表 → true（归一 key）', () => {
    const al = { 'legacy/AGENTS.md': ['h1', 'h2'] }
    expect(isKnownUntracked('legacy/AGENTS.md', 'h2', al)).toBe(true)
    expect(isKnownUntracked('legacy\\AGENTS.md', 'h1', al)).toBe(true) // 反斜杠归一
    expect(isKnownUntracked('legacy/AGENTS.md', 'nope', al)).toBe(false)
    expect(isKnownUntracked('other.md', 'h1', al)).toBe(false)
  })
})
