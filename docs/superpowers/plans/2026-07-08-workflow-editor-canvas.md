# Workflow 编辑器画布（GOAL.md E8）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 dashboard-app 加一个"工作台"下拉里的第三项——workflow 编辑器：两层拖线画布
（顶层 step 拓扑 + 钥入某 step 看它的 skill DAG），真读写 `.pipeline/workflows/<name>.yaml`。

**Architecture:** kernel 新增 `serializeWorkflow`（`parseWorkflow` 的反向操作）；server 新增
4 个端点（list/read/upsert/delete，复用现有鉴权+信任锚模式，含新增的 DELETE 方法支持）；
dashboard-app 新增 `@xyflow/react` 画布组件，顶层/钥入层共享同一套画布状态管理，只是切换
`nodes`/`edges` 的数据源。

**Tech Stack:** `@xyflow/react`（node-link 画布，最新 12.x，React 17+）；其余复用既有 TS/
Vite/Vitest/Node http 技术栈，无新的 kernel/server 运行时依赖。

## Global Constraints

- kernel 零第三方运行时依赖；cli 仅允许 `commander`（本计划不碰 cli，不受影响）。
- dashboard-app **不**受"零第三方依赖"约束（该硬规则只管 kernel/cli），可以引入
  `@xyflow/react`。
- TypeScript strict、ESM、NodeNext；node ≥22。
- TDD：先写红测试再实现；vitest；测试与源码同 package。
- 时间戳/id 生成如需要，走注入的 clock，不直接散落 `new Date()`/`Math.random()`。
- 每个 server 写端点：Host 守卫 → token 鉴权 → （POST 专属）`Content-Type: application/
  json` 校验 → 路由自身的输入校验 → 业务逻辑。
- `default` workflow **不可**通过本编辑器创建/编辑/删除（GET 单读放行，POST/DELETE 显式拒绝
  `name==='default'`）——运行时不读这个文件，编辑了也没有任何效果。
- 画布只在保存时校验（`validateWorkflow`），编辑过程中允许暂时不合法的中间状态。
- 不引入 `@dagrejs/dagre` 等外部布局库；不持久化节点坐标（YAML schema 不新增展示字段）。
- 参考设计文档：`docs/superpowers/specs/2026-07-08-workflow-editor-canvas-design.md`。

---

### Task 1: kernel `serializeWorkflow`（parse 的反向操作）

**Files:**
- Create: `packages/kernel/src/workflow/serialize.ts`
- Create: `packages/kernel/src/workflow/serialize.test.ts`
- Modify: `packages/kernel/src/index.ts`

**Interfaces:**
- Consumes：`packages/kernel/src/workflow/types.ts` 现有的 `WorkflowDef`/`StepDef`/
  `SkillRef`/`FieldRef`/`GuardConfig`/`StepTransition` 类型（只读，不改）。
- Produces：`export function serializeWorkflow(wf: WorkflowDef): string`——后续 Task 3
  （server 写端点）直接调用。

`parseWorkflow`（`packages/kernel/src/workflow/parse.ts`，已存在，不改）的字面格式约定
（往返正确性判据）：
- 第 1 行 `name: <name>`，第 2 行 `steps:`。
- 每个 step：`  - id: <id>`（2 空格缩进），随后 `label:`/`gate:`/`skills:`/`inputs:`/
  `outputs:`/`guards:`/`transitions:` 六个字段，4 空格缩进（`baseIndent = 2+2 = 4`）。
- `label:` 字段：`parseStep` 用正则 `/^\s*label:\s*(.+)$/` 匹配（要求冒号后至少 1 个非空
  字符），若 `label === ''` **必须整行跳过不写**（否则 parser 认不出一个空值的 `label:`
  行，读回来的 `label` 会保持默认值 `''`——跳过整行才能让读回值真的是 `''`，殊途同归但
  必须显式处理，不能天真地写 `label: ` 这种空值行）。
- `gate:` 始终写：`review`/`confirm`/`null` 三选一（`null` 时字面写 `gate: null`）。
- `skills:`/`inputs:`/`outputs:`/`guards:`/`transitions:` 五个数组字段：空数组写单行
  `xxx: []`；非空写 `xxx:` 换行 + 块序列。块序列每项：
  - `skills` 每项：`      - id: <id>`（6 空格缩进），若有 `depends_on` 再加一行
    `        depends_on: [<a>, <b>]`（8 空格缩进，逗号+空格分隔，对齐
    `parseInlineList` 的读入格式）。
  - `inputs`/`outputs` 每项：`      - field: <field>` + `        type: <string|
    file_path|boolean>`。
  - `guards` 每项：`type: 'tasks-at-least'` → `      - type: tasks-at-least` +
    `        n: <n>`；`type: 'nonempty-output'` → 仅 `      - type: nonempty-output`
    一行。
  - `transitions` 每项：`      - event: <event>` + `        to: <to>`。

- [ ] **Step 1: 写失败测试（往返等价 + 真文件写入）**

```ts
// packages/kernel/src/workflow/serialize.test.ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkflow } from './parse.js'
import { serializeWorkflow } from './serialize.js'
import type { WorkflowDef } from './types.js'

const MINIMAL: WorkflowDef = {
  name: 'onboarding',
  steps: [
    {
      id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'complete', to: 'done' }],
    },
    { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

const RICH: WorkflowDef = {
  name: 'rich',
  steps: [
    {
      id: 's1', label: '第一步', gate: 'review',
      skills: [
        { id: 'a' },
        { id: 'b' },
        { id: 'c', depends_on: ['a', 'b'] },
      ],
      inputs: [],
      outputs: [{ field: 'design_doc', type: 'file_path' }],
      guards: [{ type: 'tasks-at-least', n: 3 }, { type: 'nonempty-output' }],
      transitions: [
        { event: 'pass', to: 's2' },
        { event: 'fail', to: 's1' },
      ],
    },
    {
      id: 's2', label: '', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }],
      outputs: [], guards: [], transitions: [],
    },
  ],
}

describe('serializeWorkflow —— parse 的反向操作，往返等价是唯一正确性判据', () => {
  it('MINIMAL：serialize→parse 深度等于原始 WorkflowDef', () => {
    const round = parseWorkflow(serializeWorkflow(MINIMAL))
    expect(round).toEqual(MINIMAL)
  })

  it('RICH（多 skill+depends_on+多 guard+多 transition+非空 label/gate/inputs/outputs）：往返等价', () => {
    const round = parseWorkflow(serializeWorkflow(RICH))
    expect(round).toEqual(RICH)
  })

  it('真文件写入 + 真 loadWorkflow 风格读回（真 fs，非纯内存往返）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serialize-wf-'))
    const p = join(dir, 'rich.yaml')
    await writeFile(p, serializeWorkflow(RICH), 'utf8')
    const content = await readFile(p, 'utf8')
    expect(parseWorkflow(content)).toEqual(RICH)
  })

  it('真实 templates/workflows/default.yaml 解析后再 serialize 再 parse：三重往返仍等价（覆盖真实生产 fixture 形状，不只是手写测试夹具）', async () => {
    const { dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const repoRoot = dirname(dirname(dirname(dirname(__dirname))))
    const defaultYamlPath = join(repoRoot, 'templates', 'workflows', 'default.yaml')
    const original = parseWorkflow(await readFile(defaultYamlPath, 'utf8'))
    const roundTripped = parseWorkflow(serializeWorkflow(original))
    expect(roundTripped).toEqual(original)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/kernel/src/workflow/serialize.test.ts`
Expected: FAIL（`Cannot find module './serialize.js'`）

- [ ] **Step 3: 实现 `serializeWorkflow`**

```ts
// packages/kernel/src/workflow/serialize.ts
/**
 * workflow 定义文件序列化——`parseWorkflow`（parse.ts）的反向操作。往返等价
 * （`parseWorkflow(serializeWorkflow(wf))` 深度等于 `wf`）是唯一正确性判据，
 * 不是字面字符串匹配；字段/缩进写法逐条对齐 parse.ts 的读入期望，改动前先读一遍
 * parse.ts 各 parse*Block 函数确认没有漂移。
 */
import type { FieldRef, GuardConfig, SkillRef, StepDef, StepTransition, WorkflowDef } from './types.js'

function serializeSkill(s: SkillRef): string[] {
  const lines = [`      - id: ${s.id}`]
  if (s.depends_on && s.depends_on.length > 0) {
    lines.push(`        depends_on: [${s.depends_on.join(', ')}]`)
  }
  return lines
}

function serializeFieldRef(r: FieldRef): string[] {
  return [`      - field: ${r.field}`, `        type: ${r.type}`]
}

function serializeGuard(g: GuardConfig): string[] {
  if (g.type === 'tasks-at-least') {
    return [`      - type: tasks-at-least`, `        n: ${g.n}`]
  }
  return [`      - type: nonempty-output`]
}

function serializeTransition(t: StepTransition): string[] {
  return [`      - event: ${t.event}`, `        to: ${t.to}`]
}

function serializeBlockField<T>(name: string, items: readonly T[], each: (item: T) => string[]): string[] {
  if (items.length === 0) return [`    ${name}: []`]
  return [`    ${name}:`, ...items.flatMap(each)]
}

function serializeStep(step: StepDef): string[] {
  const lines = [`  - id: ${step.id}`]
  if (step.label !== '') lines.push(`    label: ${step.label}`)
  lines.push(`    gate: ${step.gate ?? 'null'}`)
  lines.push(...serializeBlockField('skills', step.skills, serializeSkill))
  lines.push(...serializeBlockField('inputs', step.inputs, serializeFieldRef))
  lines.push(...serializeBlockField('outputs', step.outputs, serializeFieldRef))
  lines.push(...serializeBlockField('guards', step.guards, serializeGuard))
  lines.push(...serializeBlockField('transitions', step.transitions, serializeTransition))
  return lines
}

export function serializeWorkflow(wf: WorkflowDef): string {
  const lines = [`name: ${wf.name}`, 'steps:', ...wf.steps.flatMap(serializeStep)]
  return lines.join('\n') + '\n'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/kernel/src/workflow/serialize.test.ts`
Expected: 4 例全 PASS

- [ ] **Step 5: barrel 导出 + 确认全 kernel 无回归**

`packages/kernel/src/index.ts` 现状（`export { loadWorkflow } from './workflow/
loadWorkflow.js'` 那三行具名导出旁边）追加：

```ts
export { serializeWorkflow } from './workflow/serialize.js'
export type { WorkflowDef } from './workflow/types.js'
```

（`export type { WorkflowDef }` 是窄具名类型导出，不是 `export * from './workflow/
types.js'`——后者会连带导出 `GateKind` 与既有 barrel 撞名，前面这行注释已经解释过为什么
barrel 不整体 re-export 这个模块；只加 `WorkflowDef` 这一个类型名不触发那个collision，
因为没有同名冲突。）

Run: `npx vitest run packages/kernel`
Expected: 全部现存用例仍 PASS（新增导出不改变任何现有行为）

- [ ] **Step 6: 提交**

```bash
git add packages/kernel/src/workflow/serialize.ts packages/kernel/src/workflow/serialize.test.ts packages/kernel/src/index.ts
git commit -m "feat(kernel): serializeWorkflow —— parseWorkflow 的反向操作（GOAL E8）"
```

---

### Task 2: server GET 端点（list + read）

**Files:**
- Create: `packages/server/src/workflows.ts`
- Create: `packages/server/src/workflows.test.ts`
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `serializeWorkflow`/`WorkflowDef`（本任务只用到读侧，`loadWorkflow`
  已存在于 kernel）；`packages/server/src/snapshot.ts` 的 `dedupeRoots`（已存在）。
- Produces：
  - `listWorkflowNames(root: string): string[]`——扫 `<root>/.pipeline/workflows/*.yaml`，
    排除 `default.yaml`，返回不含扩展名的文件名数组（后续 Task 5 的列表页消费）。
  - `readWorkflowForApi(root: string, name: string): WorkflowDef`——真读 + `loadWorkflow`
    解析（找不到/非法抛错，路由层 catch 转 404/500）（后续 Task 6 消费）。
  - `WORKFLOWS_DIR = '.pipeline/workflows'`（供 Task 3 写端点复用同一常量，避免两处各写
    一遍相对路径字符串）。

- [ ] **Step 1: 写失败测试（`workflows.ts` 纯逻辑，真 fs）**

