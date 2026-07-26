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

### Requirement: Tenon 更新 SHALL 使用单一用户入口

Tenon SHALL 使用 `tenon update` 更新受管资产和已登记项目；CLI 包自更新必须通过明确
`--self-update` 开启。候选 SHALL 在隔离位置验证，替换失败 SHALL 恢复精确旧版本及 active selection。

#### Scenario: 自更新被明确请求

- **WHEN** 用户运行 `tenon update --self-update`
- **THEN** 新包先完成隔离安装与 CLI/workflow/release contract smoke
- **AND** 只有验证成功才替换当前安装
- **AND** 失败时恢复精确旧版本并报告各子步骤结果。
