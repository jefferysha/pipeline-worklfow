# 提案

## Why

桌面 Dashboard 的 Onboarding 已提供真实终端命令与复制成功提示，但剪贴板不可用或写入被拒绝时会静默失败。首次使用者无法判断命令是否已复制，也缺少清晰的失败恢复路径，因此容易在“去终端完成初始化”的关键入口停住。

Explore 的真实 production 基线确认四个桌面视口均无水平溢出、主题与 reduced-motion 正常；缺口集中在 Clipboard API 缺失/拒绝后的零反馈，而不是项目注册、服务器或布局可达性。

## What Changes

- 在 1024–1920px 的 Onboarding 教学卡中建立更清晰的命令、反馈和下一步层级。
- 为每条复制动作补齐独立的进行中、成功与失败反馈，并提供不依赖剪贴板的诚实恢复提示。
- 同步中英文、键盘/焦点、明暗/system 主题与 reduced-motion 验证。
- 非目标：手机端重新布局、API/状态模型变化、项目注册或安装自动化、依赖升级。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

`dashboard-ui-ux-system`：补充桌面 Onboarding 命令复制反馈与失败恢复要求。

## Impact

范围限定在 `packages/dashboard-app/src/shell/Onboarding.tsx`、相邻测试、中英文 i18n、必要的 production dist 与治理文档。复用现有 React、Tailwind、Lucide、主题 token 和 motion 契约；不修改 API、共享数据契约、依赖、安全边界或生产部署。
