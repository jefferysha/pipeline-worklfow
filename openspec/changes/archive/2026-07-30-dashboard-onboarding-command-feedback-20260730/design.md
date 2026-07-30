# 设计

## 初始假设

- 已验证：把复制反馈保留在单条命令行内部，可复用 Host Plan 的本地错误收敛模式，避免引入跨组件或全局状态。
- 已验证：失败时使用可见的就地状态并保留可选择命令，比自动重试或浏览器权限预检更诚实、可恢复。
- 已验证：桌面两步教学可在 1024px 保持单列、1100px 以上改为两列，不改变既有小屏单列契约。

## 风险

- 剪贴板 API 的同步缺失与异步拒绝需要统一处理，不能产生未捕获 Promise rejection。
- 成功/失败计时器与组件卸载必须正确清理，避免陈旧反馈或测试泄漏。
- 可见反馈不能只依赖颜色，且应被屏幕阅读器按实际状态宣读。

## 待验证问题

- Spec 固化 pending/success/error 的文案、持续时间与迟到 Promise 行为。
- Build 后复核明暗/system 主题下 success/error token 对比度与两列断点。
- Verify 复核键盘复制、焦点保持、API 缺失/拒绝与 reduced-motion 终态。

## Explore 决策

- 采用 `CmdRow` 局部 `idle → pending → success | error → idle` 状态机。
- 不新增 clipboard 依赖、Permissions API、自动重试或共享抽象。
- error 必须保留命令并明确手动恢复；不得把浏览器能力错误描述为 Tenon/服务器错误。
- 详细设计与覆盖矩阵见 `docs/superpowers/specs/2026-07-30-dashboard-onboarding-command-feedback-design.md`。
