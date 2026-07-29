# ADR：共享 ledger Context Bundle 编译服务

- 状态：Accepted
- 日期：2026-07-28
- Change：`context-bundle-budget-preview`

## 背景

Tenon 已有可信的 `context-bundle/v1` 编译器和 CLI 私有的 ledger→bundle 组装，但 Dashboard
无法预检目标阶段的输入、物化模式和预算。若 server 复制 CLI 逻辑，会让 policy、文档原因、模式
和错误语义分叉。Tre&#108;lis v0.6.9 的跨平台跟进修复提供了直接证据：预算规则分散在入口会发生漂移。

## 决策

把 ledger 读取、policy 选取、digest 校验、物化与预算编排提取到 kernel 共享应用服务。

- CLI 继续输出完整 `ContextBundleV1`，保持既有格式和默认预算。
- server 复用同一服务，但仅映射不含正文的 preview DTO。
- server 仅在 registered root anchor 暴露可遍历目录 fd 时读取 Change；否则返回稳定 501
  capability error。Darwin/Node 的 pathname swap-back 窗口不纳入成功实现。
- 共享层定义 typed domain errors；server 映射 400/409/413/422，平台 capability failure 映射 501。
- 预算失败返回 `422 + safe preview metadata`，不返回 aggregate digest 或可消费 bundle。
- Dashboard 的 target 与 budget 是一次性 UI state，不持久化。

## 备选方案

1. server 调 CLI 子进程：拒绝，因为 cwd/root 边界隐式、错误文本不稳定且有额外进程开销。
2. server 复制 CLI 编排：拒绝，因为必然形成两套 policy 和错误语义。
3. 只增加 CLI 文档：拒绝，因为不能形成用户要求的 Dashboard 前后端闭环。

## 后果

- 正面：CLI/API 共享单一规则源；用户可在 handoff 前解释并修复预算或 ledger 故障；浏览器不接触
  文档正文。
- 成本：kernel 增加一个应用服务与错误分类；server 和前端增加只读契约及测试。
- 兼容：不修改 `context-bundle/v1`、CLI 默认预算、ledger schema 或磁盘状态。
- 可用性：Linux runtime 提供完整预览；缺少 fd-relative traversal 的 runtime 显式 fail closed，
  CLI handoff 不受影响。
- 回滚：移除 Dashboard 组件、API handler 与共享预览统计；CLI 可继续调用共享服务，或在不改变
  输出的前提下恢复原适配。无需数据迁移。
