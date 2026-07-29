# 提案

## Why

Tenon 的本地 Trace 诊断已经能提供可信的会话与请求元数据，但现有桌面呈现把会话列表、摘要和时间线纵向堆叠在折叠区内。用户排查一次 Agent 调用时，需要频繁滚动并重新建立“当前会话—请求—关键异常”的上下文。需要为 1024–1920px 桌面诊断场景建立更清晰的工作区层级。

## What Changes

- 为 Machine → Traffic 诊断建立桌面端会话 rail + timeline detail 主从工作区。
- 会话 rail 补足可辨识的 session id、proxy mode 与更新时间；详情区固定显示会话身份、摘要、完整性、筛选与请求序列。
- 把逐条卡片时间线收紧为同一容器内的高密度分隔行，并保留错误状态的文字语义。
- 保留既有本地 metadata-only 数据、筛选、错误恢复与键盘语义。
- 参考 Chorus 的高密度连接/活动信息架构，但使用 Tenon 自有设计 token、排版和状态语言。
- 不修改 Trace API、捕获安全边界、手机端布局或其他 Dashboard 功能域。

## Capabilities

### New Capabilities

无。本批次是既有 `trace-timeline` Dashboard 能力的桌面信息架构增强。

### Modified Capabilities

- `trace-timeline`：增加 1024–1920px 桌面主从工作区、会话身份层级和稳定 detail 占位要求。

## Impact

影响 `packages/dashboard-app/src/advanced/TrafficPanel.tsx`、对应测试与中英文文案，以及构建后的 Dashboard 静态产物。保持现有 React/Tailwind 技术栈，不新增依赖，不改变 Machine 容器、server、tap、Trace 响应或安全契约。
