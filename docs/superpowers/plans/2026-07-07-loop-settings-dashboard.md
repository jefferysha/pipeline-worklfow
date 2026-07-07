# Loop 设置 Dashboard 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 100% 命令行的 loops 治理（registry/drift/budget/graduation）暴露成 dashboard 上
的单表视图（一行一个 loop：分级/就绪分/预算/状态，点行展开详情+升降档操作）。

**Architecture:** 纯新增，不改 kernel。新增 `packages/server/src/loops.ts` 做跨项目聚合（kernel
的 `loadRegistry`/`computeReadiness`/`computeBudgetStatus`/`decideGraduation`/`applyLevelChange`
都是单 repoRoot 的，dashboard 是多项目——聚合逻辑仿照 `snapshot.ts` 的 `buildSnapshot`/
`scanProject` 模式），server.ts 加两个路由（`GET /api/loops/snapshot` 读、
`POST /api/loops/level` 写，写端点复用现有 B5 token 鉴权三件套），前端新增 `LoopsPanel`
组件（单表+详情展开），复用 `AfkPanel.tsx`/`api/client.ts` 的 fetch-on-mount 模式。

**Tech Stack:** TypeScript, node:http（server 零第三方依赖），React 18（前端）。

## Global Constraints

- kernel 零第三方运行时依赖；server 同样不引入新依赖（`packages/server/package.json` 现在
  只依赖 `@pipeline-lite/kernel`/`@pipeline-lite/tap`，不加新项）。
- 写端点必须走现有 B5 三层鉴权：DNS-rebind Host 检查 → token 鉴权（`timingSafeEqual`）→
  强制 `Content-Type: application/json`（见 `packages/server/src/server.ts:323-337`）。
- `LoopEntry.id` 只在单个项目的 `loops.yaml` 内唯一，跨项目聚合必须用 `root` 消歧，不能
  假设全局唯一。
- 任何新前端组件测试必须是真 render + 真 `fireEvent`（`@testing-library/react`），不能只测
  "组件挂载"这种浅断言（本仓 GOAL C9 硬规则）。
- `Nav.test.tsx` 现在断言 loops **不**出现在一级导航（`packages/dashboard-app/src/shell/
  Nav.test.tsx:41,44`）——这条断言要随本计划更新，不能留着变成假红或者被绕过。

---

### Task 1: Server 端聚合读接口 `packages/server/src/loops.ts`

**Files:**
- Create: `packages/server/src/loops.ts`
- Create: `packages/server/src/loops.test.ts`

**Interfaces:**
- Consumes: `@pipeline-lite/kernel` 的 `loadRegistry(repoRoot: string): { data: LoopRegistry | null; errors: string[] }`、
  `computeReadiness(loop: LoopEntry): ReadinessScore`、`computeBudgetStatus(loop: LoopEntry, runLogText: string | null, now: Date): BudgetStatus`。
  `packages/server/src/registry.ts` 的 `readRegistry(registryPath: string): string[]`（机器级项目根列表）。
- Produces: `buildLoopsSnapshot(deps: LoopsSnapshotDeps): Promise<LoopsSnapshot>`，
  供 Task 2 的路由处理函数调用；`LoopRow`/`LoopsSnapshot` 类型供 Task 4 前端消费（前端会
  重新声明一份镜像类型，不跨包 import 类型，同现有 `Snapshot` 类型的做法）。

- [x] **Step 1: 写失败测试**

```ts
// packages/server/src/loops.test.ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildLoopsSnapshot } from './loops.js'

const LOOP_YAML = `version: 1
loops:
  - id: build-loop
    name: Build Loop
    kind: orchestrator
    goal: 保证每次构建都真跑八门验证不假绿保证每次构建都真跑八门验证
    cadence: 1h
    risk: medium
    runner: cron
    change_prefix: build-loop-
    phases: [build, verify]
    human_gates: [g1, g2]
    state: .superpowers/loops/progress.md
    design_doc: docs/build-loop.md
    status: active
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: skip, max_tokens_per_day: 100000 }
    kill_criteria: [k1, k2]
    autonomy_level: L1
