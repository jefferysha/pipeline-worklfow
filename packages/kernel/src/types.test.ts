import { describe, expect, it } from 'vitest'
import { FIELD_ORDER, PREREQ_HINTS, REVIEW_GATE_FIELDS } from './types.js'
import { emptyFields } from './state/parse.js'

describe('workflow 字段', () => {
  it('workflow 在 automation_current_phase 之前（历次「末尾追加」的历史序钉死）', () => {
    expect(FIELD_ORDER[FIELD_ORDER.length - 8]).toBe('workflow')
  })
  it('emptyFields() 里 workflow 缺省值是 default', () => {
    expect(emptyFields().workflow).toBe('default')
  })
})

describe('automation_current_phase 字段（v5 T4 决策 G）', () => {
  it('automation_current_phase 在 automation_cause 之前（末尾追加历史序钉死）', () => {
    expect(FIELD_ORDER[FIELD_ORDER.length - 7]).toBe('automation_current_phase')
  })
  it('emptyFields() 缺省空串（run 外无沙箱内阶段）', () => {
    expect(emptyFields().automation_current_phase).toBe('')
  })
})

describe('automation_cause 字段（F-b 失败成因结构化落盘）', () => {
  it('新字段必须追加在 FIELD_ORDER 末尾（老窄解析器把它当尾部不透明行逐字保留，混版本读写无损）', () => {
    expect(FIELD_ORDER[FIELD_ORDER.length - 6]).toBe('automation_cause')
  })
  it('emptyFields() 缺省空串（空串=未知成因，读取端 fallback regex 分类）', () => {
    expect(emptyFields().automation_cause).toBe('')
  })
})

describe('review-gate v2 字段（出口收据）', () => {
  it('五字段整体追加在既有尾字段之后，保持旧窄解析器的末尾兼容性', () => {
    expect(FIELD_ORDER.slice(-5)).toEqual(REVIEW_GATE_FIELDS)
  })
  it('emptyFields() 给出完整的 canonical 空收据', () => {
    const fields = emptyFields()
    for (const field of REVIEW_GATE_FIELDS) expect(fields[field]).toBe('')
  })
})

describe('PREREQ_HINTS —— 前置条件「怎么获取」单一真相源（full-install FI · G1）', () => {
  it('claudeToken 指向 `claude setup-token`（生成长期 OAuth token）', () => {
    expect(PREREQ_HINTS.claudeToken).toContain('claude setup-token')
    expect(PREREQ_HINTS.claudeToken).toContain('OAuth')
  })
  it('openaiKey 给 codex 两条路（codex login 走 ChatGPT / platform.openai.com/api-keys 建 key）', () => {
    expect(PREREQ_HINTS.openaiKey).toContain('codex login')
    expect(PREREQ_HINTS.openaiKey).toContain('platform.openai.com/api-keys')
    expect(PREREQ_HINTS.openaiKey).toContain('OPENAI_API_KEY')
  })
  it('docker 引导装 OrbStack / Docker Desktop 且明示不自动装', () => {
    expect(PREREQ_HINTS.docker).toContain('OrbStack')
    expect(PREREQ_HINTS.docker).toContain('orbstack.dev')
    expect(PREREQ_HINTS.docker).toContain('Docker Desktop')
    expect(PREREQ_HINTS.docker).toContain('不自动装')
  })
})