```ts
// packages/server/src/workflows.test.ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listWorkflowNames, readWorkflowForApi } from './workflows.js'

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'wf-server-'))
}

const VALID_WF = `name: onboarding
steps:
  - id: intake
    label: intake
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: complete
        to: done
  - id: done
    label: done
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`

describe('listWorkflowNames', () => {
  it('无 .pipeline/workflows 目录 → 空数组（不抛错）', async () => {
    const root = await tempRoot()
    expect(listWorkflowNames(root)).toEqual([])
  })

  it('真扫 *.yaml 文件名（去扩展名），排除 default.yaml', async () => {
    const root = await tempRoot()
    const dir = join(root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'onboarding.yaml'), VALID_WF, 'utf8')
    await writeFile(join(dir, 'release.yaml'), VALID_WF.replace('onboarding', 'release'), 'utf8')
    await writeFile(join(dir, 'default.yaml'), VALID_WF.replace('onboarding', 'default'), 'utf8')
    expect(listWorkflowNames(root).sort()).toEqual(['onboarding', 'release'])
  })
})

describe('readWorkflowForApi', () => {
  it('真读 + 解析，返回 WorkflowDef', async () => {
    const root = await tempRoot()
    const dir = join(root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'onboarding.yaml'), VALID_WF, 'utf8')
    const wf = readWorkflowForApi(root, 'onboarding')
    expect(wf.name).toBe('onboarding')
    expect(wf.steps.map((s) => s.id)).toEqual(['intake', 'done'])
  })

  it('文件不存在 → 抛错（路由层负责转 404）', async () => {
    const root = await tempRoot()
    expect(() => readWorkflowForApi(root, 'ghost')).toThrow()
  })

  it('非法 workflow 文件（transitions.to 指向不存在的 step）→ 抛错（loadWorkflow 已接 validateWorkflow，路由层负责转 500）', async () => {
    const root = await tempRoot()
    const dir = join(root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'broken.yaml'),
      `name: broken\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions:\n      - event: go\n        to: does-not-exist\n`,
      'utf8',
    )
    expect(() => readWorkflowForApi(root, 'broken')).toThrow(/does-not-exist/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/server/src/workflows.test.ts`
Expected: FAIL（`Cannot find module './workflows.js'`）

- [ ] **Step 3: 实现 `workflows.ts`（list + read 部分）**

```ts
// packages/server/src/workflows.ts
/**
 * workflow 编辑器数据端（GOAL E8）——真读/写 `.pipeline/workflows/*.yaml`。
 * `default` 不在此列（运行时不读这个文件，见 CONTRACT/design doc 决策 2）。
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadWorkflow } from '@pipeline-lite/kernel'
import type { WorkflowDef } from '@pipeline-lite/kernel'

export const WORKFLOWS_DIR = '.pipeline/workflows'

function workflowsDir(root: string): string {
  return join(root, '.pipeline', 'workflows')
}

/** 扫 `<root>/.pipeline/workflows/*.yaml`，去扩展名，排除 default。目录不存在 → 空数组。 */
export function listWorkflowNames(root: string): string[] {
  const dir = workflowsDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.slice(0, -'.yaml'.length))
    .filter((name) => name !== 'default')
}

/** 真读 + 解析（含 loadWorkflow 已接的 validateWorkflow 校验）；找不到/非法 → 抛错，路由层负责映射状态码。 */
export function readWorkflowForApi(root: string, name: string): WorkflowDef {
  const wf = loadWorkflow(root, name)
  if (!wf) throw new Error(`workflow '${name}' 未找到`)
  return wf
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/workflows.test.ts`
Expected: 5 例全 PASS

- [ ] **Step 5: 写 server.ts 路由集成的失败测试**

在 `packages/server/src/server.test.ts` 追加（放在文件末尾 `describe` 块之后，参考既有
`POST /api/loops/level` 那个 describe 块的写法）：

```ts
describe('GET /api/workflows —— 列出自定义 workflow（GOAL E8）', () => {
  it('root 未在注册表 → 404', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows?root=${encodeURIComponent('/tmp/not-registered')}`)
    expect(r.status).toBe(404)
  })

  it('真扫 .pipeline/workflows/*.yaml，排除 default，200 返回 names', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    const wf = 'name: onboarding\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions: []\n'
    await writeFile(join(dir, 'onboarding.yaml'), wf, 'utf8')
    await writeFile(join(dir, 'default.yaml'), wf.replace('onboarding', 'default'), 'utf8')
    const r = await reqGet(h.port, `/api/workflows?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ names: string[] }>().names).toEqual(['onboarding'])
  })

  it('无 .pipeline/workflows 目录 → 200 + 空数组（不是错误）', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ names: string[] }>().names).toEqual([])
  })
})

