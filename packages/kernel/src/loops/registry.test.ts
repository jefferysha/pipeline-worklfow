/**
 * loops registry —— 窄 YAML 解析 + schema 关键字子集校验（BACKLOG #35 / GOAL B18/D16）。
 * 真相源：老仓 skills/pipeline/scripts/loops_registry.py（validate 73-141 / load_registry 149-177）
 * + loops.schema.json。本测试覆盖：narrow parser 嵌套结构、schema 子集全关键字、fail-loud、
 * loadRegistry 四态契约（缺文件 / 坏 yaml / 校验失败 / 合法）、autonomy_level 分级放权默认 L1。
 */
import { describe, expect, test } from 'vitest'
import {
  parseLoopsYaml,
  validateSchema,
  loadRegistry,
  LOOPS_SCHEMA,
  type LoopIo,
} from './registry.js'

const VALID_LOOP = `version: 1
loops:
  - id: loop-be
    name: BE 架构编排 loop
    kind: orchestrator
    goal: P1 架构 backlog 每小时发现立项跑通
    cadence: 1h
    risk: medium
    runner: cron-session
    change_prefix: loop-be-
    phases:
      - decide
      - reconcile
      - record
    human_gates:
      - P2 战略项只写提案
    state: .superpowers/loops/progress.md
    design_doc: docs/loops/be.md
    status: active
    budget:
      max_runs_per_day: 24
      max_in_flight: 1
      on_exceed: skip
    kill_criteria:
      - backlog 连续 2 轮空
    autonomy_level: L2
`

