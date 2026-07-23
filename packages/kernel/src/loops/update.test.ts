/**
 * loops update —— loops.yaml 字段文本手术（v5 T3 / 决议 #3 #12 存储侧）。
 * 覆盖：标量替换（保缩进/无关行含注释不动）、budget 嵌套字段替换与可选字段插入、
 * 字符串数组整块替换与插入（含空数组 `[]` 与需引号项）、多 loop 只动目标块、
 * 未知 loop / 不可 patch 字段（autonomy_level 走升降档）/ 类型错误 → error。
 */
import { describe, expect, test } from 'vitest'
import { loadRegistry, type LoopIo } from './registry.js'
import { appendLoopToYamlText, createLoopsYamlText, updateLoopInYaml, type NewLoopEntryInput } from './update.js'

const BASE = `# 顶注释：机器登记表
version: 1
loops:
  # 第一个 loop：构建
  - id: build-loop
    name: Build Loop
    kind: orchestrator
    goal: 保证每次构建都真跑八门验证不假绿
    cadence: 1h
    risk: medium  # 行尾注释：风险档
    runner: cron
    change_prefix: build-loop-
    phases: [build, verify]
    human_gates:
      - g1
      - g2
    state: .superpowers/loops/progress.md
    design_doc: docs/build-loop.md
    status: active
    budget:
      max_runs_per_day: 24
      max_in_flight: 1
      on_exceed: skip
    kill_criteria:
      - k1
    autonomy_level: L1
  - id: docs-loop
    name: Docs Loop
    kind: executor
    goal: 文档巡检保持与代码同步不漂移
    cadence: 1d
    risk: low
    runner: cron
    change_prefix: docs-loop-
    phases: [scan, fix]
    human_gates:
      - g1
    state: .superpowers/loops/progress.md
    design_doc: docs/docs-loop.md
    status: active
    budget:
      max_runs_per_day: 2
      max_in_flight: 1
      on_exceed: skip
    kill_criteria:
      - k1
    autonomy_level: L1
`

/** 读回验证：patch 后文本喂给 loadRegistry（注入内存 io，hermetic 零 fs）。 */
function readBack(text: string): ReturnType<typeof loadRegistry> {
  const io: LoopIo = { readText: () => text }
  return loadRegistry('/fake-root', io)
}

describe('updateLoopInYaml —— 标量字段', () => {
  test('patch cadence/goal/risk/status/design_doc/change_prefix：读回一致，无关行（含注释）逐行不动', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', {
      cadence: '2h',
      goal: '构建流水线保持八门验证真跑真绿不降级',
      risk: 'high',
      status: 'paused',
      design_doc: 'docs/build-loop-v2.md',
      change_prefix: 'bl-',
    })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    const loop = data!.loops.find((l) => l.id === 'build-loop')!
    expect(loop.cadence).toBe('2h')
    expect(loop.goal).toBe('构建流水线保持八门验证真跑真绿不降级')
    expect(loop.risk).toBe('high')
    expect(loop.status).toBe('paused')
    expect(loop.design_doc).toBe('docs/build-loop-v2.md')
    expect(loop.change_prefix).toBe('bl-')

    // 无关行逐行不动：只有被 patch 的 6 行标量允许变化
    const before = BASE.split('\n')
    const after = text!.split('\n')
    expect(after).toHaveLength(before.length)
    const changed = before.filter((line, i) => line !== after[i])
    expect(changed).toHaveLength(6)
    // 注释保全：顶注释 / 块内注释仍在
    expect(text).toContain('# 顶注释：机器登记表')
    expect(text).toContain('# 第一个 loop：构建')
  })

  test('未被 patch 字段的行尾注释保留（risk 行注释在 patch cadence 后不动）', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', { cadence: '30m' })
    expect(error).toBeNull()
    expect(text).toContain('risk: medium  # 行尾注释：风险档')
    expect(text).toContain('    cadence: 30m')
  })

  test('change_prefix 可写 null，读回 null', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', { change_prefix: null })
    expect(error).toBeNull()
    const { data } = readBack(text!)
    expect(data!.loops[0]!.change_prefix).toBeNull()
  })

  test('标量值含 ` #` 时自动加引号，读回不丢注释后缀', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', { goal: '保证 #1 优先级的构建验证永远真跑' })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops[0]!.goal).toBe('保证 #1 优先级的构建验证永远真跑')
  })
})

