# AFK 工作台实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把只读的 AFK 状态面板升级成列表+详情侧栏的工作台：能看真实日志尾、能取消/重试。

**Architecture:** 现状调研已确认三个能力目前完全不存在可用的底层管道（`automation_sandbox`/
`automation_worktree` 字段声明了但从未写入；取消用的 `AbortController` 是函数局部变量，
外部够不着；日志只有 200 字符截断片段落盘，64KiB 全量 tail 是函数局部变量，run 完就丢）。
本计划先在 `packages/automation` 补齐这三块真管道（persist 容器名/worktree 路径、persist
日志全量 tail 到文件、取消走"落 cancel 标记 + docker kill"而非指望进程内 AbortController），
再在 server 加对应端点，最后做前端列表+详情侧栏。

**Tech Stack:** TypeScript, node:child_process（docker 命令）, node:http, React 18。

## Global Constraints

- kernel/automation 零第三方运行时依赖。
- 写端点走现有 B5 三层鉴权（DNS-rebind → token → content-type）。
- **本计划前 3 个任务改的是 `packages/automation` 内部机制，改动前实现者必须先用 Read 工具
  读一遍要改的文件当前完整内容**——研究阶段拿到的是函数签名/行号摘要，不是每个文件的逐行
  原文，具体改法要对照文件当前真实代码，不能凭摘要臆造 diff。这不是偷懒占位，是因为这三个
  文件是本仓最复杂的部分之一，值得实现前再确认一遍现状。

---

### Task 1: 真实持久化 sandbox 容器名 + worktree 路径

**Files:**
- Modify: `packages/automation/src/lifecycle/lifecycle.ts`（`runChangeInSandbox` 内，容器/
  worktree 创建成功后写回 state）
- Modify: `packages/automation/src/lifecycle/ports.ts`（`LifecyclePorts`/`runWork` 相关类型，
  如果需要新增一个"写回 state 字段"的注入端口）
- Test: `packages/automation/src/lifecycle/lifecycle.test.ts`（追加用例，具体文件名以现有
  `lifecycle.ts` 同目录测试文件为准）

**Interfaces:**
- Consumes: `StateStore.set(changeDir, field, value)`（`@pipeline-lite/kernel` 已有接口，
  automation 包已经在别处注入 `StateStore` 一类的写入端口——先读 `lifecycle.ts`/`ports.ts`
  当前代码确认现有的 state 写入注入点叫什么名字，复用它，不要新发明一个）。
- Produces: 运行期间 `automation_sandbox` 字段真被写成真实容器名（`container.ts` 里
  `createDockerSandbox()` 生成的 `sandcastle-<random>` 名字)，`automation_worktree` 字段
  真被写成真实 worktree 绝对路径——这两个字段下游 Task 4/5（取消/详情）都要用。

- [x] **Step 1: 读现状**

先用 Read 工具读一遍 `packages/automation/src/lifecycle/lifecycle.ts` 全文和
`packages/automation/src/lifecycle/ports.ts` 全文，确认：① `runChangeInSandbox` 里
`ports.createSandbox(...)` 返回值（`SandboxHandle`）在哪一行拿到，容器名是否在这个返回值
或它的调用参数里能拿到；② `runWork`/`ports.worktree.create(...)` 返回的 worktree 路径在
哪个变量里；③ 现有代码是否已经有类似"运行期间写回 state 字段"的调用（例如
`automation_last_error`/`automation_preserved_path` 是怎么写回的——研究已确认这两个字段
`scheduler.ts:121,136-137` 有真写入，抄它的写法）。

- [x] **Step 2: 写失败测试**

对照 Step 1 读到的真实结构，在 `lifecycle.test.ts`（或既有同名测试文件）里加一例：真调
`runChangeInSandbox`（用现有测试里已经在用的 fake ports），断言 sandbox/worktree 创建成功
后、`runWork` 执行前，`state.get(dir, 'automation_sandbox')` 已经是非空字符串（真容器名或
测试 fake 返回的等价值），`automation_worktree` 同理非空。测试骨架示例（具体断言目标函数名
以 Step 1 读到的现状为准，可能需要调整）：