describe('parseLoopsYaml —— 窄 YAML 解析（嵌套 mapping/sequence/scalar，零 yaml npm）', () => {
  test('嵌套结构：version int + loops 列表 + 内嵌 budget mapping + 块序列', () => {
    const { data, error } = parseLoopsYaml(VALID_LOOP)
    expect(error).toBeNull()
    const d = data as { version: number; loops: Record<string, unknown>[] }
    expect(d.version).toBe(1)
    expect(d.loops).toHaveLength(1)
    const l = d.loops[0]!
    expect(l.id).toBe('loop-be')
    expect(l.kind).toBe('orchestrator')
    expect(l.change_prefix).toBe('loop-be-')
    expect(l.phases).toEqual(['decide', 'reconcile', 'record'])
    expect(l.human_gates).toEqual(['P2 战略项只写提案'])
    expect(l.budget).toEqual({ max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' })
    expect(l.kill_criteria).toEqual(['backlog 连续 2 轮空'])
    expect(l.autonomy_level).toBe('L2')
  })

  test('注释行 + 空行忽略；行尾注释裁剪（裸标量）', () => {
    const { data, error } = parseLoopsYaml(`# 头注释
version: 1   # 行尾注释

loops:
  - id: x-loop
    kind: executor
`)
    expect(error).toBeNull()
    const d = data as { version: number; loops: Record<string, unknown>[] }
    expect(d.version).toBe(1)
    expect(d.loops[0]!.id).toBe('x-loop')
    expect(d.loops[0]!.kind).toBe('executor')
  })

  test('null 哨兵 / 引号标量 / 内联流式列表', () => {
    const { data } = parseLoopsYaml(`version: 1
loops:
  - id: solo
    change_prefix: null
    goal: "带 # 井号的 引号值"
    phases: [a, b, c]
`)
    const l = (data as { loops: Record<string, unknown>[] }).loops[0]!
    expect(l.change_prefix).toBeNull()
    expect(l.goal).toBe('带 # 井号的 引号值')
    expect(l.phases).toEqual(['a', 'b', 'c'])
  })

  test('顶层非 mapping（裸标量）→ error 非空', () => {
    const { data, error } = parseLoopsYaml('just a string\n')
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})

describe('validateSchema —— JSON Schema 关键字子集（老 validate 73-141）', () => {
  test('合法 registry → 空错误列表', () => {
    const { data } = parseLoopsYaml(VALID_LOOP)
    expect(validateSchema(data, LOOPS_SCHEMA)).toEqual([])
  })

  test('缺 required 字段 → 带 JSON 路径定位的错误', () => {
    const { data } = parseLoopsYaml(`version: 1
loops:
  - id: bad
    kind: orchestrator
`)
    const errs = validateSchema(data, LOOPS_SCHEMA)
    expect(errs.length).toBeGreaterThan(0)
    expect(errs.some((e) => e.includes('loops[0].name') && e.includes('missing required'))).toBe(true)
  })

  test('type 不符 → 定位错误（budget.max_runs_per_day 期望 integer）', () => {
    const bad = { version: 1, loops: [{ ...(parseLoopsYaml(VALID_LOOP).data as { loops: Record<string, unknown>[] }).loops[0], budget: { max_runs_per_day: 'lots', max_in_flight: 1, on_exceed: 'skip' } }] }
    const errs = validateSchema(bad, LOOPS_SCHEMA)
    expect(errs.some((e) => e.includes('loops[0].budget.max_runs_per_day') && e.includes('type'))).toBe(true)
  })

  test('enum 违规（kind 非法）+ pattern 违规（id 非法）', () => {
    const errs = validateSchema({
      version: 1,
      loops: [{ ...(parseLoopsYaml(VALID_LOOP).data as { loops: Record<string, unknown>[] }).loops[0], id: 'Bad_ID', kind: 'boss' }],
    }, LOOPS_SCHEMA)
    expect(errs.some((e) => e.includes('loops[0].id') && e.includes('pattern'))).toBe(true)
    expect(errs.some((e) => e.includes('loops[0].kind') && e.includes('one of'))).toBe(true)
  })

  test('additionalProperties:false → 未知字段报错', () => {
    const errs = validateSchema({
      version: 1,
      loops: [{ ...(parseLoopsYaml(VALID_LOOP).data as { loops: Record<string, unknown>[] }).loops[0], bogus: 'x' }],
    }, LOOPS_SCHEMA)
    expect(errs.some((e) => e.includes('loops[0].bogus') && e.includes('additional'))).toBe(true)
  })

  test('const 违规（version != 1）', () => {
    const errs = validateSchema({ version: 2, loops: [] }, LOOPS_SCHEMA)
    expect(errs.some((e) => e.includes('version') && e.includes('const'))).toBe(true)
  })

  test('minItems 违规（loops 空）', () => {
    const errs = validateSchema({ version: 1, loops: [] }, LOOPS_SCHEMA)
    expect(errs.some((e) => e.includes('loops') && e.includes('minItems'))).toBe(true)
  })

  test('autonomy_level 可选（缺 → 合法）但取值受 enum 约束', () => {
    const raw = parseLoopsYaml(VALID_LOOP).data as { loops: Record<string, unknown>[] }
    const { autonomy_level: _drop, ...noLevel } = raw.loops[0]!
    expect(validateSchema({ version: 1, loops: [noLevel] }, LOOPS_SCHEMA)).toEqual([])
    const errs = validateSchema({ version: 1, loops: [{ ...raw.loops[0], autonomy_level: 'L9' }] }, LOOPS_SCHEMA)
    expect(errs.some((e) => e.includes('autonomy_level') && e.includes('one of'))).toBe(true)
  })

  test('fail-loud：schema 出现未实现关键字 → 抛（老 R3 不静默放行）', () => {
    expect(() => validateSchema(1, { type: 'integer', multipleOf: 2 })).toThrow(/unsupported schema keyword/i)
  })
})

describe('loadRegistry —— 四态载入契约（老 load_registry 149-177）', () => {
  const io = (files: Record<string, string>): LoopIo => ({
    readText: (p) => (p in files ? files[p]! : null),
  })

  test('文件不存在 → (null, [])', () => {
    const r = loadRegistry('/repo', io({}))
    expect(r.data).toBeNull()
    expect(r.errors).toEqual([])
  })

  test('合法 → data 非空、errors 空、autonomy_level 缺省填 L1（分级放权默认 report-only）', () => {
    const noLevel = VALID_LOOP.replace('    autonomy_level: L2\n', '')
    const r = loadRegistry('/repo', io({ '/repo/.pipeline/loops.yaml': noLevel }))
    expect(r.errors).toEqual([])
    expect(r.data!.loops[0]!.autonomy_level).toBe('L1')
  })

  test('schema 校验失败 → (null, [定位错误])', () => {
    const r = loadRegistry('/repo', io({ '/repo/.pipeline/loops.yaml': 'version: 1\nloops:\n  - id: x\n' }))
    expect(r.data).toBeNull()
    expect(r.errors.length).toBeGreaterThan(0)
  })

  test('顶层非 mapping → (null, [错误])', () => {
    const r = loadRegistry('/repo', io({ '/repo/.pipeline/loops.yaml': 'hello\n' }))
    expect(r.data).toBeNull()
    expect(r.errors.length).toBeGreaterThan(0)
  })
})
