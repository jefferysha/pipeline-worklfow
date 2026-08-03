# Dashboard UI/UX System 增量规格

## ADDED Requirements

### Requirement: Context Bundle SHALL 提供电脑端容量层级

Progress 详情抽屉中的 Context Bundle 预览 MUST 在 1024–1920px 电脑端以
“目标与预算控制 → 容量结论 → 输入文档或恢复状态”的顺序呈现。容量结论 MUST 使用现有
semantic token、文字、精确数字和非颜色线索；文档行 MUST 保持 path 的主要层级，并让 kind、
mode、reason 与 byte metadata 可扫描但不争夺焦点。

容量变化 MAY 使用 120–280ms 的短 CSS transition 表达反馈，但 MUST NOT 使用循环、弹跳或纯装饰
动画；reduced-motion MUST 直接呈现终态。实现 MUST 使用 Lucide 作为图标形状源，装饰图标 MUST
退出无障碍树。该要求不新增或修改手机端产品行为。

#### Scenario: 1024px 最小电脑端宽度

- **WHEN** 用户在 1024×768 打开包含成功预览的 Progress 详情抽屉
- **THEN** 控制、容量摘要和文档行均可操作且无根级水平溢出
- **AND** 长 path 换行或截断策略不会遮挡 kind、mode 与 byte metadata。

#### Scenario: 电脑端主题与信息层级

- **WHEN** 用户在 1200×870、1440×900 或 1920×1080 使用 Light、Dark 或 System 主题
- **THEN** 容量、warning、danger、focus 和表面角色保持一致语义
- **AND** 用户无需仅凭颜色即可区分 success、budget-error 与其他 error。

#### Scenario: 键盘与 reduced motion

- **WHEN** 用户只使用键盘操作 target、budget 和 submit
- **THEN** focus 顺序与视觉阅读顺序一致且焦点环不被裁切
- **WHEN** 用户请求 reduced motion
- **THEN** 容量与 loading 反馈直接处于最终状态并保留全部文字和语义。
