# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Dashboard 语言切换 SHALL 保持产品文案一致

Dashboard 在用户选择中文或英文后，当前页面的产品文案、tooltip、状态说明、表单标签与可访问名称
SHALL 使用同一当前语言。技术协议 token、代码标识、用户输入、项目名、Change 名、Workflow id 和
Skill id MAY 保持原值；产品自身硬编码的另一语言文案不得借此例外保留。缺失翻译 key SHALL 由测试
和开发诊断暴露，不得静默回退为另一受支持语言的产品文案。

#### Scenario: English Workbench 完整呈现

- **WHEN** 用户在 Workbench 将语言切换为 English
- **THEN** 页面标题、Workflow 操作、track、阶段、Hook、运行事实、状态和可访问名称均使用英文
- **AND** 可见或仅供屏幕阅读器使用的产品文案不包含硬编码中文
- **AND** 项目名、Workflow id、Skill id 与事件 token 保持原始技术值

#### Scenario: 运行时切换语言

- **WHEN** Workbench 已显示正常、空、加载、错误、禁用或确认状态，用户切换语言
- **THEN** 当前状态无需重新载入页面即可使用新语言
- **AND** 未完成的表单数据、当前阶段、对话框和焦点位置保持不变

#### Scenario: 新增字面量翻译 key

- **WHEN** Dashboard 源码新增 `t('...')` 字面量调用
- **THEN** i18n 测试验证中文和英文资源都存在该 key
- **AND** 任一语言缺失时测试失败而不是在 UI 中显示 key 或另一语言文案

### Requirement: Governance 升档确认 SHALL 抵抗逻辑等价快照刷新

Governance 升档确认 SHALL 绑定到稳定 Loop identity、目标级别和影响决策的事实，而不是绑定到
React row 对象引用。轮询或重取返回逻辑等价的新对象时，已打开的确认 SHALL 保持；root、Loop、
当前 autonomy、可选目标或阻断事实变化使旧决策失效时，确认 SHALL 关闭。取消、Escape 和失效关闭
SHALL 遵守既有焦点恢复语义。

#### Scenario: 等价 row 对象刷新

- **GIVEN** 用户已为同一 Loop 打开从当前级别到目标级别的升档确认
- **WHEN** Dashboard 收到一个对象 identity 不同但决策事实完全相同的 row 快照
- **THEN** 确认对话框保持打开
- **AND** 确认目标与说明保持不变

#### Scenario: 决策相关事实变化

- **GIVEN** 升档确认已打开
- **WHEN** root、Loop identity、当前 autonomy、可选目标或阻断事实发生变化
- **THEN** 旧确认关闭且不能提交
- **AND** 焦点返回对应的 Governance 升档入口或安全的相邻控制

#### Scenario: 用户取消确认

- **WHEN** 用户按 Escape 或激活取消动作
- **THEN** 确认关闭且不发送升档请求
- **AND** 焦点返回打开该确认的控制