```ts
it('容器/worktree 创建成功后，真写回 automation_sandbox / automation_worktree 字段', async () => {
  const dir = await seedChange('x')
  const fakePorts = makeFakePorts({ /* 沿用现有测试 fixture 构造方式 */ })
  await runChangeInSandbox(fakePorts, { hostRepoDir: repo, name: 'x', base: 'main', autoMerge: false }, new AbortController().signal)
  expect(await store.get(dir, 'automation_sandbox')).not.toBe('')
  expect(await store.get(dir, 'automation_worktree')).not.toBe('')
})
```

- [x] **Step 2b: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npx vitest run packages/automation/src/lifecycle/ -t "automation_sandbox"`
Expected: FAIL（字段仍是空串，因为当前没有写回逻辑）

- [x] **Step 3: 实现**

在 `runChangeInSandbox` 里，`ports.worktree.create(...)` 和 `ports.createSandbox(...)` 都
成功返回之后（Step 1 读到的具体位置）、`ports.runWork(...)` 调用之前，加两次写回（复用
Step 1 确认的现有 state 写入注入点，签名形如 `stateWrite(changeDir, field, value)` 或直接
是注入的 `StateStore`）：
```ts
await stateWrite(cfg.hostRepoDir_或_changeDir, 'automation_sandbox', handle.containerName)
await stateWrite(cfg.hostRepoDir_或_changeDir, 'automation_worktree', worktreePath)
```
（`handle.containerName`/`worktreePath` 的确切变量名以 Step 1 读到的真实代码为准——如果
`SandboxHandle` 类型现在没有暴露容器名，需要先给它加一个字段，`container.ts` 的
`createDockerSandbox()` 内部已经生成了这个名字，只是没往上传，补一路透传即可。）

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/automation/src/lifecycle/ -t "automation_sandbox"`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/automation/src/lifecycle/
git commit -m "feat(automation): 真持久化 sandbox 容器名 + worktree 路径"
```

**收尾说明（生产接线缺口修复）**：Task 1 提交（`e275f87`）把 `setStateField` 做成了
`createLifecyclePorts` 的**可选**依赖——因为当时真实生产调用链
（`dockerRunChange.ts::createDockerRunChange` → `afk.ts::cmdAfk`）都还没有任何一环把真
`StateStore` 传进来，缺省 no-op 让编译期行为不变但运行期静默跳过写回（细节见
`.superpowers/sdd/task-1-report.md` 的「Concerns」章节）。该缺口已在独立的收尾提交里补上：
`createDockerRunChange` 新增可选 `store` 选项（同 `sdk.ts::storeWriter` 同款
`join(hostRepoDir, 'openspec', 'changes', name)` 解析），`afk.ts` 的 `cmdAfk` `'run'`
分支把已有的 `deps.store` 传了进去。真 CLI + 真 docker 端到端验证见
`packages/cli/src/afk-run.integration.test.ts`。

---

### Task 2: 真实持久化完整日志 tail 到文件

**Files:**
- Modify: `packages/automation/src/lifecycle/ports.ts`（`runWork` 结算处，成功/失败都要落盘）
- Test: 同目录相邻测试文件追加用例

**Interfaces:**
- Consumes: `packages/automation/src/runner/boundedTail.ts` 的 `BoundedTail` 类（已存在，
  64KiB 上限，不用改）。
- Produces: 每次 run 结算（成功或失败）后，在 worktree 内落一个 `.sandcastle-run.log` 文件
  （或复用 Task 1 已经真跑通的 `pipeline-afk-run.sh` 里 `.sandcastle-build.agent.log` 同级
  目录约定，具体文件名实现时二选一，取和现有沙箱产物目录约定更一致的那个），内容是
  `BoundedTail` 累积的完整 stdout+stderr（不是现在 `automation_last_error` 里那 200 字符
  截断片段）。因为这个文件落在 worktree 内，会随 worktree 的 git commit 一起进命名分支，
  teardown 后仍可读（同 G6 验证过的 `.sandcastle-tap` 落盘+可读模式）。

- [x] **Step 1: 读现状**

Read `packages/automation/src/lifecycle/ports.ts` 全文，确认 `runWork` 结算的确切代码
（研究已知大致在 lines 69-82，`invokeWithRace(...)` 调用 + 失败分支
`throw new Error(...res.stderr.slice(0, 200))`），找到成功路径和失败路径分别在哪里返回/抛错，
两条路径都要加日志落盘。

- [x] **Step 2: 写失败测试**

```ts
it('run 结算后（无论成功失败），worktree 内真落一份完整日志文件（非 200 字符截断）', async () => {
  const dir = await seedChange('y')
  const longOutput = 'x'.repeat(5000) // 超过 200 字符截断阈值，验证没有被截
  const fakePorts = makeFakePorts({ runWorkOutput: longOutput /* 具体 fixture 参数按现有测试模式调整 */ })
  try {
    await runChangeInSandbox(fakePorts, { hostRepoDir: repo, name: 'y', base: 'main', autoMerge: false }, new AbortController().signal)
  } catch { /* 允许失败路径，这个测试只关心日志文件内容 */ }
  const logContent = await readFile(join(worktreePathFor('y'), '.sandcastle-run.log'), 'utf8')
  expect(logContent.length).toBeGreaterThan(200)
  expect(logContent).toContain(longOutput.slice(0, 100))
})
```

- [x] **Step 2b: 跑测试确认失败**

Run: `npx vitest run packages/automation/src/lifecycle/ -t "完整日志文件"`
Expected: FAIL（文件不存在）

- [x] **Step 3: 实现**

在 Step 1 确认的成功/失败两条结算路径上，各加一次
`await fs.writeFile(join(worktreePath, '.sandcastle-run.log'), accumulatedOutput, 'utf8')`
（`accumulatedOutput` 来自 `BoundedTail` 实例或 `invokeWithRace` 已经在维护的累积字符串——
Step 1 读现状时确认这个累积值在结算时刻是否还能拿到；如果现有实现里累积变量在失败时被
异常路径提前丢弃，需要把 `BoundedTail` 实例的生命周期往外提一层，确保 catch 分支也能访问到
它，而不是新造一套独立的日志累积机制）。

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/automation/src/lifecycle/ -t "完整日志文件"`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/automation/src/lifecycle/
git commit -m "feat(automation): run 结算时真落盘完整日志 tail（非 200 字符截断）"
```

---

### Task 3: 取消机制——cancel 标记 + classify.ts 识别，避免被误判成 retry

**Files:**
- Modify: `packages/automation/src/scheduler/classify.ts`
- Modify: `packages/automation/src/scheduler/scheduler.ts`
- Test: 同目录相邻测试文件

**Interfaces:**
- Consumes: 无新外部依赖。
- Produces: 一个新的错误 tag（如 `'CancelledRunError'`），`classifyFailure` 认出这个 tag
  时归类到 `conflict`（保留 worktree 现场，不自动重试），而不是现在默认的 `retry` 分支。

**为什么需要这一步（不是可选项）**：研究已确认，dashboard 没有办法直接调用进程内那个
局部 `AbortController`（它活在 `pipeline afk run` 那个短生命周期 CLI 进程里，dashboard
server 是另一个常驻进程，两者没有 IPC）。真正可行的取消方式是 Task 4 里"读 Task 1 持久化的
容器名，直接 `docker kill <name>`"——但容器被外部杀死后，`runWork` 的 exec 调用会返回非零
退出码，走到 `classifyFailure` 时是一个没有 `_tag` 的普通错误，现有代码会把它当成瞬态失败
走 `retry` 分支自动重新排队（`classify.ts:71-78`）——这会导致"用户点了取消，几秒后它自己又
开始跑了"这种违反直觉的行为。必须让 kill 前的动作在 worktree 里落一个标记文件，`runWork`
结算时检测到这个标记就主动抛 `CancelledRunError`，才能让 `classifyFailure` 正确分类。

- [x] **Step 1: 读现状**

Read `packages/automation/src/scheduler/classify.ts` 全文（研究已知 lines 40-79 是
`classifyFailure` 主体，按 `err._tag` 分派）和 `packages/automation/src/lifecycle/
lifecycle.ts` 里 `AbortedRunError`/`isPreserveError`/`PRESERVE_ERROR_TAGS` 的现有定义
（这是 `conflict` 分类已经在用的机制，抄它的模式而不是新发明一套）。

- [x] **Step 2: 写失败测试**

```ts
it('worktree 内有 .cancel-requested 标记时，runWork 结算应抛 CancelledRunError 而非普通 Error', async () => {
  const dir = await seedChange('z')
  await writeFile(join(worktreePathFor('z'), '.cancel-requested'), '1', 'utf8')
  const fakePorts = makeFakePorts({ /* 让底层 exec 返回非零，模拟容器被 kill */ })
  await expect(
    runChangeInSandbox(fakePorts, { hostRepoDir: repo, name: 'z', base: 'main', autoMerge: false }, new AbortController().signal),
  ).rejects.toMatchObject({ _tag: 'CancelledRunError' })
})

