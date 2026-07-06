/**
 * mem/dialogue —— 注入标签剥除 + bootstrap turn 检测（真逻辑，无 fs、无 mock）。
 * 对位老仓 skills/pipeline/scripts/mem/dialogue.py。
 */
import { describe, expect, test } from 'vitest'
import { INJECTION_TAGS, isBootstrapTurn, stripInjectionTags } from './dialogue.js'

describe('stripInjectionTags —— 注入块删除（老仓 strip_injection_tags:64）', () => {
  test('删除单个注入标签块，仅折叠换行（空格保留）', () => {
    expect(stripInjectionTags('keep <ready>drop this</ready> tail')).toBe('keep  tail')
  })

  test('大小写不敏感 + 带属性开标签', () => {
    expect(stripInjectionTags('a <TASK-STATUS foo="1">x</TASK-STATUS> b')).toBe('a  b')
  })

  test('多标签种类全删', () => {
    const input = 'x <system-reminder>r</system-reminder> y <guidelines>g</guidelines> z'
    expect(stripInjectionTags(input)).toBe('x  y  z')
  })

  test('3+ 连续换行折叠成段落断', () => {
    expect(stripInjectionTags('a\n\n\n\nb')).toBe('a\n\nb')
  })

  test('首尾空白 trim', () => {
    expect(stripInjectionTags('  hello  ')).toBe('hello')
  })
})

describe('INJECTION_TAGS —— 清单锁（老仓 dialogue.py:10）', () => {
  test('18 个标签，含带空格的 "permissions instructions"', () => {
    expect(INJECTION_TAGS).toHaveLength(18)
    expect(INJECTION_TAGS).toContain('permissions instructions')
    expect(INJECTION_TAGS).toContain('system-reminder')
    expect(INJECTION_TAGS).toContain('user_instructions')
  })
})

describe('isBootstrapTurn —— 整段丢弃判据（老仓 is_bootstrap_turn:53）', () => {
  test('AGENTS.md 前言 → true', () => {
    expect(isBootstrapTurn('# AGENTS.md instructions for repo\nblah', 10)).toBe(true)
  })

  test('大 INSTRUCTIONS 块（original_length>4000）→ true', () => {
    expect(isBootstrapTurn('<INSTRUCTIONS>hello', 4001)).toBe(true)
  })

  test('INSTRUCTIONS 块但 original_length<=4000 → false', () => {
    expect(isBootstrapTurn('<INSTRUCTIONS>hello', 4000)).toBe(false)
  })

  test('普通内容 → false', () => {
    expect(isBootstrapTurn('just a normal user turn', 5000)).toBe(false)
  })
})