describe('updateLoopInYaml —— budget 嵌套字段', () => {
  test('替换 max_runs_per_day/max_in_flight/on_exceed + 插入缺失的 max_tokens_per_day', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', {
      max_runs_per_day: 12,
      max_in_flight: 2,
      on_exceed: 'halt',
      max_tokens_per_day: 50000,
    })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops[0]!.budget).toEqual({
      max_runs_per_day: 12,
      max_in_flight: 2,
      on_exceed: 'halt',
      max_tokens_per_day: 50000,
    })
    // docs-loop 的 budget 不动
    expect(data!.loops[1]!.budget.max_runs_per_day).toBe(2)
  })
})

describe('updateLoopInYaml —— 字符串数组字段', () => {
  test('替换既有块序列（human_gates/kill_criteria）+ 插入缺失的 allowlist/denylist', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', {
      human_gates: ['push/合并到远端'],
      kill_criteria: ['连败 3 次', 'backlog 连续 2 轮空'],
      allowlist: ['src/**', 'docs/**'],
      denylist: ['secrets/**', '**/*.env'],
    })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    const loop = data!.loops.find((l) => l.id === 'build-loop')!
    expect(loop.human_gates).toEqual(['push/合并到远端'])
    expect(loop.kill_criteria).toEqual(['连败 3 次', 'backlog 连续 2 轮空'])
    expect(loop.allowlist).toEqual(['src/**', 'docs/**'])
    expect(loop.denylist).toEqual(['secrets/**', '**/*.env'])
    // docs-loop 不受影响（缺省 []）
    const docs = data!.loops.find((l) => l.id === 'docs-loop')!
    expect(docs.human_gates).toEqual(['g1'])
    expect(docs.allowlist).toEqual([])
    expect(docs.denylist).toEqual([])
  })

  test('空数组写成内联 `[]`，读回 []（denylist 清空场景）', () => {
    const seeded = updateLoopInYaml(BASE, 'build-loop', { denylist: ['secrets/**'] }).text!
    const { text, error } = updateLoopInYaml(seeded, 'build-loop', { denylist: [] })
    expect(error).toBeNull()
    expect(text).toContain('denylist: []')
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops[0]!.denylist).toEqual([])
  })

  test('数组项形如 `key: value` 时自动加引号，读回原文', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', { kill_criteria: ['result: fail 连续 3 次'] })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops[0]!.kill_criteria).toEqual(['result: fail 连续 3 次'])
  })
})

describe('updateLoopInYaml —— 拒绝面', () => {
  test('未知 loop id → error，text null', () => {
    const r = updateLoopInYaml(BASE, 'ghost-loop', { cadence: '2h' })
    expect(r.text).toBeNull()
    expect(r.error).toContain('ghost-loop')
  })

  test('autonomy_level 不收（走升降档流程），text null', () => {
    const r = updateLoopInYaml(BASE, 'build-loop', { autonomy_level: 'L3' })
    expect(r.text).toBeNull()
    expect(r.error).toContain('autonomy_level')
  })

  test('不可 patch 字段（id/name/phases/state）→ error（runner 自 v5 T20 起可 patch，见下方专测）', () => {
    for (const field of ['id', 'name', 'phases', 'state']) {
      const r = updateLoopInYaml(BASE, 'build-loop', { [field]: 'x' })
      expect(r.text).toBeNull()
      expect(r.error).toContain(field)
    }
  })

  test('类型错误：标量字段给数组 / 数组字段给字符串 / budget 给字符串 → error', () => {
    expect(updateLoopInYaml(BASE, 'build-loop', { cadence: ['2h'] }).error).toContain('cadence')
    expect(updateLoopInYaml(BASE, 'build-loop', { denylist: 'secrets/**' }).error).toContain('denylist')
    expect(updateLoopInYaml(BASE, 'build-loop', { max_runs_per_day: 'many' }).error).toContain('max_runs_per_day')
    expect(updateLoopInYaml(BASE, 'build-loop', { allowlist: ['ok', 42] }).error).toContain('allowlist')
  })

  test('字符串含换行/控制字符 → error（禁写坏行进 yaml）', () => {
    expect(updateLoopInYaml(BASE, 'build-loop', { goal: '第一行\n第二行' }).error).not.toBeNull()
    expect(updateLoopInYaml(BASE, 'build-loop', { denylist: ['bad\u0007glob'] }).error).not.toBeNull()
  })

  test('空 patch → error（无字段可改）', () => {
    const r = updateLoopInYaml(BASE, 'build-loop', {})
    expect(r.text).toBeNull()
    expect(r.error).not.toBeNull()
  })
})

