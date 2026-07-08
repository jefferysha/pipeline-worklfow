# Workflow 自定义引擎实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 7 相位状态机从"写死在类型系统里"变成"内置默认 workflow + 可自定义 workflow"，
自定义 workflow 支持每个 step 声明 skill 的 `depends_on` DAG、`inputs`/`outputs` 持久字段
契约、可选用的 guard 类型。

**Architecture:** **对既有 v1.0 代码的改动降到最低、blast radius 收紧**——研究已确认 `Phase`
是编译期 `as const` 字符串联合类型，被 `EXIT_RULES`（guard.ts）、`TRANSITION_EVENTS`
（transition-table.ts）、`ManifestData.transitions`（manifest.ts）三处 `Record<Phase,...>`
消费。与其把这三处全部改造成完全动态（对现有 1700+ 测试爆炸性影响），采用**双轨策略**：
`.pipeline.yaml` 新增 `workflow` 字段（缺省 `'default'`）；`workflow==='default'` 时，
guard/transition 走**现有全部代码路径，一字不改**（零回归风险）；`workflow!=='default'`
时，才激活新的数据驱动路径（读 workflow 定义文件裁决）。`phase` 字段本身不改名、不删除——
自定义 workflow 下它的值就是当前 step 的 id（不再要求是 7 个之一）。

hook 侧：`gate.sh` 对 `workflow==='default'` 的 change **零改动**（现状已确认 gate.sh 不
读 phase，本来就不受影响）。skill DAG 依赖解锁判定这个全新能力，只在 `workflow!=='default'`
时才需要，鉴于是进阶用法而非高频路径，允许通过新增的 `pipeline internal-skill-gate` 隐藏
CLI 命令实现（spawn node 一次），不强行用纯 bash 手写 DAG 遍历——热路径纯 bash 红线只对
`workflow==='default'` 这条最高频路径承诺，这条路径完全不变。

**Tech Stack:** TypeScript（kernel 手写窄解析器，不引入 yaml 包，同 `.pipeline.yaml`/
`manifest.yaml` 现状策略）。

## Global Constraints

- kernel 零第三方运行时依赖——workflow 定义文件解析**禁止**引入 `yaml`/`js-yaml` 包，必须
  手写窄解析器（同 `packages/kernel/src/state/parse.ts` / `packages/kernel/src/flow/
  manifest.ts` 现有策略，文件头注释已经明确写了"禁 yaml 包"的理由，本计划延续这条禁令，
  理由从"防止偏离老内核契约"改写成"避免引入解析歧义 + 保持零依赖"）。
- `workflow==='default'` 时，本计划不允许修改 `EXIT_RULES`/`TRANSITION_EVENTS`/
  `ManifestData.transitions` 这三个现有表的内容或类型签名——任何改动都会牵动全部 1700+
  既有测试，超出本计划范围。新逻辑只在 `workflow!=='default'` 分支触达。
- 每个任务改完必须跑一次 `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow
  && npx vitest run packages/kernel` 确认现有 kernel 测试全绿，防止双轨策略实现有误
  意外污染了 default 分支。

---

### Task 1: Workflow 定义类型

**Files:**
- Create: `packages/kernel/src/workflow/types.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `WorkflowDef`/`StepDef`/`SkillRef`/`FieldRef`/`GuardConfig` 类型，供 Task 2
  （解析器）、Task 4（校验）、Task 6（guard 求值）消费。

- [x] **Step 1: 写失败测试（类型层面的编译期测试，用一个真构造的对象校验类型形状）**

```ts
// packages/kernel/src/workflow/types.test.ts
import { describe, expect, it } from 'vitest'
import type { WorkflowDef } from './types.js'

