# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Onboarding 命令复制结果必须诚实且可恢复

Onboarding MUST 为每一条终端命令独立呈现 `idle`、`pending`、`success` 和 `error`
复制状态。应用 MUST 以真实 `Clipboard.writeText` 的结果决定成功或失败；Clipboard API
缺失、同步抛错和异步拒绝 MUST 统一进入错误状态，不得静默失败、伪造成功或产生未处理的
Promise rejection。失败状态 MUST 保留完整且可选择的命令，并以中英文可见文字说明用户可
手动复制。

#### Scenario: 键盘复制成功

- **WHEN** 电脑端键盘用户聚焦某条命令的复制按钮并按 Enter，且剪贴板写入成功
- **THEN** 该行立即呈现 pending 并禁用按钮，完成后呈现可见且 polite 宣读的成功状态
- **AND** 焦点保持在原按钮，另一条命令的状态不改变
- **AND** 成功状态约 2 秒后回到 idle

#### Scenario: 剪贴板能力缺失或拒绝

- **WHEN** Clipboard API 缺失、同步抛错或异步拒绝写入
- **THEN** 该行呈现带文字和非颜色线索的错误状态，并约 4 秒后回到 idle
- **AND** 错误文案只描述浏览器复制未完成及手动恢复，不暗示 Tenon、项目或服务器失败
- **AND** 完整命令保持可见、可选择且未被应用自动重试

#### Scenario: pending 防止重复提交

- **WHEN** 某条命令的剪贴板 Promise 尚未完成
- **THEN** 该行复制按钮以 `aria-disabled=true` 表达不可用，状态机不能发起第二次写入
- **AND** 键盘焦点保持在原按钮，不因原生 disabled 行为丢失
- **AND** pending 状态通过当前语言的可见文案表达，不只依赖旋转或颜色

#### Scenario: 迟到结果不污染当前界面

- **WHEN** 组件在剪贴板 Promise 完成前卸载，或旧操作已被新的有效 generation 取代
- **THEN** 迟到的 resolve 或 reject 不再更新界面或创建重置计时器
- **AND** 已存在的成功或失败重置计时器在卸载与新操作开始时被清理

### Requirement: Onboarding 桌面步骤层级

Onboarding MUST 在 1024–1920px 电脑端把初始化与诊断命令呈现为有序、可扫描的步骤卡片。
1024px 视口 MUST 保持单列顺序；1200px、1440px 和 1920px 视口 SHOULD 使用两列步骤布局。
布局 MUST 使用既有主题 token，并 MUST NOT 制造根级水平溢出或改变既有小于 1024px 契约。

#### Scenario: 最小电脑端视口

- **WHEN** 用户在 1024×768 打开无项目的 Dashboard
- **THEN** 两个步骤按初始化后诊断的顺序单列呈现，命令与反馈均完整可操作
- **AND** 文档根节点没有水平溢出

#### Scenario: 宽电脑端视口

- **WHEN** 用户在 1200×870、1440×900 或 1920×1080 打开无项目的 Dashboard
- **THEN** 两个步骤以等宽双列呈现，并保持标题、说明、命令与反馈的统一层级
- **AND** Light、Dark 与 System 主题中的边界、文字、成功、错误和 focus ring 保持同一语义

#### Scenario: reduced motion

- **WHEN** `prefers-reduced-motion: reduce` 生效
- **THEN** Onboarding 复制状态仍提供完整文字、图标和语义 role
- **AND** 控件过渡被取消，复制状态时序与可操作性不受影响
