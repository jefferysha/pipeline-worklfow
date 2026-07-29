# ADR：将经验证的文档回执投影到 Dashboard

## 背景

文档契约阻止推进时，Dashboard 只给出状态和路径，无法解释当前 digest 是由哪个技能登记、何时登记、何时被当前 step 读取。

## 决策

在 `DocumentEvidenceItem` 聚合层计算最小时间线字段，并经既有 `/api/snapshot` 契约投影给 Dashboard。只选择匹配当前 digest 与 current visit 的读取回执；旧回执不会显示为当前证据。

## 备选方案

1. 新增 ledger-detail API：增加 handler、认证和刷新分支，超过最小功能范围。
2. 前端直接读取 Change 文件：破坏 server/root 信任锚和本机鉴权边界。
3. 只显示 server 时间：不能解释 producer 或读取回执，无法解决排障问题。

## 后果

Server 与前端镜像 DTO 需同步并补 decoder、snapshot 和组件测试。字段为可选 additive，旧 server 可安全降级；撤回时可停止渲染新字段，不需要数据迁移。
