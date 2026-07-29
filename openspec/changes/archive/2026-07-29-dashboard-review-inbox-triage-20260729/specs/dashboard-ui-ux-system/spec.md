# Dashboard UI/UX System 增量规格

## ADDED Requirements

### Requirement: Progress 状态筛选交互一致性

Progress 的状态筛选 MUST 让视觉、指针、键盘与辅助技术得到同一个可交互任务集合，同时 MUST
保留 Workflow 阶段上下文。非 `all` 筛选下，不匹配任务 MAY 以弱化视觉保留原阶段位置，但 MUST
不可点击、不可聚焦且 MUST NOT 进入无障碍树。状态 tablist MUST 使用 roving tabindex，并 MUST
支持 `ArrowLeft`、`ArrowRight`、`Home` 与 `End`。筛选结果 MUST 以当前语言提供可见、polite 的
匹配数与上下文数反馈。

#### Scenario: 聚焦待复核任务

- **WHEN** 1024–1920px 电脑端用户选择“等你动手”，且 1 个任务匹配、3 个任务不匹配
- **THEN** 匹配任务保持可点击并可打开详情
- **AND** 3 个不匹配任务仅以弱化视觉保留 Workflow 阶段位置
- **AND** 不匹配任务不可点击、不可聚焦且不进入无障碍树
- **AND** 页面显示“1 个匹配 / 3 个上下文任务”的当前语言反馈

#### Scenario: 键盘切换状态

- **WHEN** 键盘用户聚焦当前状态 tab 并按 `ArrowRight`、`ArrowLeft`、`Home` 或 `End`
- **THEN** 焦点与选中状态按四个状态 tab 循环或跳转
- **AND** tablist 中只有当前 tab 处于普通 Tab 顺序
- **AND** 切换不会打开任务、改写 Snapshot 或触发服务端动作

#### Scenario: 筛选零结果

- **WHEN** 用户选择计数为 0 的状态
- **THEN** Workflow 画布仍可作为只读阶段上下文理解
- **AND** 所有不匹配任务不可交互
- **AND** polite 状态反馈明确报告 0 个匹配任务而非伪装为空白或加载

#### Scenario: reduced-motion 与主题

- **WHEN** Light、Dark 或 System 主题下启用 `prefers-reduced-motion: reduce` 并切换状态 tab
- **THEN** tab 墨线直接落到选中终态且筛选反馈仍通过文字、形态和计数表达
- **AND** 不新增循环、位移或依赖颜色单独表达的动效