// ── v5 T20：runner 双支持（决议 #13 口径外的数据面）——runner 可 patch 且 codex 过整文档 schema ──
describe('updateLoopInYaml —— runner（v5 T20 双 runner 数据面）', () => {
  test('patch runner: codex —— 读回一致、schema 全绿、另一 loop 的 runner 不动', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', { runner: 'codex' })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops.find((l) => l.id === 'build-loop')!.runner).toBe('codex')
    expect(data!.loops.find((l) => l.id === 'docs-loop')!.runner).toBe('cron')
  })

  test('patch runner: claude-code —— 同样合法（下拉双选项的另一半）', () => {
    const { text, error } = updateLoopInYaml(BASE, 'docs-loop', { runner: 'claude-code' })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops.find((l) => l.id === 'docs-loop')!.runner).toBe('claude-code')
  })
})

// ── H10 §1：skill_bundle_id 治理写入（policy 字段；本函数只搬字面量，不做词法/存在性校验——
// 写回后调用方须重跑 parseLoopsYaml + validateSchema(LOOPS_SCHEMA) 才拦下非法值，同 cadence/risk 口径）──
describe('updateLoopInYaml —— skill_bundle_id（H10 §1 policy 字段治理写入）', () => {
  test('patch 非空 profile id：读回一致，另一 loop 的字段不受影响（缺省仍是 null）', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', { skill_bundle_id: 'pm' })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops.find((l) => l.id === 'build-loop')!.skill_bundle_id).toBe('pm')
    expect(data!.loops.find((l) => l.id === 'docs-loop')!.skill_bundle_id).toBeNull()
  })

  test('patch null：显式退回 unwired，读回 null（同 change_prefix 的 null 写回口径）', () => {
    const seeded = updateLoopInYaml(BASE, 'build-loop', { skill_bundle_id: '_all' }).text!
    const { text, error } = updateLoopInYaml(seeded, 'build-loop', { skill_bundle_id: null })
    expect(error).toBeNull()
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops[0]!.skill_bundle_id).toBeNull()
  })

  test('非法词法值：本函数仍写回（不做值域校验），但调用方重跑 schema 会拦下', () => {
    const { text, error } = updateLoopInYaml(BASE, 'build-loop', { skill_bundle_id: 'Bad_ID' })
    expect(error).toBeNull()
    const { errors } = readBack(text!)
    expect(errors.some((e) => e.includes('skill_bundle_id'))).toBe(true)
  })

  test('类型错误（数组/数字）→ error 提及字段名', () => {
    expect(updateLoopInYaml(BASE, 'build-loop', { skill_bundle_id: ['pm'] }).error).toContain('skill_bundle_id')
    expect(updateLoopInYaml(BASE, 'build-loop', { skill_bundle_id: 42 }).error).toContain('skill_bundle_id')
  })
})

// ── loop init 原语（2026-07-12 loop-init L1）：createLoopsYamlText / appendLoopToYamlText ──

