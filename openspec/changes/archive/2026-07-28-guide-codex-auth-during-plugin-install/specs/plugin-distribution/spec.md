# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Codex 插件生命周期 SHALL 提供宿主认证状态与双路径获取引导

Tenon SHALL 在 Codex 首次安装、重复 setup、成功的前台 update 和 doctor 中，通过同一只读、
有超时的宿主认证探针运行 `codex login status`。公开认证状态 SHALL 仅为
`authenticated`、`unauthenticated` 或 `unavailable`，不得由 `OPENAI_API_KEY`、
`CODEX_HOME` 或 `auth.json` 存在性推断本地 Codex 登录成功。

退出码 `0` SHALL 表示 `authenticated`。由于当前 Codex CLI 对未登录和认证存储读取错误均可能
使用退出码 `1`，只有退出码 `1` 且有界 stderr 去除首尾空白后精确等于官方
`Not logged in` 哨兵时 SHALL 表示 `unauthenticated`；其他退出码 `1`、其他非零退出码或超出
哨兵采集上限的输出 SHALL 保守表示 `unavailable`。未认证或无法确认时，Tenon SHALL 同时提供
以下官方、安全且可复制的后续路径：

- 若用户的 ChatGPT 方案包含 Codex，运行 `codex login`；
- 远程或无浏览器环境运行 `codex login --device-auth`；
- 在 `https://platform.openai.com/api-keys` 创建 Platform API Key，并通过
  `printenv OPENAI_API_KEY | codex login --with-api-key` 从 stdin 登录；
- 运行 `codex login status` 验证结果。

文案 SHALL 明确 Platform API Key 为按用量计费，不得推断用户具体 ChatGPT 套餐、账号、邮箱、
凭证类型或权益。探测 SHALL 忽略 stdin，不得自动启动登录、浏览器或 device flow，不得读取
`auth.json` 或 API Key 值。探测 MAY 仅在有界内存中比较 stderr 是否精确等于上述固定哨兵；
捕获内容 SHALL 在分类后立即丢弃，且不得把原始 stdout/stderr、token、Key 或宿主路径写入人读
输出、JSON、日志、文档、异常或状态。

#### Scenario: ChatGPT 订阅账号已经登录

- **GIVEN** 用户通过 ChatGPT 登录 Codex
- **WHEN** `codex login status` 在 setup、update 或 doctor 中退出 `0`
- **THEN** Tenon 报告 Codex 已认证
- **AND** 不要求设置 `OPENAI_API_KEY`
- **AND** 不推断或显示订阅层级、账号或认证输出。

#### Scenario: Codex 未登录

- **WHEN** Codex CLI 存在、`codex login status` 以退出码 `1` 退出且有界 stderr 精确等于
  `Not logged in`
- **THEN** Tenon 把状态报告为 `unauthenticated`
- **AND** 同时展示 ChatGPT browser login、headless device auth、Platform API Key stdin login
  和 `codex login status` 复验命令
- **AND** 插件与 managed runtime 已验证成功时，认证缺失只产生可见警告，不回滚安装事务。

#### Scenario: API Key 用户获取并登录

- **WHEN** 用户选择 Platform API Key 路径
- **THEN** 引导指向 `https://platform.openai.com/api-keys`
- **AND** 登录命令从 stdin 读取 `OPENAI_API_KEY`
- **AND** 文案说明 Platform 使用按用量计费
- **AND** 不建议把 Key 字面值放入 argv、shell history、日志或 Tenon 配置。

#### Scenario: 远程或无浏览器安装

- **GIVEN** 安装运行于 SSH、CI、非 TTY 或 stdin 管道
- **WHEN** Codex 尚未认证
- **THEN** Tenon 输出 `codex login --device-auth` 和其他后续命令
- **AND** 不等待输入、不打开浏览器、不执行任何登录命令
- **AND** 安装结果不因非交互环境而悬挂。

#### Scenario: Codex CLI 缺失

