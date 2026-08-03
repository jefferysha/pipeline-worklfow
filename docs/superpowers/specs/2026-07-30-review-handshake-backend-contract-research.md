# Review Handshake 后端契约调研

日期：2026-07-30
范围：kernel canonical review-gate、`GET /api/snapshot`、Dashboard 类型/decoder、相关测试与 OpenSpec 主规格。
结论性质：Explore 只读审计；本文不改变 review、acknowledge、transition 或持久化行为。

## 研究问题

如何用最小、向后兼容且失败关闭的只读 DTO，把当前 Change 的 canonical exact-event review
receipt 投影到 Dashboard，使前端能区分：

1. guard / document evidence 已齐，但尚未发起 review request；
2. 已发起 exact-event request，等待确认；
3. exact-event receipt 已批准，等待同一 event 的 transition 消费。

## 事实证据

### 1. canonical receipt 已有唯一状态真相源

- `packages/kernel/src/types.ts:11-32` 定义五个追加字段：
  `review_gate_phase`、`review_gate_status`、`review_gate_event`、
  `review_requested_at`、`review_acknowledged_at`。旧 canonical revision 只允许两种精确兼容形状：
  完整五字段均缺失，或旧四字段全空且只缺 event；非空旧 receipt 缺 event 必须拒绝，见
  `packages/kernel/src/state/run-revision-codec.ts:243-305` 及
  `packages/kernel/src/state/run-revision-store.test.ts:314-363`。
- `packages/kernel/src/state/review-gate.ts:9-75` 已集中提供 `pending` / `approved` 枚举、
  status/event 读取、exact phase/event 匹配、request/approval patch 和 transition 后清空 patch。
  `reviewGateApprovedFor` 同时匹配 phase、event 和 approved status，不能把 `verify-fail` 的批准用于
  `verify-pass`。
- `packages/cli/src/commands/review.integration.test.ts:23-54` 用真实 CLI 锁定完整生命周期：
  request 写 pending + exact event，pending 不能 transition，acknowledge 写 approved，成功
  transition 后 receipt 被消费。
- `packages/kernel/src/workflow/transition-application.ts:326-340` 在所有自动 guard 与文档证据通过后才
  检查 exact-event approval，并在任一成功 transition 中清空 receipt。Review 是当前 phase 的出口
  handshake，不是进入 review phase 时自动成立的状态。
- `openspec/specs/document-evidence-contract/spec.md:143-156` 是该行为的现有主规格：
  request/acknowledge/transition 必须绑定 current phase + exact event；无关 prompt 和直接删 marker
  均不能批准。持续授权的额外限制在
  `openspec/specs/interaction-and-skill-provenance/spec.md:184-195`，本功能不得扩大其权限。

### 2. Server 已读取 canonical state，但没有结构化 handshake DTO

- `packages/server/src/snapshot.ts:220-277` 通过 `StateStore.read()` 读取 canonical state，把完整
  `fields` 原样放入 `ChangeSnapshot`，并另外投影 workflow rules、transition readiness、Todo、
  documents 与 terminal activity。
- `packages/server/src/types.ts:29-55` 的 `ChangeSnapshot` 没有 review handshake 字段；receipt 目前
  只能从宽泛的 `fields: Record<FieldName, string | string[]>` 间接读取。
- `packages/server/src/snapshot.ts:294-308` 已让 GET 与 SSE 共用同一个 snapshot 构建结果。将状态加入
  现有 Change snapshot 可天然保持首屏与流式更新一致，无需第二轮询或新端点。

### 3. 前端 decoder 当前不会校验 receipt 语义

- `packages/dashboard-app/src/types.ts:7-26` 手工镜像 server Change DTO；同样没有结构化 handshake。
- `packages/dashboard-app/src/api/snapshotDecoder.ts:89-141` 只把 `fields` 解为任意
  `string | string[]` 字典；前端若直接解释五个字段，会复制 kernel 状态机和异常兼容逻辑。
- `packages/dashboard-app/src/api/snapshotDecoder.ts:100-141` 对 Change 顶层字段是“校验已知必需字段、
  忽略未知字段”，不是 exact-key 闭集。因此旧 Dashboard 会忽略新 server 增加的
  `reviewHandshake`，这为加法升级提供了现成兼容面。
- `packages/dashboard-app/src/api/snapshotDecoder.ts:341-365` 同一个 decoder 同时消费 HTTP snapshot
  与 SSE frame；新增字段只需在 `decodeChange` 一处收口。

### 4. 当前 UI 的“gate”是 readiness，不是 review receipt

- `packages/dashboard-app/src/model/progressModel.ts:78-135` 只依据
  `workflowRules.gateByStep[phase] === 'review'` 和
  `workflowExecution.readinessByTransition` 判断 `gate` / `agent`；没有读取 canonical
  request/approval。
- `packages/dashboard-app/src/inbox/inbox.ts:25-35` 直接复用该五态，所以当前“等你决定”实际表达的是
  “至少一个 review-gated 出口的 guard readiness 已齐”，不能证明 request 已建立，更不能证明
  exact event 已批准。