it('classifyFailure 对 CancelledRunError 归类 conflict（不自动重试）', () => {
  const err = new CancelledRunError('user requested cancel')
  expect(classifyFailure(err)).toBe('conflict')
})
```

- [x] **Step 2b: 跑测试确认失败**

Run: `npx vitest run packages/automation/src/scheduler/ -t "Cancelled"`
Expected: FAIL（`CancelledRunError` 不存在）

- [x] **Step 3: 实现**

在 `lifecycle.ts` 里仿照现有 `AbortedRunError` 定义新增：
```ts
export class CancelledRunError extends Error {
  override readonly name = 'CancelledRunError'
  readonly _tag = 'CancelledRunError'
  constructor(reason: string) { super(reason) }
}
```
在 `runChangeInSandbox` 的结算逻辑里（`ports.runWork(...)` 返回之后、判断是否
`signal.aborted` 之前的位置——Step 1 读到的具体行），加一段检查：
```ts
if (await fileExists(join(worktreePath, '.cancel-requested'))) {
  throw new CancelledRunError('cancel requested via dashboard')
}
```
在 `classify.ts` 的 `PRESERVE_ERROR_TAGS`（或 `classifyFailure` 的 switch，以 Step 1 读到
的现状为准）里把 `'CancelledRunError'` 加进"归类 conflict、保留 worktree"那一组，和现有
`'SyncError'`/`'MergeToHostTimeoutError'` 等并列。

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/automation/src/scheduler/ -t "Cancelled"`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/automation/src/lifecycle/ packages/automation/src/scheduler/
git commit -m "feat(automation): 新增 CancelledRunError，取消不再被误判成 retry"
```

---

### Task 4: Server 取消端点 `POST /api/afk/:name/cancel`

**Files:**
- Modify: `packages/server/src/afk.ts`
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`