- **WHEN** `install.sh --codex` 在 Marketplace mutation 前找不到 `codex`
- **THEN** bootstrap 非零退出并引导 `npm install -g @openai/codex`
- **AND** 提示用 `codex --version` 验证
- **AND** 不调用 Marketplace、plugin install 或 packaged setup。

#### Scenario: dry-run 环境缺少 Codex CLI

- **GIVEN** `codex` 不在 PATH
- **WHEN** 用户运行 `install.sh --codex --dry-run`
- **THEN** bootstrap 仍以零退出打印完整计划
- **AND** 计划包含将执行的 CLI/auth 检查
- **AND** 不调用宿主、不运行 auth probe、不写用户或项目状态。

#### Scenario: 状态命令不可用、超时或启动失败

- **WHEN** Codex CLI 版本不支持 `login status`、探针超时、收到 signal 或无法启动
- **THEN** Tenon 报告 `unavailable`，不得猜测已登录或未登录
- **AND** 输出固定的 CLI 更新、登录和状态复验引导
- **AND** 不透传原始 stdout/stderr。

#### Scenario: 认证存储损坏但状态命令退出 1

- **GIVEN** Codex CLI 可启动但认证存储损坏或不可读取
- **WHEN** `codex login status` 以退出码 `1` 退出且 stderr 不精确等于 `Not logged in`
- **THEN** Tenon 报告 `unavailable`，不得误报为 `unauthenticated`
- **AND** 仍输出固定获取与复验引导，但不透传错误、宿主路径或认证存储内容。

#### Scenario: 相同候选重复安装

- **GIVEN** Tenon 插件与 managed runtime 已安装
- **WHEN** 用户再次执行相同 Codex bootstrap 或 `tenon setup --codex`
- **THEN** 相同只读 auth probe 与引导再次确定性运行
- **AND** 不创建、覆盖、复制或修改 Codex 凭证
- **AND** content-addressed release 与 Dashboard 幂等契约保持不变。

#### Scenario: Codex 前台更新成功

- **WHEN** `tenon update --codex` 已完成宿主与 managed runtime 提交
- **THEN** Tenon 运行共享认证探针并输出完整前台引导或就绪结果
- **AND** auth 缺失不回滚已经提交的有效更新
- **AND** update 候选失败时不追加 auth 教程掩盖主要错误。

#### Scenario: Codex 自动更新

- **WHEN** `tenon update --codex --auto` 在后台完成
- **THEN** 不启动交互登录或浏览器
- **AND** 最多输出固定的简短复验提示
- **AND** 用户可通过 `tenon doctor` 获得完整认证状态与获取引导。

#### Scenario: Doctor 独立报告宿主登录与 AFK 凭证

- **WHEN** 用户运行 `tenon doctor`
- **THEN** `auth:codex` 使用共享 host auth probe
- **AND** `afk:credential-codex` 继续只报告容器凭证转发就绪
- **AND** 两个检查可以分别为已就绪或未就绪，不得互相冒充。

#### Scenario: 显式 CODEX_HOME 是空目录

- **GIVEN** `CODEX_HOME` 非空但目录中没有可读 `auth.json`
- **WHEN** Tenon 计算 AFK Codex 凭证转发就绪
- **THEN** 不得仅因环境变量非空就报告就绪
- **AND** 本地 Codex 登录事实仍只由 `codex login status` 决定。

#### Scenario: 干净安装不复制真实凭证

- **GIVEN** clean-install acceptance 使用唯一临时 `HOME`、`CODEX_HOME` 和 `TENON_RUNTIME_HOME`
- **WHEN** 它在 `CI=1`、非交互且未登录的环境连续安装两次
- **THEN** 两次安装均成功并出现确定性三路径引导和复验命令
- **AND** 验收不读取或复制真实用户凭证、不创建登录态、不信任 hook
- **AND** 插件、Skill、hook、runtime、Dashboard 和重复安装身份断言继续完整执行。
