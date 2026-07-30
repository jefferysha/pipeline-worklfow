# 提案

## Why

Tenon Dashboard 能展示单个 Change 的阶段与任务，却不能回答“这个 Change 由什么 workflow
治理、阶段如何连接、哪些文档与复核支撑当前状态、活跃会话在哪里”。用户必须在多个卡片、
文件与 CLI 输出之间手工拼接编排关系，定义漂移也容易被误解为执行真相改变。

Chorus 的 Resource Graph 证明：把业务实体和有类型的边统一投影，再提供过滤、选择和详情，能显著
降低编排理解成本。但 Chorus 的 Idea/Proposal/Task/Document 图、Agent/Session 执行域和 Proposal
Review 生命周期并不是同一个数据模型，不能直接复制或假装 Tenon 已拥有等价实体。

## What Changes

- 新增只读 `GET /api/orchestration-graph`，从同一次受信任的 Change snapshot 投影 workflow、
  change、phase、task、document、review 与活跃 session 节点，以及确定性的有类型边。
- 把 frozen/current workflow definition 的 `current | changed | missing | invalid | unavailable`
  比较作为 workflow 节点诊断属性；它不再是本轮全部功能，也不改变冻结执行计划。
- 在 Change 详情中增加桌面 Orchestration Graph：类型过滤、标题搜索、节点选择、节点/边详情、
  Arrow/Home/End/Enter/Escape 键盘路径，以及同步的可访问节点/边列表。
- 提供中英文 loading、error/retry、真实空态、过滤空态、旧 Server unavailable 与部分覆盖说明。
- 固定 Chorus 全能力映射和后续阶段：本 PR 建立 graph foundation；Agent durable identity、
  历史 session/turn、验收准则、可写编排与实时事件刷新不伪装为已实现。
- 不照搬 Chorus 代码，不增加 Dashboard 写权限，不改变 canonical state、transition authority、
  document/review receipts 或 persistence。

## Capabilities

### New Capabilities

- `orchestration-graph`
- `frozen-workflow-definition-status`：新增严格比较器和安全读取，并将其消费面并入 graph
  workflow node。

## Impact

影响 server 的只读图投影与 GET 路由、Dashboard strict client/图组件/Change 详情、中英文资源和
相邻测试。新增协议是独立 v1 端点，不修改 snapshot v2、transition API、持久化 schema 或依赖。

## Upstream Evidence

- Trellis `main` `c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c`；latest Release API
  返回 404，稳定版本回退到语义 tag
  [`v0.6.10`](https://github.com/mindfold-ai/Trellis/tree/v0.6.10)。
- Comet `master` `92d418eb93ce07c95b0855b2d36da4f6fdaea92d`，稳定
  [`0.3.9`](https://github.com/rpamis/comet/releases/tag/0.3.9)。
- Chorus `main` `d590b568f40fae51f71c9800841c587a3fe94b0b`，稳定
  [`v0.14.5`](https://github.com/Chorus-AIDLC/Chorus/releases/tag/v0.14.5)；本轮逐文件读取
  resource graph、Idea/Proposal/Task、Agent/Session/Execution 与 review 生命周期。
- Maestro Flow `master` `5375fb589f182c1c7e9cade69b4acd3ccd03bac1`，稳定
  [`v0.5.58`](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.58)。
- claude-tap `main` `6cfe45afd7b6d009e839b178dd59b9e338b10309`，稳定
  [`v0.1.141`](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.141)。

完整源码 URL、实体/边/生命周期和 Tenon 分阶段映射见
`docs/superpowers/specs/2026-07-30-chorus-orchestration-graph-research.md`。
