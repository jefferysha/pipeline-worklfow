import { describe, it, expect } from 'vitest'
import { changeWorkflow, decisionKind, isAwaitingDecision, projectName, selectInbox } from './inbox'
import { DEFAULT_RULES, rulesFromDef, rulesKey, type WorkflowRules } from '../model/workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'

const REL_RULES = rulesFromDef({
  name: 'release-train',
  steps: [
    { id: 'draft', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'approved', to: 'review' }] },
    { id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'shipped', to: 'ship' }] },
    { id: 'ship', label: '', gate: 'confirm', skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
})

// Task 8（G19③）：selectInbox 第三参键从「裸 wf 名」升级为「rulesKey(root,wf)」——本文件既有
// selectInbox 测试全部固定用 root='/a'，迁移只需把 Map 的 key 从 wf 名换成 rulesKey('/a', wf)，
// 断言的期望输出（items 内容/顺序）逐字不变——这就是意图迁移表要证明的"非聚合路径行为不变"。
const RULES = new Map<string, WorkflowRules>([
  [rulesKey('/a', 'default'), DEFAULT_RULES],
  [rulesKey('/a', 'release-train'), REL_RULES],
])

describe('isAwaitingDecision（gate 泛化判据，G17）', () => {
  it('default：explore/spec/verify（未归档）在等我决定', () => {
    for (const phase of ['explore', 'spec', 'verify']) {
      expect(isAwaitingDecision(makeChange('c', phase), DEFAULT_RULES)).toBe(true)
    }
  })

  it('default：open/build/ship/archive 不在等我决定', () => {
    for (const phase of ['open', 'build', 'ship', 'archive']) {
      expect(isAwaitingDecision(makeChange('c', phase), DEFAULT_RULES)).toBe(false)
    }
  })

  it('已归档（archived=true）即便处于复核相位也不入收件箱', () => {
    expect(isAwaitingDecision(makeChange('c', 'verify', { archived: 'true' }), DEFAULT_RULES)).toBe(false)
  })

  it('自定义 workflow：gate=review 的 step 在等；gate=confirm/null 不在等', () => {
    expect(isAwaitingDecision(makeChange('c', 'review'), REL_RULES)).toBe(true)
    expect(isAwaitingDecision(makeChange('c', 'ship'), REL_RULES)).toBe(false)
    expect(isAwaitingDecision(makeChange('c', 'draft'), REL_RULES)).toBe(false)
  })

  it('rules 缺失（定义拉取失败）→ 不误报', () => {
    expect(isAwaitingDecision(makeChange('c', 'verify'), undefined)).toBe(false)
  })
})

describe('changeWorkflow（fields.workflow 回落 default）', () => {
  it('未设/空 → default；显式设置 → 原名', () => {
    expect(changeWorkflow(makeChange('c', 'open'))).toBe('default')
    expect(changeWorkflow(makeChange('c', 'open', { fields: { workflow: '' } }))).toBe('default')
    expect(changeWorkflow(makeChange('c', 'draft', { fields: { workflow: 'release-train' } }))).toBe('release-train')
  })
})

describe('selectInbox（currentRoot 语境下摘出在等决定的 change）', () => {
  it('null snapshot → 空', () => {
    expect(selectInbox(null, '/a', RULES)).toEqual([])
  })

  it('只保留 gate 卡，且只看 currentRoot 项目（其它项目的卡不出现）', () => {
    const snap = makeSnapshot([
      makeProject('/a', [makeChange('a-open', 'open'), makeChange('a-verify', 'verify')]),
      makeProject('/b', [makeChange('b-spec', 'spec')]),
    ])
    const items = selectInbox(snap, '/a', RULES)
    expect(items.map((i) => i.change.name)).toEqual(['a-verify'])
  })

  it('自定义 workflow 的 gate 卡也进收件箱（G17 修复证据）', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('rel-x', 'review', { fields: { workflow: 'release-train' } }),
        makeChange('rel-y', 'draft', { fields: { workflow: 'release-train' } }),
      ]),
    ])
    expect(selectInbox(snap, '/a', RULES).map((i) => i.change.name)).toEqual(['rel-x'])
  })

  it('跳过 ok=false 的项目（不可达 project 不谎报待办）', () => {
    const snap = makeSnapshot([
      makeProject('/bad', [makeChange('x', 'verify')], { ok: false, error: 'unreachable' }),
    ])
    expect(selectInbox(snap, '/bad', RULES)).toEqual([])
  })

  it('按 updated_at 倒序、并列按 name 升序', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('old', 'verify', { updated_at: '2026-07-01T00:00:00Z' }),
        makeChange('new-b', 'spec', { updated_at: '2026-07-07T00:00:00Z' }),
        makeChange('new-a', 'explore', { updated_at: '2026-07-07T00:00:00Z' }),
      ]),
    ])
    expect(selectInbox(snap, '/a', RULES).map((i) => i.change.name)).toEqual(['new-a', 'new-b', 'old'])
  })
})

