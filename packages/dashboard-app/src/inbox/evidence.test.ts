/**
 * gateEvidence（评审 P0-1 核心）—— 真机评审证实 snapshot 每帧送 38 个字段前端只渲染 6 个，
 * verify 门放行要看的 verify_result/agent_review_result/codex_review_result/verification_report/
 * build_sha 全在 ChangeSnapshot.fields 里从未被渲染。本测试锁定"当前相位该出示哪些证据"的映射
 * 规则（见 .superpowers/sdd/task-6-brief.md），Task 7（详情卡+行内 chips）直接消费这份契约。
 */
import { describe, expect, it } from 'vitest'
import { gateEvidence, type EvidenceChip } from './evidence'
import { DEFAULT_RULES, rulesFromDef } from '../model/workflowModel'
import { makeChange } from '../testkit'

// 自定义 workflow：rules 非 DEFAULT_RULES（同 inbox.test.tsx 的 REL_RULES 写法）。
const CUSTOM_RULES = rulesFromDef({
  name: 'release-train',
  steps: [
    { id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
})

describe('gateEvidence（gate 证据映射纯函数）', () => {
  it('verify 门：三轨 + report + build_sha 齐全 → 5 个证据 chip', () => {
    const c = makeChange('c', 'verify', {
      fields: {
        verify_result: 'pass',
        agent_review_result: 'pass',
        codex_review_result: 'pass',
        verification_report: '/repo/openspec/changes/c/reports/verify.md',
        build_sha: 'a1b2c3d',
      },
    })
    const expected: EvidenceChip[] = [
      { key: 'verify_result', value: 'pass', tone: 'pass' },
      { key: 'agent_review_result', value: 'pass', tone: 'pass' },
      { key: 'codex_review_result', value: 'pass', tone: 'pass' },
      { key: 'verification_report', value: '/repo/openspec/changes/c/reports/verify.md', tone: 'neutral', copyable: true },
      { key: 'build_sha', value: 'a1b2c3d', tone: 'neutral', copyable: true },
    ]
    expect(gateEvidence(c, DEFAULT_RULES)).toEqual(expected)
  })

  it('verify 门：任一轨 fail → 该 chip 染 tone fail（pending 字面量也如实映射）', () => {
    const c = makeChange('c', 'verify', {
      fields: {
        verify_result: 'pass',
        agent_review_result: 'fail',
        codex_review_result: 'pending',
        verification_report: '/repo/report.md',
        build_sha: 'deadbeef',
      },
    })
    const expected: EvidenceChip[] = [
      { key: 'verify_result', value: 'pass', tone: 'pass' },
      { key: 'agent_review_result', value: 'fail', tone: 'fail' },
      { key: 'codex_review_result', value: 'pending', tone: 'pending' },
      { key: 'verification_report', value: '/repo/report.md', tone: 'neutral', copyable: true },
      { key: 'build_sha', value: 'deadbeef', tone: 'neutral', copyable: true },
    ]
    expect(gateEvidence(c, DEFAULT_RULES)).toEqual(expected)
  })

  it('verify 门：report 字面 null → pending 占位（不再剔除）；空字符串 tri-state 字段 → pending', () => {
    const c = makeChange('c', 'verify', {
      fields: {
        verify_result: 'pass',
        agent_review_result: 'pass',
        codex_review_result: '',
        verification_report: 'null',
        build_sha: 'sha123',
      },
    })
    const expected: EvidenceChip[] = [
      { key: 'verify_result', value: 'pass', tone: 'pass' },
      { key: 'agent_review_result', value: 'pass', tone: 'pass' },
      { key: 'codex_review_result', value: '', tone: 'pending' },
      { key: 'verification_report', value: '未产出', tone: 'pending' },
      { key: 'build_sha', value: 'sha123', tone: 'neutral', copyable: true },
    ]
    expect(gateEvidence(c, DEFAULT_RULES)).toEqual(expected)
  })

  it('explore 门：design_doc 有值 copyable；plan 未产出 → value 替换为「未产出」+ pending（key 仍是字段名）', () => {
    const c = makeChange('c', 'explore', {
      fields: {
        design_doc: '/repo/openspec/changes/c/design.md',
        plan: '',
      },
    })
    const expected: EvidenceChip[] = [
      { key: 'design_doc', value: '/repo/openspec/changes/c/design.md', tone: 'neutral', copyable: true },
      { key: 'plan', value: '未产出', tone: 'pending' },
    ]
    expect(gateEvidence(c, DEFAULT_RULES)).toEqual(expected)
  })

  it('自定义 workflow（rules 非 default）→ 只出非空路径字段，neutral copyable', () => {
    const c = makeChange('c', 'review', {
      fields: {
        design_doc: '/repo/design.md',
        plan: 'null',
        verification_report: '',
        pr_url: 'https://github.com/org/repo/pull/42',
      },
    })
    const expected: EvidenceChip[] = [
      { key: 'design_doc', value: '/repo/design.md', tone: 'neutral', copyable: true },
      { key: 'pr_url', value: 'https://github.com/org/repo/pull/42', tone: 'neutral', copyable: true },
    ]
    expect(gateEvidence(c, CUSTOM_RULES)).toEqual(expected)
  })

  it('相位不在映射表 + rules 缺失 + 字段全空 → 返回 []', () => {
    const c = makeChange('c', 'open', { fields: {} })
    expect(gateEvidence(c, undefined)).toEqual([])
  })

  it('rules 缺失（undefined）+ phase=verify → 判据收紧后走兜底，不伪造三轨 chips（字段全非路径型 → []）', () => {
    const c = makeChange('c', 'verify', {
      fields: {
        verify_result: 'pending',
        agent_review_result: 'pending',
        codex_review_result: 'pending',
      },
    })
    expect(gateEvidence(c, undefined)).toEqual([])
  })

  it('自定义 rules（新引用，非 DEFAULT_RULES）+ phase=verify → 同样走兜底，不伪造三轨 chips', () => {
    const c = makeChange('c', 'verify', {
      fields: {
        verify_result: 'pending',
        agent_review_result: 'pending',
        codex_review_result: 'pending',
      },
    })
    expect(gateEvidence(c, CUSTOM_RULES)).toEqual([])
  })
})