**Interfaces:**
- Consumes: `node:child_process` `execFile('docker', ['kill', containerName])`；
  `automation_sandbox`/`automation_worktree` 字段（Task 1 已确保非空）。
- Produces: `POST /api/afk/:name/cancel` body `{ root: string }`，成功 200，找不到运行中的
  job 或容器名为空 → 400。

- [x] **Step 1: 写失败测试**

```ts
describe('POST /api/afk/:name/cancel', () => {
  it('running 状态且 automation_sandbox 非空 → 落 .cancel-requested 标记 + docker kill + 200', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'running')
    await h.store.set(h.changeDir, 'automation_sandbox', 'sandcastle-test-container-not-real')
    await h.store.set(h.changeDir, 'automation_worktree', h.worktreeDir) // 测试 fixture 需真建这个目录
    const r = await reqPost(h.port, `/api/afk/${h.name}/cancel`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    expect(existsSync(join(h.worktreeDir, '.cancel-requested'))).toBe(true)
  })

  it('automation 状态不是 running → 400', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'paused')
    const r = await reqPost(h.port, `/api/afk/${h.name}/cancel`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(400)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/server/src/server.test.ts -t "afk.*cancel"`
Expected: FAIL — 404

- [x] **Step 3: 实现**

`afk.ts` 新增：
```ts
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function cancelAfkRun(store: StateStore, changeDir: string): Promise<{ ok: boolean; error?: string }> {
  const automation = await store.get(changeDir, 'automation')
  if (automation !== 'running') return { ok: false, error: `automation 状态是 '${automation}'，不是 running` }
  const worktree = await store.get(changeDir, 'automation_worktree')
  const sandbox = await store.get(changeDir, 'automation_sandbox')
  if (!worktree || !sandbox) return { ok: false, error: '缺 automation_worktree/automation_sandbox，无法定位容器' }
  await writeFile(join(String(worktree), '.cancel-requested'), '1', 'utf8')
  await new Promise<void>((resolve) => execFile('docker', ['kill', String(sandbox)], () => resolve())) // kill 失败（容器已退出）不视为错误
  return { ok: true }
}
```
`server.ts` `handlePost` 加路由（正则匹配 `/^\/api\/afk\/([^/]+)\/cancel$/`，同现有
`/api/change/<name>/transition` 的路径参数解析模式）：
```ts
const cancelMatch = /^\/api\/afk\/([^/]+)\/cancel$/.exec(path)
if (cancelMatch) {
  const name = decodeURIComponent(cancelMatch[1]!)
  const body = await readJsonBody<{ root?: unknown }>(req)
  const root = typeof body.root === 'string' ? body.root : ''
  if (!dedupeRoots(deps.registry()).includes(root)) return sendJson(res, 404, { ok: false, error: 'root 未注册' })
  const dir = join(root, 'openspec', 'changes', name)
  const result = await cancelAfkRun(deps.store, dir)
  return sendJson(res, result.ok ? 200 : 400, result)
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/server.test.ts -t "afk.*cancel"`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/server/src/afk.ts packages/server/src/server.ts packages/server/src/server.test.ts
git commit -m "feat(server): POST /api/afk/:name/cancel 取消端点"
```

---

### Task 5: Server 重试端点 `POST /api/afk/:name/retry`

**Files:**
- Modify: `packages/server/src/afk.ts`
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`

