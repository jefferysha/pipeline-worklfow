# ADR: PR #5 合并审计修复边界

- Status: Accepted
- Date: 2026-07-28
- Change: `pr-5-merge-audit`

## Context

PR #5 已有归档的功能 Change，但合并自动化需要基于最新 `main` 独立复核。审查与首次冻结验证
发现实现、文档和中等宽度阶段发现性偏差，同时确认公共 API、数据、依赖和原产品需求语义没有变化。

## Decision

保留既有 `dashboard-ui-ux-system` 需求，只进行合规修复：

- 使用互补 custom variant：`mobile` 覆盖 `<=720px`，`desktop` 从浏览器可稳定区分的
  `>=720.02px` 开始；统一替换 Dashboard 中旧写法，并用 720/721px 生产 CSS 与浏览器证据约束。
- 在 1024px Workbench 阶段带上提供可见滚动提示，并通过 `aria-describedby` 与横向滚动容器关联，
  让视口外的 Ship/Archive 阶段可发现。
- 补齐加载态 i18n，修正关闭动画缓动，刷新过时截图和 Markdown 空白。
- 全局 `svg.lucide` 规则提供 1.75 默认线宽；既有显式 `strokeWidth={1.75}` 只作为同值稳定声明，
  不构成第二套视觉规则。
- 修复作为独立提交更新原 PR head；不强推，不新增依赖，不改变公共契约。

## Consequences

- 精确 720px 不再出现 shell 与内容断点不一致。
- 1024px 下阶段带仍可横向滚动，但用户不再需要猜测是否存在视口外阶段。
- i18n、motion 和文档与既有规范重新一致。
- 替换 class 名会产生机械 diff，但它消除了全应用同一断点的语义分裂；构建 CSS 与浏览器临界宽度验收共同约束行为。
- 基线 Vite/esbuild 审计项不在无依赖变更的 UI PR 中跨主版本处理，作为已知基线风险保留。
