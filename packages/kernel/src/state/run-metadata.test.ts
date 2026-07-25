import { describe, expect, test } from 'vitest'
import { diffFieldsToEffects, parseRunMetadataLines, serializeRunMetadataLines } from './run-metadata.js'
import { emptyFields } from './parse.js'
import { compileAutomationPolicySnapshot } from '../loops/automation-policy.js'
import type { LoopEntry } from '../loops/types.js'

const policy = compileAutomationPolicySnapshot({
  id: 'loop-a', name: 'Loop A', kind: 'executor', goal: 'Keep green', cadence: 'manual', risk: 'low',
  runner: 'codex', change_prefix: 'a-', phases: [], human_gates: [], state: 'legacy', design_doc: 'x',
  status: 'active', budget: { max_runs_per_day: 1, max_in_flight: 1, on_exceed: 'skip-run' },
  kill_criteria: [], autonomy_level: 'L1', allowlist: ['**'], denylist: [], skill_bundle_id: '_all',
} satisfies LoopEntry, { capturedAt: '2026-07-19T00:00:00Z' })

describe('serializeRunMetadataLines / parseRunMetadataLines —— 内部提交元数据的三行保留字段（不进 FIELD_ORDER）', () => {
  test('undefined 元数据 → 零行输出（老 change 未升级，opaqueTail 前不多任何字节）', () => {
    expect(serializeRunMetadataLines(undefined)).toEqual([])
  })

  test('完整元数据（有 head）序列化为固定三行、固定顺序', () => {
    const lines = serializeRunMetadataLines({ runId: 'run-1', transitionSequence: 3, transitionHead: 'rec-3' })
    expect(lines).toEqual([
      'pipeline_run_id: run-1',
      'pipeline_transition_sequence: 3',
      'pipeline_transition_head: rec-3',
    ])
  })

  test('head 缺省（新 change 还没发生过 canonical transition）序列化为字面量 "null"', () => {
    const lines = serializeRunMetadataLines({ runId: 'run-1', transitionSequence: 0, transitionHead: undefined })
    expect(lines[2]).toBe('pipeline_transition_head: null')
  })

  test('往返：序列化再解析，字段值逐一还原', () => {
    const original = { runId: 'run-abc', transitionSequence: 7, transitionHead: 'rec-7' }
    const lines = serializeRunMetadataLines(original)
    const { metadata, consumedLines } = parseRunMetadataLines(lines)
    expect(metadata).toEqual(original)
    expect(consumedLines).toBe(3)
  })

  test('文档治理 profile 作为可选不可变 run metadata 往返', () => {
    const fingerprint = 'a'.repeat(64)
    const original = {
      runId: 'run-doc', transitionSequence: 0, transitionHead: undefined,
      documentProfile: 'document-v1' as const,
      documentGovernanceFingerprint: fingerprint,
    }
    const lines = serializeRunMetadataLines(original)
    expect(lines[3]).toBe('pipeline_document_profile: document-v1')
    expect(lines[4]).toBe(`pipeline_document_governance_fingerprint: ${fingerprint}`)
    expect(parseRunMetadataLines(lines)).toEqual({ metadata: original, consumedLines: 5 })
  })

  test('H4：AutomationPolicySnapshot 作为第四行完整往返，不只存 policy id', () => {
    const original = { runId: 'run-policy', transitionSequence: 0, transitionHead: undefined, automationPolicy: policy }
    const lines = serializeRunMetadataLines(original)
    expect(lines).toHaveLength(4)
    expect(lines[3]).toMatch(/^pipeline_automation_policy_b64: [A-Za-z0-9_-]+$/)
    expect(parseRunMetadataLines(lines)).toEqual({ metadata: original, consumedLines: 4 })
  })

  test('H9：governed policy + loop/iteration 六行完整往返', () => {
    const original = {
      runId: 'run-governed', transitionSequence: 2, transitionHead: 'rec-2', automationPolicy: policy,
      loopId: policy.loop_id, iterationId: 'iteration-2',
    }
    const lines = serializeRunMetadataLines(original)
    expect(lines.slice(4)).toEqual([
      `pipeline_loop_id: ${policy.loop_id}`,
      'pipeline_iteration_id: iteration-2',
    ])
    expect(parseRunMetadataLines(lines)).toEqual({ metadata: original, consumedLines: 6 })
  })

  test('H4：伪造 policy/version 的第四行不被吞掉，前三行仍按老格式解析', () => {
    const forged = Buffer.from(JSON.stringify({ ...policy, goal: 'forged' })).toString('base64url')
    const lines = [...serializeRunMetadataLines({ runId: 'run-1', transitionSequence: 0 }), `pipeline_automation_policy_b64: ${forged}`]
    const parsed = parseRunMetadataLines(lines)
    expect(parsed.metadata?.automationPolicy).toBeUndefined()
    expect(parsed.consumedLines).toBe(3)
  })

  test('往返：head 为 "null" 字面量解析回 undefined（不是字符串 "null"）', () => {
    const lines = serializeRunMetadataLines({ runId: 'run-x', transitionSequence: 0, transitionHead: undefined })
    const { metadata } = parseRunMetadataLines(lines)
    expect(metadata?.transitionHead).toBeUndefined()
  })

  test('老 change（第一行就不是 pipeline_run_id）→ metadata undefined，consumedLines 为 0（不吞掉任何行，交给 opaqueTail 收集）', () => {
    const { metadata, consumedLines } = parseRunMetadataLines(['tools_history: xyz', 'more opaque stuff'])
    expect(metadata).toBeUndefined()
    expect(consumedLines).toBe(0)
  })

  test('损坏/不完整的三行块（第二行不是预期 key）→ metadata undefined，consumedLines 为 0（整段原样交给 opaqueTail，不半吞）', () => {
    const { metadata, consumedLines } = parseRunMetadataLines([
      'pipeline_run_id: run-1',
      'some_unexpected_line',
      'pipeline_transition_head: rec-1',
    ])
    expect(metadata).toBeUndefined()
    expect(consumedLines).toBe(0)
  })

  test('文件在三行块结束前截断（只有两行）→ metadata undefined，consumedLines 为 0', () => {
    const { metadata, consumedLines } = parseRunMetadataLines(['pipeline_run_id: run-1', 'pipeline_transition_sequence: 3'])
    expect(metadata).toBeUndefined()
    expect(consumedLines).toBe(0)
  })
})

