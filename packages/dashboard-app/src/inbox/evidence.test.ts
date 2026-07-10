/**
 * gateEvidence（评审 P0-1 核心）—— 真机评审证实 snapshot 每帧送 38 个字段前端只渲染 6 个，
 * verify 门放行要看的 verify_result/agent_review_result/codex_review_result/verification_report/
 * build_sha 全在 ChangeSnapshot.fields 里从未被渲染。本测试锁定"当前相位该出示哪些证据"的映射
 * 规则（见 .superpowers/sdd/task-6-brief.md），Task 7（详情卡+行内 chips）直接消费这份契约。
 */
import { describe, expect, it } from 'vitest'
import { artifactChips, gateEvidence, stageArtifacts, VERIFY_STATUS_FIELDS, type EvidenceChip } from './evidence'
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

  it('verify 门：report 字面 null → unset pending 占位（不再剔除）；空字符串 tri-state 字段 → pending', () => {
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
      // 终审修复批（契约修正）：未产出占位不再把中文「未产出」焊死进 value——value 置空 +
      // unset:true，展示文案交给消费方 i18n t('evidence.unset')。
      { key: 'verification_report', value: '', tone: 'pending', unset: true },
      { key: 'build_sha', value: 'sha123', tone: 'neutral', copyable: true },
    ]
    expect(gateEvidence(c, DEFAULT_RULES)).toEqual(expected)
  })

  it('explore 门：design_doc 有值 copyable；plan 未产出 → value 置空 + unset:true + pending（key 仍是字段名，展示文案交给消费方 i18n）', () => {
    const c = makeChange('c', 'explore', {
      fields: {
        design_doc: '/repo/openspec/changes/c/design.md',
        plan: '',
      },
    })
    const expected: EvidenceChip[] = [
      { key: 'design_doc', value: '/repo/openspec/changes/c/design.md', tone: 'neutral', copyable: true },
      { key: 'plan', value: '', tone: 'pending', unset: true },
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

  it('rules 缺失但路径字段非空 → 兜底如实吐非空路径 chip（T7 交叉场景补钉：上轮只被间接覆盖）', () => {
    const c = makeChange('c', 'review', { fields: { design_doc: '/repo/design.md' } })
    expect(gateEvidence(c, undefined)).toEqual([
      { key: 'design_doc', value: '/repo/design.md', tone: 'neutral', copyable: true },
    ])
  })
})

/**
 * stageArtifacts（T7 决策 B 后半）—— 每阶段产物清单纯函数，喂 T8 详情双形态（垂直时间线 /
 * 阶段 sheet）。default 的阶段产物映射：调研 design_doc / 规格 plan / 实现 branch+build_sha /
 * 验证四证据（三轨判定 + verification_report；build_sha 归实现阶段不重复列）。未设占位沿
 * evidence.ts 终审修复批契约：{key, value:'', tone:'pending', unset:true}，展示文案由消费方
 * 按 unset 走 i18n t('evidence.unset')（zh「未产出」/en 'not produced'），本层不焊死中文。
 */
describe('stageArtifacts（每阶段产物清单，T7）', () => {
  it('default：7 阶段逐一出现且顺序同 rules.steps；open/ship/archive 无产物声明 → 空清单', () => {
    const c = makeChange('c', 'build')
    const stages = stageArtifacts(DEFAULT_RULES, c)
    expect(stages.map((s) => s.step)).toEqual(['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'])
    const byStep = new Map(stages.map((s) => [s.step, s.chips]))
    expect(byStep.get('open')).toEqual([])
    expect(byStep.get('ship')).toEqual([])
    expect(byStep.get('archive')).toEqual([])
  })

  it('default：调研/规格/实现映射——实值 → neutral+copyable，未设 → pending+unset 占位', () => {
    const c = makeChange('c', 'build', {
      fields: {
        design_doc: '/repo/openspec/changes/c/design.md',
        plan: '',
        branch: 'feature/c',
        build_sha: 'null',
      },
    })
    const byStep = new Map(stageArtifacts(DEFAULT_RULES, c).map((s) => [s.step, s.chips]))
    expect(byStep.get('explore')).toEqual([
      { key: 'design_doc', value: '/repo/openspec/changes/c/design.md', tone: 'neutral', copyable: true },
    ])
    expect(byStep.get('spec')).toEqual([{ key: 'plan', value: '', tone: 'pending', unset: true }])
    expect(byStep.get('build')).toEqual([
      { key: 'branch', value: 'feature/c', tone: 'neutral', copyable: true },
      { key: 'build_sha', value: '', tone: 'pending', unset: true },
    ])
  })

  it('default：验证阶段四证据——三轨如实映射 tone（同 gateEvidence 口径），report 未设占位', () => {
    const c = makeChange('c', 'verify', {
      fields: {
        verify_result: 'pass',
        agent_review_result: 'fail',
        codex_review_result: '',
        verification_report: 'null',
      },
    })
    const byStep = new Map(stageArtifacts(DEFAULT_RULES, c).map((s) => [s.step, s.chips]))
    expect(byStep.get('verify')).toEqual([
      { key: 'verify_result', value: 'pass', tone: 'pass' },
      { key: 'agent_review_result', value: 'fail', tone: 'fail' },
      { key: 'codex_review_result', value: '', tone: 'pending' },
      { key: 'verification_report', value: '', tone: 'pending', unset: true },
    ])
  })

  it('自定义 workflow：rulesFromDef 携带的 outputsByStep 驱动每步清单，实值/占位同一纪律', () => {
    const rules = rulesFromDef({
      name: 'release-train',
      steps: [
        { id: 'draft', label: '', gate: null, skills: [], inputs: [], outputs: [{ field: 'draft_doc', type: 'file_path' }], guards: [], transitions: [{ event: 'approved', to: 'review' }] },
        { id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [{ field: 'release_notes', type: 'file_path' }], guards: [{ type: 'nonempty-output' }], transitions: [] },
      ],
    })
    const c = makeChange('c', 'review', { fields: { draft_doc: '/repo/draft.md' } })
    expect(stageArtifacts(rules, c)).toEqual([
      { step: 'draft', chips: [{ key: 'draft_doc', value: '/repo/draft.md', tone: 'neutral', copyable: true }] },
      { step: 'review', chips: [{ key: 'release_notes', value: '', tone: 'pending', unset: true }] },
    ])
  })

  it('裸自定义 rules（无产出声明，T6 时代形状）→ 每步空清单（不伪造产物）', () => {
    const c = makeChange('c', 'review', { fields: { design_doc: '/repo/design.md' } })
    expect(stageArtifacts(CUSTOM_RULES, c)).toEqual([{ step: 'review', chips: [] }])
  })

  it('rules 缺失（定义拉取失败）→ []（时间线留白，消费方回落 artifactChips 产物正门）', () => {
    const c = makeChange('c', 'review', { fields: { design_doc: '/repo/design.md' } })
    expect(stageArtifacts(undefined, c)).toEqual([])
  })
})

/**
 * artifactChips（评审 Important-1 + Minor-3 同根修复）—— 产物正门：把 gateEvidence 兜底分支
 * 里"遍历 PATH_FIELDS 挑非空路径字段"这段逻辑收敛成独立可导出的语义化函数，供 ChangeDetailCard
 * 的「产物」区直接消费，不必再靠"故意传 gateEvidence(c, undefined) 强制走兜底分支"这种隐式
 * 技巧反推同一份候选集（该技巧的副作用是 ChangeDetailCard 的 whyText 也误借了 copyable 当
 * "是不是三轨字段"的替身信号，见 ChangeDetailCard.test.tsx 的 whyText 修复用例）。
 */
describe('artifactChips（产物正门，评审 Important-1 + Minor-3 同根修复）', () => {
  it('四个路径字段全非空 → 4 个 chip，顺序固定 design_doc/plan/verification_report/pr_url，均 neutral+copyable', () => {
    const c = makeChange('c', 'build', {
      fields: {
        design_doc: '/repo/openspec/changes/c/design.md',
        plan: '/repo/openspec/changes/c/plan.md',
        verification_report: '/repo/openspec/changes/c/reports/verify.md',
        pr_url: 'https://github.com/org/repo/pull/1',
      },
    })
    const expected: EvidenceChip[] = [
      { key: 'design_doc', value: '/repo/openspec/changes/c/design.md', tone: 'neutral', copyable: true },
      { key: 'plan', value: '/repo/openspec/changes/c/plan.md', tone: 'neutral', copyable: true },
      { key: 'verification_report', value: '/repo/openspec/changes/c/reports/verify.md', tone: 'neutral', copyable: true },
      { key: 'pr_url', value: 'https://github.com/org/repo/pull/1', tone: 'neutral', copyable: true },
    ]
    expect(artifactChips(c)).toEqual(expected)
  })

  it('部分字段空 / 字面 null → 剔除，只留非空的（不像 gateEvidence 表驱动分支那样替换成占位）', () => {
    const c = makeChange('c', 'build', {
      fields: {
        design_doc: '/repo/design.md',
        plan: '',
        verification_report: 'null',
        pr_url: 'https://github.com/org/repo/pull/2',
      },
    })
    const expected: EvidenceChip[] = [
      { key: 'design_doc', value: '/repo/design.md', tone: 'neutral', copyable: true },
      { key: 'pr_url', value: 'https://github.com/org/repo/pull/2', tone: 'neutral', copyable: true },
    ]
    expect(artifactChips(c)).toEqual(expected)
  })

  it('gateEvidence 兜底分支与 artifactChips 同源（内部共享实现，不是各自维护一份重复逻辑）', () => {
    const c = makeChange('c', 'review', { fields: { design_doc: '/repo/design.md', pr_url: 'https://github.com/org/repo/pull/3' } })
    expect(gateEvidence(c, CUSTOM_RULES)).toEqual(artifactChips(c))
  })
})

describe('VERIFY_STATUS_FIELDS（三轨字段名常量，评审修复后导出供 ChangeDetailCard whyText 消费）', () => {
  it('导出值 = 三轨字段名，顺序固定', () => {
    expect(VERIFY_STATUS_FIELDS).toEqual(['verify_result', 'agent_review_result', 'codex_review_result'])
  })
})