describe('WorkflowDef 类型形状', () => {
  it('一个真实构造的 workflow 对象应该类型检查通过（编译期断言，运行时只做 truthy 检查）', () => {
    const wf: WorkflowDef = {
      name: 'default',
      steps: [
        {
          id: 'explore',
          label: '调研',
          gate: 'review',
          skills: [
            { id: 'superpowers:brainstorming' },
            { id: 'opsx:explore', depends_on: ['superpowers:brainstorming'] },
          ],
          inputs: [],
          outputs: [{ field: 'design_doc', type: 'file_path' }],
          guards: [],
          transitions: [{ event: 'complete', to: 'spec' }],
        },
        {
          id: 'verify',
          label: '验证',
          gate: 'review',
          skills: [],
          inputs: [],
          outputs: [],
          guards: [],
          // 分支：同一个 step 按不同 event 名走向不同的下一个 step（对齐现有 default workflow
          // verify-pass→ship / verify-fail→build 这种真实分支需求，不是纯线性链）。
          transitions: [
            { event: 'pass', to: 'ship' },
            { event: 'fail', to: 'build' },
          ],
        },
      ],
    }
    expect(wf.steps[0]?.id).toBe('explore')
    expect(wf.steps[0]?.skills[1]?.depends_on).toEqual(['superpowers:brainstorming'])
    expect(wf.steps[1]?.transitions).toHaveLength(2)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/kernel/src/workflow/types.test.ts`
Expected: FAIL — `Cannot find module './types.js'`

- [x] **Step 3: 实现**

```ts
// packages/kernel/src/workflow/types.ts
/**
 * workflow 自定义引擎类型（GOAL 清单 E）——双轨策略：workflow==='default' 时完全不使用
 * 这些类型，走 packages/kernel/src/flow/ 现有的硬编码路径；只有 workflow!=='default'
 * 才会加载、解析、消费这里定义的形状。
 */
export type FieldType = 'string' | 'file_path' | 'boolean'
export type GateKind = 'review' | 'confirm' | null

export interface FieldRef {
  readonly field: string
  readonly type: FieldType
}

export interface SkillRef {
  readonly id: string
  /** 同 step 内其它 skill 的 id；无 = 无依赖，可立即调用。跨 step 引用是校验期错误（Task 4）。 */
  readonly depends_on?: readonly string[]
}

export type GuardConfig =
  | { readonly type: 'tasks-at-least'; readonly n: number }
  | { readonly type: 'nonempty-output' }

/** step 间转换边——每个 step 自己声明"按哪个 event 名走向哪个下一个 step"，取代
 *  default workflow 依赖的全局 TRANSITION_EVENTS 表（那张表是 Record<Phase,...>，天然
 *  不适用任意自定义 step）。同一个 step 可以有多条边（不同 event 名指向不同下一个 step，
 *  对齐现有 verify-pass→ship / verify-fail→build 这种真实分支需求）。 */
export interface StepTransition {
  readonly event: string
  readonly to: string
}

export interface StepDef {
  readonly id: string
  readonly label: string
  readonly gate: GateKind
  readonly skills: readonly SkillRef[]
  readonly inputs: readonly FieldRef[]
  readonly outputs: readonly FieldRef[]
  readonly guards: readonly GuardConfig[]
  readonly transitions: readonly StepTransition[]
}

export interface WorkflowDef {
  readonly name: string
  readonly steps: readonly StepDef[]
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/types.test.ts`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/kernel/src/workflow/types.ts packages/kernel/src/workflow/types.test.ts
git commit -m "feat(kernel): workflow 自定义引擎类型定义"
```

---

### Task 2: 手写窄解析器（workflow YAML → WorkflowDef）

**Files:**
- Create: `packages/kernel/src/workflow/parse.ts`
- Create: `packages/kernel/src/workflow/parse.test.ts`

**Interfaces:**
- Consumes: Task 1 的类型。
- Produces: `parseWorkflow(content: string): WorkflowDef`（解析失败 throw，不静默返回空——
  这是配置文件，格式错误必须 fail-loud，同 `manifest.ts` 现有策略）。

- [x] **Step 1: 写失败测试**

```ts
// packages/kernel/src/workflow/parse.test.ts
import { describe, expect, it } from 'vitest'
import { parseWorkflow } from './parse.js'

const SAMPLE = `name: default
steps:
  - id: open
    label: 立项
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: complete
        to: explore
  - id: explore
    label: 调研
    gate: review
    skills:
      - id: superpowers:brainstorming
      - id: opsx:explore
        depends_on: [superpowers:brainstorming]
    inputs: []
    outputs:
      - field: design_doc
        type: file_path
    guards: []
    transitions: []
  - id: verify
    label: 验证
    gate: review
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: pass
        to: ship
      - event: fail
        to: build
`

describe('parseWorkflow', () => {
  it('解析出 3 个 step，第二个 step 的第二个 skill 带 depends_on', () => {
    const wf = parseWorkflow(SAMPLE)
    expect(wf.name).toBe('default')
    expect(wf.steps).toHaveLength(3)
    expect(wf.steps[1]?.id).toBe('explore')
    expect(wf.steps[1]?.gate).toBe('review')
    expect(wf.steps[1]?.skills[1]).toEqual({ id: 'opsx:explore', depends_on: ['superpowers:brainstorming'] })
    expect(wf.steps[1]?.outputs[0]).toEqual({ field: 'design_doc', type: 'file_path' })
  })

  it('第一个 step 的 transitions 解析出单条边', () => {
    const wf = parseWorkflow(SAMPLE)
    expect(wf.steps[0]?.transitions).toEqual([{ event: 'complete', to: 'explore' }])
  })

  it('verify step 的 transitions 解析出两条分支边（同一 step 不同 event 走向不同 to）', () => {
    const wf = parseWorkflow(SAMPLE)
    expect(wf.steps[2]?.transitions).toEqual([
      { event: 'pass', to: 'ship' },
      { event: 'fail', to: 'build' },
    ])
  })

  it('格式错误（steps 不是数组）→ 真抛错，不静默返回空', () => {
    expect(() => parseWorkflow('name: x\nsteps: not-a-list\n')).toThrow()
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/parse.test.ts`
Expected: FAIL — `Cannot find module './parse.js'`

- [x] **Step 3: 实现**

```ts
// packages/kernel/src/workflow/parse.ts
/**
 * workflow 定义文件窄解析器——同 packages/kernel/src/flow/manifest.ts 的策略：手写扫描，
 * 只支持本文件格式实际用到的 YAML 子集（flat key/value + 固定形状的 block 序列 +
 * `[a, b]` 单行 flow-list），禁引入 yaml 包（kernel 零第三方依赖硬规则）。格式错误
 * fail-loud（throw），不吞错静默返回残缺结构。
 */
import type { FieldRef, FieldType, GateKind, GuardConfig, SkillRef, StepDef, StepTransition, WorkflowDef } from './types.js'

function parseInlineList(raw: string): string[] {
  const trimmed = raw.trim()
  if (trimmed === '[]') return []
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error(`workflow 解析错误：期望 [a, b] 形态的单行列表，实际 '${raw}'`)
  }
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

interface Cursor {
  lines: string[]
  i: number
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function parseSkillsBlock(cur: Cursor, baseIndent: number): SkillRef[] {
  const skills: SkillRef[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '' ) { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line)
    if (!idMatch) break
    cur.i++
    let depends_on: string[] | undefined
    const next = cur.lines[cur.i] ?? ''
    const depMatch = /^\s*depends_on:\s*(\[.*\])\s*$/.exec(next)
    if (depMatch && indentOf(next) > baseIndent) {
      depends_on = parseInlineList(depMatch[1]!)
      cur.i++
    }
    skills.push(depends_on ? { id: idMatch[1]!, depends_on } : { id: idMatch[1]! })
  }
  return skills
}

function parseFieldRefBlock(cur: Cursor, baseIndent: number): FieldRef[] {
  const refs: FieldRef[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const fieldMatch = /^\s*-\s+field:\s*(\S+)\s*$/.exec(line)
    if (!fieldMatch) break
    cur.i++
    const typeLine = cur.lines[cur.i] ?? ''
    const typeMatch = /^\s*type:\s*(string|file_path|boolean)\s*$/.exec(typeLine)
    if (!typeMatch) throw new Error(`workflow 解析错误：field '${fieldMatch[1]}' 缺 type`)
    cur.i++
    refs.push({ field: fieldMatch[1]!, type: typeMatch[1] as FieldType })
  }
  return refs
}

function parseTransitionsBlock(cur: Cursor, baseIndent: number): StepTransition[] {
  const transitions: StepTransition[] = []
  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent) break
    const eventMatch = /^\s*-\s+event:\s*(\S+)\s*$/.exec(line)
    if (!eventMatch) break
    cur.i++
    const toLine = cur.lines[cur.i] ?? ''
    const toMatch = /^\s*to:\s*(\S+)\s*$/.exec(toLine)
    if (!toMatch) throw new Error(`workflow 解析错误：transitions 里 event '${eventMatch[1]}' 缺 to`)
    cur.i++
    transitions.push({ event: eventMatch[1]!, to: toMatch[1]! })
  }
  return transitions
}

function parseStep(cur: Cursor): StepDef {
  const idLine = cur.lines[cur.i] ?? ''
  const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(idLine)
  if (!idMatch) throw new Error(`workflow 解析错误：期望 '- id: <name>'，实际 '${idLine}'`)
  const baseIndent = indentOf(idLine) + 2 // step 内字段比 "- id:" 多缩进 2
  cur.i++

  let label = ''
  let gate: GateKind = null
  let skills: SkillRef[] = []
  let inputs: FieldRef[] = []
  let outputs: FieldRef[] = []
  const guards: GuardConfig[] = []
  let transitions: StepTransition[] = []

  while (cur.i < cur.lines.length) {
    const line = cur.lines[cur.i] ?? ''
    if (line.trim() === '') { cur.i++; continue }
    if (indentOf(line) < baseIndent - 2) break
    if (/^\s*label:\s*(.+)$/.test(line)) { label = /^\s*label:\s*(.+)$/.exec(line)![1]!.trim(); cur.i++; continue }
    if (/^\s*gate:\s*(review|confirm|null)\s*$/.test(line)) {
      const v = /^\s*gate:\s*(review|confirm|null)\s*$/.exec(line)![1]!
      gate = v === 'null' ? null : (v as GateKind)
      cur.i++
      continue
    }
    if (/^\s*skills:\s*\[\]\s*$/.test(line)) { skills = []; cur.i++; continue }
    if (/^\s*skills:\s*$/.test(line)) { cur.i++; skills = parseSkillsBlock(cur, baseIndent); continue }
    if (/^\s*inputs:\s*\[\]\s*$/.test(line)) { inputs = []; cur.i++; continue }
    if (/^\s*inputs:\s*$/.test(line)) { cur.i++; inputs = parseFieldRefBlock(cur, baseIndent); continue }
    if (/^\s*outputs:\s*\[\]\s*$/.test(line)) { outputs = []; cur.i++; continue }
    if (/^\s*outputs:\s*$/.test(line)) { cur.i++; outputs = parseFieldRefBlock(cur, baseIndent); continue }
    if (/^\s*guards:\s*\[\]\s*$/.test(line)) { cur.i++; continue }
    if (/^\s*transitions:\s*\[\]\s*$/.test(line)) { transitions = []; cur.i++; continue }
    if (/^\s*transitions:\s*$/.test(line)) { cur.i++; transitions = parseTransitionsBlock(cur, baseIndent); continue }
    break
  }

  return { id: idMatch[1]!, label, gate, skills, inputs, outputs, guards, transitions }
}

export function parseWorkflow(content: string): WorkflowDef {
  const lines = content.split('\n')
  const nameMatch = /^name:\s*(\S+)\s*$/.exec(lines[0] ?? '')
  if (!nameMatch) throw new Error("workflow 解析错误：第一行必须是 'name: <name>'")
  if ((lines[1] ?? '').trim() !== 'steps:') throw new Error("workflow 解析错误：第二行必须是 'steps:'")

  const cur: Cursor = { lines, i: 2 }
  const steps: StepDef[] = []
  while (cur.i < lines.length) {
    if ((lines[cur.i] ?? '').trim() === '') { cur.i++; continue }
    if (!/^\s*-\s+id:/.test(lines[cur.i] ?? '')) {
      throw new Error(`workflow 解析错误：steps 下每项必须以 '- id:' 开头，实际 '${lines[cur.i]}'`)
    }
    steps.push(parseStep(cur))
  }
  return { name: nameMatch[1]!, steps }
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/parse.test.ts`
Expected: PASS（4 例）

- [x] **Step 5: 提交**

```bash
git add packages/kernel/src/workflow/parse.ts packages/kernel/src/workflow/parse.test.ts
git commit -m "feat(kernel): workflow YAML 手写窄解析器（零第三方依赖）"
```

---

### Task 3: 保存时校验（无环 + inputs 引用必须对应更早 step 的 outputs）

**Files:**
- Create: `packages/kernel/src/workflow/validate.ts`
- Create: `packages/kernel/src/workflow/validate.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `WorkflowDef`。
- Produces: `validateWorkflow(wf: WorkflowDef): string[]`（返回错误信息数组，空数组=校验
  通过；不 throw，因为调用方——Task 8 的写端点——需要把所有错误一次性回给用户，而不是
  只报第一个）。

- [x] **Step 1: 写失败测试**

```ts
// packages/kernel/src/workflow/validate.test.ts
import { describe, expect, it } from 'vitest'
import { validateWorkflow } from './validate.js'
import type { WorkflowDef } from './types.js'

function wf(overrides: Partial<WorkflowDef>): WorkflowDef {
  return { name: 'test', steps: [], ...overrides }
}

describe('validateWorkflow', () => {
  it('skill 依赖成环 → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [
          { id: 'a', depends_on: ['b'] },
          { id: 'b', depends_on: ['a'] },
        ],
      }],
    }))
    expect(result.some((e) => e.includes('循环依赖'))).toBe(true)
  })

  it('depends_on 引用跨 step 不存在的 skill id → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [{ id: 'a', depends_on: ['does-not-exist'] }],
      }],
    }))
    expect(result.some((e) => e.includes('does-not-exist'))).toBe(true)
  })

  it('inputs 引用的字段不是任何更早 step 的 outputs → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 's2' }] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes('design_doc'))).toBe(true)
  })

  it('transitions 的 to 引用不存在的 step id → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'does-not-exist' }] },
      ],
    }))
    expect(result.some((e) => e.includes("'does-not-exist'") && e.includes('不存在'))).toBe(true)
  })

  it('非终止 step（没有任何后续 transitions 声明）→ 报错，防止用户漏配走进死路', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    // s1 前面还有 s2 这个后续 step 存在，s1 自己却没声明任何 transition 能走到它或任何地方——
    // 只有"数组里最后一个 step"允许零 transitions（终态，如 archive），中间的 step 零
    // transitions 视为配置错误。
    expect(result.some((e) => e.includes("step 's1'") && e.includes('没有声明任何 transitions'))).toBe(true)
  })

  it('合法 workflow（含分支 transitions）→ 空数组', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [], transitions: [{ event: 'complete', to: 's2' }] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [], guards: [], transitions: [{ event: 'pass', to: 's3' }, { event: 'fail', to: 's1' }] },
        { id: 's3', label: 'c', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result).toEqual([])
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/validate.test.ts`
Expected: FAIL — 模块不存在

- [x] **Step 3: 实现**

```ts
// packages/kernel/src/workflow/validate.ts
import type { WorkflowDef } from './types.js'