describe('diffFieldsToEffects —— transition 前后 PipelineState.fields 的真实字段级 diff', () => {
  test('无改动字段 → 空数组', () => {
    const before = emptyFields()
    const after = { ...before }
    expect(diffFieldsToEffects(before, after)).toEqual([])
  })

  test('phase 改变 → 恰一条 StateFieldEffect，from/to 精确对应', () => {
    const before = { ...emptyFields(), phase: 'open' }
    const after = { ...before, phase: 'explore' }
    expect(diffFieldsToEffects(before, after)).toEqual([
      { kind: 'state-field-change', field: 'phase', from: 'open', to: 'explore' },
    ])
  })

  test('多字段同时改变（对齐 build-complete 真实场景：phase + build_sha + phase_status）→ 每个改动字段各一条，不漏不多', () => {
    const before = { ...emptyFields(), phase: 'build', build_sha: 'null', phase_status: 'in_progress' }
    const after = { ...before, phase: 'verify', build_sha: 'DEADBEEF', phase_status: 'pending' }
    const effects = diffFieldsToEffects(before, after)
    expect(effects).toHaveLength(3)
    expect(effects).toContainEqual({ kind: 'state-field-change', field: 'phase', from: 'build', to: 'verify' })
    expect(effects).toContainEqual({ kind: 'state-field-change', field: 'build_sha', from: 'null', to: 'DEADBEEF' })
    expect(effects).toContainEqual({ kind: 'state-field-change', field: 'phase_status', from: 'in_progress', to: 'pending' })
  })

  test('列表字段改变（如 related_files）→ 用数组值本身比较，不误判', () => {
    const before = { ...emptyFields(), related_files: ['a.ts'] }
    const after = { ...before, related_files: ['a.ts', 'b.ts'] }
    expect(diffFieldsToEffects(before, after)).toEqual([
      { kind: 'state-field-change', field: 'related_files', from: ['a.ts'], to: ['a.ts', 'b.ts'] },
    ])
  })

  test('列表字段值相同但引用不同（新数组、内容一致）→ 不产生 effect（比较内容不比较引用）', () => {
    const before = { ...emptyFields(), related_files: ['a.ts'] }
    const after = { ...before, related_files: ['a.ts'] } // 新数组实例，内容相同
    expect(diffFieldsToEffects(before, after)).toEqual([])
  })
})