`

async function makeProjectWithLoop(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'loops-snap-'))
  await mkdir(join(root, '.pipeline'), { recursive: true })
  await writeFile(join(root, '.pipeline', 'loops.yaml'), LOOP_YAML, 'utf8')
  return root
}

describe('buildLoopsSnapshot', () => {
  it('聚合跨项目 loop，行带 root 字段消歧，含真 readiness/budget 计算', async () => {
    const rootA = await makeProjectWithLoop()
    const rootB = await makeProjectWithLoop() // 同 id（build-loop）不同项目，验证不冲突

    const snap = await buildLoopsSnapshot({ registry: () => [rootA, rootB], now: () => new Date('2026-07-07T00:00:00Z') })

    expect(snap.rows).toHaveLength(2)
    expect(snap.rows.map((r) => r.root).sort()).toEqual([rootA, rootB].sort())
    for (const row of snap.rows) {
      expect(row.id).toBe('build-loop')
      expect(row.autonomy_level).toBe('L1')
      expect(row.readiness.score).toBeGreaterThanOrEqual(0)
      expect(row.budget.breaker).toBe('ok')
    }
  })

  it('项目没有 loops.yaml → 该项目贡献 0 行，不报错、不跳过其它项目', async () => {
    const rootNoLoops = await mkdtemp(join(tmpdir(), 'loops-snap-empty-'))
    const rootWithLoop = await makeProjectWithLoop()
    const snap = await buildLoopsSnapshot({ registry: () => [rootNoLoops, rootWithLoop], now: () => new Date() })
    expect(snap.rows).toHaveLength(1)
    expect(snap.rows[0]?.root).toBe(rootWithLoop)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/server/src/loops.test.ts`
Expected: FAIL —`Cannot find module './loops.js'`（文件还不存在）

- [x] **Step 3: 实现**

```ts
// packages/server/src/loops.ts
/**
 * loops 治理跨项目聚合读（新增，server 零新依赖）——kernel 的 loadRegistry/computeReadiness/
 * computeBudgetStatus 都是单 repoRoot 的，这里对机器级注册的每个项目各跑一遍再拼一份
 * dashboard 用的扁平行列表。LoopEntry.id 只在单项目内唯一，聚合后用 root 字段消歧
 * （不假设跨项目全局唯一，不做 id 改写）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeBudgetStatus,
  computeReadiness,
  loadRegistry,
  type AutonomyLevel,
  type BudgetStatus,
  type ReadinessScore,
} from '@pipeline-lite/kernel'

export interface LoopRow {
  root: string
  id: string
  name: string
  autonomy_level: AutonomyLevel
  status: string
  readiness: ReadinessScore
  budget: BudgetStatus
}

export interface LoopsSnapshot {
  generated_at: string
  rows: LoopRow[]
}

export interface LoopsSnapshotDeps {
  registry: () => string[]
  now: () => Date
}

function readRunLogText(root: string): string | null {
  try {
    return readFileSync(join(root, '.superpowers', 'loops', 'progress.md'), 'utf8')
  } catch {
    return null
  }
}

export async function buildLoopsSnapshot(deps: LoopsSnapshotDeps): Promise<LoopsSnapshot> {
  const now = deps.now()
  const rows: LoopRow[] = []
  for (const root of deps.registry()) {
    const { data } = loadRegistry(root)
    if (!data) continue
    const runLogText = readRunLogText(root)
    for (const loop of data.loops) {
      rows.push({
        root,
        id: loop.id,
        name: loop.name,
        autonomy_level: loop.autonomy_level,
        status: loop.status,
        readiness: computeReadiness(loop),
        budget: computeBudgetStatus(loop, runLogText, now),
      })
    }
  }
  return { generated_at: now.toISOString(), rows }
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/loops.test.ts`
Expected: PASS（2 例）

- [x] **Step 5: 提交**

```bash
git add packages/server/src/loops.ts packages/server/src/loops.test.ts
git commit -m "feat(server): loops 跨项目聚合读 buildLoopsSnapshot"
```

---