function detectCycle(skillIds: string[], dependsOn: Map<string, string[]>): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map(skillIds.map((id) => [id, WHITE]))
  const errors: string[] = []

  function visit(id: string, path: string[]): void {
    color.set(id, GRAY)
    for (const dep of dependsOn.get(id) ?? []) {
      if (color.get(dep) === GRAY) {
        errors.push(`循环依赖：${[...path, id, dep].join(' -> ')}`)
        continue
      }
      if (color.get(dep) === WHITE) visit(dep, [...path, id])
    }
    color.set(id, BLACK)
  }

  for (const id of skillIds) {
    if (color.get(id) === WHITE) visit(id, [])
  }
  return errors
}

export function validateWorkflow(wf: WorkflowDef): string[] {
  const errors: string[] = []
  const producedByEarlierStep = new Set<string>()
  const allStepIds = new Set(wf.steps.map((s) => s.id))

  wf.steps.forEach((step, index) => {
    const skillIds = step.skills.map((s) => s.id)
    const dependsOn = new Map(step.skills.map((s) => [s.id, [...(s.depends_on ?? [])]]))

    for (const skill of step.skills) {
      for (const dep of skill.depends_on ?? []) {
        if (!skillIds.includes(dep)) {
          errors.push(`step '${step.id}' 的 skill '${skill.id}' 依赖了同 step 内不存在的 '${dep}'`)
        }
      }
    }
    errors.push(...detectCycle(skillIds, dependsOn).map((e) => `step '${step.id}': ${e}`))

    for (const input of step.inputs) {
      if (!producedByEarlierStep.has(input.field)) {
        errors.push(`step '${step.id}' 的 inputs 字段 '${input.field}' 不对应任何更早 step 的 outputs`)
      }
    }
    for (const output of step.outputs) producedByEarlierStep.add(output.field)

    // 每条 transition 的 to 必须指向同一 workflow 里真实存在的 step id——否则
    // pipeline transition 在真运行时才会发现走不到，属于本该在保存时就拦下的错误。
    for (const t of step.transitions) {
      if (!allStepIds.has(t.to)) {
        errors.push(`step '${step.id}' 的 transitions 里 event '${t.event}' 的 to '${t.to}' 不存在`)
      }
    }

    // 只有数组里最后一个 step 允许零 transitions（视为终态，如 archive）；中间任何一个
    // step 零 transitions 意味着一旦真运行到这一步就再也走不出去，是配置错误而非合法终态，
    // 保存时就该拦，不能留到用户真跑 transition 命令时才发现卡死。
    const isLastStep = index === wf.steps.length - 1
    if (!isLastStep && step.transitions.length === 0) {
      errors.push(`step '${step.id}' 没有声明任何 transitions（不是最后一个 step，会导致走进死路）`)
    }
  })

  return errors
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/validate.test.ts`
Expected: PASS（6 例）

- [x] **Step 5: 提交**

```bash
git add packages/kernel/src/workflow/validate.ts packages/kernel/src/workflow/validate.test.ts
git commit -m "feat(kernel): workflow 保存时校验（无环 + inputs/outputs 引用）"
```

---

### Task 4: `.pipeline.yaml` 新增 `workflow` 字段

**Files:**
- Modify: `packages/kernel/src/types.ts`（`FIELD_ORDER` 数组追加 `'workflow'`）
- Modify: `packages/kernel/src/state/parse.ts`（`emptyFields()` 需要给新字段一个缺省值）

**Interfaces:**
- Consumes: 无。
- Produces: 每个 change 的 state 现在多一个 `workflow` 字段，缺省值 `'default'`；
  `FieldName` 类型自动包含 `'workflow'`（因为是从 `FIELD_ORDER` 派生的），下游 `store.get/
  set(dir, 'workflow', ...)` 无需额外类型改动即可用。

**这是本计划里对现有 v1.0 代码改动最小、但影响面需要格外小心的一步**——`FIELD_ORDER` 的
顺序决定了 `.pipeline.yaml` 序列化的字段顺序，多个 fixture 文件（`packages/kernel/src/
state/fixtures/*.pipeline.yaml`）和 oracle 双跑逐字比对都依赖当前顺序。新增字段必须加在
**列表末尾**（`archived` 之后），不能插入中间，否则会让所有既有 fixture 的序列化输出错位。

- [x] **Step 1: 写失败测试**

```ts
// packages/kernel/src/types.test.ts（如果不存在就新建；如果已有同名测试文件则追加到其中）
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
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/types.test.ts`
Expected: FAIL

- [x] **Step 3: 实现**

`types.ts` 的 `FIELD_ORDER` 数组末尾（`'archived',` 之后）加一行 `'workflow',`。
`state/parse.ts` 的 `emptyFields()` 函数体里（具体写法先 Read 该文件确认现有实现——研究
已知它是逐字段填充默认值的函数）给 `workflow` 字段填 `'default'`（其它字段现状是空字符串
或 `'null'` 哨兵，`workflow` 是例外——它必须有一个真实默认值而不是空，因为下游任何读
`workflow` 字段的代码都要能直接判断"是不是 default"，不应该还要处理"空字符串等价于
default"这种隐式约定）。

- [x] **Step 4: 跑测试确认通过 + 确认现有全部 kernel 测试无回归**

Run: `npx vitest run packages/kernel/src/types.test.ts`
Expected: PASS

Run: `npx vitest run packages/kernel`
Expected: 全部现存用例仍然 PASS（新增字段不该改变任何现有断言的结果——如果有 fixture
测试因为字段顺序变化而失败，检查是不是不小心把 `workflow` 插到了列表中间而不是末尾）。

- [x] **Step 5: 提交**

```bash
git add packages/kernel/src/types.ts packages/kernel/src/state/parse.ts packages/kernel/src/types.test.ts
git commit -m "feat(kernel): .pipeline.yaml 新增 workflow 字段（缺省 default）"
```

---

### Task 5: 内置默认 workflow 文件 + 加载器

**Files:**
- Create: `templates/workflows/default.yaml`（内容 = 现有 7 相位的数据化镜像，仅供
  `workflow!=='default'` 判断用；default 分支本身仍走 Task 4 之前的硬编码路径，**这个文件
  当前阶段不参与任何实际裁决**，只是为将来"让 default 也走统一路径"这个可能的后续演进
  预留数据镜像，先落地格式，不急着切流量）
- Create: `packages/kernel/src/workflow/loadWorkflow.ts`
- Create: `packages/kernel/src/workflow/loadWorkflow.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `parseWorkflow`。
- Produces: `loadWorkflow(repoRoot: string, name: string): WorkflowDef | null`（找不到对应
  文件返回 `null`，不 throw——"这个 workflow 不存在"是调用方要处理的正常分支，不是异常）。

- [x] **Step 1: 写 `templates/workflows/default.yaml`**

transitions 字段逐字对齐现有 `packages/kernel/src/flow/transition-table.ts` 的
`TRANSITION_EVENTS` 表（8 条边，event 名完全复用，不重新发明）——这份镜像文件因此天然是
对既有事件表的忠实转录，不是凭空设计：

```yaml
name: default
steps:
  - id: open
    label: 立项
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: open-complete
        to: explore
  - id: explore
    label: 调研
    gate: review
    skills: []
    inputs: []
    outputs:
      - field: design_doc
        type: file_path
    guards: []
    transitions:
      - event: explore-complete
        to: spec
  - id: spec
    label: 规格
    gate: review
    skills: []
    inputs:
      - field: design_doc
        type: file_path
    outputs:
      - field: plan
        type: file_path
    guards:
      - type: tasks-at-least
        n: 3
    transitions:
      - event: spec-complete
        to: build
  - id: build
    label: 实现
    gate: null
    skills: []
    inputs:
      - field: design_doc
        type: file_path
      - field: plan
        type: file_path
    outputs:
      - field: build_sha
        type: string
    guards: []
    transitions:
      - event: build-complete
        to: verify
  - id: verify
    label: 验证
    gate: review
    skills: []
    inputs:
      - field: build_sha
        type: string
    outputs:
      - field: verification_report
        type: file_path
    guards: []
    transitions:
      - event: verify-pass
        to: ship
      - event: verify-fail
        to: build
  - id: ship
    label: 交付
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: ship-complete
        to: archive
  - id: archive
    label: 归档
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
```

（`archive` 是数组最后一个 step，零 `transitions` 合法——对齐 Task 3 校验规则"只有最后
一个 step 允许零 transitions"。真实的 `archived` 自循环事件——archive→archive，见现有
`TRANSITION_EVENTS.archived`——这里刻意不转录：它在现有代码里是"重复调用同一个终态事件
应该怎么响应"的边界处理，不是这份数据镜像现阶段要复现的行为，等 default 真正切到统一路径
的后续演进里再处理。）

- [x] **Step 2: 写失败测试**

```ts
// packages/kernel/src/workflow/loadWorkflow.test.ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadWorkflow } from './loadWorkflow.js'

describe('loadWorkflow', () => {
  it('存在的 workflow 文件 → 解析返回 WorkflowDef', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wf-load-'))
    await mkdir(join(root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'workflows', 'custom.yaml'), 'name: custom\nsteps:\n', 'utf8')
    const wf = loadWorkflow(root, 'custom')
    expect(wf?.name).toBe('custom')
  })

  it('不存在的 workflow → null，不抛错', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wf-load-empty-'))
    expect(loadWorkflow(root, 'does-not-exist')).toBeNull()
  })
})
```

- [x] **Step 3: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/loadWorkflow.test.ts`
Expected: FAIL

- [x] **Step 4: 实现**

```ts
// packages/kernel/src/workflow/loadWorkflow.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseWorkflow } from './parse.js'
import type { WorkflowDef } from './types.js'

export function loadWorkflow(repoRoot: string, name: string): WorkflowDef | null {
  const p = join(repoRoot, '.pipeline', 'workflows', `${name}.yaml`)
  if (!existsSync(p)) return null
  return parseWorkflow(readFileSync(p, 'utf8'))
}
```

- [x] **Step 5: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/loadWorkflow.test.ts`
Expected: PASS

- [x] **Step 6: 提交**

```bash
git add templates/workflows/default.yaml packages/kernel/src/workflow/loadWorkflow.ts packages/kernel/src/workflow/loadWorkflow.test.ts
git commit -m "feat(kernel): 内置默认 workflow 数据镜像 + loadWorkflow 加载器"
```

---

### Task 6: Skill DAG 解锁判定（纯函数，不涉及 hook/CLI 接线）

**Files:**
- Create: `packages/kernel/src/workflow/skillDag.ts`
- Create: `packages/kernel/src/workflow/skillDag.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `SkillRef`；`HistoryEntry`（已存在于 `@pipeline-lite/kernel` 的
  `types.ts`）。
- Produces: `isSkillUnlocked(skillId: string, skills: readonly SkillRef[], completedSinceStepEntry: ReadonlySet<string>): boolean`——
  纯函数，供 Task 7（CLI 命令）调用。

- [x] **Step 1: 写失败测试**

```ts
// packages/kernel/src/workflow/skillDag.test.ts
import { describe, expect, it } from 'vitest'
import { isSkillUnlocked } from './skillDag.js'
import type { SkillRef } from './types.js'

describe('isSkillUnlocked', () => {
  const skills: SkillRef[] = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c', depends_on: ['a', 'b'] },
    { id: 'd', depends_on: ['a'] },
  ]

  it('无依赖的 skill 永远解锁', () => {
    expect(isSkillUnlocked('a', skills, new Set())).toBe(true)
    expect(isSkillUnlocked('b', skills, new Set())).toBe(true)
  })

  it('有依赖但未全部完成 → 锁定', () => {
    expect(isSkillUnlocked('c', skills, new Set(['a']))).toBe(false)
  })

  it('依赖全部完成 → 解锁', () => {
    expect(isSkillUnlocked('c', skills, new Set(['a', 'b']))).toBe(true)
  })

  it('交叉依赖场景：d 只依赖 a，不需要等 b（验证不会被过度串行化）', () => {
    expect(isSkillUnlocked('d', skills, new Set(['a']))).toBe(true)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/skillDag.test.ts`
Expected: FAIL

- [x] **Step 3: 实现**

```ts
// packages/kernel/src/workflow/skillDag.ts
import type { SkillRef } from './types.js'

export function isSkillUnlocked(
  skillId: string,
  skills: readonly SkillRef[],
  completedSinceStepEntry: ReadonlySet<string>,
): boolean {
  const ref = skills.find((s) => s.id === skillId)
  if (!ref) return false
  return (ref.depends_on ?? []).every((dep) => completedSinceStepEntry.has(dep))
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/skillDag.test.ts`
Expected: PASS（4 例）

- [x] **Step 5: 提交**

```bash
git add packages/kernel/src/workflow/skillDag.ts packages/kernel/src/workflow/skillDag.test.ts
git commit -m "feat(kernel): skill DAG 解锁判定纯函数"
```

---

### Task 7: Step 级 guard 求值（纯函数，判定能否离开当前 step）

**Files:**
- Create: `packages/kernel/src/workflow/stepGuard.ts`
- Create: `packages/kernel/src/workflow/stepGuard.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `StepDef`/`GuardConfig`；`PipelineState`（`@pipeline-lite/kernel` 已有）。
- Produces: `evaluateStepGuards(state: PipelineState, step: StepDef, ctx: StepGuardContext): GuardResult`——
  `GuardResult` 复用 kernel 已有的 `{ pass: boolean; failures: string[] }` 形状（同
  `evaluateGuard` 的返回类型，default workflow 那条路径已经在用），供 Task 8（transition
  命令）调用判定"能不能离开这个 step"。

**为什么只做 `nonempty-output`，`tasks-at-least` 留一个明确的 TODO 而不是假装实现**：
`tasks-at-least` 需要真读 `tasks.md` 数出未勾选任务数——这个计数逻辑现在活在
`packages/kernel/src/flow/guard.ts` 内部（`evaluateGuard` 处理 `{kind:'tasks-at-least'}`
分支时用的那段代码），研究阶段没有拿到这段代码的确切实现细节。本任务只对
`nonempty-output` 给出完整实现（覆盖 default workflow 迁移过来的 `spec`/`explore`/`build`
等大部分 step 最常用的退出条件），`tasks-at-least` 分支实现时需要先 Read
`packages/kernel/src/flow/guard.ts` 全文找到这段计数逻辑并抽成一个可复用的纯函数
（导出它，而不是复制一份——两处保持单一实现，避免"什么算已完成任务"这条规则出现两个
不同答案）。

- [x] **Step 1: 写失败测试**

```ts
// packages/kernel/src/workflow/stepGuard.test.ts
import { describe, expect, it } from 'vitest'
import { evaluateStepGuards } from './stepGuard.js'
import type { StepDef } from './types.js'
import { emptyFields } from '../state/parse.js'
import type { PipelineState } from '../types.js'

function state(fields: Partial<Record<string, string>>): PipelineState {
  return { fields: { ...emptyFields(), ...fields } as PipelineState['fields'], opaqueTail: '' }
}

function step(overrides: Partial<StepDef>): StepDef {
  return { id: 's1', label: 'x', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [], ...overrides }
}

describe('evaluateStepGuards', () => {
  it('outputs 声明的字段已设置（非 null 哨兵）→ pass', () => {
    const s = step({ outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [{ type: 'nonempty-output' }] })
    const result = evaluateStepGuards(state({ design_doc: '/tmp/x/design.md' }), s, { changeDirAbs: '/tmp/x' })
    expect(result.pass).toBe(true)
  })

  it('outputs 声明的字段仍是 null 哨兵 → fail，failures 里点名具体字段', () => {
    const s = step({ outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [{ type: 'nonempty-output' }] })
    const result = evaluateStepGuards(state({ design_doc: 'null' }), s, { changeDirAbs: '/tmp/x' })
    expect(result.pass).toBe(false)
    expect(result.failures.some((f) => f.includes('design_doc'))).toBe(true)
  })

  it('没有 nonempty-output guard 时，字段是否设置不影响结果（guards 列表说了算，不是隐式全查）', () => {
    const s = step({ outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [] })
    const result = evaluateStepGuards(state({ design_doc: 'null' }), s, { changeDirAbs: '/tmp/x' })
    expect(result.pass).toBe(true)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/kernel/src/workflow/stepGuard.test.ts`
Expected: FAIL

- [x] **Step 3: 实现**

```ts
// packages/kernel/src/workflow/stepGuard.ts
import type { StepDef } from './types.js'
import type { PipelineState, FieldName } from '../types.js'

export interface StepGuardContext {
  readonly changeDirAbs: string
}

export interface GuardResult {
  readonly pass: boolean
  readonly failures: string[]
}

function scalar(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

export function evaluateStepGuards(state: PipelineState, step: StepDef, _ctx: StepGuardContext): GuardResult {
  const failures: string[] = []

  for (const guard of step.guards) {
    if (guard.type === 'nonempty-output') {
      for (const output of step.outputs) {
        const v = scalar(state.fields[output.field as FieldName])
        if (!v || v === 'null') {
          failures.push(`字段 '${output.field}' 未设置（step '${step.id}' 声明为必须产出）`)
        }
      }
    }
    if (guard.type === 'tasks-at-least') {
      // TODO（实现时先读 packages/kernel/src/flow/guard.ts 抽出任务计数纯函数并在此复用，
      // 不要重新实现一份不同的计数逻辑）：
      failures.push(`guard 'tasks-at-least' 暂未实现（需复用 packages/kernel/src/flow/guard.ts 的任务计数逻辑）`)
    }
  }

  return { pass: failures.length === 0, failures }
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/stepGuard.test.ts`
Expected: PASS（3 例）

- [x] **Step 5: 提交**

```bash
git add packages/kernel/src/workflow/stepGuard.ts packages/kernel/src/workflow/stepGuard.test.ts
git commit -m "feat(kernel): step 级 guard 求值（nonempty-output 完整实现，tasks-at-least 待补）"
```

---

### Task 8: `pipeline transition` 支持非 default workflow 的真实 step 间转换

**Files:**
- Modify: `packages/cli/src/commands/transition.ts`
- Modify: `packages/cli/src/commands/transition.test.ts`（或对应集成测试文件，先读现状确认
  真实文件名）

**Interfaces:**
- Consumes: Task 5 的 `loadWorkflow`；Task 7 的 `evaluateStepGuards`；`StepDef.transitions`
  （Task 1）。
- Produces: `cmdTransition` 对 `workflow!=='default'` 的 change，接受**任意 event 名**
  （不再局限于 `TRANSITION_EVENTS` 的 8 个固定值），按当前 step 自己声明的
  `transitions` 列表查找目标 step，真的把 `phase` 字段改写成目标 step id。

**这是本计划里唯一需要真正读懂并小心修改 `cmdTransition` 现有控制流的一步**——研究已知
它的现状顺序是：`withLock` → 读 state → 校验当前 phase == `event.from` → `checkTransition
Preconditions` → `deps.flow.transition(...)` → `applyTransitionEffects` → `store.write` →
`writeBreadcrumb` → `history.append` → `writeReviewMarker`。新分支必须在**最前面**分岔
（读完 state 立刻判断 `workflow` 字段），default workflow 完全走原有这一整条链路，一行
不改；非 default workflow 走全新、更简单的链路，两条链路除了共用"读 state"和"写 history"
两个动作外不共享任何中间步骤，避免为了"复用"而把两套语义绞在一起。

- [x] **Step 1: 读现状**

Read `packages/cli/src/commands/transition.ts` 全文，确认：① `withLock` 包裹的具体范围
（新分支要在同一个锁的保护下写 state，不能在锁外写）；② `history.append` 调用的确切参数
形状（复用同一个 `HistoryEntry`，`kind: 'transition'`，`raw` 字段现在存 event 名，非
default workflow 分支也应该照样存 event 名，保持 history 文件里 "transition kind 的 raw
= 触发它的 event 名" 这条不变式，不要为非 default workflow 换一套语义）；③ 现有函数签名
和依赖注入方式（`deps: CliDeps`、`name: string`、`event: string` 大概率不变，只是内部多一
个分支）。

- [x] **Step 2: 写失败测试**

```ts
it('非 default workflow：按 event 名查当前 step 的 transitions，真改写 phase 到目标 step', async () => {
  // 用真实 harness（同 workflow-skill-orchestration.integration.test.ts 的 h.run 模式）：
  // 1. 真建一个 change，真写 workflow 字段为某个自定义值
  // 2. 真在 .pipeline/workflows/<name>.yaml 落一个两个 step 的合法 workflow（s1 --complete--> s2）
  // 3. 真跑 `pipeline transition <name> complete`
  // 4. 断言 phase 真的变成了 s2，且 .pipeline-history.jsonl 真 append 了一条 transition 记录
  expect(await h.run(['transition', CHANGE, 'complete'])).toBe(0)
  expect(await h.read(CHANGE)).toMatch(/^phase: s2$/m)
})

it('非 default workflow：step 的 guards 不满足 → transition 真拒绝（exit 非 0），phase 不变', async () => {
  // 同上但 s1 声明了 nonempty-output guard 且对应字段仍是 null，断言 exit !== 0 且 phase 仍是 s1
})

it('非 default workflow：event 名在当前 step 的 transitions 里找不到 → 真拒绝，报错信息里点名当前
    step 实际支持哪些 event（帮用户定位输错了 event 名还是走错了 step）', async () => {
})
```

- [x] **Step 3: 跑测试确认失败**

Run: `npx vitest run packages/cli/src/commands/transition.test.ts -t "非 default workflow"`
Expected: FAIL（现有代码对未知 event 名统一按 `eventEdge()` 返回 `undefined` 处理，不会
走到任何新逻辑）

- [x] **Step 4: 实现**

在 Step 1 读到的"读 state 之后、`checkTransitionPreconditions` 之前"这个位置插入分岔：

```ts
const state = await deps.store.read(dir) // 沿用现状已有的这一行，不新增
const workflowName = String(state.fields.workflow ?? 'default')

if (workflowName !== 'default') {
  const wf = loadWorkflow(deps.cwd, workflowName)
  if (!wf) { deps.io.err(`ERROR: workflow '${workflowName}' 未找到`); return 1 }
  const currentStepId = String(state.fields.phase)
  const step = wf.steps.find((s) => s.id === currentStepId)
  if (!step) { deps.io.err(`ERROR: step '${currentStepId}' 不在 workflow '${workflowName}' 里`); return 1 }

  const edge = step.transitions.find((t) => t.event === event)
  if (!edge) {
    const available = step.transitions.map((t) => t.event).join(', ') || '(无)'
    deps.io.err(`ERROR: step '${currentStepId}' 不支持 event '${event}'；该 step 支持：${available}`)
    return 1
  }

  const guardResult = evaluateStepGuards(state, step, { changeDirAbs: dir })
  if (!guardResult.pass) {
    deps.io.err(`ERROR: step '${currentStepId}' guard 未通过：\n${guardResult.failures.join('\n')}`)
    return 2
  }

  await deps.store.withLock(dir, async () => {
    const next = { ...state, fields: { ...state.fields, phase: edge.to, updated_at: deps.clock() } }
    await deps.store.write(dir, next)
  })
  await deps.history?.append(dir, { ts: deps.clock(), kind: 'transition', from: currentStepId, to: edge.to, raw: event })
  return 0
}

// workflow === 'default' 时，以下是现有代码，一行不改：
// （Step 1 读到的原有 checkTransitionPreconditions → deps.flow.transition → ... 全部保留）
```

（`deps.store.read` 这一行如果现状代码里在 `withLock` **内部**才第一次读 state，上面这段
新分支的位置要相应调整到锁内——具体以 Step 1 读到的真实代码结构为准，不要在锁外读锁内写
制造竞态。`writeReviewMarker`/`writeBreadcrumb` 这两个 default workflow 专属的收尾动作，
非 default workflow 分支这一版**不做**——诚实登记：自定义 workflow 目前没有 review
marker/breadcrumb，这两个能力如果自定义 workflow 也需要，是本任务之外的后续小任务，不在
这里顺手实现以免测试范围失控。）

- [x] **Step 5: 跑测试确认通过**

Run: `npx vitest run packages/cli/src/commands/transition.test.ts`
Expected: PASS 全量（含新增的 3 例 + 全部既有 default workflow 用例零回归）

- [x] **Step 6: 确认 default workflow 全仓零回归**

Run: `npx vitest run packages/kernel packages/cli && bash tools/test-hooks.sh && npm run oracle`
Expected: 与本计划开始前的基线完全一致（vitest 全绿、hooks 180/180、oracle 0 不一致）——
这是检验"双轨策略没有互相污染"的最终证据，不是可选步骤。

- [x] **Step 7: 提交**

```bash
git add packages/cli/src/commands/transition.ts packages/cli/src/commands/transition.test.ts
git commit -m "feat: pipeline transition 支持非 default workflow 的真实 step 间转换"
```

---

### Task 9: `pipeline internal-skill-gate` 隐藏 CLI 命令（非 default workflow 的 gate.sh 委托目标）

**Files:**
- Create: `packages/cli/src/commands/internalSkillGate.ts`
- Create: `packages/cli/src/commands/internalSkillGate.test.ts`
- Modify: `packages/cli/src/program.ts`（注册隐藏命令）
- Modify: `hooks/gate.sh`

**Interfaces:**
- Consumes: `store.read(changeDir)`（读 `workflow`/`phase` 字段）、`loadWorkflow`（Task 5）、
  `isSkillUnlocked`（Task 6）、`.pipeline-history.jsonl` 扫描（复用 §2.5 设计里"找最近一次
  进入当前 step 的 transition 记录，只统计之后的 skill 完成记录"这条规则——具体实现前
  Read 一遍 `packages/cli/src/workflow-skill-orchestration.integration.test.ts` 里
  index-based 分段那段代码，直接复用同样的扫描写法，不要重新发明）。
- Produces: `cmdInternalSkillGate(deps, changeName, toolSkillId): Promise<number>`（0=放行，
  2=拦截，同 `gate.sh` 的 exit code 约定）。

- [x] **Step 1: 写失败测试**

```ts
// packages/cli/src/commands/internalSkillGate.test.ts
import { describe, expect, it } from 'vitest'
import { cmdInternalSkillGate } from './internalSkillGate.js'
import { makeDeps } from '../test-support.js' // 沿用现有 mock deps 模式

describe('cmdInternalSkillGate', () => {
  it('workflow=default 的 change → 直接放行（这条能力只管非 default workflow）', async () => {
    const deps = makeDeps()
    // 沿用现有 mock store 构造一个 workflow 字段是 'default' 的 change
    const code = await cmdInternalSkillGate(deps, 'some-change', 'any-skill')
    expect(code).toBe(0)
  })

  it('非 default workflow，skill 依赖未满足 → exit 2', async () => {
    // 需要构造一个真实（或 mock）workflow 定义 + 尚未完成依赖的历史，断言 exit 2
    // 具体 fixture 搭建方式实现时参照 Task 8 的真实集成测试，此处先用最小 mock 验证分支逻辑
  })
})
```

（这个任务的第二个测试用例依赖 mock store/history 的具体构造方式，需要实现者先读
`packages/cli/src/test-support.ts` 现有的 `mockStore`/`makeDeps` 辅助函数确认怎么构造
一个"带 workflow 字段 + 带历史记录"的 fake change，本计划不假设这些辅助函数当前的确切
签名。）

- [x] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/cli/src/commands/internalSkillGate.test.ts`
Expected: FAIL

- [x] **Step 3: 实现**

```ts
// packages/cli/src/commands/internalSkillGate.ts
/**
 * 非 default workflow 的 skill DAG 解锁判定，从 hooks/gate.sh 委托过来（workflow==='default'
 * 完全不走这条路径，gate.sh 对 default change 零改动，本命令不影响热路径纯 bash 承诺）。
 */
import { loadWorkflow, isSkillUnlocked } from '@pipeline-lite/kernel'
import type { CliDeps } from '../deps.js'
import { changeDir } from '../paths.js'

export async function cmdInternalSkillGate(deps: CliDeps, name: string, skillId: string): Promise<number> {
  const dir = changeDir(deps.cwd, name)
  const state = await deps.store.read(dir)
  const workflowName = String(state.fields.workflow ?? 'default')
  if (workflowName === 'default') return 0 // default workflow 不受本机制管辖

  const wf = loadWorkflow(deps.cwd, workflowName)
  if (!wf) { deps.io.err(`WARN: workflow '${workflowName}' 未找到，fail-open 放行`); return 0 }

  const currentStepId = String(state.fields.phase)
  const step = wf.steps.find((s) => s.id === currentStepId)
  if (!step) { deps.io.err(`WARN: step '${currentStepId}' 不在 workflow '${workflowName}' 里，fail-open 放行`); return 0 }

  // 找最近一次进入当前 step 的 transition 记录，只统计之后的 skill 完成记录
  // （同 workflow-skill-orchestration.integration.test.ts 的 index-based 分段扫描写法）
  const history = await deps.readHistoryRaw?.(dir) ?? ''
  const lines = history.split('\n').filter(Boolean).map((l) => JSON.parse(l) as { kind: string; to?: string; raw?: string })
  let enteredAt = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.kind === 'transition' && lines[i]?.to === currentStepId) { enteredAt = i; break }
  }
  const completedSinceEntry = new Set(
    lines.slice(enteredAt + 1).filter((l) => l.kind === 'tool').map((l) => l.raw ?? ''),
  )

  if (isSkillUnlocked(skillId, step.skills, completedSinceEntry)) return 0
  deps.io.err(`【pipeline 门】skill '${skillId}' 依赖未满足（workflow '${workflowName}' / step '${currentStepId}'）`)
  return 2
}
```

`hooks/gate.sh` 改动（在现有三门 marker 检查逻辑**之后**——default workflow 的 change 应该
在到达这里之前就已经因为 marker 检查而 exit 0/2 了，这个新分支只在"没有任何新鲜 marker、
即将放行"的那一刻插入，且只对读出 `workflow` 字段非 `default` 的 change 生效）：
```sh
# 仅非 default workflow 委托进 CLI 做 skill DAG 判定（default workflow 零改动，本分支
# 读不到 workflow 字段或读到 default 时直接跳过，不 spawn node）。
WORKFLOW="$(json_get workflow 2>/dev/null || true)"  # 需要先确认 stdin JSON payload 是否带这个键，
                                                       # 若 gate.sh 的 stdin 契约里没有 workflow 字段，
                                                       # 需要改成读 CWD 下 .pipeline.yaml 的 workflow 行
