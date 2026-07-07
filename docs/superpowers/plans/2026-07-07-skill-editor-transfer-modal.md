# Skill 编辑器升级（弹窗双栏穿梭框）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把技能矩阵"编辑"按钮从原地文本框换成弹窗双栏穿梭框（左栏全部已注册 skill 可搜索，
右栏当前已选可拖拽排序），保存契约不变。

**Architecture:** 新增一个"列出全部已注册 skill"的只读端点（当前完全不存在，且设计文档
里假设的路径是错的——见下方"设计文档勘误"），前端新增 `SkillTransferModal` 组件替换
`SettingsView.tsx` 里的内联编辑分支，拖拽用原生 HTML5 DnD（同 `BoardView.tsx` 现有模式，
不引入新依赖），保存仍然走现有 `POST /api/config/mandatory-skills`（零改动）。

**Tech Stack:** TypeScript, node:http, React 18, 原生 HTML5 drag-and-drop（无第三方 DnD 库）。

## 设计文档勘误（实现前必读）

`docs/superpowers/specs/2026-07-07-workflow-customization-and-dashboard-workbench-design.md`
§3 提到"已注册 skill 来源 `.claude/skills/*/SKILL.md`，14 个"——**这是错的**：
- 本仓没有 `.claude/skills/` 目录；skill 实际在仓库根 `skills/<name>/SKILL.md`（14 个目录）。
- 矩阵里实际用到的 token（`superpowers:brainstorming`、`grill-with-docs` 等约 25 个）
  绝大多数不在这 14 个本地目录里，而是登记在 `skills/EXTERNAL-SKILLS.md`（`## 已声明依赖`
  标题下的 `- <name>` 列表，约 50 条）。新端点必须合并两个来源，只读本地 14 个会导致穿梭框
  左栏漏掉矩阵里已经在用的大多数 skill。

## Global Constraints

- server 零第三方依赖；新端点只用 `node:fs`（`readdirSync`/`readFileSync`），不引入 markdown/
  yaml 解析库——`EXTERNAL-SKILLS.md` 用简单逐行正则提取 `- <name>` 即可，不需要真 markdown 解析。
- 新前端交互必须真 render + 真 `fireEvent`（含拖拽用 `fireEvent.dragStart`/`dragOver`/`drop`
  搭配 stub `dataTransfer`，同 `BoardView.test.tsx` 现有模式）。
- `POST /api/config/mandatory-skills` 契约本身不变（body 仍是 `{phase, track, skills}`），
  本计划不碰 `packages/server/src/config.ts` 的写逻辑。

---

### Task 1: 新增只读端点 `GET /api/skills/registry`（列出全部已注册 skill）

**Files:**
- Create: `packages/server/src/skillsRegistry.ts`
- Create: `packages/server/src/skillsRegistry.test.ts`
- Modify: `packages/server/src/server.ts`

**Interfaces:**
- Consumes: `node:fs` `readdirSync`/`readFileSync`/`existsSync`；仓库根路径解析沿用
  `main.ts` 里 `manifestPath()` 的相对定位模式（`dist` → `server` → `packages` → 仓库根）。
- Produces: `listAllSkills(repoRoot: string): string[]`（去重、排序后的 token 列表），
  供 server.ts 路由和 Task 2 前端消费。

- [x] **Step 1: 写失败测试**