### Task 2: Server 路由 `GET /api/loops/snapshot` + `capabilities.loops`

**Files:**
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `buildLoopsSnapshot(deps: LoopsSnapshotDeps): Promise<LoopsSnapshot>`。
- Produces: 路由 `GET /api/loops/snapshot` 返回 `LoopsSnapshot` JSON；`capabilities.loops: true`
  常量（loops 功能不依赖任何可选运行时，始终声明 true，同 `capabilities.afk` 现状）。

- [ ] **Step 1: 写失败测试**

在 `server.test.ts` 里找到 `describe('GET /api/afk/snapshot'`（已存在的相邻测试）附近新增：

```ts
describe('GET /api/loops/snapshot —— 跨项目聚合 loops.yaml', () => {
  it('capabilities.loops=true；无 loops.yaml 时返回空 rows 而非报错', async () => {
    const h = await start()
    const capRes = await reqGet(h.port, '/api/snapshot')
    expect(capRes.json<any>().capabilities.loops).toBe(true)

    const r = await reqGet(h.port, '/api/loops/snapshot')
    expect(r.status).toBe(200)
    expect(r.json<{ rows: unknown[] }>().rows).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/server/src/server.test.ts -t "loops/snapshot"`
Expected: FAIL — 404（路由不存在）或 `capabilities.loops` 为 `undefined`

- [ ] **Step 3: 实现**

在 `server.ts` 顶部 import 区加：
```ts
import { buildLoopsSnapshot } from './loops.js'
```
在 `capabilities` 对象（`snapshot.ts` 里，`afk: true` 那一行旁边——按现有 `Boolean(...)` 风格，
loops 无可选依赖，直接常量 `true`）加一行：
```ts
loops: true,
```
在 `handleGet` 的路由分派表里，紧邻 `GET /api/afk/snapshot` 的分支之后加：
```ts
if (path === '/api/loops/snapshot') {
  const snap = await buildLoopsSnapshot({ registry: () => dedupeRoots(deps.registry()), now: () => new Date(deps.clock()) })
  return sendJson(res, 200, snap)
}
```
（`dedupeRoots` 已在 `snapshot.ts` 导出，`server.ts` 已经 import 它用于 `/api/snapshot`；
`deps.clock()` 是现有注入的时钟函数，`new Date(deps.clock())` 与 `buildAfkSnapshot`同款
用法一致。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/server.test.ts -t "loops/snapshot"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/server/src/server.ts packages/server/src/server.test.ts
git commit -m "feat(server): GET /api/loops/snapshot 路由 + capabilities.loops"
```

---

### Task 3: Server 写端点 `POST /api/loops/level`（升降档）

**Files:**
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`

**Interfaces:**
- Consumes: `@pipeline-lite/kernel` 的
  `applyLevelChange(repoRoot: string, loopId: string, target: string, opts: {now: Date; confirm: boolean}, fs: GraduationFs): ApplyLevelResult`；
  真 fs 版 `GraduationFs`（`readRegistryText`/`writeRegistryText`/`loadRegistry`/`readRunLog`/`readLoopDoc`，
  同 `packages/cli/src/commands/loops.ts` 里 `REAL_GRADUATION_FS` 的字段，实现方式照抄那份真 fs 接线）。
- Produces: `POST /api/loops/level` body `{ root: string; id: string; target: 'L1'|'L2'|'L3' }`，
  成功 200 返回 `ApplyLevelResult`（含 `written: boolean`），失败按校验类型 400/404/401/403。

- [ ] **Step 1: 写失败测试**