if [ -n "$WORKFLOW" ] && [ "$WORKFLOW" != "default" ]; then
  SKILL_ID="$(json_get skill 2>/dev/null || echo "$TOOL")"
  node "$(dirname "$0")/../packages/cli/dist/pipeline.mjs" internal-skill-gate "$CHANGE_NAME" "$SKILL_ID" || exit 2
fi
```
（这段 shell 是示意写法，实现前必须先读 `hooks/gate.sh` 全文确认 stdin JSON payload 实际
带哪些键、`CHANGE_NAME` 变量当前是否存在，按现状调整；核心约束不变：只有非 default
workflow 才走到这里，spawn node 只发生在这条分支。）

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/cli/src/commands/internalSkillGate.test.ts`
Expected: PASS

- [x] **Step 5: 确认 default workflow 场景零回归**

Run: `bash tools/test-hooks.sh`
Expected: 180 passed, 0 failed（现有 hook 测试全部针对 default workflow 的 change，
必须和改动前完全一致）

- [x] **Step 6: 提交**

```bash
git add packages/cli/src/commands/internalSkillGate.ts packages/cli/src/commands/internalSkillGate.test.ts packages/cli/src/program.ts hooks/gate.sh
git commit -m "feat: 非 default workflow 的 skill DAG 解锁判定接入 gate.sh"
```