**Interfaces:**
- Consumes: `StateStore.cas(changeDir, 'automation', expect, 'queued')`（kernel 已有原语，
  `packages/automation/src/queue/claim.ts` 的 `claim()` 已经在用同一个原语，抄它的模式）。
- Produces: `POST /api/afk/:name/retry` body `{ root: string }`，成功 200，`automation` 状态
  不是 `failed`/`conflict`/`paused` 之一 → 400（这三个是 `LEGAL_AUTOMATION_TRANSITIONS` 里
  已经允许转回 `queued` 的合法源状态，本任务不改状态机，只是补一个触发它的入口）。

- [x] **Step 1: 写失败测试**

```ts
describe('POST /api/afk/:name/retry', () => {
  it.each(['failed', 'conflict', 'paused'])('automation=%s → CAS 回 queued + 200，automation_attempts 清零', async (from) => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', from)
    await h.store.set(h.changeDir, 'automation_attempts', '3')
    const r = await reqPost(h.port, `/api/afk/${h.name}/retry`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    expect(await h.store.get(h.changeDir, 'automation')).toBe('queued')
    expect(await h.store.get(h.changeDir, 'automation_attempts')).toBe('0')
  })

  it('automation=running → 400（运行中不可重试，应先取消）', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'running')
    const r = await reqPost(h.port, `/api/afk/${h.name}/retry`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(400)
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/server/src/server.test.ts -t "afk.*retry"`
Expected: FAIL — 404

- [x] **Step 3: 实现**

