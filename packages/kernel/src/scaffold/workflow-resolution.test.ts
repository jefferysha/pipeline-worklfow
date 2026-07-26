/**
 * workflow-template-resolution 纯逻辑单测（BACKLOG #33，Tenon contract parity 收尾 ③）。
 * 覆盖：多 workflow id 解析（parseWorkflowIds + resolveWorkflow）+ removeHash 更新契约
 * （applyWorkflowHashContract：native 记 hash / 非 native 删条目——非对称防升级还原 native）。
 */
import { describe, expect, test } from 'vitest'
import { computeContentHash } from '../state/ownership.js'
import {
  NATIVE_WORKFLOW_ID,
  WORKFLOW_MD_REL,
  applyWorkflowHashContract,
  parseWorkflowIds,
  removeWorkflowHash,
  resolveWorkflow,
  workflowHashAction,
} from './workflow-resolution.js'

describe('parseWorkflowIds —— 多 workflow id 解析（源索引）', () => {
  test('逐行首 token 为 id、跳注释/空行、去 native 去重、保序', () => {
    const idx = [
      '# marketplace index',
      'strict   严格三门变体',
      '',
      'lean\t精简变体',
      'native   (bundled)', // native 去重丢弃（永远单列）
      'strict   重复', // 去重
    ].join('\n')
    expect(parseWorkflowIds(idx)).toEqual(['strict', 'lean'])
  })

  test('空索引 → []', () => {
    expect(parseWorkflowIds('')).toEqual([])
    expect(parseWorkflowIds('\n\n# 全是注释\n')).toEqual([])
  })
})

describe('resolveWorkflow —— 请求 id → 解析（native offline-first + 源命中）', () => {
  test('空/undefined/native → native（离线优先，永远可用）', () => {
    for (const req of [undefined, '', 'native']) {
      const r = resolveWorkflow(req, ['strict', 'lean'])
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.id).toBe(NATIVE_WORKFLOW_ID)
        expect(r.isNative).toBe(true)
        expect(r.source).toBe(false)
      }
    }
  })

  test('请求 id 命中源集 → 非 native、source=true', () => {
    const r = resolveWorkflow('lean', ['strict', 'lean'])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.id).toBe('lean')
      expect(r.isNative).toBe(false)
      expect(r.source).toBe(true)
    }
  })

  test('请求 id 不在源集 → ok:false + 携带可选集', () => {
    const r = resolveWorkflow('ghost', ['strict', 'lean'])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('ghost')
      expect(r.available).toEqual(['strict', 'lean'])
    }
  })
})

describe('removeHash 更新契约（applyWorkflowHashContract，对标 apply_hash_contract 非对称）', () => {
  const KEY = WORKFLOW_MD_REL
  const content = '# workflow\nstrict variant\n'

  test('workflowHashAction：native→record / 非 native→remove', () => {
    expect(workflowHashAction(true)).toBe('record')
    expect(workflowHashAction(false)).toBe('remove')
  })

  test('native → 记 hash（record，让升级把 native 当受管模板可 auto_update）', () => {
    const before = { 'other.md': 'h0' }
    const after = applyWorkflowHashContract(before, KEY, true, content)
    expect(after[KEY]).toBe(computeContentHash(content))
    expect(after['other.md']).toBe('h0') // 不动其它
    expect(before).toEqual({ 'other.md': 'h0' }) // 纯：不改入参
  })

  test('非 native → 删条目（removeHash，让升级不还原 native）', () => {
    const before = { [KEY]: 'staleHash', 'other.md': 'h0' }
    const after = applyWorkflowHashContract(before, KEY, false, content)
    expect(KEY in after).toBe(false) // 条目已删
    expect(after['other.md']).toBe('h0')
    expect(before[KEY]).toBe('staleHash') // 纯：不改入参
  })

  test('native 但无内容 → 原样返回（不误记空 hash、不误删）', () => {
    const before = { [KEY]: 'kept' }
    const after = applyWorkflowHashContract(before, KEY, true)
    expect(after[KEY]).toBe('kept')
  })

  test('removeWorkflowHash 归一 key 后删（越界/反斜杠一致）', () => {
    const before = { '.pipeline/workflow.md': 'h' }
    expect('.pipeline/workflow.md' in removeWorkflowHash(before, '.pipeline\\workflow.md')).toBe(false)
  })
})
