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
- **AND** Loop snapshot 不因 locale 变化隐式重新请求，未保存的 allowlist、denylist 与 cadence 草稿保持不变
- **AND** 已存在的加载错误按新语言重新呈现或被安全清除，不显示旧 locale 的产品文案

#### Scenario: Progress 状态筛选切换语言

- **GIVEN** 用户已选择一个 Progress 状态 tab，且画布保留当前 Workflow 的上下文卡片
- **WHEN** 用户切换 Dashboard 语言
- **THEN** tab 选择、画布上下文和非匹配卡片的禁用状态保持不变且不触发数据重取
- **AND** 可见筛选摘要与 tab 可访问名称使用新的当前语言
- **AND** 摘要按当前 Workflow 计数，状态 badge 继续显示全局计数

#### Scenario: 新增字面量翻译 key

- **WHEN** Dashboard 源码新增 `t('...')` 字面量调用
- **THEN** i18n 测试验证中文和英文资源都存在该 key
- **AND** 任一语言缺失时测试失败而不是在 UI 中显示 key 或另一语言文案

#### Scenario: English 错误状态隐藏非当前语言 detail

- **GIVEN** Dashboard 当前语言为 English
- **WHEN** Machine、Project Registration、Create Change、AFK、Progress 或其他视图收到 network、HTTP、invalid-response 或 server-authored 中文错误
- **THEN** 用户看到按稳定错误事实选择的英文恢复文案
- **AND** 非英文 server detail 与 client fallback 不直接显示
- **AND** production TSX 不直接把 `Error.message` 作为产品文案输出

#### Scenario: 中文错误状态的安全细节

- **GIVEN** Dashboard 当前语言为中文
- **WHEN** 一个允许暴露服务端细节的错误到达渲染边界
- **THEN** 视图通过统一格式化策略呈现本地化恢复文案和安全细节
- **AND** 错误 state 保留结构化原始值，不把旧语言的格式化字符串跨语言保存

#### Scenario: 在途请求期间切换语言

- **GIVEN** Dashboard 的异步读取、写入或证据生成请求仍在进行
- **WHEN** 用户切换语言后旧 locale 的请求成功或失败
- **THEN** 结果只按当前 locale 呈现，或被安全失效而不覆盖当前状态
- **AND** 未提交的表单与编辑草稿保持
- **AND** 旧 locale 的 toast、error、Markdown 或服务端 prose 不在新语言界面迟到落态

#### Scenario: English 创建或复制 default Workflow

- **WHEN** 用户在 English 界面从系统 default 创建或复制可编辑 Workflow
- **THEN** 新 Workflow 的 canonical 阶段标签与随后渲染使用英文
- **AND** 不持久化中文系统标签
- **AND** 已有用户自定义 Workflow label 保持原值，不被系统自动翻译

#### Scenario: 已到达响应的格式无效

- **WHEN** Dashboard 收到 200 响应但 JSON 或 schema 无效
- **THEN** UI 显示当前语言的 invalid-response 恢复文案
- **AND** 不把它报告为网络错误
- **AND** HTTP 非 2xx、网络不可达与未选择项目分别保持自身稳定事实

### Requirement: Dashboard 项目级危险动作 SHALL 绑定精确上下文

Dashboard 的真实运行、L3、apply、triage、retry、Workflow 删除/创建/保存及其他项目级 mutation
SHALL 将确认和在途操作绑定到 exact root、目标 entity 与唯一 operation token。root、目标或操作
identity 任一变化时，旧确认 SHALL 立即失效；旧请求的 response、catch 与 finally SHALL 不得覆盖
新项目的数据、选择、busy、错误或结果。

#### Scenario: 确认后切换项目

- **GIVEN** 用户在项目 A 为某个 Loop、Change 或 Workflow 打开危险确认
- **WHEN** Dashboard 切换到项目 B，即使 B 存在同名实体
- **THEN** A 的确认关闭且不能以 B 的 root 提交
- **AND** B 的动作保持禁用，直到 B 的 root-scoped 数据完成加载并验证当前选择

#### Scenario: A 慢响应晚于 B 快响应

- **GIVEN** 项目 A 的读取或 mutation 仍在进行
- **WHEN** 用户切换到 B 且 B 的响应先完成
- **THEN** A 的迟到 response、error 或 finally 不覆盖 B 的数据、选择、busy、确认、错误或结果
- **AND** 所有提交 body 只包含发起确认时绑定的 exact root 与 entity

#### Scenario: 项目切换关闭所有危险 surface

- **WHEN** current root 发生变化
- **THEN** real run、L3、apply、triage、retry 与 Workflow delete/create/save 的确认和 pending state 原子失效
- **AND** 旧项目的 selector、template、result、toast 与乐观回滚值不在新项目显示

#### Scenario: Track 草稿 dirty 上报稳定

- **GIVEN** 用户从 Workbench 打开 Track editor
- **WHEN** 用户修改任一草稿字段并使编辑器进入 dirty 状态
- **THEN** dirty 状态只按真实草稿变化上报，不因父层 render 或 callback identity 变化反复切换
- **AND** 页面不发生无限 render/effect 循环，导航离开守卫继续保持有效

#### Scenario: Track 保存期间锁定提交 surface

- **GIVEN** 用户提交一个有效 Track 草稿且保存请求仍在进行
- **WHEN** 用户尝试修改字段、route preview prompt、切换 Track、删除或关闭 editor
- **THEN** 所有会改变已提交 payload 或导致未提交输入被成功响应覆盖的控件保持禁用
- **AND** 成功响应关闭 editor 时不存在请求发出后的静默丢失输入
- **AND** 失败响应恢复同一草稿、错误与焦点语义，允许用户修正后重试

#### Scenario: Progress 创建 Change 草稿不能跨项目复用

- **GIVEN** 用户在项目 A 打开 Create Change 并填写 `name`、`track`、`workflow` 与 `intent`
- **WHEN** Dashboard 在提交前切换到项目 B
- **THEN** 对话框立即关闭并清空 A 的草稿、错误、busy 与 preview
- **AND** A 的 `{root, name, track, workflow, intent, operationToken}` 不得与 B 的 router 或 workflow 重新组合
- **AND** 用户必须在 B 重新打开并确认完整输入后才能向 B 提交

#### Scenario: AFK 设置与动作交错

- **GIVEN** enqueue/retry action 与 max-parallel settings mutation 可能同时在途
- **WHEN** 任一请求成功、失败或迟到
- **THEN** 两类操作使用独立 generation、busy 与 error identity，互不取消对方的 `finally`
- **AND** settings 失败回滚到服务端已确认值，action 不会因 settings 变化永久保持 busy

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