- `packages/dashboard-app/src/inbox/inbox.test.tsx:77-120` 也只固定 readiness/产出语义。该测试不应在
  本功能中被改造成 receipt 真相源；readiness 与 handshake 应保留为两条正交状态轴。

## 方案对比

### 方案 A：前端直接解释 `change.fields.review_gate_*`

实现最少，但不推荐。

- 优点：server 零改动，能快速显示 pending/approved。
- 缺点：Dashboard 必须复制 legacy omission、五字段完整性、phase/event 精确匹配和非法状态处理；
  HTTP 与其他消费方仍没有稳定 DTO；容易把非空损坏 receipt 降级成“未请求”。
- 安全结论：违反“协议 DTO 与持久化 record 分离”的后端规则，也让安全状态机出现第二真相源。

### 方案 B：在现有 Change snapshot 增加 server 派生的判别联合

推荐。

```ts
export type ReviewHandshakeSnapshot =
  | { status: 'not-requested' }
  | { status: 'pending'; event: string }
  | { status: 'approved'; event: string }
```

Server `ChangeSnapshot` 将 `reviewHandshake` 设为必有字段；Dashboard 镜像类型暂设为可选：

```ts
// server
reviewHandshake: ReviewHandshakeSnapshot

// dashboard，滚动升级窗口内
reviewHandshake?: ReviewHandshakeSnapshot
```

语义：

- 五个 canonical receipt 字段全空时才投影 `{ status: 'not-requested' }`。
- `pending` / `approved` 必须同时满足：
  - receipt phase 精确等于 Change 当前 phase；
  - event 非空；
  - event 属于冻结 workflow plan 当前 step 的真实出边；
  - canonical status 是 kernel 已知枚举。
- 任一非空半组、未知 status、phase 漂移或不可达 event 均应让该 Change 的 snapshot 构建
  fail-loud，沿现有 `scanProject` 错误面暴露；不得伪装成 `not-requested`。
- `event` 只在 pending/approved 分支存在；当前 phase 已在父 `ChangeSnapshot.phase` 中，不重复。
- DTO 不携带 `requestedAt`、`acknowledgedAt`、marker、delegated authority、host session、路径、
  token 或服务端本地化 `nextAction`。当前用户价值只需状态 + exact event；时间线以后可加法扩展。
- guard readiness 继续只由 `workflowExecution` 表达；`reviewHandshake` 不增加 `ready` 字段，避免
  “证据齐”和“人工握手”再次混成一个布尔量。

建议用一个 server 内纯投影函数组合现有 kernel helper 与冻结 plan 出边校验。不要新增 kernel 写入、
持久化字段或第二套 review enum；若实现发现反复读取 raw fields 才能识别半组，可在 kernel 新增一个
只读、判别联合的 receipt 解析 helper，但其返回值仍是领域读模型，HTTP DTO 继续在 server 显式映射。

### 方案 C：新增 `/api/change/:name/review-handshake` 端点

不推荐。

- 优点：可独立演进或按需加载。
- 缺点：引入第二请求、额外 loading/error/race；必须重复 root/change 校验与 snapshot/SSE 刷新机制；
  Change 列表和详情可能短暂显示不一致。
- 适用条件：未来若新增真正的 review 写操作、独立审计时间线或大体积 reviewer artifact，再另立
  endpoint；当前三态只读投影不成立。

## 推荐契约与兼容策略

采用方案 B，保持 `snapshot_protocol: tenon-snapshot/v2`：

1. **新 server → 旧 Dashboard**：旧 decoder 不做 Change 顶层 exact-key 校验，会忽略
   `reviewHandshake`；兼容。
2. **旧 server → 新 Dashboard**：新 decoder 接受字段缺失并返回 `undefined`。UI 必须显示“当前
   runtime 未提供握手状态”或隐藏状态细节，不能把缺失当作 `not-requested`，也不能回退解析 raw
   `fields`。
3. **新 server → 新 Dashboard**：字段存在时按判别联合严格校验。未知 status、pending/approved
   缺 event、not-requested 带 event、任意额外键均拒绝整个 snapshot frame，等待下一权威 frame 或
   显示现有 snapshot error。
4. server 端字段必有，令同版本 HTTP/SSE 始终提供确定值；前端可选只服务滚动升级，待声明兼容窗口
   结束后再收紧。
5. “无 review gate”由现有 `workflowRules.gateByStep[currentPhase]` 判断；此时即使 DTO 为
   `not-requested`，UI 也应呈现“不适用”，不能把它写成“尚未发起”。

## 文件与测试落点

### 必需实现文件

- `packages/server/src/types.ts`
  - 新增 `ReviewHandshakeSnapshot` 判别联合。
  - `ChangeSnapshot.reviewHandshake` 设为必有。
- `packages/server/src/snapshot.ts`
  - 新增纯只读 projector。
  - 在 `changes.push(...)` 中投影；不新增文件读取，不访问 YAML projection，不写 state。
- `packages/dashboard-app/src/types.ts`
  - 镜像联合，滚动升级期 `reviewHandshake?`。
