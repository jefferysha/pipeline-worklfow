# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 项目 SHALL 持久化可配置的单轮路由旁路词

系统 SHALL 在项目 `.pipeline/hooks.json` version 1 中持久化
`prompt_skip_keyword`。缺文件、旧文件缺字段或字段类型/字符非法时，读侧 SHALL 回退默认值
`no-tenon`；显式空字符串 SHALL 表示禁用旁路。非空值 SHALL 匹配
`^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`，不得隐式 trim 或求值为 shell/正则。

Hook 开关和旁路词写回 SHALL 使用同目录临时文件加 rename 的 canonical JSON 写入，并 SHALL
保留彼此管理的字段。

#### Scenario: 旧配置获得兼容默认值

- **GIVEN** 项目没有 `.pipeline/hooks.json` 或 version 1 文件没有 `prompt_skip_keyword`
- **WHEN** server 或 UserPromptSubmit hook 读取配置
- **THEN** 生效旁路词为 `no-tenon`
- **AND** 不要求迁移磁盘文件。

#### Scenario: 用户禁用单轮旁路

- **WHEN** Dashboard 把 `prompt_skip_keyword` 保存为空字符串
- **THEN** canonical 配置保留显式空字符串
- **AND** 任何提示都不会触发本功能。

#### Scenario: 两类配置写回互不丢字段

- **GIVEN** Hook matrix 与旁路词都已有自定义值
- **WHEN** 用户切换单个 Hook 或更新旁路词
- **THEN** 写回只改变目标值
- **AND** 另一类值保持不变。

### Requirement: Dashboard API SHALL 暴露可信且向后兼容的配置闭环

`GET /api/hooks?root=...` SHALL 在既有 `hooks` 与 `matrix` 外返回
`prompt_skip_keyword`。`POST /api/hooks/prompt-routing-bypass` SHALL 接受
`{ root, prompt_skip_keyword }`，沿用 Host、token、content-type 与已注册 root 的安全边界。
DTO 非法 SHALL 返回 400，未注册 root SHALL 返回 404，持久化失败 SHALL 返回 500；成功响应
SHALL 返回实际持久化值。

#### Scenario: 合法词被保存并回读

- **GIVEN** 请求携带有效 token、content-type 与已注册项目根
- **WHEN** 客户端提交 `{ "prompt_skip_keyword": "skip-tenon" }`
- **THEN** API 返回成功与 `skip-tenon`
- **AND** 后续 GET 返回同一值。

#### Scenario: 非法值失败且不污染配置

- **WHEN** 客户端提交包含空格、超过 32 字符或非字符串的旁路词
- **THEN** API 返回 400
- **AND** 已持久化的 matrix 与旁路词都不改变。

### Requirement: UserPromptSubmit SHALL 只旁路当前轮次的非安全输出

`router.sh` 与 `breadcrumb.sh` SHALL 在解析可信项目根之后、产生输出之前读取同一配置并执行
ASCII 大小写不敏感的独立 token 匹配。token 两侧字符若属于 `[A-Za-z0-9_-]` SHALL 不命中；
行首、行尾、空白和标点 SHALL 构成边界。命中时两个 Hook SHALL 静默 exit 0；未命中 SHALL
保持既有行为。

review acknowledgement、confirm、PreToolUse、安全门、Skill 证据与 Change 状态 SHALL 不读取
该字段，也不得因旁路词命中而被跳过。

#### Scenario: 独立 token 旁路路由输出

- **WHEN** 旁路词为 `no-tenon` 且提示包含 `(NO-TENON) explain`
- **THEN** `router.sh` 与 `breadcrumb.sh` 不输出 dispatch 或面包屑
- **AND** 两者成功退出。

#### Scenario: 词内片段不触发旁路

- **WHEN** 提示包含 `xno-tenon`、`no-tenonx` 或 `foo-no-tenon`
- **THEN** token 匹配不命中
- **AND** UserPromptSubmit 继续既有路由流程。

#### Scenario: 安全与 review Hook 保持执行

- **GIVEN** 当前 Change 存在精确 review 或 confirm gate
- **WHEN** 用户提示包含有效旁路 token
- **THEN** router 与 breadcrumb 可被抑制
- **AND** review acknowledgement、confirm 与工具安全 Hook 仍按既有契约运行。

### Requirement: Dashboard SHALL 提供可访问的旁路词状态与恢复路径

Workbench 的 UserPromptSubmit 时间线节点 SHALL 提供旁路词读取、编辑、启用/禁用和保存入口，
所有可见文本 SHALL 提供中英文翻译。控件 SHALL 具有关联 label、键盘提交、busy/disabled
语义，并 SHALL 明确展示 loading、ready、disabled、客户端校验错误、读取/保存错误和成功状态。

保存失败时 Dashboard SHALL 保留未提交草稿；成功时 SHALL 以 server 返回值作为真相源。

#### Scenario: 键盘保存成功

- **GIVEN** 配置已加载且草稿合法
- **WHEN** 用户在输入框按 Enter
- **THEN** Dashboard 提交真实 API 请求
- **AND** 成功状态显示当前生效旁路词。

#### Scenario: 保存失败后可以重试

- **WHEN** API 保存失败
- **THEN** Dashboard 以 alert 显示错误并保留草稿
- **AND** 用户可在同一表单重试。

#### Scenario: 空值呈现禁用状态

- **WHEN** server 返回空旁路词
- **THEN** 开关呈关闭状态
- **AND** UI 明确说明单轮旁路已禁用。
