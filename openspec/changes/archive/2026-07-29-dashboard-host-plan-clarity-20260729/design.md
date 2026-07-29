# 设计：Host Plan 桌面信息清晰度

## Explore 结论

- 保留现有 master-detail 架构和 `HostTargetPlanView → HostOperationPlanPanel → HostPlanPreview` 组件边界。
- 目录从重复 capability 的大卡片收敛为紧凑选择行；名称、CLI flag、kind 与 scope 始终可见。
- capabilities 移到已选宿主详情，在选择操作前完整展示。
- 不改协议层、不引入依赖、筛选状态、全局 token 或新动画。
- 视觉方向延续安静的本地运维控制台；状态色只表达状态，交互强调使用既有 accent。

## 风险

- 过度压缩宿主卡片可能降低长能力标签的可读性。
- 调整计划预览层级可能影响键盘焦点顺序或屏幕阅读器播报。
- 开放 PR #14 改动全局 token，后续合并时可能造成视觉差异但不应形成源文件冲突。

## 待验证问题

- Verify 必须测量 1024、1200、1440、1920px 的同屏可见宿主数、横向溢出和详情重叠。
- Verify 必须覆盖 loading、error、empty、ready、复制反馈、light/dark/system、键盘和 reduced-motion。
- 若 capabilities 移入详情后在选择操作前不可见，则实现不符合本设计。
