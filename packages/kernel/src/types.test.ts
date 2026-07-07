import { describe, expect, it } from 'vitest'
import { FIELD_ORDER } from './types.js'
import { emptyFields } from './state/parse.js'

describe('workflow 字段', () => {
  it('FIELD_ORDER 末尾新增 workflow', () => {
    expect(FIELD_ORDER[FIELD_ORDER.length - 1]).toBe('workflow')
  })
  it('emptyFields() 里 workflow 缺省值是 default', () => {
    expect(emptyFields().workflow).toBe('default')
  })
})
