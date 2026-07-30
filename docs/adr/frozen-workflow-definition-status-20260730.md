# ADR：以只读 Graph Foundation 承载 Tenon 编排能力

## 背景

需求从单一 workflow definition drift 状态扩大为借鉴 Chorus graph 与编排能力。Chorus 的资源图、
Agent/Session、Proposal review 是多个独立模型；Tenon 也只有部分等价的权威数据。一次 PR 若直接
创造所有实体会产生假数据和错误权限。

## 决策

保留当前 Change，但通过 canonical `requirements-changed` 从 Build 回退 Spec。新增独立只读
`tenon-orchestration-graph/v1`，只从现有 Change snapshot 和安全 current workflow 比较投影
workflow/change/phase/task/document/review/session。Dashboard 提供确定性图、过滤/搜索/选择/详情、
键盘与语义替代列表。Agent、历史 Session/Turn、AcceptanceCriterion、依赖和写编排列为明确后续阶段。
原 workflow definition status 作为 workflow node 诊断，不影响 frozen execution/readiness。

第一轮 Verify 进一步决定：单 Change 图端点不得复用会扫描所有 root/Change 并可能 repair projection
的 `buildSnapshot()`；改为只读目标 Change。协议为 endpoint unavailable、scope invalid、
Change missing/corrupt 提供稳定 error code；transition id 纳入 event；合法空 phase label 回退 id。
Dashboard 必须显示有向边、相邻边与闭集双语值，并用高对比、非颜色提示表达 focus/selection/filter。
`frozen-workflow-definition-status` 在 canonical specs 中尚不存在，因此本 Change 的 delta 是
`ADDED Requirements`，不是 `MODIFIED Requirements`。

## 备选方案

- 继续交付窄 drift 卡片：拒绝，无法满足新的编排理解目标。
- 一次性复制 Chorus 全模型：拒绝，Tenon 没有同构 persistence/权限/生命周期，会制造虚假能力。
- 扩展 snapshot v2：拒绝，破坏既有公共协议并把 current workflow 错误耦合进全局 snapshot。
- Canvas-only：拒绝，无法提供等价键盘/屏幕阅读器路径。

## 后果

- 正面：本 PR 是真实全栈 foundation，后续可添加 node/edge kind 而不改变执行权威。
- 正面：用户立即获得跨 workflow/phase/task/document/review/session 的统一视图。
- 成本：独立 API/decoder/布局/交互与更多验证面。
- 限制：本轮不是 Chorus 全功能迁移；coverage 明示 deferred。
- 回滚：revert 代码与文档即可，无数据迁移。