/** 15 个 required 字段全量（拍板 P5：不含 autonomy_level/allowlist/denylist——载入派生，序列化省略）。 */
const NEW_ENTRY: NewLoopEntryInput = {
  id: 'restyle-loop',
  name: 'Restyle Loop',
  kind: 'orchestrator',
  goal: '视觉回归巡检每轮真跑不放过样式漂移',
  cadence: '4h',
  risk: 'low',
  runner: 'claude-code',
  change_prefix: 'rl-',
  phases: ['explore', 'spec', 'code', 'verify'],
  human_gates: ['explore', 'spec', 'verify'],
  design_doc: 'docs/loops/restyle-loop.md',
  status: 'paused',
  budget: { max_runs_per_day: 48, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: 100000 },
  kill_criteria: ['no-change-3', 'budget-burn-2d'],
}

const WIRED_ENTRY = {
  ...NEW_ENTRY,
  template_id: 'future-template',
  template_version: 1,
  workflow_id: 'release-train',
  skill_bundle_id: 'pm',
} satisfies NewLoopEntryInput

describe('createLoopsYamlText —— 全新 loops.yaml 文本（loop-init L1）', () => {
  test('H9 新建条目不再持久化旧 state 运行状态字段', () => {
    const { state: _legacyState, ...entry } = NEW_ENTRY
    const { text, error } = createLoopsYamlText(entry as NewLoopEntryInput)
    expect(error).toBeNull()
    expect(text).not.toMatch(/^\s+state:/m)
  })

  test('① 产文过 parse+schema，loadRegistry 等价读回逐字段 roundtrip（载入派生字段补默认）', () => {
    const { text, error } = createLoopsYamlText(NEW_ENTRY)
    expect(error).toBeNull()
    expect(text!.startsWith('version: 1\nloops:\n')).toBe(true)
    expect(text!.endsWith('\n')).toBe(true)
    expect(text!.endsWith('\n\n')).toBe(false) // 产文以单个 \n 结尾
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops).toHaveLength(1)
    expect(data!.loops[0]).toEqual({ ...NEW_ENTRY, autonomy_level: 'L1', allowlist: [], denylist: [], skill_bundle_id: null })
  })

  test('H11 四个 wiring 字段原样 round-trip；status 保持 paused 且不持久化 wiring status', () => {
    const { text, error } = createLoopsYamlText(WIRED_ENTRY)

    expect(error).toBeNull()
    expect(text).toContain('    template_id: future-template\n')
    expect(text).toContain('    template_version: 1\n')
    expect(text).toContain('    workflow_id: release-train\n')
    expect(text).toContain('    skill_bundle_id: pm\n')
    expect(text).not.toContain('wiring_status')
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops[0]).toMatchObject({
      template_id: 'future-template',
      template_version: 1,
      workflow_id: 'release-train',
      skill_bundle_id: 'pm',
      status: 'paused',
    })
  })

  test('排版与手术层 LoopBlock 规则闭环：dash 缩进 2 / 字段列 4 / budget 列 6 / 数组块序列', () => {
    const lines = createLoopsYamlText(NEW_ENTRY).text!.split('\n')
    expect(lines).toContain('  - id: restyle-loop')
    expect(lines).toContain('    name: Restyle Loop')
    expect(lines).toContain('    budget:')
    expect(lines).toContain('      max_runs_per_day: 48')
    expect(lines).toContain('      max_tokens_per_day: 100000')
    expect(lines).toContain('    human_gates:')
    expect(lines).toContain('      - explore')
  })

  test('⑥ change_prefix: null 写裸 null 字面量，读回 null', () => {
    const { text, error } = createLoopsYamlText({ ...NEW_ENTRY, change_prefix: null })
    expect(error).toBeNull()
    expect(text).toContain('    change_prefix: null')
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops[0]!.change_prefix).toBeNull()
  })

  test('④ goal 含双引号（全引号包裹，裸写 roundtrip 失败又不可加引号）/ name 含换行 → error 不产文', () => {
    const g = createLoopsYamlText({ ...NEW_ENTRY, goal: '"全引号包裹的目标字符串十个字以上"' })
    expect(g.text).toBeNull()
    expect(g.error).toContain('goal')
    const n = createLoopsYamlText({ ...NEW_ENTRY, name: 'Bad\nName' })
    expect(n.text).toBeNull()
    expect(n.error).toContain('name')
  })

  test('⑤ entry 违 schema（phases 单元素 / goal 过短）→ error 不产文（自校验兜底）', () => {
    const p = createLoopsYamlText({ ...NEW_ENTRY, phases: ['solo'] })
    expect(p.text).toBeNull()
    expect(p.error).toContain('phases')
    const g = createLoopsYamlText({ ...NEW_ENTRY, goal: '太短' })
    expect(g.text).toBeNull()
    expect(g.error).toContain('goal')
  })
})