`afk.ts` 新增：
```ts
const RETRYABLE_FROM = ['failed', 'conflict', 'paused'] as const

export async function retryAfkRun(store: StateStore, changeDir: string): Promise<{ ok: boolean; error?: string }> {
  const current = await store.get(changeDir, 'automation')
  if (!RETRYABLE_FROM.includes(current as (typeof RETRYABLE_FROM)[number])) {
    return { ok: false, error: `automation 状态 '${current}' 不可重试（仅 failed/conflict/paused 可重试）` }
  }
  const ok = await store.cas(changeDir, 'automation', String(current), 'queued')
  if (!ok) return { ok: false, error: 'CAS 失败，状态在此期间被并发修改' }
  await store.set(changeDir, 'automation_attempts', '0')
  return { ok: true }
}
```
`server.ts` 加对应路由（同 Task 4 的路径参数解析模式，正则换成 `/retry$/`）。

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/server.test.ts -t "afk.*retry"`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/server/src/afk.ts packages/server/src/server.ts packages/server/src/server.test.ts
git commit -m "feat(server): POST /api/afk/:name/retry 重试端点"
```

---

### Task 6: Server 日志读取端点 `GET /api/afk/:name/log`

**Files:**
- Modify: `packages/server/src/afk.ts`
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`

**Interfaces:**
- Consumes: Task 2 落盘的 `.sandcastle-run.log`。**2026-07-08 勘误（Task 2 实现阶段发现计划
  原premise有误，已用真 docker 跑验证并修正，详见 `docs/loops/progress.md` 与
  `.superpowers/sdd/task-2-report.md` 的历史记录）**：日志文件**不在** worktree 内（worktree
  是临时的，成功跑完/普通失败都会在结算后被 teardown 删除，`automation_worktree` 字段此时
  往往已经指向一个不存在的路径——只有 conflict/aborted 保留现场的少数情况 worktree 才会活着）。
  真实落盘位置是**宿主仓库侧**、随 change 本身持久的目录：
  `join(root, 'openspec', 'changes', name, '.sandcastle-run.log')`——与 `.pipeline.yaml`
  同一个目录，已加入 `.gitignore`（比照该目录下 `.breadcrumb` 的先例：这是运行期产物，不是
  该目录里需要提交进版本库的审计轨迹如 `.pipeline.yaml`/`.pipeline-history.jsonl`）。定位这
  个文件只需要 `root` + `name`（即 `changeDir`），**不需要**读 `automation_worktree` 字段——
  该字段仍然真实存在、仍然是 Task 3/4（取消标记 + `docker kill` 目标）要用的东西，只是跟
  "日志在哪"这件事解耦了。**注意**：现有 `GET /api/afk/log` 路由已存在但语义完全不同
  （`buildAfkLog`，聚合的是"哪些 change 发生过 queued/error/state 事件"的结构化时间线，不是
  某一个 change 的原始日志文本）——本任务是新增 `GET /api/afk/:name/log`（带 change 名的路径
  参数），不是修改现有的 `/api/afk/log`，两者并存，命名上容易混淆需要实现者注意区分。
- Produces: `{ log: string | null }`，`log` 为 `null` 表示该 change 还没有产生过日志文件
  （尚未运行过，或 Task 2 尚未部署前创建的旧 change）。

- [x] **Step 1: 写失败测试**

```ts
describe('GET /api/afk/:name/log', () => {
  it('change 目录内有 .sandcastle-run.log → 原样返回内容', async () => {
    const h = await start()
    await writeFile(join(h.changeDir, '.sandcastle-run.log'), 'line1\nline2\n', 'utf8')
    const r = await reqGet(h.port, `/api/afk/${h.name}/log?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ log: string }>().log).toBe('line1\nline2\n')
  })

  it('没有日志文件 → { log: null }，不是 404', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/afk/${h.name}/log?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ log: string | null }>().log).toBeNull()
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/server/src/server.test.ts -t "afk.*log"`
Expected: FAIL — 404 或匹配到了错误的现有 `/api/afk/log` 路由

- [x] **Step 3: 实现**

`afk.ts` 新增（不再需要 `store`/`automation_worktree`，只需要 `changeDir`）：
```ts
export async function readAfkRunLog(changeDir: string): Promise<string | null> {
  try {
    return await readFile(join(changeDir, '.sandcastle-run.log'), 'utf8')
  } catch {
    return null
  }
}
```
`server.ts` 路由（正则 `/^\/api\/afk\/([^/]+)\/log$/`，注意要放在现有字面量 `/api/afk/log`
判断**之后**判断，避免正则意外吞掉不带名字的旧路由——两者路径结构不同不会误匹配，但顺序上
仍建议把新的参数化路由放在字面量路由判断之后，减少认知负担）：
```ts
const logMatch = /^\/api\/afk\/([^/]+)\/log$/.exec(path)
if (logMatch) {
  const name = decodeURIComponent(logMatch[1]!)
  const root = new URL(req.url ?? '', 'http://x').searchParams.get('root') ?? ''
  if (!dedupeRoots(deps.registry()).includes(root)) return sendJson(res, 404, { ok: false, error: 'root 未注册' })
  const dir = join(root, 'openspec', 'changes', name)
  return sendJson(res, 200, { log: await readAfkRunLog(dir) })
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/server/src/server.test.ts -t "afk.*log"`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add packages/server/src/afk.ts packages/server/src/server.ts packages/server/src/server.test.ts
git commit -m "feat(server): GET /api/afk/:name/log 日志读取端点"
```

---

### Task 7: 前端 `AfkWorkbench`（列表+详情侧栏）

**Files:**
- Create: `packages/dashboard-app/src/afk/AfkWorkbench.tsx`
- Create: `packages/dashboard-app/src/afk/AfkWorkbench.test.tsx`

**Interfaces:**
- Consumes: `GET /api/afk/snapshot`（已存在，`AfkCard` 现在 `sandbox`/`worktree` 字段会真
  非空，Task 1 之后）、`GET /api/afk/:name/log`（Task 6）、`POST /api/afk/:name/cancel`
  （Task 4）、`POST /api/afk/:name/retry`（Task 5）。
- Produces: `<AfkWorkbench />`，供 Task 8 接线进导航。

- [ ] **Step 1: 写失败测试**

```tsx
// packages/dashboard-app/src/afk/AfkWorkbench.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AfkWorkbench } from './AfkWorkbench'

const SNAPSHOT = {
  generated_at: '2026-07-07T00:00:00Z',
  scheduler: { status: 'busy', queued: 0, running: 1, merged: 0, failed: 0, conflict: 0, paused: 1, total: 2, message: '' },
  lanes: {
    queued: [], merged: [], failed: [], conflict: [],
    running: [{ name: 'demo-2', root: '/tmp/a', path: '/tmp/a/openspec/changes/demo-2', phase: 'build', automation: 'running', lane: 'running', attempts: 0, queued_at: '', last_error: '', sandbox: 'sandcastle-abc', worktree: '/tmp/wt-2' }],
    paused: [{ name: 'demo-1', root: '/tmp/a', path: '/tmp/a/openspec/changes/demo-1', phase: 'build', automation: 'paused', lane: 'paused', attempts: 0, queued_at: '', last_error: '', sandbox: '', worktree: '' }],
  },
  cards: [],
}

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
    if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ log: 'building...\n' }), { status: 200 })
    if (url.startsWith('/api/afk/demo-1/retry') && opts?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 })
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('AfkWorkbench', () => {
  it('左列表显示两个 change，点击 running 的那个 → 右侧详情显示日志', async () => {
    render(<AfkWorkbench />)
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/building\.\.\./)).toBeInTheDocument())
  })

  it('paused 的 change 点击后详情区有"重试"按钮，点击真 POST /retry', async () => {
    render(<AfkWorkbench />)
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-1'))
    const retryBtn = await screen.findByRole('button', { name: /重试|Retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c) => String(c[0]).includes('/retry'))).toBe(true)
    })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/a1234/Documents/code-manager/projects/pipeline-worklfow && npm run test:web -- AfkWorkbench`
Expected: FAIL — `Cannot find module './AfkWorkbench'`

- [ ] **Step 3: 实现**

```tsx
// packages/dashboard-app/src/afk/AfkWorkbench.tsx
import { useEffect, useState } from 'react'
import { getToken } from '../api/client'

