# 插件分发增量规格

## ADDED Requirements

### Requirement: 新用户 SHALL 无需 clone 一步安装完整插件

Tenon SHALL 提供一行 Marketplace bootstrap，用户只选择一个宿主。bootstrap SHALL 注册
`jefferysha/tenon` Marketplace、安装 `tenon@tenon`、从宿主 inventory 解析真实安装根、
验证完整 payload，再调用包内 `tenon setup --<host>`。用户不得被要求手动 clone、安装 monorepo
依赖、运行 build 或拼装 Skills。

#### Scenario: Codex 新用户执行一行安装

- **WHEN** 用户执行官方 bootstrap 并选择 `--codex`
- **THEN** Codex Marketplace 安装一个完整 Tenon 插件
- **AND** CLI、七阶段 workflow、OpenSpec、Skills、hooks、Dashboard 与 adapters 均可从同一 payload 使用
- **AND** 安装后提示真实的一次性 hook 信任与新会话生效边界。

#### Scenario: Marketplace candidate 不完整

- **WHEN** inventory 返回的候选缺少任一受管资产、包含非法 symlink 或 smoke 失败
- **THEN** bootstrap 非零退出且不选择该候选
- **AND** 既有 active release 与 launcher 保持不变。

### Requirement: Marketplace 与 npx SHALL 复用同一安装事务

Marketplace SHALL 是首选宿主分发入口。公开 npm 包 MAY 提供
`npx --yes @<publisher>/tenon setup --codex`，但它 SHALL 是薄 bootstrap，并复用同一产品身份、
release manifest、候选验证、content-addressed publication、active/previous 选择和更新诊断。
两种入口不得创建第二 runtime、第二 Skill root 或第二 update 状态。

#### Scenario: 本地验证 npx tarball

- **WHEN** CI 对待发布 npm tarball 在隔离 HOME 执行 npx 首装
- **THEN** 它安装/激活与 Marketplace 相同 digest 的 payload
- **AND** tarball 不包含设计 demo、截图、内部研究、测试运行态或 monorepo 开发依赖。

#### Scenario: npm 尚未完成首次发布

- **WHEN** publisher scope 或发布凭据不可用
- **THEN** 文档继续提供真实可用的 Marketplace bootstrap
- **AND** 不把 npx 命令或 npm 包描述为已公开发布。

### Requirement: 跨品牌更新 SHALL 使用有期限的旧通道迁移桥

既有旧 identity 无法通过同名 update 自动发现新的插件/package identity。旧分发通道 SHALL 发布
一个所有权安全、可审计、失败可回滚的 migration bridge：验证 Tenon 候选、原子激活新 release、
验证新 launcher 和新宿主登记后，才移除旧登记。Tenon 本体 SHALL 不提供旧命令兼容。

#### Scenario: 旧用户完成迁移

- **WHEN** 旧自动更新通道获得 migration release 且 Tenon 候选验证通过
- **THEN** active/previous 记录原子切换到 Tenon
- **AND** 新会话只发现 Tenon Skill root、插件身份与 launcher
- **AND** 旧 launcher 和登记仅在新入口验证后删除。

#### Scenario: 迁移候选验证失败

- **WHEN** 下载、manifest、Skill、hook、Dashboard 或 CLI smoke 任一失败
- **THEN** 旧 active release 保持可用
- **AND** 失败原因进入持久诊断
- **AND** 不产生半迁移的 Tenon active 状态。

### Requirement: Tenon 更新 SHALL 只有一个整包事务

Tenon SHALL 使用 `tenon update --<native-host>` 更新唯一的完整插件，不得再把 CLI/runtime
拆成第二套 `--self-update` 通道。手动更新与用户明确启用的定时更新 SHALL 调用同一个事务协调器；
Skills、hooks、CLI、Dashboard、workflow 与 adapters SHALL 来自同一候选 payload 和 release digest。

宿主 Marketplace/plugin manager SHALL 是宿主插件登记与 cache 的唯一写入者；Tenon 不得直接改写、
备份或恢复宿主私有 cache 目录。Tenon SHALL 在自己的所有权边界内对 content-addressed runtime、
active/previous selection、bootstrap、stable launchers 与 Dashboard 服务执行可审计事务，并明确报告
宿主提交与 Tenon 提交两个边界，不得把只回滚 managed selection 描述成“整个宿主插件已恢复”。

