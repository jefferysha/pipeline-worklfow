# ADR：Onboarding 复制反馈保持功能域局部

## 背景

Onboarding 的每条终端命令目前只处理复制成功；Clipboard API 缺失、同步抛错或异步拒绝均没有反馈。仓库内 Host Plan 已有局部 `idle/success/error` 模式，而多个其他复制入口仍各自实现。

## 决策

本批次在 `shell/Onboarding` 内实现四态命令复制状态机，并把写入函数作为 Onboarding 的可选测试边界传入。暂不抽取共享 hook 或组件。复制失败保留命令、显示可见且可宣读的恢复说明；不做权限探测、自动重试或服务器调用。

## 备选方案

- 抽取共享 clipboard hook：能覆盖更多入口，但当前会扩大跨域与开放 PR 重叠，且缺少两个稳定迁移使用方。
- Permissions API 预检：支持不一致，不能替代真实写入结果。
- 只添加 `.catch()`：避免未捕获 rejection，却仍无法提供进行中、禁用、恢复与迟到结果隔离。

## 后果

- Onboarding 获得完整、可测试的局部生命周期，变更范围保持可审查。
- 其他复制入口不会在本批次顺带重构；后续出现第二个稳定使用方时，可基于这次明确契约再上移 shared。
- UI 只依赖既有主题 token、Lucide 与 React，不新增依赖或 API。
