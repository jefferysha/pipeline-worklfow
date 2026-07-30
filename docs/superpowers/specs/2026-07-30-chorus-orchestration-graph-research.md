# Chorus Graph 与编排能力研究

读取日期：2026-07-30。所有源码链接固定到 Chorus `main`
`d590b568f40fae51f71c9800841c587a3fe94b0b`；稳定 release 为
[`v0.14.5`](https://github.com/Chorus-AIDLC/Chorus/releases/tag/v0.14.5)，commit
`be647877b4b56a61e480e939d6a6d31b3f84f7f9`。

## Resource Graph 一手契约

- 后端聚合：
  [`resource-graph.service.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/services/resource-graph.service.ts)
  的节点闭集是 `idea | proposal | task | document`，边闭集是
  `derive | lineage | depends`。Idea parent→child 是 lineage；Idea→Proposal、
  Proposal→无 proposal 内入边的 root Task、Proposal→Document 是 derive；Task prerequisite→dependent
  是 depends。所有查询同时受 company/project 约束，外部端点边被丢弃，孤儿节点保留。
- API：
  [`resource-graph route`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/app/api/projects/%5Buuid%5D/resource-graph/route.ts)
  先鉴权、校验 project、对 agent 要求 `task:read`，合法空项目返回 `{nodes:[],edges:[]}`。
- Dashboard：
  [`resource-graph.tsx`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/app/(dashboard)/projects/%5Buuid%5D/graph/resource-graph.tsx)
  与
  [`mindmap-canvas.tsx`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/app/(dashboard)/projects/%5Buuid%5D/graph/mindmap-canvas.tsx)
  使用确定性水平森林布局、类型过滤、标题搜索、节点选中/详情、缩放平移和 loading/error/empty。
  Idea/Proposal 两级展开；搜索会展开祖先，Enter/Shift+Enter 导航，Escape 清除，并用
  AbortController/generation 抑制迟到响应。SSE 刷新保留展开状态。
- 可见集与排序：
  [`visible-set`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/lib/resource-graph-visible-set.ts)、
  [`search`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/lib/resource-graph-search.ts)、
  [`tree-layout`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/lib/resource-graph-tree-layout.ts)
  分开维护可见集、pre-order 搜索顺序和第一父边主干，避免随机布局与交叉边改变阅读顺序。

## 编排实体与生命周期

来源：
[`schema.prisma`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/prisma/schema.prisma)、
[`idea.service.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/services/idea.service.ts)、
[`proposal.service.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/services/proposal.service.ts)、
[`task.service.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/services/task.service.ts)、
[`session.service.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/services/session.service.ts)、
[`agent.service.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/d590b568f40fae51f71c9800841c587a3fe94b0b/src/services/agent.service.ts)。

| Chorus 能力 | 已验证语义 | Tenon-native 映射 |
| --- | --- | --- |
| Idea | `open → elaborating → elaborated`；单父 lineage forest；可为 container | Change intent 与后续 Change lineage；本 PR 只映射 Change |
| Proposal | draft/pending/approved/rejected/revised；submit/approve/reject/revoke；approve 原子 materialize docs/tasks/deps | OpenSpec proposal/design/spec 与 exact-event review；本 PR 映射 document/review |
| Task | 有向依赖；open/assigned/in_progress/to_verify/done/closed 受控转换 | tasks.md 的 phase-owned task；本 PR 映射 task，不发明 task dependency |
| AcceptanceCriterion | 独立 dev/admin verify 状态 | 后续映射 Verify matrix 与 requirement/scenario |
| Agent | role/permission/persona/owner；AgentInstance 以 agent+host+cwd 持久身份 | 后续接 Host Target/runner identity；本 PR deferred |
| AgentSession | active/closed；task check-in/out；close 先批量 checkout | fresh terminal activity 只映射当前 session；历史生命周期 deferred |
| DaemonExecution | resource task/idea/proposal/document；queued/running/ended/interrupted，interrupted sticky | 后续接 AFK run/operation execution |
| DaemonSession/Turn | durable conversation；active/ended；turn pending/running/ended/interrupted；token rollup/transcript | 后续接 session memory/turn trace |
| Review | Chorus 无独立通用 Review model；Proposal review fields/lifecycle + AcceptanceCriterion verify | Tenon exact-event receipt 与三轨 review；本 PR映射已有 review result |

## Tenon 分阶段设计

### 本 PR：Graph foundation

- `tenon-orchestration-graph/v1` 严格只读节点/边协议、稳定 id/排序、coverage/deferred。
- 真实节点：workflow、change、phase、tasks.md task、governed document、canonical review result、
  fresh terminal session。
- 真实边：workflow governs change、change contains phase、frozen transitions、phase contains task、
  phase produces document、review reviews phase、session executes change。
- workflow definition drift 作为 workflow node 的诊断属性。
- Dashboard 确定性图、过滤、搜索、选择、详情、键盘、语义替代列表和双语完整状态。

### 后续 Phase 2：执行与复核图

- 接入 exact-event review receipt history、AFK operation/run、Host Target runner 与持久 session/turn；
  只在存在稳定公共 contract 后增加 agent/execution/turn node kinds。
- 将 requirement/scenario/verification report 映射为 acceptance/verification 节点。
- 加入服务端 cursor 和有界增量读取；仍保持只读。

### 后续 Phase 3：依赖与实时性

- 在 OpenSpec/Todo 具备 canonical dependency schema 后增加 task depends 边。
- 增加专属 graph fingerprint/SSE，保持选中和过滤状态，不把 mutable current workflow 混入
  canonical execution。

### 后续 Phase 4：受控写编排

- 仅在独立安全设计、confirm gate 和审计 receipt 完成后考虑从图发起 transition、review 或 task
  操作；不得复用本 PR 的 GET 权限隐式升级。

## 与其他固定上游的差异映射

发布前于 2026-07-30 再次读取 GitHub 一手 API；下列引用均为固定 commit/tag URL。
Change proposal 保留立项时的设计输入快照；本表是发布前刷新点。默认分支或 release 的前移没有
改变已批准的 Graph v1 需求或 Tenon-native 映射，因此不回写 proposal，也不把证据刷新伪装成
需求变更。

| 上游 | 默认分支固定点 | 稳定 release/tag 固定点 | Tenon 差异映射 |
| --- | --- | --- | --- |
| Trellis | [`main@c41c8bd7`](https://github.com/mindfold-ai/Trellis/commit/c41c8bd7cf51c81cba72cf8cb4c8837ce9783ce3) | GitHub latest Release API 为 404，回退最新语义版本 [`v0.6.10@c94d6fc2`](https://github.com/mindfold-ai/Trellis/releases/tag/v0.6.10) | per-task workflow selection 支撑 execution identity 与 current config 分离 |
| Comet | [`master@92d418eb`](https://github.com/rpamis/comet/commit/92d418eb93ce07c95b0855b2d36da4f6fdaea92d) | GitHub latest 是非 prerelease 标记的 [`0.4.0-beta.11`](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.11)；按严格 SemVer 稳定口径采用 [`0.3.9@053f76d8`](https://github.com/rpamis/comet/releases/tag/0.3.9) | 配置入口支撑把配置事实显式展示 |
| Chorus | [`main@d590b568`](https://github.com/Chorus-AIDLC/Chorus/commit/d590b568f40fae51f71c9800841c587a3fe94b0b) | [`v0.14.5@be647877`](https://github.com/Chorus-AIDLC/Chorus/releases/tag/v0.14.5) | Resource Graph、Dashboard 交互与编排生命周期是本切片的主要设计依据 |
| Maestro | [`master@52a4778c`](https://github.com/catlog22/maestro-flow/commit/52a4778c042da72608ccf0f633f0266b3b0d89dc) | [`v0.5.59@ef797e7a`](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.59) | mutable command refresh 与 run evidence 分离 |
| claude-tap | [`main@6cfe45af`](https://github.com/liaohch3/claude-tap/commit/6cfe45afd7b6d009e839b178dd59b9e338b10309) | [`v0.1.141@547925c9`](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.141) | 异步 viewer 验收必须等真实内容 ready，不能只看 DOM 容器存在 |