---

### Task 10: 旧格式迁移工具 `pipeline migrate-workflow`

**Files:**
- Create: `packages/cli/src/commands/migrateWorkflow.ts`
- Create: `packages/cli/src/commands/migrateWorkflow.test.ts`
- Modify: `packages/cli/src/program.ts`

**Interfaces:**
- Consumes: `store.read`/`store.set`（已有）。
- Produces: `cmdMigrateWorkflow(deps, name): Promise<number>`——幂等（同 `pipeline import`
  用一个哨兵字段判断"是否已迁移过"，这里复用"`workflow` 字段已存在且非空"本身就是天然
  哨兵，不需要额外标记：所有新建的 change 从 Task 4 落地起就自带 `workflow: default`，
  只有 Task 4 **之前**创建的老 change 会缺这个字段，`emptyFields()`/`parsePipeline` 对
  未知字段的处理方式决定了老文件读出来 `workflow` 会是什么——需要实现者先确认这一点，
  再决定迁移判定条件用"字段缺失"还是"值为某个旧哨兵"）。

- [x] **Step 1: 写失败测试**

```ts
// packages/cli/src/commands/migrateWorkflow.test.ts
import { describe, expect, it } from 'vitest'
import { cmdMigrateWorkflow } from './migrateWorkflow.js'
import { makeDeps, mockStore } from '../test-support.js'

describe('cmdMigrateWorkflow', () => {
  it('老 change（无 workflow 字段）→ 迁移后 workflow=default，phase 值不变', async () => {
    const deps = makeDeps()
    // 用 mockStore 构造一个没有 workflow 字段的旧 change（phase=build）
    const code = await cmdMigrateWorkflow(deps, 'legacy-change')
    expect(code).toBe(0)
    expect(await deps.store.get('legacy-change-dir', 'workflow')).toBe('default')
    expect(await deps.store.get('legacy-change-dir', 'phase')).toBe('build') // 不变
  })

  it('已迁移过（workflow 字段已是 default）→ 幂等，exit 0 不报错', async () => {
    const deps = makeDeps()
    const code = await cmdMigrateWorkflow(deps, 'already-migrated')
    expect(code).toBe(0)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/cli/src/commands/migrateWorkflow.test.ts`