```ts
describe('POST /api/loops/level —— 升降档写回', () => {
  it('对 token + root 在注册表里 → 200 且真改盘 loops.yaml', async () => {
    const h = await start()
    // seed 一个已就绪的 loop（readiness 会满足 L1→L2）到 h.root
    await mkdir(join(h.root, '.pipeline'), { recursive: true })
    await writeFile(join(h.root, '.pipeline', 'loops.yaml'), SEED_LOOP_YAML_READY_FOR_L2, 'utf8')

    const r = await reqPost(
      h.port,
      '/api/loops/level',
      { root: h.root, id: 'build-loop', target: 'L2' },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(200)
    const body = r.json<{ written: boolean }>()
    expect(body.written).toBe(true)
    const text = readFileSync(join(h.root, '.pipeline', 'loops.yaml'), 'utf8')
    expect(text).toContain('autonomy_level: L2')
  })

  it('root 不在机器级注册表里 → 404，不改盘', async () => {
    const h = await start()
    const r = await reqPost(
      h.port,
      '/api/loops/level',
      { root: '/tmp/not-registered', id: 'x', target: 'L2' },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(404)
  })

  it('无 token → 401', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/loops/level', { root: h.root, id: 'build-loop', target: 'L2' })
    expect(r.status).toBe(401)
  })
})
```

（`SEED_LOOP_YAML_READY_FOR_L2` 复用 Task 1 测试里 `LOOP_YAML` 的写法，`readiness≥70` 即可
满足 L1→L2——参照 `packages/kernel/src/loops/graduation.test.ts` 里 `readiness(80)` 的构造
方式反推需要哪些字段饱满，例如 `goal`/`kill_criteria`/`human_gates` 都非空。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/server/src/server.test.ts -t "loops/level"`
Expected: FAIL — 404 路由不存在

- [ ] **Step 3: 实现**

`server.ts` import 区加：
```ts
import { applyLevelChange, type GraduationFs } from '@pipeline-lite/kernel'
```
在文件里新增一个真 fs 版 `GraduationFs`（照抄 `packages/cli/src/commands/loops.ts` 的
`REAL_GRADUATION_FS` 定义，import 来源改成本文件顶部已有的 `readFileSync`/`writeFileSync`/
`join` 等 node:fs、node:path 原语，不新增依赖）：
```ts
const REAL_GRADUATION_FS: GraduationFs = {
  loadRegistry: (repoRoot) => loadRegistry(repoRoot),
  readRunLog: (repoRoot) => {
    try { return readFileSync(join(repoRoot, '.superpowers', 'loops', 'progress.md'), 'utf8') } catch { return null }
  },
  readLoopDoc: (repoRoot) => {
    try { return readFileSync(join(repoRoot, 'LOOP.md'), 'utf8') } catch { return null }
  },
  readRegistryText: (repoRoot) => {
    try { return readFileSync(join(repoRoot, '.pipeline', 'loops.yaml'), 'utf8') } catch { return null }
  },
  writeRegistryText: (repoRoot, text) => writeFileSync(join(repoRoot, '.pipeline', 'loops.yaml'), text, 'utf8'),
}
```
在 `handlePost` 的分派表（`/api/config/mandatory-skills` 分支之后）加：
```ts
if (path === '/api/loops/level') {
  const body = await readJsonBody<{ root?: unknown; id?: unknown; target?: unknown }>(req)
  const root = typeof body.root === 'string' ? body.root : ''
  const id = typeof body.id === 'string' ? body.id : ''
  const target = typeof body.target === 'string' ? body.target : ''
  if (!root || !id || !target) return sendJson(res, 400, { ok: false, error: 'root/id/target 必填' })
  if (!dedupeRoots(deps.registry()).includes(root)) {
    return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
  }
  const result = applyLevelChange(root, id, target, { now: new Date(deps.clock()), confirm: true }, REAL_GRADUATION_FS)
  return sendJson(res, 200, result)
}
```
（`readJsonBody` 是 `server.ts` 里已有的请求体解析辅助函数，`/api/config/mandatory-skills`
分支已在用它，直接复用，不新写解析逻辑。三层鉴权守卫已经在 `handlePost` 顶部统一做过，
这个分支不需要重复写。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/server.test.ts -t "loops"`
Expected: PASS（全部 loops 相关用例）

- [ ] **Step 5: 提交**

```bash
git add packages/server/src/server.ts packages/server/src/server.test.ts
git commit -m "feat(server): POST /api/loops/level 升降档写端点"
```

---

### Task 4: 前端 `LoopsPanel` 单表视图组件