describe('GET /api/workflows/:name —— 读单个 workflow（GOAL E8）', () => {
  it('真读 + 解析，200 返回 WorkflowDef', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'onboarding.yaml'),
      'name: onboarding\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions: []\n',
      'utf8',
    )
    const r = await reqGet(h.port, `/api/workflows/onboarding?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    const body = r.json<{ name: string; steps: Array<{ id: string }> }>()
    expect(body.name).toBe('onboarding')
    expect(body.steps.map((s) => s.id)).toEqual(['s1'])
  })

  it('workflow 不存在 → 404', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows/ghost?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(404)
  })

  it('root 未注册 → 404（信任锚）', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows/onboarding?root=${encodeURIComponent('/tmp/not-registered')}`)
    expect(r.status).toBe(404)
  })

  it('非法 workflow 文件 → 500 + 错误详情（loadWorkflow 的 validateWorkflow 拒绝原因透传）', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'broken.yaml'),
      'name: broken\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions:\n      - event: go\n        to: does-not-exist\n',
      'utf8',
    )
    const r = await reqGet(h.port, `/api/workflows/broken?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(500)
    expect(r.json<{ error: string }>().error).toContain('does-not-exist')
  })
})
```

- [ ] **Step 6: 跑测试确认失败**

Run: `npx vitest run packages/server/src/server.test.ts -t "GET /api/workflows"`
Expected: FAIL（新端点尚未接线，命中 `未知端点` 404，但 `names`/`steps` 字段读取会
undefined 或状态码不对——具体失败信息不重要，关键是失败而非误通过）

- [ ] **Step 7: server.ts 接入两个 GET 路由**

`packages/server/src/server.ts` 顶部 import 区（`import { readMandatorySkills, ... }
from './config.js'` 那一行附近）追加：

```ts
import { listWorkflowNames, readWorkflowForApi } from './workflows.js'
```

`handleGet` 函数内（`/api/skills/registry` 那个 if 块之后、`return sendJson(res, 404,
{ ok: false, error: '未知端点' })` 之前）插入：

```ts
    // ── workflow 编辑器（GOAL E8）：GET /api/workflows —— 列出自定义 workflow（排除 default）──
    if (path === '/api/workflows') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        return sendJson(res, 200, { names: listWorkflowNames(root) })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    // ── workflow 编辑器（GOAL E8）：GET /api/workflows/:name —— 读单个 workflow ──
    const mWfGet = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfGet) {
      const wfName = decodeURIComponent(mWfGet[1]!)
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        return sendJson(res, 200, readWorkflowForApi(root, wfName))
      } catch (e) {
        const msg = errMsg(e)
        return sendJson(res, msg.includes('未找到') ? 404 : 500, { ok: false, error: msg })
      }
    }
```

（`mWfGet` 正则必须放在 `/api/workflows` 字面量判断**之后**——同 afk 端点已有的"字面量
路由先于正则路由"注释所述模式，正则本身要求非空 name 段，结构上不会 shadow 字面量路由，
但保持声明顺序一致降低未来读者的认知负担。）

- [ ] **Step 8: 跑测试确认通过**

Run: `npx vitest run packages/server/src/server.test.ts -t "workflows"`
Expected: 全部新增用例 PASS

Run: `npx vitest run packages/server`
Expected: 全部现存用例仍 PASS（无回归）

- [ ] **Step 9: 提交**

```bash
git add packages/server/src/workflows.ts packages/server/src/workflows.test.ts packages/server/src/server.ts packages/server/src/server.test.ts
git commit -m "feat(server): GET /api/workflows[/:name] —— 列出/读取自定义 workflow（GOAL E8）"
```

---

### Task 3: server POST/DELETE 端点（写入 + 删除）+ `handleDelete` 方法支持

**Files:**
- Modify: `packages/server/src/workflows.ts`
- Modify: `packages/server/src/workflows.test.ts`
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`
- Modify: `packages/server/src/test-support.ts`

**Interfaces:**
- Consumes：Task 1 的 `serializeWorkflow`；kernel 的 `validateWorkflow`（barrel 目前未
  导出——本任务需要在 `packages/kernel/src/index.ts` 补一行 `export { validateWorkflow }
  from './workflow/validate.js'`，之前只有 `loadWorkflow` 内部消费它，现在 server 也要
  直接调用做校验-拒绝-返回-errors 数组这个更细的控制流，`loadWorkflow` 内部校验失败是
  直接 throw，不满足"返回 errors 数组给前端展示"这个需求）。
- Produces：
  - `writeWorkflowForApi(root, name, wf): {ok:true} | {ok:false, errors:string[]}`
  - `deleteWorkflowForApi(root, name): boolean`（true=真删了，false=文件本不存在）
  - `reqDelete(port, path, opts?)`（`test-support.ts` 新增，同 `reqPost` 的 HTTP 客户端
    测试工具，供本任务及后续所有需要测 DELETE 端点的测试复用）

**本任务额外需要**：`server.ts` 目前的顶层请求分派只认 GET/POST，其余方法一律 405
（`method === 'GET' ? handleGet(...) : method === 'POST' ? handlePost(...) :
Promise.resolve(sendJson(res, 405, ...))`）——DELETE 是本仓第一个用到的新 HTTP 方法，
需要新增 `handleDelete` 函数并接入分派链。

- [ ] **Step 1: kernel barrel 补 `validateWorkflow` 导出**

`packages/kernel/src/index.ts`：

```ts
export { validateWorkflow } from './workflow/validate.js'
```

（加在 Task 1 已加的 `export { serializeWorkflow } ...` 那一行旁边。）

Run: `npx vitest run packages/kernel`
Expected: 全部现存用例仍 PASS（纯新增导出，无回归）

- [ ] **Step 2: 写失败测试（`workflows.ts` 的 write/delete 部分，真 fs）**

在 `packages/server/src/workflows.test.ts` 追加：

```ts
import { writeWorkflowForApi, deleteWorkflowForApi } from './workflows.js'
import { readFile } from 'node:fs/promises'
import type { WorkflowDef } from '@pipeline-lite/kernel'

const VALID_DEF: WorkflowDef = {
  name: 'onboarding',
  steps: [
    { id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
    { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

const INVALID_DEF: WorkflowDef = {
  name: 'broken',
  steps: [
    { id: 's1', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'go', to: 'does-not-exist' }] },
  ],
}

describe('writeWorkflowForApi', () => {
  it('合法 WorkflowDef → 真原子写入 .pipeline/workflows/<name>.yaml，{ok:true}', async () => {
    const root = await tempRoot()
    const result = writeWorkflowForApi(root, 'onboarding', VALID_DEF)
    expect(result).toEqual({ ok: true })
    const content = await readFile(join(root, '.pipeline', 'workflows', 'onboarding.yaml'), 'utf8')
    expect(content).toContain('name: onboarding')
    expect(content).toContain('- id: intake')
  })

  it('非法 WorkflowDef（validateWorkflow 拒绝）→ {ok:false, errors} + 不落盘', async () => {
    const root = await tempRoot()
    const result = writeWorkflowForApi(root, 'broken', INVALID_DEF)
    expect(result.ok).toBe(false)
    expect((result as { ok: false; errors: string[] }).errors.some((e) => e.includes('does-not-exist'))).toBe(true)
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(root, '.pipeline', 'workflows', 'broken.yaml'))).toBe(false)
  })

  it('已存在的 workflow → 覆盖（新建和编辑共用同一函数）', async () => {
    const root = await tempRoot()
    writeWorkflowForApi(root, 'onboarding', VALID_DEF)
    const updated: WorkflowDef = { ...VALID_DEF, name: 'onboarding', steps: [...VALID_DEF.steps, { id: 'extra', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }] }
    // extra 挂在末尾、done 仍是最后一个真正的终态——为了合法（非终态必须有 transitions），
    // 这里改成 done 指向 extra，extra 作真正终态
    const updatedValid: WorkflowDef = {
      name: 'onboarding',
      steps: [
        { id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
        { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'next', to: 'extra' }] },
        { id: 'extra', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }
    const result = writeWorkflowForApi(root, 'onboarding', updatedValid)
    expect(result).toEqual({ ok: true })
    const content = await readFile(join(root, '.pipeline', 'workflows', 'onboarding.yaml'), 'utf8')
    expect(content).toContain('- id: extra')
  })
})

describe('deleteWorkflowForApi', () => {
  it('真删存在的文件 → true', async () => {
    const root = await tempRoot()
    writeWorkflowForApi(root, 'onboarding', VALID_DEF)
    expect(deleteWorkflowForApi(root, 'onboarding')).toBe(true)
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(root, '.pipeline', 'workflows', 'onboarding.yaml'))).toBe(false)
  })

  it('文件不存在 → false（不抛错）', async () => {
    const root = await tempRoot()
    expect(deleteWorkflowForApi(root, 'ghost')).toBe(false)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run packages/server/src/workflows.test.ts`
Expected: FAIL（`writeWorkflowForApi`/`deleteWorkflowForApi` 未定义）

- [ ] **Step 4: 实现 `writeWorkflowForApi` / `deleteWorkflowForApi`**

`packages/server/src/workflows.ts` 追加（复用 §2.1 已有的 `workflowsDir` 私有函数）：

```ts
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { serializeWorkflow, validateWorkflow } from '@pipeline-lite/kernel'

export type WriteWorkflowResult = { ok: true } | { ok: false; errors: string[] }

/** 校验通过才落盘（同目录 tmp+rename 原子写，对齐 kernel state/store.ts 的既有写法）；不存在则建、存在则覆盖。 */
export function writeWorkflowForApi(root: string, name: string, wf: WorkflowDef): WriteWorkflowResult {
  const errors = validateWorkflow(wf)
  if (errors.length > 0) return { ok: false, errors }
  const dir = workflowsDir(root)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${name}.yaml`)
  const tmp = `${file}.tmp.${process.pid}`
  writeFileSync(tmp, serializeWorkflow(wf), 'utf8')
  renameSync(tmp, file)
  return { ok: true }
}

/** 真删；文件不存在返回 false（不抛错——DELETE 端点据此映射 404）。 */
export function deleteWorkflowForApi(root: string, name: string): boolean {
  const file = join(workflowsDir(root), `${name}.yaml`)
  if (!existsSync(file)) return false
  unlinkSync(file)
  return true
}
```

（顶部 import 需要把 `existsSync, readdirSync` 的既有 import 行和这里新增的
`mkdirSync, renameSync, unlinkSync, writeFileSync` 合并成一行，`serializeWorkflow,
validateWorkflow` 从 `@pipeline-lite/kernel` 同一行导入加进已有的 `loadWorkflow` 那行。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run packages/server/src/workflows.test.ts`
Expected: 全部 PASS（含 Task 2 遗留的 5 例 + 本步新增的 5 例）

- [ ] **Step 6: `test-support.ts` 新增 `reqDelete`**

`packages/server/src/test-support.ts`，紧跟 `reqPost` 定义之后追加：

```ts
export function reqDelete(
  port: number,
  path: string,
  opts?: { host?: string; headers?: Record<string, string> },
): Promise<HttpResult> {
  const host = opts?.host ?? '127.0.0.1'
  return new Promise((resolve, reject) => {
    const r = httpRequest({ host, port, path, method: 'DELETE', headers: opts?.headers }, (res) => {
      let b = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve(toResult(res.statusCode ?? 0, res.headers, b)))
    })
    r.on('error', reject)
    r.end()
  })
}
```

- [ ] **Step 7: 写失败测试（server.ts 的 POST/DELETE 路由）**

`packages/server/src/server.test.ts` 顶部 import 追加 `reqDelete`（合并进既有的
`initChange, makeProject, ... reqGet, reqPost, testFlow` 那行 import 列表）。文件末尾
追加：

```ts
describe('POST /api/workflows/:name —— 新建/覆盖自定义 workflow（GOAL E8）', () => {
  const VALID_BODY = {
    name: 'onboarding',
    steps: [
      { id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
      { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
    ],
  }

  it('无 token → 401', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/workflows/onboarding', { ...VALID_BODY, root: h.root })
    expect(r.status).toBe(401)
  })

  it('root 未注册 → 404', async () => {
    const h = await start()
    const r = await reqPost(
      h.port, '/api/workflows/onboarding', { ...VALID_BODY, root: '/tmp/not-registered' },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(404)
  })

  it('name === default → 400（即便 body 合法）', async () => {
    const h = await start()
    const r = await reqPost(
      h.port, '/api/workflows/default', { ...VALID_BODY, name: 'default', root: h.root },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
  })

  it('合法 body → 200，真落盘', async () => {
    const { readFile } = await import('node:fs/promises')
    const h = await start()
    const r = await reqPost(
      h.port, '/api/workflows/onboarding', { ...VALID_BODY, root: h.root },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(200)
    const content = await readFile(join(h.root, '.pipeline', 'workflows', 'onboarding.yaml'), 'utf8')
    expect(content).toContain('name: onboarding')
  })

  it('非法 body（validateWorkflow 拒绝）→ 400 + errors 数组，不落盘', async () => {
    const h = await start()
    const invalidBody = {
      name: 'broken',
      steps: [{ id: 's1', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'go', to: 'does-not-exist' }] }],
      root: h.root,
    }
    const r = await reqPost(
      h.port, '/api/workflows/broken', invalidBody,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
    expect(r.json<{ errors: string[] }>().errors.some((e) => e.includes('does-not-exist'))).toBe(true)
    expect(existsSync(join(h.root, '.pipeline', 'workflows', 'broken.yaml'))).toBe(false)
  })
})

describe('DELETE /api/workflows/:name —— 删除自定义 workflow（GOAL E8）', () => {
  it('无 token → 401', async () => {
    const h = await start()
    const r = await reqDelete(h.port, `/api/workflows/onboarding?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(401)
  })

  it('name === default → 400', async () => {
    const h = await start()
    const r = await reqDelete(
      h.port, `/api/workflows/default?root=${encodeURIComponent(h.root)}`,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
  })

  it('真删存在的 workflow → 200，真从磁盘消失', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'onboarding.yaml'), 'name: onboarding\nsteps: []\n', 'utf8')
    const r = await reqDelete(
      h.port, `/api/workflows/onboarding?root=${encodeURIComponent(h.root)}`,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(200)
    expect(existsSync(join(dir, 'onboarding.yaml'))).toBe(false)
  })

  it('不存在的 workflow → 404', async () => {
    const h = await start()
    const r = await reqDelete(
      h.port, `/api/workflows/ghost?root=${encodeURIComponent(h.root)}`,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(404)
  })
})

describe('未知 HTTP 方法（非 GET/POST/DELETE）仍 405（既有兜底不因新增 DELETE 分支而失效）', () => {
  it('PUT → 405', async () => {
    const h = await start()
    const r = await new Promise<{ status: number }>((resolve, reject) => {
      const req = (require('node:http') as typeof import('node:http')).request(
        { host: '127.0.0.1', port: h.port, path: '/api/workflows/x', method: 'PUT' },
        (res) => resolve({ status: res.statusCode ?? 0 }),
      )
      req.on('error', reject)
      req.end()
    })
    expect(r.status).toBe(405)
  })
})
```

- [ ] **Step 8: 跑测试确认失败**

Run: `npx vitest run packages/server/src/server.test.ts -t "workflows"`
Expected: FAIL（DELETE 分派返回 405；POST 路由未接线，命中 `未知写回端点` 404）

- [ ] **Step 9: server.ts 接入 POST/DELETE 路由 + 新增 `handleDelete`**

`server.ts` 顶部 import 追加（合并进 Task 2 已加的那行）：

```ts
import { deleteWorkflowForApi, listWorkflowNames, readWorkflowForApi, writeWorkflowForApi } from './workflows.js'
```

`handlePost` 函数内，`/api/loops/level` 那个 if 块之后（`/api/afk/:name/cancel` 之前）
插入：

```ts
    // ── workflow 编辑器（GOAL E8）：POST /api/workflows/:name —— 新建/覆盖 ──
    const mWfPost = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfPost) {
      const wfName = decodeURIComponent(mWfPost[1]!)
      if (wfName === 'default') {
        return sendJson(res, 400, { ok: false, error: 'default workflow 不可通过编辑器创建/覆盖（运行时不读这个文件）' })
      }
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        const result = writeWorkflowForApi(root, wfName, body as unknown as WorkflowDef)
        return sendJson(res, result.ok ? 200 : 400, result)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
```

`handlePost` 结尾的 `/api/change/<name>/transition` 分支之后（函数最外层）新增一个
姊妹函数：

```ts
  async function handleDelete(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    // (1)(2) 同 handlePost 的 Host 守卫 + token 鉴权，DELETE 无请求体不需要 Content-Type 校验。
    if (!isLocalHost(req.headers.host, boundPort)) {
      return sendJson(res, 403, { ok: false, error: 'Host header 不合法（疑似 DNS 重绑定攻击）' })
    }
    const provided = tokenFromHeaders(req.headers)
    if (!provided || !tokensMatch(provided, token)) {
      return sendJson(res, 401, { ok: false, error: '缺少或无效 token（写端点需鉴权）' })
    }

    // ── workflow 编辑器（GOAL E8）：DELETE /api/workflows/:name ──
    const mWfDelete = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfDelete) {
      const wfName = decodeURIComponent(mWfDelete[1]!)
      if (wfName === 'default') {
        return sendJson(res, 400, { ok: false, error: 'default workflow 不可通过编辑器删除' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        const deleted = deleteWorkflowForApi(root, wfName)
        return sendJson(res, deleted ? 200 : 404, deleted ? { ok: true } : { ok: false, error: `workflow '${wfName}' 不存在` })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    return sendJson(res, 404, { ok: false, error: '未知端点' })
  }
```

`createServer` 里的方法分派（原来只有 GET/POST 二选一 + 兜底 405）改成三选一：

```ts
    const handler = method === 'GET'
      ? handleGet(req, res, path)
      : method === 'POST'
        ? handlePost(req, res, path)
        : method === 'DELETE'
          ? handleDelete(req, res, path)
          : Promise.resolve(sendJson(res, 405, { ok: false, error: 'method not allowed' }))
```

`server.ts` 顶部还需要 `import type { WorkflowDef } from '@pipeline-lite/kernel'`（合并
进既有 `import type { FlowEngine, GraduationFs, StateStore } from '@pipeline-lite/
kernel'` 那行）。

- [ ] **Step 10: 跑测试确认通过**

Run: `npx vitest run packages/server`
Expected: 全部 PASS（含 Task 2+3 新增用例，无回归）

- [ ] **Step 11: 提交**

```bash
git add packages/kernel/src/index.ts packages/server/src/workflows.ts packages/server/src/workflows.test.ts packages/server/src/server.ts packages/server/src/server.test.ts packages/server/src/test-support.ts
git commit -m "feat(server): POST/DELETE /api/workflows/:name + handleDelete 方法支持（GOAL E8）"
```

---

### Task 4: dashboard-app 依赖 + 确定性分层布局纯函数

**Files:**
- Modify: `packages/dashboard-app/package.json`
- Modify: `packages/dashboard-app/src/test-setup.ts`
- Create: `packages/dashboard-app/src/workflow/layout.ts`
- Create: `packages/dashboard-app/src/workflow/layout.test.ts`

**Interfaces:**
- Consumes：无（纯函数，无跨任务依赖）。
- Produces：`layoutNodes<T extends {id: string}>(items: readonly T[], edges: readonly
  {from: string; to: string}[]): Map<string, {x: number; y: number}>`——按拓扑深度分列、
  同列内按输入顺序分行。后续 Task 6/7 的画布组件消费，给每个 step/skill 节点一个初始
  `position`。

- [ ] **Step 1: 加依赖**

`packages/dashboard-app/package.json` 的 `dependencies` 追加：

```json
    "@xyflow/react": "^12.10.2",
```

Run: `cd packages/dashboard-app && npm install && cd ../..`
Expected: 装包成功，`node_modules/@xyflow/react` 存在

- [ ] **Step 2: test-setup.ts 补 `ResizeObserver` stub**

`@xyflow/react` 内部用 `ResizeObserver` 测量画布容器尺寸，jsdom 未实现这个 API——不补
这个 stub，任何 render `<ReactFlow>` 的测试都会报 `ResizeObserver is not defined`。

`packages/dashboard-app/src/test-setup.ts`，`vi.stubGlobal('EventSource', ...)` 那行
之后追加：

```ts
// ── ResizeObserver stub（jsdom 未实现，@xyflow/react 内部用它测量画布容器尺寸）──
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)
```

- [ ] **Step 3: 写失败测试（`layout.ts`）**

```ts
// packages/dashboard-app/src/workflow/layout.test.ts
import { describe, expect, it } from 'vitest'
import { layoutNodes } from './layout'

describe('layoutNodes —— 确定性分层布局（无外部布局库，纯函数真单测锁定输出）', () => {
  it('无边的孤立节点：全部落在第 0 列，按输入顺序分行', () => {
    const positions = layoutNodes([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [])
    expect(positions.get('a')).toEqual({ x: 0, y: 0 })
    expect(positions.get('b')?.x).toBe(0)
    expect(positions.get('c')?.x).toBe(0)
    // 三行纵向不重叠
    const ys = ['a', 'b', 'c'].map((id) => positions.get(id)!.y)
    expect(new Set(ys).size).toBe(3)
  })

  it('线性链 a→b→c：按拓扑深度分列，深度依次递增', () => {
    const positions = layoutNodes(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    )
    expect(positions.get('a')!.x).toBeLessThan(positions.get('b')!.x)
    expect(positions.get('b')!.x).toBeLessThan(positions.get('c')!.x)
  })

  it('分支 a→b, a→c：b/c 同列（深度相同），不同行', () => {
    const positions = layoutNodes(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }],
    )
    expect(positions.get('b')!.x).toBe(positions.get('c')!.x)
    expect(positions.get('b')!.y).not.toBe(positions.get('c')!.y)
  })

  it('含环（真实自定义 workflow 允许 verify-fail 这类回边）：不死循环，环内节点仍各自拿到确定坐标', () => {
    const positions = layoutNodes(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
    )
    expect(positions.size).toBe(2)
    expect(positions.get('a')).toBeDefined()
    expect(positions.get('b')).toBeDefined()
  })

  it('确定性：同样的输入两次调用产出完全一样的坐标（不依赖 Math.random/Date.now）', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const edges = [{ from: 'a', to: 'b' }]
    expect(layoutNodes(items, edges)).toEqual(layoutNodes(items, edges))
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/layout.test.ts`
Expected: FAIL（`layout.ts` 不存在）

- [ ] **Step 5: 实现 `layoutNodes`**

```ts
// packages/dashboard-app/src/workflow/layout.ts
/**
 * 确定性分层布局——不引入 @dagrejs/dagre 等外部布局库（图规模小：几个 step、每 step
 * 几个 skill，简单分层布局够用，还能整个纯函数真单测锁定输出，不依赖第三方算法版本行为）。
 * 按 BFS 拓扑深度分列（深度 = 到任一"入度为 0 的根"的最短距离，环用"访问过就不回头"打断，
 * 不会死循环），同列内按输入数组的相对顺序分行。不持久化坐标——见设计文档 §2.3。
 */
const COL_WIDTH = 220
const ROW_HEIGHT = 100

export interface Point { x: number; y: number }

export function layoutNodes<T extends { id: string }>(
  items: readonly T[],
  edges: readonly { from: string; to: string }[],
): Map<string, Point> {
  const ids = items.map((i) => i.id)
  const idSet = new Set(ids)
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]))
  const hasIncoming = new Set<string>()
  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue
    outgoing.get(e.from)!.push(e.to)
    hasIncoming.add(e.to)
  }

  const depth = new Map<string, number>()
  const roots = ids.filter((id) => !hasIncoming.has(id))
  const queue: Array<{ id: string; d: number }> = roots.map((id) => ({ id, d: 0 }))
  const visited = new Set<string>()
  while (queue.length > 0) {
    const { id, d } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    depth.set(id, d)
    for (const next of outgoing.get(id) ?? []) {
      if (!visited.has(next)) queue.push({ id: next, d: d + 1 })
    }
  }
  // 环内但从未被任何根触达的节点（如整张图全是环、没有入度为 0 的根）：兜底落在深度 0。
  for (const id of ids) if (!depth.has(id)) depth.set(id, 0)

  const rowCounters = new Map<number, number>()
  const positions = new Map<string, Point>()
  for (const id of ids) {
    const d = depth.get(id)!
    const row = rowCounters.get(d) ?? 0
    rowCounters.set(d, row + 1)
    positions.set(id, { x: d * COL_WIDTH, y: row * ROW_HEIGHT })
  }
  return positions
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/layout.test.ts`
Expected: 5 例全 PASS

- [ ] **Step 7: 跑全量前端测试确认无回归（ResizeObserver stub 是全局 setup 改动）**

Run: `npm run test:web`
Expected: 全部现存用例仍 PASS

- [ ] **Step 8: 提交**

```bash
git add packages/dashboard-app/package.json packages/dashboard-app/package-lock.json packages/dashboard-app/src/test-setup.ts packages/dashboard-app/src/workflow/layout.ts packages/dashboard-app/src/workflow/layout.test.ts
git commit -m "feat(dashboard): 加 @xyflow/react 依赖 + 确定性分层布局纯函数（GOAL E8）"
```

（若根 `package-lock.json` 而非 `packages/dashboard-app` 下有独立 lock 文件——npm
workspaces 单一根 lock 是本仓既有约定，`git status` 确认实际改动的是哪个 lock 文件，
按实际改动路径 `git add`，不要凭空假设路径。）

---

### Task 5: `WorkflowEditorView.tsx`（列表页：拉取/新建/删除）

**Files:**
- Create: `packages/dashboard-app/src/workflow/WorkflowEditorView.tsx`
- Create: `packages/dashboard-app/src/workflow/WorkflowEditorView.test.tsx`
- Modify: `packages/dashboard-app/src/i18n/translations.ts`

**Interfaces:**
- Consumes：Task 2/3 的 `GET /api/workflows`、`POST /api/workflows/:name`（新建用空
  `steps: []` 骨架）、`DELETE /api/workflows/:name`；`../api/client.js` 的 `getToken`
  （既有）。
- Produces：`WorkflowEditorView` 组件——`props: { root: string; onOpen: (name: string)
  => void }`（选中/新建成功后回调通知父组件打开哪个 workflow 的画布，画布组件本身留给
  Task 6 建；本任务先把列表页做完整、可独立测试，`onOpen` 先只断言被正确调用，父级接线
  留到 Task 9）。

- [ ] **Step 1: i18n 加 `workflow_editor` 命名空间（本任务用到的 key）**

`packages/dashboard-app/src/i18n/translations.ts`，`zh` 对象里 `afk: {...}` 那个块
之后追加：

```ts
  workflow_editor: {
    title: '自定义 workflow',
    empty: '还没有自定义 workflow',
    new_placeholder: '新 workflow 名（a-z A-Z 0-9 - _）',
    create: '新建',
    delete: '删除',
    delete_confirm: '确定删除 workflow "{name}"？如果有 change 正引用它，删除后其 transition/internal-skill-gate 会报"workflow 未找到"。',
    invalid_name: '非法名字（仅允许 a-z A-Z 0-9 - _），或与 default 冲突',
    load_error: '加载失败：{msg}',
    network_error: '网络错误',
    create_error: '新建失败：{msg}',
    delete_error: '删除失败：{msg}',
    cancel: '取消',
    confirm_delete: '确认删除',
  },
```

`en` 对象对应位置追加：

```ts
  workflow_editor: {
    title: 'Custom workflows',
    empty: 'No custom workflows yet',
    new_placeholder: 'New workflow name (a-z A-Z 0-9 - _)',
    create: 'Create',
    delete: 'Delete',
    delete_confirm: 'Delete workflow "{name}"? If any change still references it, its transition/internal-skill-gate calls will report "workflow not found" afterward.',
    invalid_name: 'Invalid name (only a-z A-Z 0-9 - _ allowed), or conflicts with default',
    load_error: 'Load failed: {msg}',
    network_error: 'Network error',
    create_error: 'Create failed: {msg}',
    delete_error: 'Delete failed: {msg}',
    cancel: 'Cancel',
    confirm_delete: 'Confirm delete',
  },
```

- [ ] **Step 2: 写失败测试**

```tsx
// packages/dashboard-app/src/workflow/WorkflowEditorView.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { WorkflowEditorView } from './WorkflowEditorView'

const ROOT = '/tmp/proj-a'

function renderView(onOpen = vi.fn()) {
  render(
    <I18nProvider>
      <WorkflowEditorView root={ROOT} onOpen={onOpen} />
    </I18nProvider>,
  )
  return onOpen
}

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify({ names: ['onboarding', 'release'] }), { status: 200 })
    }
    if (url === '/api/workflows/newone' && opts?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url === `/api/workflows/onboarding?root=${encodeURIComponent(ROOT)}` && opts?.method === 'DELETE') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('WorkflowEditorView', () => {
  it('挂载后真 fetch 列表，渲染两个 workflow 名字', async () => {
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    expect(screen.getByText('release')).toBeInTheDocument()
  })

  it('列表为空 → 空态文案', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ names: [] }), { status: 200 })) as unknown as typeof fetch
    renderView()
    await waitFor(() => expect(screen.getByText('还没有自定义 workflow')).toBeInTheDocument())
  })

  it('点一个名字 → 调用 onOpen(name)', async () => {
    const onOpen = renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.click(screen.getByText('onboarding'))
    expect(onOpen).toHaveBeenCalledWith('onboarding')
  })

  it('输入合法新名字 + 点新建 → POST 创建空骨架，成功后调用 onOpen(新名字)', async () => {
    const onOpen = renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/新 workflow 名/), { target: { value: 'newone' } })
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('newone'))
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === '/api/workflows/newone')
    const body = JSON.parse(postCall![1].body as string)
    expect(body).toEqual({ name: 'newone', steps: [], root: ROOT })
  })

  it('非法新名字（含空格）→ 不发请求，显示错误', async () => {
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/新 workflow 名/), { target: { value: 'bad name' } })
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    expect(screen.getByText(/非法名字/)).toBeInTheDocument()
  })

  it('新名字是 default → 拒绝，不发请求', async () => {
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/新 workflow 名/), { target: { value: 'default' } })
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    expect(screen.getByText(/非法名字/)).toBeInTheDocument()
  })

  it('点删除 → 二次确认弹窗 → 确认后真 DELETE，成功后从列表消失', async () => {
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0]!)
    // 确认弹窗：再点一次同一个"删除"确认按钮（弹窗内的确认按钮，测试用 confirm 文案定位）
    fireEvent.click(screen.getByRole('button', { name: /^确认/ }))
    await waitFor(() => expect(screen.queryByText('onboarding')).not.toBeInTheDocument())
    expect(screen.getByText('release')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/WorkflowEditorView.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 4: 实现 `WorkflowEditorView.tsx`**

```tsx
// packages/dashboard-app/src/workflow/WorkflowEditorView.tsx
import { useCallback, useEffect, useState } from 'react'
import { getToken } from '../api/client'
import { useT } from '../i18n'

export interface WorkflowEditorViewProps {
  root: string
  onOpen: (name: string) => void
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/

interface ErrorBody { error?: string }

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
  } catch {
    /* 无 JSON 体 */
  }
  return ''
}

export function WorkflowEditorView({ root, onOpen }: WorkflowEditorViewProps): JSX.Element {
  const { t } = useT()
  const [names, setNames] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/workflows?root=${encodeURIComponent(root)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<{ names: string[] }>
      })
      .then((body) => {
        setNames(body.names)
        setError(null)
      })
      .catch((err: unknown) => setError(t('workflow_editor.load_error', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') })))
  }, [root, t])

  useEffect(() => load(), [load])

  async function createWorkflow(): Promise<void> {
    setFormError(null)
    if (!NAME_RE.test(newName) || newName === 'default') {
      setFormError(t('workflow_editor.invalid_name'))
      return
    }
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(newName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: newName, steps: [], root }),
      })
      if (!res.ok) {
        setFormError(t('workflow_editor.create_error', { msg: (await readErrorDetail(res)) || `(${res.status})` }))
        return
      }
      onOpen(newName)
    } catch (err) {
      setFormError(t('workflow_editor.create_error', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') }))
    }
  }

  async function confirmDelete(name: string): Promise<void> {
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(name)}?root=${encodeURIComponent(root)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) {
        setError(t('workflow_editor.delete_error', { msg: (await readErrorDetail(res)) || `(${res.status})` }))
        setPendingDelete(null)
        return
      }
      setPendingDelete(null)
      load()
    } catch (err) {
      setError(t('workflow_editor.delete_error', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') }))
      setPendingDelete(null)
    }
  }

  if (error) return <p className="subtitle">{error}</p>
  if (!names) return <p className="subtitle">{t('common.loading')}</p>

  return (
    <div className="workflow-editor-list">
      <h2>{t('workflow_editor.title')}</h2>
      {names.length === 0 && <p className="subtitle">{t('workflow_editor.empty')}</p>}
      <ul>
        {names.map((name) => (
          <li key={name}>
            <button onClick={() => onOpen(name)}>{name}</button>
            <button onClick={() => setPendingDelete(name)}>{t('workflow_editor.delete')}</button>
          </li>
        ))}
      </ul>
      {pendingDelete && (
        <div role="dialog" className="workflow-delete-confirm">
          <p>{t('workflow_editor.delete_confirm', { name: pendingDelete })}</p>
          <button onClick={() => confirmDelete(pendingDelete)}>{t('workflow_editor.confirm_delete')}</button>
          <button onClick={() => setPendingDelete(null)}>{t('workflow_editor.cancel')}</button>
        </div>
      )}
      <div className="workflow-editor-new">
        <input
          placeholder={t('workflow_editor.new_placeholder')}
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setFormError(null) }}
        />
        <button onClick={createWorkflow}>{t('workflow_editor.create')}</button>
        {formError && <p className="subtitle">{formError}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/WorkflowEditorView.test.tsx`
Expected: 全部 PASS

Run: `npm run test:web`
Expected: 全部现存用例仍 PASS（i18n completeness 测试会自动校验 `workflow_editor`
命名空间 zh/en key 结构一致）

- [ ] **Step 6: 提交**

```bash
git add packages/dashboard-app/src/workflow/WorkflowEditorView.tsx packages/dashboard-app/src/workflow/WorkflowEditorView.test.tsx packages/dashboard-app/src/i18n/translations.ts
git commit -m "feat(dashboard): WorkflowEditorView —— 自定义 workflow 列表/新建/删除（GOAL E8）"
```

---

### Task 6: `WorkflowCanvas.tsx` 顶层 step 拓扑图（读/增删节点+连线/保存）

**Files:**
- Create: `packages/dashboard-app/src/workflow/WorkflowCanvas.tsx`
- Create: `packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx`
- Modify: `packages/dashboard-app/src/i18n/translations.ts`

**Interfaces:**
- Consumes：Task 2/3 的 `GET /api/workflows/:name`、`POST /api/workflows/:name`；Task 4
  的 `layoutNodes`；`@xyflow/react` 的 `ReactFlow`/`ReactFlowProvider`/`useNodesState`/
  `useEdgesState`/`addEdge`/`Background`/`Controls` 及其 `Node`/`Edge`/`Connection` 类型；
  kernel 的 `StepDef`/`WorkflowDef` 类型形状（本任务不 import 类型本身，前端走 JSON，
  按 `StepDef` 的字段形状手写一个本地接口，避免 dashboard-app 依赖 kernel 编译产物只为了
  一个类型——同 `LoopsPanel.tsx`/`AfkWorkbench.tsx` 已有的"前端自己声明匹配的 interface，
  不 import kernel 类型"惯例）。
- Produces：`WorkflowCanvas` 组件——`props: { root: string; name: string; onBack: () =>
  void }`。本任务只做**顶层**（step 拓扑），钥入 skill DAG 留给 Task 7（会修改同一个
  文件，不是新文件——两层共享同一套画布状态管理是设计文档 §1 决策 3 的直接后果）。

- [ ] **Step 1: i18n 加本任务用到的 key**

`translations.ts` 的 `zh.workflow_editor` 块（Task 5 已建）追加：

```ts
    load_error_wf: '加载 workflow 失败：{msg}',
    back: '‹ 返回列表',
    add_step: '+ step',
    add_step_prompt: 'step id（a-z A-Z 0-9 - _）',
    add_transition_prompt: 'event 名',
    save: '保存',
    save_success: '已保存',
    save_error: '保存失败：',
    duplicate_id: 'id 重复，换一个',
    duplicate_event: '同一 step 内 event 名不能重复',
    confirm: '确认',
```

`en.workflow_editor` 块对应追加：

```ts
    load_error_wf: 'Failed to load workflow: {msg}',
    back: '‹ Back to list',
    add_step: '+ step',
    add_step_prompt: 'step id (a-z A-Z 0-9 - _)',
    add_transition_prompt: 'event name',
    save: 'Save',
    save_success: 'Saved',
    save_error: 'Save failed: ',
    duplicate_id: 'Duplicate id, pick another',
    duplicate_event: 'Event name must be unique within a step',
    confirm: 'Confirm',
```

（`cancel` 这个 key Task 5 已经加过（zh/en 都有），不重复加；这里只加本任务新用到的
`confirm` 及其它 key。）

- [ ] **Step 2: 写失败测试（顶层图：渲染/增删节点/增删连线/保存）**

```tsx
// packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { WorkflowCanvas } from './WorkflowCanvas'

const ROOT = '/tmp/proj-a'
const NAME = 'onboarding'

const TWO_STEP = {
  name: NAME,
  steps: [
    { id: 'intake', label: 'Intake', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
    { id: 'done', label: 'Done', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

function renderCanvas(onBack = vi.fn()) {
  render(
    <I18nProvider>
      <WorkflowCanvas root={ROOT} name={NAME} onBack={onBack} />
    </I18nProvider>,
  )
  return onBack
}

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify(TWO_STEP), { status: 200 })
    }
    if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('WorkflowCanvas —— 顶层 step 拓扑', () => {
  it('挂载后真 fetch workflow，渲染两个 step 节点', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })

  it('点"返回列表" → 调用 onBack', async () => {
    const onBack = renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/返回列表/))
    expect(onBack).toHaveBeenCalled()
  })

  it('点"+ step"输入合法新 id → 新增一个 step 节点（初始空 skills/transitions）', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ step' }))
    fireEvent.change(screen.getByPlaceholderText(/step id/), { target: { value: 'review' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText(/review/i)).toBeInTheDocument())
  })

  it('新增 step 用重复 id → 拒绝，不新增', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ step' }))
    fireEvent.change(screen.getByPlaceholderText(/step id/), { target: { value: 'intake' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByText(/id 重复/)).toBeInTheDocument()
  })

  it('真触发 onConnect（模拟拖线）→ 弹 event 名输入 → 确认后新增一条 transition', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    // WorkflowCanvas 把 onConnect 通过 data-testid="rf-canvas" 的容器暴露供测试直接触发
    // （不模拟真实鼠标拖拽物理效果——设计文档 §4 明确"库本身的拖拽/连线行为不需要重新测试"）。
    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireEvent.click(connectTrigger, { detail: { source: 'done', target: 'intake' } })
    fireEvent.change(screen.getByPlaceholderText(/event 名/), { target: { value: 'restart' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText(/restart/)).toBeInTheDocument())
  })

  it('同一 step 内重复 event 名 → 拒绝创建连线', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireEvent.click(connectTrigger, { detail: { source: 'intake', target: 'done' } })
    fireEvent.change(screen.getByPlaceholderText(/event 名/), { target: { value: 'complete' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByText(/event 名不能重复/)).toBeInTheDocument()
  })

  it('点保存 → 真 POST 当前 WorkflowDef，成功后显示"已保存"', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument())
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    expect(postCall).toBeTruthy()
    const body = JSON.parse(postCall![1].body as string)
    expect(body.name).toBe(NAME)
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual(['intake', 'done'])
  })

  it('保存失败（校验拒绝）→ 展示 errors，不清空已编辑内容', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(TWO_STEP), { status: 200 })
      }
      if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, errors: ['s1 没有声明任何 transitions'] }), { status: 400 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByText(/没有声明任何 transitions/)).toBeInTheDocument())
    // 编辑内容仍在（intake 节点还在）
    expect(screen.getByText(/intake/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 4: 实现 `WorkflowCanvas.tsx`（顶层部分）**

```tsx
// packages/dashboard-app/src/workflow/WorkflowCanvas.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, addEdge,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { getToken } from '../api/client'
import { useT } from '../i18n'
import { layoutNodes } from './layout'

/** 前端本地声明的形状，逐字对齐 kernel WorkflowDef/StepDef 的 JSON 形状（跨 HTTP 边界，
 *  不 import kernel 类型——同 LoopsPanel.tsx/AfkWorkbench.tsx 的既有惯例）。 */
interface FieldRef { field: string; type: 'string' | 'file_path' | 'boolean' }
interface SkillRef { id: string; depends_on?: string[] }
type GuardConfig = { type: 'tasks-at-least'; n: number } | { type: 'nonempty-output' }
interface StepTransition { event: string; to: string }
interface StepDef {
  id: string; label: string; gate: 'review' | 'confirm' | null
  skills: SkillRef[]; inputs: FieldRef[]; outputs: FieldRef[]
  guards: GuardConfig[]; transitions: StepTransition[]
}
interface WorkflowDef { name: string; steps: StepDef[] }

export interface WorkflowCanvasProps {
  root: string
  name: string
  onBack: () => void
}

interface ErrorBody { error?: string; errors?: string[] }
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ErrorBody
    if (typeof body?.error === 'string') return body.error
    if (Array.isArray(body?.errors)) return body.errors.join('; ')
  } catch { /* 无 JSON 体 */ }
  return ''
}

function stepsToNodes(steps: StepDef[]): Node[] {
  const positions = layoutNodes(steps, steps.flatMap((s) => s.transitions.map((t) => ({ from: s.id, to: t.to }))))
  return steps.map((s) => ({
    id: s.id,
    position: positions.get(s.id) ?? { x: 0, y: 0 },
    data: { label: s.label ? `${s.id} (${s.label})` : s.id },
  }))
}

function stepsToEdges(steps: StepDef[]): Edge[] {
  return steps.flatMap((s) => s.transitions.map((t) => ({
    id: `${s.id}->${t.to}:${t.event}`,
    source: s.id,
    target: t.to,
    label: t.event,
  })))
}

function WorkflowCanvasInner({ root, name, onBack }: WorkflowCanvasProps): JSX.Element {
  const { t } = useT()
  const [wf, setWf] = useState<WorkflowDef | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [addStepOpen, setAddStepOpen] = useState(false)
  const [newStepId, setNewStepId] = useState('')
  const [addStepError, setAddStepError] = useState<string | null>(null)
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null)
  const [eventName, setEventName] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' })

  useEffect(() => {
    fetch(`/api/workflows/${encodeURIComponent(name)}?root=${encodeURIComponent(root)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readErrorDetail(r)) || `(${r.status})`)
        return r.json() as Promise<WorkflowDef>
      })
      .then((body) => {
        setWf(body)
        setNodes(stepsToNodes(body.steps))
        setEdges(stepsToEdges(body.steps))
      })
      .catch((err: unknown) => setLoadError(t('workflow_editor.load_error_wf', { msg: err instanceof Error ? err.message : t('workflow_editor.network_error') })))
  }, [root, name, t, setNodes, setEdges])

  const stepIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])

  function openAddStep(): void {
    setAddStepOpen(true)
    setNewStepId('')
    setAddStepError(null)
  }

  function confirmAddStep(): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(newStepId) || stepIds.has(newStepId)) {
      setAddStepError(t('workflow_editor.duplicate_id'))
      return
    }
    const blank: StepDef = { id: newStepId, label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }
    setWf((prev) => (prev ? { ...prev, steps: [...prev.steps, blank] } : prev))
    setNodes((nds) => [...nds, { id: newStepId, position: { x: 0, y: nds.length * 100 }, data: { label: newStepId } }])
    setAddStepOpen(false)
  }

  // 触发连线：xyflow 真实拖拽会调用这个 prop；测试直接 dispatch 一个带 detail 的 click 事件
  // 到 data-testid="debug-trigger-connect" 的隐藏按钮上，绕开真实鼠标物理模拟（设计文档 §4）。
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    setPendingConnection(connection)
    setEventName('')
    setConnectError(null)
  }, [])

  function confirmConnect(): void {
    if (!pendingConnection || !wf) return
    const { source, target } = pendingConnection
    const sourceStep = wf.steps.find((s) => s.id === source)
    if (sourceStep?.transitions.some((tr) => tr.event === eventName)) {
      setConnectError(t('workflow_editor.duplicate_event'))
      return
    }
    setWf((prev) => prev
      ? { ...prev, steps: prev.steps.map((s) => (s.id === source ? { ...s, transitions: [...s.transitions, { event: eventName, to: target! }] } : s)) }
      : prev)
    setEdges((eds) => addEdge({ ...pendingConnection, label: eventName, id: `${source}->${target}:${eventName}` }, eds))
    setPendingConnection(null)
  }

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const deletedIds = new Set(deleted.map((n) => n.id))
    setWf((prev) => prev
      ? {
          ...prev,
          steps: prev.steps
            .filter((s) => !deletedIds.has(s.id))
            .map((s) => ({ ...s, transitions: s.transitions.filter((tr) => !deletedIds.has(tr.to)) })),
        }
      : prev)
  }, [])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    setWf((prev) => {
      if (!prev) return prev
      const removed = new Set(deleted.map((e) => e.id))
      return {
        ...prev,
        steps: prev.steps.map((s) => ({
          ...s,
          transitions: s.transitions.filter((tr) => !removed.has(`${s.id}->${tr.to}:${tr.event}`)),
        })),
      }
    })
  }, [])

  async function save(): Promise<void> {
    if (!wf) return
    setSaveStatus({ kind: 'idle' })
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ...wf, root }),
      })
      if (!res.ok) {
        setSaveStatus({ kind: 'error', msg: (await readErrorDetail(res)) || `(${res.status})` })
        return
      }
      setSaveStatus({ kind: 'ok' })
    } catch (err) {
      setSaveStatus({ kind: 'error', msg: err instanceof Error ? err.message : t('workflow_editor.network_error') })
    }
  }

  if (loadError) return <p className="subtitle">{loadError}</p>
  if (!wf) return <p className="subtitle">{t('common.loading')}</p>

  return (
    <div className="workflow-canvas">
      <div className="workflow-canvas__toolbar">
        <button onClick={onBack}>{t('workflow_editor.back')}</button>
        <button onClick={openAddStep}>{t('workflow_editor.add_step')}</button>
        <button onClick={save}>{t('workflow_editor.save')}</button>
        {saveStatus.kind === 'ok' && <span>{t('workflow_editor.save_success')}</span>}
        {saveStatus.kind === 'error' && <span>{t('workflow_editor.save_error')}{saveStatus.msg}</span>}
      </div>
      {addStepOpen && (
        <div role="dialog">
          <input placeholder={t('workflow_editor.add_step_prompt')} value={newStepId} onChange={(e) => setNewStepId(e.target.value)} />
          <button onClick={confirmAddStep}>{t('workflow_editor.confirm')}</button>
          <button onClick={() => setAddStepOpen(false)}>{t('workflow_editor.cancel')}</button>
          {addStepError && <p>{addStepError}</p>}
        </div>
      )}
      {pendingConnection && (
        <div role="dialog">
          <input placeholder={t('workflow_editor.add_transition_prompt')} value={eventName} onChange={(e) => setEventName(e.target.value)} />
          <button onClick={confirmConnect}>{t('workflow_editor.confirm')}</button>
          <button onClick={() => setPendingConnection(null)}>{t('workflow_editor.cancel')}</button>
          {connectError && <p>{connectError}</p>}
        </div>
      )}
      <button
        data-testid="debug-trigger-connect"
        style={{ display: 'none' }}
        onClick={(e) => {
          const detail = (e.nativeEvent as CustomEvent<Connection>).detail
          if (detail) onConnect(detail)
        }}
      />
      <div style={{ height: 480 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}

export function WorkflowCanvas(props: WorkflowCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
```

> **实现时的已知坑**（写代码前务必确认，不要假设"看起来应该行"）：
> 1. `fireEvent.click(el, { detail: {...} })` 能不能让 `(e.nativeEvent as CustomEvent).
>    detail` 拿到值，取决于 testing-library 对 click 事件 init 参数的处理——`fireEvent.
>    click` 底层是 `new MouseEvent('click', eventInit)`，标准 `MouseEvent` 构造函数
>    **不支持** `detail` 传对象（`detail` 在 `MouseEvent`/`UIEvent` 里是数字点击次数，
>    不是任意对象）。这个 debug-trigger 的设计在写测试时就要验证清楚，如果 `detail`
>    传不出对象，改用 `fireEvent(el, new CustomEvent('debug-connect', { detail:
>    {source,target} }))` 并把组件里的监听器换成 `onDebugConnect`（原生
>    `addEventListener('debug-connect', ...)`，通过 `ref` 挂载，而不是 React 的
>    `onClick`）——**这是 Task 6 实现阶段第一件要跑通的事**，写完 Step 2 的测试后立刻
>    跑一次确认这个触发机制本身可行，不要等到整个组件写完才发现连测试触发的通道都不通。
> 2. `@xyflow/react` 的 `useNodesState`/`useEdgesState` 返回的 setter 是"替换整个数组"
>    还是"支持函数式更新 `(prev) => next`"，实现前跑一个最小 spike 确认（大概率支持
>    `useState` 同款函数式更新，因为其内部就是 `useState` 的薄封装，但没有验证过就不要
>    假设）。
> 3. `data-testid="debug-trigger-connect"` 这个隐藏触发按钮是**测试专用**的开发者钩子，
>    真实用户走 xyflow 原生拖拽触发同一个 `onConnect` 回调，两条路径最终都收敛到同一个
>    函数——不是给生产环境用的按钮，如果觉得这种"为了测试塞一个隐藏 DOM 节点"的做法不够
>    干净，可选替代方案是把 `onConnect`/`onNodesDelete`/`onEdgesDelete` 这几个回调作为
>    组件的可选 props 暴露出来（测试直接从 render 返回值里拿到 props 引用调用，不经过
>    DOM 事件），两种方式选一种、全组件保持一致，不要混用。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx`
Expected: 全部 PASS（若 Step 4 提示的坑 1 命中，先修正触发机制再继续，不要跳过）

Run: `npm run test:web`
Expected: 全部现存用例仍 PASS

- [ ] **Step 6: 提交**

```bash
git add packages/dashboard-app/src/workflow/WorkflowCanvas.tsx packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx packages/dashboard-app/src/workflow/WorkflowEditorView.tsx packages/dashboard-app/src/i18n/translations.ts
git commit -m "feat(dashboard): WorkflowCanvas 顶层 step 拓扑图（增删节点/连线/保存，GOAL E8）"
```

---

### Task 7: `WorkflowCanvas.tsx` 钥入 skill DAG 层（双击 step + 面包屑）

**Files:**
- Modify: `packages/dashboard-app/src/workflow/WorkflowCanvas.tsx`
- Modify: `packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx`
- Modify: `packages/dashboard-app/src/i18n/translations.ts`

**Interfaces:**
- Consumes：Task 6 已有的 `WorkflowCanvasInner` 内部 state（`wf`/`nodes`/`edges`/
  `onConnect`/`onNodesDelete`/`onEdgesDelete` 等）——本任务给它们加一层"当前渲染哪个数据
  源"的分支，不是另起一套并行状态。
- Produces：`WorkflowCanvasInner` 内部新增 `drillPath: string | null` state（非 null =
  正在看该 step 的 skill DAG）；双击 step 节点（`onNodeDoubleClick`）进入，面包屑"‹ 返回
  顶层"按钮退出。

- [ ] **Step 1: i18n 加本任务用到的 key**

`translations.ts` 的 `zh.workflow_editor` 块追加：

```ts
    breadcrumb_top: '‹ 返回顶层',
    breadcrumb_current: '当前：{stepId} 的 skill 依赖图',
    add_skill: '+ skill',
    add_skill_prompt: 'skill id',
```

`en.workflow_editor` 块对应追加：

```ts
    breadcrumb_top: '‹ Back to top',
    breadcrumb_current: 'Viewing: skill DAG of {stepId}',
    add_skill: '+ skill',
    add_skill_prompt: 'skill id',
```

- [ ] **Step 2: 写失败测试**

在 `WorkflowCanvas.test.tsx` 追加一个新的 `describe` 块（用一个含 skill 的 fixture）：

```tsx
const WITH_SKILLS = {
  name: NAME,
  steps: [
    {
      id: 'intake', label: 'Intake', gate: null,
      skills: [{ id: 'a' }, { id: 'b', depends_on: ['a'] }],
      inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'complete', to: 'done' }],
    },
    { id: 'done', label: 'Done', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

describe('WorkflowCanvas —— 钥入 skill DAG 层', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(WITH_SKILLS), { status: 200 })
      }
      if (url === `/api/workflows/${NAME}` && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
  })

  it('双击 step 节点 → 画布切换成该 step 的 skill 节点（a、b）+ depends_on 连线，面包屑显示当前 step', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByText(/当前：intake/)).toBeInTheDocument()
    // 顶层的 done 节点这时候不应该出现（数据源已切换，不是叠加渲染）
    expect(screen.queryByText(/done/i)).not.toBeInTheDocument()
  })

  it('钥入后点面包屑"返回顶层" → 切回顶层图（intake/done 重新出现）', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/返回顶层/))
    await waitFor(() => expect(screen.getByText(/done/i)).toBeInTheDocument())
    expect(screen.queryByText('a')).not.toBeInTheDocument()
  })

  it('skill 层"+ skill"新增一个 skill 节点', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ skill' }))
    fireEvent.change(screen.getByPlaceholderText(/skill id/), { target: { value: 'c' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByText('c')).toBeInTheDocument())
  })

  it('skill 层触发 onConnect（a → 新连到 c 之类）不需要 event 名弹窗（depends_on 无标签），直接连上；保存后 depends_on 正确落在 WorkflowDef', async () => {
    renderCanvas()
    await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText(/intake/i))
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
    const connectTrigger = screen.getByTestId('debug-trigger-connect')
    fireEvent.click(connectTrigger, { detail: { source: 'a', target: 'b' } })
    // skill 层不应该弹出 event 名输入框（那是顶层 transition 专属）
    expect(screen.queryByPlaceholderText(/event 名/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/返回顶层/))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
      const body = JSON.parse(postCall![1].body as string)
      const intake = body.steps.find((s: { id: string }) => s.id === 'intake')
      const bSkill = intake.skills.find((s: { id: string }) => s.id === 'b')
      expect(bSkill.depends_on).toContain('a')
    })
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx -t "钥入"`
Expected: FAIL（双击不触发任何切换，面包屑不存在）

- [ ] **Step 4: 实现钥入逻辑**

在 `WorkflowCanvasInner` 内部（Task 6 已有代码基础上）新增：

```tsx
  const [drillStepId, setDrillStepId] = useState<string | null>(null)

  const currentStep = useMemo(
    () => (drillStepId ? wf?.steps.find((s) => s.id === drillStepId) ?? null : null),
    [wf, drillStepId],
  )

  // 数据源切换：drillStepId 非 null 时渲染该 step 的 skills/depends_on，否则渲染顶层 steps/transitions。
  useEffect(() => {
    if (!wf) return
    if (drillStepId && currentStep) {
      const positions = layoutNodes(
        currentStep.skills,
        currentStep.skills.flatMap((s) => (s.depends_on ?? []).map((dep) => ({ from: dep, to: s.id }))),
      )
      setNodes(currentStep.skills.map((s) => ({ id: s.id, position: positions.get(s.id) ?? { x: 0, y: 0 }, data: { label: s.id } })))
      setEdges(currentStep.skills.flatMap((s) => (s.depends_on ?? []).map((dep) => ({ id: `${dep}->${s.id}`, source: dep, target: s.id }))))
    } else {
      setNodes(stepsToNodes(wf.steps))
      setEdges(stepsToEdges(wf.steps))
    }
  }, [wf, drillStepId, currentStep, setNodes, setEdges])

  const onNodeDoubleClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (!drillStepId) setDrillStepId(node.id)
  }, [drillStepId])
```

`confirmAddStep`/`onConnect`/`confirmConnect`/`onNodesDelete`/`onEdgesDelete` 五个既有
函数都要按 `drillStepId` 分叉（顶层操作 `wf.steps`，钥入态操作
`currentStep.skills`/`depends_on`）。以 `confirmAddStep` 为例，改成：

```tsx
  function confirmAddStep(): void {
    const existingIds = drillStepId ? new Set(currentStep?.skills.map((s) => s.id)) : stepIds
    if (!/^[a-zA-Z0-9_-]+$/.test(newStepId) || existingIds.has(newStepId)) {
      setAddStepError(t('workflow_editor.duplicate_id'))
      return
    }
    if (drillStepId && currentStep) {
      const newSkill: SkillRef = { id: newStepId }
      setWf((prev) => prev
        ? { ...prev, steps: prev.steps.map((s) => (s.id === drillStepId ? { ...s, skills: [...s.skills, newSkill] } : s)) }
        : prev)
    } else {
      const blank: StepDef = { id: newStepId, label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }
      setWf((prev) => (prev ? { ...prev, steps: [...prev.steps, blank] } : prev))
    }
    setAddStepOpen(false)
  }
```

`onConnect`/`confirmConnect` 分叉（`drillStepId` 非空时不弹 event 名输入框，直接把
`depends_on` 加上）：

```tsx
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    if (drillStepId) {
      // skill 层：depends_on 无标签，直接落地，不经过"输入 event 名"这道确认。
      setWf((prev) => prev
        ? {
            ...prev,
            steps: prev.steps.map((s) => (s.id === drillStepId
              ? {
                  ...s,
                  skills: s.skills.map((sk) => (sk.id === connection.target
                    ? { ...sk, depends_on: [...(sk.depends_on ?? []), connection.source!] }
                    : sk)),
                }
              : s)),
          }
        : prev)
      setEdges((eds) => addEdge(connection, eds))
      return
    }
    setPendingConnection(connection)
    setEventName('')
    setConnectError(null)
  }, [drillStepId, setEdges])
```

`onNodesDelete`/`onEdgesDelete` 整个替换成下面按 `drillStepId` 分叉的版本（完全替换
Task 6 写的那两个函数，不是在其基础上打补丁）：

```tsx
  const onNodesDelete = useCallback((deleted: Node[]) => {
    const deletedIds = new Set(deleted.map((n) => n.id))
    setWf((prev) => {
      if (!prev) return prev
      if (drillStepId) {
        return {
          ...prev,
          steps: prev.steps.map((s) => (s.id === drillStepId
            ? {
                ...s,
                skills: s.skills
                  .filter((sk) => !deletedIds.has(sk.id))
                  .map((sk) => ({ ...sk, depends_on: sk.depends_on?.filter((d) => !deletedIds.has(d)) })),
              }
            : s)),
        }
      }
      return {
        ...prev,
        steps: prev.steps
          .filter((s) => !deletedIds.has(s.id))
          .map((s) => ({ ...s, transitions: s.transitions.filter((tr) => !deletedIds.has(tr.to)) })),
      }
    })
  }, [drillStepId])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    setWf((prev) => {
      if (!prev) return prev
      if (drillStepId) {
        // skill 层的 edge id 形如 `${dep}->${skillId}`（Task 7 前面渲染 skill 层时定的格式）。
        const removedDeps = new Set(deleted.map((e) => e.id))
        return {
          ...prev,
          steps: prev.steps.map((s) => (s.id === drillStepId
            ? { ...s, skills: s.skills.map((sk) => ({ ...sk, depends_on: sk.depends_on?.filter((d) => !removedDeps.has(`${d}->${sk.id}`)) })) }
            : s)),
        }
      }
      const removed = new Set(deleted.map((e) => e.id))
      return {
        ...prev,
        steps: prev.steps.map((s) => ({
          ...s,
          transitions: s.transitions.filter((tr) => !removed.has(`${s.id}->${tr.to}:${tr.event}`)),
        })),
      }
    })
  }, [drillStepId])
```

（这是本任务最容易漏改、留下潜在 bug 的地方——写完后必须让 Step 2 补的"钥入后删除一个
skill 节点/一条 depends_on 连线，返回顶层再钥入回来，删除已生效"这类场景也有测试覆盖，
不能只测新增不测删除；Step 2 目前给出的测试用例只覆盖了新增，实现这一步时要把下面这条
删除场景的测试也一并写上再验证绿：）

```tsx
it('钥入后删除一个 depends_on 连线（b 不再依赖 a）→ 保存后 depends_on 数组不含 a', async () => {
  renderCanvas()
  await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
  fireEvent.doubleClick(screen.getByText(/intake/i))
  await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument())
  const edge = screen.getByText('a').closest('[data-id]') // xyflow 边/节点的真实 DOM 定位方式实现时需要核实（见下方坑 2），此处占位表达"选中 a→b 这条连线"的测试意图，不代表最终可运行的选择器写法
  fireEvent.click(edge!)
  fireEvent.keyDown(document, { key: 'Backspace' })
  fireEvent.click(screen.getByText(/返回顶层/))
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === `/api/workflows/${NAME}` && c[1]?.method === 'POST')
    const body = JSON.parse(postCall![1].body as string)
    const bSkill = body.steps.find((s: { id: string }) => s.id === 'intake').skills.find((s: { id: string }) => s.id === 'b')
    expect(bSkill.depends_on ?? []).not.toContain('a')
  })
})
```

> **已知坑 2**（本步骤唯一还没验证过的地方，实现时第一件事就是把它跑通）：xyflow 里
> "选中一条边再按 Delete 键触发 `onEdgesDelete`"这条真实交互路径，在 jsdom + fireEvent
> 环境下能不能被真实触发，取决于 xyflow 内部对键盘事件的监听方式（可能挂在特定 DOM
> 节点、可能需要该节点先有 focus）——上面这条测试里 `edge!.closest('[data-id]')` 这个
> 选择器是占位表达意图，不保证真的能选中 xyflow 渲染出的边元素。如果这条路径在真实
> jsdom 环境下跑不通，退回到 Task 6 已经证明可行的模式：给这条测试也开一个
> `data-testid="debug-trigger-delete-edge"` 隐藏触发按钮，直接调用组件暴露出来的
> `onEdgesDelete` 回调（同 Task 6 Step 4 那条已知坑提到的"把回调作为 props 暴露，测试
> 直接调用不经过 DOM 事件"这条备选方案）——两种方式选一种，全组件保持一致，不要一半
> 测试走 DOM 事件模拟一半走直接调用。

工具栏 JSX 追加面包屑 + 按 `drillStepId` 切换按钮组：

```tsx
      <div className="workflow-canvas__toolbar">
        {drillStepId ? (
          <>
            <button onClick={() => setDrillStepId(null)}>{t('workflow_editor.breadcrumb_top')}</button>
            <span>{t('workflow_editor.breadcrumb_current', { stepId: drillStepId })}</span>
            <button onClick={openAddStep}>{t('workflow_editor.add_skill')}</button>
          </>
        ) : (
          <>
            <button onClick={onBack}>{t('workflow_editor.back')}</button>
            <button onClick={openAddStep}>{t('workflow_editor.add_step')}</button>
          </>
        )}
        <button onClick={save}>{t('workflow_editor.save')}</button>
        {saveStatus.kind === 'ok' && <span>{t('workflow_editor.save_success')}</span>}
        {saveStatus.kind === 'error' && <span>{t('workflow_editor.save_error')}{saveStatus.msg}</span>}
      </div>
```

`ReactFlow` 加 `onNodeDoubleClick={onNodeDoubleClick}` prop；`add_step_prompt`/
`add_skill_prompt` 两个输入框弹窗按 `drillStepId` 是否为空二选一渲染 placeholder 文案。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx`
Expected: 全部 PASS（Task 6 + Task 7 两组测试都绿）

Run: `npm run test:web`
Expected: 全部现存用例仍 PASS

- [ ] **Step 6: 提交**

```bash
git add packages/dashboard-app/src/workflow/WorkflowCanvas.tsx packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx packages/dashboard-app/src/i18n/translations.ts
git commit -m "feat(dashboard): WorkflowCanvas 钥入 skill DAG 层（同画布切数据源，GOAL E8）"
```

---

### Task 8: `StepDetailPanel.tsx`（label/gate/guards/inputs/outputs 侧栏表单）

**Files:**
- Create: `packages/dashboard-app/src/workflow/StepDetailPanel.tsx`
- Create: `packages/dashboard-app/src/workflow/StepDetailPanel.test.tsx`
- Modify: `packages/dashboard-app/src/workflow/WorkflowCanvas.tsx`
- Modify: `packages/dashboard-app/src/i18n/translations.ts`

**Interfaces:**
- Consumes：Task 6/7 定义的 `StepDef` 本地接口形状。
- Produces：`StepDetailPanel` 组件——`props: { step: StepDef; onChange: (next: StepDef)
  => void; onClose: () => void }`。纯受控组件，不自己 fetch/save——`WorkflowCanvas`
  在顶层图里选中一个 step 节点（`onNodeClick`，非双击）时渲染它，`onChange` 直接更新
  `WorkflowCanvasInner` 的 `wf` state（同 Task 6/7 已有的 setWf 模式）。

- [ ] **Step 1: i18n 加本任务用到的 key**

`zh.workflow_editor` 块追加：

```ts
    detail_label: '标签',
    detail_gate: '门类型',
    detail_gate_none: '无',
    detail_guards: 'Guards',
    detail_guard_add: '+ guard',
    detail_guard_remove: '移除',
    detail_inputs: 'Inputs',
    detail_outputs: 'Outputs',
    detail_field_add: '+ 字段',
    detail_field_remove: '移除',
    detail_field_name_prompt: '字段名',
    detail_close: '关闭',
```

`en.workflow_editor` 块对应追加：

```ts
    detail_label: 'Label',
    detail_gate: 'Gate type',
    detail_gate_none: 'None',
    detail_guards: 'Guards',
    detail_guard_add: '+ guard',
    detail_guard_remove: 'Remove',
    detail_inputs: 'Inputs',
    detail_outputs: 'Outputs',
    detail_field_add: '+ field',
    detail_field_remove: 'Remove',
    detail_field_name_prompt: 'Field name',
    detail_close: 'Close',
```

- [ ] **Step 2: 写失败测试**

```tsx
// packages/dashboard-app/src/workflow/StepDetailPanel.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { StepDetailPanel, type StepDef } from './StepDetailPanel'

const STEP: StepDef = {
  id: 'spec', label: '规格', gate: 'review',
  skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [],
  guards: [{ type: 'tasks-at-least', n: 3 }], transitions: [],
}

function renderPanel(step = STEP, onChange = vi.fn(), onClose = vi.fn()) {
  render(
    <I18nProvider>
      <StepDetailPanel step={step} onChange={onChange} onClose={onClose} />
    </I18nProvider>,
  )
  return { onChange, onClose }
}

describe('StepDetailPanel', () => {
  it('渲染现有 label/gate/guards/inputs 的值', () => {
    renderPanel()
    expect(screen.getByDisplayValue('规格')).toBeInTheDocument()
    expect(screen.getByDisplayValue('review')).toBeInTheDocument()
    expect(screen.getByText(/tasks-at-least/)).toBeInTheDocument()
    expect(screen.getByText('design_doc')).toBeInTheDocument()
  })

  it('改 label → 真触发 onChange(带新 label 的完整 StepDef)', () => {
    const { onChange } = renderPanel()
    fireEvent.change(screen.getByDisplayValue('规格'), { target: { value: '新标签' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ label: '新标签' }))
  })

  it('改 gate 下拉 → onChange 带新 gate 值', () => {
    const { onChange } = renderPanel()
    fireEvent.change(screen.getByDisplayValue('review'), { target: { value: 'confirm' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ gate: 'confirm' }))
  })

  it('移除一个 guard → onChange 带移除后的 guards 数组', () => {
    const { onChange } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ guards: [] }))
  })

  it('新增一个 output 字段 → onChange 带追加后的 outputs 数组', () => {
    const { onChange } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /Outputs.*\+ 字段|\+ 字段.*Outputs/ }) ?? screen.getAllByRole('button', { name: '+ 字段' })[1]!)
    fireEvent.change(screen.getByPlaceholderText('字段名'), { target: { value: 'build_sha' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ outputs: [{ field: 'build_sha', type: 'string' }] }))
  })

  it('点关闭 → 调用 onClose', () => {
    const { onClose } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/StepDetailPanel.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 4: 实现 `StepDetailPanel.tsx`**

```tsx
// packages/dashboard-app/src/workflow/StepDetailPanel.tsx
import { useState } from 'react'
import { useT } from '../i18n'

export interface FieldRef { field: string; type: 'string' | 'file_path' | 'boolean' }
export interface SkillRef { id: string; depends_on?: string[] }
export type GuardConfig = { type: 'tasks-at-least'; n: number } | { type: 'nonempty-output' }
export interface StepTransition { event: string; to: string }
export interface StepDef {
  id: string; label: string; gate: 'review' | 'confirm' | null
  skills: SkillRef[]; inputs: FieldRef[]; outputs: FieldRef[]
  guards: GuardConfig[]; transitions: StepTransition[]
}

export interface StepDetailPanelProps {
  step: StepDef
  onChange: (next: StepDef) => void
  onClose: () => void
}

export function StepDetailPanel({ step, onChange, onClose }: StepDetailPanelProps): JSX.Element {
  const { t } = useT()
  const [addingField, setAddingField] = useState<'inputs' | 'outputs' | null>(null)
  const [fieldName, setFieldName] = useState('')

  function removeGuard(index: number): void {
    onChange({ ...step, guards: step.guards.filter((_, i) => i !== index) })
  }

  function removeField(kind: 'inputs' | 'outputs', index: number): void {
    onChange({ ...step, [kind]: step[kind].filter((_, i) => i !== index) })
  }

  function confirmAddField(): void {
    if (!addingField || !fieldName) return
    const ref: FieldRef = { field: fieldName, type: 'string' }
    onChange({ ...step, [addingField]: [...step[addingField], ref] })
    setAddingField(null)
    setFieldName('')
  }

  function renderFieldList(kind: 'inputs' | 'outputs', title: string): JSX.Element {
    return (
      <div>
        <h4>{title}</h4>
        <ul>
          {step[kind].map((f, i) => (
            <li key={f.field}>
              {f.field} ({f.type})
              <button onClick={() => removeField(kind, i)}>{t('workflow_editor.detail_field_remove')}</button>
            </li>
          ))}
        </ul>
        <button onClick={() => { setAddingField(kind); setFieldName('') }}>{t('workflow_editor.detail_field_add')}</button>
      </div>
    )
  }

  return (
    <div className="step-detail-panel" role="complementary">
      <label>
        {t('workflow_editor.detail_label')}
        <input value={step.label} onChange={(e) => onChange({ ...step, label: e.target.value })} />
      </label>
      <label>
        {t('workflow_editor.detail_gate')}
        <select value={step.gate ?? ''} onChange={(e) => onChange({ ...step, gate: (e.target.value || null) as StepDef['gate'] })}>
          <option value="">{t('workflow_editor.detail_gate_none')}</option>
          <option value="review">review</option>
          <option value="confirm">confirm</option>
        </select>
      </label>
      <div>
        <h4>{t('workflow_editor.detail_guards')}</h4>
        <ul>
          {step.guards.map((g, i) => (
            <li key={i}>
              {g.type}{g.type === 'tasks-at-least' ? ` (n=${g.n})` : ''}
              <button onClick={() => removeGuard(i)}>{t('workflow_editor.detail_guard_remove')}</button>
            </li>
          ))}
        </ul>
      </div>
      {renderFieldList('inputs', t('workflow_editor.detail_inputs'))}
      {renderFieldList('outputs', t('workflow_editor.detail_outputs'))}
      {addingField && (
        <div role="dialog">
          <input placeholder={t('workflow_editor.detail_field_name_prompt')} value={fieldName} onChange={(e) => setFieldName(e.target.value)} />
          <button onClick={confirmAddField}>{t('workflow_editor.confirm')}</button>
          <button onClick={() => setAddingField(null)}>{t('workflow_editor.cancel')}</button>
        </div>
      )}
      <button onClick={onClose}>{t('workflow_editor.detail_close')}</button>
    </div>
  )
}
```

> guard 新增（"+ guard"）本任务**不做**——`GuardConfig` 只有两种类型且
> `tasks-at-least` 带一个数字参数，往上面已有的 `renderFieldList` 模式硬套一个"选类型
> +可选参数"的迷你表单是可以做的，但设计文档 §2.3 原话是"guards 是'类型下拉+参数输入'
> 的简单列表编辑器"——这里为了不超出 Step 2 测试已经钉死的范围（测试只覆盖了"移除"guard，
> 没覆盖"新增"guard），先只做移除，新增作为一个此任务遗留的小 gap，若要补参考
> `renderFieldList` 的既有形状自己加一个 `<select>` 选类型 + 条件渲染 `n` 输入框，
> 提交前记得跑一遍 Step 2 补的新测试确认真的可用，不要只凭这段描述就当作已完成。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow/StepDetailPanel.test.tsx`
Expected: 全部 PASS

- [ ] **Step 6: 接入 `WorkflowCanvas.tsx`（顶层单击节点打开侧栏）**

**真实浏览器的单击/双击时序坑**（本步骤必须处理，否则是一个测试测不出、用户点两下就会
撞见的真 bug）：真实浏览器双击一个元素会先触发两次 `click`、再触发一次 `dblclick`
（`mousedown→mouseup→click→mousedown→mouseup→click→dblclick`）——如果单纯"单击开侧栏、
双击钥入"各自独立处理，双击 step 节点时会先把详情侧栏打开（两次 click 各触发一次
`setSelectedStepId`），再钥入 skill 层，用户体验是"闪一下详情面板又切进钥入视图"，
两个交互互相打架。`@testing-library` 的 `fireEvent.doubleClick` **不会**模拟这个真实
序列（只发 `dblclick` 一个事件），所以 Task 7 已经写的测试不会暴露这个问题——这是
只看测试绿灯会漏掉的真实交互 bug，必须显式处理，不能假设"测试过了就没问题"。

标准解法：单击不立即生效，延迟一小段时间（250ms，业界对"双击窗口"的常见经验值）等
第二次点击；如果延迟内来了双击，取消这个延迟中的单击动作。

`WorkflowCanvasInner` 新增 `selectedStepId` state + 一个 `useRef` 存延迟中的单击定时器
+ `onNodeClick`（单击，延迟生效）；同时**修改** Task 7 已写的 `onNodeDoubleClick`（不是
新增，是在其函数体最前面插一行清定时器）：

```tsx
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (drillStepId) return
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      setSelectedStepId(node.id)
      clickTimer.current = null
    }, 250)
  }, [drillStepId])

  // Task 7 原有的 onNodeDoubleClick 函数体最前面插入这一行，其余逻辑不变：
  const onNodeDoubleClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    if (!drillStepId) setDrillStepId(node.id)
  }, [drillStepId])
