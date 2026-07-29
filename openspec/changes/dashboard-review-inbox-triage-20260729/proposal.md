# 提案：Dashboard Progress 待复核桌面分诊

## Why

Dashboard 的待复核判定已汇入 Progress，但状态页签目前只把不匹配任务降到 30% 透明度，仍允许
键盘聚焦和打开抽屉。视觉筛选、鼠标行为与辅助技术因此给出不同结果，降低了多 Change 并行时的
分诊可信度。

## What Changes

- 以 Progress 状态筛选和画布任务卡为唯一产品范围，改善 1024–1920px 分诊反馈。
- 让非匹配任务只保留 Workflow 视觉上下文，不再进入键盘、鼠标或屏幕阅读器交互。
- 为 tablist 增加 roving tabindex 与 Arrow/Home/End 键盘模型，并显示筛选结果摘要。
- 保持既有 API、数据模型与本地安全边界，复用现有主题 token、Lucide、Radix、Tailwind 与动效基础设施。
- 同步维护中英文可见文本，并覆盖 loading、error、empty、disabled、键盘与 reduced-motion 路径。
- 不设计、截图或验收手机布局；仅避免破坏既有小屏契约。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `dashboard-ui-ux-system`：补充 Progress 筛选一致性、键盘 tablist 与状态反馈要求。

## Impact

预计只影响 `packages/dashboard-app/src/progress/`、其相邻测试与
`packages/dashboard-app/src/i18n/translations.ts`。`inbox/inbox.ts` 继续只提供既有同源判定，不恢复
独立 Inbox 视图。不会新增依赖、修改服务端/API 契约、访问真实用户数据或改变生产状态。
