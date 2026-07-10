import { describe, expect, it } from 'vitest'
import { FIELD_ORDER } from './types.js'
import { emptyFields } from './state/parse.js'

describe('workflow 字段', () => {
  it('workflow 在 automation_current_phase 之前（两次「末尾追加」的历史序钉死）', () => {
    expect(FIELD_ORDER[FIELD_ORDER.length - 2]).toBe('workflow')
  })
  it('emptyFields() 里 workflow 缺省值是 default', () => {
    expect(emptyFields().workflow).toBe('default')
  })
})

describe('automation_current_phase 字段（v5 T4 决策 G）', () => {
  it('新字段必须追加在 FIELD_ORDER 末尾（老窄解析器把它当尾部不透明行逐字保留，混版本读写无损）', () => {
    expect(FIELD_ORDER[FIELD_ORDER.length - 1]).toBe('automation_current_phase')
  })
  it('emptyFields() 缺省空串（run 外无沙箱内阶段）', () => {
    expect(emptyFields().automation_current_phase).toBe('')
  })
})