**Files:**
- Create: `packages/dashboard-app/src/loops/LoopsPanel.tsx`
- Create: `packages/dashboard-app/src/loops/LoopsPanel.test.tsx`
- Modify: `packages/dashboard-app/src/api/client.ts`（新增 fetch 辅助函数）

**Interfaces:**
- Consumes: `GET /api/loops/snapshot`（Task 2）、`POST /api/loops/level`（Task 3）。
- Produces: `<LoopsPanel />` 组件，供 Task 5 接线到导航。

- [ ] **Step 1: 在 `api/client.ts` 加 fetch 辅助（先写用到它的失败测试）**

```tsx
// packages/dashboard-app/src/loops/LoopsPanel.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoopsPanel } from './LoopsPanel'

const SNAPSHOT = {
  generated_at: '2026-07-07T00:00:00Z',
  rows: [
    {
      root: '/tmp/proj-a', id: 'build-loop', name: 'Build Loop', autonomy_level: 'L1', status: 'active',
      readiness: { id: 'build-loop', score: 82, band: 'mostly-ready', dimensions: [], suggestions: [] },
      budget: { id: 'build-loop', hasBudget: true, maxTokensPerDay: 100000, warnThreshold: 80000, spentToday: 1000, remaining: 99000, usedRatio: 0.01, runsToday: 1, breaker: 'ok', onExceed: 'skip', autonomyLevel: 'L1', reportOnly: true, reason: '' },
    },
  ],
}

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === '/api/loops/snapshot') {
      return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
    }
    if (url === '/api/loops/level' && opts?.method === 'POST') {
      return new Response(JSON.stringify({ written: true }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('LoopsPanel', () => {
  it('挂载后真 fetch 快照，渲染一行 loop（分级/就绪分/预算/状态）', async () => {
    render(<LoopsPanel />)
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    expect(screen.getByText('L1')).toBeInTheDocument()
    expect(screen.getByText(/82/)).toBeInTheDocument()
  })

  it('点行展开详情 + 点升档按钮 → 真 POST /api/loops/level', async () => {
    render(<LoopsPanel />)
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    const upgradeBtn = await screen.findByRole('button', { name: /升档|Promote/i })
    fireEvent.click(upgradeBtn)
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => c[0] === '/api/loops/level')
      expect(postCall).toBeTruthy()
      expect(JSON.parse(postCall![1].body as string)).toEqual({ root: '/tmp/proj-a', id: 'build-loop', target: 'L2' })
    })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npm run test:web -- LoopsPanel`
Expected: FAIL — `Cannot find module './LoopsPanel'`

- [ ] **Step 3: 实现**

```tsx
// packages/dashboard-app/src/loops/LoopsPanel.tsx
import { useEffect, useState } from 'react'
import { getToken } from '../api/client'

interface ReadinessScore { score: number; band: string }
interface BudgetStatus { breaker: 'ok' | 'warn' | 'tripped'; remaining: number | null }
interface LoopRow {
  root: string; id: string; name: string; autonomy_level: 'L1' | 'L2' | 'L3'; status: string
  readiness: ReadinessScore; budget: BudgetStatus
}
interface LoopsSnapshot { generated_at: string; rows: LoopRow[] }

const NEXT_LEVEL: Record<LoopRow['autonomy_level'], 'L2' | 'L3' | null> = { L1: 'L2', L2: 'L3', L3: null }

export function LoopsPanel(): JSX.Element {
  const [snapshot, setSnapshot] = useState<LoopsSnapshot | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/loops/snapshot', { headers: { Accept: 'application/json' } })
      .then((r) => r.json() as Promise<LoopsSnapshot>)
      .then(setSnapshot)
  }, [])

  async function promote(row: LoopRow): Promise<void> {
    const target = NEXT_LEVEL[row.autonomy_level]
    if (!target) return
    await fetch('/api/loops/level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ root: row.root, id: row.id, target }),
    })
  }

  if (!snapshot) return <p className="subtitle">加载中…</p>
  if (snapshot.rows.length === 0) return <p className="subtitle">没有已注册的 loop</p>

  return (
    <table className="loops-table">
      <thead>
        <tr><th>loop</th><th>档位</th><th>就绪分</th><th>预算</th><th>状态</th></tr>
      </thead>
      <tbody>
        {snapshot.rows.map((row) => (
          <>
            <tr key={`${row.root}:${row.id}`} onClick={() => setExpanded(expanded === row.id ? null : row.id)} style={{ cursor: 'pointer' }}>
              <td>{row.id}</td>
              <td>{row.autonomy_level}</td>
              <td>{row.readiness.score}</td>
              <td>{row.budget.remaining ?? '—'}</td>
              <td>{row.budget.breaker === 'ok' ? '🟢 OK' : row.budget.breaker === 'warn' ? '🟡 预警' : '🔴 熔断'}</td>
            </tr>
            {expanded === row.id && (
              <tr key={`${row.root}:${row.id}:detail`}>
                <td colSpan={5}>
                  <p>就绪分带：{row.readiness.band}</p>
                  {NEXT_LEVEL[row.autonomy_level] && (
                    <button onClick={() => promote(row)}>升档 → {NEXT_LEVEL[row.autonomy_level]}</button>
                  )}
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:web -- LoopsPanel`
Expected: PASS（2 例）