interface AfkCard {
  name: string; root: string; automation: string; lane: string
  sandbox: string; worktree: string; last_error: string
}
interface AfkSnapshot { lanes: Record<string, AfkCard[]> }

const RETRYABLE = new Set(['failed', 'conflict', 'paused'])

export function AfkWorkbench(): JSX.Element {
  const [snapshot, setSnapshot] = useState<AfkSnapshot | null>(null)
  const [selected, setSelected] = useState<AfkCard | null>(null)
  const [log, setLog] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/afk/snapshot').then((r) => r.json() as Promise<AfkSnapshot>).then(setSnapshot)
  }, [])

  useEffect(() => {
    if (!selected) { setLog(null); return }
    fetch(`/api/afk/${selected.name}/log?root=${encodeURIComponent(selected.root)}`)
      .then((r) => r.json() as Promise<{ log: string | null }>)
      .then((body) => setLog(body.log))
  }, [selected])

  const allCards = snapshot ? Object.values(snapshot.lanes).flat() : []

  async function doAction(action: 'cancel' | 'retry'): Promise<void> {
    if (!selected) return
    await fetch(`/api/afk/${selected.name}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ root: selected.root }),
    })
  }

  return (
    <div className="split">
      <div className="mock-sidebar">
        {allCards.map((c) => (
          <div key={`${c.root}:${c.name}`} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
            {c.lane === 'running' ? '●' : '○'} {c.name} · {c.lane}
          </div>
        ))}
      </div>
      <div className="mock-content">
        {selected ? (
          <>
            <b>{selected.name}</b> · {selected.automation}
            <pre>{log ?? '（无日志）'}</pre>
            {selected.lane === 'running' && <button onClick={() => doAction('cancel')}>取消</button>}
            {RETRYABLE.has(selected.lane) && <button onClick={() => doAction('retry')}>重试</button>}
          </>
        ) : (
          <p className="subtitle">选一个 change 查看详情</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:web -- AfkWorkbench`
Expected: PASS（2 例）

- [ ] **Step 5: 提交**

```bash
git add packages/dashboard-app/src/afk/
git commit -m "feat(dashboard): AfkWorkbench 列表+详情侧栏（日志/取消/重试）"
```

---

### Task 8: 导航接入 + 移除/保留旧的 Advanced 面板 AfkPanel

**Files:**
- Modify: `packages/dashboard-app/src/shell/Nav.tsx`
- Modify: `packages/dashboard-app/src/App.tsx`
- Modify: `packages/dashboard-app/src/advanced/AdvancedPanel.tsx`（决定 `PANELS.afk` 是保留
  原 `AfkPanel` 只读摘要、还是整块删掉改成"查看完整工作台"的链接——本计划选后者：删掉
  `AdvancedPanel.tsx` 里 `afk: AfkPanel` 这一行映射和对应的 `TOOLS` 项，因为 Task 7 的
  `AfkWorkbench` 已完全覆盖并超过它的信息量，留着两份重复视图只会让用户困惑哪个是准的）

**Interfaces:**
- Consumes: Task 7 的 `<AfkWorkbench />`。

- [ ] **Step 1: 更新测试**

`AdvancedPanel.test.tsx` 里如果有断言"Advanced 面板含 afk 摘要"的用例，改成断言"Advanced
面板不再含 afk（因为已升格为独立导航项）"；`Nav.test.tsx` 加一条"导航含 AFK 工作台入口"。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:web`
Expected: FAIL（部分用例，视具体改法而定）

- [ ] **Step 3: 实现**

同 loop 设置计划 Task 5 的模式：`Nav.tsx` 加一个新入口，`App.tsx` 加对应视图分支渲染
`<AfkWorkbench />`；`AdvancedPanel.tsx` 的 `TOOLS`/`PANELS` 移除 `afk` 项。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:web`
Expected: PASS 全量

- [ ] **Step 5: 提交**

```bash
git add packages/dashboard-app/src/shell/ packages/dashboard-app/src/App.tsx packages/dashboard-app/src/advanced/
git commit -m "feat(dashboard): AFK 工作台接入导航，移除 Advanced 面板里的旧摘要"
```