```

（`useRef` 需要在文件顶部 `import` 里把 `useRef` 加进已有的 `useCallback, useEffect,
useMemo, useState` 那行。）

补一条测试到 `WorkflowCanvas.test.tsx`（用 `vi.useFakeTimers()`，验证延迟单击真的会被
双击取消，不只是主观相信这段代码"看起来对"）：

```tsx
it('真实双击时序：双击 step 节点只钥入 skill 层，不会同时打开详情侧栏（先 click 再 dblclick 的真实浏览器序列，用假计时器验证 250ms 内的单击被取消）', async () => {
  vi.useFakeTimers()
  try {
    renderCanvas()
    await vi.waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
    const node = screen.getByText(/intake/i)
    fireEvent.click(node)
    fireEvent.click(node)
    fireEvent.doubleClick(node)
    vi.advanceTimersByTime(300)
    expect(screen.queryByDisplayValue('Intake')).not.toBeInTheDocument() // 详情侧栏没开
  } finally {
    vi.useRealTimers()
  }
})
```

`ReactFlow` 加 `onNodeClick={onNodeClick}` prop（`onNodeDoubleClick` 沿用 Task 7 已加的
prop 绑定，函数引用已经是上面这个新版本，不需要改 `ReactFlow` 那行 JSX 本身）。工具栏
下方（`</div>` 关闭
`workflow-canvas__toolbar` 之后、画布 `<div style={{height:480}}>` 之前）追加：

```tsx
      {!drillStepId && selectedStepId && wf.steps.find((s) => s.id === selectedStepId) && (
        <StepDetailPanel
          step={wf.steps.find((s) => s.id === selectedStepId)!}
          onChange={(next) => setWf((prev) => (prev ? { ...prev, steps: prev.steps.map((s) => (s.id === next.id ? next : s)) } : prev))}
          onClose={() => setSelectedStepId(null)}
        />
      )}