```ts
// packages/server/src/skillsRegistry.test.ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listAllSkills } from './skillsRegistry.js'

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skills-reg-'))
  await mkdir(join(root, 'skills', 'pipeline-open'), { recursive: true })
  await writeFile(join(root, 'skills', 'pipeline-open', 'SKILL.md'), '# pipeline-open\n', 'utf8')
  await mkdir(join(root, 'skills', 'pipeline-build'), { recursive: true })
  await writeFile(join(root, 'skills', 'pipeline-build', 'SKILL.md'), '# pipeline-build\n', 'utf8')
  await writeFile(
    join(root, 'skills', 'EXTERNAL-SKILLS.md'),
    '# External\n\n## 已声明依赖\n\n- superpowers:brainstorming\n- grill-with-docs\n',
    'utf8',
  )
  return root
}

describe('listAllSkills', () => {
  it('合并本地 skills/*/SKILL.md 目录名 + EXTERNAL-SKILLS.md 已声明依赖列表，去重排序', async () => {
    const root = await makeRepo()
    const result = listAllSkills(root)
    expect(result).toEqual(['grill-with-docs', 'pipeline-build', 'pipeline-open', 'superpowers:brainstorming'])
  })

  it('EXTERNAL-SKILLS.md 不存在时不报错，只返回本地目录', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skills-reg-nolocal-'))
    await mkdir(join(root, 'skills', 'pipeline-open'), { recursive: true })
    await writeFile(join(root, 'skills', 'pipeline-open', 'SKILL.md'), '# x\n', 'utf8')
    expect(listAllSkills(root)).toEqual(['pipeline-open'])
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/server/src/skillsRegistry.test.ts`
Expected: FAIL — `Cannot find module './skillsRegistry.js'`

- [x] **Step 3: 实现**

```ts
// packages/server/src/skillsRegistry.ts
/**
 * 已注册 skill 列表读取（新增，server 零新依赖）——合并两个来源：本地 skills/*/SKILL.md
 * 目录名（当前 14 个）+ skills/EXTERNAL-SKILLS.md「## 已声明依赖」小节的 `- <name>` 行
 * （当前约 50 个，插件/superpowers 等外部 skill 登记表，tools/verify-skills.sh 也读这份
 * 文件做零悬空引用校验，格式已固定）。不用 markdown 解析库，逐行正则够用。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function localSkillDirs(repoRoot: string): string[] {
  const dir = join(repoRoot, 'skills')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'))
  })
}

function externalSkillNames(repoRoot: string): string[] {
  const p = join(repoRoot, 'skills', 'EXTERNAL-SKILLS.md')
  if (!existsSync(p)) return []
  const text = readFileSync(p, 'utf8')
  const names: string[] = []
  for (const line of text.split('\n')) {
    const m = /^-\s+(\S+)/.exec(line.trim())
    if (m?.[1]) names.push(m[1])
  }
  return names
}

export function listAllSkills(repoRoot: string): string[] {
  const merged = new Set([...localSkillDirs(repoRoot), ...externalSkillNames(repoRoot)])
  return [...merged].sort()
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/skillsRegistry.test.ts`
Expected: PASS（2 例）

- [x] **Step 5: 提交**

```bash
git add packages/server/src/skillsRegistry.ts packages/server/src/skillsRegistry.test.ts
git commit -m "feat(server): listAllSkills 合并本地+外部 skill 登记"
```

---

### Task 2: 路由 `GET /api/skills/registry`

**Files:**
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `listAllSkills(repoRoot: string): string[]`。
- Produces: `GET /api/skills/registry` 返回 `{ skills: string[] }`，供 Task 3 前端消费。

- [x] **Step 1: 写失败测试**

```ts
describe('GET /api/skills/registry —— 全部已注册 skill 列表', () => {
  it('返回本仓真实 skills 目录 + EXTERNAL-SKILLS.md 合并列表', async () => {
    const h = await start()
    const r = await reqGet(h.port, '/api/skills/registry')
    expect(r.status).toBe(200)
    const body = r.json<{ skills: string[] }>()
    expect(body.skills).toContain('pipeline-open') // 本仓真实存在的本地 skill 目录
    expect(body.skills.length).toBeGreaterThan(14) // 必须包含外部登记，不能只有本地 14 个
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/server/src/server.test.ts -t "skills/registry"`
Expected: FAIL — 404

- [x] **Step 3: 实现**

