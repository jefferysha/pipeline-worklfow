# 任务

## 立项

- [x] 建立独立 Change、分支与 worktree，并记录桌面项目聚焦问题、边界和待验证假设。

## 调研

- [x] 审计 ProjectsView 实现、相邻测试、i18n、主题 token 与真实 1024–1920px 浏览器基线，形成设计与 ADR。 (explore)

## 规格

- [x] 固化桌面检索、状态聚焦、键盘、空结果、动效和兼容性场景，并形成实现计划。 (spec)

## 实现

- [x] 以测试先行方式实现 basename/root 查询、四态谓词、全局计数与结果派生模型。 (build)
- [x] 实现 Projects 聚焦工具栏、roving 状态按钮组、live summary、Escape 与清除后焦点恢复。 (build)
- [x] 接入既有 Projects 分区和不可达只读行，补齐零结果、中英文与 1024px 桌面布局。 (build)
- [x] 运行定向 Vitest、前端类型检查、全量测试与生产构建，修复实现阶段发现的问题。 (build)
- [x] 以测试先行收敛 rows 预排序、确定性大小写、当前状态 live summary 与缺失组合回归。 (build)
- [x] 把互斥状态选择器实现为 `radiogroup/radio`，保留 roving 键盘与既有视觉层级。 (build)
- [x] 重建 dist，重跑全量验证并采集新冻结语义证据。 (build)

## 验证

- [ ] 冻结 build SHA，完成代码审查与 OpenSpec strict 校验。 (verify)
- [ ] 在 1024×768、1200×870、1440×900、1920×1080 的真实 Dashboard 复核明暗/system 主题、键盘、成功/零结果/不可达/离线反馈和 reduced-motion。 (verify)
- [ ] 记录测试、浏览器身份、兼容性、风险和回滚证据，并取得 verify-pass exact-event review。 (verify)

## 交付

- [ ] 提交、push、创建非草稿 PR，记录设计、测试、浏览器、风险和回滚，并等待 CI 终态。 (ship)

## 归档

- [ ] 应用 OpenSpec、完成 Tenon Archive、push 归档提交并复核 PR/CI。 (archive)