```

`WorkflowCanvas.tsx` 顶部 import 区，把 Task 6 写的这五行本地类型声明：

```ts
interface FieldRef { field: string; type: 'string' | 'file_path' | 'boolean' }
interface SkillRef { id: string; depends_on?: string[] }
type GuardConfig = { type: 'tasks-at-least'; n: number } | { type: 'nonempty-output' }
interface StepTransition { event: string; to: string }
interface StepDef {
  id: string; label: string; gate: 'review' | 'confirm' | null
  skills: SkillRef[]; inputs: FieldRef[]; outputs: FieldRef[]
  guards: GuardConfig[]; transitions: StepTransition[]
}
```

**整段删除**，换成一行：

```ts
import type { FieldRef, GuardConfig, SkillRef, StepDef, StepTransition } from './StepDetailPanel.js'
import { StepDetailPanel } from './StepDetailPanel.js'
```

（`StepDetailPanel.tsx` 在 Step 4 里已经 `export` 了这五个类型，逐字同形状——单一真相源
只保留一份。`WorkflowDef` 不在这五个之列，`StepDetailPanel.tsx` 不需要它，
`WorkflowCanvas.tsx` 自己的 `interface WorkflowDef { name: string; steps: StepDef[] }`
**保留**在本地，只是它引用的 `StepDef` 现在来自 import 而不是本文件自己声明。）

- [ ] **Step 7: 补一条 `WorkflowCanvas.test.tsx` 集成测试确认接线正确**

```tsx
it('单击顶层 step 节点 → 打开详情侧栏；双击仍然是钥入 skill 层（两种交互不冲突）', async () => {
  global.fetch = vi.fn(async (url: string) => {
    if (url === `/api/workflows/${NAME}?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify(TWO_STEP), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
  renderCanvas()
  await waitFor(() => expect(screen.getByText(/intake/i)).toBeInTheDocument())
  fireEvent.click(screen.getByText(/intake/i))
  await waitFor(() => expect(screen.getByDisplayValue('Intake')).toBeInTheDocument())
})
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/workflow`
Expected: 全部 PASS

Run: `npm run test:web`
Expected: 全部现存用例仍 PASS

- [ ] **Step 9: 提交**

```bash
git add packages/dashboard-app/src/workflow/StepDetailPanel.tsx packages/dashboard-app/src/workflow/StepDetailPanel.test.tsx packages/dashboard-app/src/workflow/WorkflowCanvas.tsx packages/dashboard-app/src/workflow/WorkflowCanvas.test.tsx packages/dashboard-app/src/i18n/translations.ts
git commit -m "feat(dashboard): StepDetailPanel —— label/gate/guards/inputs/outputs 侧栏表单（GOAL E8）"
```

---

### Task 9: 导航接线（`Nav.tsx`/`App.tsx`）+ GOAL.md E8 收编

**Files:**
- Modify: `packages/dashboard-app/src/shell/Nav.tsx`
- Modify: `packages/dashboard-app/src/shell/Nav.test.tsx`
- Modify: `packages/dashboard-app/src/App.tsx`
- Modify: `packages/dashboard-app/src/App.test.tsx`
- Modify: `GOAL.md`
- Modify: `docs/TEST-REALITY.md`

**Interfaces:**
- Consumes：`packages/dashboard-app/src/shell/Nav.tsx` 现有的 `WORKBENCH_VIEWS`/
  `PRIMARY_VIEWS`/`View` 类型（2026-07-08 集成收尾时刚建的"工作台"下拉分组，见
  `git log -- packages/dashboard-app/src/shell/Nav.tsx`）；Task 5 的 `WorkflowEditorView`
  + Task 6/7/8 的 `WorkflowCanvas`。
- Produces：`View` 类型新增 `'workflows'` 变体；`App.tsx` 新增一层内部 state
  （当前打开的 workflow 名字，null=列表页）在 `view==='workflows'` 时决定渲染
  `WorkflowEditorView` 还是 `WorkflowCanvas`。

- [ ] **Step 1: 写失败测试（Nav.tsx）**

`Nav.test.tsx`，在"点工作台展开下拉，内含 loop 设置 + AFK 工作台两项"那条测试旁边加一条：

```tsx
it('工作台下拉含第三项 workflow 编辑器', () => {
  renderNav()
  fireEvent.click(screen.getByTestId('nav-workbench'))
  const menu = screen.getByTestId('workbench-menu')
  expect(within(menu).getByTestId('nav-workflows')).toBeInTheDocument()
})
```

同时把测试文件顶部 `renderNav` 用到的 `View` 联合类型走 `Parameters<typeof Nav>[0]`
推导，不需要手改；但 `renderNav({ view: ... })` 若有任何测试用字面量 `'workflows'`
需要类型能过，Step 3 的 `Nav.tsx` 改动会让它自动可用。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/shell/Nav.test.tsx`
Expected: FAIL（`nav-workflows` 不存在）

- [ ] **Step 3: `Nav.tsx` 加 `workflows`**

```ts
export type View = 'inbox' | 'board' | 'settings' | 'loops' | 'afk' | 'workflows'
export const WORKBENCH_VIEWS: View[] = ['loops', 'afk', 'workflows']
```

`i18n/translations.ts` 的 `nav` 块（zh/en 各自）追加 `workflows: '工作台编辑器'` /
`workflows: 'Workflow Editor'`（如果和 `workflow_editor.title` 语义重复，实现时二选一
措辞，不强制逐字不同，只要 zh/en key 结构对齐）。

- [ ] **Step 4: 跑 Nav 测试确认通过**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/shell/Nav.test.tsx`
Expected: 全部 PASS

- [ ] **Step 5: 写失败测试（App.tsx 接线）**

`App.test.tsx` 追加：

```tsx
it('点工作台下拉里的 workflow 编辑器 → 渲染 WorkflowEditorView（列表页）', async () => {
  render(<App />)
  await screen.findByTestId('inbox-view')
  fireEvent.click(screen.getByTestId('nav-workbench'))
  fireEvent.click(screen.getByTestId('nav-workflows'))
  await waitFor(() => expect(screen.getByText(/自定义 workflow|Custom workflows/)).toBeInTheDocument())
})
```

这条测试需要 `global.fetch` 桩子覆盖 `/api/workflows?root=` 这个新 URL——检查
`App.test.tsx` 现有的 `beforeEach` 里 `vi.stubGlobal('fetch', ...)` 桩子逻辑，按现有
模式追加一个分支处理这个新端点，返回 `{names: []}`，不要让这条新测试因为 fetch 桩子
没覆盖新 URL 而报 `unexpected fetch` 之类的错误。

`root` 参数的值取决于 `App.tsx` 怎么决定"当前项目根"——App 层面目前没有"当前选中
project root"这个概念（`snapshot` 是聚合全部项目），本任务实现时需要先读一遍
`App.tsx`/`useSnapshot.ts` 确认有没有现成的"当前 root"来源；如果没有，
`WorkflowEditorView`/`WorkflowCanvas` 的 `root` prop 暂时先取
`snapshot.projects[0]?.root ?? ''`。真实多项目场景下选哪个 root 编辑 workflow 是本任务
范围外的更大问题，不在这里解决，单项目场景下用第一个即可跑通——这是本任务遗留的一个
已知简化点，Step 10 会把它登记进 GOAL.md/TEST-REALITY.md，不是本步骤自己悄悄决定就算了。

- [ ] **Step 6: 跑测试确认失败**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/App.test.tsx`
Expected: FAIL（`view==='workflows'` 无渲染分支）

- [ ] **Step 7: `App.tsx` 接线**

```tsx
import { WorkflowEditorView } from './workflow/WorkflowEditorView'
import { WorkflowCanvas } from './workflow/WorkflowCanvas'
```

`AppShell` 内新增 state：

```tsx
  const [openWorkflowName, setOpenWorkflowName] = useState<string | null>(null)
  const currentRoot = snapshot?.projects[0]?.root ?? ''
```

`<main>` 内 `{view === 'afk' && <AfkWorkbench />}` 之后追加：

```tsx
        {view === 'workflows' && (
          openWorkflowName
            ? <WorkflowCanvas root={currentRoot} name={openWorkflowName} onBack={() => setOpenWorkflowName(null)} />
            : <WorkflowEditorView root={currentRoot} onOpen={setOpenWorkflowName} />
        )}
```

（`snapshot.projects[0]?.root` 已核实真实存在——`packages/dashboard-app/src/types.ts`
的 `Snapshot.projects: ProjectSnapshot[]`、`ProjectSnapshot.root: string`，字段路径
逐字对应，不需要再确认。）

- [ ] **Step 8: 跑测试确认通过**

Run: `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/App.test.tsx`
Expected: 全部 PASS

Run: `npm run test:web`
Expected: 全部现存用例仍 PASS

- [ ] **Step 9: 全量八门验证**

Run（依次，全部要绿）：
```bash
npm run build
npm test
npm run test:web
bash tools/test-hooks.sh
bash tools/test-adapters.sh
bash tools/verify-skills.sh
bash tools/test-bundle.sh
npm run oracle
```

- [ ] **Step 10: GOAL.md E8 勾选 + TEST-REALITY.md 登记已知简化点**

`GOAL.md` 的 E8 那一行，从：
```
- [ ] E8 workflow 编辑器 UI：...——**完全不在本轮范围**...
```
改成：
```
- [x] E8 workflow 编辑器 UI：真画布节点连线图（`@xyflow/react`，两层：顶层 step 拓扑 +
      钥入某 step 看 skill DAG，同画布切数据源）。已知简化点（非阻塞，登记见
      docs/TEST-REALITY.md）：多项目场景下画布固定编辑 `snapshot.projects[0]` 这个
      project 的 workflow，未做"选哪个项目"的显式切换；guard 新增（只做了移除）；
      画布不支持撤销/重做/多选/minimap；节点/workflow 改名需删除重建。
```

`docs/TEST-REALITY.md` 的"登记的覆盖缺口"区块（G13 之后）追加：

```
- **G14**：workflow 编辑器画布（E8，2026-07-08）已知简化点——多项目场景下固定编辑
  `snapshot.projects[0]`（未做项目选择 UI）；guard 只支持移除不支持新增（详情面板已有
  `renderFieldList` 模式，照抄改一个 `<select>` 选类型即可补，未在本轮做）；不支持
  撤销/重做/多选/minimap/节点改名——均是设计文档 2026-07-08-workflow-editor-canvas-
  design.md §3 明确排除的范围外项，不是本轮遗漏。
```

- [ ] **Step 11: 提交**

```bash
git add packages/dashboard-app/src/shell/Nav.tsx packages/dashboard-app/src/shell/Nav.test.tsx packages/dashboard-app/src/App.tsx packages/dashboard-app/src/App.test.tsx packages/dashboard-app/src/i18n/translations.ts GOAL.md docs/TEST-REALITY.md
git commit -m "feat(dashboard): workflow 编辑器接入导航（GOAL E8 收编）"
```

---

## 收尾说明

完成 Task 9 后：GOAL.md 清单 E 全部勾满（E1-E8），清单 F 已在集成收尾时全绿——**GOAL v2.0
达成本文件自己定义的"E/F 全部勾满"收官判据**。全部 9 个任务完成后应该：
- 用 `superpowers:requesting-code-review` 对整个新增的 workflow 编辑器做一次
  task-scoped 之外的整体检查（类似 2026-07-08 集成收尾时对四份计划做的 whole-branch
  review 那个层级，但范围小得多——只是这一个新功能，不需要"whole-branch"这么大的动作，
  一次 general-purpose 的 code-reviewer 子agent review 足够）。
- 用 `superpowers:finishing-a-development-branch` 收尾（本计划假定在 `main` 分支直接
  开发，若实现时另开了 feature 分支，按该 skill 自己的建议合并/推送）。