describe('selectInbox 聚合语境（currentRoot=""，Task 8/G19③ 前半）', () => {
  it("currentRoot='' → 遍历全部 ok 项目的 gate 卡，每条各自带正确 root（ok=false 项目仍被跳过）", () => {
    const snap = makeSnapshot([
      makeProject('/a', [makeChange('a-verify', 'verify', { updated_at: '2026-07-01T00:00:00Z' })]),
      makeProject('/b', [makeChange('b-spec', 'spec', { updated_at: '2026-07-02T00:00:00Z' })]),
      makeProject('/bad', [makeChange('bad-verify', 'verify')], { ok: false, error: 'unreachable' }),
    ])
    const rulesByKey = new Map<string, WorkflowRules>([
      [rulesKey('/a', 'default'), DEFAULT_RULES],
      [rulesKey('/b', 'default'), DEFAULT_RULES],
    ])
    const items = selectInbox(snap, '', rulesByKey)
    expect(items.map((i) => ({ root: i.root, name: i.change.name }))).toEqual([
      { root: '/b', name: 'b-spec' }, // updated_at 更新（07-02），倒序排前
      { root: '/a', name: 'a-verify' },
    ])
  })

  it('rulesKey 区分同名自定义 workflow：两个项目都叫它 release-train 但门语义不同，各自按自己项目的规则判定（不串 key）', () => {
    const reviewGates = rulesFromDef({
      name: 'release-train',
      steps: [{ id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [], transitions: [] }],
    })
    const noGates = rulesFromDef({
      name: 'release-train',
      steps: [{ id: 'review', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }],
    })
    const snap = makeSnapshot([
      makeProject('/a', [makeChange('a-review', 'review', { fields: { workflow: 'release-train' } })]),
      makeProject('/b', [makeChange('b-review', 'review', { fields: { workflow: 'release-train' } })]),
    ])
    const rulesByKey = new Map<string, WorkflowRules>([
      [rulesKey('/a', 'release-train'), reviewGates],
      [rulesKey('/b', 'release-train'), noGates],
    ])
    // 若第三参仍按裸 wf 名键（旧契约），两个 Map 条目会共享同一个 'release-train' 键、互相
    // 覆盖（后写的 noGates 会盖掉 reviewGates），a-review 也会被误判成"不在等"，结果变 []。
    // rulesKey(root,wf) 隔离后两条各自命中自己项目的规则，只有 a-review 在等。
    expect(selectInbox(snap, '', rulesByKey).map((i) => i.change.name)).toEqual(['a-review'])
  })
})

describe('decisionKind / projectName', () => {
  it('decisionKind：default 三相位保留细分文案 key，自定义 step 一律 other', () => {
    expect(decisionKind(makeChange('c', 'explore'))).toBe('explore')
    expect(decisionKind(makeChange('c', 'spec'))).toBe('spec')
    expect(decisionKind(makeChange('c', 'verify'))).toBe('verify')
    expect(decisionKind(makeChange('c', 'build'))).toBe('other')
    expect(decisionKind(makeChange('c', 'review', { fields: { workflow: 'release-train' } }))).toBe('other')
  })

  it('projectName 取路径末段', () => {
    expect(projectName(makeProject('/Users/me/code/my-repo', []))).toBe('my-repo')
  })
})