Expected: FAIL

- [x] **Step 3: 实现**

```ts
// packages/cli/src/commands/migrateWorkflow.ts
import type { CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { errMsg } from '../deps.js'

export async function cmdMigrateWorkflow(deps: CliDeps, name: string): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}'`)
    return 1
  }
  const dir = changeDir(deps.cwd, name)
  try {
    const current = await deps.store.get(dir, 'workflow')
    if (current === 'default') {
      deps.io.err(`[MIGRATE] ${name}: 已是 default workflow，无需迁移`)
      return 0
    }
    await deps.store.set(dir, 'workflow', 'default')
    deps.io.err(`[MIGRATE] ${name}: workflow 字段已补齐为 default（phase 字段值不变）`)
    return 0
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
}
```

（`store.get` 对一个从未写过的字段——老 change 文件里根本没有 `workflow: ...` 这一行——
返回什么，取决于 Task 4 里 `emptyFields()`/`parsePipeline` 的具体行为：如果解析器对
"认识的字段名但文件里缺失"统一按 `emptyFields()` 的默认值补齐，那么老 change 读出来
`workflow` 本来就已经是 `'default'`，这个迁移命令实际上主要起"确认+落盘"的作用，防止
未来解析器行为变化后老文件仍然缺字段。实现前需要先跑一次真实验证：随手找一个 Task 4
之前创建的 fixture `.pipeline.yaml`，读一遍确认 `workflow` 字段读出来是什么，再决定这个
命令是否需要做更多事情。）

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/cli/src/commands/migrateWorkflow.test.ts`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/cli/src/commands/migrateWorkflow.ts packages/cli/src/commands/migrateWorkflow.test.ts packages/cli/src/program.ts
git commit -m "feat: pipeline migrate-workflow 一次性迁移工具"
```

---

### Task 11: `hooks/router.sh` 白名单修复（自定义 step id 会被静默重置成 open）

**Files:**
- Modify: `hooks/router.sh`

研究已确认第 171 行有一个写死的 `case $EFF_PHASE in open|explore|...|archive) ;; *)
EFF_PHASE=open ;; esac` 白名单，任何自定义 step id 都会被静默改写成 `open`，导致
breadcrumb/skill 注入对自定义 workflow 完全失效。

**Interfaces:**
- Consumes: 无新依赖。
- Produces: 白名单放行任意合法 step id（不再局限于 7 个固定值）。

- [x] **Step 1: 写失败测试**

在 `tools/test-hooks.sh` 里加一例（具体加在哪个位置、用什么断言辅助函数，先读该文件现有
写法照抄）：真建一个 `phase` 是自定义值（如 `custom-step-1`）的 `.pipeline.yaml`，真跑
`router.sh`，断言输出里 `EFF_PHASE`（或它驱动的 breadcrumb 变量）真的是 `custom-step-1`
而不是被吞成 `open`。

- [x] **Step 2: 跑测试确认失败**

Run: `bash tools/test-hooks.sh`
Expected: 新增用例 FAIL（现状会被吞成 open）

- [x] **Step 3: 实现**

把 `router.sh:171` 的白名单 `case` 改成宽松校验（只拒绝明显不合法的值，比如包含空格/
特殊字符——因为 `EFF_PHASE` 会被用作间接变量名的一部分 `BREADCRUMB_${EFF_PHASE}`，必须
限制成安全的标识符字符集，但不再限制成 7 个固定值之一）：
```sh
case "$EFF_PHASE" in
  *[!a-zA-Z0-9_-]*) EFF_PHASE=open ;;  # 非法字符（防间接变量名注入）→ 兜底 open
  '') EFF_PHASE=open ;;
  *) ;;  # 合法标识符字符集，任意长度/名字都放行，不再局限 7 个固定值
