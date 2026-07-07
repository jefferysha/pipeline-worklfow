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

- [ ] **Step 1: 写失败测试（类型层面的编译期测试，用一个真构造的对象校验类型形状）**

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
        },
      ],
    }
    expect(wf.steps[0]?.id).toBe('explore')
    expect(wf.steps[0]?.skills[1]?.depends_on).toEqual(['superpowers:brainstorming'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/kernel/src/workflow/types.test.ts`
Expected: FAIL — `Cannot find module './types.js'`

- [ ] **Step 3: 实现**

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

export interface StepDef {
  readonly id: string
  readonly label: string
  readonly gate: GateKind
  readonly skills: readonly SkillRef[]
  readonly inputs: readonly FieldRef[]
  readonly outputs: readonly FieldRef[]
  readonly guards: readonly GuardConfig[]
}

export interface WorkflowDef {
  readonly name: string
  readonly steps: readonly StepDef[]
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/types.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

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

- [ ] **Step 1: 写失败测试**

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
`

describe('parseWorkflow', () => {
  it('解析出 2 个 step，第二个 step 的第二个 skill 带 depends_on', () => {
    const wf = parseWorkflow(SAMPLE)
    expect(wf.name).toBe('default')
    expect(wf.steps).toHaveLength(2)
    expect(wf.steps[1]?.id).toBe('explore')
    expect(wf.steps[1]?.gate).toBe('review')
    expect(wf.steps[1]?.skills[1]).toEqual({ id: 'opsx:explore', depends_on: ['superpowers:brainstorming'] })
    expect(wf.steps[1]?.outputs[0]).toEqual({ field: 'design_doc', type: 'file_path' })
  })

  it('格式错误（steps 不是数组）→ 真抛错，不静默返回空', () => {
    expect(() => parseWorkflow('name: x\nsteps: not-a-list\n')).toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/parse.test.ts`
Expected: FAIL — `Cannot find module './parse.js'`

- [ ] **Step 3: 实现**

```ts
// packages/kernel/src/workflow/parse.ts
/**
 * workflow 定义文件窄解析器——同 packages/kernel/src/flow/manifest.ts 的策略：手写扫描，
 * 只支持本文件格式实际用到的 YAML 子集（flat key/value + 固定形状的 block 序列 +
 * `[a, b]` 单行 flow-list），禁引入 yaml 包（kernel 零第三方依赖硬规则）。格式错误
 * fail-loud（throw），不吞错静默返回残缺结构。
 */
import type { FieldRef, FieldType, GateKind, GuardConfig, SkillRef, StepDef, WorkflowDef } from './types.js'

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
    break
  }

  return { id: idMatch[1]!, label, gate, skills, inputs, outputs, guards }
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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/parse.test.ts`
Expected: PASS（2 例）

- [ ] **Step 5: 提交**

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

- [ ] **Step 1: 写失败测试**

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
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [],
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
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [],
        skills: [{ id: 'a', depends_on: ['does-not-exist'] }],
      }],
    }))
    expect(result.some((e) => e.includes('does-not-exist'))).toBe(true)
  })

  it('inputs 引用的字段不是任何更早 step 的 outputs → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [], guards: [] },
      ],
    }))
    expect(result.some((e) => e.includes('design_doc'))).toBe(true)
  })

  it('合法 workflow → 空数组', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [], guards: [] },
      ],
    }))
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/validate.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现**

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

  for (const step of wf.steps) {
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
  }

  return errors
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/validate.test.ts`
Expected: PASS（4 例）

- [ ] **Step 5: 提交**

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

- [ ] **Step 1: 写失败测试**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/types.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`types.ts` 的 `FIELD_ORDER` 数组末尾（`'archived',` 之后）加一行 `'workflow',`。
`state/parse.ts` 的 `emptyFields()` 函数体里（具体写法先 Read 该文件确认现有实现——研究
已知它是逐字段填充默认值的函数）给 `workflow` 字段填 `'default'`（其它字段现状是空字符串
或 `'null'` 哨兵，`workflow` 是例外——它必须有一个真实默认值而不是空，因为下游任何读
`workflow` 字段的代码都要能直接判断"是不是 default"，不应该还要处理"空字符串等价于
default"这种隐式约定）。

- [ ] **Step 4: 跑测试确认通过 + 确认现有全部 kernel 测试无回归**

Run: `npx vitest run packages/kernel/src/types.test.ts`
Expected: PASS

Run: `npx vitest run packages/kernel`
Expected: 全部现存用例仍然 PASS（新增字段不该改变任何现有断言的结果——如果有 fixture
测试因为字段顺序变化而失败，检查是不是不小心把 `workflow` 插到了列表中间而不是末尾）。

- [ ] **Step 5: 提交**

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

- [ ] **Step 1: 写 `templates/workflows/default.yaml`**

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
  - id: explore
    label: 调研
    gate: review
    skills: []
    inputs: []
    outputs:
      - field: design_doc
        type: file_path
    guards: []
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
  - id: ship
    label: 交付
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
  - id: archive
    label: 归档
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
```

- [ ] **Step 2: 写失败测试**

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

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/loadWorkflow.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现**

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

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/loadWorkflow.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

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

- [ ] **Step 1: 写失败测试**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/skillDag.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/skillDag.test.ts`
Expected: PASS（4 例）

- [ ] **Step 5: 提交**

```bash
git add packages/kernel/src/workflow/skillDag.ts packages/kernel/src/workflow/skillDag.test.ts
git commit -m "feat(kernel): skill DAG 解锁判定纯函数"
```

---

### Task 7: `pipeline internal-skill-gate` 隐藏 CLI 命令（非 default workflow 的 gate.sh 委托目标）

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

- [ ] **Step 1: 写失败测试**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/cli/src/commands/internalSkillGate.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/cli/src/commands/internalSkillGate.test.ts`
Expected: PASS

- [ ] **Step 5: 确认 default workflow 场景零回归**

Run: `bash tools/test-hooks.sh`
Expected: 180 passed, 0 failed（现有 hook 测试全部针对 default workflow 的 change，
必须和改动前完全一致）

- [ ] **Step 6: 提交**

```bash
git add packages/cli/src/commands/internalSkillGate.ts packages/cli/src/commands/internalSkillGate.test.ts packages/cli/src/program.ts hooks/gate.sh
git commit -m "feat: 非 default workflow 的 skill DAG 解锁判定接入 gate.sh"
```

---

### Task 8: 旧格式迁移工具 `pipeline migrate-workflow`

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

- [ ] **Step 1: 写失败测试**

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

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/cli/src/commands/migrateWorkflow.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

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

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/cli/src/commands/migrateWorkflow.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/commands/migrateWorkflow.ts packages/cli/src/commands/migrateWorkflow.test.ts packages/cli/src/program.ts
git commit -m "feat: pipeline migrate-workflow 一次性迁移工具"
```

---

### Task 9: `hooks/router.sh` 白名单修复（自定义 step id 会被静默重置成 open）

**Files:**
- Modify: `hooks/router.sh`

研究已确认第 171 行有一个写死的 `case $EFF_PHASE in open|explore|...|archive) ;; *)
EFF_PHASE=open ;; esac` 白名单，任何自定义 step id 都会被静默改写成 `open`，导致
breadcrumb/skill 注入对自定义 workflow 完全失效。

**Interfaces:**
- Consumes: 无新依赖。
- Produces: 白名单放行任意合法 step id（不再局限于 7 个固定值）。

- [ ] **Step 1: 写失败测试**

在 `tools/test-hooks.sh` 里加一例（具体加在哪个位置、用什么断言辅助函数，先读该文件现有
写法照抄）：真建一个 `phase` 是自定义值（如 `custom-step-1`）的 `.pipeline.yaml`，真跑
`router.sh`，断言输出里 `EFF_PHASE`（或它驱动的 breadcrumb 变量）真的是 `custom-step-1`
而不是被吞成 `open`。

- [ ] **Step 2: 跑测试确认失败**

Run: `bash tools/test-hooks.sh`
Expected: 新增用例 FAIL（现状会被吞成 open）

- [ ] **Step 3: 实现**

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

- [ ] **Step 4: 跑测试确认通过**

Run: `bash tools/test-hooks.sh`
Expected: 180+1 passed, 0 failed

- [ ] **Step 5: 提交**

```bash
git add hooks/router.sh
git commit -m "fix(hooks): router.sh 白名单放行自定义 workflow 的任意合法 step id"
```

---

## 收尾说明

**范围边界（诚实登记，不是遗漏）**：本计划交付的是"workflow 定义格式 + 解析 + 校验 +
skill DAG 解锁判定"这条数据/逻辑地基，**不包含**自定义 workflow 下 `pipeline transition`
命令本身怎么在 step 之间转换、以及 step 级 `guards`（`tasks-at-least`/`nonempty-output`）
怎么在退出一个 step 时真正生效判定。原因：现有 `cmdTransition`（`packages/cli/src/
commands/transition.ts`）的事件模型是 `eventEdge(event)` 查 `TRANSITION_EVENTS`（固定
`from`/`to`）+ `manifest.transitions` 邻接表，两者都是 `Record<Phase, ...>` 形状——要让
非 default workflow 也能真正转换 step，需要给 `cmdTransition` 设计一套新的"给 step id
而不是给固定事件名"的调用方式，这本身是一份不小的后续计划，值得等这条地基先跑通、
真有人开始用自定义 workflow 写 skill 编排之后再回头设计，而不是现在凭空猜测接口形状。
**这意味着本计划落地后，自定义 workflow 能做到"定义 step + 定义每个 step 的 skill
DAG + skill 调用被正确拦截/放行"，但还不能真正"转换"到下一个 step**——下一份计划要补
这一块。

`hooks/session-start.sh:43` 的硬编码"7-phase 流水线已加载"横幅是纯文案、不影响任何逻辑，
本计划不处理——留给实现阶段顺手改一句话即可，不值得单列任务。

工作台节点连线画布编辑器（design doc §2.7）**不在本计划内**——本计划只交付
"workflow 定义文件格式 + 解析 + 校验 + gate.sh 委托判定"这条数据/逻辑主线，画布 UI 本身
（React Flow 之类的库选型 + 具体拖拽交互）工作量足够独立成另一份计划，等这条主线落地、
真有一个可读写的 workflow 文件格式之后再设计画布怎么读写它，避免 UI 细节反过来污染这条
更重要的主线设计。