describe('appendLoopToYamlText —— 既有文本尾部追加（loop-init L1）', () => {
  test('② 带注释+多 loop fixture 追加：before 区间逐字节保留（前缀断言）+ 新条目读回', () => {
    const { text, error } = appendLoopToYamlText(BASE, NEW_ENTRY)
    expect(error).toBeNull()
    expect(text!.startsWith(BASE)).toBe(true) // 原文（含顶注释/行尾注释/排版）逐字节不变
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops.map((l) => l.id)).toEqual(['build-loop', 'docs-loop', 'restyle-loop'])
    expect(data!.loops[2]).toEqual({ ...NEW_ENTRY, autonomy_level: 'L1', allowlist: [], denylist: [], skill_bundle_id: null })
    expect(data!.loops[0]!.goal).toBe('保证每次构建都真跑八门验证不假绿') // 旧 loop 原值不动
  })

  test('H11 四个 wiring 字段随追加条目 round-trip，不改旧前缀、不默认 active、不写 wiring status', () => {
    const { text, error } = appendLoopToYamlText(BASE, WIRED_ENTRY)

    expect(error).toBeNull()
    expect(text!.startsWith(BASE)).toBe(true)
    expect(text).not.toContain('wiring_status')
    const { data, errors } = readBack(text!)
    expect(errors).toEqual([])
    expect(data!.loops[2]).toMatchObject({
      template_id: 'future-template',
      template_version: 1,
      workflow_id: 'release-train',
      skill_bundle_id: 'pm',
      status: 'paused',
    })
  })

  test('before 无尾换行 → 先补一个换行再追加（登记行为），产文仍单 \\n 结尾', () => {
    const noTrail = BASE.replace(/\n$/, '')
    const { text, error } = appendLoopToYamlText(noTrail, NEW_ENTRY)
    expect(error).toBeNull()
    expect(text!.startsWith(`${noTrail}\n`)).toBe(true)
    expect(text!.endsWith('\n')).toBe(true)
    expect(text!.endsWith('\n\n')).toBe(false)
    expect(readBack(text!).errors).toEqual([])
  })

  test('③ 重复 id → error 且 text 为 null', () => {
    const r = appendLoopToYamlText(BASE, { ...NEW_ENTRY, id: 'build-loop' })
    expect(r.text).toBeNull()
    expect(r.error).toContain('build-loop')
  })

  test('before 不可解析 → error 不硬追加', () => {
    const r = appendLoopToYamlText('   :::坏文本\n', NEW_ENTRY)
    expect(r.text).toBeNull()
    expect(r.error).not.toBeNull()
  })

  test('⑦ 产文再喂 updateLoopInYaml patch 标量 → 手术成功（与手术层定位规则闭环）', () => {
    const created = createLoopsYamlText(NEW_ENTRY).text!
    const c = updateLoopInYaml(created, 'restyle-loop', { cadence: '2h' })
    expect(c.error).toBeNull()
    expect(readBack(c.text!).data!.loops[0]!.cadence).toBe('2h')

    const appended = appendLoopToYamlText(BASE, NEW_ENTRY).text!
    const a = updateLoopInYaml(appended, 'restyle-loop', { status: 'active' })
    expect(a.error).toBeNull()
    const { data, errors } = readBack(a.text!)
    expect(errors).toEqual([])
    expect(data!.loops.find((l) => l.id === 'restyle-loop')!.status).toBe('active')
    expect(data!.loops[0]!.status).toBe('active') // 追加块的手术不误伤旧块
  })
})
