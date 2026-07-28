# 任务

## 立项

- [x] 立住结构化验证证据编排的目标、非目标与初始跨端边界。
- [x] 登记 proposal、design、tasks 的 OpenSpec producer 证据。

## 调研

- [x] 固定 上游 A 与 上游 B 默认分支、稳定版本和一手源码证据。
- [x] 对照 Tenon 当前 kernel/server/dashboard 实现，完成方案比较、风险与 ADR。 (explore)

## 规格

- [x] 定义验证证据输入、输出、错误、加载/空态/失败态、i18n 和兼容要求。
- [x] 形成 delta spec 与可执行实现计划。 (spec)

## 实现

- [x] TDD 实现独立 kernel draft validator/formatter、确定性双语 Markdown 与完整预算/注入边界。
- [x] 接入受现有 POST/root 守卫保护的无状态 compose route，并以真 HTTP 覆盖成功和安全/错误路径。
- [x] 实现 Dashboard API decoder/client 与 Verify-only accessible composer，覆盖空/加载/错误/成功/复制路径。
- [x] 补齐中英文 i18n、组件/API/kernel/server 回归测试并保持生产模块大小约束。 (build)

## 验证

- [x] 运行定向、前端、全仓、构建与分发门禁，并完成真实 Dashboard 浏览器验收。 (verify)

## 交付

- [ ] 应用 OpenSpec delta，提交、推送并创建包含来源映射与验证证据的 PR。 (ship)

## 归档

- [ ] 回读全部治理文档并归档 Change，记录最终状态。 (archive)