`server.ts` import 加 `import { listAllSkills } from './skillsRegistry.js'`。`handleGet` 分派
表里（`/api/config` 分支附近）加：
```ts
if (path === '/api/skills/registry') {
  return sendJson(res, 200, { skills: listAllSkills(repoRootForSkills) })
}
```
（`repoRootForSkills` 需要解析到仓库根——参照 `main.ts` 里 `manifestPath()` 的相对定位写法，
从 `packages/server/dist/server.js` 的位置往上定位到仓库根，而不是用某个 change 的 root，
因为 skill 登记是全局的、不属于任何单个 project。这个只读端点不需要鉴权，同 `/api/config`
现状。）

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/server.test.ts -t "skills/registry"`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/server/src/server.ts packages/server/src/server.test.ts
git commit -m "feat(server): GET /api/skills/registry 路由"
```

---

### Task 3: 前端 `SkillTransferModal` 组件

**Files:**
- Create: `packages/dashboard-app/src/settings/SkillTransferModal.tsx`
- Create: `packages/dashboard-app/src/settings/SkillTransferModal.test.tsx`

**Interfaces:**
- Consumes: `GET /api/skills/registry`（Task 2）。
- Produces: `<SkillTransferModal selected={string[]} onSave={(skills: string[]) => Promise<void>} onCancel={() => void} />`，
  供 Task 4 接线进 `SettingsView.tsx`。

- [x] **Step 1: 写失败测试**

```tsx
// packages/dashboard-app/src/settings/SkillTransferModal.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillTransferModal } from './SkillTransferModal'

beforeEach(() => {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ skills: ['browser-qa', 'grill-with-docs', 'superpowers:brainstorming'] }), { status: 200 }),
  ) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

function dt(): DataTransfer {
  const data: Record<string, string> = {}
  return {
    setData: (k: string, v: string) => { data[k] = v },
    getData: (k: string) => data[k] ?? '',
  } as unknown as DataTransfer
}

describe('SkillTransferModal', () => {
  it('挂载后真 fetch 全部 skill，左栏显示未选中的、右栏显示已选的', async () => {
    render(<SkillTransferModal selected={['grill-with-docs']} onSave={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('skill-available')).toBeInTheDocument())
    const available = screen.getByTestId('skill-available')
    const chosen = screen.getByTestId('skill-chosen')
    expect(available.textContent).toContain('browser-qa')
    expect(available.textContent).not.toContain('grill-with-docs')
    expect(chosen.textContent).toContain('grill-with-docs')
  })

  it('从左栏拖到右栏 → 加入已选；点保存 → onSave 收到含新项的列表', async () => {
    const onSave = vi.fn()
    render(<SkillTransferModal selected={['grill-with-docs']} onSave={onSave} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('skill-available')).toBeInTheDocument())

    const source = screen.getByText('browser-qa')
    const target = screen.getByTestId('skill-chosen')
    const transfer = dt()
    fireEvent.dragStart(source, { dataTransfer: transfer })
    fireEvent.dragOver(target, { dataTransfer: transfer })
    fireEvent.drop(target, { dataTransfer: transfer })

    fireEvent.click(screen.getByRole('button', { name: /保存|Save/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.arrayContaining(['grill-with-docs', 'browser-qa'])))
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npm run test:web -- SkillTransferModal`
Expected: FAIL — `Cannot find module './SkillTransferModal'`

- [x] **Step 3: 实现**

```tsx
// packages/dashboard-app/src/settings/SkillTransferModal.tsx
import { useEffect, useState } from 'react'

export interface SkillTransferModalProps {
  selected: string[]
  onSave: (skills: string[]) => Promise<void> | void
  onCancel: () => void
}

const DND_MIME = 'application/x-pipeline-skill'

export function SkillTransferModal({ selected, onSave, onCancel }: SkillTransferModalProps): JSX.Element {
  const [all, setAll] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[]>(selected)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/skills/registry', { headers: { Accept: 'application/json' } })
      .then((r) => r.json() as Promise<{ skills: string[] }>)
      .then((body) => setAll(body.skills))
  }, [])

  const available = all.filter((s) => !chosen.includes(s) && s.toLowerCase().includes(query.toLowerCase()))

  function onDropToChosen(e: React.DragEvent): void {
    e.preventDefault()
    const skill = e.dataTransfer.getData(DND_MIME)
    if (skill && !chosen.includes(skill)) setChosen([...chosen, skill])
  }
  function onDropToAvailable(e: React.DragEvent): void {
    e.preventDefault()
    const skill = e.dataTransfer.getData(DND_MIME)
    setChosen(chosen.filter((s) => s !== skill))
  }

  return (
    <div className="modal" role="dialog">
      <input placeholder="搜索…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="split">
        <div data-testid="skill-available" onDragOver={(e) => e.preventDefault()} onDrop={onDropToAvailable}>
          {available.map((s) => (
            <div key={s} draggable onDragStart={(e) => e.dataTransfer.setData(DND_MIME, s)}>
              {s}
            </div>
          ))}
        </div>
        <div data-testid="skill-chosen" onDragOver={(e) => e.preventDefault()} onDrop={onDropToChosen}>
          {chosen.map((s) => (
            <div key={s} draggable onDragStart={(e) => e.dataTransfer.setData(DND_MIME, s)}>
              {s}
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => onSave(chosen)}>保存</button>
      <button onClick={onCancel}>取消</button>
    </div>
  )
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npm run test:web -- SkillTransferModal`
Expected: PASS（2 例）