- `packages/dashboard-app/src/api/snapshotDecoder.ts`
  - 新增 exact-key `decodeReviewHandshake`，字段缺失兼容，字段存在严格失败关闭。
- `packages/dashboard-app/src/testkit.ts`
  - UI 用例需要显式三态时由 fixture 注入；不建议把全局默认设成 pending/approved，以免旧测试
    无意获得人工批准。

### 必需测试

- `packages/server/src/snapshot.test.ts`
  - fresh/legacy 空 receipt → `not-requested`；
  - pending `verify-pass` 与 pending `verify-fail` 保留各自 exact event；
  - acknowledge 后 → `approved`；
  - 成功 transition 消费后 → `not-requested`（完整生命周期已有 CLI integration，可在本测试只锁
    投影边界）；
  - 非空半组、phase 不匹配、未知/不可达 event 不得投影成 idle，项目错误面必须可见。
- `packages/dashboard-app/src/api/boundaryDecoders.test.tsx`
  - 三个合法分支；
  - 老 server 缺字段仍可解码且保持 `undefined`；
  - 未知 status、分支字段缺失/多余、空 event 被拒绝；
  - 相同 snapshot 经 HTTP/SSE 共用 decoder 的既有结构不漂移。
- UI 组件对应测试
  - “无 gate”“runtime 不支持”“未请求”“待确认 + exact event”“已批准 + exact event”；
  - pending/approved 不能被 readiness 改写；
  - SSE 从 pending → approved → transition 后 not-requested/下一 phase 时不保留旧 event。

### 非必需但有价值

- `packages/kernel/src/state/review-gate.test.ts`：当前纯 helper 没有独立单元测试，关键行为主要由 CLI
  integration 和 transition application test 间接覆盖。若实现新增 receipt parser，应在这里直接覆盖
  全空、pending、approved、exact-event mismatch 与半组损坏；若不改 kernel，不应为本功能扩大产品
  修改面。

### OpenSpec 落点

- 新能力 delta：
  `openspec/changes/review-handshake-status-20260730/specs/review-handshake-status/spec.md`。
- 归档后的主规格：
  `openspec/specs/review-handshake-status/spec.md`。
- `document-evidence-contract` 继续作为 receipt 写入、批准和消费的权威主规格。本 Change 只新增
  只读投影与 Dashboard 展示，不应复制或修改其安全语义。

## 建议验收场景

1. review-gated step 的 guards 未齐：Progress 仍显示 agent/readiness blocker，handshake 为
   not-requested。
2. guards 已齐但未 request：Progress 可提示“已具备请求条件”，handshake 仍明确“尚未发起”。
3. request `verify-pass`：显示 pending + `verify-pass`；不得把另一条 `verify-fail` 标为已请求。
4. acknowledge：显示 approved + 同一 event；不代表 transition 已执行。
5. transition 成功：receipt 被消费；新 phase 不保留旧批准。
6. 老 server 缺字段：显示“不支持/不可用”，不从 raw fields 猜测。
7. 损坏或不匹配 receipt：snapshot fail-loud，不显示虚假的安全绿态。

## 风险

- **readiness 与 handshake 混淆**：最主要产品风险。必须保留两条状态轴和分别命名，禁止再归并为
  一个 `readyForReview` 布尔值。
- **多出口错误授权**：Verify 和 custom workflow 可有多条出边；DTO 必须保留 exact event，UI 不能
  只显示“已批准”。
- **approved 的短暂性**：成功 transition 会立即消费 receipt。SSE 可能只短暂呈现 approved，组件
  必须以最新 snapshot 为准，不把旧 event 缓存在本地状态。
- **滚动升级误报**：缺字段表示旧 server/不支持，不等于 not-requested。
- **损坏状态被美化**：任何非空非法组合都不能降级成 idle。错误可以影响单个 Change 的展示，但
  不能伪造安全状态。
- **范围膨胀**：本功能不增加 acknowledge/transition 写按钮，不暴露 marker 或 authority，不更改
  Host/token/content-type/root 信任边界。

## 开放问题

1. approved 是否只显示被 SSE 捕获到的瞬时状态，还是产品需要独立审计历史？推荐本轮只显示当前
   canonical receipt；历史属于后续独立 timeline 能力。
2. 老 server 缺 `reviewHandshake` 时，详情区应显示“运行时版本不支持”还是完全隐藏？推荐显示中性
   unavailable 文案，避免用户把缺失误解为尚未请求。
3. 非空但 phase/event 不匹配的 receipt 是否沿现有路径使 Project `ok=false`，还是只让 handshake
   局部 unavailable？安全上推荐沿现有 Change scan 错误面 fail-loud；若产品担心整卡消失，需要先
   定义第四种 `invalid` 协议态，不能静默回落三态。
4. 本轮是否需要展示 request/acknowledge 时间？推荐不需要；先锁定三态 + exact event，时间字段以后
   可加法扩展且不改变状态机。
5. Dashboard 是否应提供 acknowledge/transition 动作？推荐明确排除本轮；写路径需要另行设计
   host-bound authority、token、重试与 exact-event CAS，不能由只读 DTO 顺带引入。