- [ ] **Step 5: 提交**

```bash
git add packages/dashboard-app/src/loops/
git commit -m "feat(dashboard): LoopsPanel 单表视图 + 升档交互"
```

---

### Task 5: 导航接入 + `Nav.test.tsx` 更新

**Files:**
- Modify: `packages/dashboard-app/src/shell/Nav.tsx`
- Modify: `packages/dashboard-app/src/shell/Nav.test.tsx`
- Modify: `packages/dashboard-app/src/App.tsx`（路由/视图切换，具体位置需先读该文件确认当前
  收件箱/看板/设置三视图的路由写法，照同一模式加第 4 个 `loops` 视图）

**Interfaces:**
- Consumes: Task 4 的 `<LoopsPanel />`。
- Produces: 无（叶子任务）。

- [ ] **Step 1: 更新失败测试**

`Nav.test.tsx:41,44` 现在断言 loops 不出现在一级导航（形如
`expect(screen.queryByText(/loops/i)).not.toBeInTheDocument()`）——本计划刻意让 loop 设置
可从导航直达（真正的"工作台"分组归并留给 F1 收尾任务，见计划末尾说明），先改成断言**存在**：

```tsx
it('导航包含 Loop 设置入口', () => {
  render(<Nav active="inbox" onNavigate={() => {}} />)
  expect(screen.getByText(/loop/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:web -- Nav.test`
Expected: FAIL（旧断言和新断言至少一个不通过，视具体改法而定；先跑确认红）

- [ ] **Step 3: 实现**

读 `packages/dashboard-app/src/shell/Nav.tsx` 现有 3 项写法（收件箱/看板/设置），照同样的
`<button>`/`onNavigate('...')` 模式加第 4 项 `loops`；`App.tsx` 里现有 `activeView` 的
switch/if 链加 `loops` 分支渲染 `<LoopsPanel />`。（具体 JSX 结构需实现者先读这两个文件的
当前内容——本计划不假设确切代码形态，因为这是纯粹跟随既有模式的机械改动，不是新设计。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:web`
Expected: PASS 全量（含更新后的 Nav.test.tsx）

- [ ] **Step 5: 提交**

```bash
git add packages/dashboard-app/src/shell/ packages/dashboard-app/src/App.tsx
git commit -m "feat(dashboard): loop 设置接入导航"
```

---

## 收尾说明（非本计划任务，留给最后落地的那个工作台子计划处理）

GOAL.md F1 要求四个工作台功能最终归并成一个"工作台"下拉分组（顶部仍 3 项）。本计划和
AFK 工作台计划各自先直接加了独立的一级导航项（工程上更简单、每个计划能独立测试验收）。
等两者都落地后，需要一个很小的收尾任务：把 4 个独立入口收进一个"工作台"下拉里——这个
收尾任务不需要单独写计划，在实现执行阶段口头交代即可。