- [x] **Step 5: 提交**

```bash
git add packages/dashboard-app/src/settings/SkillTransferModal.tsx packages/dashboard-app/src/settings/SkillTransferModal.test.tsx
git commit -m "feat(dashboard): SkillTransferModal 双栏穿梭框组件"
```

---

### Task 4: 接线进 `SettingsView.tsx`，替换原地文本框

**Files:**
- Modify: `packages/dashboard-app/src/settings/SettingsView.tsx`（替换 192-254 行的内联编辑分支）
- Modify: `packages/dashboard-app/src/settings/SettingsView.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `<SkillTransferModal />`；现有 `saveCell`（`SettingsView.tsx:83`）的
  POST 逻辑不变，只改它的调用来源（从"解析 draft 文本框"改成"接收 modal 传回的数组"）。

- [ ] **Step 1: 更新测试**

`SettingsView.test.tsx` 里原本断言"点编辑出现文本框"的用例（约第 173-197 行附近）改成
断言"点编辑出现弹窗、弹窗内有 skill-available/skill-chosen"：

```tsx
it('点编辑 → 弹窗双栏穿梭框出现', async () => {
  render(<SettingsView />)
  fireEvent.click(await screen.findByText('技能矩阵'))
  const editBtn = await screen.findAllByText('编辑')
  fireEvent.click(editBtn[0]!)
  expect(await screen.findByTestId('skill-available')).toBeInTheDocument()
  expect(screen.getByTestId('skill-chosen')).toBeInTheDocument()
})
```

保留原有"保存 → 真 POST 请求 url/method/Authorization Bearer/body 正确"那条用例的断言内容
不变（因为 `POST /api/config/mandatory-skills` 契约没变），只是触发保存的交互从"改文本框
再点保存"换成"走 modal 再点保存"。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:web -- SettingsView`
Expected: FAIL（旧的"文本框"断言找不到元素）

- [ ] **Step 3: 实现**

在 `SettingsView.tsx` 里 import `SkillTransferModal`；把 192-254 行的
`isEditing ? (<input .../>) : (<ul>...<button>编辑</button></ul>)` 三元分支，改成
`isEditing ? (<SkillTransferModal selected={effectiveSkills(phase, track)} onSave={(skills) => saveCellWith(phase, track, skills)} onCancel={() => setEditingKey(null)} />) : (原有只读 <ul> + 编辑按钮不变)`。
新增 `saveCellWith(phase, track, skills: string[])` 函数，逻辑等同现有 `saveCell`（同一个
`fetch('/api/config/mandatory-skills', ...)` 调用），只是直接接收 `skills` 数组参数而不是
从 `draft` 字符串 `split(',')` 解析——`draft`/`startEdit`/相关 state 可以删除（不再需要文本框
草稿状态）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:web -- SettingsView`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/dashboard-app/src/settings/SettingsView.tsx packages/dashboard-app/src/settings/SettingsView.test.tsx
git commit -m "feat(dashboard): 技能矩阵编辑改用双栏穿梭框弹窗"
```
