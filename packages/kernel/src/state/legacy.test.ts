import { describe, expect, test } from 'vitest'
import { parseLegacyHistory, stripLegacyHistory } from './legacy.js'

// 键形取自老仓真实 fixture（见 fixtures/dashboard-*.pipeline.yaml）
const TAIL = `tools_history:
  - { at: 2026-07-02T17:19:55Z, tool: Skill, detail_b64: "Y29tbWl0LXB1c2g=" }
  - { at: 2026-07-02T16:49:28Z, tool: Agent, detail: "e2e-runner" }
prompts_history:
  - { at: 2026-06-30T13:23:59Z, phase: verify, track: frontend, kind: decision, q_b64: "cT8=", a_b64: "YSE=" }
transitions_history:
  - { at: 2026-06-30T13:30:57Z, from: verify, to: ship, event: verify-pass }
unknown_tail_key: keep-me
`

describe('parseLegacyHistory —— 老仓 base64 历史区 → lite JSONL 条目（BACKLOG #11）', () => {
  test('三节全解析：kind 映射、b64 解码、顺序保持', () => {
    const e = parseLegacyHistory(TAIL)
    expect(e).toEqual([
      { ts: '2026-07-02T17:19:55Z', kind: 'tool', raw: 'Skill: commit-push' },
      { ts: '2026-07-02T16:49:28Z', kind: 'tool', raw: 'Agent: e2e-runner' },
      { ts: '2026-06-30T13:23:59Z', kind: 'prompt', raw: 'Q: q? | A: a!' },
      { ts: '2026-06-30T13:30:57Z', kind: 'transition', from: 'verify', to: 'ship', raw: 'verify-pass' },
    ])
  })

  test('空尾块 / 无历史节 → 空数组', () => {
    expect(parseLegacyHistory('')).toEqual([])
    expect(parseLegacyHistory('unknown: x\n')).toEqual([])
  })

  test('坏 base64 / 坏行 → 跳过不抛（fail-open）', () => {
    const e = parseLegacyHistory('tools_history:\n  - { at: t1, tool: X, detail_b64: "!!!" }\n  - 不是 map\n')
    expect(e).toHaveLength(1)
    expect(e[0]?.kind).toBe('tool')
  })
})

describe('stripLegacyHistory —— 清三节、保未知尾内容', () => {
  test('三节整体移除，unknown 行保留', () => {
    const out = stripLegacyHistory(TAIL)
    expect(out).not.toContain('_history:')
    expect(out).not.toContain('detail_b64')
    expect(out).toContain('unknown_tail_key: keep-me')
  })

  test('空输入原样', () => {
    expect(stripLegacyHistory('')).toBe('')
  })
})