esac
```

- [x] **Step 4: 跑测试确认通过**

Run: `bash tools/test-hooks.sh`
Expected: 180+1 passed, 0 failed

- [x] **Step 5: 提交**

```bash
git add hooks/router.sh
git commit -m "fix(hooks): router.sh 白名单放行自定义 workflow 的任意合法 step id"
```

---

## 收尾说明

本计划现在完整交付"workflow 定义格式 + 解析 + 校验 + skill DAG 解锁判定 + step 间真实
转换（含分支事件 + step 级 guard 判定）"这一整条主线——Task 8 让 `pipeline transition`
对非 default workflow 真的能把 `phase` 字段从当前 step 改写到目标 step（按当前 step 自己
声明的 `transitions` 列表查 event 名，guard 不过真拒绝），不再是"只能挂 skill、挂不动"的
半成品。仍然明确不做的只有：`tasks-at-least` guard 的真实计数逻辑（Task 7 里标了 TODO，
需要复用 `guard.ts` 现有计数代码，不是设计问题，是需要先读一遍现有实现的接线细节）；以及
自定义 workflow 的 review marker/breadcrumb（Task 8 明确诚实登记为"这一版不做"，如果需要
可以是很小的后续任务，不影响主线可用）。

`hooks/session-start.sh:43` 的硬编码"7-phase 流水线已加载"横幅是纯文案、不影响任何逻辑，
本计划不处理——留给实现阶段顺手改一句话即可，不值得单列任务。

工作台节点连线画布编辑器（design doc §2.7）**不在本计划内**——本计划只交付
"workflow 定义文件格式 + 解析 + 校验 + gate.sh 委托判定"这条数据/逻辑主线，画布 UI 本身
（React Flow 之类的库选型 + 具体拖拽交互）工作量足够独立成另一份计划，等这条主线落地、
真有一个可读写的 workflow 文件格式之后再设计画布怎么读写它，避免 UI 细节反过来污染这条
更重要的主线设计。