项目 canonical Change、OpenSpec 与任务文件不属于插件更新事务。更新 SHALL 只读取机器级项目注册表，
报告需要显式 `tenon sync` 的项目，不得在后台或 `--auto` 模式中静默修改工作区。

#### Scenario: 用户更新完整 Codex 插件

- **WHEN** 用户运行 `tenon update --codex`
- **THEN** 只有 Codex Marketplace/plugin manager 更新 `tenon@tenon`
- **AND** 宿主 inventory 返回的候选先完成 payload、CLI、workflow、hook、Skill 与 Dashboard smoke
- **AND** Tenon 再把同一 digest 发布为 content-addressed managed release
- **AND** active selection、bootstrap、两个 stable launchers 与 18765 Dashboard 共同提交。

#### Scenario: 自动更新已明确启用

- **WHEN** `tenon setup --codex --auto-update` 已写入用户偏好且每日检查到期
- **THEN** 后台任务调用与手动更新相同的 `tenon update --codex --auto`
- **AND** 不存在第二套下载器、selection、Skill root、CLI 自更新或项目写入逻辑。

#### Scenario: launcher 或 Dashboard 提交失败

- **WHEN** managed release 已验证，但任一 launcher 写入或新 Dashboard readiness 失败
- **THEN** Tenon SHALL 以 activation 前快照精确恢复 selection、bootstrap、launcher 的存在性/内容/mode
- **AND** 终止本次候选 Dashboard child，并重新验证或恢复 previous release 的 18765 服务
- **AND** 持久诊断分别说明宿主提交状态与 Tenon managed transaction 的补偿结果。

#### Scenario: 已登记项目需要新投影

- **WHEN** 更新后的 runtime 扫描机器级项目注册表并发现某项目版本落后
- **THEN** 更新结果列出项目及显式 `tenon sync` 命令
- **AND** 自动更新不得写该项目的 OpenSpec、Change、rules 或 owned manifest。

### Requirement: Tenon 产品机器状态 SHALL 只有一个路径所有者

Tenon 自有的 release、staging、selection、audit、项目注册表、凭证、Dashboard token 与 pid
SHALL 全部由 kernel 的单一平台路径解析器定位。macOS SHALL 使用
`~/Library/Application Support/tenon`，Linux SHALL 使用带 `tenon` 命名空间的 XDG
data/state/config roots，Windows SHALL 将本机 data/state 与 roaming config 分开。
Tenon 不得借用 `.claude`、`.codex` 或其他宿主目录保存产品状态。

`TENON_RUNTIME_HOME` SHALL 是测试与运维隔离的唯一用户覆盖。安装器 SHALL 只解析一次实际 roots，
并通过版本化 `TENON_RUNTIME_ROOTS` 契约把精确 root 元组传给 stable launcher、bootstrap、CLI 与
Dashboard；bootstrap、server 和各领域 store 不得各自复制平台路径算法。单 root 环境变量 MAY
作为冻结 N−1 bootstrap 与 shell hook 的只读投影，但当前路径解析器不得把它们作为第二输入源。

#### Scenario: 新安装在不同平台解析产品状态

- **WHEN** Tenon 在 macOS、Linux 或 Windows 上首次安装
- **THEN** kernel 返回该平台标准目录下、带 `tenon` 命名空间的 data/state/config roots
- **AND** release、selection、registry、secrets、Dashboard token 与 pid 均位于约定的产品域
- **AND** `.claude` 与 `.codex` 只用于宿主资产发现，不成为 Tenon 产品状态根。

#### Scenario: launcher 启动不同进程

- **WHEN** stable launcher 启动当前 bootstrap、冻结 N−1 bootstrap、CLI 或 Dashboard
- **THEN** 所有进程消费同一个带版本的 `TENON_RUNTIME_ROOTS` 元组
- **AND** current runtime 不会因单 root 投影变量或 Dashboard 专属 Home 得到第二套状态目录
- **AND** Dashboard 单例 scope 绑定 canonical `stateRoot`。

#### Scenario: 运维隔离运行时

- **WHEN** 测试或运维显式设置 `TENON_RUNTIME_HOME`
- **THEN** kernel 在该根下确定性派生 data/state/config
- **AND** 子进程接收相同 root contract
- **AND** 未设置该变量时不会从任一旧产品或宿主目录隐式回退。
