/**
 * loops update —— loops.yaml 字段文本手术（v5 T3 / 决议 #3 #12 存储侧）。
 * 覆盖：标量替换（保缩进/无关行含注释不动）、budget 嵌套字段替换与可选字段插入、
 * 字符串数组整块替换与插入（含空数组 `[]` 与需引号项）、多 loop 只动目标块、
 * 未知 loop / 不可 patch 字段（autonomy_level 走升降档）/ 类型错误 → error。
 */
import { describe, expect, test } from 'vitest'
import { loadRegistry, type LoopIo } from './registry.js'
import { updateLoopInYaml } from './update.js'

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

  test('不可 patch 字段（id/name/phases/state/runner）→ error', () => {
    for (const field of ['id', 'name', 'phases', 'state', 'runner']) {
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
